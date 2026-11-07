// RiderHQ — ride list with filters and calendar strip.
import { state, registerView, navigate } from '../app.js';
import { h, section, empty, button, segmented, tile } from '../ui/dom.js';
import { rideCard } from './home.js';
import { units, fmtDuration, fmtNum, todayIso, addDays, rideLocalDate, fmtDate } from '../settings.js';
import { aggregate, ridesInRange } from '../metrics/aggregate.js';

let filter = 'all', range = '90d';

registerView('rides', (root) => {
  const today = todayIso();
  let rides = state.rides;
  const rangeDays = { '30d': 30, '90d': 90, '365d': 365, all: null }[range];
  if (rangeDays) rides = ridesInRange(rides, addDays(today, -(rangeDays - 1)), today).reverse();
  if (filter === 'power') rides = rides.filter(r => r.hasPower && r.powerValid !== false);
  if (filter === 'long') rides = rides.filter(r => r.timerSec >= 7200);
  if (filter === 'indoor') rides = rides.filter(r => r.indoor);
  if (filter === 'outdoor') rides = rides.filter(r => !r.indoor);
  const a = aggregate(rides.filter(r => !r.excluded));

  const head = h('div', { class: 'page-head' }, h('h1', null, 'Rides'), h('div', { class: 'page-actions' }, button('Import ride', () => document.querySelector('input[data-fit]').click(), { primary: true, iconName: 'upload' })));
  const controls = h('div', { class: 'controls' },
    segmented([{ value: '30d', label: '30 d' }, { value: '90d', label: '90 d' }, { value: '365d', label: 'Year' }, { value: 'all', label: 'All' }], range, v => { range = v; navigate('rides'); }),
    segmented([{ value: 'all', label: 'All' }, { value: 'power', label: 'With power' }, { value: 'long', label: '2 h+' }, { value: 'outdoor', label: 'Outdoor' }, { value: 'indoor', label: 'Indoor' }], filter, v => { filter = v; navigate('rides'); }),
  );
  const totals = h('div', { class: 'tiles compact' },
    tile(a.rides, 'Rides'), tile(fmtDuration(a.timerSec, { short: true }), 'Time'), tile(units.distStr(a.distanceM, 0), 'Distance'), tile(units.elevStr(a.ascentM), 'Climbing'), tile(fmtNum(a.load), 'Load'), tile(fmtNum(a.kcal), 'kcal'),
  );
  // group by month
  const groups = new Map();
  for (const r of rides) { const k = rideLocalDate(r).slice(0, 7); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const list = rides.length ? h('div', { class: 'ride-groups' }, [...groups.entries()].map(([k, rs]) => h('div', { class: 'ride-group' }, h('h2', { class: 'group-title' }, new Date(k + '-15T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), h('span', { class: 'muted' }, ` · ${rs.length} ride${rs.length > 1 ? 's' : ''} · ${units.distStr(rs.reduce((x, r) => x + r.distanceM, 0), 0)}`)), rs.map(rideCard)))) : empty('No rides in this range. Drop .fit files here or tap Import ride.');
  root.append(head, controls, totals, list);
});
