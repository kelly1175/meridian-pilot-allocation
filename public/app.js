// Meridian Pilot Allocation — allocator workspace (vanilla JS, no build step).
// All rule outcomes come from the server; rules are illustrative (src/config/rules.json).
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const hm = (iso) => iso ? iso.slice(11, 16) : '—';
const time = (iso) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}` : '—';
const dayLabel = (ms) => { const d = new Date(ms); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const addMin = (iso, min) => new Date(Date.parse(iso) + min * 60_000).toISOString();

const LABEL = {
  UNALLOCATED: 'Unallocated', DRAFT: 'Draft', CONFIRMED: 'Confirmed', NEEDS_REVIEW: 'Requires review', CANCELLED: 'Cancelled',
  NOT_REQUIRED: 'No pilot req.', COMPLETED: 'Completed', SUPERSEDED: 'Superseded',
  PASSES: 'Passes configured checks', WARNING: 'Warnings to review', DRAFT_ONLY: 'Draft only — cannot confirm',
  EXCEPTION_REQUIRED: 'Needs authorised exception', BLOCKED: 'Blocked',
  NOT_SENT: 'Not sent', SENT: 'Sent (simulated)', AWAITING: 'Awaiting response', ACKNOWLEDGED: 'Acknowledged', DECLINED: 'Declined',
};
const badge = (s, prefix = 's') => `<span class="badge ${prefix}-${esc(s)}">${esc(LABEL[s] ?? s)}</span>`;
const traineeBadge = '<span class="badge trainee" title="Trainee pilot. Supervision requirements are not defined in this prototype.">TRAINEE</span>';
const HELP = 'Based on the prototype’s configured rules and recorded information. The allocator retains the decision.';

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
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 4500);
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

async function refresh() {
  await loadBoard();
  if (state.selected) await loadDetail(state.selected);
}

// ---------- board ----------
const missingChips = (m) => m.missing_fields.map((f) => `<span class="badge missing">${esc(f.label)} missing</span>`).join(' ');

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
  $('#refreshed').textContent = `Updated ${new Date().toISOString().slice(11, 16)} UTC`;
  const now = new Date().toISOString();
  const dim = (v, field) => v ?? `<span class="badge missing">${field} missing</span>`;
  $('#board tbody').innerHTML = state.board.map((m) => `
    <tr data-id="${m.id}" class="${m.id === state.selected ? 'selected' : ''} ${m.scheduled_start < now ? 'past' : ''}">
      <td>${time(m.scheduled_start)}<div class="muted small">to ${hm(addMin(m.scheduled_start, m.duration_minutes))}</div></td>
      <td><strong>${esc(m.vessel_name)}</strong><div class="muted small">${esc(m.external_ref ?? '')}</div></td>
      <td>${esc(m.movement_type)}</td>
      <td>${esc(m.from_location)} → ${esc(m.to_location)}</td>
      <td>${esc(m.area)}</td>
      <td>${m.loa_m != null ? `${m.loa_m} m` : dim(null, 'LOA')} / ${m.draught_m != null ? `${m.draught_m} m` : dim(null, 'Draught')}</td>
      <td>${badge(m.allocation_status)}</td>
      <td>${esc(m.allocation?.pilot_name ?? '')}${m.allocation?.pilot_trainee ? ` ${traineeBadge}` : ''}${m.allocation && state.config.features.communicationStatus && m.allocation.status === 'CONFIRMED'
        ? `<div>${commBadges(m.allocation.comm_status, true)}</div>` : ''}</td>
    </tr>`).join('') || '<tr><td colspan="8" class="muted">No movements match the filters.</td></tr>';
  $('#board tbody').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) loadDetail(tr.dataset.id).catch(handleError); };
}

/** Communication (notification sent?) and acknowledgement (pilot response) shown as separate states. */
function commBadges(comm, compact) {
  const sent = comm === 'NOT_SENT' ? 'NOT_SENT' : 'SENT';
  const ack = comm === 'NOT_SENT' ? null : comm === 'SENT' ? 'AWAITING' : comm;
  if (compact) return `${badge(sent)}${ack ? ` ${badge(ack)}` : ''}`;
  return `<dl class="state-grid">
    <dt>Notification</dt><dd>${badge(sent)}</dd>
    <dt>Pilot response</dt><dd>${ack ? badge(ack) : '<span class="muted">—</span>'}</dd></dl>`;
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
  const missing = m.missing_fields;
  $('#detail').innerHTML = `
    <section>
      <h2>${esc(m.vessel_name)} ${badge(d.allocation_status)}</h2>
      <div class="muted">${esc(m.movement_type)} · ${esc(m.from_location)} → ${esc(m.to_location)}</div>
      <dl class="kv">
        <dt>Scheduled</dt><dd>${time(m.scheduled_start)}–${hm(addMin(m.scheduled_start, m.duration_minutes))} UTC · ${m.duration_minutes} min</dd>
        <dt>Area</dt><dd>${esc(m.area)}</dd>
        <dt>LOA</dt><dd>${m.loa_m != null ? `${m.loa_m} m` : '<span class="badge missing">LOA missing</span>'}</dd>
        <dt>Draught</dt><dd>${m.draught_m != null ? `${m.draught_m} m` : '<span class="badge missing">Draught missing</span>'}</dd>
        <dt>Reference</dt><dd>${esc(m.external_ref ?? '—')} <span class="muted small">(${esc(m.source)}, v${m.version})</span></dd>
        <dt>Movement status</dt><dd>${esc(m.status)}</dd>
      </dl>
      ${missing.length ? `<div class="callout warn"><strong>${missing.map((f) => esc(f.label)).join(' and ')} missing.</strong>
        The related suitability check cannot be completed, so assignments can be drafted but not confirmed.
        To resolve, obtain the ${missing.map((f) => esc(f.label.toLowerCase())).join(' and ')} from the movement source${can('movements:update') ? ' (in this prototype: <em>Edit sample movement</em> below)' : ''}.
        <div class="assumption">Prototype assumption: confirmation requires the information needed to complete configured suitability checks.</div></div>` : ''}
      ${can('movements:update') ? `<div class="actions"><button data-act="edit-movement">Edit sample movement</button>
        ${m.status === 'PLANNED' ? '<button data-act="sim-cancel" class="danger">Simulate movement cancelled</button>' : ''}
        <span class="badge sample" title="Stands in for an update from the movement source system">Sample-data control</span></div>` : ''}
    </section>
    <section>
      <h3>Current allocation</h3>
      ${a ? allocationCard(a) : `<p class="muted">${actionable ? 'No pilot allocated.' : 'No allocation required.'}</p>`}
    </section>
    ${can('allocations:create') && actionable ? `<section><h3>${a ? 'Reallocate to' : 'Candidate pilots'}</h3>
      <p class="help" id="cand-help">${HELP}</p>${candList(cands, a)}</section>` : ''}
    ${d.history ? `<section><h3>History</h3>${auditList(d.history, false)}</section>` : ''}`;
  $('#detail').onclick = (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    onAction(b.dataset.act, b.dataset, d, cands).catch(handleError);
  };
}

/** Effect of a check, in words (meaning never relies on colour alone). */
function sevLabel(c, role) {
  if (c.severity === 'WARN') return 'Warning';
  if (c.severity === 'CONFIRM_HOLD') return 'Prevents confirmation';
  if (c.overridableBy?.length) return c.overridableBy.includes(role) ? 'Needs authorised exception' : `Blocks (${c.overridableBy.join(', ').toLowerCase()} exception possible)`;
  return 'Blocks';
}
const checkItem = (c) => `<li class="${c.severity}"><span class="sev">${esc(sevLabel(c, state.me.role))}</span>${esc(c.message)}</li>`;

function allocationCard(a) {
  const comm = state.config.features.communicationStatus;
  const open = (a.current_checks ?? []).filter((c) => !c.accepted_exception);
  const blocking = open.filter((c) => c.severity === 'BLOCK');
  const holds = open.filter((c) => c.severity === 'CONFIRM_HOLD');
  const cannotConfirm = a.status === 'DRAFT' && (blocking.length || holds.length || a.needs_review);
  const why = a.needs_review ? 'Resolve the review first' : [...blocking, ...holds].map((c) => c.message).join(' ');
  return `
    <div><strong>${esc(a.pilot_name)}</strong> ${a.pilot_trainee ? traineeBadge : ''} ${badge(a.status)}</div>
    <div class="muted small">Created ${time(a.created_at)} UTC by ${esc(a.created_by)}${a.confirmed_at ? ` · confirmed ${time(a.confirmed_at)} UTC by ${esc(a.confirmed_by)}` : ''}</div>
    ${a.needs_review ? `<div class="callout warn"><strong>Requires review.</strong> A change affected this allocation:<ul>${a.review_reasons.map((r) => `<li>${esc(r.reason)}</li>`).join('')}</ul></div>` : ''}
    ${a.status === 'DRAFT' && !a.needs_review && (blocking.length || holds.length) ? `<div class="callout hold" id="confirm-why"><strong>Cannot confirm yet</strong><ul>${[...blocking, ...holds].map(checkItem).join('')}</ul></div>` : ''}
    ${a.exceptions.length ? `<div class="callout bad"><strong>Authorised exception</strong><ul>${a.exceptions.map((x) => `<li>${esc(x.message)} — “${esc(x.reason)}” (${esc(x.by)})</li>`).join('')}</ul></div>` : ''}
    ${a.warnings.length ? `<details><summary>${a.warnings.length} warning(s) acknowledged at assignment</summary><ul>${a.warnings.map((w) => `<li>${esc(w.message)}</li>`).join('')}</ul></details>` : ''}
    ${a.status === 'CONFIRMED' && comm ? commBadges(a.comm_status, false) + '<div class="assumption">Communication is simulated. No message is sent.</div>' : ''}
    ${can('allocations:create') ? `<div class="actions">
      ${a.status === 'DRAFT' ? `<button class="primary" data-act="confirm" ${cannotConfirm ? `disabled title="${esc(why)}" aria-describedby="confirm-why"` : ''}>Confirm</button>` : ''}
      ${a.needs_review ? '<button data-act="review">Mark reviewed</button>' : ''}
      <button data-act="cancel" class="danger">Cancel allocation</button>
      ${a.status === 'CONFIRMED' && comm && a.comm_status === 'NOT_SENT' ? '<button data-act="comm" data-status="SENT">Send notification (simulated)</button>' : ''}
      ${a.status === 'CONFIRMED' && comm && a.comm_status === 'SENT' ? `<button data-act="comm" data-status="ACKNOWLEDGED">Record acknowledgement</button>
        <button data-act="comm" data-status="DECLINED">Record decline</button>` : ''}
    </div>` : ''}`;
}

function limitsText(p) {
  return p.limits ? `≤${p.limits.maxLoaM} m LOA · ≤${p.limits.maxDraughtM} m draught` : 'no configured limits';
}

function candList(cands, a) {
  return cands.filter((c) => !c.is_current).map((c, i) => `
    <div class="cand">
      <header><span class="name">${esc(c.pilot.name)} ${c.pilot.trainee ? traineeBadge : ''}</span><span class="muted small">${esc(c.pilot.grade)}</span>${badge(c.outcome, 'o')}
        <button data-act="${a ? 'reallocate' : 'assign'}" data-i="${i}" ${c.outcome === 'BLOCKED' ? 'disabled' : ''} aria-describedby="cand-help">${a ? 'Reallocate' : 'Assign'}</button></header>
      <div class="muted small">${esc(limitsText(c.pilot))} · areas ${esc(c.pilot.areas.join(', '))}</div>
      ${c.checks.length ? `<ul>${c.checks.map(checkItem).join('')}</ul>` : '<div class="small muted">No configured check raised an issue.</div>'}
    </div>`).join('') || '<p class="muted">No pilots configured.</p>';
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
    const r = await formDialog('Mark reviewed', `<p>Confirm ${esc(a.pilot_name)} remains suitable after the change. The checks are re-run; if the pilot no longer passes, you'll need to reallocate or cancel.</p><label>Note<input name="note" id="review-note" placeholder="Optional"></label>`);
    if (!r) return;
    await api(`/api/allocations/${a.id}/review`, { method: 'POST', body: { version: a.version, note: r.note } }); toast('Review cleared');
  } else if (act === 'cancel') {
    const r = await formDialog('Cancel allocation', `<p>The allocation record and history are kept.</p>${reasonFields()}`, 'Cancel allocation');
    if (!r) return;
    await api(`/api/allocations/${a.id}/cancel`, { method: 'POST', body: { version: a.version, reason: r.reason, reasonCategory: r.reasonCategory } });
    toast('Allocation cancelled');
  } else if (act === 'comm') {
    await api(`/api/allocations/${a.id}/communication`, { method: 'POST', body: { version: a.version, status: data.status } });
    toast({ SENT: 'Notification recorded as sent (simulated — nothing was sent)', ACKNOWLEDGED: 'Pilot acknowledgement recorded', DECLINED: 'Pilot decline recorded — allocation requires review' }[data.status]);
  } else if (act === 'edit-movement') {
    await editMovementDialog(m);
  } else if (act === 'sim-cancel') {
    if (!await formDialog('Sample-data control', '<p>Mark this movement as cancelled, as if the movement source had reported it?</p>')) return;
    await api(`/api/movements/${m.id}`, { method: 'PATCH', body: { version: m.version, changes: { status: 'CANCELLED' } } });
    toast('Movement cancelled');
  }
  await refresh();
}

