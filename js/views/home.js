// RideHQ — Home: today's call, form/fitness/fatigue, event progress, focus, latest ride, alerts.
import { state, registerView, navigate, pmcToday, loadForecast, isInstalled, canInstall, promptInstall } from '../app.js';
import { h, icon, tile, section, empty, button, progress, pill, zoneBars } from '../ui/dom.js';
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

  // ---- display panel (head-unit style) ----
  const todayPlan = state.plan?.days.find(d => d.date === today);
  const planLine = todayPlan ? todayPlan.sessions.filter(x => x.kind !== 'mobility').map(x => x.title).join(' · ') : 'No plan yet — generate one in Train';
  const display = h('section', { class: 'display' },
    h('div', { class: 'display-row' },
      h('div', { class: 'display-cell' }, h('div', { class: 'dv' }, pm ? pm.ctl.toFixed(0) : '–'), h('div', { class: 'dl' }, ...withInfo('Fitness', 'ctl'))),
      h('div', { class: 'display-cell' }, h('div', { class: 'dv' }, pm ? pm.atl.toFixed(0) : '–'), h('div', { class: 'dl' }, ...withInfo('Fatigue', 'atl'))),
      h('div', { class: 'display-cell' }, h('div', { class: `dv ${tsbWord(pm?.tsb ?? 0).cls}` }, pm ? (pm.tsb > 0 ? '+' : '') + pm.tsb.toFixed(0) : '–'), h('div', { class: 'dl' }, ...withInfo(`Form · ${tsbWord(pm?.tsb ?? 0).word}`, 'tsb'))),
      h('div', { class: 'display-cell' }, h('div', { class: `dv ${state.readiness ? state.readiness.band : ''}` }, state.readiness ? state.readiness.score : '–'), h('div', { class: 'dl' }, ...withInfo(state.readiness ? 'Readiness' : 'Readiness · log wellness', 'readiness'))),
    ),
    h('div', { class: 'display-foot' },
      h('div', { class: 'display-today' }, h('strong', null, `${DAY_NAMES[new Date().getDay()]} ${fmtDate(today)}`), ' — ', planLine),
      call ? h('div', { class: `call ${call.ok ? 'ok' : 'no'}` }, h('span', null, weatherIcon(fc.code7)), h('strong', null, call.label), h('span', null, call.detail)) : h('button', { class: 'btn small ghost', onClick: () => loadForecast(true).then(() => navigate('home')) }, 'Load weather'),
    ));

  // ---- event progress ----
  const ev = s.goals.event;
  let eventPanel = null;
  if (ev?.date) {
    const dte = daysBetween(today, ev.date);
    const r90 = ridesInRange(rides, addDays(today, -89), today);
    const a90 = aggregate(r90), blocks = multiDayBlocks(r90);
    const perDay = ev.distanceKm / ev.days;
    const weightKg = s.profile.weightKg;
    const wkg = ftp && weightKg ? ftp / weightKg : null;
    const targetFtp = s.goals.targetFtp || (ftp ? Math.round(ftp * 1.25) : null);
    const rows = [
      { label: `Longest ride vs ${perDay.toFixed(0)} km/day`, cur: a90.longestRideM / 1000, goal: perDay, fmt: v => `${v.toFixed(0)} km` },
      { label: `Best 2-day block vs ${(perDay * 2).toFixed(0)} km`, cur: blocks.best2DayM / 1000, goal: perDay * 2, fmt: v => `${v.toFixed(0)} km` },
      { label: 'Fitness (CTL) vs 60', cur: pm?.ctl || 0, goal: 60, fmt: v => v.toFixed(0) },
      ftp ? { label: `FTP vs ${targetFtp} W target`, cur: ftp, goal: targetFtp, fmt: v => `${v} W` } : null,
      wkg ? { label: 'W/kg vs 2.5', cur: wkg, goal: 2.5, fmt: v => v.toFixed(2) } : null,
    ].filter(Boolean);
    eventPanel = section(ev.name, h('div', null,
      h('div', { class: 'event-head' }, h('div', { class: 'event-days' }, h('span', { class: 'big' }, dte), h('span', null, dte === 1 ? 'day to go' : 'days to go')), h('div', { class: 'event-meta' }, `${ev.distanceKm} km in ${ev.days} days · ${perDay.toFixed(0)} km/day · ${fmtDate(ev.date, { year: 'numeric', month: 'long', day: 'numeric' })}`)),
      h('div', { class: 'goal-rows' }, rows.map(r => h('div', { class: 'goal-row' }, h('div', { class: 'goal-label' }, r.label), progress(r.cur / r.goal * 100, { label: `${r.fmt(r.cur)} / ${r.fmt(r.goal)}` })))),
    ), { sub: 'Readiness for the event, from your last 90 days', actions: button('Edit goal', () => navigate('settings'), { small: true }) });
  }

  // ---- focus ----
  const focus = buildFocus({ settings: s, rides, pmc: state.pmc, today, readiness: state.readiness, wellnessCount: state.wellness.length });
  const focusPanel = section('What to focus on', rides.length ? h('div', { class: 'focus-list' }, focus.cards.filter(c => c.priority <= 3).slice(0, 4).map(c => focusCard(c))) : empty('Import your first ride to get recommendations.'), { sub: focus.phase?.label, actions: button('All recommendations', () => navigate('train'), { small: true }) });

  // ---- this week ----
  const weekStart = addDays(today, -((new Date().getDay() + 6) % 7));
  const weekRides = ridesInRange(rides, weekStart, today);
  const aw = aggregate(weekRides);
  const lastWeek = aggregate(ridesInRange(rides, addDays(weekStart, -7), addDays(weekStart, -1)));
  const weekPanel = section('This week', h('div', { class: 'tiles' },
    tile(fmtDuration(aw.timerSec, { short: true }), 'Ride time', `last week ${fmtDuration(lastWeek.timerSec, { short: true })}`),
    tile(units.distStr(aw.distanceM, 0), 'Distance', `last week ${units.distStr(lastWeek.distanceM, 0)}`),
    tile(fmtNum(aw.load), 'Training load', `last week ${fmtNum(lastWeek.load)}`),
    tile(units.elevStr(aw.ascentM), 'Climbing', `${aw.rides} ride${aw.rides === 1 ? '' : 's'}`),
    tile(isFinite(lm.rampRate) ? (lm.rampRate > 0 ? '+' : '') + lm.rampRate.toFixed(1) : '–', 'CTL ramp / week', lm.rampRate > 7 ? 'fast — watch fatigue' : 'target +3 to +6'),
    tile(isFinite(lm.acwr) ? lm.acwr.toFixed(2) : '–', 'Acute : chronic', lm.acwr > 1.5 ? 'spike' : lm.acwr >= 0.8 && lm.acwr <= 1.3 ? 'sweet spot' : 'low'),
  ), { sub: `Week of ${fmtDate(weekStart)}` });

  // ---- PMC ----
  const pmcPanel = section('Fitness, fatigue and form', h('div', null), { sub: 'Last 90 days and the next 21 planned (dashed)' });
  if (state.pmc.length) {
    const from = addDays(today, -89);
    const series = state.pmc.filter(p => p.date >= from);
    pmcChart(pmcPanel.querySelector('.panel-body'), series, { height: 240 });
  } else pmcPanel.querySelector('.panel-body').appendChild(empty('No rides yet.'));

  // ---- latest ride ----
  const last = rides[0];
  const latest = last ? section('Latest ride', rideCard(last), { actions: button('All rides', () => navigate('rides'), { small: true }) }) : section('Latest ride', empty('Drop a .fit file anywhere on this page, or use Import ride.', button('Import ride', () => document.querySelector('input[data-fit]').click(), { primary: true })));

  // ---- first-run setup ----
  let setup = null;
  if (!s.profile.ftpHistory?.length && !s.onboarded) {
    const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onChange: async (e) => { const f = e.target.files[0]; if (!f) return; try { const { importBackup } = await import('../modules/extras.js'); const { importFile, refreshData, recomputeAll } = await import('../app.js'); const obj = JSON.parse(await f.text()); await importBackup(obj, { importRide: (buf, name) => importFile(buf, name, { silent: true }) }); if (state.rides.length) await recomputeAll(); else await refreshData(); navigate('home'); } catch (err) { console.error(err); } } });
    setup = section('Set up RideHQ', h('div', { class: 'stack' },
      h('p', null, 'Two ways to start: restore your profile file (FTP, heart-rate numbers, weight, goal event, schedule), or fill in Settings by hand. Then import your .fit files.'),
      h('div', { class: 'row' }, button('Restore profile file', () => fileIn.click(), { primary: true, iconName: 'upload' }), button('Open settings', () => navigate('settings')), fileIn),
    ));
  }
  // ---- alerts ----
  const alerts = [];
  if (!s.profile.ftpHistory?.length && s.onboarded) alerts.push({ cls: 'warn', text: 'Set your FTP, max HR and weight in Settings so zones and TSS are right.', go: 'settings' });
  for (const r of rides.slice(0, 5)) if (r.ftpSuspectLow) { alerts.push({ cls: 'warn', text: `${fmtDate(rideLocalDate(r))}: NP above FTP for ${fmtDuration(r.timerSec, { short: true })} — your FTP is probably set too low.`, go: `ride/${r.id}` }); break; }
  const odo = rides.reduce((a, r) => a + r.distanceM, 0) / 1000;
  for (const c of state.equipment) { const st = componentStatus(c, odo); if (st.state !== 'ok') alerts.push({ cls: st.state === 'due' ? 'bad' : 'warn', text: `${c.name || c.type}: ${st.state === 'due' ? 'due for replacement/service' : 'coming up soon'}${st.usedKm != null ? ` (${st.usedKm.toFixed(0)} km)` : ''}.`, go: 'equipment' }); }
  if (rides.length && !s.sync?.token) alerts.push({ cls: 'warn', text: 'Connect your private GitHub backup (ridehq-data) so your rides are safe and Claude can read them and save its analyses.', go: 'settings/backup' });
  if (!state.wellness.find(w => w.date === today)) alerts.push({ cls: '', text: 'Log today\'s wellness (sleep, resting HR, HRV) for a readiness score.', go: 'wellness' });
  const alertPanel = alerts.length ? h('div', { class: 'alerts' }, alerts.map(a => h('button', { class: `alert ${a.cls}`, onClick: () => navigate(a.go) }, icon(a.cls === 'bad' ? 'warn' : a.cls === 'warn' ? 'warn' : 'info'), h('span', null, a.text)))) : null;

  // ---- install card (phone): installing adds RideHQ to the share menu ----
  let install = null;
  if (!isInstalled() && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    install = h('div', { class: 'alert static install' }, icon('download'),
      h('span', null, h('strong', null, 'Install RideHQ on this phone. '), 'Then it appears in OnelapFit\'s share menu, so one tap sends a ride here.'),
      canInstall() ? button('Install app', () => promptInstall(), { primary: true, small: true }) : button('How to install', () => navigate('howto'), { small: true }));
  }
  root.append(setup, install, display, alertPanel, h('div', { class: 'grid-2' }, focusPanel, eventPanel), weekPanel, pmcPanel, latest);
});

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
