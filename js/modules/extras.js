// RideHQ — weather (Open-Meteo), fueling maths, equipment/maintenance rules, backup/restore helpers.
import { db } from '../db.js';
import { getSettings, replaceSettings, todayIso, addDays } from '../settings.js';

// ---------- weather ----------
let weatherCache = { key: '', at: 0, data: null };
export async function fetchForecast({ lat, lon }) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (weatherCache.key === key && Date.now() - weatherCache.at < 30 * 60000) return weatherCache.data;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max,sunrise&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather ${res.status}`);
  const j = await res.json();
  const byDate = {};
  (j.daily?.time || []).forEach((d, i) => { byDate[d] = { date: d, tMinF: j.daily.temperature_2m_min[i], tMaxF: j.daily.temperature_2m_max[i], precipPct: j.daily.precipitation_probability_max[i], windMax: j.daily.wind_speed_10m_max[i], sunrise: j.daily.sunrise[i] }; });
  (j.hourly?.time || []).forEach((t, i) => {
    const d = t.slice(0, 10), h = +t.slice(11, 13);
    if (!byDate[d]) return;
    if (h === 7) { byDate[d].t7amF = j.hourly.temperature_2m[i]; byDate[d].tMin7amF = j.hourly.temperature_2m[i]; byDate[d].wind7 = j.hourly.wind_speed_10m[i]; byDate[d].code7 = j.hourly.weather_code[i]; }
    if (h === 9) byDate[d].t9amF = j.hourly.temperature_2m[i];
    if (h === 12) byDate[d].tNoonF = j.hourly.temperature_2m[i];
  });
  for (const d of Object.values(byDate)) if (d.tMin7amF == null) d.tMin7amF = d.tMinF;
  weatherCache = { key, at: Date.now(), data: byDate };
  return byDate;
}
export function weatherIcon(code) {
  if (code == null) return '';
  if (code === 0) return '☀️'; if (code <= 2) return '🌤'; if (code === 3) return '☁️'; if (code <= 48) return '🌫'; if (code <= 67) return '🌧'; if (code <= 77) return '🌨'; if (code <= 82) return '🌦'; if (code <= 86) return '🌨'; return '⛈';
}
export function rideCall(day, settings) {
  if (!day) return null;
  const min = settings.schedule.outdoorMinTempF ?? 35;
  const t = day.t7amF ?? day.tMinF;
  const late = day.tNoonF ?? day.tMaxF;
  if (t >= min && (day.precipPct ?? 0) < 60) return { ok: true, label: 'Outside', detail: `${Math.round(t)}°F at 7 am` };
  if (late >= min && (day.precipPct ?? 0) < 60) return { ok: true, label: 'Outside later', detail: `${Math.round(t)}°F at 7 am, ${Math.round(late)}°F by noon` };
  const trainer = !settings.schedule.indoorAvailableFrom || day.date >= settings.schedule.indoorAvailableFrom;
  return { ok: false, label: trainer ? 'Indoor' : 'Gym / rest', detail: t < min ? `${Math.round(t)}°F — below your ${min}°F cutoff` : `${day.precipPct}% rain` };
}

// ---------- fueling ----------
export function fuelingPlan({ hours, intensityIf = 0.7, weightKg = 75, tempF = 60 }) {
  let carbsPerHour = hours < 1 ? 0 : hours < 2.5 ? (intensityIf > 0.8 ? 60 : 45) : (intensityIf > 0.75 ? 90 : 75);
  if (hours >= 1 && hours < 2.5 && intensityIf <= 0.8) carbsPerHour = 40;
  const fluidPerHour = tempF > 80 ? 800 : tempF > 65 ? 650 : 500;
  const sodiumPerHour = tempF > 80 ? 600 : 400;
  const kcalEstimate = Math.round(hours * 60 * 60 * intensityIf * intensityIf * 0.0 + 0); // placeholder replaced by caller when kJ known
  return {
    carbsPerHour, carbsTotal: Math.round(carbsPerHour * hours), fluidPerHour, fluidTotal: Math.round(fluidPerHour * hours), sodiumPerHour,
    preRide: `${Math.round(weightKg * 1.5)}–${Math.round(weightKg * 2.5)} g carbs 2–3 h before (e.g. rice/oats + banana), 500 ml fluid.`,
    recovery: `${Math.round(weightKg * 1.0)} g carbs + ${Math.round(weightKg * 0.3)} g protein within 1 h; repeat carbs hourly for 3–4 h if riding again tomorrow.`,
    examples: carbsPerHour >= 60 ? '60 g/h ≈ 2 gels, or 1 gel + 500 ml sports drink, or a rice cake + half a banana. 90 g/h needs glucose + fructose (2:1) and a trained gut.' : '40–45 g/h ≈ one gel + a few sips of sports drink, or a banana and a bar every hour.',
    kcalEstimate,
  };
}
export function eventFueling(ev, weightKg, ftp) {
  const perDayKm = ev.distanceKm / ev.days;
  const hours = perDayKm / 20; // conservative touring speed
  const kjPerDay = Math.round(hours * 3600 * (ftp || 150) * 0.62 / 1000);
  return { perDayKm, hours, kjPerDay, carbsOnBike: Math.round(hours * 70), carbLoad: `${Math.round(weightKg * 8)}–${Math.round(weightKg * 10)} g carbs/day for 2 days before day 1`, daily: `On tour days: breakfast ${Math.round(weightKg * 2)} g carbs 2 h before rolling; 60–90 g/h on the bike (${Math.round(hours * 70)} g/day); recovery meal within the hour; ${Math.round(kjPerDay)} kcal of riding energy per day on top of ~2,200 kcal baseline.` };
}

// ---------- equipment ----------
export const COMPONENT_TYPES = [
  { key: 'chain', label: 'Chain', km: 3500, note: 'Replace at 0.5% stretch (11/12-speed). Lube every 300–500 km and after rain.' },
  { key: 'cassette', label: 'Cassette', km: 10000, note: 'Usually every 2–3 chains; replace if a new chain skips.' },
  { key: 'tire_rear', label: 'Rear tire', km: 4000, note: 'Wear indicator / squared-off profile / cuts.' },
  { key: 'tire_front', label: 'Front tire', km: 6500, note: 'Lasts longer than the rear; swap when the rear is new.' },
  { key: 'pads', label: 'Brake pads', km: 2500, note: 'Disc: < 0.5 mm friction material. Rim: wear line.' },
  { key: 'bartape', label: 'Bar tape', km: 6000, note: 'Replace when slippery or torn — grip matters on long days.' },
  { key: 'cables', label: 'Cables / housing', km: 5000, note: 'Sluggish shifting = replace. Yearly for mechanical groupsets.' },
  { key: 'sealant', label: 'Tubeless sealant', days: 120, note: 'Top up every 2–6 months; sooner in heat.' },
  { key: 'bb', label: 'Bottom bracket / bearings', km: 8000, note: 'Service for play or noise; yearly check.' },
  { key: 'chainring', label: 'Chainrings', km: 20000, note: 'Every 3–5 chains or when teeth hook.' },
  { key: 'bleed', label: 'Hydraulic brake bleed', days: 365, note: 'Yearly, or when the lever feels spongy.' },
  { key: 'fit', label: 'Bike fit check', days: 365, note: 'After big fitness or flexibility changes, or any new pain.' },
];
export function componentStatus(c, bikeOdometerKm, today = todayIso()) {
  const type = COMPONENT_TYPES.find(t => t.key === c.type) || {};
  const limitKm = c.limitKm || type.km, limitDays = c.limitDays || type.days;
  let usedKm = null, usedDays = null, pct = 0;
  if (limitKm && Number.isFinite(c.installedOdoKm)) { usedKm = Math.max(0, bikeOdometerKm - c.installedOdoKm); pct = Math.max(pct, usedKm / limitKm); }
  if (limitDays && c.installedDate) { usedDays = Math.round((new Date(today) - new Date(c.installedDate)) / 86400000); pct = Math.max(pct, usedDays / limitDays); }
  return { usedKm, usedDays, limitKm, limitDays, pct, state: pct >= 1 ? 'due' : pct >= 0.8 ? 'soon' : 'ok' };
}

// ---------- backup / restore ----------
const bufToB64 = (buf) => { const bytes = new Uint8Array(buf); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
export const b64ToBuf = (b) => { const bin = atob(b); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.buffer; };

export async function exportBackup({ includeFit = false } = {}) {
  const rides = (await db.getAll('rides')).map(({ streams, ...r }) => r);
  const out = { app: 'RideHQ', version: 1, exportedAt: new Date().toISOString(), settings: getSettings(), rides, wellness: await db.getAll('wellness'), plans: await db.getAll('plans'), gymlog: await db.getAll('gymlog'), equipment: await db.getAll('equipment'), planlog: await db.getAll('planlog'), ai: await db.getAll('ai') };
  if (includeFit) { out.raw = []; for (const r of rides) { const raw = await db.get('raw', r.id); if (raw) out.raw.push({ id: r.id, fileName: raw.fileName, b64: bufToB64(raw.buffer) }); } }
  return out;
}
export async function importBackup(obj, { importRide }) {
  if (!obj || obj.app !== 'RideHQ') throw new Error('Not a RideHQ backup file');
  if (obj.settings) await replaceSettings(obj.settings);
  if (Array.isArray(obj.overrides)) { const cur = (await db.getSetting('overrides', [])) || []; const merged = [...cur.filter(c => !obj.overrides.some(o => o.startUtc === c.startUtc)), ...obj.overrides]; await db.setSetting('overrides', merged); }
  for (const store of ['wellness', 'plans', 'gymlog', 'equipment', 'planlog', 'ai']) if (Array.isArray(obj[store]) && obj[store].length) await db.bulkPut(store, obj[store]);
  let n = 0;
  if (Array.isArray(obj.raw)) for (const r of obj.raw) { try { await importRide(b64ToBuf(r.b64), r.fileName || `${r.id}.fit`); n++; } catch (e) { console.warn('restore ride failed', e); } }
  else if (Array.isArray(obj.rides)) { const existing = new Set(await db.getAllKeys('rides')); const toPut = obj.rides.filter(r => !existing.has(r.id)); if (toPut.length) await db.bulkPut('rides', toPut); n = toPut.length; }
  return n;
}
export { addDays };
