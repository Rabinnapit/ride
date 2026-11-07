// RiderHQ — Home: today's call, form/fitness/fatigue, event progress, focus, latest ride, alerts.
import { state, registerView, navigate, pmcToday, loadForecast, isInstalled, canInstall, promptInstall } from '../app.js';
import * as dom from '../ui/dom.js';
import { h, icon, tile, section, empty, button, pill, zoneBars } from '../ui/dom.js';
import { todaysCall, latestCoachNote, upcoming } from '../coach/today.js';
import { sessionDetail } from './train.js';
import { withInfo } from '../ui/glossary.js';
import { pmcChart } from '../ui/charts.js';
import { getSettings, units, fmtDuration, fmtNum, todayIso, addDays, daysBetween, rideLocalDate, fmtDate, currentFtp, DAY_NAMES } from '../settings.js';
import { aggregate, ridesInRange, multiDayBlocks, loadMetrics } from '../metrics/aggregate.js';
import { buildFocus } from '../coach/focus.js';
import { rideCall, weatherIcon, componentStatus } from '../modules/extras.js';

function tsbWord(tsb) {
  if (tsb > 25) return { word: 'Detraining', cls: 'warn' }; if (tsb > 5) return { word: 'Fresh', cls: 'good' }; if (tsb > -10) return { word: 'Neutral', cls: '' }; if (tsb > -30) return { word: 'Training hard', cls: 'good' }; return { word: 'Overreaching', cls: 'bad' };
}

