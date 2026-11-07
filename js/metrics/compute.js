// RiderHQ — per-ride metrics engine. Pure functions; runs in a Worker and in Node.
import {
  powerZonesFor, hrZonesFor, threeZonePower, threeZoneHr, timeInZones, polarizationIndex, classifyDistribution, CADENCE_BUCKETS,
} from './zones.js';

export const MMP_DURATIONS = [1, 2, 3, 5, 8, 10, 12, 15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 420, 480, 600, 720, 900, 1200, 1500, 1800, 2400, 3000, 3600, 4500, 5400, 7200, 9000, 10800, 14400, 18000];

const isNum = v => Number.isFinite(v);
const round = (v, d = 0) => isNum(v) ? Math.round(v * 10 ** d) / 10 ** d : null;
const mean = arr => { let s = 0, c = 0; for (const v of arr) if (isNum(v)) { s += v; c++; } return c ? s / c : NaN; };
const minmax = arr => { let lo = Infinity, hi = -Infinity; for (const v of arr) if (isNum(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } return lo === Infinity ? [NaN, NaN] : [lo, hi]; };

/** Prefix-sum helper that treats NaN as 0. */
function prefix(arr) {
  const cs = new Float64Array(arr.length + 1);
  for (let i = 0; i < arr.length; i++) cs[i + 1] = cs[i] + (isNum(arr[i]) ? arr[i] : 0);
  return cs;
}

/** Best mean over `d` consecutive samples; returns {value, start} or null. */
function bestMean(cs, d) {
  const n = cs.length - 1;
  if (d > n) return null;
  let best = -Infinity, bi = 0;
  for (let i = 0; i + d <= n; i++) { const v = cs[i + d] - cs[i]; if (v > best) { best = v; bi = i; } }
  return { value: best / d, start: bi };
}

/** Normalized Power: 30-sample rolling mean, 4th-power average. Samples assumed 1 Hz; NaN → 0. */
export function normalizedPower(power) {
  const n = power.length;
  if (n < 30) return NaN;
  const cs = prefix(power);
  let sum4 = 0, c = 0;
  for (let i = 30; i <= n; i++) { const m = (cs[i] - cs[i - 30]) / 30; sum4 += m ** 4; c++; }
  return c ? Math.pow(sum4 / c, 0.25) : NaN;
}

function circularMean(values) {
  let sx = 0, sy = 0, c = 0;
  for (const v of values) { if (!isNum(v)) continue; const r = v * Math.PI / 180; sx += Math.cos(r); sy += Math.sin(r); c++; }
  if (!c) return NaN;
  let a = Math.atan2(sy, sx) * 180 / Math.PI; if (a < 0) a += 360; return a;
}

/** Banister TRIMP (male coefficients) per sample and the 1-hour-at-LTHR reference. */
export function trimpOf(hr, { hrrest, hrmax, lthr, female = false }) {
  const a = female ? 0.86 : 0.64, b = female ? 1.67 : 1.92;
  const range = hrmax - hrrest;
  if (!(range > 0)) return { trimp: NaN, hrTss: NaN };
  let trimp = 0;
  for (let i = 0; i < hr.length; i++) {
    const h = hr[i]; if (!isNum(h)) continue;
    const r = Math.min(1.2, Math.max(0, (h - hrrest) / range));
    trimp += (1 / 60) * r * a * Math.exp(b * r);
  }
  const rl = Math.min(1.2, Math.max(0, (lthr - hrrest) / range));
  const ref = 60 * rl * a * Math.exp(b * rl);
  return { trimp, hrTss: ref > 0 ? trimp / ref * 100 : NaN };
}

/** Smooth an array with a centered moving average of `w` samples (NaN-aware). */
function smooth(arr, w) {
  const n = arr.length, out = new Float32Array(n), half = Math.floor(w / 2);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) if (isNum(arr[j])) { s += arr[j]; c++; }
    out[i] = c ? s / c : NaN;
  }
  return out;
}

