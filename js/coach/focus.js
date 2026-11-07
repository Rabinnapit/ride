// RideHQ — rule-based "what to focus on" engine. Every recommendation cites the metric that triggered it.
import { MMP_DURATIONS } from '../metrics/compute.js';
import { aggregate, ridesInRange, powerProfile, estimateFtp, multiDayBlocks, loadMetrics, trend } from '../metrics/aggregate.js';
import { addDays, todayIso, daysBetween, rideLocalDate, fmtDuration } from '../settings.js';
import { phaseFor } from './planner.js';

const isNum = v => Number.isFinite(v);
const pct = (a, b) => b ? a / b * 100 : NaN;

/** Power needed to climb at speed v (km/h) on grade g (%) with total mass m (kg). */
export function climbPower(massKg, gradePct, kmh, { crr = 0.005, cda = 0.4, rho = 1.2, eff = 0.975 } = {}) {
  const v = kmh / 3.6, th = Math.atan(gradePct / 100);
  const p = (massKg * 9.81 * Math.sin(th) + massKg * 9.81 * crr * Math.cos(th) + 0.5 * rho * cda * v * v) * v / eff;
  return p;
}

export function buildFocus({ settings, rides, pmc, today = todayIso(), readiness = null, wellnessCount = 0 }) {
  const valid = rides.filter(r => !r.excluded);
  const r90 = ridesInRange(valid, addDays(today, -89), today);
  const r30 = ridesInRange(valid, addDays(today, -29), today);
  const r28 = ridesInRange(valid, addDays(today, -27), today);
  const a90 = aggregate(r90), a30 = aggregate(r30);
  const ftp = settings.profile.ftpHistory?.length ? [...settings.profile.ftpHistory].sort((a, b) => a.date.localeCompare(b.date)).at(-1).ftp : null;
  const weightKg = settings.profile.weightKg || r90.at(-1)?.paramsUsed?.weightKg || null;
  const profile = powerProfile(a90.mmp, ftp, weightKg);
  const eftp = estimateFtp(a90.mmp);
  const lm = loadMetrics(valid, pmc, today);
  const blocks = multiDayBlocks(r90);
  const ev = settings.goals.event;
  const daysToEvent = ev?.date ? daysBetween(today, ev.date) : null;
  const phase = phaseFor(daysToEvent != null ? Math.ceil(daysToEvent / 7) : null);
  const cards = [];
  const bikeMass = (weightKg || 80) + 10;

  // 1. FTP accuracy
  const suspect = r30.filter(r => r.ftpSuspectLow);
  if (ftp && (suspect.length || (eftp?.eftp && Math.abs(eftp.eftp - ftp) / ftp > 0.05))) {
    const ev1 = [];
    for (const r of suspect.slice(-2)) ev1.push(`${rideLocalDate(r)}: NP ${Math.round(r.np)} W for ${fmtDuration(r.timerSec, { short: true })} = IF ${r.if.toFixed(2)} — above 1.0 for more than an hour, which is physiologically impossible if FTP were really ${r.paramsUsed.ftp} W.`);
    if (eftp?.eftp) ev1.push(`Estimated FTP from your 90-day power curve: ~${eftp.eftp} W (${eftp.method}); set FTP is ${ftp} W.`);
    cards.push({ id: 'ftp', priority: 1, title: 'Your FTP setting is probably too low', metric: { label: 'FTP set / estimated', value: `${ftp} / ${eftp?.eftp ?? '–'} W` },
      summary: 'TSS, zones and every workout target depend on FTP. Retest when fresh — a 20-minute test done 30 minutes after an all-out effort reads low.',
      evidence: ev1, actions: ['Schedule the 20-minute FTP test on a rested day (zero-offset the P715 first, 5-min clearing effort, then 20 min even pacing).', 'Until then, use the app\'s estimate for workout targets if it feels more honest than 153 W.', 'Update FTP in Settings → the app recomputes TSS and zones for every ride.'] });
  }

  // 2. Climbing demands vs current power
  if (ftp && weightKg) {
    const wkg = ftp / weightKg;
    const g = ev?.steepestGradePct || 10;
    const p6 = climbPower(bikeMass, g, 6), p8 = climbPower(bikeMass, g, 8), p10 = climbPower(bikeMass, g, 10);
    const ev2 = [
      `FTP ${ftp} W at ${weightKg.toFixed(1)} kg = ${wkg.toFixed(2)} W/kg (${profile?.band || ''}).`,
      `Physics for a ${g}% grade with ${bikeMass.toFixed(0)} kg bike+rider: ${Math.round(p6)} W to hold 6 km/h (${Math.round(pct(p6, ftp))}% of FTP), ${Math.round(p8)} W for 8 km/h, ${Math.round(p10)} W for 10 km/h.`,
    ];
    const f1 = v => isNum(v) ? v.toFixed(1) : '–', f2 = v => isNum(v) ? v.toFixed(2) : '–';
    if (profile?.cols) ev2.push(`Power profile (90 d): 5 s ${f1(profile.cols[0].wkg)} · 1 min ${f1(profile.cols[1].wkg)} · 5 min ${f1(profile.cols[2].wkg)} · FTP ${f2(profile.cols[3].wkg)} W/kg → weakest: ${profile.weakest?.label || '–'} (${profile.weakest?.cat || '–'}).`);
    const target = settings.goals.targetFtp || Math.round(ftp * 1.25);
    cards.push({ id: 'climb', priority: 1, title: 'Raise sustainable W/kg — the climbing lever', metric: { label: 'FTP W/kg', value: wkg.toFixed(2) },
      summary: `Steep ramps are a W/kg problem. Every 10 W of FTP or 2 kg of mass changes a ${g}% climb from grinding to riding. Target ${target} W (${(target / weightKg).toFixed(2)} W/kg) by ${ev?.date ? ev.date.slice(0, 7) : 'spring'}.`,
      evidence: ev2,
      actions: ['Two sweet-spot/threshold sessions per week (3×12 → 2×20 at 88–100% FTP); one of them low-cadence (55–65 rpm) to build climbing force.', 'Gym: heavy squats, trap-bar deadlift, split squats — max-strength block Dec–Feb, then maintenance.', `Gearing check: with a 34T small ring you want a 32–34T cassette for ${g}%+ ramps; it is cheaper than watts.`, 'Weight trend: log it in Wellness; a slow 0.3–0.5 kg/week loss while fuelling rides keeps the power.'] });
  }

  // 3. Endurance & multi-day durability
  if (ev?.distanceKm && ev.days) {
    const perDay = ev.distanceKm / ev.days;
    const longest = a90.longestRideM / 1000, b2 = blocks.best2DayM / 1000, b3 = blocks.best3DayM / 1000;
    const longRides = r90.filter(r => r.timerSec >= 3600 && isNum(r.decoupling));
    const dec = longRides.length ? longRides.reduce((a, r) => a + r.decoupling, 0) / longRides.length : NaN;
    const ev3 = [`Event needs ~${perDay.toFixed(0)} km/day for ${ev.days} consecutive days. Longest ride (90 d): ${longest.toFixed(0)} km. Best 2-day block: ${b2.toFixed(0)} km; best 3-day block: ${b3.toFixed(0)} km.`];
    if (isNum(dec)) ev3.push(`Aerobic decoupling on rides ≥ 1 h averages ${dec.toFixed(1)}% (${dec < 5 ? 'good — under 5%' : 'above 5% — aerobic endurance still developing'}).`);
    ev3.push(`Weekly volume (4-week avg): ${(aggregate(r28).timerSec / 3600 / 4).toFixed(1)} h, ${(aggregate(r28).distanceM / 1000 / 4).toFixed(0)} km.`);
    const pr = b2 >= perDay * 1.6 ? 3 : 2;
    cards.push({ id: 'durability', priority: pr, title: 'Build back-to-back endurance days', metric: { label: 'Best 2-day block', value: `${b2.toFixed(0)} km` },
      summary: `Single 100 km rides are in the bank; six in a row is a different skill. Progress Saturday + Sunday together, and practise eating on the bike.`,
      evidence: ev3,
      actions: ['From Build 1 (Feb–Mar): Sunday becomes a second long ride at ~70% of Saturday\'s distance.', 'In April–May: two weekends with 100 km + 80 km, one with three days (80/80/60) as a dress rehearsal.', 'Keep long-ride intensity IF ≤ 0.75 and decoupling < 5%; fuel 60–90 g carbs/h from the first hour.'] });
  }

  // 4. Intensity distribution
  if (a30.tiz3 && a30.tiz3.reduce((a, b) => a + b, 0) > 3600) {
    const tot = a30.tiz3.reduce((a, b) => a + b, 0);
    const s1 = pct(a30.tiz3[0], tot), s2 = pct(a30.tiz3[1], tot), s3 = pct(a30.tiz3[2], tot);
    const basePhase = ['base1', 'base2'].includes(phase.key);
    const want = basePhase ? 80 : 75;
    if (s1 < want - 10) cards.push({ id: 'distribution', priority: 2, title: 'Too much time in the middle — polarise', metric: { label: 'Easy / moderate / hard (30 d)', value: `${s1.toFixed(0)} / ${s2.toFixed(0)} / ${s3.toFixed(0)} %` },
      summary: `Distribution reads "${a30.distributionClass}" (polarisation index ${isNum(a30.polarizationIndex) ? a30.polarizationIndex.toFixed(2) : '–'}). Easy days are riding too hard to recover from, and not hard enough to adapt from.`,
      evidence: [`30-day time in zones: easy ${fmtDuration(a30.tiz3[0], { short: true })}, moderate ${fmtDuration(a30.tiz3[1], { short: true })}, hard ${fmtDuration(a30.tiz3[2], { short: true })}. Target for ${phase.label.split(' —')[0]}: ~${want}% easy.`],
      actions: [`On long rides stay under ${ftp ? Math.round(ftp * 0.75) + ' W' : '75% FTP'} / HR ${settings.profile.lthr ? Math.round(settings.profile.lthr * 0.83) : 146} on the flats — it will feel too easy; that is the point.`, 'Save the hard efforts for the two weekday sessions and planned climbs.', 'Use the planned workouts\' watt targets on the C706 so surges do not creep in.'] });
    else cards.push({ id: 'distribution-ok', priority: 5, title: 'Intensity distribution is on target', metric: { label: 'Easy / moderate / hard (30 d)', value: `${s1.toFixed(0)} / ${s2.toFixed(0)} / ${s3.toFixed(0)} %` }, summary: `Reads "${a30.distributionClass}" — keep the easy days easy and the hard days deliberate.`, evidence: [], actions: [] });
  }

  // 5. Cadence
  if (isNum(a30.avgCad) && a30.cadHist) {
    const tot = a30.cadHist.reduce((a, b) => a + b, 0);
    const low = pct(a30.cadHist[0] + a30.cadHist[1], tot);
    if (a30.avgCad < 80 || low > 30) cards.push({ id: 'cadence', priority: 3, title: 'Lift your cadence on the flats', metric: { label: 'Average cadence (30 d)', value: `${a30.avgCad.toFixed(0)} rpm` },
      summary: 'Low cadence loads the muscles instead of the heart and lungs — fine on steep ramps, costly over 100 km days. Aim for 85–95 rpm on the flats, 70–80 seated on climbs.',
      evidence: [`${low.toFixed(0)}% of pedalling time below 70 rpm; average ${a30.avgCad.toFixed(0)} rpm (pedalling only).`],
      actions: ['Endurance rides: 6 × 1 min spin-ups at 100–110 rpm (in the plan).', 'Shift earlier — one gear easier before the gradient bites.', 'Keep low-cadence work for the dedicated climbing-force sessions only.'] });
  }

  // 6. Pedalling dynamics
  if (isNum(a30.balanceLeft)) {
    const imbalance = Math.abs(a30.balanceLeft - 50);
    const ev6 = [`Left/right ${a30.balanceLeft.toFixed(0)}/${a30.balanceRight.toFixed(0)} (work-weighted, 30 d); torque effectiveness L ${a30.teLeft?.toFixed(0)}% R ${a30.teRight?.toFixed(0)}%; pedal smoothness L ${a30.psLeft?.toFixed(0)}% R ${a30.psRight?.toFixed(0)}%.`];
    if (imbalance > 3) cards.push({ id: 'balance', priority: 3, title: `Left/right imbalance ${a30.balanceLeft.toFixed(0)}/${a30.balanceRight.toFixed(0)}`, metric: { label: 'L/R balance', value: `${a30.balanceLeft.toFixed(0)}/${a30.balanceRight.toFixed(0)}` }, summary: 'More than ~53/47 for weeks points at bike fit, cleat position or a weaker side. Single-leg gym work and a fit check help.', evidence: ev6, actions: ['Single-leg RDL and Bulgarian split squats — start with the weaker side, match reps.', 'Check saddle height and cleat position; compare balance at matched power on an indoor ride.'] });
    else cards.push({ id: 'dynamics-ok', priority: 5, title: 'Pedalling dynamics look normal', metric: { label: 'L/R · TE · PS', value: `${a30.balanceLeft.toFixed(0)}/${a30.balanceRight.toFixed(0)} · ${a30.teLeft?.toFixed(0)}% · ${a30.psLeft?.toFixed(0)}%` }, summary: 'Balance within 48–52, torque effectiveness and smoothness in the typical range. Nothing to fix here.', evidence: ev6, actions: [] });
  }

  // 7. Load & consistency
  const weeks4 = r28.length ? new Set(r28.map(rideLocalDate)).size : 0;
  const ridesPerWeek = r28.length / 4;
  const evL = [`Fitness (CTL) ${lm.ctl.toFixed(0)}, fatigue (ATL) ${lm.atl.toFixed(0)}, form (TSB) ${lm.tsb.toFixed(0)}; 7-day ramp ${isNum(lm.rampRate) ? lm.rampRate.toFixed(1) : '–'} CTL/week; ACWR ${isNum(lm.acwr) ? lm.acwr.toFixed(2) : '–'}; monotony ${lm.monotony.toFixed(1)}.`, `${r28.length} rides on ${weeks4} days in the last 4 weeks (${ridesPerWeek.toFixed(1)} per week).`];
  if (ridesPerWeek < 2.5) cards.push({ id: 'consistency', priority: 2, title: 'Consistency beats hero rides', metric: { label: 'Rides per week (4 wk)', value: ridesPerWeek.toFixed(1) },
    summary: 'Fitness is built by frequency. Two 45-minute weekday sessions plus the weekend long ride lifts CTL steadily without wrecking recovery.',
    evidence: evL, actions: ['Protect Tuesday/Thursday 45-minute sessions (indoor on the KICKR when it is below 35°F).', `Aim for a CTL ramp of +3 to +6 per week; a tour of ${ev?.days || 6} long days wants CTL around 55–70 by May.`, 'Log wellness daily so the readiness score can tell you when to back off.'] });
  if (lm.tsb < -30) cards.push({ id: 'fatigue', priority: 1, title: 'You are carrying a lot of fatigue', metric: { label: 'Form (TSB)', value: lm.tsb.toFixed(0) }, summary: 'TSB below −30 is the overreaching band. Take 2–3 easy days before the next hard session.', evidence: evL, actions: ['Swap the next intensity session for Z2 or rest.', 'Sleep 8+ hours; eat enough carbohydrate.'] });
  if (isNum(lm.acwr) && lm.acwr > 1.5) cards.push({ id: 'acwr', priority: 2, title: 'Load spiked versus the last 4 weeks', metric: { label: 'Acute:chronic ratio', value: lm.acwr.toFixed(2) }, summary: 'An acute:chronic ratio above 1.5 is the injury/illness danger zone. Hold volume flat this week.', evidence: evL, actions: ['Keep this week ≤ last week\'s load; no new long-ride record.'] });

  // 8. Strength phase
  cards.push({ id: 'gym', priority: 3, title: `Gym: ${phase.gym === 'aa' ? 'adaptation block now, heavy block from December' : phase.gym === 'strength' ? 'max-strength block' : phase.gym === 'taper' ? 'taper — light only' : 'maintenance (1–2×/week, heavy, short)'}`, metric: { label: 'Phase', value: phase.label.split(' —')[0] },
    summary: 'Heavy strength training improves cycling economy and power after 3 hours of riding (Rønnestad & Mujika). Your aero-position endurance comes from triceps, shoulders, lats and core — the B session.',
    evidence: [`Phase decided by weeks to the event: ${daysToEvent != null ? Math.ceil(daysToEvent / 7) : '–'}.`],
    actions: ['Session A (legs & core) and Session B (upper body & aero holds) alternate on your gym days; the planner keeps heavy legs ≥ 48 h from the long ride.', 'Progress load only when every set has 2 reps in reserve.', 'Log sets in the Gym tab — the app tracks estimated 1RM.'] });

  // 9. Readiness / wellness logging
  if (!wellnessCount) cards.push({ id: 'wellness', priority: 4, title: 'Start logging wellness (30 seconds a day)', metric: { label: 'Entries', value: '0' }, summary: 'Sleep, resting HR and HRV from your Fitbit Sense 2 drive the daily readiness score, which decides whether today is a hard day.', evidence: [], actions: ['Wellness tab → add today: sleep hours, resting HR, HRV, weight, soreness.'] });
  else if (readiness) cards.push({ id: 'readiness', priority: readiness.band === 'red' ? 1 : 5, title: `Readiness today: ${readiness.score} (${readiness.band})`, metric: { label: 'Readiness', value: String(readiness.score) }, summary: readiness.advice, evidence: readiness.parts.map(p => `${p.label}: ${p.pct}%`), actions: [] });

  // 10. Season / equipment
  const indoorFrom = settings.schedule.indoorAvailableFrom;
  if (indoorFrom && today < indoorFrom) cards.push({ id: 'season', priority: 4, title: 'Winter plan: trainer arrives ' + indoorFrom, metric: { label: 'Outdoor cutoff', value: `${settings.schedule.outdoorMinTempF}°F` }, summary: 'Until the KICKR CORE 2 arrives, mornings under 35°F are gym or rest days; the plan already assumes indoor sessions from that date. Zwift FIT files import here like Magene files.', evidence: [], actions: ['Zwift → zwift.com → My activities → download .fit → import into RideHQ.', 'Export planned workouts as .zwo and drop them into Documents/Zwift/Workouts/<your Zwift ID>/.'] });

  cards.sort((a, b) => a.priority - b.priority);
  return { cards, profile, eftp, loadMetrics: lm, blocks, phase, a30, a90 };
}
