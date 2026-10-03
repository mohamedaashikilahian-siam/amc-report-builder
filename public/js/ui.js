/* ===== AMC Report Builder: interface ===== */
import { MON, DEFAULT_ACTS, esc, monthLabel, addMonth, fmtDur, shortDur, parseDur, totalMins, hoursFor, carryForward, genSummary, makeModel, docxBlob, pdfBlob } from './core.js';
import { createStore } from './store.js';
const $ = s => document.querySelector(s);
const S = { clients: [], reports: {}, clientId: null, month: '', acts: [], work: [], summary: '', edited: false, includePrev: false, edit: null, confirm: '', msg: '', msgCls: '', loaded: { c: false, r: false } };
let store = null, unsubs = [], me = null;
const now = new Date();
const todayYM = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const okMins = d => { const v = parseDur(d, 'm'); return isNaN(v) ? 0 : v; };
const byLabel = (a, b) => (a.label || '').localeCompare(b.label || '');
const curClient = () => S.clients.find(c => c.id === S.clientId) || null;
const clientReports = id => Object.values(S.reports).filter(r => r.clientId === id).sort((a, b) => a.month < b.month ? -1 : 1);
const nextMonthFor = id => { const l = clientReports(id); return l.length ? addMonth(l[l.length - 1].month, 1) : addMonth(todayYM, -1); };
const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;

function formDoc() {
  return { clientId: S.clientId, month: S.month,
    acts: S.acts.map(a => ({ name: a.name, status: a.status, remark: a.remark || '' })),
    work: S.work.map(w => ({ label: (w.label || '').trim() || 'Work', kind: w.kind, mins: okMins(w.dur) })),
    summary: S.summary, edited: !!S.edited };
}
function listWithCurrent() {
  const l = clientReports(S.clientId).filter(r => r.month !== S.month);
  if (monthRe.test(S.month)) l.push(formDoc());
  return l.sort((a, b) => a.month < b.month ? -1 : 1);
}

/* ---------- loading a month into the form ---------- */
function loadForm() {
  const c = curClient(); if (!c) return;
  const saved = S.reports[c.id + '_' + S.month];
  if (saved) {
    S.acts = saved.acts.map(a => Object.assign({}, a));
    S.work = saved.work.map(w => ({ label: w.label, kind: w.kind, dur: shortDur(w.mins) }));
    S.summary = saved.summary; S.edited = !!saved.edited;
  } else {
    const before = clientReports(c.id).filter(r => r.month < S.month);
    const prev = before.length ? before[before.length - 1] : null;
    S.acts = c.activities.map(n => { const p = prev && prev.acts.find(a => a.name === n); return { name: n, status: p ? p.status : 'done', remark: p ? p.remark : '' }; });
    S.work = [{ label: 'AMC Activities', kind: 'amc', dur: shortDur(c.monthlyMins || 0) }];
    S.edited = false; S.summary = genSummary(c, S.acts, S.work);
  }
  S.confirm = ''; S.msg = ''; S.msgCls = '';
}
function selectClient(id) { S.clientId = id; S.month = nextMonthFor(id); S.edit = null; loadForm(); renderAll(); }
function syncSummary() { if (!S.edited) { S.summary = genSummary(curClient(), S.acts, S.work); const t = $('#summary'); if (t) t.value = S.summary; } }

/* ---------- storage ---------- */
async function putClient(c) { const doc = Object.assign({}, c); delete doc.id; await store.set('clients', c.id, doc); }
async function putReport(doc) { await store.set('reports', doc.clientId + '_' + doc.month, doc); }
async function removeReport(id) { await store.remove('reports', id); }
function setMsg(t, cls) { S.msg = t; S.msgCls = cls || ''; const m = $('#msg'); if (m) { m.textContent = t; m.className = 'msg ' + (cls || ''); } }

