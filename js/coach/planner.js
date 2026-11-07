// RiderHQ — two-week plan generator: periodized toward the goal event, bike + gym + mobility, weather-aware.
import { buildWorkout, plannedTss, workoutById } from './workouts.js';
import { SESSIONS, MOBILITY } from './gym.js';
import { addDays, daysBetween, dowOf, todayIso, DAY_NAMES } from '../settings.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function phaseFor(weeksToEvent) {
  if (weeksToEvent == null || weeksToEvent < 0) return { key: 'maintain', label: 'Maintain', gym: 'maintain' };
  if (weeksToEvent > 22) return { key: 'base1', label: 'Base 1 — aerobic foundation & strength', gym: 'aa' };
  if (weeksToEvent > 14) return { key: 'base2', label: 'Base 2 — sweet spot & max strength', gym: 'strength' };
  if (weeksToEvent > 8) return { key: 'build1', label: 'Build 1 — threshold & climbing', gym: 'maintain' };
  if (weeksToEvent > 2) return { key: 'build2', label: 'Build 2 — durability & back-to-back days', gym: 'maintain' };
  return { key: 'taper', label: 'Taper — sharpen and rest', gym: 'taper' };
}

/** Intensity session menus per phase (weekday short sessions, 45–60 min). */
const INTENSITY = {
  base1: ['ss45', 'lowcad', 'tempo45', 'ss3x12', 'tempo2x20', 'biggear'],
  base2: ['ss45', 'lowcad', 'ss3x12', 'biggear', 'tempo45', 'ss2x20'],
  build1: ['thr3x10', 'vo2_45', 'lowcad', 'overunder', 'climbsim', 'thr2x20'],
  build2: ['hillreps', 'thr3x10', 'vo2_45', 'climbsim', 'overunder', 'lowcad'],
  taper: ['opener', 'ss45', 'vo2_45'],
  maintain: ['ss45', 'thr3x10', 'lowcad', 'vo2_45'],
};
/** Workouts from a menu that fit within `minutes` (+5 min tolerance). */
function fitting(menu, minutes) { const ok = menu.filter(id => (workoutById(id)?.min || []).some(m => m <= minutes + 5)); return ok.length ? ok : ['ss45']; }
/** Long-ride workouts per phase. */
const LONG = { base1: 'z2', base2: 'z2', build1: 'longtempo', build2: 'durability', taper: 'z2', maintain: 'z2' };

/** Long-ride minutes for the week, from current capacity and phase, capped by the schedule. */
function longRideMinutes(phase, longestRecentMin, weekInBlock, recovery, hoursPerWeek) {
  const base = clamp(longestRecentMin || 120, 90, 360);
  const factor = { base1: 1.05, base2: 1.08, build1: 1.10, build2: 1.10, taper: 0.60, maintain: 1.0 }[phase] || 1;
  let m = base * factor * (1 + 0.05 * weekInBlock);
  const cap = { base1: 210, base2: 240, build1: 300, build2: 360, taper: 150, maintain: 240 }[phase] || 240;
  m = clamp(m, 60, cap);
  m = Math.min(m, hoursPerWeek * 60 * 0.55);
  if (recovery) m *= 0.6;
  return Math.round(m / 15) * 15;
}

function fahrenheit(c) { return c * 9 / 5 + 32; }

/**
 * Generate a 14-day plan.
 * @param opts {settings, state:{ctl, atl, tsb, longestRecentMin, weeklyLoadAvg, readinessBand, ftp}, forecast: {date:{tMin7amF, precipPct}}, startDate}
 */
