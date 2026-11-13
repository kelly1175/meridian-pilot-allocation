import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../src/app.js';
import * as svc from '../src/service.js';

// Fixed clock: 08:00 UTC. Shift A 04:00–16:00, shift B 14:00–02:00 (see src/seed.js).
const NOW = Date.parse('2026-11-13T08:00:00Z');
let ctx;
const u = (id) => ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const alloc = (id) => ctx.db.prepare('SELECT * FROM allocations WHERE id = ?').get(id);
const active = (mid) => ctx.db.prepare(`SELECT * FROM allocations WHERE movement_id = ? AND status IN ('DRAFT','CONFIRMED')`).get(mid);
const code = (fn) => { try { fn(); } catch (e) { return e.code; } return 'OK'; };

beforeEach(() => { ctx = createContext({ now: () => NOW }); });

describe('AC1 movement visibility', () => {
  test('board lists movements in window with allocation status', () => {
    const board = svc.listMovements(ctx, u('alex'));
    const byId = Object.fromEntries(board.map((m) => [m.id, m]));
    assert.equal(byId['MOV-002'].allocation_status, 'CONFIRMED');
    assert.equal(byId['MOV-003'].allocation_status, 'DRAFT');
    assert.equal(byId['MOV-001'].allocation_status, 'UNALLOCATED');
  });

  test('filters by area and unresolved', () => {
    const inner = svc.listMovements(ctx, u('alex'), { area: 'INNER', unresolved: true });
    assert.ok(inner.length > 0);
    assert.ok(inner.every((m) => m.area === 'INNER' && ['UNALLOCATED', 'DRAFT', 'NEEDS_REVIEW'].includes(m.allocation_status)));
  });

  test('operational colleague sees confirmed assignments only (no drafts)', () => {
    const byId = Object.fromEntries(svc.listMovements(ctx, u('olly')).map((m) => [m.id, m]));
    assert.equal(byId['MOV-003'].allocation_status, 'UNALLOCATED');
    assert.equal(byId['MOV-003'].allocation, null);
    assert.equal(byId['MOV-002'].allocation.pilot_name, 'Pilot Carrick');
  });
});

describe('AC2 pilot information', () => {
  test('candidates show outcome and identify stale / missing data', () => {
    const list = svc.candidates(ctx, u('alex'), 'MOV-006'); // missing draught
    const dunmore = list.find((c) => c.pilot.id === 'P04');
    const codes = dunmore.checks.map((c) => c.code);
    assert.ok(codes.includes('MOVEMENT_DATA_MISSING'));
    assert.ok(codes.includes('AVAILABILITY_STALE'));
    assert.equal(dunmore.outcome, 'WARNING');
  });
});

describe('AC3 allocation with agreed checks', () => {
  test('eligible pilot can be assigned and confirmed', () => {
    const a = svc.createAllocation(ctx, u('alex'), { movementId: 'MOV-001', pilotId: 'P01', confirm: true });
    assert.equal(a.status, 'CONFIRMED');
  });

  test('blocking conditions prevent assignment', () => {
    assert.equal(code(() => svc.createAllocation(ctx, u('alex'), { movementId: 'MOV-001', pilotId: 'P05' })), 'ALLOCATION_BLOCKED');
    // P03 already on MOV-002 which overlaps (incl. transit buffer)
    assert.equal(code(() => svc.createAllocation(ctx, u('alex'), { movementId: 'MOV-001', pilotId: 'P03' })), 'ALLOCATION_BLOCKED');
  });

  test('warnings must be accepted and are recorded', () => {
    const args = { movementId: 'MOV-006', pilotId: 'P04' };
    assert.equal(code(() => svc.createAllocation(ctx, u('alex'), args)), 'WARNINGS_NOT_ACCEPTED');
    const a = svc.createAllocation(ctx, u('alex'), { ...args, acceptWarnings: true });
    assert.ok(a.warnings.some((w) => w.code === 'AVAILABILITY_STALE'));
  });

  test('authorised exception: allocator blocked, supervisor needs a reason', () => {
    const args = { movementId: 'MOV-001', pilotId: 'P02' }; // outside duty only
    assert.equal(code(() => svc.createAllocation(ctx, u('alex'), args)), 'ALLOCATION_BLOCKED');
    assert.equal(code(() => svc.createAllocation(ctx, u('sam'), args)), 'EXCEPTION_REASON_REQUIRED');
    const a = svc.createAllocation(ctx, u('sam'), { ...args, overrideReason: 'Agreed overtime with pilot' });
    assert.equal(a.exceptions[0].code, 'OUTSIDE_DUTY');
    assert.equal(a.exceptions[0].reason, 'Agreed overtime with pilot');
  });
});

