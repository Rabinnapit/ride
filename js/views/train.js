// RiderHQ — Train: focus recommendations, the 14-day plan (bike + gym + mobility), workout library and exports.
import { state, registerView, navigate, savePlan, saveSettings, loadForecast, db } from '../app.js';
import { h, icon, section, empty, button, segmented, table, modal, toast, pill, downloadFile, kv, confirmDialog } from '../ui/dom.js';
import { focusCard } from './home.js';
import { getSettings, units, fmtDuration, fmtNum, todayIso, addDays, rideLocalDate, fmtDate, currentFtp, DAY_NAMES, daysBetween } from '../settings.js';
import { aggregate, ridesInRange, weeklyBuckets } from '../metrics/aggregate.js';
import { buildFocus } from '../coach/focus.js';
import { generatePlan, planToIcs, matchRidesToPlan } from '../coach/planner.js';
import { WORKOUTS, CATEGORY, buildWorkout, describeSegments, plannedTss, toZwo, toMrc } from '../coach/workouts.js';
import { weatherIcon, rideCall } from '../modules/extras.js';
import { demoThumb, exerciseLink } from '../ui/demo.js';

let tab = 'plan';

registerView('train', (root) => {
  const s = getSettings();
  const today = todayIso();
  const rides = state.rides.filter(r => !r.excluded);
  const head = h('div', { class: 'page-head' }, h('h1', null, 'Train'), segmented([{ value: 'plan', label: '14-day plan' }, { value: 'focus', label: 'Focus' }, { value: 'library', label: 'Workouts' }], tab, v => { tab = v; navigate('train'); }));
  root.appendChild(head);
  if (tab === 'focus') return renderFocus(root, s, rides, today);
  if (tab === 'library') return renderLibrary(root, s);
  return renderPlan(root, s, rides, today);
});

function renderFocus(root, s, rides, today) {
  const focus = buildFocus({ settings: s, rides, pmc: state.pmc, today, readiness: state.readiness, wellnessCount: state.wellness.length });
  root.append(h('p', { class: 'lead' }, `${focus.phase.label}. Recommendations are computed from your rides, your profile and the event — each one shows the numbers behind it.`),
    rides.length ? h('div', { class: 'focus-list' }, focus.cards.map(focusCard)) : empty('Import rides first.'));
}

function planState(s, rides, today) {
  const pm = state.pmc.find(p => p.date === today);
  const r90 = ridesInRange(rides, addDays(today, -89), today);
  const longest = Math.max(0, ...r90.map(r => r.timerSec)) / 60;
  const weeks = weeklyBuckets(rides, 4, today);
  return { ctl: pm?.ctl || 0, atl: pm?.atl || 0, tsb: pm?.tsb || 0, longestRecentMin: longest || 120, weeklyLoadAvg: weeks.reduce((a, w) => a + w.load, 0) / 4, readinessBand: state.readiness?.band || null, ftp: currentFtp(s) || 150 };
}

async function regenerate(s, rides, today, startDate = today) {
  await loadForecast();
  if (!s.planAnchor) { await saveSettings({ planAnchor: startDate }); s = getSettings(); }
  const plan = generatePlan({ settings: s, state: planState(s, rides, today), forecast: state.forecast || {}, startDate });
  matchRidesToPlan(plan, rides, rideLocalDate);
  await savePlan(plan);
  await db.put('planlog', { id: plan.generatedAt, startDate, phase: plan.phase.key, weeklyPlannedTss: plan.weeklyPlannedTss });
  toast('Plan generated');
  if (state.route.name === 'train') navigate('train');
}

function renderPlan(root, s, rides, today) {
  const plan = state.plan;
  if (!plan) {
    root.append(empty(`No plan yet. The generator uses your schedule (long ride ${DAY_NAMES[s.schedule.longRideDay]}, weekday rides ${s.schedule.weekdayRideDays.map(d => DAY_NAMES[d]).join('/')}, gym ${s.schedule.gymDays.map(d => DAY_NAMES[d]).join('/')}), your fitness and the weeks left to the event.`, button('Generate 14-day plan', () => regenerate(s, rides, today), { primary: true })));
    return;
  }
  const done = plan.days.flatMap(d => d.sessions).filter(x => x.kind === 'bike');
  const compliance = done.length ? done.filter(x => x.done).length / done.filter(x => x.date <= today || true).length : 0;
  const bar = h('div', { class: 'plan-bar' },
    h('div', null, h('strong', null, plan.phase.label), h('div', { class: 'muted small' }, plan.summary)),
    h('div', { class: 'row' }, button('Regenerate', async () => { if (await confirmDialog('Regenerate plan?', 'Builds a fresh 14 days from today using your latest rides and readiness. Completed sessions stay linked.')) regenerate(getSettings(), rides, today); }, { small: true }), button('Calendar (.ics)', () => downloadFile('riderhq-plan.ics', planToIcs(plan, s), 'text/calendar'), { small: true, iconName: 'calendar' }), button('All .zwo', () => exportAllZwo(plan), { small: true, iconName: 'download' })),
  );
  const notes = plan.notes?.length ? h('div', { class: 'alert static' }, icon('info'), h('span', null, plan.notes.join(' '))) : null;
  const weeks = [plan.days.slice(0, 7), plan.days.slice(7)];
  const grid = h('div', { class: 'plan-weeks' }, weeks.map((w, wi) => h('div', { class: 'plan-week' },
    h('h2', { class: 'group-title' }, `Week ${wi + 1} · ${fmtDate(w[0].date)} – ${fmtDate(w[6].date)}`, w[0].recovery ? pill('recovery week', 'good') : null, h('span', { class: 'muted' }, ` · planned load ${fmtNum(plan.weeklyPlannedTss[wi])}`)),
    h('div', { class: 'plan-days' }, w.map(d => dayCard(d, s, plan))),
  )));
  root.append(bar, notes, grid);
  void compliance;
}

