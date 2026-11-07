// RiderHQ — zone models. Boundaries use floor(pct × anchor) upper bounds so they match the Magene/OnelapFit tables.

export const POWER_ZONES = [
  { z: 1, key: 'ar', name: 'Recovery', pct: [0, 0.55], color: '#7589A8' },
  { z: 2, key: 'end', name: 'Endurance', pct: [0.55, 0.75], color: '#1A63C9' },
  { z: 3, key: 'tempo', name: 'Tempo', pct: [0.75, 0.90], color: '#2E9E4F' },
  { z: 4, key: 'lt', name: 'Threshold', pct: [0.90, 1.05], color: '#D4A106' },
  { z: 5, key: 'vo2', name: 'VO2max', pct: [1.05, 1.20], color: '#E8731A' },
  { z: 6, key: 'ac', name: 'Anaerobic', pct: [1.20, 1.50], color: '#D33A2F' },
  { z: 7, key: 'nm', name: 'Sprint', pct: [1.50, Infinity], color: '#7B3FBF' },
];

export const HR_ZONES_PCTMAX = [ // same boundaries as the Magene / OnelapFit app
  { z: 1, key: 'z1', name: 'Relaxed', pct: [0, 0.50], color: '#9AA6B6' },
  { z: 2, key: 'z2', name: 'Recovery', pct: [0.50, 0.60], color: '#7589A8' },
  { z: 3, key: 'z3', name: 'Endurance', pct: [0.60, 0.70], color: '#1A63C9' },
  { z: 4, key: 'z4', name: 'Aerobic', pct: [0.70, 0.80], color: '#2E9E4F' },
  { z: 5, key: 'z5', name: 'Threshold', pct: [0.80, 0.90], color: '#D4A106' },
  { z: 6, key: 'z6', name: 'Red-line', pct: [0.90, Infinity], color: '#D33A2F' },
];

export const HR_ZONES_LTHR = [ // Coggan HR zones, % of LTHR
  { z: 1, key: 'z1', name: 'Z1 Recovery', pct: [0, 0.68], color: '#8e9aaf' },
  { z: 2, key: 'z2', name: 'Z2 Endurance', pct: [0.68, 0.83], color: '#3fa7e0' },
  { z: 3, key: 'z3', name: 'Z3 Tempo', pct: [0.83, 0.94], color: '#7cc243' },
  { z: 4, key: 'z4', name: 'Z4 Threshold', pct: [0.94, 1.05], color: '#f2c200' },
  { z: 5, key: 'z5', name: 'Z5 VO2max', pct: [1.05, Infinity], color: '#e84a3c' },
];

export const HR_ZONES_FRIEL = [ // Friel cycling HR zones, % of LTHR
  { z: 1, key: 'z1', name: 'Z1 Recovery', pct: [0, 0.81], color: '#8e9aaf' },
  { z: 2, key: 'z2', name: 'Z2 Aerobic', pct: [0.81, 0.89], color: '#3fa7e0' },
  { z: 3, key: 'z3', name: 'Z3 Tempo', pct: [0.89, 0.93], color: '#7cc243' },
  { z: 4, key: 'z4', name: 'Z4 Sub-threshold', pct: [0.93, 0.99], color: '#f2c200' },
  { z: 5, key: 'z5a', name: 'Z5a Threshold', pct: [0.99, 1.02], color: '#f58a1f' },
  { z: 6, key: 'z5b', name: 'Z5b Aerobic cap.', pct: [1.02, 1.06], color: '#e84a3c' },
  { z: 7, key: 'z5c', name: 'Z5c Anaerobic', pct: [1.06, Infinity], color: '#9b3fbf' },
];

export const CADENCE_BUCKETS = [
  { key: '<60', lo: 1, hi: 59, color: '#9b3fbf' }, { key: '60-69', lo: 60, hi: 69, color: '#e84a3c' },
  { key: '70-79', lo: 70, hi: 79, color: '#f58a1f' }, { key: '80-89', lo: 80, hi: 89, color: '#7cc243' },
  { key: '90-99', lo: 90, hi: 99, color: '#3fa7e0' }, { key: '100+', lo: 100, hi: 999, color: '#8e9aaf' },
];

