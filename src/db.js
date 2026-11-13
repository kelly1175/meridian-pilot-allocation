import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('VIEWER','ALLOCATOR','SUPERVISOR'))
);

CREATE TABLE IF NOT EXISTS movements (
  id TEXT PRIMARY KEY,
  external_ref TEXT UNIQUE,              -- existing movement identifier from source system
  vessel_name TEXT NOT NULL,
  imo TEXT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('ARRIVAL','DEPARTURE','SHIFT')),
  from_location TEXT,
  to_location TEXT,
  area TEXT NOT NULL,
  scheduled_start TEXT NOT NULL,         -- ISO 8601 UTC
  duration_minutes INTEGER NOT NULL DEFAULT 90,
  loa_m REAL,
  draught_m REAL,
  pilot_required INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','CANCELLED','COMPLETED')),
  source TEXT NOT NULL DEFAULT 'MANUAL',
  first_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pilots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  grade TEXT NOT NULL,                   -- pilot class; limits come from config.pilotClassLimits
  trainee INTEGER NOT NULL DEFAULT 0,
  areas TEXT NOT NULL,                   -- JSON array of authorised areas (sample data)
  active INTEGER NOT NULL DEFAULT 1,
  availability_updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS availability (
  id TEXT PRIMARY KEY,
  pilot_id TEXT NOT NULL REFERENCES pilots(id),
  kind TEXT NOT NULL CHECK (kind IN ('ON_DUTY','UNAVAILABLE')),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS allocations (
  id TEXT PRIMARY KEY,
  movement_id TEXT NOT NULL REFERENCES movements(id),
  pilot_id TEXT NOT NULL REFERENCES pilots(id),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','CONFIRMED','SUPERSEDED','CANCELLED')),
  previous_allocation_id TEXT REFERENCES allocations(id),
  needs_review INTEGER NOT NULL DEFAULT 0,
  review_reasons TEXT NOT NULL DEFAULT '[]',
  exceptions TEXT NOT NULL DEFAULT '[]',  -- overridden checks with reason
  warnings TEXT NOT NULL DEFAULT '[]',
  comm_status TEXT NOT NULL DEFAULT 'NOT_SENT' CHECK (comm_status IN ('NOT_SENT','SENT','ACKNOWLEDGED','DECLINED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  confirmed_by TEXT,
  ended_at TEXT,
  end_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

-- One active allocation per movement, enforced by the database (concurrent creates).
CREATE UNIQUE INDEX IF NOT EXISTS ux_active_allocation
  ON allocations(movement_id) WHERE status IN ('DRAFT','CONFIRMED');

CREATE TABLE IF NOT EXISTS audit_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  movement_id TEXT,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  details_json TEXT
);

-- Audit is append-only.
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
`;

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