/* ---------- expiry flags (only for recent months) ---------- */
function expiryFlag(remark) {
  if (!remark || S.month < addMonth(todayYM, -1)) return null;
  const m = remark.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i);
  if (!m) return null;
  const mi = MON.findIndex(x => x.toLowerCase() === m[1].toLowerCase().slice(0, 3));
  const days = Math.round((new Date(+m[3], mi, +m[2]) - startToday) / 864e5);
  if (days < 0) return { cls: 'bad', t: '⚠ Date passed ' + (-days) + ' day' + (days === -1 ? '' : 's') + ' ago. Check and update this remark.' };
  if (days === 0) return { cls: 'warn', t: '⚠ This date is today. Confirm the renewal.' };
  if (days <= 30) return { cls: 'warn', t: '⚠ Due in ' + days + ' day' + (days === 1 ? '' : 's') + '.' };
  return null;
}

/* ---------- render: clients ---------- */
function renderClients() {
  const el = $('#clients');
  el.innerHTML = S.clients.map(c => {
    const l = clientReports(c.id), used = l.reduce((a, r) => a + totalMins(r.work), 0), next = l.length ? addMonth(l[l.length - 1].month, 1) : addMonth(todayYM, -1);
    const due = next <= addMonth(todayYM, -1);
    return '<button type="button" class="client" data-act="pick" data-id="' + esc(c.id) + '" aria-pressed="' + (c.id === S.clientId) + '"><b>' + esc(c.label) + '</b><span class="url">' + esc(c.url) + '</span><span class="meta"><span class="pill">' + esc(fmtDur(c.allocMins - used)) + ' left</span><span class="pill ' + (due ? 'warn' : '') + '">' + esc(monthLabel(next)) + (due ? ' due' : ' next') + '</span></span></button>';
  }).join('') + '<button type="button" class="client add" data-act="new-client">+ Add client</button>';
}

