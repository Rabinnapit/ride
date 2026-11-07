// RideHQ — Gym: log sets against the planned session, track estimated 1RM, see progression.
import { state, registerView, navigate, db, refreshData } from '../app.js';
import { h, icon, section, empty, button, table, input, field, toast, kv, modal, tile } from '../ui/dom.js';
import { lineChart } from '../ui/charts.js';
import { getSettings, todayIso, fmtDate, units, addDays } from '../settings.js';
import { EXERCISES, SESSIONS, MOBILITY, GYM_PHASES, e1rm, progression } from '../coach/gym.js';
import { phaseFor } from '../coach/planner.js';
import { demoThumb, exerciseLink } from '../ui/demo.js';

registerView('gym', (root, { id }) => {
  const s = getSettings();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(id || '') ? id : todayIso();
  const planned = state.plan?.days.find(d => d.date === date)?.sessions.find(x => x.kind === 'gym') || null;
  const logs = state.gymlog.filter(l => l.date === date);
  const head = h('div', { class: 'page-head' }, h('h1', null, 'Gym'), h('div', { class: 'row' }, input({ type: 'date', value: date, onChange: e => navigate(`gym/${e.target.value}`) }), button('Log exercise', () => logDialog(date, null), { primary: true, small: true, iconName: 'plus' })));
  root.appendChild(head);

  // today's session
  const items = planned?.items || null;
  const sessPanel = section(planned ? planned.title : 'No gym session planned today', items ? h('div', { class: 'stack' }, items.map(i => exerciseRow(i, date, logs))) : h('div', null, h('p', { class: 'muted' }, 'Pick a template to follow, or log exercises freely.'), templatePicker(date)), { sub: planned ? planned.description : null });
  root.appendChild(sessPanel);

  // logged today
  const wfmt = kg => units.weightStr(kg, 1);
  if (logs.length) root.appendChild(section(`Logged on ${fmtDate(date)}`, table(['Exercise', 'Sets', 'Best set', `e1RM (${units.weight(1).u})`, ''], logs.map(l => { const best = l.sets.reduce((a, x) => e1rm(x.weight, x.reps) > e1rm(a.weight, a.reps) ? x : a, l.sets[0]); return [EXERCISES[l.exercise]?.name || l.exercise, l.sets.map(x => `${units.weight(x.weight).v.toFixed(1)}×${x.reps}`).join(', '), `${wfmt(best.weight)} × ${best.reps}`, units.weight(e1rm(best.weight, best.reps)).v.toFixed(1), h('button', { class: 'icon-btn', 'aria-label': 'Delete', onClick: async () => { await db.delete('gymlog', l.id); await refreshData(); navigate(`gym/${date}`); } }, icon('trash'))]; }))));

  // progress: e1RM per key lift
  const lifts = ['backsquat', 'trapbar', 'rdl', 'cgbench', 'row', 'ohp', 'split'];
  const hist = state.gymlog.slice().sort((a, b) => a.date.localeCompare(b.date));
  const series = lifts.map(k => ({ k, pts: hist.filter(l => l.exercise === k).map(l => ({ date: l.date, v: Math.max(...l.sets.map(x => e1rm(x.weight, x.reps))) })) })).filter(x => x.pts.length >= 2);
  const progPanel = section('Strength progress (estimated 1RM)', series.length ? h('div', { class: 'prog-chart' }) : empty('Log the same lift on two or more days to see a trend.'));
  if (series.length) setTimeout(() => { const dates = [...new Set(series.flatMap(x => x.pts.map(p => p.date)))].sort(); const colors = ['#1A63C9', '#E8731A', '#2E9E4F', '#D33A2F', '#7B3FBF', '#B3449A', '#D4A106']; lineChart(progPanel.querySelector('.prog-chart'), dates.map(d => fmtDate(d)), series.map((x, i) => ({ label: EXERCISES[x.k].name, data: dates.map(d => { const p = x.pts.find(q => q.date === d); return p ? +units.weight(p.v).v.toFixed(1) : null; }), borderColor: colors[i], backgroundColor: colors[i], pointRadius: 3 })), { height: 220, yTitle: `${units.weight(1).u} (e1RM)` }); }, 0);
  root.appendChild(progPanel);

  // phase guide
  const daysToEvent = s.goals.event?.date ? Math.round((new Date(s.goals.event.date) - new Date(todayIso())) / 86400000) : null;
  const ph = phaseFor(daysToEvent != null ? Math.ceil(daysToEvent / 7) : null);
  root.appendChild(section('Strength periodization', table(['Phase', 'When', 'Scheme'], Object.entries(GYM_PHASES).map(([k, p]) => [h('span', null, p.label, k === ph.gym ? h('b', { class: 'muted' }, ' ← now') : null), p.weeks, p.scheme])), { sub: 'Heavy, fast concentric lifting improves cycling economy and late-ride power (Rønnestad & Mujika 2014). Leave 2 reps in reserve until the max-strength block; never heavy legs the day before the long ride.' }));
  root.appendChild(section(MOBILITY.title, h('div', { class: 'stack' }, MOBILITY.items.map(i => h('div', { class: 'session gym-row' }, demoThumb(i.key, { sets: i.sets, reps: i.reps }), h('span', { class: 'session-text' }, exerciseLink(i.key, i.name, { sets: i.sets, reps: i.reps }), h('small', null, `${i.reps} — ${i.cue}`)))))));
  root.appendChild(h('p', { class: 'small muted' }, 'Tap any exercise or animation to see the start position and one full rep.'));
});

