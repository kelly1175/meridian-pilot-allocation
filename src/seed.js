// Fictional sample data for discovery sessions. Times are relative to "now" so the board is always live.
// No real vessels, pilots or locations.

const H = 3600_000;

export function seed(db, now = Date.now()) {
  const at = (hours) => new Date(now + hours * H).toISOString();

  const users = [
    ['alex', 'Alex (Allocator)', 'ALLOCATOR'],
    ['blair', 'Blair (Allocator)', 'ALLOCATOR'],
    ['sam', 'Sam (Supervisor)', 'SUPERVISOR'],
    ['olly', 'Olly (Ops colleague)', 'VIEWER'],
  ];
  const insUser = db.prepare('INSERT INTO users (id, name, role) VALUES (?, ?, ?)');
  users.forEach((u) => insUser.run(...u));

  // id, name, grade, max LOA, max draught, areas, availability updated (hours ago)
  const pilots = [
    ['P01', 'Pilot Ashworth', 'Class 1', 400, 16.0, ['INNER', 'OUTER'], 2],
    ['P02', 'Pilot Bevan', 'Class 1', 400, 16.0, ['INNER', 'OUTER'], 3],
    ['P03', 'Pilot Carrick', 'Class 2', 250, 12.0, ['INNER', 'OUTER'], 1],
    ['P04', 'Pilot Dunmore', 'Class 2', 250, 12.0, ['INNER'], 30],   // stale availability
    ['P05', 'Pilot Ellery', 'Class 3', 180, 9.5, ['INNER'], 4],
    ['P06', 'Pilot Fenwick', 'Class 3', 180, 9.5, ['INNER', 'OUTER'], 5],
    ['P07', 'Pilot Garside', 'Class 1', 400, 16.0, ['OUTER'], 2],
    ['P08', 'Pilot Holt (trainee)', 'Class 4', 120, 7.0, ['INNER'], 6],
  ];
  const insPilot = db.prepare(`INSERT INTO pilots (id, name, grade, max_loa_m, max_draught_m, areas, availability_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insAv = db.prepare('INSERT INTO availability (id, pilot_id, kind, start_at, end_at, note) VALUES (?, ?, ?, ?, ?, ?)');
  let av = 0;
  for (const [pid, name, grade, loa, dr, areas, staleH] of pilots) {
    insPilot.run(pid, name, grade, loa, dr, JSON.stringify(areas), at(-staleH));
    // Two 12h shift patterns relative to now (A: -4h→+8h, B: +6h→+18h), repeated daily.
    // Leaves a cover gap at +18h→+20h so the board always shows an exception scenario.
    const shiftA = ['P01', 'P03', 'P05', 'P07'].includes(pid);
    for (const d of [-1, 0, 1, 2]) {
      const s = d * 24 + (shiftA ? -4 : 6);
      insAv.run(`AV-${++av}`, pid, 'ON_DUTY', at(s), at(s + 12), shiftA ? 'Shift A' : 'Shift B');
    }
  }
  insAv.run(`AV-${++av}`, 'P06', 'UNAVAILABLE', at(30), at(42), 'Training course');

  // Movements spread across the board window.
  const vessels = [
    ['NORDIC SPARROW', 'ARRIVAL', 'Fairway Buoy', 'Berth 4', 'OUTER', 2.5, 229, 11.2],
    ['CAPE HALLORAN', 'DEPARTURE', 'Berth 7', 'Fairway Buoy', 'INNER', 4, 183, 9.1],
    ['MV ORLA GRACE', 'ARRIVAL', 'Fairway Buoy', 'Berth 2', 'INNER', 5.5, 142, 7.4],
    ['STELLA MARIS II', 'SHIFT', 'Berth 3', 'Berth 9', 'INNER', 7, 98, 5.2],
    ['ATLANTIC FORTUNE', 'ARRIVAL', 'Pilot Station', 'Oil Jetty 1', 'OUTER', 9, 333, 15.4],
    ['KESTREL BAY', 'DEPARTURE', 'Berth 5', 'Fairway Buoy', 'INNER', 11, 166, null],     // missing draught
    ['HANSA LIGHT', 'ARRIVAL', 'Fairway Buoy', 'Berth 6', 'INNER', 13, 120, 6.8],
    ['POLAR VENTURE', 'DEPARTURE', 'Oil Jetty 1', 'Pilot Station', 'OUTER', 15, 274, 13.9],
    ['MARIA KONSTANTIN', 'ARRIVAL', 'Fairway Buoy', 'Berth 1', 'INNER', 17, 199, 10.6],
    ['SEA OTTER', 'SHIFT', 'Berth 9', 'Berth 3', 'INNER', 19, 61, 3.9],
    ['GRAN SOLANA', 'ARRIVAL', 'Pilot Station', 'Container Terminal', 'OUTER', 21, 366, 14.8],
    ['NORDIC SPARROW', 'DEPARTURE', 'Berth 4', 'Fairway Buoy', 'OUTER', 23, 229, 10.9],
    ['TIDEWATER QUEEN', 'ARRIVAL', 'Fairway Buoy', 'Berth 8', 'INNER', -1, 150, 8.0],
  ];
  const insMov = db.prepare(`
    INSERT INTO movements (id, external_ref, vessel_name, imo, movement_type, from_location, to_location, area, scheduled_start,
      duration_minutes, loa_m, draught_m, source, first_seen_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SAMPLE', ?, ?)`);
  vessels.forEach(([name, type, from, to, area, h, loa, dr], i) => {
    const n = String(i + 1).padStart(3, '0');
    insMov.run(`MOV-${n}`, `VTS-${24000 + i + 1}`, name, `9${String(100000 + i * 7919).slice(0, 6)}`, type, from, to, area,
      at(h), area === 'OUTER' ? 120 : 75, loa, dr, at(-20), at(-20));
  });

  // A few existing allocations so the board shows each state.
  const insAlloc = db.prepare(`
    INSERT INTO allocations (id, movement_id, pilot_id, status, created_by, created_at, confirmed_at, confirmed_by, comm_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insAudit = db.prepare(`INSERT INTO audit_events (at, actor, actor_role, action, entity_type, entity_id, movement_id, after_json)
    VALUES (?, ?, ?, ?, 'allocation', ?, ?, ?)`);
  const pre = [
    ['ALC-SEED0001', 'MOV-013', 'P05', 'CONFIRMED', 'ACKNOWLEDGED', -10],
    ['ALC-SEED0002', 'MOV-002', 'P03', 'CONFIRMED', 'SENT', -6],
    ['ALC-SEED0003', 'MOV-003', 'P05', 'DRAFT', 'NOT_SENT', -2],
  ];
  for (const [aid, mid, pid, status, comm, h] of pre) {
    const confirmed = status === 'CONFIRMED';
    insAlloc.run(aid, mid, pid, status, 'alex', at(h), confirmed ? at(h + 0.5) : null, confirmed ? 'alex' : null, comm);
    insAudit.run(at(h), 'alex', 'ALLOCATOR', 'ALLOCATION_CREATED', aid, mid, JSON.stringify({ pilot_id: pid, status: 'DRAFT' }));
    if (confirmed) insAudit.run(at(h + 0.5), 'alex', 'ALLOCATOR', 'ALLOCATION_CONFIRMED', aid, mid, JSON.stringify({ status: 'CONFIRMED' }));
  }
}
