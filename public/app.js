// Meridian Pilot Allocation — allocator workspace (vanilla JS, no build step).
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const time = (iso) => iso ? `${iso.slice(5, 10).replace('-', '/')} ${iso.slice(11, 16)}` : '—';
const LABEL = { UNALLOCATED: 'Unallocated', DRAFT: 'Draft', CONFIRMED: 'Confirmed', NEEDS_REVIEW: 'Needs review', CANCELLED: 'Cancelled',
  NOT_REQUIRED: 'No pilot req.', COMPLETED: 'Completed', ELIGIBLE: 'Eligible', WARNING: 'Warnings', EXCEPTION_REQUIRED: 'Exception needed',
  BLOCKED: 'Blocked', NOT_SENT: 'Not sent', SENT: 'Sent', ACKNOWLEDGED: 'Acknowledged', DECLINED: 'Declined' };
const badge = (s, prefix = 's') => `<span class="badge ${prefix}-${esc(s)}">${esc(LABEL[s] ?? s)}</span>`;

const state = { user: null, me: null, config: null, board: [], selected: null, tab: 'board' };

// ---------- API ----------
class ApiError extends Error { constructor(status, body) { super(body.message); this.status = status; this.body = body; } }
async function api(path, { method = 'GET', body, raw } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'x-meridian-user': state.user ?? '', 'content-type': raw ? 'text/csv' : 'application/json' },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
const can = (p) => state.me?.permissions.includes(p);

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3500);
}
function handleError(err) {
  if (!(err instanceof ApiError)) { console.error(err); return toast('Unexpected error'); }
  if (err.status === 409) { toast(`${err.message}`); return refresh(); }
  toast(err.message);
}

// ---------- shell ----------
async function init() {
  const users = await api('/api/users');
  state.config = await api('/api/config');
  let saved = null;
  try { saved = localStorage.getItem('meridian.user'); } catch {}
  state.user = users.some((u) => u.id === saved) ? saved : users.find((u) => u.role === 'ALLOCATOR')?.id;
  $('#user').innerHTML = users.map((u) => `<option value="${u.id}" ${u.id === state.user ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
  $('#user').onchange = async (e) => {
    state.user = e.target.value;
    try { localStorage.setItem('meridian.user', state.user); } catch {}
    await loadMe(); showTab('board');
  };
  for (const id of ['#f-area', '#f-window', '#f-unresolved']) $(id).onchange = loadBoard;
  await loadMe();
  showTab('board');
  setInterval(() => { if (state.tab === 'board' && !$('#dlg').open) refresh(true); }, 15000);
}

async function loadMe() {
  state.me = await api('/api/me');
  const tabs = [['board', 'Movement board', 'movements:view'], ['pilots', 'Pilot availability', 'pilots:view'],
    ['import', 'Data import', 'movements:import'], ['metrics', 'Metrics', 'metrics:view'], ['audit', 'Audit log', 'audit:view']]
    .filter(([, , p]) => can(p));
  $('#tabs').innerHTML = tabs.map(([k, l]) => `<button role="tab" data-tab="${k}">${l}</button>`).join('');
  $('#tabs').onclick = (e) => e.target.dataset.tab && showTab(e.target.dataset.tab);
}

function showTab(tab) {
  state.tab = tab;
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${tab}`; });
  ({ board: loadBoard, pilots: loadPilots, import: renderImport, metrics: loadMetrics, audit: loadAudit })[tab]().catch(handleError);
}

async function refresh(quiet) {
  await loadBoard();
  if (state.selected) await loadDetail(state.selected, quiet);
}