describe('AC4 change handling', () => {
  test('movement time change flags the allocation; cannot confirm until reviewed', () => {
    const m = ctx.db.prepare('SELECT * FROM movements WHERE id = ?').get('MOV-003');
    svc.updateMovement(ctx, u('sam'), { movementId: 'MOV-003', version: m.version, changes: { scheduled_start: '2026-11-13T14:00:00Z' } });
    const a = alloc('ALC-SEED0003');
    assert.equal(a.needs_review, 1);
    assert.match(a.review_reasons, /scheduled start changed/);
    assert.equal(code(() => svc.confirmAllocation(ctx, u('alex'), { allocationId: a.id, version: a.version })), 'REVIEW_REQUIRED');
    svc.markReviewed(ctx, u('alex'), { allocationId: a.id, version: a.version, note: 'Still suitable' });
    const after = alloc(a.id);
    assert.equal(svc.confirmAllocation(ctx, u('alex'), { allocationId: a.id, version: after.version }).status, 'CONFIRMED');
  });

  test('pilot unavailability flags affected allocation; review refused while failing', () => {
    const r = svc.addUnavailability(ctx, u('sam'), { pilotId: 'P03', start: '2026-11-13T11:00:00Z', end: '2026-11-13T14:00:00Z', note: 'Sick' });
    assert.deepEqual(r.flaggedAllocations, ['ALC-SEED0002']);
    const a = alloc('ALC-SEED0002');
    assert.equal(code(() => svc.markReviewed(ctx, u('alex'), { allocationId: a.id, version: a.version })), 'ALLOCATION_BLOCKED');
  });

  test('cancelled movement flags its active allocation', () => {
    const m = ctx.db.prepare('SELECT * FROM movements WHERE id = ?').get('MOV-002');
    svc.updateMovement(ctx, u('sam'), { movementId: 'MOV-002', version: m.version, changes: { status: 'CANCELLED' } });
    const row = svc.listMovements(ctx, u('alex')).find((x) => x.id === 'MOV-002');
    assert.equal(row.allocation_status, 'NEEDS_REVIEW');
  });
});

describe('AC5 reallocation and cancellation', () => {
  test('reallocation preserves the previous allocation and links it', () => {
    const old = alloc('ALC-SEED0002');
    assert.equal(code(() => svc.reallocate(ctx, u('alex'), { allocationId: old.id, version: old.version, pilotId: 'P01' })), 'BAD_REQUEST');
    const next = svc.reallocate(ctx, u('alex'), {
      allocationId: old.id, version: old.version, pilotId: 'P01', reason: 'Pilot sick', reasonCategory: 'PILOT_UNAVAILABLE', confirm: true,
    });
    assert.equal(next.previous_allocation_id, old.id);
    assert.equal(next.status, 'CONFIRMED');
    assert.equal(alloc(old.id).status, 'SUPERSEDED');
    assert.match(alloc(old.id).end_reason, /PILOT_UNAVAILABLE/);
  });

  test('cancellation requires a reason and keeps the record', () => {
    const a = alloc('ALC-SEED0002');
    assert.equal(code(() => svc.cancelAllocation(ctx, u('alex'), { allocationId: a.id, version: a.version })), 'BAD_REQUEST');
    svc.cancelAllocation(ctx, u('alex'), { allocationId: a.id, version: a.version, reason: 'Vessel delayed 24h', reasonCategory: 'MOVEMENT_CHANGE' });
    assert.equal(alloc(a.id).status, 'CANCELLED');
    assert.equal(active('MOV-002'), undefined);
  });
});

