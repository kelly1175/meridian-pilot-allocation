import { randomBytes } from 'node:crypto';
import { tx } from './db.js';
import { evaluate, classify, movementWindow } from './rules.js';
import { can } from './roles.js';
import { forbidden, notFound, badRequest, conflict, unprocessable } from './errors.js';
import { parseCsv } from './csv.js';

export const REASON_CATEGORIES = ['MOVEMENT_CHANGE', 'PILOT_UNAVAILABLE', 'OPERATIONAL_PRIORITY', 'ERROR_CORRECTION', 'OTHER'];
const ACTIVE = ['DRAFT', 'CONFIRMED'];
const MOVEMENT_FIELDS = ['scheduled_start', 'duration_minutes', 'loa_m', 'draught_m', 'status', 'from_location', 'to_location', 'pilot_required'];

const id = (prefix) => `${prefix}-${randomBytes(4).toString('hex').toUpperCase()}`;
const iso = (ctx) => new Date(ctx.now()).toISOString();
const json = (v) => (v === undefined ? null : JSON.stringify(v));

function authorise(user, permission) {
  if (!can(user, permission)) throw forbidden();
}

// ---------- reads ----------

const getMovement = (ctx, mid) => ctx.db.prepare('SELECT * FROM movements WHERE id = ?').get(mid) ?? null;
const getPilot = (ctx, pid) => ctx.db.prepare('SELECT * FROM pilots WHERE id = ?').get(pid) ?? null;
const getAllocation = (ctx, aid) => ctx.db.prepare('SELECT * FROM allocations WHERE id = ?').get(aid) ?? null;
const activeFor = (ctx, mid) =>
  ctx.db.prepare(`SELECT * FROM allocations WHERE movement_id = ? AND status IN ('DRAFT','CONFIRMED')`).get(mid) ?? null;

function mustGet(getter, ctx, key, label) {
  const row = getter(ctx, key);
  if (!row) throw notFound(label);
  return row;
}

function decodeAllocation(a) {
  if (!a) return null;
  return {
    ...a,
    needs_review: Boolean(a.needs_review),
    review_reasons: JSON.parse(a.review_reasons),
    exceptions: JSON.parse(a.exceptions),
    warnings: JSON.parse(a.warnings),
  };
}

function allocationStatus(movement, active) {
  if (active?.needs_review) return 'NEEDS_REVIEW';
  if (movement.status === 'CANCELLED') return 'CANCELLED';
  if (movement.status === 'COMPLETED') return 'COMPLETED';
  if (!movement.pilot_required) return 'NOT_REQUIRED';
  if (!active) return 'UNALLOCATED';
  return active.status; // DRAFT | CONFIRMED
}

const UNRESOLVED = new Set(['UNALLOCATED', 'DRAFT', 'NEEDS_REVIEW']);

/** Shape an allocation for a given viewer: viewers only see confirmed assignments. */
function visibleAllocation(user, a, pilotsById) {
  if (!a) return null;
  if (a.status === 'DRAFT' && !can(user, 'allocations:view_draft')) return null;
  const d = decodeAllocation(a);
  return { ...d, pilot_name: pilotsById.get(a.pilot_id)?.name ?? a.pilot_id };
}

export function listMovements(ctx, user, { area, from, to, unresolved } = {}) {
  authorise(user, 'movements:view');
  const start = from ?? new Date(ctx.now() - 2 * 3600_000).toISOString();
  const end = to ?? new Date(ctx.now() + ctx.config.boardWindowHours * 3600_000).toISOString();
  const rows = ctx.db.prepare(`
    SELECT * FROM movements
    WHERE scheduled_start >= ? AND scheduled_start <= ? AND (? IS NULL OR area = ?)
    ORDER BY scheduled_start
  `).all(start, end, area ?? null, area ?? null);
  const pilots = new Map(ctx.db.prepare('SELECT id, name FROM pilots').all().map((p) => [p.id, p]));

  return rows
    .map((m) => {
      const active = activeFor(ctx, m.id);
      let status = allocationStatus(m, active);
      const allocation = visibleAllocation(user, active, pilots);
      if (status === 'DRAFT' && !allocation) status = 'UNALLOCATED';
      if (status === 'NEEDS_REVIEW' && !can(user, 'allocations:view_draft') && active.status === 'DRAFT') status = 'UNALLOCATED';
      return { ...m, pilot_required: Boolean(m.pilot_required), allocation_status: status, allocation };
    })
    .filter((m) => !unresolved || UNRESOLVED.has(m.allocation_status));
}

