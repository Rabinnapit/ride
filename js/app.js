// RiderHQ — application shell: state, routing, import pipeline, layout.
import { db, requestPersistence } from './db.js';
import { loadSettings, getSettings, saveSettings, rideParams, rideLocalDate, rideLocalTime, todayIso, addDays, isoDate } from './settings.js';
import { pmcSeries } from './metrics/aggregate.js';
import { readinessScore } from './metrics/readiness.js';
import { h, clear, icon, toast, append } from './ui/dom.js';
import { chartTheme, destroyCharts } from './ui/charts.js';
import { fetchForecast } from './modules/extras.js';
import { matchRidesToPlan } from './coach/planner.js';

export const METRICS_VERSION = 2; // bump when zone definitions or ride metrics change → rides recompute on next launch
export const state = {
  settings: null, rides: [], wellness: [], plan: null, gymlog: [], equipment: [], pmc: [], forecast: null, readiness: null, coachNotes: [],
  importing: 0, route: { name: 'home', params: {} }, activeCleanup: null,
};

const views = {};
export function registerView(name, fn) { views[name] = fn; }

// ---------- worker ----------
let worker = null; const pending = new Map();
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./fit/worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => { const m = e.data; const p = pending.get(m.id); if (!p) return; pending.delete(m.id); if (m.type === 'error') p.reject(new Error(m.error)); else p.resolve(m); };
  worker.onerror = (e) => { console.error('worker error', e); for (const p of pending.values()) p.reject(new Error(e.message || 'Worker failed')); pending.clear(); };
  return worker;
}
function workerCall(msg, transfer = []) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); getWorker().postMessage({ ...msg, id }, transfer); });
}

// ---------- data loading ----------
export async function refreshData() {
  state.settings = getSettings();
  const rides = await db.getAll('rides');
  rides.sort((a, b) => b.startUtc.localeCompare(a.startUtc));
  state.rides = rides;
  state.wellness = (await db.getAll('wellness')).sort((a, b) => a.date.localeCompare(b.date));
  state.gymlog = await db.getAll('gymlog');
  state.equipment = await db.getAll('equipment');
  state.plan = (await db.get('plans', 'current')) || null;
  if (state.plan) { matchRidesToPlan(state.plan, state.rides.filter(r => !r.excluded), rideLocalDate); }
  state.coachNotes = (await db.getAll('ai')).filter(a => a.provider === 'claude-chat' && a.parsed).sort((a, b) => `${b.parsed.date || ''}${b.parsed.ts || ''}`.localeCompare(`${a.parsed.date || ''}${a.parsed.ts || ''}`));
  recomputePmc();
}
export function recomputePmc() {
  const s = getSettings();
  const planned = new Map();
  if (state.plan) for (const d of state.plan.days) for (const x of d.sessions) if (x.kind === 'bike' && !x.done && x.plannedTss) planned.set(d.date, (planned.get(d.date) || 0) + x.plannedTss);
  state.pmc = pmcSeries(state.rides.filter(r => !r.excluded), { ctlDays: s.pmc.ctlDays, atlDays: s.pmc.atlDays, planned, extendDays: 21 });
  const today = todayIso();
  const todayW = state.wellness.find(w => w.date === today) || null;
  const hist = state.wellness.filter(w => w.date < today && w.date >= addDays(today, -60));
  const pm = state.pmc.find(p => p.date === today);
  state.readiness = todayW ? readinessScore(todayW, hist, pm?.tsb) : null;
}
export function pmcToday() { const t = todayIso(); return state.pmc.find(p => p.date === t) || null; }