async function editMovementDialog(m) {
  const startLocal = m.scheduled_start.slice(0, 16);
  const r = await formDialog('Edit sample movement', `
    <p class="callout info">Sample-data control. Stands in for an update from the movement source system. Not a planned feature.</p>
    <label>Start (UTC)<input type="datetime-local" name="start" id="em-start" required value="${startLocal}"></label>
    <div class="shift-row" role="group" aria-label="Shift start time">
      ${[-4, -1, 1, 4].map((h) => `<button type="button" data-shift="${h}">${h > 0 ? '+' : '−'}${Math.abs(h)} h</button>`).join('')}
    </div>
    <label>LOA (m)<input type="number" step="0.1" min="1" name="loa" id="em-loa" value="${m.loa_m ?? ''}" placeholder="Missing"></label>
    <label>Draught (m)<input type="number" step="0.1" min="0.1" name="draught" id="em-draught" value="${m.draught_m ?? ''}" placeholder="Missing"></label>
    <p class="help">Leave LOA or draught empty to record it as missing. Any change to a movement with an allocation flags it for review.</p>`, 'Apply change', (form) => {
    form.querySelectorAll('[data-shift]').forEach((b) => b.addEventListener('click', () => {
      const input = form.querySelector('#em-start');
      input.value = new Date(Date.parse(`${input.value}:00Z`) + Number(b.dataset.shift) * 3600_000).toISOString().slice(0, 16);
    }));
  });
  if (!r) return;
  const changes = {};
  // The time input has minute precision; only treat the start as changed if the minute changed.
  if (r.start !== startLocal) changes.scheduled_start = new Date(`${r.start}:00Z`).toISOString();
  const loa = r.loa === '' ? null : Number(r.loa);
  const dr = r.draught === '' ? null : Number(r.draught);
  if (loa !== m.loa_m) changes.loa_m = loa;
  if (dr !== m.draught_m) changes.draught_m = dr;
  if (!Object.keys(changes).length) return toast('No changes');
  await api(`/api/movements/${m.id}`, { method: 'PATCH', body: { version: m.version, changes } });
  toast('Movement updated. Affected allocations are flagged for review.');
}

