// RiderHQ — today's call: one plain-language instruction for today, built from the plan, the latest coach analysis, form and readiness.
import { todayIso, addDays, fmtDate, rideLocalDate, currentFtp } from '../settings.js';
import { fuelTarget, packList, packText, fuelItems } from '../modules/fuel.js';

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Latest saved Claude analysis (ride or weekly), newest first. */
export function latestCoachNote(coachNotes = []) { return coachNotes[0]?.parsed || null; }

/** Coach adjustments that apply to a given date, from saved analyses (planAdjustments: [{date, change, reason}]). */
export function coachAdjustmentsFor(coachNotes, date) {
  const out = [];
  for (const n of coachNotes) for (const a of n.parsed?.planAdjustments || []) if (a.date === date) out.push({ ...a, from: n.parsed.title || n.parsed.date });
  return out;
}

/**
 * Build the day's call. Returns { kind, title, line, why[], session, adjustments, pack, next }.
 * kind: 'rest' | 'easy' | 'ride' | 'gym' | 'test' | 'free'
 */
export function todaysCall({ settings, state, today = todayIso() }) {
  const pm = state.pmc.find(p => p.date === today) || null;
  const tsb = pm?.tsb ?? 0;
  const r = state.readiness;
  const day = state.plan?.days.find(d => d.date === today) || null;
  const sessions = (day?.sessions || []).filter(x => x.kind !== 'mobility');
  const main = sessions.find(x => x.kind === 'bike' || x.kind === 'event') || sessions.find(x => x.kind === 'gym') || sessions[0] || null;
  const adjustments = coachAdjustmentsFor(state.coachNotes || [], today);
  const rodeToday = state.rides.some(x => rideLocalDate(x) === today && !x.excluded);
  const why = [];
  if (pm) why.push(`Form ${tsb > 0 ? '+' : ''}${tsb.toFixed(0)} (${tsb < -20 ? 'tired' : tsb < -5 ? 'carrying fatigue' : tsb <= 5 ? 'neutral' : 'fresh'})`);
  if (r) why.push(`Readiness ${r.score} (${r.band === 'green' ? 'good' : r.band === 'amber' ? 'ease off' : 'rest'})`);

  // 1) a coach adjustment for today wins
  if (adjustments.length) {
    const a = adjustments[0];
    const easy = /rest|easy|recovery|spin/i.test(a.change);
    return { kind: easy ? 'easy' : 'ride', title: easy ? 'Easy day' : 'Coach’s call', line: a.change, why: [a.reason, ...why.filter(w => !/^Form/.test(w))].filter(Boolean), session: main, adjustments, pack: null, done: rodeToday, source: `From Claude’s analysis: ${a.from}` };
  }
  // 2) red readiness or deep fatigue → rest regardless of the plan
  if ((r && r.band === 'red') || tsb < -30) {
    return { kind: 'rest', title: 'Rest today', line: main?.kind === 'bike' ? `Skip “${main.title}”. Sleep, eat well, walk.` : 'Sleep, eat well, walk. Fitness is built on rest days.', why, session: main, adjustments, pack: null, done: false, source: 'Readiness and form' };
  }
  // 3) planned session
  if (main) {
    if (main.kind === 'event') return { kind: 'ride', title: main.title, line: main.description || '', why, session: main, adjustments, pack: null, done: rodeToday, source: 'Your plan' };
    if (main.kind === 'rest') return { kind: 'rest', title: 'Rest day', line: main.description || 'Nothing scheduled.', why, session: main, adjustments, pack: null, done: false, source: 'Your plan' };
    if (main.kind === 'gym') return { kind: 'gym', title: main.title, line: `${main.durationMin} min · ${(main.items || []).slice(0, 3).map(i => i.name).join(', ')}${(main.items || []).length > 3 ? '…' : ''}`, why, session: main, adjustments, pack: null, done: !!main.done, source: 'Your plan' };
    const hrs = main.durationMin / 60;
    const ftp = main.ftp || currentFtp(settings) || 150;
    const easeOff = r && r.band === 'amber' && main.intensity;
    const pack = hrs >= 1 ? packList(hrs, 50, fuelItems(settings)) : null;
    const test = main.cat === 'test';
    return {
      kind: test ? 'test' : 'ride', title: easeOff ? `${main.title} — easier version` : main.title,
      line: easeOff ? `Readiness is amber: do the time (${main.durationMin} min) but keep every effort under ${Math.round(ftp * 0.9)} W.` : `${main.durationMin} min · planned load ${main.plannedTss} · ${main.location === 'indoor' ? 'indoor' : 'outdoor'}${pack ? ` · pack ${packText(pack)}` : ''}`,
      why, session: main, adjustments, pack, done: !!main.done, source: 'Your plan',
    };
  }
  // 4) no plan
  return { kind: 'free', title: 'No plan for today', line: 'Generate a 14-day plan in Train, or ride easy if you’re going out.', why, session: null, adjustments, pack: null, done: rodeToday, source: '' };
}

/** The next planned sessions after today (for the "coming up" strip). */
export function upcoming(state, today = todayIso(), n = 3) {
  if (!state.plan) return [];
  const out = [];
  for (const d of state.plan.days) {
    if (d.date <= today) continue;
    const main = d.sessions.find(x => x.kind === 'bike' || x.kind === 'event') || d.sessions.find(x => x.kind === 'gym') || d.sessions.find(x => x.kind === 'rest');
    if (main) out.push({ date: d.date, dayName: DAY[new Date(d.date + 'T12:00:00').getDay()].slice(0, 3), session: main });
    if (out.length >= n) break;
  }
  return out;
}
export { fuelTarget, addDays, fmtDate };