registerView('home', (root) => {
  const s = getSettings();
  const today = todayIso();
  const rides = state.rides.filter(r => !r.excluded);
  const pm = pmcToday();
  const lm = loadMetrics(rides, state.pmc, today);
  const fc = state.forecast?.[today] || null;
  const call = fc ? rideCall(fc, s) : null;
  const ftp = currentFtp(s);
  const weightKg = s.profile.weightKg;
  const wkg = ftp && weightKg ? ftp / weightKg : null;

  // ---- first-run setup ----
  let setup = null;
  if (!s.profile.ftpHistory?.length && !s.onboarded) {
    const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onChange: async (e) => { const f = e.target.files[0]; if (!f) return; try { const { importBackup } = await import('../modules/extras.js'); const { importFile, refreshData, recomputeAll } = await import('../app.js'); const obj = JSON.parse(await f.text()); await importBackup(obj, { importRide: (buf, name) => importFile(buf, name, { silent: true }) }); if (state.rides.length) await recomputeAll(); else await refreshData(); navigate('home'); } catch (err) { console.error(err); } } });
    setup = section('Set up RiderHQ', h('div', { class: 'stack' },
      h('p', null, 'Two ways to start: restore your profile file (FTP, heart-rate numbers, weight, goal event, schedule), or fill in Settings by hand. Then import your .fit files.'),
      h('div', { class: 'row' }, button('Restore profile file', () => fileIn.click(), { primary: true, iconName: 'upload' }), button('Open settings', () => navigate('settings')), fileIn),
    ));
  }

  // ---- today's call (the one thing to do) ----
  const tc = todaysCall({ settings: s, state, today });
  const note = latestCoachNote(state.coachNotes);
  const kindIcon = { rest: 'moon', easy: 'heart', ride: 'rides', test: 'flag', gym: 'gym', free: 'info' }[tc.kind] || 'info';
  const todayPanel = h('section', { class: `today ${tc.kind} ${tc.done ? 'done' : ''}` },
    h('div', { class: 'today-date' }, h('span', null, `${DAY_NAMES[new Date().getDay()]} ${fmtDate(today)}`), call ? h('span', { class: `call ${call.ok ? 'ok' : 'no'}` }, weatherIcon(fc.code7), ' ', call.label, h('small', null, ` ${call.detail}`)) : h('button', { class: 'btn small ghost', onClick: () => loadForecast(true).then(() => navigate('home')) }, 'Load weather')),
    h('div', { class: 'today-main' },
      h('div', { class: 'today-kind' }, icon(kindIcon)),
      h('div', null, h('div', { class: 'today-eyebrow' }, tc.done ? 'Done today' : 'Today'), h('h1', null, tc.title), h('p', { class: 'today-line' }, tc.line)),
    ),
    tc.why.length ? h('p', { class: 'today-why' }, tc.why.join(' · ')) : null,
    h('div', { class: 'today-actions' },
      tc.session ? button(tc.session.kind === 'gym' ? 'Open gym session' : 'Open session', () => sessionDetail(tc.session, state.plan.days.find(d => d.date === today), s, state.plan), { primary: true, small: true }) : state.plan ? button('See the plan', () => navigate('train'), { small: true }) : button('Build my plan', () => navigate('train'), { primary: true, small: true }),
      tc.kind === 'rest' ? button('Log wellness', () => navigate('wellness'), { small: true }) : null,
      tc.pack ? button('What to pack', () => packDialog(tc.pack), { small: true, iconName: 'food' }) : null,
      tc.source ? h('span', { class: 'today-source' }, tc.source) : null,
    ));

  // ---- coach's latest word ----
  let coachPanel = null;
  if (note) {
    coachPanel = section('From your coach', h('div', { class: 'coach-word' },
      h('p', { class: 'coach-head' }, note.headline),
      note.focusNext14Days ? h('p', null, h('b', null, 'Next 14 days: '), note.focusNext14Days) : null,
      note.concerns?.length ? h('ul', { class: 'coach-concerns' }, note.concerns.slice(0, 2).map(c => h('li', null, c))) : null,
    ), { sub: `${note.title || ''} · ${fmtDate(note.date)}`, actions: button('All notes', () => navigate('coach'), { small: true }) });
  }

  // ---- where you stand ----
  const ga = s.goals.groupA || { label: 'Group A', avgKmh: 32, ftpWkg: 3.2 };
  const r90 = ridesInRange(rides, addDays(today, -89), today);
  const a90 = aggregate(r90);
  const bestSpeed = Math.max(0, ...r90.filter(r => r.timerSec >= 3600 && !r.indoor).map(r => r.avgSpeed * 3.6));
  const tsbW = tsbWord(pm?.tsb ?? 0);
  const standPanel = section('Where you stand', h('div', null,
    h('div', { class: 'stand-grid' },
      standCell(pm ? pm.ctl.toFixed(0) : '–', 'Fitness', 'ctl', pm ? `${lm.rampRate > 0 ? '+' : ''}${lm.rampRate.toFixed(1)} this week` : 'import rides'),
      standCell(pm ? (pm.tsb > 0 ? '+' : '') + pm.tsb.toFixed(0) : '–', 'Form', 'tsb', tsbW.word, tsbW.cls),
      standCell(state.readiness ? state.readiness.score : '–', 'Readiness', 'readiness', state.readiness ? (state.readiness.band === 'green' ? 'go' : state.readiness.band === 'amber' ? 'ease off' : 'rest') : 'log wellness', state.readiness?.band || ''),
      standCell(ftp ? `${ftp} W` : '–', 'FTP', 'ftp', wkg ? `${wkg.toFixed(2)} W/kg` : 'set weight'),
    ),
    h('div', { class: 'rail-list' },
      rail(`W/kg for ${ga.label}`, wkg || 0, ga.ftpWkg, v => v.toFixed(2), 'wkg'),
      rail(`Best 1 h+ ride speed vs ${ga.avgKmh} km/h`, bestSpeed, ga.avgKmh, v => `${v.toFixed(1)} km/h`),
      rail('Fitness (CTL) vs 60', pm?.ctl || 0, 60, v => v.toFixed(0), 'ctl'),
    ),
  ), { sub: 'Numbers from your last 90 days. The rails show how far you are from riding with the fast group.', actions: button('Edit targets', () => navigate('settings'), { small: true }) });

  // ---- event countdown ----
  const ev = s.goals.event;
  let eventPanel = null;
  if (ev?.date) {
    const dte = daysBetween(today, ev.date);
    const blocks = multiDayBlocks(r90);
    const perDay = ev.distanceKm / ev.days;
    eventPanel = section(ev.name, h('div', null,
      h('div', { class: 'event-head' }, h('div', { class: 'event-days' }, h('span', { class: 'big' }, dte), h('span', null, dte === 1 ? 'day to go' : 'days to go')), h('div', { class: 'event-meta' }, `${ev.distanceKm} km in ${ev.days} days · ${perDay.toFixed(0)} km/day · ${fmtDate(ev.date, { year: 'numeric', month: 'long', day: 'numeric' })}`)),
      h('div', { class: 'rail-list' },
        rail(`Longest ride vs ${perDay.toFixed(0)} km/day`, a90.longestRideM / 1000, perDay, v => `${v.toFixed(0)} km`),
        rail(`Best 2-day block vs ${(perDay * 2).toFixed(0)} km`, blocks.best2DayM / 1000, perDay * 2, v => `${v.toFixed(0)} km`),
      ),
    ), { sub: 'Readiness for the tour' });
  }

  // ---- focus ----
  const focus = buildFocus({ settings: s, rides, pmc: state.pmc, today, readiness: state.readiness, wellnessCount: state.wellness.length });
  const focusPanel = section('What to work on', rides.length ? h('div', { class: 'focus-list' }, focus.cards.filter(c => c.priority <= 3).slice(0, 3).map(c => focusCard(c))) : empty('Import your first ride to get recommendations.'), { sub: focus.phase?.label, actions: button('All', () => navigate('train'), { small: true }) });

  // ---- this week + coming up ----
  const weekStart = addDays(today, -((new Date().getDay() + 6) % 7));
  const weekRides = ridesInRange(rides, weekStart, today);
  const aw = aggregate(weekRides);
  const lastWeek = aggregate(ridesInRange(rides, addDays(weekStart, -7), addDays(weekStart, -1)));
  const plannedWeek = state.plan ? state.plan.days.filter(d => d.date >= weekStart && d.date <= addDays(weekStart, 6)).flatMap(d => d.sessions).filter(x => x.kind === 'bike').reduce((a, x) => a + (x.done ? (x.actualTss || x.plannedTss) : x.plannedTss), 0) : 0;
  const up = upcoming(state, today, 4);
  const weekPanel = section('This week', h('div', null,
    h('div', { class: 'tiles compact' },
      tile(fmtDuration(aw.timerSec, { short: true }), 'Ride time', `last week ${fmtDuration(lastWeek.timerSec, { short: true })}`),
      tile(units.distStr(aw.distanceM, 0), 'Distance', `last week ${units.distStr(lastWeek.distanceM, 0)}`),
      tile(fmtNum(aw.load), 'Load so far', plannedWeek ? `of ${fmtNum(plannedWeek)} planned` : `last week ${fmtNum(lastWeek.load)}`, '', 'load'),
      tile(isFinite(lm.acwr) ? lm.acwr.toFixed(2) : '–', 'Acute : chronic', lm.acwr > 1.5 ? 'spike — ease off' : lm.acwr >= 0.8 && lm.acwr <= 1.3 ? 'sweet spot' : 'low', lm.acwr > 1.5 ? 'warn' : '', 'acwr'),
    ),
    up.length ? h('div', { class: 'upcoming' }, up.map(u => h('button', { class: `up ${u.session.kind}`, onClick: () => sessionDetail(u.session, state.plan.days.find(d => d.date === u.date), s, state.plan) }, h('b', null, u.dayName), h('span', null, u.session.title), u.session.durationMin ? h('small', null, `${u.session.durationMin} min`) : null))) : null,
  ), { sub: `Week of ${fmtDate(weekStart)}`, actions: button('Full plan', () => navigate('train'), { small: true }) });

  // ---- alerts ----
  const alerts = [];
  if (!s.profile.ftpHistory?.length && s.onboarded) alerts.push({ cls: 'warn', text: 'Set your FTP, max HR and weight in Settings so zones and TSS are right.', go: 'settings' });
  for (const r of rides.slice(0, 5)) if (r.ftpSuspectLow) { alerts.push({ cls: 'warn', text: `${fmtDate(rideLocalDate(r))}: NP above FTP for ${fmtDuration(r.timerSec, { short: true })} — your FTP is probably set too low.`, go: `ride/${r.id}` }); break; }
  const odo = rides.reduce((a, r) => a + r.distanceM, 0) / 1000;
  for (const c of state.equipment) { const st = componentStatus(c, odo); if (st.state !== 'ok') alerts.push({ cls: st.state === 'due' ? 'bad' : 'warn', text: `${c.name || c.type}: ${st.state === 'due' ? 'due for replacement/service' : 'coming up soon'}${st.usedKm != null ? ` (${st.usedKm.toFixed(0)} km)` : ''}.`, go: 'equipment' }); }
  if (rides.length && !s.sync?.token) alerts.push({ cls: 'warn', text: 'Connect your private GitHub backup (ridehq-data) so your rides are safe and Claude can read them and save its analyses.', go: 'settings/backup' });
  if (!state.wellness.find(w => w.date === today)) alerts.push({ cls: '', text: 'Log today’s wellness (sleep, resting HR, HRV) for a readiness score.', go: 'wellness' });
  const alertPanel = alerts.length ? h('div', { class: 'alerts' }, alerts.map(a => h('button', { class: `alert ${a.cls}`, onClick: () => navigate(a.go) }, icon(a.cls === 'bad' ? 'warn' : a.cls === 'warn' ? 'warn' : 'info'), h('span', null, a.text)))) : null;

  // ---- PMC ----
  const pmcPanel = section('Fitness, fatigue and form', h('div', null), { sub: 'Last 90 days and the next 21 planned (dashed)', term: 'ctl' });
  if (state.pmc.length) { const from = addDays(today, -89); pmcChart(pmcPanel.querySelector('.panel-body'), state.pmc.filter(p => p.date >= from), { height: 240 }); }
  else pmcPanel.querySelector('.panel-body').appendChild(empty('No rides yet.'));

  // ---- latest ride ----
  const last = rides[0];
  const latest = last ? section('Latest ride', rideCard(last), { actions: button('All rides', () => navigate('rides'), { small: true }) }) : section('Latest ride', empty('Drop a .fit file anywhere on this page, or use Import ride.', button('Import ride', () => document.querySelector('input[data-fit]').click(), { primary: true })));

  // ---- install card (phone) ----
  let install = null;
  if (!isInstalled() && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    install = h('div', { class: 'alert static install' }, icon('download'),
      h('span', null, h('strong', null, 'Install RiderHQ on this phone. '), 'Then it appears in OnelapFit’s share menu, so one tap sends a ride here.'),
      canInstall() ? button('Install app', () => promptInstall(), { primary: true, small: true }) : button('How to install', () => navigate('howto'), { small: true }));
  }
  root.append(setup, install, todayPanel, alertPanel, coachPanel, h('div', { class: 'grid-2' }, standPanel, weekPanel), h('div', { class: 'grid-2' }, focusPanel, eventPanel), latest, pmcPanel);
});

