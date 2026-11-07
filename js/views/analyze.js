// RideHQ — Analyze: one window selector drives every panel; compare against the previous window.
import { state, registerView, navigate } from '../app.js';
import { h, tile, section, empty, segmented, zoneBars, delta, table, input, field, button, pill } from '../ui/dom.js';
import { mmpChart, barsChart, lineChart, pmcChart, ZONE_COLORS } from '../ui/charts.js';
import { getSettings, units, fmtDuration, fmtNum, todayIso, addDays, daysBetween, rideLocalDate, fmtDate, currentFtp } from '../settings.js';
import { WINDOWS, windowRange, ridesInRange, aggregate, powerProfile, estimateFtp, trend, weeklyBuckets, multiDayBlocks, COGGAN_PROFILE } from '../metrics/aggregate.js';
import { MMP_DURATIONS } from '../metrics/compute.js';
import { CADENCE_BUCKETS } from '../metrics/zones.js';

let win = '30d', customFrom = null, customTo = null, selectedRide = null;

registerView('analyze', (root) => {
  const s = getSettings();
  const today = todayIso();
  const all = state.rides.filter(r => !r.excluded);
  if (!all.length) { root.append(h('h1', null, 'Analyze'), empty('Import rides to compare time windows.')); return; }
  if (win === 'ride' && !selectedRide) selectedRide = all[0].id;
  let range = windowRange(win, { customFrom, customTo, anchor: today });
  let rides;
  if (win === 'ride') { const r = all.find(x => x.id === selectedRide) || all[0]; rides = [r]; range = { from: rideLocalDate(r), to: rideLocalDate(r) }; }
  else rides = ridesInRange(all, range.from, range.to);
  const a = aggregate(rides);
  // previous window of equal length
  let prev = null, prevLabel = '';
  if (win !== 'all' && win !== 'ride') { const len = daysBetween(range.from, range.to) + 1; const pf = addDays(range.from, -len), pt = addDays(range.from, -1); prev = aggregate(ridesInRange(all, pf, pt)); prevLabel = `vs previous ${len} days`; }
  else if (win === 'ride') { const r = rides[0]; const pr = ridesInRange(all, addDays(rideLocalDate(r), -30), addDays(rideLocalDate(r), -1)); if (pr.length) { prev = aggregate(pr); prevLabel = 'vs the 30 days before'; } }
  const ftp = currentFtp(s), weightKg = s.profile.weightKg || rides.at(-1)?.paramsUsed?.weightKg;

  const head = h('div', { class: 'page-head' }, h('h1', null, 'Analyze'), h('p', { class: 'muted' }, `${range.from ? fmtDate(range.from) : 'Start'} – ${fmtDate(range.to)} · ${a.rides} ride${a.rides === 1 ? '' : 's'} on ${a.days} day${a.days === 1 ? '' : 's'}`));
  const controls = h('div', { class: 'controls' }, segmented(WINDOWS.map(w => ({ value: w.key, label: w.label })), win, v => { win = v; navigate('analyze'); }));
  if (win === 'custom') controls.appendChild(h('div', { class: 'row' }, field('From', input({ type: 'date', value: range.from, onChange: e => { customFrom = e.target.value; navigate('analyze'); } })), field('To', input({ type: 'date', value: range.to, onChange: e => { customTo = e.target.value; navigate('analyze'); } }))));
  if (win === 'ride') controls.appendChild(field('Ride', h('select', { class: 'input', onChange: e => { selectedRide = e.target.value; navigate('analyze'); } }, all.map(r => h('option', { value: r.id, selected: r.id === rides[0].id }, `${fmtDate(rideLocalDate(r), { month: 'short', day: 'numeric', year: 'numeric' })} · ${r.name} · ${units.distStr(r.distanceM, 0)}`)))));

  const d = (cur, pv, opts) => prev ? delta(cur, pv, opts) : null;
  const totals = section('Totals', h('div', { class: 'tiles' },
    tile(fmtDuration(a.timerSec, { short: true }), 'Ride time', d(a.timerSec, prev?.timerSec, { fmt: v => fmtDuration(Math.abs(v), { short: true }) })),
    tile(units.distStr(a.distanceM, 0), 'Distance', d(units.dist(a.distanceM).v, prev ? units.dist(prev.distanceM).v : NaN, { fmt: v => v.toFixed(0), suffix: ` ${units.dist(0).u}` })),
    tile(units.elevStr(a.ascentM), 'Climbing', d(a.ascentM, prev?.ascentM, { fmt: v => units.elevStr(v) })),
    tile(fmtNum(a.load), 'Training load', d(a.load, prev?.load)),
    tile(fmtNum(a.kcal), 'kcal', d(a.kcal, prev?.kcal)),
    tile(a.rides, 'Rides', d(a.rides, prev?.rides)),
    tile(units.speedStr(a.avgSpeed), 'Avg speed', d(units.speed(a.avgSpeed).v, prev ? units.speed(prev.avgSpeed).v : NaN, { fmt: v => v.toFixed(1) })),
    tile(fmtNum(a.avgHr), 'Avg HR', d(a.avgHr, prev?.avgHr, { higherIsBetter: false })),
    a.powerRides ? tile(`${fmtNum(a.np)} W`, 'Normalized power', d(a.np, prev?.np)) : null,
    a.powerRides ? tile(a.if?.toFixed(2), 'Avg intensity', d(a.if, prev?.if, { fmt: v => v.toFixed(2) })) : null,
    a.powerRides && Number.isFinite(a.ef) ? tile(a.ef.toFixed(2), 'Efficiency factor', d(a.ef, prev?.ef, { fmt: v => v.toFixed(2) })) : null,
    a.powerRides && Number.isFinite(a.decoupling) ? tile(`${a.decoupling.toFixed(1)}%`, 'Aerobic decoupling', d(a.decoupling, prev?.decoupling, { higherIsBetter: false, fmt: v => v.toFixed(1), suffix: '%' })) : null,
    Number.isFinite(a.avgCad) ? tile(`${fmtNum(a.avgCad)} rpm`, 'Avg cadence', d(a.avgCad, prev?.avgCad)) : null,
    a.powerRides ? tile(`${a.coastingPct.toFixed(0)}%`, 'Coasting', d(a.coastingPct, prev?.coastingPct, { higherIsBetter: false, fmt: v => v.toFixed(0), suffix: '%' })) : null,
    tile(units.distStr(a.longestRideM, 0), 'Longest ride'),
    tile(fmtDuration(a.standingSec, { short: true }), 'Standing'),
  ), { sub: prevLabel });

  // zones
  const zonePanel = section('Where the time went', h('div', { class: 'grid-2' },
    a.tizPower && a.powerZones ? h('div', null, h('h3', null, 'Power zones'), zoneBars(a.powerZones, a.tizPower, { fmtTime: v => fmtDuration(v, { short: true }) }), prev?.tizPower ? h('p', { class: 'small muted' }, 'Previous window: ' + prev.powerZones.map((z, i) => `${z.name.split(' ')[0]} ${(prev.tizPower[i] / Math.max(1, prev.tizPower.reduce((x, y) => x + y, 0)) * 100).toFixed(0)}%`).join(' · ')) : null) : null,
    a.tizHr && a.hrZones ? h('div', null, h('h3', null, 'Heart-rate zones'), zoneBars(a.hrZones, a.tizHr, { fmtTime: v => fmtDuration(v, { short: true }), unit: 'bpm' }), prev?.tizHr ? h('p', { class: 'small muted' }, 'Previous window: ' + prev.hrZones.map((z, i) => `${z.name.split(' ')[0]} ${(prev.tizHr[i] / Math.max(1, prev.tizHr.reduce((x, y) => x + y, 0)) * 100).toFixed(0)}%`).join(' · ')) : null) : null,
  ));
  // 3-zone + polarization
  let threePanel = null;
  if (a.tiz3) {
    const tot = Math.max(1, a.tiz3.reduce((x, y) => x + y, 0));
    const pcts = a.tiz3.map(v => v / tot * 100);
    threePanel = section('Intensity distribution', h('div', null,
      h('div', { class: 'three-zone' }, [['Easy', '#1A63C9'], ['Moderate', '#D4A106'], ['Hard', '#D33A2F']].map(([l, c], i) => h('div', { class: 'tz', style: { flex: Math.max(2, pcts[i]), background: c } }, h('b', null, `${pcts[i].toFixed(0)}%`), h('span', null, l)))),
      h('p', null, h('strong', null, a.distributionClass), Number.isFinite(a.polarizationIndex) ? ` · polarisation index ${a.polarizationIndex.toFixed(2)} (≥ 2.0 = polarised)` : '', prev?.tiz3 ? h('span', { class: 'muted' }, ` · previous: ${prev.tiz3.map(v => (v / Math.max(1, prev.tiz3.reduce((x, y) => x + y, 0)) * 100).toFixed(0)).join(' / ')} % (${prev.distributionClass})`) : ''),
      h('p', { class: 'small muted' }, 'Easy = below ~75% FTP (or 83% LTHR on HR-only rides), hard = above 105% FTP. Aim for ~80% easy in base phases; keep moderate time deliberate.'),
    ));
  }
  // MMP overlay
  let mmpPanel = null;
  if (a.mmp) {
    const curves = [{ label: WINDOWS.find(w => w.key === win)?.label || 'Window', values: a.mmp, color: '#E8731A', fill: true }];
    if (prev?.mmp) curves.push({ label: 'Previous window', values: prev.mmp, color: '#1A63C9', dash: true });
    if (win !== 'all') { const allAgg = aggregate(all); curves.push({ label: 'All time', values: allAgg.mmp, color: '#7589A8', dash: true }); }
    mmpPanel = section('Power curve', h('div', null, h('div', { class: 'mmp-chart' }), table(['', '5 s', '1 min', '5 min', '20 min', '60 min'], [['Window', ...[5, 60, 300, 1200, 3600].map(dd => fmtW(a.mmp[MMP_DURATIONS.indexOf(dd)]))], ...(prev?.mmp ? [['Previous', ...[5, 60, 300, 1200, 3600].map(dd => fmtW(prev.mmp[MMP_DURATIONS.indexOf(dd)]))]] : []), weightKg ? ['W/kg', ...[5, 60, 300, 1200, 3600].map(dd => { const v = a.mmp[MMP_DURATIONS.indexOf(dd)]; return Number.isFinite(v) ? (v / weightKg).toFixed(2) : '–'; })] : null].filter(Boolean))), { sub: 'Best mean-maximal power at every duration' });
    setTimeout(() => mmpChart(mmpPanel.querySelector('.mmp-chart'), MMP_DURATIONS, curves), 0);
  }
  // power profile & eFTP
  let profPanel = null;
  const prof = powerProfile(a.mmp, ftp, weightKg), eftp = estimateFtp(a.mmp);
  if (prof) {
    profPanel = section('Power profile', h('div', null,
      table(['Duration', 'Best', 'W/kg', 'Category'], prof.cols.map(c => [c.label, fmtW(c.w), Number.isFinite(c.wkg) ? c.wkg.toFixed(2) : '–', c.cat || '–'])),
      h('p', null, h('strong', null, prof.band), prof.weakest ? ` · weakest duration: ${prof.weakest.label} (${prof.weakest.cat}); strongest: ${prof.strongest.label} (${prof.strongest.cat}).` : ''),
      eftp?.eftp ? h('p', null, `Estimated FTP from this window: `, h('strong', null, `${eftp.eftp} W`), ` (${eftp.method})${eftp.cp ? ` · CP ${eftp.cp} W, W′ ${(eftp.wprime / 1000).toFixed(1)} kJ` : ''}${ftp ? ` · set FTP ${ftp} W` : ''}`) : null,
      h('details', null, h('summary', null, 'Coggan power-profile table (men, W/kg lower bounds)'), table(['Category', '5 s', '1 min', '5 min', 'FTP'], COGGAN_PROFILE.map(c => [c.cat, ...c.min.map(v => v.toFixed(1))]))),
    ), { sub: 'Categories from Allen & Coggan; recreational band from Zwift pace groups' });
  }
  // trends
  const trendPanel = section('Trends', h('div', { class: 'grid-2' }, h('div', null, h('h3', null, 'Efficiency factor (NP ÷ HR)'), h('div', { class: 'tr-ef' })), h('div', null, h('h3', null, 'Aerobic decoupling on rides ≥ 1 h'), h('div', { class: 'tr-dec' })), h('div', null, h('h3', null, 'Average cadence'), h('div', { class: 'tr-cad' })), h('div', null, h('h3', null, 'Left / right balance'), h('div', { class: 'tr-bal' }))), { sub: 'Every ride in the window, oldest to newest' });
  setTimeout(() => {
    const draw = (sel, key, color, opts = {}, extra = {}) => { const tr = trend(rides, key, extra); const box = trendPanel.querySelector(sel); if (tr.length < 2) { box.appendChild(h('p', { class: 'muted small' }, 'Need at least two rides with this metric.')); return; } lineChart(box, tr.map(x => fmtDate(x.date)), [{ label: key, data: tr.map(x => +x.value.toFixed(2)), borderColor: color, backgroundColor: color, pointRadius: 3 }], { height: 170, legend: false, ...opts }); };
    draw('.tr-ef', 'ef', '#E8731A', {}, { powerOnly: true }); draw('.tr-dec', 'decoupling', '#D33A2F', { yTitle: '%' }, { minTimerSec: 3600, powerOnly: true }); draw('.tr-cad', 'avgCad', '#B3449A', { yTitle: 'rpm' }); draw('.tr-bal', 'balanceLeft', '#7B3FBF', { yTitle: '% left', yMin: 40, yMax: 60 }, { powerOnly: true });
  }, 0);
  // weekly volume
  const weeks = weeklyBuckets(all, 12, today);
  const weekPanel = section('Weekly volume (last 12 weeks)', h('div', { class: 'grid-3' }, h('div', null, h('h3', null, 'Hours'), h('div', { class: 'wk-hours' })), h('div', null, h('h3', null, 'Training load'), h('div', { class: 'wk-load' })), h('div', null, h('h3', null, 'Easy / moderate / hard'), h('div', { class: 'wk-tiz' }))));
  setTimeout(() => {
    const labels = weeks.map(w => fmtDate(w.from));
    barsChart(weekPanel.querySelector('.wk-hours'), labels, [{ label: 'Hours', data: weeks.map(w => +(w.timerSec / 3600).toFixed(1)), backgroundColor: '#1A63C9' }], { height: 190, legend: false, yTitle: 'hours' });
    barsChart(weekPanel.querySelector('.wk-load'), labels, [{ label: 'Load', data: weeks.map(w => Math.round(w.load)), backgroundColor: '#E8731A' }], { height: 190, legend: false, yTitle: 'TSS' });
    barsChart(weekPanel.querySelector('.wk-tiz'), labels, [['Easy', '#1A63C9'], ['Moderate', '#D4A106'], ['Hard', '#D33A2F']].map(([l, c], i) => ({ label: l, data: weeks.map(w => +((w.tiz3?.[i] || 0) / 3600).toFixed(2)), backgroundColor: c })), { height: 190, stacked: true, yTitle: 'hours' });
  }, 0);
  // cadence histogram & climbing
  let cadPanel = null;
  if (a.cadHist) { cadPanel = section('Cadence distribution', h('div', { class: 'cad-chart' })); setTimeout(() => barsChart(cadPanel.querySelector('.cad-chart'), CADENCE_BUCKETS.map(b => b.key + ' rpm'), [{ label: 'Time', data: a.cadHist.map(v => +(v / 3600).toFixed(2)), backgroundColor: CADENCE_BUCKETS.map(b => b.color) }], { height: 180, legend: false, yTitle: 'hours' }), 0); }
  const blocks = multiDayBlocks(rides);
  const climbPanel = section('Climbing & endurance', h('div', { class: 'tiles compact' }, tile(a.climbCount, 'Climbs detected'), tile(units.elevStr(a.climbGainM), 'Gain on climbs'), tile(fmtDuration(a.climbSec, { short: true }), 'Time climbing'), tile(units.distStr(blocks.best2DayM, 0), 'Best 2-day block'), tile(units.distStr(blocks.best3DayM, 0), 'Best 3-day block'), tile(fmtDuration(a.longestRideSec, { short: true }), 'Longest ride')));
  // PMC for window
  const pmcPanel = section('Fitness, fatigue, form', h('div', { class: 'pmc-chart' }));
  setTimeout(() => { const from = range.from || state.pmc[0]?.date; const series = state.pmc.filter(p => p.date >= addDays(from, -1) && p.date <= addDays(range.to, win === 'ride' ? 7 : 14)); if (series.length) pmcChart(pmcPanel.querySelector('.pmc-chart'), series, { height: 220 }); }, 0);
  // ride table
  const ridesPanel = section('Rides in this window', table(['Date', 'Ride', 'Time', 'Dist', 'Climb', 'NP / HR', 'IF', 'Load', 'EF', 'Cad'], rides.slice().reverse().map(r => [h('a', { href: `#/ride/${r.id}` }, fmtDate(rideLocalDate(r))), r.name, fmtDuration(r.timerSec, { short: true }), units.distStr(r.distanceM, 0), units.elevStr(r.ascentM), r.hasPower && r.powerValid !== false ? `${Math.round(r.np)} W` : `${fmtNum(r.avgHr)} bpm`, r.hasPower && r.powerValid !== false ? r.if.toFixed(2) : '–', fmtNum(r.load), Number.isFinite(r.ef) ? r.ef.toFixed(2) : '–', fmtNum(r.avgCad)])));

  root.append(head, controls, totals, zonePanel, threePanel, mmpPanel, profPanel, trendPanel, weekPanel, cadPanel, climbPanel, pmcPanel, ridesPanel);
});
const fmtW = v => Number.isFinite(v) ? `${Math.round(v)} W` : '–';
export { ZONE_COLORS, pill, button };
