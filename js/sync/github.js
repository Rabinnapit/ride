// RideHQ — backup/sync of raw FIT files and app data to a (private) GitHub repository via the Contents API.
import { db } from '../db.js';
import { getSettings, saveSettings } from '../settings.js';

const API = 'https://api.github.com';

function cfg() {
  const s = getSettings().sync;
  if (!s.owner || !s.repo || !s.token) throw new Error('Set the repository owner, name and token in Settings → Sync first.');
  return s;
}
async function gh(path, { method = 'GET', body, raw = false } = {}) {
  const s = cfg();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${s.token}`, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 300)}`);
  if (raw) return res.arrayBuffer();
  return res.status === 204 ? null : res.json();
}
const b64 = (buf) => { const bytes = new Uint8Array(buf); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
const b64text = (str) => btoa(unescape(encodeURIComponent(str)));

export async function testConnection() {
  const s = cfg();
  const repo = await gh(`/repos/${s.owner}/${s.repo}`);
  if (!repo) throw new Error('Repository not found — check owner/name, and that the token has access to it.');
  return { name: repo.full_name, private: repo.private, branch: repo.default_branch };
}

async function putFile(path, contentB64, message) {
  const s = cfg();
  const existing = await gh(`/repos/${s.owner}/${s.repo}/contents/${path}?ref=${encodeURIComponent(s.branch || 'main')}`);
  const body = { message, content: contentB64, branch: s.branch || 'main' };
  if (existing?.sha) {
    if (existing.content && existing.content.replace(/\n/g, '') === contentB64) return { skipped: true };
    body.sha = existing.sha;
  }
  return gh(`/repos/${s.owner}/${s.repo}/contents/${path}`, { method: 'PUT', body });
}

/** Push one ride's raw FIT + summary JSON. */
export async function pushRide(ride, onStatus = () => {}) {
  const raw = await db.get('raw', ride.id);
  if (!raw) throw new Error('Raw FIT missing for this ride');
  const y = ride.startUtc.slice(0, 4);
  const base = `rides/${y}/${ride.startUtc.replace(/[:]/g, '').slice(0, 15)}_${ride.id.slice(0, 8)}`;
  onStatus(`Uploading ${base}.fit`);
  await putFile(`${base}.fit`, b64(raw.buffer), `Add ride ${ride.startUtc.slice(0, 10)}`);
  const { streams, ...summary } = ride;
  await putFile(`${base}.json`, b64text(JSON.stringify(summary)), `Summary ${ride.startUtc.slice(0, 10)}`);
  const s = getSettings().sync;
  await saveSettings({ sync: { pushed: { ...s.pushed, [ride.id]: base }, lastPush: new Date().toISOString() } });
  return base;
}

/** Push settings (without secrets), wellness, plans, gym and equipment as JSON documents. */
export async function pushData(onStatus = () => {}) {
  const s = getSettings();
  const safe = JSON.parse(JSON.stringify(s)); safe.ai.geminiKey = ''; safe.ai.claudeKey = ''; safe.sync.token = '';
  const docs = {
    'data/settings.json': safe,
    'data/wellness.json': await db.getAll('wellness'),
    'data/plans.json': await db.getAll('plans'),
    'data/gymlog.json': await db.getAll('gymlog'),
    'data/equipment.json': await db.getAll('equipment'),
    'data/planlog.json': await db.getAll('planlog'),
    'data/overrides.json': (await db.getSetting('overrides', [])) || [],
  };
  for (const [path, doc] of Object.entries(docs)) { onStatus(`Uploading ${path}`); await putFile(path, b64text(JSON.stringify(doc, null, 1)), `Update ${path}`); }
  await saveSettings({ sync: { lastPush: new Date().toISOString() } });
}

export async function pushAll(rides, onStatus = () => {}) {
  const pushed = getSettings().sync.pushed || {};
  let n = 0;
  for (const r of rides) if (!pushed[r.id]) { await pushRide(r, onStatus); n++; }
  await pushData(onStatus);
  return n;
}

/** List remote FIT files; returns [{path, sha, size}]. */
export async function listRemoteRides() {
  const s = cfg();
  const years = await gh(`/repos/${s.owner}/${s.repo}/contents/rides?ref=${encodeURIComponent(s.branch || 'main')}`);
  const out = [];
  for (const y of years || []) {
    if (y.type !== 'dir') continue;
    const files = await gh(`/repos/${s.owner}/${s.repo}/contents/${y.path}?ref=${encodeURIComponent(s.branch || 'main')}`);
    for (const f of files || []) if (f.name.endsWith('.fit')) out.push({ path: f.path, sha: f.sha, size: f.size, name: f.name });
  }
  return out;
}
export async function downloadRemote(path) {
  const s = cfg();
  return gh(`/repos/${s.owner}/${s.repo}/contents/${path}?ref=${encodeURIComponent(s.branch || 'main')}`, { raw: true });
}
export async function pullData() {
  const s = cfg();
  const get = async (p) => { const r = await gh(`/repos/${s.owner}/${s.repo}/contents/${p}?ref=${encodeURIComponent(s.branch || 'main')}`, { raw: true }); return r ? JSON.parse(new TextDecoder().decode(r)) : null; };
  return { settings: await get('data/settings.json'), wellness: await get('data/wellness.json'), plans: await get('data/plans.json'), gymlog: await get('data/gymlog.json'), equipment: await get('data/equipment.json'), planlog: await get('data/planlog.json'), overrides: await get('data/overrides.json') };
}