export function generatePlan({ settings, state, forecast = {}, startDate = todayIso() }) {
  const sch = settings.schedule, ev = settings.goals.event;
  const daysToEvent = ev?.date ? daysBetween(startDate, ev.date) : null;
  const weeksToEvent = daysToEvent != null ? Math.ceil(daysToEvent / 7) : null;
  const phase = phaseFor(weeksToEvent);
  const anchor = settings.planAnchor || startDate;
  const weekIndex = Math.floor(daysBetween(anchor, startDate) / 7);
  const ftp = state.ftp || 150;
  const indoorFrom = sch.indoorAvailableFrom || null;
  const days = [];
  let intensityCount = 0;
  for (let i = 0; i < 14; i++) {
    const date = addDays(startDate, i);
    const dow = dowOf(date);
    const wk = weekIndex + Math.floor(i / 7);
    const recovery = (wk % 4) === 3;
    const weekInBlock = wk % 4;
    const fc = forecast[date] || null;
    const cold = fc ? fc.tMin7amF < (sch.outdoorMinTempF ?? 35) : (new Date(date).getMonth() + 1 >= 12 || new Date(date).getMonth() + 1 <= 2);
    const trainer = !indoorFrom || date >= indoorFrom;
    const location = cold ? (trainer ? 'indoor' : 'outdoor-if-warm') : 'outdoor';
    const d = { date, dow, dayName: DAY_NAMES[dow], recovery, phase: phase.key, sessions: [] };
    const isEventWeek = daysToEvent != null && daysToEvent - i <= 0 && daysToEvent - i > -ev.days;
    if (isEventWeek) { d.sessions.push({ kind: 'event', title: `${ev.name} — day ${i - daysToEvent + 1} of ${ev.days}`, durationMin: 0, description: `Target ~${Math.round(ev.distanceKm / ev.days)} km. Eat 60–90 g carbs/h, drink 500–800 ml/h, pace below tempo on the flats.` }); days.push(d); continue; }
    if (daysToEvent != null && daysToEvent - i < 0) { d.sessions.push({ kind: 'rest', title: 'Recovery — post event', durationMin: 0 }); days.push(d); continue; }

    const weekdayRide = sch.weekdayRideDays.includes(dow);
    const gymDay = sch.gymDays.includes(dow);
    const restDay = sch.restDays.includes(dow);
    if (dow === sch.longRideDay) {
      const mins = longRideMinutes(phase.key, state.longestRecentMin, weekInBlock, recovery, sch.hoursPerWeek || 7);
      const wid = recovery ? 'z2' : LONG[phase.key];
      const minsCapped = location === 'indoor' ? Math.min(mins, 150) : mins;
      const w = buildWorkout(wid, minsCapped);
      const dist = Math.round(minsCapped / 60 * 22);
      d.sessions.push(bikeSession(w, ftp, location, {
        title: recovery ? `Easy long ride (recovery week)` : `Long ride — ${w.name}`,
        description: location === 'indoor' ? `Indoor cap 2.5 h: ride ${minsCapped} min on the trainer; if it is above ${sch.outdoorMinTempF}°F by late morning, go outside for ${mins} min instead.` : `About ${dist} km at Z2 (${Math.round(ftp * 0.56)}–${Math.round(ftp * 0.75)} W). ${phase.key === 'build2' ? 'Pick a route with repeated climbs; 60–90 g carbs/h.' : 'Fuel 40–60 g carbs/h, keep cadence 85+ on the flats.'}`,
        note: fc ? `Forecast ${Math.round(fc.tMin7amF)}°F at 7 am${fc.precipPct != null ? `, ${fc.precipPct}% rain` : ''}` : '',
      }));
    } else if (dow === sch.secondRideDay) {
      if (recovery || phase.key === 'taper') d.sessions.push({ kind: 'rest', title: 'Rest or 30 min easy spin', durationMin: 0, description: 'Optional recovery spin under 55% FTP. Walk, stretch, sleep.' });
      else {
        const backToBack = phase.key === 'build2' || (phase.key === 'build1' && weekInBlock >= 1);
        const mins = backToBack ? Math.round(longRideMinutes(phase.key, state.longestRecentMin, weekInBlock, false, sch.hoursPerWeek || 7) * 0.7 / 15) * 15 : (phase.key === 'base1' ? 75 : 90);
        const w = buildWorkout(backToBack ? 'z2' : 'z2cad', location === 'indoor' ? Math.min(mins, 120) : mins);
        d.sessions.push(bikeSession(w, ftp, location, { title: backToBack ? 'Back-to-back endurance ride' : 'Endurance ride', description: backToBack ? 'Second long day on tired legs — the tour is six of these in a row. Start easy, finish steady, fuel from the first hour.' : 'Easy aerobic ride; cadence drills keep the stroke smooth.' }));
      }
    } else if (weekdayRide) {
      const menu = fitting(INTENSITY[phase.key] || INTENSITY.maintain, sch.weekdayRideMin || 45);
      const maxInt = recovery ? 1 : (sch.maxIntensityDays ?? 2);
      const weekStart = Math.floor(i / 7);
      const used = days.filter(x => Math.floor(daysBetween(startDate, x.date) / 7) === weekStart).reduce((a, x) => a + x.sessions.filter(s => s.intensity).length, 0);
      const readinessRed = state.readinessBand === 'red' && i === 0;
      let wid;
      if (readinessRed || used >= maxInt) wid = 'z2cad';
      else wid = menu[(wk * 2 + used + (weekInBlock % 2)) % menu.length];
      if (location === 'indoor' && wid === 'hillreps') wid = (sch.weekdayRideMin || 45) >= 60 ? 'climbsim' : 'lowcad';
      const w = buildWorkout(wid, sch.weekdayRideMin || 45);
      const intensity = !['z2', 'z2cad', 'rec30'].includes(wid);
      if (intensity) intensityCount++;
      d.sessions.push(bikeSession(w, ftp, location, { intensity, title: w.name, description: w.why }));
    }
    if (gymDay) {
      const set = SESSIONS[phase.gym] || SESSIONS.maintain;
      const keys = Object.keys(set);
      // Prefer the upper/aero session on the day right before a weekday ride; legs ≥ 48 h before the long ride.
      const dayBeforeLong = (dow + 1) % 7 === sch.longRideDay;
      let key = keys.includes('B') && (sch.weekdayRideDays.includes((dow + 1) % 7) || dayBeforeLong) ? 'B' : keys[0];
      if (keys.includes('A') && keys.includes('B')) { const nGym = sch.gymDays.indexOf(dow); key = nGym % 2 === 0 ? 'B' : 'A'; if (dayBeforeLong) key = 'B'; }
      if (recovery) key = keys.includes('B') ? 'B' : keys[0];
      const sess = set[key];
      d.sessions.push({ kind: 'gym', title: sess.title, durationMin: sch.gymMin || 60, phase: phase.gym, template: key, items: sess.items, description: recovery ? 'Recovery week: same exercises, 2 sets, leave 3 reps in reserve.' : (phase.gym === 'strength' ? 'Heavy and fast on the way up; rest 2–3 min between big sets.' : 'Perfect form; moderate load; leave 2 reps in reserve.') });
    }
    if (restDay && !d.sessions.length) d.sessions.push({ kind: 'rest', title: 'Rest', durationMin: 0, description: 'Full rest. Sleep, food, a short walk. This is where fitness is built.' });
    if (!d.sessions.length) d.sessions.push({ kind: 'rest', title: 'Rest day', durationMin: 0, description: 'Nothing scheduled. Optional 20–30 min walk or easy spin.' });
    if (gymDay || restDay) d.sessions.push({ kind: 'mobility', title: MOBILITY.title, durationMin: 12, items: MOBILITY.items });
    days.push(d);
  }
  // Weekly load guard: if planned load > 1.3 × recent weekly average (and that average is meaningful), shave the long ride
  const weekly = [0, 1].map(w => days.slice(w * 7, w * 7 + 7).reduce((a, d) => a + d.sessions.reduce((b, s) => b + (s.plannedTss || 0), 0), 0));
  const avg = state.weeklyLoadAvg || 0;
  const notes = [];
  if (avg > 100) {
    weekly.forEach((wl, w) => {
      if (wl > avg * 1.35) {
        const longDay = days.slice(w * 7, w * 7 + 7).find(d => d.sessions.some(s => s.kind === 'bike' && s.durationMin >= 120));
        const s = longDay?.sessions.find(x => x.kind === 'bike');
        if (s) { const w2 = buildWorkout(s.workoutId, Math.round(s.durationMin * 0.8 / 15) * 15); Object.assign(s, bikeSession(w2, ftp, s.location, { title: s.title, description: s.description, intensity: s.intensity })); notes.push(`Week ${w + 1}: long ride trimmed to keep the load ramp under ~35% above your recent average.`); }
      }
    });
  }
  return {
    id: 'current', generatedAt: new Date().toISOString(), startDate, endDate: addDays(startDate, 13),
    phase, weeksToEvent, daysToEvent, weekIndex, days, notes,
    weeklyPlannedTss: weekly, intensityDays: intensityCount,
    summary: planSummary(phase, weeksToEvent, days, settings),
  };
}

