// Allocation checks for the discovery prototype.
// Every threshold, severity and exception permission comes from src/config/rules.json.
// They are ILLUSTRATIVE ASSUMPTIONS, not approved operating rules (docs/illustrative-rules.md).

const MIN = 60_000;
const t = (iso) => new Date(iso).getTime();
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16);

/** The time a movement occupies a pilot. Used by both the checks and the availability timeline. */
export function movementWindow(m) {
  const start = t(m.scheduled_start);
  return { start, end: start + m.duration_minutes * MIN };
}

/** Movement window widened by the configured transit allowance (what DOUBLE_BOOKED compares). */
export function occupiedWindow(config, m) {
  const w = movementWindow(m);
  const buffer = config.transitAllowanceMinutes * MIN;
  return { start: w.start - buffer, end: w.end + buffer };
}

export function classLimits(config, pilot) {
  return config.pilotClassLimits[pilot.grade] ?? null;
}

/** Required movement fields (per config) that are missing. Missing is never treated as zero. */
export function missingFields(config, m) {
  return Object.entries(config.requiredMovementFields)
    .filter(([k]) => !k.startsWith('_') && (m[k] == null || m[k] === ''))
    .map(([k, label]) => ({ field: k, label }));
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

function result(config, code, message) {
  const rule = config.checks[code];
  return { code, label: rule.label, severity: rule.severity, overridableBy: rule.overridableBy, message };
}

/**
 * Evaluate a pilot against a movement.
 * @returns {Array<{code, label, severity:'BLOCK'|'CONFIRM_HOLD'|'WARN', overridableBy:string[], message}>}
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
    out.push(result(config, 'AREA_NOT_AUTHORISED', `Not authorised for area ${movement.area} (authorised: ${areas.join(', ')})`));
  }

  // Suitability limits. A missing value means the check cannot be completed: it is neither passed nor failed.
  const limits = classLimits(config, pilot);
  const missing = missingFields(config, movement);
  if (missing.length) {
    const names = missing.map((f) => f.label).join(' and ');
    out.push(result(config, 'MOVEMENT_DATA_MISSING',
      `${names} missing — the ${missing.map((f) => f.label.toLowerCase()).join(' and ')} limit check cannot be completed. Draft only until it is supplied.`));
  }
  if (!limits) {
    out.push(result(config, 'CLASS_LIMITS_UNKNOWN', `No limits configured for ${pilot.grade} — suitability cannot be checked`));
  } else {
    if (movement.loa_m != null && movement.loa_m > limits.maxLoaM) {
      out.push(result(config, 'LOA_EXCEEDS_LIMIT', `LOA ${movement.loa_m} m exceeds ${pilot.grade} limit of ${limits.maxLoaM} m`));
    }
    if (movement.draught_m != null && movement.draught_m > limits.maxDraughtM) {
      out.push(result(config, 'DRAUGHT_EXCEEDS_LIMIT', `Draught ${movement.draught_m} m exceeds ${pilot.grade} limit of ${limits.maxDraughtM} m`));
    }
  }

  if (pilot.trainee && config.trainee.holdConfirmationUntilSupervisionRecorded) {
    out.push(result(config, 'TRAINEE_SUPERVISION',
      'Trainee pilot. Supervision requirements are not defined or recorded in this prototype, so the assignment can be drafted but not confirmed. (Prototype assumption — requires operational validation.)'));
  }

  const blocks = db.prepare('SELECT * FROM availability WHERE pilot_id = ?').all(pilot.id)
    .map((a) => ({ ...a, start: t(a.start_at), end: t(a.end_at) }));

  const unavailable = blocks.find((b) => b.kind === 'UNAVAILABLE' && overlaps(b, win));
  if (unavailable) {
    out.push(result(config, 'PILOT_UNAVAILABLE', `Recorded unavailable ${hhmm(unavailable.start)}–${hhmm(unavailable.end)} UTC${unavailable.note ? ` (${unavailable.note})` : ''}`));
  }

  const onDuty = blocks.some((b) => b.kind === 'ON_DUTY' && b.start <= win.start && b.end >= win.end);
  if (!onDuty) {
    const dutyNear = blocks.filter((b) => b.kind === 'ON_DUTY' && overlaps(b, win));
    const detail = dutyNear.length ? ` (duty ${dutyNear.map((b) => `${hhmm(b.start)}–${hhmm(b.end)}`).join(', ')} UTC)` : ' (no duty recorded)';
    out.push(result(config, 'OUTSIDE_DUTY', `Movement ${hhmm(win.start)}–${hhmm(win.end)} UTC is outside the recorded duty period${detail}`));
  }

  const buffer = config.transitAllowanceMinutes * MIN;
  const gap = config.minIntervalBetweenAssignmentsMinutes * MIN;
  const others = db.prepare(`
    SELECT a.id, m.scheduled_start, m.duration_minutes, m.vessel_name
    FROM allocations a JOIN movements m ON m.id = a.movement_id
    WHERE a.pilot_id = ? AND a.status IN ('DRAFT','CONFIRMED') AND a.movement_id != ? AND m.status = 'PLANNED'
      AND (? IS NULL OR a.id != ?)
  `).all(pilot.id, movement.id, excludeAllocationId, excludeAllocationId);

  for (const o of others) {
    const ow = movementWindow(o);
    if (overlaps({ start: ow.start - buffer, end: ow.end + buffer }, win)) {
      out.push(result(config, 'DOUBLE_BOOKED',
        `Conflicts with ${o.vessel_name} ${hhmm(ow.start)}–${hhmm(ow.end)} UTC (incl. ${config.transitAllowanceMinutes} min transit allowance)`));
    } else if (overlaps({ start: ow.start - gap, end: ow.end + gap }, win)) {
      out.push(result(config, 'REST_GAP',
        `Less than ${config.minIntervalBetweenAssignmentsMinutes} min between this and ${o.vessel_name} ${hhmm(ow.start)}–${hhmm(ow.end)} UTC`));
    }
  }

  if (now - t(pilot.availability_updated_at) > config.availabilityFreshnessHours * 60 * MIN) {
    out.push(result(config, 'AVAILABILITY_STALE',
      `Availability last updated ${pilot.availability_updated_at.slice(0, 16).replace('T', ' ')} UTC — older than ${config.availabilityFreshnessHours} h`));
  }

  return out;
}

/**
 * Split check results by effect for a given role.
 * BLOCK checks are overridable only when the role is listed; CONFIRM_HOLD checks are never overridable.
 */
export function classify(checks, role, acceptedExceptionCodes = new Set()) {
  const blockers = [];
  const overridable = [];
  const holds = [];
  const warnings = [];
  for (const c of checks) {
    if (c.severity === 'WARN') warnings.push(c);
    else if (c.severity === 'CONFIRM_HOLD') holds.push(c);
    else if (acceptedExceptionCodes.has(c.code)) continue;
    else if (c.overridableBy.includes(role)) overridable.push(c);
    else blockers.push(c);
  }
  return { blockers, overridable, holds, warnings };
}