// ---------- board ----------
async function loadBoard() {
  const hrs = Number($('#f-window').value);
  const q = new URLSearchParams({
    area: $('#f-area').value,
    to: new Date(Date.now() + hrs * 3600_000).toISOString(),
    unresolved: $('#f-unresolved').checked ? '1' : '',
  });
  state.board = await api(`/api/movements?${q}`);
  const counts = {};
  state.board.forEach((m) => { counts[m.allocation_status] = (counts[m.allocation_status] ?? 0) + 1; });
  $('#summary').innerHTML = ['UNALLOCATED', 'NEEDS_REVIEW', 'DRAFT', 'CONFIRMED']
    .filter((s) => counts[s]).map((s) => `${badge(s)}<strong>${counts[s]}</strong>`).join(' ');
  $('#refreshed').textContent = `Updated ${new Date().toTimeString().slice(0, 5)}`;
  const now = new Date().toISOString();
  $('#board tbody').innerHTML = state.board.map((m) => `
    <tr data-id="${m.id}" class="${m.id === state.selected ? 'selected' : ''} ${m.scheduled_start < now ? 'past' : ''}">
      <td>${time(m.scheduled_start)}</td>
      <td><strong>${esc(m.vessel_name)}</strong><div class="muted small">${esc(m.external_ref ?? '')}</div></td>
      <td>${esc(m.movement_type)}</td>
      <td>${esc(m.from_location)} → ${esc(m.to_location)}</td>
      <td>${esc(m.area)}</td>
      <td>${m.loa_m ?? '<span class="missing">?</span>'} m / ${m.draught_m ?? '<span class="missing">?</span>'} m</td>
      <td>${badge(m.allocation_status)}</td>
      <td>${esc(m.allocation?.pilot_name ?? '')}${m.allocation && state.config.features.communicationStatus && m.allocation.status === 'CONFIRMED'
        ? `<div>${badge(m.allocation.comm_status)}</div>` : ''}</td>
    </tr>`).join('') || '<tr><td colspan="8" class="muted">No movements match the filters.</td></tr>';
  $('#board tbody').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) loadDetail(tr.dataset.id).catch(handleError); };
}

// ---------- detail ----------
async function loadDetail(id) {
  state.selected = id;
  document.querySelectorAll('#board tbody tr').forEach((tr) => tr.classList.toggle('selected', tr.dataset.id === id));
  const d = await api(`/api/movements/${id}`);
  const cands = can('pilots:view') ? await api(`/api/movements/${id}/candidates`) : [];
  renderDetail(d, cands);
}

function renderDetail(d, cands) {
  const m = d.movement; const a = d.allocation;
  const actionable = m.status === 'PLANNED' && m.pilot_required;
  const missing = [m.loa_m == null && 'LOA', m.draught_m == null && 'draught'].filter(Boolean);
  $('#detail').innerHTML = `
    <section>
      <h2>${esc(m.vessel_name)} ${badge(d.allocation_status)}</h2>
      <div class="muted">${esc(m.movement_type)} · ${esc(m.from_location)} → ${esc(m.to_location)}</div>
      <dl class="kv">
        <dt>Scheduled</dt><dd>${time(m.scheduled_start)} UTC · ${m.duration_minutes} min</dd>
        <dt>Area</dt><dd>${esc(m.area)}</dd>
        <dt>LOA / draught</dt><dd>${m.loa_m ?? '?'} m / ${m.draught_m ?? '?'} m</dd>
        <dt>Reference</dt><dd>${esc(m.external_ref ?? '—')} <span class="muted small">(${esc(m.source)}, v${m.version})</span></dd>
        <dt>Movement status</dt><dd>${esc(m.status)}</dd>
      </dl>
      ${missing.length ? `<div class="callout warn">Missing ${missing.join(' and ')} — suitability cannot be fully checked.</div>` : ''}
      ${can('movements:update') ? `<div class="actions"><button data-act="sim-time">Simulate time change</button>
        ${m.status === 'PLANNED' ? '<button data-act="sim-cancel" class="danger">Simulate movement cancelled</button>' : ''}</div>` : ''}
    </section>
    <section>
      <h3>Current allocation</h3>
      ${a ? allocationCard(a) : `<p class="muted">${actionable ? 'No pilot allocated.' : 'No allocation required.'}</p>`}
    </section>
    ${can('allocations:create') && actionable ? `<section><h3>${a ? 'Reallocate to' : 'Candidate pilots'}</h3>${candList(cands, a)}</section>` : ''}
    ${d.history ? `<section><h3>History</h3>${timeline(d)}</section>` : ''}`;
  $('#detail').onclick = (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    onAction(b.dataset.act, b.dataset, d, cands).catch(handleError);
  };
}