function reasonFields() {
  return `<label>Reason category<select name="reasonCategory" id="reason-cat" required>${state.config.reasonCategories
    .map((c) => `<option value="${c}">${c.replaceAll('_', ' ').toLowerCase()}</option>`).join('')}</select></label>
    <label>Reason<input name="reason" id="reason-text" required placeholder="What changed and why"></label>`;
}

async function allocationDialog(c, isRealloc) {
  const warns = c.checks.filter((k) => k.severity === 'WARN');
  const excs = c.checks.filter((k) => k.severity === 'BLOCK');
  const holds = c.checks.filter((k) => k.severity === 'CONFIRM_HOLD');
  const body = `
    <p><strong>${esc(c.pilot.name)}</strong> ${c.pilot.trainee ? traineeBadge : ''} · ${esc(c.pilot.grade)} · ${esc(limitsText(c.pilot))}</p>
    <p class="help">${HELP}</p>
    ${excs.length ? `<div class="callout bad"><strong>Authorised exception required</strong><ul>${excs.map((k) => `<li>${esc(k.message)}</li>`).join('')}</ul></div>
      <label>Exception reason<input name="overrideReason" id="override-reason" required></label>` : ''}
    ${holds.length ? `<div class="callout hold"><strong>Draft only — cannot be confirmed</strong><ul>${holds.map((k) => `<li>${esc(k.message)}</li>`).join('')}</ul></div>` : ''}
    ${warns.length ? `<div class="callout warn"><strong>Warnings</strong><ul>${warns.map((k) => `<li>${esc(k.message)}</li>`).join('')}</ul></div>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="acceptWarnings" id="accept-warnings" required> I have reviewed these warnings</label>` : ''}
    ${isRealloc ? reasonFields() : ''}
    <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="confirm" id="confirm-now" ${holds.length ? 'disabled' : ''}>
      Confirm immediately${holds.length ? ' (not available: see above)' : ' (otherwise saved as draft)'}</label>`;
  const r = await formDialog(isRealloc ? 'Reallocate pilot' : 'Assign pilot', body, isRealloc ? 'Reallocate' : 'Assign');
  if (!r) return null;
  return { ...r, confirm: r.confirm === 'on', acceptWarnings: r.acceptWarnings === 'on' };
}