export function getMovementDetail(ctx, user, mid) {
  authorise(user, 'movements:view');
  const m = mustGet(getMovement, ctx, mid, 'Movement');
  const pilots = new Map(ctx.db.prepare('SELECT id, name FROM pilots').all().map((p) => [p.id, p]));
  const active = activeFor(ctx, mid);
  const out = {
    movement: { ...m, pilot_required: Boolean(m.pilot_required) },
    allocation_status: allocationStatus(m, active),
    allocation: visibleAllocation(user, active, pilots),
  };
  if (can(user, 'audit:view')) {
    out.allocations = ctx.db.prepare('SELECT * FROM allocations WHERE movement_id = ? ORDER BY created_at')
      .all(mid).map((a) => visibleAllocation(user, a, pilots));
    out.history = auditFor(ctx, mid);
  }
  return out;
}

function auditFor(ctx, mid) {
  return ctx.db.prepare('SELECT * FROM audit_events WHERE movement_id = ? ORDER BY seq').all(mid).map((e) => ({
    ...e,
    before: e.before_json ? JSON.parse(e.before_json) : null,
    after: e.after_json ? JSON.parse(e.after_json) : null,
    details: e.details_json ? JSON.parse(e.details_json) : null,
    before_json: undefined, after_json: undefined, details_json: undefined,
  }));
}

export function listAudit(ctx, user, { movementId } = {}) {
  authorise(user, 'audit:view');
  if (movementId) return auditFor(ctx, movementId);
  return ctx.db.prepare('SELECT seq, at, actor, actor_role, action, entity_type, entity_id, movement_id, reason FROM audit_events ORDER BY seq DESC LIMIT 200').all();
}

export function listPilots(ctx, user) {
  authorise(user, 'pilots:view');
  const from = new Date(ctx.now() - 12 * 3600_000).toISOString();
  const to = new Date(ctx.now() + 36 * 3600_000).toISOString();
  return ctx.db.prepare('SELECT * FROM pilots ORDER BY name').all().map((p) => ({
    ...p,
    active: Boolean(p.active),
    areas: JSON.parse(p.areas),
    availability_stale: ctx.now() - new Date(p.availability_updated_at).getTime() > ctx.config.staleAvailabilityHours * 3600_000,
    availability: ctx.db.prepare('SELECT * FROM availability WHERE pilot_id = ? AND end_at >= ? AND start_at <= ? ORDER BY start_at').all(p.id, from, to),
    assignments: ctx.db.prepare(`
      SELECT a.id, a.status, a.needs_review, m.id AS movement_id, m.vessel_name, m.scheduled_start, m.duration_minutes
      FROM allocations a JOIN movements m ON m.id = a.movement_id
      WHERE a.pilot_id = ? AND a.status IN ('DRAFT','CONFIRMED') AND m.scheduled_start >= ? AND m.scheduled_start <= ?
      ORDER BY m.scheduled_start`).all(p.id, from, to),
  }));
}