function bikeSession(w, ftp, location, extra = {}) {
  const tss = plannedTss(w.segments);
  return {
    kind: 'bike', workoutId: w.id, title: extra.title || w.name, cat: w.cat, durationMin: Math.round(w.durationSec / 60), location,
    plannedTss: Math.round(tss), segments: w.segments, description: extra.description || w.why, note: extra.note || '', intensity: !!extra.intensity,
    done: false, linkedRideId: null, ftp,
  };
}

function planSummary(phase, weeksToEvent, days, settings) {
  const bike = days.flatMap(d => d.sessions.filter(s => s.kind === 'bike'));
  const hrs = bike.reduce((a, s) => a + s.durationMin, 0) / 60;
  const gym = days.flatMap(d => d.sessions.filter(s => s.kind === 'gym')).length;
  const ev = settings.goals.event;
  return `${phase.label}. ${weeksToEvent != null ? `${weeksToEvent} weeks to ${ev.name}. ` : ''}${bike.length} rides (${hrs.toFixed(1)} h), ${gym} gym sessions over 14 days. ${days.some(d => d.recovery) ? 'Includes a recovery week — honor it.' : 'Loading weeks: build steadily, sleep well.'}`;
}

/** Match completed rides to planned bike sessions by date (first unmatched bike session that day). */
export function matchRidesToPlan(plan, rides, rideLocalDate) {
  if (!plan) return plan;
  for (const d of plan.days) for (const s of d.sessions) if (s.kind === 'bike' && s.linkedRideId && !rides.some(r => r.id === s.linkedRideId)) { s.linkedRideId = null; s.done = false; }
  for (const r of rides) {
    const d = plan.days.find(x => x.date === rideLocalDate(r));
    if (!d) continue;
    const free = d.sessions.find(s => s.kind === 'bike' && !s.linkedRideId);
    if (free) { free.linkedRideId = r.id; free.done = true; free.actualTss = r.load; free.actualMin = Math.round(r.timerSec / 60); }
  }
  return plan;
}

