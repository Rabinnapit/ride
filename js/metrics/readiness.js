// RiderHQ — daily readiness from manual wellness entries + training-load state.
const isNum = v => Number.isFinite(v);
const mean = a => { const v = a.filter(isNum); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : NaN; };
const sd = a => { const v = a.filter(isNum); if (v.length < 2) return NaN; const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); };
function phi(z) { // normal CDF
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
const clip = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param today   wellness entry for the day {sleepHours, sleepQuality(1-5), rhr, hrv (rMSSD ms), soreness, fatigue, stress, mood, motivation (1-5)}
 * @param history previous ~60 days of entries (for baselines)
 * @param tsb     today's form (CTL − ATL)
 */
export function readinessScore(today, history, tsb) {
  if (!today) return null;
  const parts = [];
  const hrvs = history.map(h => h.hrv).filter(v => v > 0).map(Math.log);
  if (today.hrv > 0 && hrvs.length >= 5 && sd(hrvs) > 0) parts.push({ key: 'hrv', w: 0.30, v: phi(clip((Math.log(today.hrv) - mean(hrvs)) / sd(hrvs), -3, 3)), label: 'HRV vs your baseline' });
  const rhrs = history.map(h => h.rhr).filter(v => v > 0);
  if (today.rhr > 0 && rhrs.length >= 5 && sd(rhrs) > 0) parts.push({ key: 'rhr', w: 0.15, v: phi(clip(-(today.rhr - mean(rhrs)) / sd(rhrs), -3, 3)), label: 'Resting HR vs baseline' });
  if (today.sleepHours > 0) parts.push({ key: 'sleep', w: 0.20, v: 0.6 * Math.min(1, today.sleepHours / 8) + 0.4 * ((today.sleepQuality || 3) / 5), label: 'Sleep' });
  const subj = [today.soreness, today.fatigue, today.stress].filter(isNum).map(v => (5 - v) / 4)
    .concat([today.mood, today.motivation].filter(isNum).map(v => (v - 1) / 4));
  if (subj.length) parts.push({ key: 'subjective', w: 0.15, v: mean(subj), label: 'How you feel' });
  if (isNum(tsb)) parts.push({ key: 'load', w: 0.20, v: clip((tsb + 45) / 55, 0, 1), label: 'Training load (form)' });
  if (!parts.length) return null;
  const wsum = parts.reduce((s, p) => s + p.w, 0);
  const score = Math.round(100 * parts.reduce((s, p) => s + p.w * p.v, 0) / wsum);
  const band = score >= 62 ? 'green' : score >= 45 ? 'amber' : 'red';
  const advice = band === 'green' ? 'Go ahead with planned intensity.' : band === 'amber' ? 'Cut intervals ~10% or swap to an easy endurance ride.' : 'Rest or very easy spin today.';
  return { score, band, advice, parts: parts.map(p => ({ ...p, pct: Math.round(p.v * 100) })) };
}