function standCell(value, label, term, sub, cls = '') {
  return h('div', { class: `stand ${cls}` }, h('div', { class: 'stand-v' }, value), h('div', { class: 'stand-l' }, ...withInfo(label, term)), sub ? h('div', { class: 'stand-s' }, sub) : null);
}
/** A progress rail: current vs target with the numbers on the right. */
function rail(label, cur, goal, fmt, term = null) {
  const pct = goal ? Math.min(100, Math.max(0, cur / goal * 100)) : 0;
  return h('div', { class: 'rail' }, h('div', { class: 'rail-top' }, h('span', null, ...(term ? withInfo(label, term) : [label])), h('span', { class: 'rail-n' }, `${fmt(cur)} / ${fmt(goal)}`)), h('div', { class: 'rail-bar', role: 'progressbar', 'aria-valuenow': Math.round(pct), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: { width: `${pct}%` }, class: pct >= 100 ? 'full' : '' })));
}
function packDialog(p) {
  const { modal } = dom;
  modal('What to pack', h('div', { class: 'stack' },
    h('p', null, `${p.target.text} That’s about ${p.need} g of carbs and ${(p.fluidNeed / 1000).toFixed(1)} L of fluid for this ride.`),
    h('ul', { class: 'pack-list' }, p.lines.map(l => h('li', null, h('b', null, `${l.qty} × `), l.name, l.carbs ? h('small', null, ` · ${Math.round(l.carbs * l.qty)} g carbs`) : null))),
    h('p', { class: 'small muted' }, 'Eat on a timer: something every 20–30 minutes from the first hour, a bottle an hour. Edit your products in Fueling.'),
  ));
}