// ---------- import pipeline ----------
function autoName(meta) {
  const hour = +rideLocalTime({ startUtc: meta.startUtc, tzOffsetMin: meta.tzOffsetMin }).slice(0, 2);
  const part = hour < 11 ? 'Morning' : hour < 14 ? 'Lunch' : hour < 18 ? 'Afternoon' : 'Evening';
  return meta.indoor || meta.virtual ? `${part} indoor ride` : `${part} ride`;
}
export async function importFile(buffer, fileName, { silent = false } = {}) {
  const s = getSettings();
  const overrides = (await db.getSetting('overrides', [])) || [];
  const wellnessWeights = state.wellness.filter(w => w.weightKg > 0).map(w => ({ date: w.date, kg: w.weightKg }));
  const hashed = await workerCall({ type: 'hash', buffer: buffer.slice(0) });
  const existing = await db.get('rides', hashed.hash);
  if (existing) { if (!silent) toast(`Already imported: ${fileName}`); return { duplicate: true, ride: existing }; }
  // First pass: decode with generic params to learn the date, then compute with date-effective params.
  const first = await workerCall({ type: 'import', buffer: buffer.slice(0), fileName, params: rideParams(new Date().toISOString(), s, { wellnessWeights }) });
  const meta = first.meta;
  const ov = overrides.find(o => o.startUtc === meta.startUtc) || null;
  const powerValid = ov?.powerValid === false ? false : !(first.summary.powerSuspect);
  const params = rideParams(rideLocalDate(meta), s, { wellnessWeights, powerValid });
  const res = await workerCall({ type: 'recompute', meta, streams: first.streams, laps: first.laps, params }, Object.values(first.streams).filter(v => v?.buffer).map(v => v.buffer));
  const ride = buildRideRecord(meta, res.summary, first, { powerValid, note: ov?.note || (first.summary.powerSuspect ? first.summary.powerSuspectReason : '') });
  await db.put('raw', { id: ride.id, buffer, fileName, importedAt: Date.now() });
  await db.put('streams', { id: ride.id, streams: res.streams });
  await db.put('rides', ride);
  return { duplicate: false, ride };
}
function buildRideRecord(meta, summary, first, { powerValid, note }) {
  const { device, ...m } = meta;
  return {
    id: meta.hash, ...m, deviceSummary: device, hasPower: meta.channels.power, hasHr: meta.channels.hr, hasCad: meta.channels.cadence, hasGps: meta.channels.gps,
    powerValid, powerNote: note || '', excluded: false, name: autoName(meta), notes: '', rpe: null, tags: [],
    laps: summary.laps || first.laps, deviceClimbs: first.deviceClimbs || [], importedAt: new Date().toISOString(),
    ...summary,
  };
}
export async function importFiles(files) {
  const list = Array.from(files).filter(f => f.size > 12);
  if (!list.length) { toast('No files selected', { error: true }); return; }
  state.importing = list.length; renderNavBadge();
  let ok = 0, dup = 0, fail = 0, last = null;
  for (const f of list) {
    try {
      const buf = await f.arrayBuffer();
      const r = await importFile(buf, f.name, { silent: true });
      if (r.duplicate) dup++; else { ok++; last = r.ride; }
    } catch (e) { console.error('import failed', f.name, e); fail++; toast(`${f.name}: ${e.message}`, { error: true, ms: 6000 }); }
    state.importing--; renderNavBadge();
  }
  await refreshData();
  const parts = [];
  if (ok) parts.push(`${ok} ride${ok > 1 ? 's' : ''} imported`); if (dup) parts.push(`${dup} duplicate${dup > 1 ? 's' : ''} skipped`); if (fail) parts.push(`${fail} failed`);
  toast(parts.join(' · ') || 'Nothing imported');
  if (ok && getSettings().sync.autoPush && getSettings().sync.token) { import('./sync/github.js').then(m => m.pushAll(state.rides, () => {}).then(n => n && toast(`Backed up ${n} ride${n > 1 ? 's' : ''} to GitHub`)).catch(e => toast(`Backup failed: ${e.message}`, { error: true }))); }
  if (ok === 1 && last) navigate(`ride/${last.id}`); else render();
}
export async function recomputeRide(ride, extra = {}) {
  const st = await db.get('streams', ride.id);
  if (!st) throw new Error('Streams missing');
  const wellnessWeights = state.wellness.filter(w => w.weightKg > 0).map(w => ({ date: w.date, kg: w.weightKg }));
  const powerValid = extra.powerValid ?? ride.powerValid;
  const params = rideParams(rideLocalDate(ride), getSettings(), { wellnessWeights, powerValid });
  const meta = { ...ride, device: ride.deviceSummary, riderWeightKg: ride.riderWeightKg };
  const res = await workerCall({ type: 'recompute', meta, streams: st.streams, laps: ride.laps, params }, Object.values(st.streams).filter(v => v?.buffer).map(v => v.buffer));
  const updated = { ...ride, ...res.summary, powerValid, laps: res.summary.laps || ride.laps, ...(extra.note ? { powerNote: extra.note } : {}) };
  await db.put('streams', { id: ride.id, streams: res.streams });
  await db.put('rides', updated);
  return updated;
}
export async function recomputeAll(onProgress = () => {}) {
  const rides = await db.getAll('rides');
  const overrides = (await db.getSetting('overrides', [])) || []; // e.g. "power meter wasn't zeroed on this ride"
  let i = 0;
  for (const r of rides) {
    const ov = overrides.find(o => o.startUtc === r.startUtc && o.powerValid === false);
    try { await recomputeRide(r, ov ? { powerValid: false, note: ov.note } : {}); } catch (e) { console.warn('recompute failed', r.id, e); }
    onProgress(++i, rides.length);
  }
  await refreshData();
}
export async function deleteRide(id) {
  await db.delete('rides', id); await db.delete('streams', id); await db.delete('raw', id);
  await refreshData();
}
export async function updateRide(id, patch) {
  const r = await db.get('rides', id); if (!r) return;
  await db.put('rides', { ...r, ...patch });
  await refreshData();
}
export async function savePlan(plan) { state.plan = plan; await db.put('plans', plan); recomputePmc(); }