function allocationCard(a) {
  const comm = state.config.features.communicationStatus;
  return `
    <div><strong>${esc(a.pilot_name)}</strong> ${badge(a.status)} ${a.status === 'CONFIRMED' && comm ? badge(a.comm_status) : ''}</div>
    <div class="muted small">Created ${time(a.created_at)} by ${esc(a.created_by)}${a.confirmed_at ? ` · confirmed ${time(a.confirmed_at)} by ${esc(a.confirmed_by)}` : ''}</div>
    ${a.needs_review ? `<div class="callout warn"><strong>Review required</strong><ul>${a.review_reasons.map((r) => `<li>${esc(r.reason)}</li>`).join('')}</ul></div>` : ''}
    ${a.exceptions.length ? `<div class="callout bad"><strong>Authorised exception</strong><ul>${a.exceptions.map((x) => `<li>${esc(x.message)} — “${esc(x.reason)}” (${esc(x.by)})</li>`).join('')}</ul></div>` : ''}
    ${a.warnings.length ? `<details><summary>${a.warnings.length} warning(s) accepted at assignment</summary><ul>${a.warnings.map((w) => `<li>${esc(w.message)}</li>`).join('')}</ul></details>` : ''}
    ${can('allocations:create') ? `<div class="actions">
      ${a.status === 'DRAFT' ? `<button class="primary" data-act="confirm" ${a.needs_review ? 'disabled title="Resolve review first"' : ''}>Confirm</button>` : ''}
      ${a.needs_review ? '<button data-act="review">Mark reviewed</button>' : ''}
      <button data-act="cancel" class="danger">Cancel allocation</button>
      ${a.status === 'CONFIRMED' && comm ? `<button data-act="comm" data-status="SENT">Mark sent</button>
        <button data-act="comm" data-status="ACKNOWLEDGED">Pilot acknowledged</button>
        <button data-act="comm" data-status="DECLINED">Pilot declined</button>` : ''}
    </div>` : ''}`;
}

function candList(cands, a) {
  return cands.filter((c) => !c.is_current).map((c, i) => `
    <div class="cand">
      <header><span class="name">${esc(c.pilot.name)}</span><span class="muted small">${esc(c.pilot.grade)}</span>${badge(c.outcome, 'o')}
        <button data-act="${a ? 'reallocate' : 'assign'}" data-i="${i}" ${c.outcome === 'BLOCKED' ? 'disabled' : ''}>${a ? 'Reallocate' : 'Assign'}</button></header>
      ${c.checks.length ? `<ul>${c.checks.map((k) => `<li class="${k.severity}">${esc(k.message)}${k.overridableBy.length && k.severity === 'BLOCK' ? ` <em>(exception: ${k.overridableBy.join(', ').toLowerCase()})</em>` : ''}</li>`).join('')}</ul>` : ''}
    </div>`).join('') || '<p class="muted">No pilots configured.</p>';
}