/** Ascent/descent from a smoothed altitude with a 2 m hysteresis. */
function elevationGain(altSmooth) {
  let gain = 0, loss = 0, ref = NaN;
  for (let i = 0; i < altSmooth.length; i++) {
    const a = altSmooth[i]; if (!isNum(a)) continue;
    if (!isNum(ref)) { ref = a; continue; }
    const d = a - ref;
    if (d >= 2) { gain += d; ref = a; } else if (d <= -2) { loss += -d; ref = a; }
  }
  return { gain, loss };
}

export function climbCategory(lengthM, avgGradePct) {
  if (!(avgGradePct >= 3) || !(lengthM > 0)) return null;
  const score = lengthM * avgGradePct;
  if (score >= 80000) return 'HC';
  if (score >= 64000) return 'Cat 1';
  if (score >= 32000) return 'Cat 2';
  if (score >= 16000) return 'Cat 3';
  if (score >= 8000) return 'Cat 4';
  return null;
}

/** Detect climbs from distance (m) and altitude (m) streams. Returns climbs with sample indices. */
export function detectClimbs(S, { weightKg } = {}) {
  const { dist, alt, t } = S;
  if (!alt || !dist) return [];
  const n = dist.length;
  // Downsample to ~25 m points
  const pts = [];
  let nextD = dist[0];
  const altS = smooth(alt, 9);
  for (let i = 0; i < n; i++) {
    if (dist[i] >= nextD && isNum(altS[i])) { pts.push({ i, d: dist[i], a: altS[i] }); nextD = dist[i] + 25; }
  }
  if (pts.length < 10) return [];
  const climbs = [];
  let startK = 0, peakK = 0, minK = 0;
  const close = (sK, pK) => {
    const s = pts[sK], p = pts[pK];
    const len = p.d - s.d, gain = p.a - s.a;
    if (len < 300 || gain < 20) return;
    const grade = gain / len * 100;
    if (grade < 3) return;
    // max grade over 100 m windows
    let maxG = 0;
    for (let k = sK; k < pK; k++) {
      let m = k; while (m < pK && pts[m].d - pts[k].d < 100) m++;
      const dd = pts[m].d - pts[k].d; if (dd < 50) continue;
      const g = Math.min(40, (pts[m].a - pts[k].a) / dd * 100);
      if (g > maxG) maxG = g;
    }
    const i0 = s.i, i1 = p.i;
    const sec = t[i1] - t[i0];
    const slice = (arr) => arr ? arr.subarray(i0, i1 + 1) : null;
    const pw = slice(S.power), hr = slice(S.hr), cad = slice(S.cad);
    const avgPower = pw ? mean(pw) : NaN;
    climbs.push({
      i0, i1, startDist: s.d, lengthM: len, gainM: gain, avgGrade: grade, maxGrade: maxG, seconds: sec,
      vam: sec > 0 ? gain / (sec / 3600) : NaN,
      avgPower, wkg: isNum(avgPower) && weightKg ? avgPower / weightKg : NaN,
      avgHr: hr ? mean(hr) : NaN, avgCad: cad ? mean(cad.filter?.(v => v > 0) ?? cad) : NaN,
      category: climbCategory(len, grade),
    });
  };
  for (let k = 1; k < pts.length; k++) {
    if (pts[k].a > pts[peakK].a) peakK = k;
    if (pts[k].a < pts[minK].a) minK = k;
    const gainSoFar = pts[peakK].a - pts[startK].a;
    const drop = pts[peakK].a - pts[k].a;
    if (peakK > startK && drop > Math.max(10, 0.15 * gainSoFar)) {
      close(startK, peakK);
      startK = k; peakK = k; minK = k;
    } else if (peakK === startK || gainSoFar < 2) {
      // still searching for the base of a climb: move start to the running minimum
      if (pts[k].a <= pts[startK].a) { startK = k; peakK = k; minK = k; }
    }
  }
  if (peakK > startK) close(startK, peakK);
  return climbs;
}

/**
 * Compute the full per-ride summary.
 * @param {object} act  normalized activity from parse.js
 * @param {object} p    rider parameters effective at ride date:
 *   {ftp, cp, wprime, lthr, hrmax, hrrest, weightKg, hrZoneModel, zonesSkipZero, lt1Pct, lt2Pct, female}
 */