export function candidates(ctx, user, mid) {
  authorise(user, 'pilots:view');
  const m = mustGet(getMovement, ctx, mid, 'Movement');
  const active = activeFor(ctx, mid);
  return ctx.db.prepare('SELECT * FROM pilots ORDER BY name').all().map((p) => {
    const checks = evaluate(ctx.db, ctx.config, m, p, { excludeAllocationId: active?.id, now: ctx.now() });
    const { blockers, overridable, warnings } = classify(checks, user.role);
    const blocks = checks.filter((c) => c.severity === 'BLOCK');
    const outcome = blockers.length ? 'BLOCKED'
      : overridable.length ? 'EXCEPTION_REQUIRED'
      : warnings.length ? 'WARNING'
      : 'ELIGIBLE';
    return {
      pilot: { id: p.id, name: p.name, grade: p.grade, max_loa_m: p.max_loa_m, max_draught_m: p.max_draught_m, areas: JSON.parse(p.areas) },
      outcome,
      // Tells an allocator that a supervisor could authorise an exception for this pilot.
      exception_possible_by_other_role: Boolean(blockers.length) && blocks.every((c) => c.overridableBy.length > 0),
      is_current: active?.pilot_id === p.id,
      checks,
    };
  }).sort((a, b) => ORDER[a.outcome] - ORDER[b.outcome] || a.pilot.name.localeCompare(b.pilot.name));
}
const ORDER = { ELIGIBLE: 0, WARNING: 1, EXCEPTION_REQUIRED: 2, BLOCKED: 3 };

// ---------- writes ----------