function timeline(d) {
  return `<ul class="timeline">${[...d.history].reverse().map((e) => `
    <li><div><span class="what">${esc(e.action.replaceAll('_', ' ').toLowerCase())}</span> · ${esc(e.actor)} <span class="muted">(${esc(e.actor_role.toLowerCase())})</span></div>
      <div class="muted small">${time(e.at)} UTC${e.reason ? ` · “${esc(e.reason)}”` : ''}</div>
      ${e.before || e.after ? `<div class="small">${describe(e)}</div>` : ''}
      ${e.details?.reasons ? `<div class="small">${e.details.reasons.map(esc).join('<br>')}</div>` : ''}</li>`).join('')}</ul>`;
}
function describe(e) {
  const f = (o) => o ? Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'string' && v.includes('T') && v.endsWith('Z') ? time(v) : v}`).join(', ') : '';
  return `${e.before ? `<span class="muted">${esc(f(e.before))}</span> → ` : ''}${esc(f(e.after))}`;
}

// ---------- actions ----------
async function onAction(act, data, d, cands) {
  const a = d.allocation; const m = d.movement;
  const visible = cands.filter((c) => !c.is_current);
  if (act === 'assign' || act === 'reallocate') {
    const c = visible[Number(data.i)];
    const input = await allocationDialog(c, act === 'reallocate');
    if (!input) return;
    const common = { pilotId: c.pilot.id, confirm: input.confirm, acceptWarnings: input.acceptWarnings, overrideReason: input.overrideReason };
    if (act === 'assign') await api('/api/allocations', { method: 'POST', body: { movementId: m.id, movementVersion: m.version, ...common } });
    else await api(`/api/allocations/${a.id}/reallocate`, { method: 'POST', body: { version: a.version, reason: input.reason, reasonCategory: input.reasonCategory, ...common } });
    toast(`${c.pilot.name} ${act === 'assign' ? 'assigned' : 'reallocated'}${input.confirm ? ' and confirmed' : ' as draft'}`);
  } else if (act === 'confirm') {
    await api(`/api/allocations/${a.id}/confirm`, { method: 'POST', body: { version: a.version } }); toast('Allocation confirmed');
  } else if (act === 'review') {
    const r = await formDialog('Mark reviewed', `<p>Confirm ${esc(a.pilot_name)} remains suitable after the change.</p><label>Note<input name="note" placeholder="Optional"></label>`);
    if (!r) return;
    await api(`/api/allocations/${a.id}/review`, { method: 'POST', body: { version: a.version, note: r.note } }); toast('Review cleared');
  } else if (act === 'cancel') {
    const r = await formDialog('Cancel allocation', `<p>The allocation record and history are kept.</p>${reasonFields()}`, 'Cancel allocation');
    if (!r) return;
    await api(`/api/allocations/${a.id}/cancel`, { method: 'POST', body: { version: a.version, reason: r.reason, reasonCategory: r.reasonCategory } });
    toast('Allocation cancelled');
  } else if (act === 'comm') {
    await api(`/api/allocations/${a.id}/communication`, { method: 'POST', body: { version: a.version, status: data.status } });
    toast(`Communication: ${LABEL[data.status]}`);
  } else if (act === 'sim-time') {
    const r = await formDialog('Simulate source change: new time', `<p class="muted">Stands in for a movement-feed update until integration is agreed.</p>
      <label>New start (UTC)<input name="t" type="datetime-local" required value="${new Date(Date.parse(m.scheduled_start) + 90 * 60_000).toISOString().slice(0, 16)}"></label>`);
    if (!r) return;
    await api(`/api/movements/${m.id}`, { method: 'PATCH', body: { version: m.version, changes: { scheduled_start: `${r.t}:00Z` } } });
    toast('Movement time changed');
  } else if (act === 'sim-cancel') {
    if (!await formDialog('Simulate source change', '<p>Mark this movement as cancelled in the source system?</p>')) return;
    await api(`/api/movements/${m.id}`, { method: 'PATCH', body: { version: m.version, changes: { status: 'CANCELLED' } } });
    toast('Movement cancelled');
  }
  await refresh();
}

function reasonFields() {
  return `<label>Reason category<select name="reasonCategory" required>${state.config.reasonCategories
    .map((c) => `<option value="${c}">${c.replaceAll('_', ' ').toLowerCase()}</option>`).join('')}</select></label>
    <label>Reason<input name="reason" required placeholder="What changed and why"></label>`;
}

async function allocationDialog(c, isRealloc) {
  const warns = c.checks.filter((k) => k.severity === 'WARN');
  const excs = c.checks.filter((k) => k.severity === 'BLOCK');
  const body = `
    <p><strong>${esc(c.pilot.name)}</strong> · ${esc(c.pilot.grade)} · max ${c.pilot.max_loa_m} m LOA / ${c.pilot.max_draught_m} m draught</p>
    ${excs.length ? `<div class="callout bad"><strong>Authorised exception required</strong><ul>${excs.map((k) => `<li>${esc(k.message)}</li>`).join('')}</ul></div>
      <label>Exception reason<input name="overrideReason" required></label>` : ''}
    ${warns.length ? `<div class="callout warn"><strong>Warnings</strong><ul>${warns.map((k) => `<li>${esc(k.message)}</li>`).join('')}</ul></div>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="acceptWarnings" required> I have reviewed these warnings</label>` : ''}
    ${isRealloc ? reasonFields() : ''}
    <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="confirm"> Confirm immediately (otherwise saved as draft)</label>`;
  const r = await formDialog(isRealloc ? 'Reallocate pilot' : 'Assign pilot', body, isRealloc ? 'Reallocate' : 'Assign');
  if (!r) return null;
  return { ...r, confirm: r.confirm === 'on', acceptWarnings: r.acceptWarnings === 'on' };
}

function formDialog(title, html, okLabel = 'OK') {
  const dlg = $('#dlg'); const form = $('#dlg-form');
  form.innerHTML = `<h2>${esc(title)}</h2>${html}<div class="row"><button value="cancel" formnovalidate>Back</button><button class="primary" value="ok">${esc(okLabel)}</button></div>`;
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.onclose = () => resolve(dlg.returnValue === 'ok' ? Object.fromEntries(new FormData(form)) : null);
  });
}

// ---------- pilots ----------
async function loadPilots() {
  const pilots = await api('/api/pilots');
  const from = Date.now() - 12 * 3600_000; const span = 48 * 3600_000;
  const pos = (s, e) => {
    const l = Math.max(0, (Date.parse(s) - from) / span * 100); const r = Math.min(100, (Date.parse(e) - from) / span * 100);
    return `left:${l}%;width:${Math.max(0.5, r - l)}%`;
  };
  const nowPos = (12 / 48) * 100;
  $('#view-pilots').innerHTML = `
    <p class="muted">Availability −12h to +36h. Green = on duty, red = unavailable, blue = assignment. Line = now.</p>
    <div class="board-wrap"><table><thead><tr><th style="width:220px">Pilot</th><th>Limits / areas</th><th style="width:50%">Timeline</th></tr></thead><tbody>
    ${pilots.map((p) => `<tr>
      <td><strong>${esc(p.name)}</strong><div class="muted small">${esc(p.grade)}</div>
        ${p.availability_stale ? `<span class="badge s-NEEDS_REVIEW" title="Last updated ${esc(p.availability_updated_at)}">Availability may be outdated</span>` : ''}</td>
      <td>${p.max_loa_m} m / ${p.max_draught_m} m<div class="muted small">${p.areas.join(', ')}</div></td>
      <td><div class="bar">${p.availability.map((b) => `<span class="${b.kind}" style="${pos(b.start_at, b.end_at)}" title="${esc(b.note ?? b.kind)}">${esc(b.note ?? '')}</span>`).join('')}
        ${p.assignments.map((j) => `<span class="JOB" style="${pos(j.scheduled_start, new Date(Date.parse(j.scheduled_start) + j.duration_minutes * 60_000).toISOString())}" title="${esc(j.vessel_name)} (${j.status})"></span>`).join('')}
        <span class="nowline" style="left:${nowPos}%"></span></div>
        ${can('pilots:update_availability') ? `<button class="small" data-pilot="${p.id}" data-name="${esc(p.name)}">Record unavailability</button>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>`;
  $('#view-pilots').onclick = async (e) => {
    const b = e.target.closest('button[data-pilot]'); if (!b) return;
    const start = new Date(Date.now() + 3600_000).toISOString().slice(0, 16);
    const end = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16);
    const r = await formDialog(`Record unavailability: ${b.dataset.name}`, `
      <label>From (UTC)<input type="datetime-local" name="start" required value="${start}"></label>
      <label>To (UTC)<input type="datetime-local" name="end" required value="${end}"></label>
      <label>Note<input name="note" placeholder="e.g. Sick, training"></label>`, 'Save');
    if (!r) return;
    try {
      const res = await api(`/api/pilots/${b.dataset.pilot}/unavailability`, { method: 'POST', body: { start: `${r.start}:00Z`, end: `${r.end}:00Z`, note: r.note } });
      toast(res.flaggedAllocations.length ? `${res.flaggedAllocations.length} allocation(s) flagged for review` : 'Saved — no allocations affected');
      loadPilots();
    } catch (err) { handleError(err); }
  };
}

// ---------- import ----------
function renderImport() {
  const sample = `external_ref,vessel_name,imo,movement_type,from_location,to_location,area,scheduled_start,duration_minutes,loa_m,draught_m,pilot_required
VTS-30001,LUNA BAY,9300001,ARRIVAL,Fairway Buoy,Berth 5,INNER,${new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 16)}:00Z,75,150,8.2,yes`;
  $('#view-import').innerHTML = `
    <div class="card">
      <h3>Controlled movement import (interim)</h3>
      <p class="muted">Tactical path while movement-system integration is agreed (decision D-05). Rows are matched on <code>external_ref</code>.
      Changes to movements with allocations flag them for review. Planned movements in the file's time range that are missing from the file are reported, not deleted.</p>
      <textarea id="csv">${esc(sample)}</textarea>
      <div class="actions"><button class="primary" id="run-import">Import</button></div>
      <div id="import-result"></div>
    </div>`;
  $('#run-import').onclick = async () => {
    try {
      const r = await api('/api/import/movements', { method: 'POST', raw: $('#csv').value });
      $('#import-result').innerHTML = `<dl class="kv"><dt>Created</dt><dd>${r.created.length}</dd><dt>Updated</dt><dd>${r.updated.length}</dd>
        <dt>Unchanged</dt><dd>${r.unchanged.length}</dd><dt>Rejected</dt><dd>${r.rejected.map((x) => `line ${x.line}: ${esc(x.error)}`).join('<br>') || 0}</dd>
        <dt>Not in file</dt><dd>${r.notInFile.map((x) => `${esc(x.external_ref)} ${esc(x.vessel_name)}`).join('<br>') || 0}</dd></dl>`;
      toast('Import complete');
    } catch (err) { handleError(err); }
  };
}

// ---------- metrics / audit ----------
async function loadMetrics() {
  const m = await api('/api/metrics');
  const cats = Object.entries(m.reallocationsAndCancellations.byCategory);
  $('#view-metrics').innerHTML = `<p class="muted">${esc(m._note)}</p><div class="grid">
    <div class="card"><h3>Time to allocate (median)</h3><div class="metric">${m.timeToAllocateMinutes.median == null ? '—' : `${Math.round(m.timeToAllocateMinutes.median)} min`}</div><div class="muted small">First seen → first confirmation · n=${m.timeToAllocateMinutes.n}</div></div>
    <div class="card"><h3>Unallocated upcoming</h3><div class="metric">${m.unallocatedUpcoming}</div><div class="muted small">Pilot-required movements in board window</div></div>
    <div class="card"><h3>Adoption</h3><div class="metric">${m.adoption.rate == null ? '—' : `${Math.round(m.adoption.rate * 100)}%`}</div><div class="muted small">${m.adoption.confirmedInMeridian} of ${m.adoption.eligibleMovements} eligible movements confirmed in Meridian</div></div>
    <div class="card"><h3>Reallocation &amp; rework</h3><div class="metric">${m.reallocationsAndCancellations.total}</div><div class="muted small">${cats.map(([k, v]) => `${k.replaceAll('_', ' ').toLowerCase()}: ${v}`).join(' · ') || 'None yet'}</div></div>
    <div class="card"><h3>Authorised exceptions</h3><div class="metric">${m.authorisedExceptions}</div></div>
  </div>`;
}

async function loadAudit() {
  const rows = await api('/api/audit');
  $('#view-audit').innerHTML = `<p class="muted">Append-only. Latest 200 events.</p><div class="board-wrap"><table><thead><tr><th>Time (UTC)</th><th>Actor</th><th>Action</th><th>Entity</th><th>Movement</th><th>Reason</th></tr></thead><tbody>
    ${rows.map((e) => `<tr><td>${time(e.at)}</td><td>${esc(e.actor)} <span class="muted small">${esc(e.actor_role)}</span></td><td>${esc(e.action)}</td>
      <td>${esc(e.entity_type)} ${esc(e.entity_id)}</td><td>${esc(e.movement_id ?? '')}</td><td>${esc(e.reason ?? '')}</td></tr>`).join('')}</tbody></table></div>`;
}

init().catch(handleError);