export function computeRide(act, p) {
  const S = act.streams, n = S.t.length, m = act.meta;
  const ftp = p.ftp || 150, weightKg = p.weightKg || m.riderWeightKg || 75;
  const hrmax = p.hrmax || 185, hrrest = p.hrrest || 60, lthr = p.lthr || Math.round(hrmax * 0.9);
  const skipZero = p.zonesSkipZero !== false;
  const hasPower = !!S.power && m.channels.power && p.powerValid !== false;
  const hasHr = !!S.hr;
  const filler = S.filler || new Uint8Array(n);
  let fillers = 0; for (let i = 0; i < n; i++) fillers += filler[i];
  const real = n - fillers;
  const out = {
    samples: n, elapsedSec: S.t[n - 1] - S.t[0], timerSec: real,
    distanceM: isNum(m.device.distance) ? m.device.distance : (S.dist[n - 1] - S.dist[0]),
    paramsUsed: { ftp, lthr, hrmax, hrrest, weightKg, hrZoneModel: p.hrZoneModel || 'pctmax', zonesSkipZero: skipZero },
  };

  // Moving time & speed
  let movingSec = 0; if (S.speed) for (let i = 0; i < n; i++) if (S.speed[i] > 0.5) movingSec++;
  out.movingSec = S.speed ? movingSec : real;
  out.avgSpeed = out.distanceM / real;                    // m/s over timer time (device convention)
  out.maxSpeed = S.speed ? minmax(S.speed)[1] : NaN;

  // Elevation
  if (S.alt) {
    const altS = smooth(S.alt, 5);
    const { gain, loss } = elevationGain(altS);
    out.ascentM = isNum(m.device.ascent) ? m.device.ascent : gain;
    out.descentM = isNum(m.device.descent) ? m.device.descent : loss;
    out.ascentComputedM = gain;
    [out.minAlt, out.maxAlt] = minmax(S.alt);
    if (S.grade) [out.minGrade, out.maxGrade] = minmax(S.grade);
  }

  // Temperature
  if (S.temp) { out.avgTemp = mean(S.temp); [out.minTemp, out.maxTemp] = minmax(S.temp); }

  // Heart rate
  if (hasHr) {
    out.avgHr = mean(S.hr); [out.minHr, out.maxHr] = minmax(S.hr);
    const hz = hrZonesFor(p.hrZoneModel || 'pctmax', { hrmax, lthr });
    out.hrZones = hz.map(z => ({ key: z.key, name: z.name, lo: z.lo, hi: z.hi, color: z.color }));
    out.tizHr = timeInZones(S.hr, hz).seconds;
    const tr = trimpOf(S.hr, { hrrest, hrmax, lthr, female: !!p.female });
    out.trimp = tr.trimp; out.hrTss = tr.hrTss;
    const csHr = prefix(S.hr);
    out.mmpHr = MMP_DURATIONS.map(d => { const b = bestMean(csHr, d); return b ? round(b.value, 1) : null; });
  }

  // Cadence
  if (S.cad) {
    const nz = Array.from(S.cad).filter(v => isNum(v) && v > 0);
    out.avgCad = nz.length ? mean(nz) : NaN; out.maxCad = nz.length ? minmax(nz)[1] : NaN;
    out.cadHist = CADENCE_BUCKETS.map(b => ({ key: b.key, seconds: nz.filter(v => v >= b.lo && v <= b.hi).length, color: b.color }));
    out.cadZeroSec = n - nz.length;
  }

  // Power
  if (hasPower) {
    const pw = S.power;
    let sum = 0, cnt = 0, zeros = 0, maxP = 0;
    for (let i = 0; i < n; i++) { if (filler[i]) continue; const v = pw[i]; if (!isNum(v)) continue; sum += v; cnt++; if (v <= 0) zeros++; if (v > maxP) maxP = v; }
    out.avgPower = cnt ? sum / cnt : NaN; out.maxPower = maxP;
    out.avgPowerNonZero = cnt - zeros ? sum / (cnt - zeros) : NaN;
    out.coastingSec = zeros; out.coastingPct = cnt ? zeros / cnt * 100 : NaN;
    out.np = normalizedPower(pw);
    out.if = out.np / ftp;
    out.tss = (real / 3600) * out.if * out.if * 100;
    out.vi = out.np / out.avgPower;
    out.workKj = sum / 1000;
    out.wkg = out.avgPower / weightKg; out.npWkg = out.np / weightKg;
    const pz = powerZonesFor(ftp);
    out.powerZones = pz.map(z => ({ key: z.key, name: z.name, lo: z.lo, hi: z.hi, color: z.color }));
    const pwReal = fillers ? pw.map((v, i) => filler[i] ? NaN : v) : pw;
    out.tizPower = timeInZones(pwReal, pz, { skipZero }).seconds;
    out.tizPowerInclZero = skipZero ? timeInZones(pwReal, pz, { skipZero: false }).seconds : out.tizPower;
    const tz = threeZonePower(ftp, p.lt1Pct || 0.75, p.lt2Pct || 1.05);
    out.tiz3 = timeInZones(pwReal, tz, { skipZero }).seconds;
    out.tiz3Source = 'power';
    const cs = prefix(pw);
    out.mmp = MMP_DURATIONS.map(d => { const b = bestMean(cs, d); return b ? round(b.value, 1) : null; });
    out.mmpStart = MMP_DURATIONS.map(d => { const b = bestMean(cs, d); return b ? b.start : null; });
    if (hasHr) {
      out.ef = out.np / out.avgHr;
      // Aerobic decoupling (Pw:Hr) on rides ≥ 60 min: skip first 10 min, compare halves
      if (n >= 3600) {
        const s0 = 600, mid = s0 + Math.floor((n - s0) / 2);
        const np1 = normalizedPower(pw.subarray(s0, mid)), np2 = normalizedPower(pw.subarray(mid, n));
        const hr1 = mean(S.hr.subarray(s0, mid)), hr2 = mean(S.hr.subarray(mid, n));
        const ef1 = np1 / hr1, ef2 = np2 / hr2;
        out.decoupling = (ef1 - ef2) / ef1 * 100; out.ef1 = ef1; out.ef2 = ef2;
      }
    }
    // FTP sanity: NP above FTP for ≥ 60 min means FTP is set too low
    out.ftpSuspectLow = real >= 3600 && out.if > 1.0;

    // Cycling dynamics
    if (S.balR) {
      let wR = 0, wP = 0, c = 0, single = 0;
      for (let i = 0; i < n; i++) {
        const r = S.balR[i], v = pw[i];
        if (!isNum(r) || !isNum(v) || v <= 0) continue;
        wR += r * v; wP += v; c++;
        if (r === 0 || r === 100) single++;
      }
      if (c) { out.balanceRight = wR / wP; out.balanceLeft = 100 - out.balanceRight; out.balanceSamples = c; }
      if (c > 100 && single / c > 0.7) { out.powerSuspect = true; out.powerSuspectReason = 'Single-sided power data (one pedal not transmitting) — likely doubled/inflated readings.'; }
      const te = (arr) => { let s = 0, k = 0; for (let i = 0; i < n; i++) { const v = arr[i]; if (isNum(v) && v > 0 && pw[i] > 0) { s += v; k++; } } return k ? s / k : NaN; };
      if (S.teL) { out.teLeft = te(S.teL); out.teRight = te(S.teR); }
      if (S.psL) { out.psLeft = te(S.psL); out.psRight = te(S.psR); }
      if (S.ppL0) {
        const sel = (arr) => { const o = []; for (let i = 0; i < n; i++) if (pw[i] > 0 && isNum(arr[i]) && !(arr[i] === 0 && S.ppL1[i] === 0)) o.push(arr[i]); return o; };
        out.powerPhase = {
          left: { start: circularMean(sel(S.ppL0)), end: circularMean(sel(S.ppL1)), peakStart: circularMean(sel(S.ppkL0)), peakEnd: circularMean(sel(S.ppkL1)) },
          right: { start: circularMean(sel(S.ppR0)), end: circularMean(sel(S.ppR1)), peakStart: circularMean(sel(S.ppkR0)), peakEnd: circularMean(sel(S.ppkR1)) },
        };
      }
    }
    // W'bal (Skiba differential) when CP/W' known
    const cp = p.cp || ftp, wprime = p.wprime || 15000;
    let wbal = wprime, minW = wprime, minAt = 0; const curve = [];
    for (let i = 0; i < n; i++) {
      const v = isNum(pw[i]) ? pw[i] : 0;
      if (v > cp) wbal -= (v - cp); else wbal += (wprime - wbal) * (cp - v) / wprime;
      if (wbal < minW) { minW = wbal; minAt = i; }
      if (i % 10 === 0) curve.push(Math.round(wbal));
    }
    out.wbalMin = minW; out.wbalMinAt = minAt; out.wbalCurve = curve; out.cpUsed = cp; out.wprimeUsed = wprime;
  }

  // 3-zone from HR when no power
  if (!hasPower && hasHr) {
    out.tiz3 = timeInZones(S.hr, threeZoneHr(lthr)).seconds; out.tiz3Source = 'hr';
  }
  if (out.tiz3) {
    const [a, b, c] = out.tiz3;
    out.polarizationIndex = polarizationIndex(a, b, c);
    out.distributionClass = classifyDistribution(a, b, c);
  }

  // Standing / seated
  if (S.standing) {
    let st = 0, trans = 0, prev = 0, pSt = 0, pSe = 0, cSt = 0, cSe = 0, nSt = 0, nSe = 0, cadStN = 0, cadSeN = 0;
    for (let i = 0; i < n; i++) {
      if (filler[i]) continue;
      const s = S.standing[i]; if (s) st++; if (s !== prev && s) trans++; prev = s;
      if (S.power && isNum(S.power[i]) && S.power[i] > 0) { if (s) { pSt += S.power[i]; nSt++; } else { pSe += S.power[i]; nSe++; } }
      if (S.cad && isNum(S.cad[i]) && S.cad[i] > 0) { if (s) { cSt += S.cad[i]; cadStN++; } else { cSe += S.cad[i]; cadSeN++; } }
    }
    out.standingSec = st; out.standCount = trans;
    if (hasPower) { out.avgPowerStanding = nSt ? pSt / nSt : NaN; out.avgPowerSeated = nSe ? pSe / nSe : NaN; }
    if (S.cad) { out.avgCadStanding = cadStN ? cSt / cadStN : NaN; out.avgCadSeated = cadSeN ? cSe / cadSeN : NaN; }
  }

  // Climbs & terrain
  if (S.alt && S.dist) {
    out.climbs = detectClimbs(S, { weightKg });
    out.climbCount = out.climbs.length;
    out.climbGainM = out.climbs.reduce((a, c) => a + c.gainM, 0);
    out.climbSec = out.climbs.reduce((a, c) => a + c.seconds, 0);
    if (S.grade) {
      let up = 0, down = 0, flat = 0, upP = 0, upN = 0;
      for (let i = 0; i < n; i++) { const g = S.grade[i]; if (!isNum(g)) continue; if (g >= 3) { up++; if (hasPower && isNum(S.power[i])) { upP += S.power[i]; upN++; } } else if (g <= -3) down++; else flat++; }
      out.terrain = { upSec: up, downSec: down, flatSec: flat, avgPowerUp: upN ? upP / upN : NaN };
    }
  }

  // Energy
  out.kcal = hasPower ? out.workKj : (isNum(m.device.calories) ? m.device.calories : NaN);
  out.deviceCalories = m.device.calories;

  // Training load used for PMC
  if (hasPower && isNum(out.tss)) { out.load = out.tss; out.loadSource = 'power'; }
  else if (hasHr && isNum(out.hrTss)) { out.load = out.hrTss; out.loadSource = 'hr'; }
  else { out.load = real / 3600 * 50; out.loadSource = 'duration'; }

  // Laps: fill NP where missing
  out.laps = (act.laps || []).map(l => ({ ...l }));
  for (const l of out.laps) {
    if (hasPower && !isNum(l.np) && isNum(l.start)) {
      const i0 = S.t.findIndex(v => v >= l.start); const i1 = Math.min(n, i0 + Math.round(l.timer || l.elapsed || 0));
      if (i0 >= 0 && i1 - i0 >= 30) l.np = normalizedPower(S.power.subarray(i0, i1));
    }
  }
  // Round floats for storage friendliness
  for (const k of Object.keys(out)) if (typeof out[k] === 'number') out[k] = round(out[k], 3);
  return out;
}