function formDialog(title, html, okLabel = 'OK', onOpen) {
  const dlg = $('#dlg'); const form = $('#dlg-form');
  form.innerHTML = `<h2>${esc(title)}</h2>${html}<div class="row"><button value="cancel" formnovalidate>Back</button><button class="primary" value="ok">${esc(okLabel)}</button></div>`;
  onOpen?.(form);
  dlg.showModal();
  return new Promise((resolve) => {
    dlg.onclose = () => resolve(dlg.returnValue === 'ok' ? Object.fromEntries(new FormData(form)) : null);
  });
}

// ---------- pilot availability timeline ----------
async function loadPilots() {
  const data = await api('/api/pilots');
  const from = Date.parse(data.from); const to = Date.parse(data.to); const span = to - from;
  const pct = (iso) => Math.min(100, Math.max(0, ((typeof iso === 'number' ? iso : Date.parse(iso)) - from) / span * 100));
  const box = (s, e) => { const l = pct(s); return `left:${l}%;width:${Math.max(0.3, pct(e) - l)}%`; };

  // Ticks every 3 hours on the UTC clock; midnights carry the date.
  const ticks = []; const H = 3600_000;
  for (let t = Math.ceil(from / (3 * H)) * 3 * H; t < to; t += 3 * H) ticks.push(t);
  const midnights = ticks.filter((t) => t % (24 * H) === 0);
  const axis = `<div class="tl-axis" aria-hidden="true">
      <span class="day" style="left:0">${dayLabel(from)} · all times UTC</span>
      ${midnights.map((t) => `<span class="day" style="left:${pct(t)}%">${pct(t) > 90 ? dayLabel(t).split(' ').slice(0, 2).join(' ') : dayLabel(t)}</span>`).join('')}
      ${ticks.map((t) => `<span class="tick" style="left:${pct(t)}%">${new Date(t).toISOString().slice(11, 16)}</span>`).join('')}
      <span class="nowlabel" style="left:${pct(data.now)}%">Now ${hm(data.now)} UTC</span></div>`;
  const grid = ticks.map((t) => `<span class="grid ${t % (24 * H) === 0 ? 'midnight' : ''}" style="left:${pct(t)}%"></span>`).join('');
  const jobLabel = (j) => `${j.vessel_name} (${j.external_ref}) · ${j.needs_review ? 'Requires review, ' : ''}${LABEL[j.status]} · ${time(j.start)}–${hm(j.end)} UTC · transit allowance ${hm(j.occupied_start)}–${hm(j.occupied_end)}`;

  $('#view-pilots').innerHTML = `
    <div class="tl-legend">
      <span><i class="sw" style="background:var(--ok-bg);border-bottom:2px solid var(--ok)"></i>On duty</span>
      <span><i class="sw" style="border:1.5px solid var(--bad);background:repeating-linear-gradient(135deg,var(--bad-bg) 0 4px,transparent 4px 8px)"></i>Unavailable</span>
      <span><i class="sw" style="background:var(--accent);border:2px solid var(--accent)"></i>Confirmed</span>
      <span><i class="sw" style="border:2px dashed var(--accent)"></i>Draft</span>
      <span><i class="sw" style="background:var(--warn-bg);border:2px dashed var(--warn)"></i>Requires review</span>
      <span><i class="sw" style="background:repeating-linear-gradient(90deg,var(--muted) 0 1px,transparent 1px 4px);opacity:.6"></i>Transit allowance (${data.transitAllowanceMinutes} min, illustrative)</span>
      <span><i class="sw" style="width:2px;background:var(--ink)"></i>Now</span>
    </div>
    <div class="board-wrap"><table class="tl-table"><thead><tr><th style="width:200px">Pilot</th><th style="width:170px">Class limits / areas</th>
      <th class="tl-cell">${axis}</th></tr></thead><tbody>
    ${data.pilots.map((p) => `<tr>
      <td><strong>${esc(p.name)}</strong> ${p.trainee ? traineeBadge : ''}<div class="muted small">${esc(p.grade)}</div>
        ${p.trainee ? '<div class="assumption">Supervision requirement: not defined. Prototype assumption: assignments can be drafted, not confirmed.</div>' : ''}
        ${p.availability_stale ? `<span class="badge missing" title="Last updated ${esc(p.availability_updated_at)}">Availability may be outdated</span>` : ''}</td>
      <td class="small">${esc(limitsText(p))}<div class="muted">${p.areas.join(', ')}</div></td>
      <td class="tl-cell">
        <div class="tl-track">${grid}
          ${p.availability.map((b) => `<span class="duty ${b.kind}" style="${box(b.start_at, b.end_at)}" title="${esc(b.kind === 'ON_DUTY' ? 'On duty' : 'Unavailable')} ${time(b.start_at)}–${time(b.end_at)} UTC${b.note ? ` (${esc(b.note)})` : ''}">${b.kind === 'ON_DUTY' ? 'On duty' : `Unavailable${b.note ? ` · ${esc(b.note)}` : ''}`}</span>`).join('')}
          ${p.assignments.map((j) => `<span class="buffer" style="${box(j.occupied_start, j.occupied_end)}"></span>
            <button class="job ${j.status} ${j.needs_review ? 'review' : ''}" style="${box(j.start, j.end)}" data-movement="${j.movement_id}"
              title="${esc(jobLabel(j))}" aria-label="${esc(jobLabel(j))}">${j.needs_review ? '⚠ ' : ''}${j.status === 'DRAFT' ? 'Draft · ' : ''}${esc(j.vessel_name)}</button>`).join('')}
          <span class="nowline" style="left:${pct(data.now)}%" aria-hidden="true"></span>
        </div>
        ${p.assignments.length ? `<ul class="tl-jobs">${p.assignments.map((j) => `<li>${j.needs_review ? '⚠ ' : j.status === 'DRAFT' ? '◌ ' : '● '}<strong>${esc(j.vessel_name)}</strong>
          <span class="muted">${esc(j.external_ref)}</span> · ${j.needs_review ? '<strong>Requires review</strong> · ' : ''}${LABEL[j.status]} · ${time(j.start)}–${hm(j.end)} UTC
          <span class="muted">(± ${data.transitAllowanceMinutes} min transit: ${hm(j.occupied_start)}–${hm(j.occupied_end)})</span></li>`).join('')}</ul>` : ''}
        ${can('pilots:update_availability') ? `<div style="margin-top:6px"><button class="small" data-pilot="${p.id}" data-name="${esc(p.name)}">Record unavailability</button></div>` : ''}
      </td>
    </tr>`).join('')}</tbody></table></div>`;

  $('#view-pilots').onclick = async (e) => {
    const job = e.target.closest('button[data-movement]');
    if (job) { showTab('board'); return loadDetail(job.dataset.movement).catch(handleError); }
    const b = e.target.closest('button[data-pilot]'); if (!b) return;
    const start = new Date(Date.now() + 3600_000).toISOString().slice(0, 16);
    const end = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16);
    const r = await formDialog(`Record unavailability: ${b.dataset.name}`, `
      <p class="callout info">Sample-data control. Stands in for an update from the pilot availability source.</p>
      <label>From (UTC)<input type="datetime-local" name="start" id="un-start" required value="${start}"></label>
      <label>To (UTC)<input type="datetime-local" name="end" id="un-end" required value="${end}"></label>
      <label>Note<input name="note" id="un-note" placeholder="e.g. Sick, training"></label>`, 'Save');
    if (!r) return;
    try {
      const res = await api(`/api/pilots/${b.dataset.pilot}/unavailability`, { method: 'POST', body: { start: `${r.start}:00Z`, end: `${r.end}:00Z`, note: r.note } });
      toast(res.flaggedAllocations.length ? `${res.flaggedAllocations.length} allocation(s) flagged for review` : 'Saved. No allocations affected.');
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

// ---------- metrics ----------
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

// ---------- readable audit ----------
const FIELD = { scheduled_start: 'Start', duration_minutes: 'Duration', loa_m: 'LOA', draught_m: 'Draught', status: 'Status',
  from_location: 'From', to_location: 'To', pilot_required: 'Pilot required' };
function fval(k, v) {
  if (v == null || v === '') return 'missing';
  if (k === 'scheduled_start') return `${time(v)} UTC`;
  if (k === 'loa_m' || k === 'draught_m') return `${v} m`;
  if (k === 'duration_minutes') return `${v} min`;
  return String(v);
}
function eventTitle(e) {
  if (e.action === 'COMMUNICATION_STATUS') {
    return { SENT: 'Notification recorded as sent (simulated)', ACKNOWLEDGED: 'Pilot acknowledgement recorded', DECLINED: 'Pilot decline recorded' }[e.after?.comm_status] ?? 'Communication status changed';
  }
  return {
    ALLOCATION_CREATED: 'Allocation created', ALLOCATION_CONFIRMED: 'Allocation confirmed', ALLOCATION_REASSIGNED: 'Pilot reassigned',
    ALLOCATION_CANCELLED: 'Allocation cancelled', MOVEMENT_UPDATED: 'Movement changed', ALLOCATION_FLAGGED: 'Allocation requires review',
    ALLOCATION_REVIEWED: 'Review completed', AVAILABILITY_CHANGED: 'Pilot unavailability recorded', MOVEMENT_CREATED: 'Movement added by import',
    IMPORT_RUN: 'Movement import run',
  }[e.action] ?? e.action;
}
function eventChange(e) {
  const b = e.before ?? {}; const a = e.after ?? {}; const d = e.details ?? {};
  const extra = [];
  if (d.reasonCategory) extra.push(`Category: ${d.reasonCategory.replaceAll('_', ' ').toLowerCase()}`);
  if (d.exceptions?.length) extra.push(...d.exceptions.map((x) => `Authorised exception: ${x.message} — “${x.reason}”`));
  if (d.warnings?.length) extra.push(...d.warnings.map((w) => `Warning acknowledged: ${w.message}`));
  let main = '';
  switch (e.action) {
    case 'ALLOCATION_CREATED': main = `${a.pilot_name ?? a.pilot_id} assigned as draft`; break;
    case 'ALLOCATION_CONFIRMED': main = `${a.pilot_name ?? 'Pilot'}: draft → confirmed`; break;
    case 'ALLOCATION_REASSIGNED': main = `${b.pilot_name} (${(LABEL[b.status] ?? b.status).toLowerCase()}) → ${a.pilot_name} (draft)`; break;
    case 'ALLOCATION_CANCELLED': main = `${b.pilot_name}: ${(LABEL[b.status] ?? b.status).toLowerCase()} → cancelled`; break;
    case 'MOVEMENT_UPDATED': main = Object.keys(a).map((k) => `${FIELD[k] ?? k}: ${fval(k, b[k])} → ${fval(k, a[k])}`).join('; '); break;
    case 'ALLOCATION_FLAGGED': return `<ul>${(d.reasons ?? []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`;
    case 'ALLOCATION_REVIEWED': main = 'Review flag cleared after checks re-run'; break;
    case 'COMMUNICATION_STATUS': main = `${LABEL[b.comm_status] ?? b.comm_status} → ${LABEL[a.comm_status] ?? a.comm_status}`; break;
    case 'AVAILABILITY_CHANGED': main = `${e.pilot_entity_name ?? e.entity_id} unavailable ${time(new Date(a.start).toISOString())}–${time(new Date(a.end).toISOString())} UTC${a.note ? ` (${a.note})` : ''}`; break;
    case 'IMPORT_RUN': main = `${d.created} created, ${d.updated} updated, ${d.unchanged} unchanged, ${d.rejected} rejected, ${d.notInFile} not in file`; break;
    default: main = '';
  }
  return [main, ...extra].filter(Boolean).map(esc).join('<br>');
}
function auditList(rows, showMovement) {
  if (!rows.length) return '<p class="muted">No events yet.</p>';
  return `<ul class="audit-list">${rows.map((e) => `<li>
    <div class="head"><span class="ev">${esc(eventTitle(e))}</span>
      ${showMovement && e.vessel_name ? `<span>${esc(e.vessel_name)} <span class="muted small">${esc(e.external_ref)}</span></span>` : ''}
      <span class="muted small">${time(e.at)} UTC · ${esc(e.actor)} (${esc(e.actor_role.toLowerCase())})</span></div>
    <div class="change">${eventChange(e)}</div>
    ${e.reason ? `<div class="small">Reason: “${esc(e.reason)}”</div>` : ''}
    <details class="small"><summary>Technical detail</summary><pre>${esc(JSON.stringify({ seq: e.seq, action: e.action, entity: `${e.entity_type} ${e.entity_id}`,
      movement_id: e.movement_id, before: e.before, after: e.after, details: e.details }, null, 2))}</pre></details>
  </li>`).join('')}</ul>`;
}

async function loadAudit() {
  const rows = await api('/api/audit');
  $('#view-audit').innerHTML = `<p class="muted">Latest 200 events, newest first. Events are added, never edited, in this prototype's database. This is a prototype record, not a production-grade or tamper-proof audit trail.</p>
    <div class="board-wrap">${auditList(rows, true)}</div>`;
}

init().catch(handleError);