/* ---------- render: client editor ---------- */
function renderEditor() {
  const el = $('#editor'), E = S.edit;
  if (!E) { el.innerHTML = S.clientId ? '<div class="row" style="margin-top:10px"><button type="button" class="btn small" data-act="edit-client">Edit client details</button></div>' : ''; return; }
  const all = DEFAULT_ACTS.concat(E.acts.filter(a => !DEFAULT_ACTS.includes(a)));
  el.innerHTML = '<div class="editor"><h2 style="margin:0">' + (E.id ? 'Edit client' : 'New client') + '</h2>' +
    '<div class="two"><label class="f">Short name<input type="text" id="ce_label" value="' + esc(E.label) + '" placeholder="e.g. ABDF"></label>' +
    '<label class="f">Client contact name<input type="text" id="ce_contact" value="' + esc(E.contact) + '"></label>' +
    '<label class="f">Website<input type="text" id="ce_url" value="' + esc(E.url) + '" placeholder="example.com"></label></div>' +
    '<div class="two"><label class="f">AMC start<input type="date" id="ce_start" value="' + esc(E.amcStart) + '"></label>' +
    '<label class="f">AMC end<input type="date" id="ce_end" value="' + esc(E.amcEnd) + '"></label>' +
    '<label class="f">AMC hours in total<input type="text" id="ce_alloc" value="' + esc(E.alloc) + '" placeholder="e.g. 10 or 8h 30m"></label>' +
    '<label class="f">Monthly activities take<input type="text" id="ce_monthly" value="' + esc(E.monthly) + '" placeholder="e.g. 50m"></label></div>' +
    '<div><div class="f" style="font-size:12px;color:var(--muted);font-weight:600;margin-bottom:6px">Activities in this client\'s report</div><div class="chips">' +
    all.map(a => '<label class="chip"><input type="checkbox" data-act="ce-act" data-name="' + esc(a) + '"' + (E.acts.includes(a) ? ' checked' : '') + '> ' + esc(a) + '</label>').join('') + '</div>' +
    '<div class="row" style="margin-top:8px"><input type="text" id="ce_custom" class="grow" placeholder="Add another activity"><button type="button" class="btn small" data-act="ce-add">Add</button></div></div>' +
    '<label class="f">Standing note for the summary (used when an activity is marked N/A)<textarea id="ce_note" rows="2" placeholder="e.g. Domain, hosting and SSL renewals are handled by the client\'s hosting provider.">' + esc(E.note) + '</textarea></label>' +
    '<div class="row"><button type="button" class="btn primary" data-act="save-client">Save client</button><button type="button" class="btn" data-act="cancel-edit">Cancel</button>' +
    (E.id ? '<span style="flex:1"></span><button type="button" class="btn danger small" data-act="del-client">' + (S.confirm === 'client' ? 'Click again to delete client and its reports' : 'Delete client') + '</button>' : '') + '</div>' +
    '<p class="msg bad" id="ce_msg"></p></div>';
}
function openEditor(c) {
  S.edit = c ? { id: c.id, label: c.label, contact: c.contact, url: c.url, amcStart: c.amcStart, amcEnd: c.amcEnd, alloc: shortDur(c.allocMins), monthly: shortDur(c.monthlyMins || 0), acts: c.activities.slice(), note: c.note || '' }
    : { id: '', label: '', contact: '', url: '', amcStart: '', amcEnd: '', alloc: '', monthly: '50m', acts: DEFAULT_ACTS.slice(), note: '' };
  S.confirm = ''; renderEditor();
}
function readEditor() {
  const E = S.edit; E.label = $('#ce_label').value.trim(); E.contact = $('#ce_contact').value.trim(); E.url = $('#ce_url').value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  E.amcStart = $('#ce_start').value; E.amcEnd = $('#ce_end').value; E.alloc = $('#ce_alloc').value; E.monthly = $('#ce_monthly').value; E.note = $('#ce_note').value;
}
async function saveClient() {
  readEditor(); const E = S.edit, msg = t => { $('#ce_msg').textContent = t; };
  const alloc = parseDur(E.alloc, 'h'), monthly = parseDur(E.monthly, 'm');
  if (!E.label || !E.contact || !E.url) return msg('Add a short name, contact name and website.');
  if (!E.amcStart || !E.amcEnd) return msg('Add the AMC start and end dates.');
  if (isNaN(alloc) || alloc <= 0) return msg('Enter the AMC hours, for example 10 or 8h 30m.');
  if (isNaN(monthly)) return msg('Enter the monthly activity time, for example 50m or 1h 15m.');
  if (!E.acts.length) return msg('Pick at least one activity.');
  let id = E.id;
  if (!id) { const base = E.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client'; id = base; let n = 2; while (S.clients.some(c => c.id === id)) id = base + '-' + n++; }
  const order = DEFAULT_ACTS.concat(E.acts.filter(a => !DEFAULT_ACTS.includes(a)));
  const c = { id, label: E.label, contact: E.contact, url: E.url, amcStart: E.amcStart, amcEnd: E.amcEnd, allocMins: alloc, monthlyMins: monthly, activities: order.filter(a => E.acts.includes(a)), note: E.note.trim() };
  try { await putClient(c); } catch (e) { return msg('Could not save: ' + (e.message || e.code)); }
  S.edit = null;
  if (S.clientId === id) { loadForm(); renderAll(); } else selectClient(id);
}

/* ---------- render: report form ---------- */
function renderForm() {
  const el = $('#form'), c = curClient();
  if (!c) { el.innerHTML = '<section class="panel"><div class="empty">' + (S.clients.length ? 'Pick a client to start a report.' : 'No clients yet. Add one to start your first report.') + '</div></section>'; return; }
  const seg = (a, i) => '<div class="seg" role="group" aria-label="Status of ' + esc(a.name) + '">' + [['done', 'Done'], ['notdone', 'Not done'], ['na', 'N/A']].map(x => '<button type="button" data-act="status" data-i="' + i + '" data-s="' + x[0] + '" aria-pressed="' + (a.status === x[0]) + '">' + x[1] + '</button>').join('') + '</div>';
  el.innerHTML =
    '<section class="panel"><h2>Report month</h2><div class="row"><label class="f grow" style="max-width:220px">Month<input type="month" id="month" value="' + esc(S.month) + '"></label><span id="savedpill"></span></div>' +
    '<p class="hint">Opens on the next month this client has no saved report for.</p><div id="carry"></div></section>' +
    '<section class="panel"><h2>Maintenance activities</h2><div class="acts">' + S.acts.map((a, i) =>
      '<div class="act"><span class="nm">' + esc(a.name) + '</span>' + seg(a, i) + '<input type="text" data-k="remark" data-i="' + i + '" value="' + esc(a.remark) + '" placeholder="Remarks (e.g. Expiry: Oct 10, 2026)" aria-label="Remarks for ' + esc(a.name) + '"><button type="button" class="xbtn rm" data-act="rm-act" data-i="' + i + '" aria-label="Remove ' + esc(a.name) + ' from this report" title="Remove from this report">×</button>' +
      (() => { const f = expiryFlag(a.remark); return f ? '<span class="flag ' + f.cls + '">' + esc(f.t) + '</span>' : ''; })() + '</div>').join('') + '</div>' +
    '<div class="row" style="margin-top:8px"><input type="text" id="newAct" class="grow" placeholder="Add an activity to this report only"><button type="button" class="btn small" data-act="add-act">Add</button></div></section>' +
    '<section class="panel"><h2>Hours used this month</h2>' + S.work.map((w, i) =>
      '<div class="work"><div><input type="text" data-k="wlabel" data-i="' + i + '" value="' + esc(w.label) + '" placeholder="Work done" aria-label="Work done"></div><div><input type="text" data-k="wdur" data-i="' + i + '" value="' + esc(w.dur) + '" placeholder="50m" aria-label="Time spent" class="' + (isNaN(parseDur(w.dur)) ? 'err' : '') + '"></div>' +
      '<select data-k="wkind" data-i="' + i + '" aria-label="Type of work"><option value="amc"' + (w.kind === 'amc' ? ' selected' : '') + '>Monthly AMC</option><option value="extra"' + (w.kind === 'extra' ? ' selected' : '') + '>Extra request</option></select>' +
      '<button type="button" class="xbtn" data-act="rm-work" data-i="' + i + '" aria-label="Remove this row">×</button></div>').join('') +
    '<button type="button" class="btn small" data-act="add-work">+ Add work item</button><p class="hint">Time as 50m, 1h 15m or 1:15. A bare number counts as minutes.</p><div class="calc" id="calc"></div></section>' +
    '<section class="panel"><h2>Summary</h2><textarea id="summary" rows="5" aria-label="Summary text"></textarea><div class="row" style="margin-top:8px"><button type="button" class="btn small" data-act="regen">Rewrite from activities</button><span class="hint" style="margin:0">Edits you make here are kept until you rewrite.</span></div></section>' +
    '<section class="panel"><h2>Save and download</h2><div class="row"><button type="button" class="btn primary" data-act="save-report">Save report</button><button type="button" class="btn" data-act="export" data-kind="docx">Download Word</button><button type="button" class="btn" data-act="export" data-kind="pdf">Download PDF</button>' +
    '<span style="flex:1"></span><button type="button" class="btn danger small" data-act="del-report" id="delrep" hidden>Delete saved report</button></div><p class="msg" id="msg"></p>' +
    '<p class="hint">Saving adds this month to the client\'s balance and history, so next month starts from the right figure.</p></section>';
  $('#summary').value = S.summary;
  renderLive();
}

/* ---------- render: live parts ---------- */
function renderLive() {
  const c = curClient(); if (!c) return;
  const valid = monthRe.test(S.month);
  const calc = $('#calc');
  if (calc) {
    if (!valid) calc.innerHTML = '';
    else {
      const l = listWithCurrent(), h = hoursFor(c, l, S.month), low = h.remaining < c.allocMins * 0.2;
      calc.innerHTML = [['Previous balance', fmtDur(h.prev)], ['Used this month', fmtDur(h.used)], ['Total consumed', fmtDur(h.consumed)], ['Remaining', fmtDur(h.remaining), 1]].map(x => '<div class="' + (x[2] ? 'hi' : '') + '"><small>' + x[0] + '</small><strong>' + esc(x[1]) + '</strong></div>').join('') +
        (h.remaining < 0 ? '<span class="flag bad" style="grid-column:1/-1">⚠ This goes over the AMC allocation by ' + esc(fmtDur(-h.remaining)) + '.</span>' : low ? '<span class="flag warn" style="grid-column:1/-1">⚠ Less than 20% of the AMC hours are left.</span>' : '');
    }
  }
  const cf = $('#carry');
  if (cf) {
    if (!valid) cf.innerHTML = '';
    else {
      const k = carryForward(c, clientReports(c.id), S.month);
      if (!k.last) cf.innerHTML = '<p class="hint">No earlier report saved for this client. ' + esc(monthLabel(S.month)) + ' starts from the full AMC allocation of ' + esc(fmtDur(k.start)) + '.</p>';
      else {
        const f = k.figures;
        cf.innerHTML = '<div class="carry"><h2 style="margin:12px 0 0">Carried forward from ' + esc(monthLabel(k.last)) + '</h2><div class="calc">' +
          [['Previous balance', f.prev], ['Used that month', f.used], ['Total consumed', f.consumed], ['Remaining', f.remaining, 1]].map(x => '<div class="' + (x[2] ? 'hi' : '') + '"><small>' + x[0] + '</small><strong>' + esc(fmtDur(x[1])) + '</strong></div>').join('') + '</div>' +
          '<p class="hint">' + esc(monthLabel(S.month)) + ' opens with a previous balance of <b>' + esc(fmtDur(k.start)) + '</b>.</p>' +
          (k.gap > 0 ? '<span class="flag warn">⚠ ' + k.gap + ' month' + (k.gap === 1 ? '' : 's') + ' between ' + esc(monthLabel(k.last)) + ' and ' + esc(monthLabel(S.month)) + ' ' + (k.gap === 1 ? 'has' : 'have') + ' no saved report, so ' + (k.gap === 1 ? 'its' : 'their') + ' hours are not counted.</span>' : '') + '</div>';
      }
    }
  }
  const sp = $('#savedpill');
  if (sp) {
    const saved = S.reports[c.id + '_' + S.month];
    const same = saved && JSON.stringify([saved.acts, saved.work, saved.summary]) === JSON.stringify([formDoc().acts, formDoc().work, formDoc().summary]);
    sp.innerHTML = !valid ? '<span class="pill bad">Pick a month</span>' : same ? '<span class="pill">Saved</span>' : saved ? '<span class="pill warn">Unsaved changes</span>' : '<span class="pill warn">Not saved yet</span>';
    const d = $('#delrep'); if (d) { d.hidden = !saved; d.textContent = S.confirm === 'report' ? 'Click again to delete' : 'Delete saved report'; }
  }
  renderPreview();
}
function sheetHTML(m) {
  const ci = m.info;
  return '<article class="sheet"><div class="lh"><img src="img/siam-logo.png" alt="Siam Computing"><div><a href="https://siamcomputing.com" target="_blank" rel="noopener">https://siamcomputing.com</a><br><i>We don\'t sell code, we deliver clarity.</i></div></div><div class="kick">MONTHLY AMC REPORT</div><h3>' + esc(m.title) + '</h3>' +
    '<h4>Client Information</h4><table><tr><td class="lbl">' + esc(ci[0][0]) + '</td><td>' + esc(ci[0][1]) + '</td><td class="lbl">' + esc(ci[1][0]) + '</td><td>' + esc(ci[1][1]) + '</td></tr><tr><td class="lbl">' + esc(ci[2][0]) + '</td><td>' + esc(ci[2][1]) + '</td><td class="lbl">' + esc(ci[3][0]) + '</td><td>' + esc(ci[3][1]) + '</td></tr></table>' +
    '<h4>Maintenance Activities</h4><table><tr><th>Activity</th><th class="c">Done</th><th class="c">Not Done</th><th>Remarks</th></tr>' + m.acts.map(a => '<tr><td>' + esc(a.name) + '</td><td class="c tick">' + (a.status === 'done' ? '✔' : '☐') + '</td><td class="c tick">' + (a.status === 'notdone' ? '✔' : '☐') + '</td><td>' + esc(a.remark) + '</td></tr>').join('') + '</table>' +
    '<h4>AMC Hours Utilization</h4><table><tr><th>Item</th><th>Hours</th></tr>' + m.hours.map((r, i) => '<tr' + (i === m.hours.length - 1 ? ' class="hi"' : '') + '><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>').join('') + '</table>' +
    (m.history ? '<h4>Activity History</h4><table><tr><th>Month</th><th>Work Done</th><th class="c">Hours Used</th></tr>' + m.history.map(r => '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td class="c">' + esc(r[2]) + '</td></tr>').join('') + '</table>' : '') +
    '<h4>Summary</h4><p>' + esc(m.summary) + '</p><div class="foot">' + esc(m.footer) + ' &nbsp;|&nbsp; Monthly AMC Report</div></article>';
}
function modelsToShow() {
  const c = curClient(); if (!c || !monthRe.test(S.month)) return [];
  const l = listWithCurrent();
  const months = S.includePrev ? l.map(r => r.month).filter(x => x <= S.month) : [S.month];
  return months.map(mo => makeModel(c, l, mo));
}
function renderPreview() {
  const ms = modelsToShow();
  $('#sheets').innerHTML = ms.length ? ms.map(sheetHTML).join('') : '<div class="empty">The report preview appears here once you pick a client and a month.</div>';
}
function renderAll() {
  $('#prev').checked = S.includePrev;
  renderClients(); renderEditor(); renderForm(); renderPreview();
  if (!S.clients.length && !S.edit) { /* first run */ }
}

/* ---------- export ---------- */
let assetsP = null;
const loadAssets = () => assetsP || (assetsP = Promise.all(['siam-logo', 'siam-watermark'].map(n => fetch('img/' + n + '.png').then(r => { if (!r.ok) throw new Error('Missing img/' + n + '.png'); return r.arrayBuffer(); })))
  .then(([logo, watermark]) => ({ logo: new Uint8Array(logo), watermark: new Uint8Array(watermark) })).catch(e => { assetsP = null; throw e; }));
function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function doExport(kind) {
  const c = curClient(); if (!c || !monthRe.test(S.month)) return setMsg('Pick a month first.', 'bad');
  if (S.work.some(w => isNaN(parseDur(w.dur)))) return setMsg('One of the times could not be read. Use 50m, 1h 15m or 1:15.', 'bad');
  const models = modelsToShow(); if (!models.length) return;
  const name = c.label.replace(/[^A-Za-z0-9]+/g, '-') + '-AMC-Report-' + (S.includePrev ? 'to-' : '') + S.month + '.' + kind;
  try {
    setMsg('Saving and building ' + kind.toUpperCase() + '...');
    await putReport(formDoc());
    const assets = await loadAssets();
    const blob = kind === 'docx' ? await docxBlob(c, models, assets) : pdfBlob(c, models, assets);
    saveBlob(blob, name);
    renderClients(); renderLive();
    setMsg('Saved ' + monthLabel(S.month) + ' and downloaded ' + name, 'good');
  } catch (e) { setMsg('Could not create the file: ' + ((e && (e.message || e.code)) || 'unknown error'), 'bad'); }
}
function backupAll() {
  const out = { clients: {}, reports: {} };
  S.clients.forEach(c => { const d = Object.assign({}, c); delete d.id; out.clients[c.id] = d; });
  Object.entries(S.reports).forEach(([id, r]) => { out.reports[id] = r; });
  saveBlob(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }), 'amc-backup-' + new Date().toISOString().slice(0, 10) + '.json');
}
async function restoreAll(file) {
  try {
    const data = JSON.parse(await file.text()); let n = 0;
    if (!data || typeof data !== 'object' || !data.clients || !data.reports) throw new Error('This file is not an AMC backup.');
    for (const [id, d] of Object.entries(data.clients)) { await store.set('clients', id, d); n++; }
    for (const [id, d] of Object.entries(data.reports)) { await store.set('reports', id, d); n++; }
    setTop('Restored ' + n + ' records.', '');
  } catch (e) { setTop('Restore failed: ' + (e.message || e), 'bad'); }
}
function setTop(t, cls) { const el = $('#topmsg'); el.textContent = t; el.className = 'msg ' + (cls || ''); }