function dayCard(d, s, plan) {
  const today = todayIso();
  const fc = state.forecast?.[d.date];
  const call = fc ? rideCall(fc, s) : null;
  const isToday = d.date === today, past = d.date < today;
  return h('div', { class: `plan-day ${isToday ? 'today' : ''} ${past ? 'past' : ''} ${d.recovery ? 'recovery' : ''}` },
    h('div', { class: 'plan-day-head' }, h('div', null, h('strong', null, d.dayName), h('span', { class: 'muted' }, ` ${fmtDate(d.date)}`)), fc ? h('span', { class: 'muted small', title: call?.detail }, `${weatherIcon(fc.code7)} ${Math.round(fc.t7amF ?? fc.tMinF)}°`) : null),
    d.sessions.map(x => sessionRow(x, d, s, plan)),
  );
}

function sessionRow(x, d, s, plan) {
  const cls = `session ${x.kind} ${x.done ? 'done' : ''}`;
  const dur = x.durationMin ? ` · ${x.durationMin} min` : '';
  const meta = x.kind === 'bike' ? `${CATEGORY[x.cat]?.label || ''}${dur} · ${x.location === 'indoor' ? 'indoor' : x.location === 'outdoor-if-warm' ? 'outdoor if ≥ cutoff' : 'outdoor'} · TSS ${x.plannedTss}` : x.kind === 'gym' ? `${dur}` : x.kind === 'mobility' ? `${dur}` : '';
  const row = h('button', { class: cls, onClick: () => sessionDetail(x, d, s, plan) },
    h('span', { class: 'session-dot', style: { background: x.kind === 'bike' ? (CATEGORY[x.cat]?.color || '#1A63C9') : x.kind === 'gym' ? '#7B3FBF' : x.kind === 'event' ? '#D33A2F' : 'var(--line)' } }),
    h('span', { class: 'session-text' }, h('b', null, x.title), meta ? h('small', null, meta) : null),
    x.done ? icon('check', 'ok') : null,
  );
  return row;
}

export function sessionDetail(x, d, s, plan) {
  const ftp = x.ftp || currentFtp(s) || 150;
  const body = h('div', { class: 'stack' });
  body.appendChild(h('p', null, x.description || ''));
  if (x.note) body.appendChild(h('p', { class: 'muted small' }, x.note));
  if (x.kind === 'bike') {
    body.appendChild(kv([['Duration', `${x.durationMin} min`], ['Planned load', `${x.plannedTss} TSS`], ['Where', x.location], ['Targets at FTP', `${ftp} W`]]));
    body.appendChild(h('div', { class: 'segments' }, segmentBar(x.segments)));
    body.appendChild(h('ol', { class: 'steps' }, describeSegments(x.segments, ftp).map(l => h('li', null, l))));
    const w = { id: x.workoutId, name: x.title, cat: x.cat, segments: x.segments, why: x.description };
    body.appendChild(h('div', { class: 'row' }, button('Zwift .zwo', () => downloadFile(`${slug(x.title)}.zwo`, toZwo(w, { ftp }), 'application/xml'), { small: true, iconName: 'download' }), button('.mrc (ERG)', () => downloadFile(`${slug(x.title)}.mrc`, toMrc(w), 'text/plain'), { small: true, iconName: 'download' })));
    if (x.linkedRideId) body.appendChild(h('p', null, h('a', { href: `#/ride/${x.linkedRideId}`, onClick: () => m.close() }, `Completed — open the ride (${x.actualMin} min, load ${fmtNum(x.actualTss)})`)));
  }
  if (x.items) body.appendChild(h('div', { class: 'stack' }, x.items.map(i => h('div', { class: 'session gym-row' }, demoThumb(i.key, { sets: i.sets, reps: i.reps, note: i.note }), h('span', { class: 'session-text' }, exerciseLink(i.key, i.name, { sets: i.sets, reps: i.reps, note: i.note }), h('small', null, `${i.sets} × ${i.reps}${i.note ? ` (${i.note})` : ''} — ${i.cue}`))))));
  if (x.kind === 'gym') body.appendChild(button('Log this session in Gym', () => { m.close(); navigate(`gym/${d.date}`); }, { primary: true, small: true }));
  const actions = [];
  if (x.kind !== 'rest' && x.kind !== 'event') actions.push({ label: x.done ? 'Mark not done' : 'Mark done', primary: !x.done, onClick: async () => { x.done = !x.done; if (!x.done) x.linkedRideId = null; await savePlan(plan); navigate(location.hash); } });
  if (x.kind === 'bike') actions.push({ label: 'Swap workout', onClick: async () => { m.close(); swapWorkout(x, d, s, plan); return false; } });
  const m = modal(`${d.dayName} ${fmtDate(d.date)} — ${x.title}`, body, { actions, wide: true });
}