function exerciseRow(i, date, logs) {
  const log = logs.find(l => l.exercise === i.key);
  const last = state.gymlog.filter(l => l.exercise === i.key && l.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
  return h('div', { class: `session gym-row ${log ? 'done' : ''}` },
    demoThumb(i.key, { sets: i.sets, reps: i.reps, note: i.note }),
    h('span', { class: 'session-text' }, exerciseLink(i.key, i.name, { sets: i.sets, reps: i.reps, note: i.note }), h('small', null, `${i.sets} × ${i.reps}${i.note ? ` · ${i.note}` : ''} — ${i.cue}`), last ? h('small', { class: 'muted' }, `Last (${fmtDate(last.date)}): ${last.sets.map(x => `${units.weight(x.weight).v.toFixed(1)}×${x.reps}`).join(', ')} · ${progression(last.sets, kg => units.weightStr(kg, 1))}`) : null),
    h('span', { class: 'row' }, log ? icon('check', 'ok') : null, button(log ? 'Edit' : 'Log', () => logDialog(date, i.key, log), { small: true })),
  );
}
function templatePicker(date) {
  const wrap = h('div', { class: 'stack' });
  for (const [phase, set] of Object.entries(SESSIONS)) for (const [key, sess] of Object.entries(set)) wrap.appendChild(h('button', { class: 'session', onClick: () => { modal(sess.title, h('div', null, h('p', { class: 'muted small' }, GYM_PHASES[phase].scheme), table(['Exercise', 'Sets × reps', 'Cue'], sess.items.map(i => [exerciseLink(i.key, i.name, { sets: i.sets, reps: i.reps, note: i.note }), `${i.sets} × ${i.reps}`, h('span', { class: 'small muted' }, i.cue)])), h('div', { class: 'stack' }, sess.items.map(i => button(`Log ${i.name}`, () => logDialog(date, i.key), { small: true })))), { wide: true }); } }, h('span', { class: 'session-dot', style: { background: '#7B3FBF' } }), h('span', { class: 'session-text' }, h('b', null, sess.title), h('small', null, `${GYM_PHASES[phase].label} · ${key}`))));
  return wrap;
}
function logDialog(date, key, existing = null) {
  const s = getSettings();
  const exSel = h('select', { class: 'input' }, Object.entries(EXERCISES).filter(([, e]) => e.group !== 'mobility').map(([k, e]) => h('option', { value: k, selected: k === (existing?.exercise || key) }, e.name)));
  const setsBox = h('div', { class: 'stack sets' });
  const unitLabel = s.units.weight === 'lb' ? 'lb' : 'kg';
  const toUnit = kg => s.units.weight === 'lb' ? Math.round(kg * 2.2046226 * 2) / 2 : kg;
  const addSet = (w = '', r = '', rir = 2) => setsBox.appendChild(h('div', { class: 'row set-row' }, input({ type: 'number', step: '0.5', placeholder: unitLabel, value: w === '' ? '' : toUnit(w), 'data-w': 1 }), input({ type: 'number', placeholder: 'reps', value: r, 'data-r': 1 }), h('select', { class: 'input', 'data-rir': 1 }, [0, 1, 2, 3, 4].map(n => h('option', { value: n, selected: n === rir }, `${n} in reserve`))), h('button', { class: 'icon-btn', onClick: e => e.currentTarget.parentElement.remove() }, icon('close'))));
  if (existing) existing.sets.forEach(x => addSet(x.weight, x.reps, x.rir ?? 2)); else { addSet(); addSet(); addSet(); }
  const body = h('div', { class: 'stack' }, field('Exercise', exSel), h('div', null, h('div', { class: 'field-label' }, `Sets (weight in ${unitLabel})`), setsBox, button('Add set', () => addSet(), { small: true, iconName: 'plus' })), field('Notes', input({ type: 'text', value: existing?.notes || '', id: 'gym-notes' })));
  modal(existing ? 'Edit exercise' : 'Log exercise', body, { actions: [{ label: 'Save', primary: true, onClick: async () => {
    const sets = [...setsBox.querySelectorAll('.set-row')].map(row => ({ weight: units.weightToKg(+row.querySelector('[data-w]').value || 0, s), reps: +row.querySelector('[data-r]').value || 0, rir: +row.querySelector('[data-rir]').value })).filter(x => x.reps > 0);
    if (!sets.length) { toast('Add at least one set', { error: true }); return false; }
    await db.put('gymlog', { id: existing?.id || `${date}-${exSel.value}-${Date.now()}`, date, exercise: exSel.value, sets, notes: body.querySelector('#gym-notes').value });
    await refreshData(); navigate(`gym/${date}`); toast('Logged');
  } }] });
}
export { tile, kv, addDays };
