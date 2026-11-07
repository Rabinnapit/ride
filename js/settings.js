// RiderHQ — settings, rider profile and unit handling.
import { db } from './db.js';

export const DEFAULT_SETTINGS = {
  profile: {
    name: '', dob: '', sex: 'male', heightCm: null, weightKg: null,
    hrmax: null, hrrest: null, lthr: null,
    ftpHistory: [],            // [{date:'YYYY-MM-DD', ftp:153, note:''}]
    weightHistory: [],         // [{date, kg}]
    cp: null, wprime: 15000,
  },
  zones: { hrModel: 'pctmax', skipZero: true, lt1Pct: 0.75, lt2Pct: 1.05 },
  units: { distance: 'km', elevation: 'm', weight: 'lb', temperature: 'F' },
  goals: {
    event: { name: 'Incheon → Busan (4 Rivers path)', date: '2027-05-29', distanceKm: 633, days: 6, climbPerDayM: 500, steepestGradePct: 12 },
    priorities: ['climbing', 'endurance'],
    targetFtp: null, targetWeightKg: null,
    groupA: { label: 'Group A club ride', avgKmh: 32, ftpWkg: 3.2 }, // the weekend fast group: typical pace and the W/kg that holds it
    notes: 'Climb better; comfortable 100–150 km rides with repeated ~10% hills; finish the 633 km Incheon→Busan ride in 6 days (late May / early June 2027).',
  },
  schedule: {
    longRideDay: 6, secondRideDay: 0,          // 0 = Sunday … 6 = Saturday
    weekdayRideDays: [2, 4], weekdayRideMin: 45,
    gymDays: [1, 3], gymMin: 60, restDays: [5],
    outdoorMinTempF: 35, indoorAvailableFrom: '2026-11-27',
    hoursPerWeek: 7, maxIntensityDays: 2,
  },
  ai: { provider: 'gemini', geminiKey: '', geminiModel: '', claudeKey: '', claudeModel: 'claude-sonnet-5-5', temperature: 0.3 },
  coach: { chatUrl: 'https://claude.ai/code/session_01NLohHEiF3yTEd2nd3iAH8T' },
  sync: { owner: '', repo: 'ridehq-data', branch: 'main', token: '', autoPush: false, lastPush: null, lastPull: null, pushed: {} },
  location: { lat: 36.99, lon: 127.09, name: 'Pyeongtaek' },
  pmc: { ctlDays: 42, atlDays: 7 },
  theme: 'system',
  onboarded: false,
};

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function deepMerge(base, over) {
  if (Array.isArray(base) || Array.isArray(over)) return over !== undefined ? over : base;
  if (typeof base !== 'object' || base === null) return over !== undefined ? over : base;
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = deepMerge(base[k], over[k]);
  return out;
}

let cache = null;
export async function loadSettings() {
  const stored = await db.getSetting('app', null);
  cache = deepMerge(DEFAULT_SETTINGS, stored || {});
  return cache;
}
export function getSettings() { return cache || deepMerge(DEFAULT_SETTINGS, {}); }
export async function saveSettings(patch) {
  cache = deepMerge(getSettings(), patch);
  await db.setSetting('app', cache);
  return cache;
}
export async function replaceSettings(full) {
  cache = deepMerge(DEFAULT_SETTINGS, full || {});
  await db.setSetting('app', cache);
  return cache;
}

// ---------- rider parameters effective at a date ----------
export function ftpAt(dateIso, s = getSettings()) {
  const hist = [...(s.profile.ftpHistory || [])].filter(h => h.ftp > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (!hist.length) return null;
  const d = (dateIso || '').slice(0, 10);
  let cur = hist[0].ftp;
  for (const h of hist) if (h.date <= d) cur = h.ftp;
  return cur;
}
export function currentFtp(s = getSettings()) { return ftpAt('9999-12-31', s); }
export function weightAt(dateIso, s = getSettings(), wellnessWeights = []) {
  const d = (dateIso || '').slice(0, 10);
  const hist = [...(s.profile.weightHistory || []), ...wellnessWeights].filter(w => w.kg > 0).sort((a, b) => a.date.localeCompare(b.date));
  let cur = s.profile.weightKg || null;
  for (const h of hist) if (h.date <= d) cur = h.kg;
  return cur;
}
export function ageAt(dateIso, s = getSettings()) {
  if (!s.profile.dob) return null;
  const dob = new Date(s.profile.dob), d = new Date(dateIso || Date.now());
  let a = d.getFullYear() - dob.getFullYear();
  const m = d.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && d.getDate() < dob.getDate())) a--;
  return a;
}
export function hrmaxEstimate(s = getSettings()) {
  const age = ageAt(new Date().toISOString(), s);
  return age ? Math.round(208 - 0.7 * age) : 185;
}
/** Parameters passed to the metrics engine for a ride starting at dateIso. */
export function rideParams(dateIso, s = getSettings(), { wellnessWeights = [], powerValid = true } = {}) {
  const hrmax = s.profile.hrmax || hrmaxEstimate(s);
  return {
    ftp: ftpAt(dateIso, s) || 150,
    cp: s.profile.cp || null,
    wprime: s.profile.wprime || 15000,
    lthr: s.profile.lthr || Math.round(hrmax * 0.9),
    hrmax,
    hrrest: s.profile.hrrest || 60,
    weightKg: weightAt(dateIso, s, wellnessWeights) || 75,
    hrZoneModel: s.zones.hrModel,
    zonesSkipZero: s.zones.skipZero,
    lt1Pct: s.zones.lt1Pct, lt2Pct: s.zones.lt2Pct,
    female: s.profile.sex === 'female',
    powerValid,
  };
}

