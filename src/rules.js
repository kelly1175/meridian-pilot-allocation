// Allocation checks. Thresholds and severities come from src/config/rules.json.
// All rules are PROPOSED and require agreement by the allocation rule authority.

const MIN = 60_000;
const t = (iso) => new Date(iso).getTime();

export function movementWindow(m) {
  const start = t(m.scheduled_start);
  return { start, end: start + m.duration_minutes * MIN };
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

function result(config, code, message) {
  const rule = config.checks[code];
  return { code, severity: rule.severity, overridableBy: rule.overridableBy, message };
}

/**
 * Evaluate a pilot against a movement.
 * @returns {Array<{code, severity:'BLOCK'|'WARN', overridableBy:string[], message}>}
 */
export function evaluate(db, config, movement, pilot, { excludeAllocationId = null, now = Date.now() } = {}) {
  const out = [];
  const win = movementWindow(movement);

  if (movement.status !== 'PLANNED' || !movement.pilot_required) {
    out.push(result(config, 'MOVEMENT_NOT_PILOTABLE', `Movement is ${movement.status.toLowerCase()} or does not require a pilot`));
  }
  if (!pilot.active) out.push(result(config, 'PILOT_INACTIVE', 'Pilot is not active'));

  const areas = JSON.parse(pilot.areas);
  if (!areas.includes(movement.area)) {
    out.push(result(config, 'AREA_NOT_AUTHORISED', `Not authorised for area ${movement.area}`));
  }

  if (movement.loa_m == null || movement.draught_m == null) {
    const missing = [movement.loa_m == null && 'LOA', movement.draught_m == null && 'draught'].filter(Boolean).join(' and ');
    out.push(result(config, 'MOVEMENT_DATA_MISSING', `Movement ${missing} missing — suitability cannot be fully checked`));
  }
  if (movement.loa_m != null && movement.loa_m > pilot.max_loa_m) {
    out.push(result(config, 'LOA_EXCEEDS_LIMIT', `LOA ${movement.loa_m}m exceeds pilot limit ${pilot.max_loa_m}m`));
  }
  if (movement.draught_m != null && movement.draught_m > pilot.max_draught_m) {
    out.push(result(config, 'DRAUGHT_EXCEEDS_LIMIT', `Draught ${movement.draught_m}m exceeds pilot limit ${pilot.max_draught_m}m`));
  }

  const blocks = db.prepare('SELECT * FROM availability WHERE pilot_id = ?').all(pilot.id)
    .map((a) => ({ ...a, start: t(a.start_at), end: t(a.end_at) }));

  const unavailable = blocks.find((b) => b.kind === 'UNAVAILABLE' && overlaps(b, win));
  if (unavailable) {
    out.push(result(config, 'PILOT_UNAVAILABLE', `Pilot unavailable${unavailable.note ? ` (${unavailable.note})` : ''}`));
  }

  const onDuty = blocks.some((b) => b.kind === 'ON_DUTY' && b.start <= win.start && b.end >= win.end);
  if (!onDuty) out.push(result(config, 'OUTSIDE_DUTY', 'Movement falls outside the pilot\'s recorded duty period'));

  const buffer = config.pilotTransitBufferMinutes * MIN;
  const rest = config.minRestMinutes * MIN;
  const others = db.prepare(`
    SELECT a.id, m.scheduled_start, m.duration_minutes, m.vessel_name
    FROM allocations a JOIN movements m ON m.id = a.movement_id
    WHERE a.pilot_id = ? AND a.status IN ('DRAFT','CONFIRMED') AND a.movement_id != ? AND m.status = 'PLANNED'
      AND (? IS NULL OR a.id != ?)
  `).all(pilot.id, movement.id, excludeAllocationId, excludeAllocationId);

  for (const o of others) {
    const ow = movementWindow(o);
    if (overlaps({ start: ow.start - buffer, end: ow.end + buffer }, win)) {
      out.push(result(config, 'DOUBLE_BOOKED', `Overlaps assignment on ${o.vessel_name} (incl. ${config.pilotTransitBufferMinutes} min transit)`));
    } else if (overlaps({ start: ow.start - rest, end: ow.end + rest }, win)) {
      out.push(result(config, 'REST_GAP', `Less than ${config.minRestMinutes} min between this and ${o.vessel_name}`));
    }
  }

  const staleMs = config.staleAvailabilityHours * 60 * MIN;
  if (now - t(pilot.availability_updated_at) > staleMs) {
    out.push(result(config, 'AVAILABILITY_STALE', `Availability last updated ${pilot.availability_updated_at.slice(0, 16).replace('T', ' ')} UTC — may be outdated`));
  }

  return out;
}

/**
 * Split check results into what blocks, what is overridden by an authorised exception, and warnings.
 */
export function classify(checks, role) {
  const blockers = [];
  const overridable = [];
  const warnings = [];
  for (const c of checks) {
    if (c.severity === 'WARN') warnings.push(c);
    else if (c.overridableBy.includes(role)) overridable.push(c);
    else blockers.push(c);
  }
  return { blockers, overridable, warnings };
}