/** Build absolute bounds: each zone gets {lo, hi} in units; membership is lo <= v <= hi. */
export function absoluteZones(defs, anchor) {
  let prevHi = -1;
  return defs.map((d, i) => {
    const hi = d.pct[1] === Infinity ? Infinity : Math.floor(d.pct[1] * anchor + 1e-9);
    const lo = i === 0 ? 0 : prevHi + 1;
    prevHi = hi;
    return { ...d, lo, hi: i === defs.length - 1 ? Infinity : hi };
  });
}

export function zoneIndex(zones, v) {
  for (let i = 0; i < zones.length; i++) if (v <= zones[i].hi) return i;
  return zones.length - 1;
}

export function powerZonesFor(ftp) { return absoluteZones(POWER_ZONES, ftp); }
export function hrZonesFor(model, { hrmax, lthr }) {
  if (model === 'lthr') return absoluteZones(HR_ZONES_LTHR, lthr);
  if (model === 'friel') return absoluteZones(HR_ZONES_FRIEL, lthr);
  return absoluteZones(HR_ZONES_PCTMAX, hrmax);
}

/** Seiler 3-zone model from power (default LT1 = 75% FTP, LT2 = 105% FTP — Intervals.icu mapping). */
export function threeZonePower(ftp, lt1Pct = 0.75, lt2Pct = 1.05) {
  return [
    { z: 1, key: 's1', name: 'Easy (below LT1)', lo: 0, hi: Math.floor(ftp * lt1Pct), color: '#3fa7e0' },
    { z: 2, key: 's2', name: 'Moderate (LT1–LT2)', lo: Math.floor(ftp * lt1Pct) + 1, hi: Math.floor(ftp * lt2Pct), color: '#f2c200' },
    { z: 3, key: 's3', name: 'Hard (above LT2)', lo: Math.floor(ftp * lt2Pct) + 1, hi: Infinity, color: '#e84a3c' },
  ];
}
/** 3-zone model from HR when no power: S1 ≤ 83% LTHR, S2 84–105%, S3 ≥ 106%. */
export function threeZoneHr(lthr) {
  return [
    { z: 1, key: 's1', name: 'Easy', lo: 0, hi: Math.floor(lthr * 0.83), color: '#3fa7e0' },
    { z: 2, key: 's2', name: 'Moderate', lo: Math.floor(lthr * 0.83) + 1, hi: Math.floor(lthr * 1.05), color: '#f2c200' },
    { z: 3, key: 's3', name: 'Hard', lo: Math.floor(lthr * 1.05) + 1, hi: Infinity, color: '#e84a3c' },
  ];
}

/** Seconds in each zone. `values` is a numeric array; NaN skipped; `secPerSample` default 1; `skipZero` ignores v<=0. */
export function timeInZones(values, zones, { skipZero = false } = {}) {
  const out = new Array(zones.length).fill(0);
  let skipped = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (skipZero && v <= 0) { skipped++; continue; }
    out[zoneIndex(zones, v)] += 1;
  }
  return { seconds: out, skipped };
}

/**
 * Treff et al. 2019 Polarization Index on 3-zone fractions (z1, z2, z3 sum to 1).
 * Returns null when undefined (z3 > z1 or no data).
 */
export function polarizationIndex(z1, z2, z3) {
  const tot = z1 + z2 + z3;
  if (!(tot > 0)) return null;
  z1 /= tot; z2 /= tot; z3 /= tot;
  if (z3 > z1) return null;
  if (z3 === 0) return 0;
  if (z2 === 0) return Math.log10((z1 / 0.01) * (z3 - 0.01) * 100);
  return Math.log10((z1 / z2) * z3 * 100);
}

/** Intervals.icu-style intensity distribution classification from 3-zone fractions. */
export function classifyDistribution(z1, z2, z3) {
  const tot = z1 + z2 + z3;
  if (!(tot > 0)) return 'No data';
  const s1 = z1 / tot, s2 = z2 / tot, s3 = z3 / tot;
  if (s3 > s2 && s3 > 0.499 * (s1 + s2)) return 'HIIT';
  if (s3 > s2 && s1 > s2) return 'Polarized';
  if (s1 > 3.99 * s2 && s1 > 3 * (s2 + s3)) return 'Base';
  if (1.4 * s2 < s1 && s1 < 3.01 * s2 && s2 > 1.4 * s3) return 'Pyramidal';
  if (s1 < 4 * s2 && s2 > 0.5 * s3) return 'Threshold';
  return 'Mixed';
}
