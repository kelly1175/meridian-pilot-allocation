// Create (or reset) a persistent sample database: node scripts/seed.js [path]
import { rmSync } from 'node:fs';
import { createContext } from '../src/app.js';

const path = process.argv[2] ?? process.env.MERIDIAN_DB ?? 'meridian.db';
for (const f of [path, `${path}-wal`, `${path}-shm`]) rmSync(f, { force: true });
createContext({ dbPath: path });
console.log(`Seeded sample data into ${path}. Start with: MERIDIAN_DB=${path} npm start`);