function audit(ctx, user, e) {
  ctx.db.prepare(`
    INSERT INTO audit_events (at, actor, actor_role, action, entity_type, entity_id, movement_id, before_json, after_json, reason, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(iso(ctx), user.id, user.role, e.action, e.entityType, e.entityId, e.movementId ?? null,
    json(e.before), json(e.after), e.reason ?? null, json(e.details));
}

/** Optimistic-concurrency update: fails if someone else changed the row first. */
function updateVersioned(ctx, table, rowId, expectedVersion, fields) {
  if (expectedVersion == null) throw badRequest('version is required');
  const cols = Object.keys(fields);
  const sql = `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, version = version + 1 WHERE id = ? AND version = ?`;
  const res = ctx.db.prepare(sql).run(...cols.map((c) => fields[c]), rowId, expectedVersion);
  if (res.changes !== 1) {
    const current = ctx.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(rowId);
    throw conflict('This record was changed by someone else. Reload and try again.', { current });
  }
  return ctx.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(rowId);
}

/** Apply agreed checks. Throws on blockers / missing exception reason / unaccepted warnings. */
function assess(ctx, user, movement, pilot, { acceptWarnings, overrideReason }, excludeAllocationId) {
  const checks = evaluate(ctx.db, ctx.config, movement, pilot, { excludeAllocationId, now: ctx.now() });
  const { blockers, overridable, warnings } = classify(checks, user.role);
  if (blockers.length) throw unprocessable('ALLOCATION_BLOCKED', 'Allocation blocked by agreed checks', { checks });
  if (overridable.length && !overrideReason?.trim()) {
    throw unprocessable('EXCEPTION_REASON_REQUIRED', 'An authorised exception requires a reason', { checks });
  }
  if (warnings.length && !acceptWarnings) {
    throw unprocessable('WARNINGS_NOT_ACCEPTED', 'Review and accept warnings to continue', { checks });
  }
  return {
    exceptions: overridable.map((c) => ({ code: c.code, message: c.message, reason: overrideReason, by: user.id })),
    warnings: warnings.map((c) => ({ code: c.code, message: c.message })),
  };
}

function requireReason(reason, reasonCategory) {
  if (!reason?.trim()) throw badRequest('A reason is required');
  if (!REASON_CATEGORIES.includes(reasonCategory)) throw badRequest(`reasonCategory must be one of ${REASON_CATEGORIES.join(', ')}`);
}

function insertAllocation(ctx, user, { movementId, pilotId, previousId = null, exceptions, warnings }) {
  const aid = id('ALC');
  try {
    ctx.db.prepare(`
      INSERT INTO allocations (id, movement_id, pilot_id, status, previous_allocation_id, exceptions, warnings, created_by, created_at)
      VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)
    `).run(aid, movementId, pilotId, previousId, JSON.stringify(exceptions), JSON.stringify(warnings), user.id, iso(ctx));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) throw conflict('Another allocation for this movement was just created. Reload and try again.');
    throw err;
  }
  return getAllocation(ctx, aid);
}

function confirmInternal(ctx, user, a) {
  if (a.status !== 'DRAFT') throw conflict(`Only draft allocations can be confirmed (current: ${a.status})`);
  if (a.needs_review) throw unprocessable('REVIEW_REQUIRED', 'Resolve the review flag before confirming');
  const updated = updateVersioned(ctx, 'allocations', a.id, a.version, {
    status: 'CONFIRMED', confirmed_at: iso(ctx), confirmed_by: user.id,
  });
  audit(ctx, user, { action: 'ALLOCATION_CONFIRMED', entityType: 'allocation', entityId: a.id, movementId: a.movement_id,
    before: { status: a.status }, after: { status: 'CONFIRMED', pilot_id: a.pilot_id } });
  return updated;
}

export function createAllocation(ctx, user, { movementId, pilotId, movementVersion, confirm = false, acceptWarnings = false, overrideReason } = {}) {
  authorise(user, 'allocations:create');
  return tx(ctx.db, () => {
    const m = mustGet(getMovement, ctx, movementId, 'Movement');
    const p = mustGet(getPilot, ctx, pilotId, 'Pilot');
    if (movementVersion != null && movementVersion !== m.version) {
      throw conflict('Movement details changed since you loaded them. Reload and review.', { current: m });
    }
    if (activeFor(ctx, movementId)) throw conflict('Movement already has an active allocation. Reallocate instead.');
    const { exceptions, warnings } = assess(ctx, user, m, p, { acceptWarnings, overrideReason }, null);
    let a = insertAllocation(ctx, user, { movementId, pilotId, exceptions, warnings });
    audit(ctx, user, { action: 'ALLOCATION_CREATED', entityType: 'allocation', entityId: a.id, movementId,
      after: { pilot_id: pilotId, status: 'DRAFT' }, reason: overrideReason, details: { exceptions, warnings } });
    if (confirm) a = confirmInternal(ctx, user, a);
    return decodeAllocation(a);
  });
}

export function confirmAllocation(ctx, user, { allocationId, version }) {
  authorise(user, 'allocations:confirm');
  return tx(ctx.db, () => {
    const a = mustGet(getAllocation, ctx, allocationId, 'Allocation');
    if (version !== a.version) throw conflict('This allocation was changed by someone else. Reload and try again.', { current: a });
    return decodeAllocation(confirmInternal(ctx, user, a));
  });
}

export function reallocate(ctx, user, { allocationId, version, pilotId, reason, reasonCategory, acceptWarnings = false, overrideReason, confirm = false }) {
  authorise(user, 'allocations:reallocate');
  requireReason(reason, reasonCategory);
  return tx(ctx.db, () => {
    const old = mustGet(getAllocation, ctx, allocationId, 'Allocation');
    if (!ACTIVE.includes(old.status)) throw conflict(`Allocation is ${old.status} and cannot be reallocated`);
    if (old.pilot_id === pilotId) throw badRequest('Choose a different pilot');
    const m = getMovement(ctx, old.movement_id);
    const p = mustGet(getPilot, ctx, pilotId, 'Pilot');
    const { exceptions, warnings } = assess(ctx, user, m, p, { acceptWarnings, overrideReason }, old.id);
    updateVersioned(ctx, 'allocations', old.id, version, {
      status: 'SUPERSEDED', ended_at: iso(ctx), end_reason: `${reasonCategory}: ${reason}`,
    });
    let next = insertAllocation(ctx, user, { movementId: m.id, pilotId, previousId: old.id, exceptions, warnings });
    audit(ctx, user, { action: 'ALLOCATION_REASSIGNED', entityType: 'allocation', entityId: next.id, movementId: m.id,
      before: { allocation_id: old.id, pilot_id: old.pilot_id, status: old.status },
      after: { allocation_id: next.id, pilot_id: pilotId, status: 'DRAFT' },
      reason, details: { reasonCategory, exceptions, warnings, overrideReason } });
    if (confirm) next = confirmInternal(ctx, user, next);
    return decodeAllocation(next);
  });
}

export function cancelAllocation(ctx, user, { allocationId, version, reason, reasonCategory }) {
  authorise(user, 'allocations:cancel');
  requireReason(reason, reasonCategory);
  return tx(ctx.db, () => {
    const a = mustGet(getAllocation, ctx, allocationId, 'Allocation');
    if (!ACTIVE.includes(a.status)) throw conflict(`Allocation is already ${a.status}`);
    const updated = updateVersioned(ctx, 'allocations', a.id, version, {
      status: 'CANCELLED', ended_at: iso(ctx), end_reason: `${reasonCategory}: ${reason}`, needs_review: 0,
    });
    audit(ctx, user, { action: 'ALLOCATION_CANCELLED', entityType: 'allocation', entityId: a.id, movementId: a.movement_id,
      before: { status: a.status, pilot_id: a.pilot_id }, after: { status: 'CANCELLED' }, reason, details: { reasonCategory } });
    return decodeAllocation(updated);
  });
}

/** Clear a review flag. Refused if the current pilot now fails a non-overridable check. */
export function markReviewed(ctx, user, { allocationId, version, note }) {
  authorise(user, 'allocations:review');
  return tx(ctx.db, () => {
    const a = mustGet(getAllocation, ctx, allocationId, 'Allocation');
    if (!a.needs_review) throw conflict('Allocation is not flagged for review');
    const m = getMovement(ctx, a.movement_id);
    const p = getPilot(ctx, a.pilot_id);
    const checks = evaluate(ctx.db, ctx.config, m, p, { excludeAllocationId: a.id, now: ctx.now() });
    const accepted = new Set(JSON.parse(a.exceptions).map((e) => e.code));
    const { blockers } = classify(checks.filter((c) => !accepted.has(c.code)), user.role);
    if (blockers.length) {
      throw unprocessable('ALLOCATION_BLOCKED', 'Assignment no longer passes agreed checks — reallocate or cancel', { checks });
    }
    const updated = updateVersioned(ctx, 'allocations', a.id, version, { needs_review: 0, review_reasons: '[]' });
    audit(ctx, user, { action: 'ALLOCATION_REVIEWED', entityType: 'allocation', entityId: a.id, movementId: a.movement_id,
      before: { review_reasons: JSON.parse(a.review_reasons) }, after: { needs_review: false }, reason: note });
    return decodeAllocation(updated);
  });
}

export function setCommStatus(ctx, user, { allocationId, version, status }) {
  authorise(user, 'allocations:comm');
  if (!ctx.config.features.communicationStatus) throw forbidden('Communication status is not enabled');
  if (!['SENT', 'ACKNOWLEDGED', 'DECLINED'].includes(status)) throw badRequest('Invalid communication status');
  return tx(ctx.db, () => {
    const a = mustGet(getAllocation, ctx, allocationId, 'Allocation');
    if (a.status !== 'CONFIRMED') throw conflict('Only confirmed allocations can be communicated');
    const updated = updateVersioned(ctx, 'allocations', a.id, version, { comm_status: status });
    audit(ctx, user, { action: 'COMMUNICATION_STATUS', entityType: 'allocation', entityId: a.id, movementId: a.movement_id,
      before: { comm_status: a.comm_status }, after: { comm_status: status } });
    if (status === 'DECLINED') flag(ctx, user, updated, ['Pilot declined the assignment']);
    return decodeAllocation(getAllocation(ctx, a.id));
  });
}

/** System-initiated review flag. Bumps version so stale edits elsewhere conflict. */
function flag(ctx, user, a, reasons) {
  const merged = [...JSON.parse(a.review_reasons), ...reasons.map((r) => ({ at: iso(ctx), reason: r }))];
  ctx.db.prepare('UPDATE allocations SET needs_review = 1, review_reasons = ?, version = version + 1 WHERE id = ?')
    .run(JSON.stringify(merged), a.id);
  audit(ctx, user, { action: 'ALLOCATION_FLAGGED', entityType: 'allocation', entityId: a.id, movementId: a.movement_id,
    after: { needs_review: true }, details: { reasons } });
}

function fmt(field, v) {
  if (v == null) return '—';
  if (field === 'scheduled_start') return `${v.slice(0, 16).replace('T', ' ')}Z`;
  return String(v);
}

function normaliseMovementChanges(changes) {
  const out = {};
  for (const [k, v] of Object.entries(changes ?? {})) {
    if (!MOVEMENT_FIELDS.includes(k)) throw badRequest(`Field ${k} cannot be changed`);
    if (k === 'scheduled_start') {
      if (Number.isNaN(Date.parse(v))) throw badRequest('scheduled_start must be an ISO date-time');
      out[k] = new Date(v).toISOString();
    } else if (k === 'pilot_required') out[k] = v ? 1 : 0;
    else if (['loa_m', 'draught_m', 'duration_minutes'].includes(k)) out[k] = v === '' || v == null ? null : Number(v);
    else if (k === 'status' && !['PLANNED', 'CANCELLED', 'COMPLETED'].includes(v)) throw badRequest('Invalid movement status');
    else out[k] = v;
  }
  return out;
}

function applyMovementChange(ctx, user, m, version, changes) {
  const normalised = normaliseMovementChanges(changes);
  const diff = Object.fromEntries(Object.entries(normalised).filter(([k, v]) => m[k] !== v));
  if (!Object.keys(diff).length) return { movement: m, changed: false };
  const updated = updateVersioned(ctx, 'movements', m.id, version, { ...diff, updated_at: iso(ctx) });
  audit(ctx, user, { action: 'MOVEMENT_UPDATED', entityType: 'movement', entityId: m.id, movementId: m.id,
    before: Object.fromEntries(Object.keys(diff).map((k) => [k, m[k]])), after: diff });

  const active = activeFor(ctx, m.id);
  if (active) {
    const reasons = Object.keys(diff).map((k) => `Movement ${k.replace('_', ' ')} changed: ${fmt(k, m[k])} → ${fmt(k, diff[k])}`);
    flag(ctx, user, active, reasons);
  }
  // A time/duration change can also clash with this pilot's other jobs, or another pilot's.
  if ('scheduled_start' in diff || 'duration_minutes' in diff) reevaluateOverlapping(ctx, user, updated, active?.id);
  return { movement: updated, changed: true };
}

/** Re-check other active allocations whose movement is near this one in time. */
function reevaluateOverlapping(ctx, user, movement, skipId) {
  const w = movementWindow(movement);
  const pad = (ctx.config.minRestMinutes + 24 * 60) * 60_000;
  const rows = ctx.db.prepare(`
    SELECT a.* FROM allocations a JOIN movements m ON m.id = a.movement_id
    WHERE a.status IN ('DRAFT','CONFIRMED') AND a.needs_review = 0 AND (? IS NULL OR a.id != ?)
      AND m.scheduled_start BETWEEN ? AND ?`)
    .all(skipId ?? null, skipId ?? null, new Date(w.start - pad).toISOString(), new Date(w.end + pad).toISOString());
  for (const a of rows) flagIfFailing(ctx, user, a);
}

function flagIfFailing(ctx, user, a) {
  const m = getMovement(ctx, a.movement_id);
  const p = getPilot(ctx, a.pilot_id);
  const accepted = new Set(JSON.parse(a.exceptions).map((e) => e.code));
  const failing = evaluate(ctx.db, ctx.config, m, p, { excludeAllocationId: a.id, now: ctx.now() })
    .filter((c) => c.severity === 'BLOCK' && !accepted.has(c.code) && c.code !== 'MOVEMENT_NOT_PILOTABLE');
  if (failing.length) flag(ctx, user, a, failing.map((c) => c.message));
  return failing.length > 0;
}

export function updateMovement(ctx, user, { movementId, version, changes }) {
  authorise(user, 'movements:update');
  return tx(ctx.db, () => {
    const m = mustGet(getMovement, ctx, movementId, 'Movement');
    return applyMovementChange(ctx, user, m, version, changes).movement;
  });
}

export function addUnavailability(ctx, user, { pilotId, start, end, note }) {
  authorise(user, 'pilots:update_availability');
  if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) {
    throw badRequest('Valid start and end (end after start) are required');
  }
  return tx(ctx.db, () => {
    const p = mustGet(getPilot, ctx, pilotId, 'Pilot');
    const blockId = id('AV');
    ctx.db.prepare(`INSERT INTO availability (id, pilot_id, kind, start_at, end_at, note) VALUES (?, ?, 'UNAVAILABLE', ?, ?, ?)`)
      .run(blockId, pilotId, new Date(start).toISOString(), new Date(end).toISOString(), note ?? null);
    ctx.db.prepare('UPDATE pilots SET availability_updated_at = ?, version = version + 1 WHERE id = ?').run(iso(ctx), pilotId);
    audit(ctx, user, { action: 'AVAILABILITY_CHANGED', entityType: 'pilot', entityId: pilotId,
      after: { kind: 'UNAVAILABLE', start, end, note } });
    const affected = ctx.db.prepare(`SELECT * FROM allocations WHERE pilot_id = ? AND status IN ('DRAFT','CONFIRMED')`).all(p.id)
      .filter((a) => flagIfFailing(ctx, user, a)).map((a) => a.id);
    return { availabilityId: blockId, flaggedAllocations: affected };
  });
}

// ---------- tactical import (manual / controlled data entry, see docs/open-decisions.md D-05) ----------

const IMPORT_COLUMNS = ['external_ref', 'vessel_name', 'imo', 'movement_type', 'from_location', 'to_location', 'area',
  'scheduled_start', 'duration_minutes', 'loa_m', 'draught_m', 'pilot_required'];

export function importMovementsCsv(ctx, user, csvText) {
  authorise(user, 'movements:import');
  const rows = parseCsv(csvText ?? '');
  if (!rows.length) throw badRequest('CSV is empty');
  const [header, ...data] = rows;
  const missing = IMPORT_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw badRequest(`Missing columns: ${missing.join(', ')}`);

  const report = { created: [], updated: [], unchanged: [], rejected: [], notInFile: [] };
  return tx(ctx.db, () => {
    const seen = new Set();
    let minStart = null; let maxStart = null; const areas = new Set();
    data.forEach((cells, i) => {
      const line = i + 2;
      const r = Object.fromEntries(header.map((h, j) => [h, (cells[j] ?? '').trim()]));
      const err = validateRow(r);
      if (err) return report.rejected.push({ line, external_ref: r.external_ref || null, error: err });
      if (seen.has(r.external_ref)) return report.rejected.push({ line, external_ref: r.external_ref, error: 'Duplicate external_ref in file' });
      seen.add(r.external_ref);
      const startIso = new Date(r.scheduled_start).toISOString();
      minStart = !minStart || startIso < minStart ? startIso : minStart;
      maxStart = !maxStart || startIso > maxStart ? startIso : maxStart;
      areas.add(r.area);

      const existing = ctx.db.prepare('SELECT * FROM movements WHERE external_ref = ?').get(r.external_ref);
      const fields = {
        scheduled_start: startIso,
        duration_minutes: Number(r.duration_minutes || 90),
        loa_m: r.loa_m === '' ? null : Number(r.loa_m),
        draught_m: r.draught_m === '' ? null : Number(r.draught_m),
        from_location: r.from_location || null,
        to_location: r.to_location || null,
        pilot_required: !['0', 'false', 'no', 'n'].includes(r.pilot_required.toLowerCase()),
      };
      if (existing) {
        const { changed } = applyMovementChange(ctx, user, existing, existing.version, fields);
        (changed ? report.updated : report.unchanged).push(r.external_ref);
      } else {
        const mid = id('MOV');
        ctx.db.prepare(`
          INSERT INTO movements (id, external_ref, vessel_name, imo, movement_type, from_location, to_location, area,
            scheduled_start, duration_minutes, loa_m, draught_m, pilot_required, source, first_seen_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CSV_IMPORT', ?, ?)
        `).run(mid, r.external_ref, r.vessel_name, r.imo || null, r.movement_type.toUpperCase(), fields.from_location, fields.to_location,
          r.area, startIso, fields.duration_minutes, fields.loa_m, fields.draught_m, fields.pilot_required ? 1 : 0, iso(ctx), iso(ctx));
        audit(ctx, user, { action: 'MOVEMENT_CREATED', entityType: 'movement', entityId: mid, movementId: mid, after: { ...r } });
        report.created.push(r.external_ref);
      }
    });
    // Reconciliation control: planned movements in the file's scope that the file no longer contains.
    if (minStart) {
      const areaList = [...areas];
      report.notInFile = ctx.db.prepare(`
        SELECT external_ref, vessel_name, scheduled_start FROM movements
        WHERE status = 'PLANNED' AND scheduled_start BETWEEN ? AND ? AND area IN (${areaList.map(() => '?').join(',')})`)
        .all(minStart, maxStart, ...areaList)
        .filter((m) => m.external_ref && !seen.has(m.external_ref));
    }
    audit(ctx, user, { action: 'IMPORT_RUN', entityType: 'import', entityId: id('IMP'),
      details: { created: report.created.length, updated: report.updated.length, unchanged: report.unchanged.length,
        rejected: report.rejected.length, notInFile: report.notInFile.length } });
    return report;
  });
}

function validateRow(r) {
  if (!r.external_ref) return 'external_ref is required';
  if (!r.vessel_name) return 'vessel_name is required';
  if (!['ARRIVAL', 'DEPARTURE', 'SHIFT'].includes(r.movement_type.toUpperCase())) return 'movement_type must be ARRIVAL, DEPARTURE or SHIFT';
  if (!r.area) return 'area is required';
  if (Number.isNaN(Date.parse(r.scheduled_start))) return 'scheduled_start must be an ISO date-time';
  for (const k of ['duration_minutes', 'loa_m', 'draught_m']) {
    if (r[k] !== '' && !(Number(r[k]) > 0)) return `${k} must be a positive number`;
  }
  return null;
}

// ---------- measurement ----------

export function metrics(ctx, user) {
  authorise(user, 'metrics:view');
  const median = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  // Time to allocate: movement first seen → first confirmation (proposed definition, D-09).
  const tta = ctx.db.prepare(`
    SELECT m.first_seen_at, MIN(e.at) AS confirmed_at FROM audit_events e JOIN movements m ON m.id = e.movement_id
    WHERE e.action = 'ALLOCATION_CONFIRMED' GROUP BY m.id`).all()
    .map((r) => (Date.parse(r.confirmed_at) - Date.parse(r.first_seen_at)) / 60_000);

  const windowEnd = new Date(ctx.now() + ctx.config.boardWindowHours * 3600_000).toISOString();
  const eligible = ctx.db.prepare(`SELECT id FROM movements WHERE pilot_required = 1 AND status = 'PLANNED' AND scheduled_start <= ?`).all(windowEnd);
  const confirmed = eligible.filter((m) => {
    const a = activeFor(ctx, m.id);
    return a && a.status === 'CONFIRMED';
  }).length;
  const upcoming = ctx.db.prepare(`SELECT id FROM movements WHERE pilot_required = 1 AND status = 'PLANNED' AND scheduled_start BETWEEN ? AND ?`)
    .all(new Date(ctx.now()).toISOString(), windowEnd);
  const unallocated = upcoming.filter((m) => !activeFor(ctx, m.id)).length;

  const changes = ctx.db.prepare(`SELECT action, details_json FROM audit_events WHERE action IN ('ALLOCATION_REASSIGNED','ALLOCATION_CANCELLED')`).all();
  const byCategory = {};
  for (const c of changes) {
    const cat = JSON.parse(c.details_json ?? '{}').reasonCategory ?? 'UNSPECIFIED';
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }
  const exceptions = ctx.db.prepare(`SELECT COUNT(*) AS n FROM allocations WHERE exceptions != '[]'`).get().n;

  return {
    _note: 'Proposed metric definitions — baseline, targets and owners to be agreed in discovery.',
    timeToAllocateMinutes: { n: tta.length, median: median(tta) },
    unallocatedUpcoming: unallocated,
    adoption: { eligibleMovements: eligible.length, confirmedInMeridian: confirmed,
      rate: eligible.length ? +(confirmed / eligible.length).toFixed(3) : null },
    reallocationsAndCancellations: { total: changes.length, byCategory },
    authorisedExceptions: exceptions,
  };
}