/** .ics export of the plan (floating local times). */
export function planToIcs(plan, settings) {
  const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RiderHQ//Plan//EN', 'CALSCALE:GREGORIAN'];
  let n = 0;
  for (const d of plan.days) for (const s of d.sessions) {
    if (s.kind === 'rest' || s.kind === 'mobility') continue;
    const dateC = d.date.replace(/-/g, '');
    const start = s.kind === 'gym' ? '180000' : (d.dow === 0 || d.dow === 6 ? '080000' : '060000');
    const endMin = (s.durationMin || 60);
    const sh = parseInt(start.slice(0, 2)), sm = parseInt(start.slice(2, 4));
    const em = sh * 60 + sm + endMin; const end = `${String(Math.floor(em / 60) % 24).padStart(2, '0')}${String(em % 60).padStart(2, '0')}00`;
    const desc = [s.description, s.kind === 'bike' ? `Planned TSS ${s.plannedTss} · ${s.location}` : '', s.items ? s.items.map(i => `${i.name} ${i.sets}×${i.reps}`).join('; ') : ''].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:ridehq-${plan.generatedAt}-${n++}@ridehq`, `DTSTAMP:${plan.generatedAt.replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART:${dateC}T${start}`, `DTEND:${dateC}T${end}`, `SUMMARY:${esc((s.kind === 'gym' ? 'Gym: ' : s.kind === 'bike' ? 'Ride: ' : '') + s.title)}`, `DESCRIPTION:${esc(desc)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
export { workoutById };