// ---------- weather ----------
export async function loadForecast(force = false) {
  const s = getSettings();
  if (!s.location?.lat) return null;
  try { state.forecast = await fetchForecast(s.location); } catch (e) { console.warn('forecast', e); if (force) toast('Weather unavailable right now', { error: true }); }
  return state.forecast;
}

// ---------- router ----------
export function navigate(path) { const target = '#/' + path.replace(/^#?\/?/, ''); if (location.hash === target) render(); else location.hash = target; }
function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = hash.split('/');
  return { name: name || 'home', params: { id: rest.join('/') } };
}
export function render() {
  const route = parseRoute(); state.route = route;
  const main = document.getElementById('view');
  if (state.activeCleanup) { try { state.activeCleanup(); } catch { /* ignore */ } state.activeCleanup = null; }
  destroyCharts();
  document.querySelectorAll('.modal-back').forEach(m => m.remove());
  clear(main);
  const fn = views[route.name] || views.home;
  try {
    const out = fn(main, route.params);
    if (typeof out === 'function') state.activeCleanup = out;
  } catch (e) { console.error(e); main.appendChild(h('div', { class: 'panel' }, h('h2', null, 'Something went wrong'), h('p', null, e.message), h('pre', { class: 'small' }, e.stack))); }
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === route.name || (route.name === 'ride' && a.dataset.nav === 'rides') || (['equipment', 'nutrition', 'settings', 'howto', 'workouts', 'gym', 'wellness', 'coach', 'glossary'].includes(route.name) && a.dataset.nav === 'more' && !a.dataset.side)));
  window.scrollTo({ top: 0 });
}
function renderNavBadge() {
  const b = document.getElementById('import-badge'); if (!b) return;
  b.textContent = state.importing ? `Importing ${state.importing}…` : ''; b.classList.toggle('show', state.importing > 0);
}