export function focusCard(c) {
  const open = h('details', { class: `focus-card p${c.priority}` },
    h('summary', null, h('div', { class: 'focus-head' }, h('div', { class: 'focus-metric' }, h('div', { class: 'fm-value' }, c.metric?.value ?? ''), h('div', { class: 'fm-label' }, c.metric?.label ?? '')), h('div', { class: 'focus-title' }, h('h3', null, c.title), h('p', null, c.summary)))),
    c.evidence?.length ? h('div', { class: 'focus-evidence' }, h('h4', null, 'Why'), h('ul', null, c.evidence.map(e => h('li', null, e)))) : null,
    c.actions?.length ? h('div', { class: 'focus-actions' }, h('h4', null, 'Do this'), h('ul', null, c.actions.map(a => h('li', null, a)))) : null,
  );
  return open;
}

export function rideCard(r) {
  const wkg = r.paramsUsed?.weightKg;
  return h('a', { class: 'ride-card', href: `#/ride/${r.id}` },
    h('div', { class: 'ride-card-head' }, h('div', null, h('strong', null, r.name), h('span', { class: 'muted' }, ` · ${fmtDate(rideLocalDate(r), { weekday: 'short', month: 'short', day: 'numeric' })}`)), r.indoor ? pill('indoor') : null, r.powerValid === false && r.hasPower ? pill('power excluded', 'warn') : null, r.excluded ? pill('excluded', 'warn') : null),
    h('div', { class: 'ride-stats' },
      h('div', null, h('b', null, units.distStr(r.distanceM, 1)), h('small', null, 'distance')),
      h('div', null, h('b', null, fmtDuration(r.timerSec)), h('small', null, 'time')),
      h('div', null, h('b', null, units.elevStr(r.ascentM)), h('small', null, 'climbing')),
      r.hasPower && r.powerValid !== false ? h('div', null, h('b', null, `${Math.round(r.np)} W`), h('small', null, 'NP')) : h('div', null, h('b', null, isFinite(r.avgHr) ? Math.round(r.avgHr) : '–'), h('small', null, 'avg HR')),
      h('div', null, h('b', null, fmtNum(r.load)), h('small', null, r.loadSource === 'power' ? 'TSS' : 'hrTSS')),
      wkg && r.hasPower && r.powerValid !== false ? h('div', null, h('b', null, (r.np / wkg).toFixed(2)), h('small', null, 'NP W/kg')) : h('div', null, h('b', null, units.speedStr(r.avgSpeed)), h('small', null, 'avg speed')),
    ),
    r.tizPower ? h('div', { class: 'zone-strip' }, r.powerZones.map((z, i) => h('span', { style: { width: `${(r.tizPower[i] / Math.max(1, r.tizPower.reduce((a, b) => a + b, 0)) * 100)}%`, background: z.color }, title: `${z.name} ${fmtDuration(r.tizPower[i], { short: true })}` }))) : (r.tizHr ? h('div', { class: 'zone-strip' }, r.hrZones.map((z, i) => h('span', { style: { width: `${(r.tizHr[i] / Math.max(1, r.tizHr.reduce((a, b) => a + b, 0)) * 100)}%`, background: z.color }, title: `${z.name} ${fmtDuration(r.tizHr[i], { short: true })}` }))) : null),
  );
}
export { zoneBars };
