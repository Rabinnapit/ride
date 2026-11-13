// RiderHQ — weather (Open-Meteo), fueling maths, equipment/maintenance rules, backup/restore helpers.
import { db } from '../db.js';
import { getSettings, replaceSettings, todayIso, addDays } from '../settings.js';

// ---------- weather ----------
let weatherCache = { key: '', at: 0, data: null };
export async function fetchForecast({ lat, lon }) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (weatherCache.key === key && Date.now() - weatherCache.at < 30 * 60000) return weatherCache.data;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max,sunrise&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7`;
  // never let a slow network hold up the plan generator or the home screen
  const res = await fetch(url, typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(6000) } : {});
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
// kind: 'service' = do it again every interval (tap Done); 'replace' = swap the part (tap Replaced).
// km/days: whichever comes first. group: how the Equipment page groups them.
export const COMPONENT_TYPES = [
  // drivetrain
  { key: 'wax', kind: 'service', group: 'Drivetrain', label: 'Chain wax', km: 400, note: 'Re-wax (hot or immersion wax) every ~400 km, and after any wet ride. Drip-wax top-ups stretch it a little.' },
  { key: 'chain', kind: 'replace', group: 'Drivetrain', label: 'Chain', km: 6000, note: 'Waxed chains last far longer than oiled ones. Replace at 0.5% stretch on a chain checker (12-speed); check every 1,000 km.' },
  { key: 'cassette', kind: 'replace', group: 'Drivetrain', label: 'Cassette', km: 15000, note: 'Every 2–3 chains on a waxed drivetrain; replace sooner if a new chain skips.' },
  { key: 'chainring', kind: 'replace', group: 'Drivetrain', label: 'Chainrings', km: 25000, note: 'Every 3–5 chains, or when teeth look hooked.' },
  // tires & wheels
  { key: 'tire_rear', kind: 'replace', group: 'Tires & wheels', label: 'Rear tire', km: 4000, note: 'Carries most of your weight and the drive, so it wears about twice as fast as the front. Replace at the wear indicator, a flat-topped profile, or any cut.' },
  { key: 'tire_front', kind: 'replace', group: 'Tires & wheels', label: 'Front tire', km: 6000, note: 'Lasts longer than the rear. Never put a worn tire on the front: front grip is what keeps you upright.' },
  { key: 'sealant', kind: 'service', group: 'Tires & wheels', label: 'Tubeless sealant', days: 90, note: 'Top up every 2–4 months; sooner in summer heat. Skip if you run inner tubes.' },
  { key: 'wheels', kind: 'service', group: 'Tires & wheels', label: 'Wheel true & spokes', days: 365, km: 8000, note: 'Spin each wheel: no wobble or rub at the brake pads. Yearly shop check of spoke tension and hub bearings.' },
  // brakes
  { key: 'pads', kind: 'replace', group: 'Brakes', label: 'Disc brake pads', km: 2500, note: 'Shimano: replace at 0.5 mm of pad material (or 2.5 mm pad + plate). Check every 1,000 km; much sooner after wet, gritty rides.' },
  { key: 'rotors', kind: 'replace', group: 'Brakes', label: 'Disc rotors', km: 15000, note: 'Replace when thinner than 1.5 mm (measure with calipers) or warped.' },
  { key: 'bleed', kind: 'service', group: 'Brakes', label: 'Hydraulic brake bleed', days: 365, note: 'Yearly with Shimano mineral oil, or sooner if a lever feels spongy or pulls to the bar.' },
  // shifting
  { key: 'di2', kind: 'service', group: 'Shifting', label: 'Di2 battery charge', km: 1000, days: 45, note: 'Charge before a long ride or the tour. When low, the front derailleur stops first, then the rear.' },
  { key: 'coincell', kind: 'service', group: 'Shifting', label: 'Di2 shifter coin cells (CR1632)', days: 540, note: 'Each shifter has one; replace every 1.5–2 years or when the E-Tube app says low.' },
  { key: 'cables', kind: 'replace', group: 'Shifting', label: 'Shift cables & housing', km: 5000, days: 365, note: 'Mechanical groupsets only. Sluggish shifting means replace.' },
  // frame & cockpit
  { key: 'torque', kind: 'service', group: 'Frame & cockpit', label: 'Bolt torque check', days: 30, note: 'Torque wrench on stem/bar, seat clamp, thru-axles and rotor bolts. On a carbon frame and integrated bar, use the printed limits (often 5 Nm) and carbon paste. Never guess on carbon.' },
  { key: 'headset', kind: 'service', group: 'Frame & cockpit', label: 'Headset check / service', km: 5000, days: 180, note: 'Hold the front brake and rock the bike: any knock means play. With an integrated cockpit and internal routing, a full service is a shop job.' },
  { key: 'bb', kind: 'service', group: 'Frame & cockpit', label: 'Bottom bracket (T47)', km: 8000, days: 365, note: 'Threaded T47 is easy to service. Check for play and creaks; clean and regrease yearly.' },
  { key: 'seatpost', kind: 'service', group: 'Frame & cockpit', label: 'Seatpost clean & carbon paste', days: 180, note: 'Pull the aero post, wipe, fresh carbon assembly paste, reinstall at the marked height and torque. Stops creaks and seizing.' },
  { key: 'bartape', kind: 'replace', group: 'Frame & cockpit', label: 'Bar tape', km: 6000, days: 365, note: 'Replace when slippery or torn; grip matters on long days.' },
  { key: 'frame', kind: 'service', group: 'Frame & cockpit', label: 'Carbon frame inspection', days: 90, note: 'Clean the bike and look for cracks or chips, especially at the fork, dropouts and after any crash or drop.' },
  // pedals & you
  { key: 'cleats', kind: 'replace', group: 'Pedals & fit', label: 'Cleats', km: 5000, note: 'Replace when the grip pads wear through or clipping in feels loose. Mark the position before swapping.' },
  { key: 'pmbattery', kind: 'service', group: 'Pedals & fit', label: 'Power pedal charge (P715)', days: 21, note: 'Charge per the Magene app. And zero-offset the pedals before every ride: an un-zeroed pedal is what spoiled the first Nov 3 test.' },
  { key: 'fit', kind: 'service', group: 'Pedals & fit', label: 'Bike fit check', days: 365, note: 'After big fitness or flexibility changes, or any new pain.' },
];
export const typeOf = key => COMPONENT_TYPES.find(t => t.key === key) || { key, kind: 'replace', group: 'Other', label: key };

export function componentStatus(c, bikeOdometerKm, today = todayIso()) {
  const type = typeOf(c.type);
  const limitKm = c.limitKm || type.km, limitDays = c.limitDays || type.days;
  let usedKm = null, usedDays = null, pct = 0;
  if (limitKm && Number.isFinite(c.installedOdoKm)) { usedKm = Math.max(0, bikeOdometerKm - c.installedOdoKm); pct = Math.max(pct, usedKm / limitKm); }
  if (limitDays && c.installedDate) { usedDays = Math.max(0, Math.round((new Date(today) - new Date(c.installedDate)) / 86400000)); pct = Math.max(pct, usedDays / limitDays); }
  const kmLeft = limitKm && usedKm != null ? limitKm - usedKm : null, daysLeft = limitDays && usedDays != null ? limitDays - usedDays : null;
  const soonAt = type.kind === 'service' && limitKm && limitKm <= 600 ? 0.75 : 0.8; // short intervals warn a ride earlier
  return { usedKm, usedDays, limitKm, limitDays, kmLeft, daysLeft, pct, kind: type.kind, state: pct >= 1 ? 'due' : pct >= soonAt ? 'soon' : 'ok' };
}
/** Plain words: "Due now", "Due in 85 km", "Due in 12 days". */
export function dueText(st) {
  if (st.state === 'due') { const over = st.kmLeft != null && st.kmLeft < 0 ? `${Math.round(-st.kmLeft)} km over` : st.daysLeft != null && st.daysLeft < 0 ? `${-st.daysLeft} days over` : ''; return over ? `Due now (${over})` : 'Due now'; }
  const parts = [];
  if (st.kmLeft != null) parts.push(`${Math.round(st.kmLeft).toLocaleString()} km`);
  if (st.daysLeft != null) parts.push(`${st.daysLeft} days`);
  return parts.length ? `Due in ${parts.join(' or ')}` : '';
}
/** Winspace C5 Aero preset: frame-specific items plus the drivetrain/tire/brake set. */
export function presetC5Aero({ di2 = true, tubeless = false } = {}) {
  const keys = ['wax', 'chain', 'cassette', 'chainring', 'tire_rear', 'tire_front', 'wheels', 'pads', 'rotors', 'bleed', 'torque', 'headset', 'bb', 'seatpost', 'bartape', 'frame', 'cleats', 'pmbattery', 'fit'];
  if (tubeless) keys.splice(6, 0, 'sealant');
  if (di2) keys.splice(keys.indexOf('torque'), 0, 'di2', 'coincell'); else keys.splice(keys.indexOf('torque'), 0, 'cables');
  return keys;
}

// ---------- backup / restore ----------
const bufToB64 = (buf) => { const bytes = new Uint8Array(buf); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
export const b64ToBuf = (b) => { const bin = atob(b); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.buffer; };

export async function exportBackup({ includeFit = false } = {}) {
  const rides = (await db.getAll('rides')).map(({ streams, ...r }) => r);
  const out = { app: 'RiderHQ', version: 1, exportedAt: new Date().toISOString(), settings: getSettings(), rides, wellness: await db.getAll('wellness'), plans: await db.getAll('plans'), gymlog: await db.getAll('gymlog'), equipment: await db.getAll('equipment'), planlog: await db.getAll('planlog'), ai: await db.getAll('ai') };
  if (includeFit) { out.raw = []; for (const r of rides) { const raw = await db.get('raw', r.id); if (raw) out.raw.push({ id: r.id, fileName: raw.fileName, b64: bufToB64(raw.buffer) }); } }
  return out;
}
export async function importBackup(obj, { importRide }) {
  if (!obj || !['RiderHQ', 'RideHQ'].includes(obj.app)) throw new Error('Not a RiderHQ backup file');
  if (obj.settings) await replaceSettings(obj.settings);
  if (Array.isArray(obj.overrides)) { const cur = (await db.getSetting('overrides', [])) || []; const merged = [...cur.filter(c => !obj.overrides.some(o => o.startUtc === c.startUtc)), ...obj.overrides]; await db.setSetting('overrides', merged); }
  for (const store of ['wellness', 'plans', 'gymlog', 'equipment', 'planlog', 'ai']) if (Array.isArray(obj[store]) && obj[store].length) await db.bulkPut(store, obj[store]);
  let n = 0;
  if (Array.isArray(obj.raw)) for (const r of obj.raw) { try { await importRide(b64ToBuf(r.b64), r.fileName || `${r.id}.fit`); n++; } catch (e) { console.warn('restore ride failed', e); } }
  else if (Array.isArray(obj.rides)) { const existing = new Set(await db.getAllKeys('rides')); const toPut = obj.rides.filter(r => !existing.has(r.id)); if (toPut.length) await db.bulkPut('rides', toPut); n = toPut.length; }
  return n;
}
export { addDays };