// ---------- layout ----------
const NAV = [
  { name: 'home', label: 'Home', icon: 'home' }, { name: 'rides', label: 'Rides', icon: 'rides' }, { name: 'analyze', label: 'Analyze', icon: 'analyze' },
  { name: 'train', label: 'Train', icon: 'train' }, { name: 'more', label: 'More', icon: 'more' },
];
const SIDE = [
  { name: 'home', label: 'Home', icon: 'home' }, { name: 'rides', label: 'Rides', icon: 'rides' }, { name: 'analyze', label: 'Analyze', icon: 'analyze' },
  { name: 'train', label: 'Train', icon: 'train' }, { name: 'gym', label: 'Gym', icon: 'gym' }, { name: 'wellness', label: 'Wellness', icon: 'heart' },
  { name: 'coach', label: 'Coach', icon: 'spark' }, { name: 'equipment', label: 'Maintenance', icon: 'wrench' }, { name: 'nutrition', label: 'Fueling', icon: 'food' },
  { name: 'glossary', label: 'Glossary', icon: 'info' }, { name: 'settings', label: 'Settings', icon: 'settings' }, { name: 'howto', label: 'How to', icon: 'help' },
];
function buildLayout() {
  const app = document.getElementById('app');
  clear(app);
  const fileInput = h('input', { type: 'file', multiple: true, style: { display: 'none' }, 'data-fit': '1', onChange: (e) => { importFiles(e.target.files); e.target.value = ''; } });
  const side = h('aside', { class: 'side' },
    h('a', { class: 'brand', href: '#/home' }, h('span', { class: 'brand-mark' }, 'R'), h('span', null, 'RiderHQ')),
    h('nav', { class: 'side-nav' }, SIDE.map(n => h('a', { href: `#/${n.name}`, 'data-nav': n.name, 'data-side': '1' }, icon(n.icon), n.label))),
    h('button', { class: 'btn primary import-btn', onClick: () => fileInput.click() }, icon('upload'), 'Import ride'),
    h('div', { id: 'import-badge', class: 'import-badge' }),
    h('button', { class: 'theme-btn theme-toggle', onClick: toggleTheme, 'aria-label': 'Change theme' }, icon('auto')),
  );
  const top = h('header', { class: 'topbar' }, h('a', { class: 'brand', href: '#/home' }, h('span', { class: 'brand-mark' }, 'R'), h('span', null, 'RiderHQ')), h('div', { class: 'top-actions' }, h('button', { class: 'icon-btn', onClick: () => fileInput.click(), 'aria-label': 'Import ride' }, icon('upload')), h('button', { class: 'icon-btn theme-toggle', onClick: toggleTheme, 'aria-label': 'Change theme' }, icon('auto'))));
  const main = h('main', { id: 'view', class: 'view' });
  main.append = (...children) => { append(main, children); };
  const bottom = h('nav', { class: 'bottom-nav' }, NAV.map(n => h('a', { href: `#/${n.name}`, 'data-nav': n.name }, icon(n.icon), h('span', null, n.label))));
  app.append(side, h('div', { class: 'content' }, top, main, bottom), fileInput);
  // drag & drop anywhere
  document.body.addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
  document.body.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  document.body.addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); if (e.dataTransfer?.files?.length) importFiles(e.dataTransfer.files); });
}
const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_LABEL = { system: 'Theme: follows your phone (day/night)', light: 'Theme: always light', dark: 'Theme: always dark' };
function applyTheme() {
  const t = getSettings().theme || 'system';
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  try { localStorage.setItem('ridehq.themePref', t); localStorage.setItem('ridehq.theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0f1b26' : '#1b2733');
  document.querySelectorAll('.theme-toggle').forEach(b => { b.innerHTML = ''; b.appendChild(icon(t === 'system' ? 'auto' : t === 'dark' ? 'moon' : 'sun')); b.setAttribute('aria-label', `${THEME_LABEL[t]} — tap to change`); b.title = THEME_LABEL[t]; });
  chartTheme();
}
async function toggleTheme() {
  const cur = getSettings().theme || 'system';
  const next = THEME_ORDER[(THEME_ORDER.indexOf(cur) + 1) % THEME_ORDER.length];
  await saveSettings({ theme: next });
  applyTheme(); render(); toast(THEME_LABEL[next]);
}

// ---------- install (Android / desktop Chrome) ----------
let deferredInstall = null;
export function isInstalled() { return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true; }
export function canInstall() { return !!deferredInstall; }
export async function promptInstall() {
  if (!deferredInstall) { toast('Use the browser menu ⋮ → Install app (or Add to Home screen → Install)', { ms: 6000 }); return false; }
  deferredInstall.prompt();
  const choice = await deferredInstall.userChoice.catch(() => null);
  deferredInstall = null;
  render();
  return choice?.outcome === 'accepted';
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; if (['home', 'howto', 'settings'].includes(state.route.name)) render(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; toast('RiderHQ installed — it now appears in your share menu'); });

// ---------- share-target inbox & file handling ----------
async function drainInbox() {
  try {
    const items = await db.getAll('inbox');
    if (!items.length) return;
    for (const it of items) { try { await importFile(it.buffer, it.name, { silent: true }); } catch (e) { toast(`${it.name}: ${e.message}`, { error: true }); } await db.delete('inbox', it.id); }
    await refreshData(); toast(`${items.length} shared file${items.length > 1 ? 's' : ''} imported`); render();
  } catch (e) { console.warn('inbox', e); }
}
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (launch) => {
    if (!launch.files?.length) return;
    const files = []; for (const fh of launch.files) files.push(await fh.getFile());
    importFiles(files);
  });
}

// ---------- boot ----------
export async function boot() {
  await loadSettings();
  buildLayout();
  applyTheme();
  await refreshData();
  const mv = await db.getSetting('metricsVersion', 1);
  if (mv < METRICS_VERSION && state.rides.length) { await recomputeAll(); }
  await db.setSetting('metricsVersion', METRICS_VERSION);
  render();
  window.addEventListener('hashchange', render);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (getSettings().theme === 'system') { applyTheme(); render(); } });
  requestPersistence();
  drainInbox();
  if ('serviceWorker' in navigator) { const hadController = !!navigator.serviceWorker.controller; let reloaded = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded && !state.importing) { reloaded = true; location.reload(); } }); navigator.serviceWorker.register('./sw.js').catch(e => console.warn('sw', e)); navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'shared-files') drainInbox(); }); }
  if (location.search.includes('share-target')) { history.replaceState(null, '', location.pathname + location.hash); drainInbox(); }
  loadForecast().then(() => { if (state.route.name === 'home' || state.route.name === 'train') render(); });
  const st = getSettings().sync;
  if (st?.token && st.owner && st.repo) import('./sync/github.js').then(async m => {
    if (m.profileEmpty()) {
      try { if (await m.adoptRemoteProfile()) { toast('Profile restored from your GitHub backup — recalculating rides…', { ms: 5000 }); await recomputeAll(); render(); toast('Rides recalculated with your FTP, heart-rate and weight'); } } catch (e) { console.warn('profile restore', e); }
    }
    return m.pullCoachNotes();
  }).then(async n => { if (n) { toast(`${n} new note${n > 1 ? 's' : ''} from Claude`); await refreshData(); if (['home', 'ride', 'coach', 'nutrition'].includes(state.route.name)) render(); } }).catch(e => console.warn('coach notes', e));
}
export { rideLocalDate, rideLocalTime, todayIso, addDays, isoDate, getSettings, saveSettings, db, h, icon, toast };