/* ---------- events ---------- */
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, i = +b.dataset.i;
  if (b.tagName === 'INPUT') return;
  if (act === 'pick') return selectClient(b.dataset.id);
  if (act === 'new-client') { openEditor(null); return; }
  if (act === 'edit-client') return openEditor(curClient());
  if (act === 'cancel-edit') { S.edit = null; S.confirm = ''; return renderEditor(); }
  if (act === 'save-client') return saveClient();
  if (act === 'ce-add') { readEditor(); const v = $('#ce_custom').value.trim(); if (v && !S.edit.acts.includes(v)) S.edit.acts.push(v); return renderEditor(); }
  if (act === 'del-client') {
    if (S.confirm !== 'client') { readEditor(); S.confirm = 'client'; return renderEditor(); }
    const id = S.edit.id; S.edit = null; S.confirm = '';
    try {
      for (const r of clientReports(id)) await removeReport(r.clientId + '_' + r.month);
      await store.remove('clients', id);
    } catch (e) { setMsg('Could not delete: ' + ((e && (e.message || e.code)) || 'unknown error'), 'bad'); }
    S.clientId = null; if (S.clients[0]) selectClient(S.clients[0].id); else renderAll(); return;
  }
  if (act === 'status') { S.acts[i].status = b.dataset.s; syncSummary(); renderForm(); return; }
  if (act === 'rm-act') { S.acts.splice(i, 1); syncSummary(); return renderForm(); }
  if (act === 'add-act') { const v = $('#newAct').value.trim(); if (v) { S.acts.push({ name: v, status: 'done', remark: '' }); syncSummary(); renderForm(); } return; }
  if (act === 'add-work') { S.work.push({ label: '', kind: 'extra', dur: '' }); return renderForm(); }
  if (act === 'rm-work') { S.work.splice(i, 1); syncSummary(); return renderForm(); }
  if (act === 'regen') { S.edited = false; syncSummary(); return renderLive(); }
  if (act === 'save-report') {
    if (!monthRe.test(S.month)) return setMsg('Pick a month first.', 'bad');
    if (S.work.some(w => isNaN(parseDur(w.dur)))) return setMsg('One of the times could not be read. Use 50m, 1h 15m or 1:15.', 'bad');
    try { await putReport(formDoc()); setMsg('Saved ' + monthLabel(S.month) + '.', 'good'); renderClients(); renderLive(); } catch (e) { setMsg('Could not save: ' + ((e && (e.message || e.code)) || 'unknown error'), 'bad'); }
    return;
  }
  if (act === 'del-report') {
    if (S.confirm !== 'report') { S.confirm = 'report'; return renderLive(); }
    S.confirm = ''; try { await removeReport(S.clientId + '_' + S.month); setMsg('Deleted the saved report. The form still holds your entries.', ''); renderClients(); renderLive(); } catch (e) { setMsg('Could not delete.', 'bad'); }
    return;
  }
  if (act === 'export') return doExport(b.dataset.kind);
  if (act === 'backup') return backupAll();
  if (act === 'signin') {
    const m = $('#loginmsg'); m.className = 'msg'; m.textContent = 'Opening Google sign-in...';
    const stuck = setTimeout(() => { m.className = 'msg bad'; m.textContent = 'Still waiting. A browser shield or ad blocker is probably blocking Google sign-in. In Brave, click the lion icon in the address bar, turn Shields off for this site and reload. You can also open this page in Chrome.'; }, 6000);
    const why = { 'auth/popup-closed-by-user': 'Sign-in was cancelled.', 'auth/cancelled-popup-request': 'Sign-in was cancelled.',
      'auth/popup-blocked': 'The browser blocked the sign-in window. Allow pop-ups for this site and try again.',
      'auth/unauthorized-domain': 'This web address is not allowed yet. In the Firebase console go to Authentication > Settings > Authorized domains and add it.',
      'auth/operation-not-allowed': 'Google sign-in is switched off. In the Firebase console go to Authentication > Sign-in method > Google and enable it.',
      'auth/network-request-failed': 'Could not reach Google. Check your connection, or turn off the ad blocker or shield for this site.' };
    try { await store.signIn(); m.textContent = ''; }
    catch (e) { m.className = 'msg bad'; m.textContent = why[e && e.code] || 'Sign-in failed: ' + ((e && (e.message || e.code)) || 'unknown error'); console.error('Sign-in error', e); }
    finally { clearTimeout(stuck); }
    return;
  }
  if (act === 'signout') return store.signOut();
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.id === 'restorefile') { if (t.files[0]) restoreAll(t.files[0]); t.value = ''; return; }
  if (t.id === 'prev') { S.includePrev = t.checked; return renderPreview(); }
  if (t.id === 'month') { S.month = t.value; if (monthRe.test(S.month)) loadForm(); renderForm(); return; }
  if (t.dataset.act === 'ce-act') { const n = t.dataset.name, a = S.edit.acts; if (t.checked) { if (!a.includes(n)) a.push(n); } else S.edit.acts = a.filter(x => x !== n); return; }
  if (t.dataset.k === 'wkind') { S.work[+t.dataset.i].kind = t.value; syncSummary(); renderLive(); }
});
document.addEventListener('input', ev => {
  const t = ev.target, k = t.dataset.k, i = +t.dataset.i;
  if (t.id === 'summary') { S.summary = t.value; S.edited = true; return renderLive(); }
  if (k === 'remark') { S.acts[i].remark = t.value; return renderLive(); }
  if (k === 'wlabel') { S.work[i].label = t.value; syncSummary(); return renderLive(); }
  if (k === 'wdur') { S.work[i].dur = t.value; t.classList.toggle('err', isNaN(parseDur(t.value))); return renderLive(); }
});

