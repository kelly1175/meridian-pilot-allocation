import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext } from './app.js';
import { AppError } from './errors.js';
import * as svc from './service.js';
import { PERMISSIONS } from './roles.js';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

export function buildHandler(ctx) {
  const routes = [
    ['GET', /^\/api\/health$/, () => ({ ok: true })],
    ['GET', /^\/api\/users$/, () => ctx.db.prepare('SELECT id, name, role FROM users ORDER BY role, name').all()],
    ['GET', /^\/api\/me$/, ({ user }) => ({ ...user, permissions: PERMISSIONS[user.role] })],
    ['GET', /^\/api\/config$/, () => ({ ...ctx.config, reasonCategories: svc.REASON_CATEGORIES })],
    ['GET', /^\/api\/movements$/, ({ user, query }) => svc.listMovements(ctx, user, {
      area: query.get('area') || undefined, from: query.get('from') || undefined, to: query.get('to') || undefined,
      unresolved: query.get('unresolved') === '1' })],
    ['GET', /^\/api\/movements\/([\w-]+)$/, ({ user, params }) => svc.getMovementDetail(ctx, user, params[0])],
    ['PATCH', /^\/api\/movements\/([\w-]+)$/, ({ user, params, body }) => svc.updateMovement(ctx, user, { movementId: params[0], ...body })],
    ['GET', /^\/api\/movements\/([\w-]+)\/candidates$/, ({ user, params }) => svc.candidates(ctx, user, params[0])],
    ['POST', /^\/api\/import\/movements$/, ({ user, raw }) => svc.importMovementsCsv(ctx, user, raw)],
    ['GET', /^\/api\/pilots$/, ({ user }) => svc.listPilots(ctx, user)],
    ['POST', /^\/api\/pilots\/([\w-]+)\/unavailability$/, ({ user, params, body }) => svc.addUnavailability(ctx, user, { pilotId: params[0], ...body })],
    ['POST', /^\/api\/allocations$/, ({ user, body }) => svc.createAllocation(ctx, user, body)],
    ['POST', /^\/api\/allocations\/([\w-]+)\/confirm$/, ({ user, params, body }) => svc.confirmAllocation(ctx, user, { allocationId: params[0], ...body })],
    ['POST', /^\/api\/allocations\/([\w-]+)\/reallocate$/, ({ user, params, body }) => svc.reallocate(ctx, user, { allocationId: params[0], ...body })],
    ['POST', /^\/api\/allocations\/([\w-]+)\/cancel$/, ({ user, params, body }) => svc.cancelAllocation(ctx, user, { allocationId: params[0], ...body })],
    ['POST', /^\/api\/allocations\/([\w-]+)\/review$/, ({ user, params, body }) => svc.markReviewed(ctx, user, { allocationId: params[0], ...body })],
    ['POST', /^\/api\/allocations\/([\w-]+)\/communication$/, ({ user, params, body }) => svc.setCommStatus(ctx, user, { allocationId: params[0], ...body })],
    ['GET', /^\/api\/audit$/, ({ user, query }) => svc.listAudit(ctx, user, { movementId: query.get('movementId') || undefined })],
    ['GET', /^\/api\/metrics$/, ({ user }) => svc.metrics(ctx, user)],
  ];

  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (!url.pathname.startsWith('/api/')) return await serveStatic(url.pathname, res);
      const match = routes.find(([m, re]) => m === req.method && re.test(url.pathname));
      if (!match) throw new AppError(404, 'NOT_FOUND', 'Route not found');
      const raw = await readBody(req);
      const isJson = (req.headers['content-type'] ?? '').includes('application/json');
      let body = {};
      if (isJson && raw) {
        try { body = JSON.parse(raw); } catch { throw new AppError(400, 'BAD_REQUEST', 'Invalid JSON body'); }
      }
      // STUB IDENTITY: replace with the agreed identity and access service (dependency D-08).
      const user = ctx.db.prepare('SELECT * FROM users WHERE id = ?').get(req.headers['x-meridian-user'] ?? '');
      if (!user && !/^\/api\/(health|users|config)$/.test(url.pathname)) throw new AppError(401, 'UNAUTHENTICATED', 'Unknown user');
      const result = match[2]({ user, params: url.pathname.match(match[1]).slice(1), query: url.searchParams, body, raw });
      send(res, 200, result);
    } catch (err) {
      if (err instanceof AppError) return send(res, err.status, { error: err.code, message: err.message, details: err.details });
      console.error(err);
      send(res, 500, { error: 'INTERNAL', message: 'Unexpected error' });
    }
  };
}

function send(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { data += c; if (data.length > 2_000_000) reject(new AppError(413, 'TOO_LARGE', 'Body too large')); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function serveStatic(pathname, res) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) throw new AppError(404, 'NOT_FOUND', 'Not found');
  try {
    const content = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(content);
  } catch {
    throw new AppError(404, 'NOT_FOUND', 'Not found');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  const ctx = createContext({ dbPath: process.env.MERIDIAN_DB ?? ':memory:' });
  createServer(buildHandler(ctx)).listen(port, () => {
    console.log(`Meridian Pilot Allocation running at http://localhost:${port}`);
  });
}