describe('AC6 concurrent working', () => {
  test('stale version cannot overwrite', () => {
    const a = alloc('ALC-SEED0003');
    svc.confirmAllocation(ctx, u('alex'), { allocationId: a.id, version: a.version });
    assert.equal(code(() => svc.cancelAllocation(ctx, u('blair'), {
      allocationId: a.id, version: a.version, reason: 'x', reasonCategory: 'OTHER' })), 'CONFLICT');
  });

  test('second allocator cannot create a parallel allocation', () => {
    svc.createAllocation(ctx, u('alex'), { movementId: 'MOV-001', pilotId: 'P01' });
    assert.equal(code(() => svc.createAllocation(ctx, u('blair'), { movementId: 'MOV-001', pilotId: 'P07' })), 'CONFLICT');
  });

  test('movement changed since loaded is rejected', () => {
    assert.equal(code(() => svc.createAllocation(ctx, u('alex'), { movementId: 'MOV-001', pilotId: 'P01', movementVersion: 99 })), 'CONFLICT');
  });

  test('database enforces one active allocation per movement', () => {
    assert.throws(() => ctx.db.prepare(`INSERT INTO allocations (id, movement_id, pilot_id, status, created_by, created_at)
      VALUES ('X', 'MOV-002', 'P01', 'DRAFT', 'alex', 'now')`).run(), /UNIQUE/);
  });
});

describe('AC7 status and communication', () => {
  test('communication status only on confirmed; decline flags for review', () => {
    const draft = alloc('ALC-SEED0003');
    assert.equal(code(() => svc.setCommStatus(ctx, u('alex'), { allocationId: draft.id, version: draft.version, status: 'SENT' })), 'CONFLICT');
    const c = alloc('ALC-SEED0002');
    const r = svc.setCommStatus(ctx, u('alex'), { allocationId: c.id, version: c.version, status: 'DECLINED' });
    assert.equal(r.comm_status, 'DECLINED');
    assert.equal(r.needs_review, true);
  });
});

describe('AC8 auditability', () => {
  test('changes record user, time, before/after and reason', () => {
    const old = alloc('ALC-SEED0002');
    svc.reallocate(ctx, u('alex'), { allocationId: old.id, version: old.version, pilotId: 'P01', reason: 'Swap', reasonCategory: 'OPERATIONAL_PRIORITY' });
    const ev = svc.listAudit(ctx, u('sam'), { movementId: 'MOV-002' }).find((e) => e.action === 'ALLOCATION_REASSIGNED');
    assert.equal(ev.actor, 'alex');
    assert.equal(ev.before.pilot_id, 'P03');
    assert.equal(ev.after.pilot_id, 'P01');
    assert.equal(ev.reason, 'Swap');
    assert.ok(ev.at);
  });

  test('audit log is append-only', () => {
    assert.throws(() => ctx.db.exec('UPDATE audit_events SET actor = \'x\''), /append-only/);
    assert.throws(() => ctx.db.exec('DELETE FROM audit_events'), /append-only/);
  });
});

describe('AC9 access', () => {
  test('roles are enforced', () => {
    assert.equal(code(() => svc.createAllocation(ctx, u('olly'), { movementId: 'MOV-001', pilotId: 'P01' })), 'FORBIDDEN');
    assert.equal(code(() => svc.listAudit(ctx, u('olly'))), 'FORBIDDEN');
    assert.equal(code(() => svc.updateMovement(ctx, u('alex'), { movementId: 'MOV-001', version: 1, changes: {} })), 'FORBIDDEN');
    assert.equal(code(() => svc.metrics(ctx, u('alex'))), 'FORBIDDEN');
    assert.ok(svc.metrics(ctx, u('sam')).adoption);
  });
});

describe('Tactical CSV import', () => {
  const header = 'external_ref,vessel_name,imo,movement_type,from_location,to_location,area,scheduled_start,duration_minutes,loa_m,draught_m,pilot_required';
  test('creates, updates (flagging allocations), rejects and reconciles', () => {
    const csv = [
      header,
      'VTS-99001,NEW ARRIVAL,9999999,ARRIVAL,Fairway Buoy,Berth 2,INNER,2026-11-13T14:00:00Z,75,140,7.5,yes',
      'VTS-24002,CAPE HALLORAN,9107919,DEPARTURE,Berth 7,Fairway Buoy,INNER,2026-11-13T13:00:00Z,75,183,9.1,yes',
      'VTS-99002,BAD ROW,,TELEPORT,,,INNER,not-a-date,,,,yes',
    ].join('\n');
    const r = svc.importMovementsCsv(ctx, u('sam'), csv);
    assert.deepEqual(r.created, ['VTS-99001']);
    assert.deepEqual(r.updated, ['VTS-24002']);
    assert.equal(r.rejected.length, 1);
    assert.ok(r.notInFile.some((m) => m.external_ref === 'VTS-24003'));
    assert.equal(alloc('ALC-SEED0002').needs_review, 1);
  });
});
