// RideHQ — aggregation across rides: time windows, PMC, trends, power profile, eFTP, load metrics.
import { MMP_DURATIONS } from './compute.js';
import { polarizationIndex, classifyDistribution } from './zones.js';
import { rideLocalDate, addDays, daysBetween, todayIso } from '../settings.js';

const isNum = v => Number.isFinite(v);
const sum = a => a.reduce((x, y) => x + (isNum(y) ? y : 0), 0);
const mean = a => { const v = a.filter(isNum); return v.length ? sum(v) / v.length : NaN; };

export const WINDOWS = [
  { key: 'ride', label: 'Ride' }, { key: '1d', label: 'Today', days: 1 }, { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 }, { key: '60d', label: '60 days', days: 60 }, { key: '90d', label: '90 days', days: 90 },
  { key: 'all', label: 'All' }, { key: 'custom', label: 'Custom' },
];

/** Rides whose local date is within [from, to] inclusive (YYYY-MM-DD). */
export function ridesInRange(rides, from, to) {
  return rides.filter(r => { const d = rideLocalDate(r); return (!from || d >= from) && (!to || d <= to); })
    .sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}
export function windowRange(key, { customFrom, customTo, anchor = todayIso() } = {}) {
  const w = WINDOWS.find(x => x.key === key);
  if (!w) return { from: null, to: null };
  if (key === 'all') return { from: null, to: anchor };
  if (key === 'custom') return { from: customFrom || addDays(anchor, -27), to: customTo || anchor };
  if (key === 'ride') return { from: anchor, to: anchor };
  return { from: addDays(anchor, -(w.days - 1)), to: anchor };
}

function addArrays(target, arr) {
  if (!arr) return target;
  if (!target) return arr.slice();
  for (let i = 0; i < arr.length; i++) target[i] = (target[i] || 0) + (arr[i] || 0);
  return target;
}
function maxArrays(target, arr) {
  if (!arr) return target;
  if (!target) return arr.slice();
  for (let i = 0; i < arr.length; i++) if (isNum(arr[i]) && (!isNum(target[i]) || arr[i] > target[i])) target[i] = arr[i];
  return target;
}

