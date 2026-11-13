import { readFileSync } from 'node:fs';
import { openDb } from './db.js';
import { seed } from './seed.js';

const defaultConfig = JSON.parse(readFileSync(new URL('./config/rules.json', import.meta.url), 'utf8'));

/** Build an application context. `now` is injectable for tests. */
export function createContext({ dbPath = ':memory:', withSeed = true, now = () => Date.now(), config = defaultConfig } = {}) {
  const db = openDb(dbPath);
  const empty = db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0;
  if (withSeed && empty) seed(db, now());
  return { db, config, now };
}