/* ---------- start ---------- */
function afterData() {
  if (!(S.loaded.c && S.loaded.r)) return;
  if (!S.clientId || !curClient()) { if (S.clients[0]) return selectClient(S.clients[0].id); S.clientId = null; return renderAll(); }
  renderClients(); renderLive();
}
function stopWatch() { unsubs.forEach(f => f()); unsubs = []; S.loaded = { c: false, r: false }; S.clients = []; S.reports = {}; S.clientId = null; }
function dbError(e) { const st = $('#dbstate'); st.textContent = e && e.code === 'permission-denied' ? 'This account is not allowed to open the data' : 'Storage error: ' + ((e && (e.code || e.message)) || 'unknown'); st.className = 'pill bad'; }
function startWatch() {
  stopWatch();
  unsubs.push(store.watch('clients', docs => { S.clients = docs.map(d => Object.assign({ id: d.id }, d.data)).sort(byLabel); S.loaded.c = true; afterData(); }, dbError));
  unsubs.push(store.watch('reports', docs => { S.reports = {}; docs.forEach(d => { S.reports[d.id] = d.data; }); S.loaded.r = true; afterData(); }, dbError));
}
async function init() {
  try { store = await createStore(); } catch (e) { $('#loginmsg').textContent = 'Could not start: ' + (e.message || e); $('#login').hidden = false; return; }
  const st = $('#dbstate');
  store.onAuth(user => {
    me = user;
    $('#login').hidden = !!user; $('#app').hidden = !user;
    if (!user) { stopWatch(); return; }
    if (store.mode === 'cloud') { st.textContent = 'Saved online' + (user.email ? ' \u00B7 ' + user.email : ''); st.className = 'pill'; $('#signout').hidden = false; }
    else { st.textContent = 'Saved in this browser only'; st.className = 'pill warn'; $('#signout').hidden = true; }
    renderAll(); startWatch();
  });
}
init();
