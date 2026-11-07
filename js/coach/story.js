// RiderHQ — the ride in plain words: an effort label and a short story a beginner can read at a glance.
import { fmtDuration } from '../settings.js';

/** Effort label from intensity (power) or HR % of max. */
export function effortOf(r) {
  // Nobody holds >100% of FTP for an hour: if the power says so, the FTP setting is wrong, so judge by heart rate instead.
  const implausible = r.ftpSuspectLow || (Number.isFinite(r.if) && r.if > 1 && r.timerSec > 3600);
  const power = r.hasPower && r.powerValid !== false && Number.isFinite(r.if) && !(implausible && Number.isFinite(r.avgHr));
  const v = power ? r.if : (Number.isFinite(r.avgHr) && r.paramsUsed?.hrmax ? r.avgHr / r.paramsUsed.hrmax : null);
  if (v == null) return { word: 'Ride', cls: '', why: '' };
  const t = power ? [0.65, 0.8, 0.9] : [0.7, 0.8, 0.88];
  const i = v < t[0] ? 0 : v < t[1] ? 1 : v < t[2] ? 2 : 3;
  return { word: ['Easy', 'Moderate', 'Hard', 'Very hard'][i], cls: ['easy', 'mod', 'hard', 'vhard'][i], why: power ? `intensity ${v.toFixed(2)} of FTP` : `heart rate ${Math.round(v * 100)}% of max${implausible ? ' (power intensity ignored: your FTP setting is too low)' : ''}` };
}

/** Two or three sentences. Honest, specific, no jargon without a translation. */
export function rideStory(r) {
  const e = effortOf(r);
  const hrs = r.timerSec / 3600;
  const power = r.hasPower && r.powerValid !== false;
  const out = [];
  const lenWord = hrs < 1 ? 'A short' : hrs < 2.5 ? 'A medium' : hrs < 4 ? 'A long' : 'A very long';
  out.push(`${lenWord} ${e.word.toLowerCase()} ride: ${fmtDuration(r.timerSec, { short: true })} and ${(r.distanceM / 1000).toFixed(0)} km, ${e.why}.`);
  // where the time went
  const tiz = power ? r.tizPower : r.tizHr; const names = power ? (r.powerZones || []).map(z => z.name) : (r.hrZones || []).map(z => z.name);
  if (tiz && names.length) {
    const tot = tiz.reduce((a, b) => a + b, 0) || 1;
    const top = tiz.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s)[0];
    const hardPct = power ? tiz.slice(3).reduce((a, b) => a + b, 0) / tot * 100 : tiz.slice(4).reduce((a, b) => a + b, 0) / tot * 100;
    out.push(`Most of it (${Math.round(top.s / tot * 100)}%) was in the ${names[top.i].replace(/^Z\d\w?\s*/, '').toLowerCase()} zone${hardPct >= 20 ? `, and ${Math.round(hardPct)}% was hard effort` : ''}.`);
  }
  // one notable thing
  if (power && r.vi >= 1.15) out.push(`The power was spiky (lots of surges and ${Math.round(r.coastingPct)}% coasting): smoother pedaling would make the same ride cost less.`);
  else if (Number.isFinite(r.decoupling) && r.decoupling > 5) out.push(`Your heart rate drifted up ${r.decoupling.toFixed(0)}% for the same power late on: fatigue, heat or under-fueling.`);
  else if (r.climbs?.length) { const c = r.climbs.reduce((a, b) => b.gainM > a.gainM ? b : a); out.push(`Biggest climb: ${Math.round(c.lengthM / 100) / 10} km at ${c.avgGrade.toFixed(0)}%${c.avgPower ? ` at ${Math.round(c.avgPower)} W` : ''}.`); }
  else if (Number.isFinite(r.avgCad) && r.avgCad < 75) out.push(`Cadence averaged ${Math.round(r.avgCad)} rpm, which is on the low side; 85–95 is easier on the legs.`);
  return out.join(' ');
}