/** Aggregate a list of rides (summaries) into window totals/averages/distributions. */
export function aggregate(rides) {
  const o = { rides: rides.length, days: new Set(rides.map(rideLocalDate)).size };
  const pw = rides.filter(r => r.hasPower && r.powerValid !== false && isNum(r.np));
  o.powerRides = pw.length;
  o.timerSec = sum(rides.map(r => r.timerSec));
  o.elapsedSec = sum(rides.map(r => r.elapsedSec));
  o.distanceM = sum(rides.map(r => r.distanceM));
  o.ascentM = sum(rides.map(r => r.ascentM));
  o.workKj = sum(pw.map(r => r.workKj));
  o.kcal = sum(rides.map(r => r.kcal));
  o.load = sum(rides.map(r => r.load));
  o.tss = sum(pw.map(r => r.tss));
  o.hrTss = sum(rides.filter(r => isNum(r.hrTss)).map(r => r.hrTss));
  o.avgSpeed = o.timerSec ? o.distanceM / o.timerSec : NaN;
  o.maxSpeed = Math.max(...rides.map(r => r.maxSpeed).filter(isNum), -Infinity);
  if (o.maxSpeed === -Infinity) o.maxSpeed = NaN;
  // time-weighted HR / power
  const hrR = rides.filter(r => isNum(r.avgHr));
  o.avgHr = hrR.length ? sum(hrR.map(r => r.avgHr * r.timerSec)) / sum(hrR.map(r => r.timerSec)) : NaN;
  o.maxHr = Math.max(...hrR.map(r => r.maxHr).filter(isNum), -Infinity); if (o.maxHr === -Infinity) o.maxHr = NaN;
  o.avgPower = pw.length ? sum(pw.map(r => r.avgPower * r.timerSec)) / sum(pw.map(r => r.timerSec)) : NaN;
  o.np = pw.length ? Math.pow(sum(pw.map(r => r.np ** 4 * r.timerSec)) / sum(pw.map(r => r.timerSec)), 0.25) : NaN;
  o.maxPower = Math.max(...pw.map(r => r.maxPower).filter(isNum), -Infinity); if (o.maxPower === -Infinity) o.maxPower = NaN;
  o.if = mean(pw.map(r => r.if));
  o.vi = mean(pw.map(r => r.vi));
  o.ef = mean(pw.map(r => r.ef));
  o.decoupling = mean(pw.filter(r => isNum(r.decoupling)).map(r => r.decoupling));
  const cadR = rides.filter(r => isNum(r.avgCad));
  o.avgCad = cadR.length ? sum(cadR.map(r => r.avgCad * (r.timerSec - (r.cadZeroSec || 0)))) / sum(cadR.map(r => r.timerSec - (r.cadZeroSec || 0))) : NaN;
  // balance / dynamics weighted by work
  const bal = pw.filter(r => isNum(r.balanceRight));
  o.balanceRight = bal.length ? sum(bal.map(r => r.balanceRight * r.workKj)) / sum(bal.map(r => r.workKj)) : NaN;
  o.balanceLeft = isNum(o.balanceRight) ? 100 - o.balanceRight : NaN;
  const w = (k) => { const rr = pw.filter(r => isNum(r[k])); return rr.length ? sum(rr.map(r => r[k] * r.timerSec)) / sum(rr.map(r => r.timerSec)) : NaN; };
  o.teLeft = w('teLeft'); o.teRight = w('teRight'); o.psLeft = w('psLeft'); o.psRight = w('psRight');
  o.standingSec = sum(rides.map(r => r.standingSec));
  o.coastingSec = sum(pw.map(r => r.coastingSec));
  o.coastingPct = pw.length ? o.coastingSec / sum(pw.map(r => r.timerSec)) * 100 : NaN;
  // zones
  o.tizPower = null; o.tizHr = null; o.tiz3 = null; o.cadHist = null;
  for (const r of rides) {
    if (r.hasPower && r.powerValid !== false) o.tizPower = addArrays(o.tizPower, r.tizPower);
    o.tizHr = addArrays(o.tizHr, r.tizHr);
    o.tiz3 = addArrays(o.tiz3, r.tiz3);
    if (r.cadHist) o.cadHist = addArrays(o.cadHist, r.cadHist.map(h => h.seconds));
  }
  o.powerZones = pw[pw.length - 1]?.powerZones || rides.find(r => r.powerZones)?.powerZones || null;
  o.hrZones = rides.find(r => r.hrZones)?.hrZones || null;
  if (o.tiz3) { const [a, b, c] = o.tiz3; o.polarizationIndex = polarizationIndex(a, b, c); o.distributionClass = classifyDistribution(a, b, c); }
  // MMP union
  o.mmp = null; o.mmpHr = null;
  for (const r of pw) o.mmp = maxArrays(o.mmp, r.mmp);
  for (const r of rides) o.mmpHr = maxArrays(o.mmpHr, r.mmpHr);
  // climbing
  o.climbCount = sum(rides.map(r => r.climbCount));
  o.climbGainM = sum(rides.map(r => r.climbGainM));
  o.climbSec = sum(rides.map(r => r.climbSec));
  o.longestRideM = Math.max(0, ...rides.map(r => r.distanceM || 0));
  o.longestRideSec = Math.max(0, ...rides.map(r => r.timerSec || 0));
  o.indoorRides = rides.filter(r => r.indoor).length;
  return o;
}

/** Daily load map {date: load} using local ride dates. */
export function dailyLoads(rides) {
  const m = new Map();
  for (const r of rides) { const d = rideLocalDate(r); m.set(d, (m.get(d) || 0) + (isNum(r.load) ? r.load : 0)); }
  return m;
}

/**
 * Performance Management Chart series from the first ride to `to` (+ optional planned loads beyond today).
 * Exact exponential form: CTL_d = CTL_{d-1}·e^(-1/42) + TSS·(1 - e^(-1/42)).
 */
export function pmcSeries(rides, { ctlDays = 42, atlDays = 7, to = todayIso(), from = null, planned = new Map(), extendDays = 0 } = {}) {
  const loads = dailyLoads(rides);
  const dates = [...loads.keys()].sort();
  if (!dates.length) return [];
  const start = from && from < dates[0] ? from : dates[0];
  const end = addDays(to, extendDays);
  const kc = Math.exp(-1 / ctlDays), ka = Math.exp(-1 / atlDays);
  const out = [];
  let ctl = 0, atl = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const prevCtl = ctl, prevAtl = atl;
    const actual = loads.get(d);
    const tss = d > to ? (planned.get(d) || 0) : (actual || 0);
    ctl = ctl * kc + tss * (1 - kc);
    atl = atl * ka + tss * (1 - ka);
    out.push({ date: d, tss, ctl, atl, tsb: prevCtl - prevAtl, future: d > to, planned: d > to ? (planned.get(d) || 0) : 0 });
  }
  return out;
}
export function pmcAt(series, date) { return series.find(p => p.date === date) || series[series.length - 1] || null; }