function swapWorkout(x, d, s, plan) {
  const ftp = x.ftp || currentFtp(s) || 150;
  const list = h('div', { class: 'stack' }, WORKOUTS.map(w => h('button', { class: 'session', onClick: async () => {
    const built = buildWorkout(w.id, x.durationMin);
    Object.assign(x, { workoutId: built.id, title: built.name, cat: built.cat, durationMin: Math.round(built.durationSec / 60), segments: built.segments, plannedTss: Math.round(plannedTss(built.segments)), description: built.why, intensity: !['recovery', 'endurance'].includes(built.cat) });
    await savePlan(plan); m.close(); navigate(location.hash);
  } }, h('span', { class: 'session-dot', style: { background: CATEGORY[w.cat]?.color } }), h('span', { class: 'session-text' }, h('b', null, w.name), h('small', null, `${CATEGORY[w.cat]?.label} · ${w.min.join('/')} min`)))));
  const m = modal('Swap workout', list, { wide: true });
  void ftp;
}

export function segmentBar(segments) {
  const total = segments.reduce((a, x) => a + x.dur, 0);
  const colorFor = f => f < 0.55 ? '#7589A8' : f < 0.75 ? '#1A63C9' : f < 0.9 ? '#2E9E4F' : f < 1.05 ? '#D4A106' : f < 1.2 ? '#E8731A' : f < 1.5 ? '#D33A2F' : '#7B3FBF';
  return h('div', { class: 'segbar' }, segments.map(x => h('span', { style: { width: `${x.dur / total * 100}%`, height: `${Math.min(100, Math.max(18, ((x.lo + x.hi) / 2) * 70))}%`, background: colorFor((x.lo + x.hi) / 2) }, title: `${Math.round(x.dur / 60)} min @ ${Math.round((x.lo + x.hi) / 2 * 100)}%` })));
}
const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function exportAllZwo(plan) {
  const ftp = currentFtp(getSettings()) || 150;
  for (const d of plan.days) for (const x of d.sessions) if (x.kind === 'bike' && !x.done) downloadFile(`${d.date}-${slug(x.title)}.zwo`, toZwo({ id: x.workoutId, name: `${d.date} ${x.title}`, cat: x.cat, segments: x.segments, why: x.description }, { ftp }), 'application/xml');
  toast('Downloading .zwo files — copy them to Documents/Zwift/Workouts/<your Zwift ID>/');
}

function renderLibrary(root, s) {
  const ftp = currentFtp(s) || 150;
  root.appendChild(h('p', { class: 'lead' }, `Every workout is defined as % of FTP (${ftp} W now) so targets update when your FTP does. Open one to see the steps and export it for Zwift or your head unit.`));
  const groups = {};
  for (const w of WORKOUTS) (groups[w.cat] ||= []).push(w);
  for (const [cat, ws] of Object.entries(groups)) {
    root.appendChild(h('h2', { class: 'group-title' }, h('span', { class: 'zone-dot', style: { background: CATEGORY[cat].color } }), CATEGORY[cat].label));
    root.appendChild(h('div', { class: 'stack' }, ws.map(w => h('button', { class: 'session', onClick: () => libraryDetail(w, ftp) }, h('span', { class: 'session-text' }, h('b', null, w.name), h('small', null, `${w.min.join(' / ')} min · ${w.why}`))))));
  }
}
function libraryDetail(w, ftp) {
  let minutes = w.min[Math.min(1, w.min.length - 1)];
  const body = h('div', { class: 'stack' });
  const draw = () => { const b = buildWorkout(w.id, minutes); body.innerHTML = ''; body.append(h('p', null, w.why), segmented(w.min.map(mm => ({ value: mm, label: `${mm} min` })), minutes, v => { minutes = +v; draw(); }), kv([['Planned load', `${Math.round(plannedTss(b.segments))} TSS`]]), segmentBar(b.segments), h('ol', { class: 'steps' }, describeSegments(b.segments, ftp).map(l => h('li', null, l))), h('div', { class: 'row' }, button('Zwift .zwo', () => downloadFile(`${slug(b.name)}-${minutes}.zwo`, toZwo(b, { ftp }), 'application/xml'), { small: true, iconName: 'download' }), button('.mrc', () => downloadFile(`${slug(b.name)}-${minutes}.mrc`, toMrc(b), 'text/plain'), { small: true, iconName: 'download' }))); };
  draw();
  modal(w.name, body, { wide: true });
}
export { aggregate, daysBetween };