// ---------- units ----------
const KM_PER_MI = 1.609344, LB_PER_KG = 2.2046226, FT_PER_M = 3.280839895;
export const units = {
  dist(m, s = getSettings()) { const km = m / 1000; return s.units.distance === 'mi' ? { v: km / KM_PER_MI, u: 'mi' } : { v: km, u: 'km' }; },
  distStr(m, d = 1, s = getSettings()) { const x = this.dist(m, s); return Number.isFinite(x.v) ? `${x.v.toFixed(d)} ${x.u}` : '–'; },
  speed(ms, s = getSettings()) { const kmh = ms * 3.6; return s.units.distance === 'mi' ? { v: kmh / KM_PER_MI, u: 'mph' } : { v: kmh, u: 'km/h' }; },
  speedStr(ms, d = 1, s = getSettings()) { const x = this.speed(ms, s); return Number.isFinite(x.v) ? `${x.v.toFixed(d)} ${x.u}` : '–'; },
  elev(m, s = getSettings()) { return s.units.elevation === 'ft' ? { v: m * FT_PER_M, u: 'ft' } : { v: m, u: 'm' }; },
  elevStr(m, s = getSettings()) { const x = this.elev(m, s); return Number.isFinite(x.v) ? `${Math.round(x.v).toLocaleString()} ${x.u}` : '–'; },
  weight(kg, s = getSettings()) { return s.units.weight === 'lb' ? { v: kg * LB_PER_KG, u: 'lb' } : { v: kg, u: 'kg' }; },
  weightStr(kg, d = 1, s = getSettings()) { const x = this.weight(kg, s); return Number.isFinite(x.v) ? `${x.v.toFixed(d)} ${x.u}` : '–'; },
  weightToKg(v, s = getSettings()) { return s.units.weight === 'lb' ? v / LB_PER_KG : v; },
  temp(c, s = getSettings()) { return s.units.temperature === 'F' ? { v: c * 9 / 5 + 32, u: '°F' } : { v: c, u: '°C' }; },
  tempStr(c, s = getSettings()) { const x = this.temp(c, s); return Number.isFinite(x.v) ? `${Math.round(x.v)}${x.u}` : '–'; },
  fToC(f) { return (f - 32) * 5 / 9; },
};

export function fmtDuration(sec, { short = false } = {}) {
  if (!Number.isFinite(sec)) return '–';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  if (short) return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export function fmtNum(v, d = 0) { return Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : '–'; }
export function isoDate(d) { const x = d instanceof Date ? d : new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
export function todayIso() { return isoDate(new Date()); }
export function addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDate(d); }
export function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
export function dowOf(iso) { return new Date(iso + 'T12:00:00').getDay(); }
/** Local date (YYYY-MM-DD) of a ride given its UTC start and the FIT's tz offset. */
export function rideLocalDate(ride) {
  const off = Number.isFinite(ride.tzOffsetMin) ? ride.tzOffsetMin : -new Date().getTimezoneOffset();
  return new Date(new Date(ride.startUtc).getTime() + off * 60000).toISOString().slice(0, 10);
}
export function rideLocalTime(ride) {
  const off = Number.isFinite(ride.tzOffsetMin) ? ride.tzOffsetMin : -new Date().getTimezoneOffset();
  return new Date(new Date(ride.startUtc).getTime() + off * 60000).toISOString().slice(11, 16);
}
export function fmtDate(iso, opts = { month: 'short', day: 'numeric' }) {
  if (!iso) return '–';
  return new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, opts);
}