/** Load-management metrics on the last 7/28 days: ACWR (EWMA), Foster monotony/strain, ramp rate. */
export function loadMetrics(rides, pmc, to = todayIso()) {
  const loads = dailyLoads(rides);
  const last = (n) => { const a = []; for (let i = n - 1; i >= 0; i--) a.push(loads.get(addDays(to, -i)) || 0); return a; };
  const w7 = last(7), w28 = last(28);
  const m7 = mean(w7), sd7 = Math.sqrt(mean(w7.map(v => (v - m7) ** 2)));
  const monotony = sd7 > 0 ? m7 / sd7 : (m7 > 0 ? 9.9 : 0);
  const strain = sum(w7) * monotony;
  // EWMA ACWR
  let ewA = 0, ewC = 0; const la = 2 / 8, lc = 2 / 29;
  for (const v of w28) { ewA = ewA * (1 - la) + v * la; ewC = ewC * (1 - lc) + v * lc; }
  const acwr = ewC > 0 ? ewA / ewC : NaN;
  const today = pmcAt(pmc, to), weekAgo = pmcAt(pmc, addDays(to, -7));
  const rampRate = today && weekAgo ? today.ctl - weekAgo.ctl : NaN;
  return { weekLoad: sum(w7), fourWeekLoad: sum(w28), monotony, strain, acwr, rampRate, ctl: today?.ctl ?? 0, atl: today?.atl ?? 0, tsb: today?.tsb ?? 0 };
}

export const COGGAN_PROFILE = [ // W/kg lower bounds for men: [5s, 1min, 5min, FTP]
  { cat: 'World class', min: [22.0, 10.7, 7.0, 5.7] },
  { cat: 'Exceptional', min: [20.0, 9.9, 6.2, 5.1] },
  { cat: 'Excellent', min: [18.0, 9.0, 5.5, 4.5] },
  { cat: 'Very good', min: [16.5, 8.3, 4.8, 3.9] },
  { cat: 'Good', min: [14.5, 7.5, 4.1, 3.3] },
  { cat: 'Moderate', min: [12.5, 6.7, 3.4, 2.7] },
  { cat: 'Fair', min: [11.0, 6.0, 2.7, 2.1] },
  { cat: 'Novice', min: [9.0, 5.0, 2.2, 1.7] },
  { cat: 'Untrained', min: [0, 0, 0, 0] },
];
export function cogganCategory(colIdx, wkg) {
  if (!isNum(wkg)) return null;
  for (let i = 0; i < COGGAN_PROFILE.length; i++) if (wkg >= COGGAN_PROFILE[i].min[colIdx]) return { cat: COGGAN_PROFILE[i].cat, rank: COGGAN_PROFILE.length - 1 - i };
  return { cat: 'Untrained', rank: 0 };
}
export function recreationalBand(ftpWkg) {
  if (!isNum(ftpWkg)) return null;
  if (ftpWkg >= 4.0) return 'Racer (Zwift A level)';
  if (ftpWkg >= 3.2) return 'Strong amateur (Zwift B level)';
  if (ftpWkg >= 2.5) return 'Solid club rider (Zwift C level)';
  if (ftpWkg >= 2.0) return 'Fit beginner (Zwift D level)';
  return 'Building the base (below Zwift D)';
}

/** Power profile from an MMP array: best 5s/1m/5m/20m and FTP → W/kg, categories, limiter. */
export function powerProfile(mmp, ftp, weightKg) {
  if (!mmp || !weightKg) return null;
  const at = d => mmp[MMP_DURATIONS.indexOf(d)];
  const cols = [
    { key: '5s', label: '5 s sprint', w: at(5) }, { key: '1m', label: '1 min', w: at(60) },
    { key: '5m', label: '5 min', w: at(300) }, { key: 'ftp', label: 'FTP', w: ftp },
  ].map((c, i) => ({ ...c, wkg: isNum(c.w) ? c.w / weightKg : NaN, ...(cogganCategory(i, isNum(c.w) ? c.w / weightKg : NaN) || {}) }));
  const ranked = cols.filter(c => isNum(c.rank));
  let weakest = null, strongest = null;
  if (ranked.length) { weakest = ranked.reduce((a, b) => b.rank < a.rank ? b : a); strongest = ranked.reduce((a, b) => b.rank > a.rank ? b : a); }
  return { cols, weakest, strongest, band: recreationalBand(ftp / weightKg) };
}

