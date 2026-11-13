import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createContext } from '../src/app.js';
import { buildHandler } from '../src/server.js';

let server; let base;
before(async () => {
  server = createServer(buildHandler(createContext()));
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const call = (path, { user, method = 'GET', body } = {}) => fetch(base + path, {
  method,
  headers: { 'content-type': 'application/json', ...(user ? { 'x-meridian-user': user } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

test('serves the UI', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Meridian/);
});

test('rejects unknown users', async () => {
  assert.equal((await call('/api/movements')).status, 401);
});

test('allocator can list movements and gets 403 on supervisor actions', async () => {
  const list = await call('/api/movements', { user: 'alex' });
  assert.equal(list.status, 200);
  assert.ok((await list.json()).length > 0);
  const res = await call('/api/movements/MOV-001', { user: 'alex', method: 'PATCH', body: { version: 1, changes: {} } });
  assert.equal(res.status, 403);
});

test('blocked allocation returns 422 with check details', async () => {
  const res = await call('/api/allocations', { user: 'alex', method: 'POST', body: { movementId: 'MOV-005', pilotId: 'P08' } });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error, 'ALLOCATION_BLOCKED');
  assert.ok(body.details.checks.length > 0);
});