/**
 * Estimate FTP from an MMP curve: (a) 95% of best 20-min, (b) CP from a linear fit of work vs time over 3–20 min efforts.
 * Returns {eftp, method, cp, wprime, from20} — confidence rises with longer maximal efforts.
 */
export function estimateFtp(mmp) {
  if (!mmp) return null;
  const at = d => mmp[MMP_DURATIONS.indexOf(d)];
  const p20 = at(1200), p60 = at(3600);
  const from20 = isNum(p20) ? 0.95 * p20 : NaN;
  const pts = [180, 300, 480, 600, 720, 900, 1200].map(d => ({ t: d, p: at(d) })).filter(x => isNum(x.p));
  let cp = NaN, wprime = NaN;
  if (pts.length >= 3) {
    // W = CP·t + W'  (least squares)
    const n = pts.length, sx = sum(pts.map(x => x.t)), sy = sum(pts.map(x => x.p * x.t)), sxx = sum(pts.map(x => x.t * x.t)), sxy = sum(pts.map(x => x.t * x.p * x.t));
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const icpt = (sy - slope * sx) / n;
    cp = slope; wprime = icpt;
    if (!(wprime > 0 && wprime < 60000) || !(cp > 50)) { cp = NaN; wprime = NaN; }
  }
  let eftp = NaN, method = '';
  if (isNum(p60) && p60 > (from20 || 0)) { eftp = p60; method = 'best 60-min power'; }
  else if (isNum(from20)) { eftp = from20; method = '95% of best 20-min'; }
  if (isNum(cp) && (!isNum(eftp) || cp > eftp)) { eftp = Math.min(cp, isNum(from20) ? from20 * 1.05 : cp); method = 'critical-power fit'; }
  return { eftp: isNum(eftp) ? Math.round(eftp) : null, method, cp: isNum(cp) ? Math.round(cp) : null, wprime: isNum(wprime) ? Math.round(wprime) : null, from20: isNum(from20) ? Math.round(from20) : null, p20: isNum(p20) ? Math.round(p20) : null };
}

/** Series of a metric by ride date for trend charts. */
export function trend(rides, key, { minTimerSec = 0, powerOnly = false } = {}) {
  return rides.filter(r => isNum(r[key]) && r.timerSec >= minTimerSec && (!powerOnly || (r.hasPower && r.powerValid !== false)))
    .map(r => ({ date: rideLocalDate(r), value: r[key], id: r.id, timerSec: r.timerSec }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Weekly buckets (Mon–Sun) for the last `weeks` weeks. */
export function weeklyBuckets(rides, weeks = 12, to = todayIso()) {
  const dow = new Date(to + 'T12:00:00').getDay();
  const thisMonday = addDays(to, -((dow + 6) % 7));
  const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const from = addDays(thisMonday, -7 * w), until = addDays(from, 6);
    const rs = ridesInRange(rides, from, until);
    out.push({ from, to: until, rides: rs.length, timerSec: sum(rs.map(r => r.timerSec)), distanceM: sum(rs.map(r => r.distanceM)), load: sum(rs.map(r => r.load)), ascentM: sum(rs.map(r => r.ascentM)), tiz3: rs.reduce((acc, r) => addArrays(acc, r.tiz3), null) });
  }
  return out;
}

/** Consecutive-day capacity: best 2-day and 3-day distance blocks. */
export function multiDayBlocks(rides) {
  const byDay = new Map();
  for (const r of rides) { const d = rideLocalDate(r); byDay.set(d, (byDay.get(d) || 0) + r.distanceM); }
  const days = [...byDay.keys()].sort();
  let best2 = 0, best3 = 0;
  for (let i = 0; i < days.length; i++) {
    const d0 = days[i], d1 = addDays(d0, 1), d2 = addDays(d0, 2);
    const a = byDay.get(d0) || 0, b = byDay.get(d1) || 0, c = byDay.get(d2) || 0;
    if (b) best2 = Math.max(best2, a + b);
    if (b && c) best3 = Math.max(best3, a + b + c);
  }
  return { best2DayM: best2, best3DayM: best3 };
}

export { daysBetween };
