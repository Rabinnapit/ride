// RiderHQ — chart wrappers: uPlot for ride streams, Chart.js for everything else, Leaflet for the route.
import { h } from './dom.js';
import { withInfo } from './glossary.js';
import { fmtDuration } from '../settings.js';

export const SERIES = {
  power: { label: 'Power', color: '#E8731A', unit: 'W', term: 'avgpower' },
  hr: { label: 'Heart rate', color: '#D33A2F', unit: 'bpm' },
  cad: { label: 'Cadence', color: '#B3449A', unit: 'rpm', term: 'cadence' },
  speed: { label: 'Speed', color: '#1A63C9', unit: 'km/h' },
  alt: { label: 'Elevation', color: '#8A98A8', unit: 'm' },
  temp: { label: 'Temperature', color: '#2E9E4F', unit: '°' },
};
export const ZONE_COLORS = ['#7589A8', '#1A63C9', '#2E9E4F', '#D4A106', '#E8731A', '#D33A2F', '#7B3FBF'];
export const PMC_COLORS = { ctl: '#1A63C9', atl: '#B3449A', tsb: '#E8731A', tss: '#8A98A8' };

export function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function themeDefaults() {
  const ink = cssVar('--ink') || '#1b2733', muted = cssVar('--muted') || '#5b6b7b', grid = cssVar('--line') || '#e3e8ed';
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return { ink, muted, grid, dark, font: '"Barlow", system-ui, sans-serif', tipBg: dark ? '#2A3B4C' : '#1B2733', tipInk: '#F3F6F9', tipBorder: dark ? '#4A6074' : '#1B2733' };
}
/** Apply the current theme to Chart.js defaults. Called on load and whenever the theme changes. */
export function chartTheme() {
  if (!window.Chart) return;
  const t = themeDefaults();
  Chart.defaults.font.family = t.font; Chart.defaults.font.size = 12; Chart.defaults.color = t.muted;
  Chart.defaults.borderColor = t.grid;
  Chart.defaults.plugins.legend.labels.boxWidth = 10; Chart.defaults.plugins.legend.labels.boxHeight = 10; Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Object.assign(Chart.defaults.plugins.tooltip, { backgroundColor: t.tipBg, titleColor: t.tipInk, bodyColor: t.tipInk, footerColor: t.tipInk, borderColor: t.tipBorder, borderWidth: 1, padding: 8, titleFont: { family: t.font, weight: '600' }, bodyFont: { family: t.font } });
  Chart.defaults.elements.line.borderWidth = 2; Chart.defaults.elements.point.radius = 0; Chart.defaults.elements.point.hitRadius = 8; Chart.defaults.elements.point.hoverRadius = 4;
  Chart.defaults.elements.bar.borderRadius = 3;
  Chart.defaults.animation = false;
  Chart.defaults.maintainAspectRatio = false;
}
const xTicks = (extra = {}) => ({ maxRotation: 0, autoSkip: true, autoSkipPadding: 10, maxTicksLimit: 7, ...extra });

const registry = new Set();
export function destroyCharts() { for (const c of registry) { try { c.destroy(); } catch { /* ignore */ } } registry.clear(); }

export function chart(container, config, { height = 220 } = {}) {
  const wrap = h('div', { class: 'chart', style: { height: `${height}px` } });
  const canvas = h('canvas');
  wrap.appendChild(canvas); container.appendChild(wrap);
  const c = new Chart(canvas, config);
  registry.add(c);
  return c;
}

const meanOf = arr => { let s = 0, c = 0; for (const v of arr) if (Number.isFinite(v)) { s += v; c++; } return c ? s / c : NaN; };
/** A dashed horizontal "average" dataset for Chart.js line/bar charts. */
export function avgDataset(values, { label = 'Average', color = null, decimals = 1 } = {}) {
  const m = meanOf(values);
  if (!Number.isFinite(m)) return null;
  const t = themeDefaults();
  return { type: 'line', label: `${label} ${m.toFixed(decimals)}`, data: values.map(() => +m.toFixed(decimals)), borderColor: color || t.muted, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, pointHitRadius: 0, fill: false, order: 0, tension: 0 };
}

/** Downsample to at most n points by picking the max value in each bucket (keeps peaks). */
export function downsample(xs, ys, n = 1500) {
  if (xs.length <= n) return [Array.from(xs), Array.from(ys)];
  const bucket = xs.length / n, ox = [], oy = [];
  for (let b = 0; b < n; b++) {
    const i0 = Math.floor(b * bucket), i1 = Math.min(xs.length, Math.floor((b + 1) * bucket));
    let best = -Infinity, bi = i0, anyNum = false;
    for (let i = i0; i < i1; i++) { const v = ys[i]; if (Number.isFinite(v)) { anyNum = true; if (v > best) { best = v; bi = i; } } }
    ox.push(xs[bi]); oy.push(anyNum ? ys[bi] : null);
  }
  return [ox, oy];
}

/**
 * Ride streams — one plot per channel, synced cursor, each with a header showing average / max (like the Magene app)
 * and a dashed average line. stats: { power: {avg, max, note}, hr: {...}, ... } in display units.
 */
export function streamsChart(container, streams, keys, { xMode = 'time', tempConv = null, speedConv = null, altConv = null, stats = {}, units = {} } = {}) {
  const t = themeDefaults();
  const xs = xMode === 'dist' && streams.dist ? Array.from(streams.dist, v => v / 1000) : Array.from(streams.t);
  const plots = [];
  const syncKey = uPlot.sync('ride');
  const smoothed = (arr, w) => { const out = new Array(arr.length); let s = 0, c = 0; const q = []; for (let i = 0; i < arr.length; i++) { const v = Number.isFinite(arr[i]) ? arr[i] : null; q.push(v); if (v != null) { s += v; c++; } if (q.length > w) { const o = q.shift(); if (o != null) { s -= o; c--; } } out[i] = c ? s / c : null; } return out; };
  const fmtX = v => v == null ? '' : xMode === 'dist' ? `${v.toFixed(1)} km` : fmtDuration(v);
  for (const key of keys) {
    const raw = streams[key]; if (!raw) continue;
    const meta = SERIES[key];
    const unit = units[key] || meta.unit;
    let ys = Array.from(raw);
    if (key === 'power') ys = smoothed(ys, 5);
    if (key === 'speed') ys = ys.map(v => Number.isFinite(v) ? (speedConv ? speedConv(v) : v * 3.6) : null);
    if (key === 'temp' && tempConv) ys = ys.map(v => Number.isFinite(v) ? tempConv(v) : null);
    if (key === 'alt' && altConv) ys = ys.map(v => Number.isFinite(v) ? altConv(v) : null);
    const [dx, dy] = downsample(xs, ys, 1800);
    const st = stats[key] || {};
    const live = h('span', { class: 'ch-live' });
    const statEls = [];
    if (Number.isFinite(st.avg)) statEls.push(h('span', { class: 'ch-stat' }, 'Avg ', h('b', null, `${st.avg.toFixed(st.dec ?? 0)} ${unit}`), st.note ? ` (${st.note})` : ''));
    if (Number.isFinite(st.max)) statEls.push(h('span', { class: 'ch-stat' }, 'Max ', h('b', null, `${st.max.toFixed(st.dec ?? 0)} ${unit}`)));
    if (Number.isFinite(st.min)) statEls.push(h('span', { class: 'ch-stat' }, 'Min ', h('b', null, `${st.min.toFixed(st.dec ?? 0)} ${unit}`)));
    if (st.extra) statEls.push(h('span', { class: 'ch-stat' }, st.extra));
    const head = h('div', { class: 'chart-head' }, h('span', { class: 'ch-name' }, h('span', { class: 'ch-swatch', style: { background: meta.color } }), ...withInfo(meta.label, meta.term || null)), ...statEls, live);
    const el = h('div', { class: 'uplot-wrap' });
    container.append(head, el);
    const isArea = key === 'alt';
    const series = [
      {},
      { label: meta.label, stroke: meta.color, width: 1.5, fill: isArea ? meta.color + '55' : (key === 'power' ? meta.color + '22' : undefined) },
    ];
    const data = [dx, dy];
    if (Number.isFinite(st.avg) && !isArea) { series.push({ label: 'Average', stroke: t.ink, width: 1.2, dash: [6, 4], points: { show: false } }); data.push(dx.map(() => st.avg)); }
    const opts = {
      width: el.clientWidth || 600, height: key === 'power' || key === 'hr' ? 150 : 110,
      cursor: { sync: { key: syncKey.key, setSeries: false }, drag: { x: true, y: false }, points: { size: 6 } },
      scales: { x: { time: false }, ...(isArea ? { y: { range: (u, mn, mx) => [mn - 2, mx + 2] } } : {}) },
      legend: { show: false },
      axes: [
        { stroke: t.muted, grid: { stroke: t.grid, width: 1 }, ticks: { stroke: t.grid }, font: `11px ${t.font}`, values: (u, vals) => vals.map(v => xMode === 'dist' ? `${v.toFixed(0)} km` : fmtDuration(v, { short: true })) },
        { stroke: t.muted, grid: { stroke: t.grid, width: 1 }, ticks: { stroke: t.grid }, font: `11px ${t.font}`, size: 46 },
      ],
      series: isArea ? series.map((s, i) => i === 1 ? { ...s, fillTo: (u) => u.scales.y.min } : s) : series,
      hooks: { setCursor: [u => { const i = u.cursor.idx; if (i == null || dy[i] == null) { live.textContent = ''; return; } live.textContent = `${fmtX(dx[i])} · ${Math.round(dy[i])} ${unit}`; }] },
    };
    const u = new uPlot(opts, data, el);
    plots.push({ u, el });
  }
  const ro = new ResizeObserver(() => { for (const p of plots) p.u.setSize({ width: p.el.clientWidth, height: p.u.height }); });
  ro.observe(container);
  return { destroy: () => { ro.disconnect(); plots.forEach(p => p.u.destroy()); } };
}

/** Leaflet route map colored by a stream (optional). */
export function routeMap(container, streams, { colorBy = null, zones = null } = {}) {
  if (!window.L || !streams.lat) return null;
  const el = h('div', { class: 'map' });
  container.appendChild(el);
  const map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  const pts = [];
  const step = Math.max(1, Math.floor(streams.lat.length / 2500));
  for (let i = 0; i < streams.lat.length; i += step) if (Number.isFinite(streams.lat[i]) && Number.isFinite(streams.lon[i])) pts.push([streams.lat[i], streams.lon[i], i]);
  if (!pts.length) return null;
  if (colorBy && streams[colorBy] && zones) {
    for (let k = 1; k < pts.length; k++) {
      const i = pts[k][2]; const v = streams[colorBy][i];
      let zi = 0; for (let z = 0; z < zones.length; z++) if (Number.isFinite(v) && v <= zones[z].hi) { zi = z; break; }
      L.polyline([[pts[k - 1][0], pts[k - 1][1]], [pts[k][0], pts[k][1]]], { color: zones[zi].color, weight: 4, opacity: 0.9 }).addTo(map);
    }
  } else L.polyline(pts.map(p => [p[0], p[1]]), { color: '#1A63C9', weight: 4, opacity: 0.9 }).addTo(map);
  L.circleMarker([pts[0][0], pts[0][1]], { radius: 6, color: '#fff', fillColor: '#2E9E4F', fillOpacity: 1, weight: 2 }).addTo(map).bindTooltip('Start');
  L.circleMarker([pts.at(-1)[0], pts.at(-1)[1]], { radius: 6, color: '#fff', fillColor: '#D33A2F', fillOpacity: 1, weight: 2 }).addTo(map).bindTooltip('Finish');
  map.fitBounds(L.latLngBounds(pts.map(p => [p[0], p[1]])), { padding: [16, 16] });
  setTimeout(() => map.invalidateSize(), 50);
  return map;
}

/** Performance management chart: daily load bars + CTL/ATL lines + TSB dashed, with planned future. */
export function pmcChart(container, series, { height = 260 } = {}) {
  const labels = series.map(p => p.date);
  const t = themeDefaults();
  return chart(container, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { type: 'line', label: 'Fitness (CTL)', data: series.map(p => +p.ctl.toFixed(1)), borderColor: PMC_COLORS.ctl, backgroundColor: PMC_COLORS.ctl, yAxisID: 'y', order: 1, segment: { borderDash: ctx => series[ctx.p1DataIndex]?.future ? [4, 4] : undefined } },
        { type: 'line', label: 'Fatigue (ATL)', data: series.map(p => +p.atl.toFixed(1)), borderColor: PMC_COLORS.atl, backgroundColor: PMC_COLORS.atl, yAxisID: 'y', order: 2, segment: { borderDash: ctx => series[ctx.p1DataIndex]?.future ? [4, 4] : undefined } },
        { type: 'line', label: 'Form (TSB)', data: series.map(p => +p.tsb.toFixed(1)), borderColor: PMC_COLORS.tsb, backgroundColor: PMC_COLORS.tsb, borderDash: [6, 4], yAxisID: 'y', order: 3 },
        { label: 'Daily load', data: series.map(p => +(p.future ? p.planned : p.tss).toFixed(0)), backgroundColor: series.map(p => p.future ? PMC_COLORS.tss + '66' : PMC_COLORS.tss + 'bb'), yAxisID: 'y', order: 4, barPercentage: 0.9, categoryPercentage: 1 },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: { x: { ticks: xTicks({ callback: (v, i) => labels[i]?.slice(5) }), grid: { display: false } }, y: { title: { display: true, text: 'Load per day · CTL · ATL · TSB', color: t.muted }, grid: { color: t.grid } } },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { title: items => labels[items[0].dataIndex] + (series[items[0].dataIndex].future ? ' (planned)' : '') } } },
    },
  }, { height });
}

/** Bar chart. avg: true adds a dashed average line of the first dataset. */
export function barsChart(container, labels, datasets, { height = 220, stacked = false, yTitle = null, horizontal = false, legend = true, fmtY = null, avg = false, avgDecimals = 1 } = {}) {
  const t = themeDefaults();
  const ds = datasets.map(d => ({ borderRadius: 3, order: 1, ...d }));
  if (avg && !stacked) { const a = avgDataset(datasets[0].data, { decimals: avgDecimals }); if (a) ds.push(a); }
  return chart(container, {
    type: 'bar',
    data: { labels, datasets: ds },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      interaction: { mode: 'index', intersect: false },
      scales: { x: { stacked, grid: { display: false }, ticks: xTicks({ maxTicksLimit: 12 }) }, y: { stacked, beginAtZero: true, grid: { color: t.grid }, title: yTitle ? { display: true, text: yTitle, color: t.muted } : undefined, ticks: fmtY ? { callback: fmtY } : undefined } },
      plugins: { legend: { display: legend && ds.length > 1, position: 'bottom' } },
    },
  }, { height });
}

/** Line chart. avg: true adds a dashed average line of the first dataset (shown in the legend with its value). */
export function lineChart(container, labels, datasets, { height = 220, yTitle = null, fmtY = null, yMin = undefined, yMax = undefined, legend = true, xLog = false, xTitle = null, avg = false, avgDecimals = 1, avgLabel = 'Average' } = {}) {
  const t = themeDefaults();
  const ds = datasets.map(d => ({ tension: 0.25, spanGaps: true, order: 1, ...d }));
  if (avg) { const a = avgDataset(datasets[0].data, { decimals: avgDecimals, label: avgLabel, color: datasets.length > 1 ? datasets[0].borderColor : null }); if (a) ds.push(a); }
  return chart(container, {
    type: 'line',
    data: { labels, datasets: ds },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: { x: { type: xLog ? 'logarithmic' : 'category', grid: { display: false }, ticks: xTicks(), title: xTitle ? { display: true, text: xTitle, color: t.muted } : undefined }, y: { min: yMin, max: yMax, grid: { color: t.grid }, title: yTitle ? { display: true, text: yTitle, color: t.muted } : undefined, ticks: fmtY ? { callback: fmtY } : undefined } },
      plugins: { legend: { display: legend && ds.length > 1, position: 'bottom' } },
    },
  }, { height });
}

/** Mean-maximal power curve; overlays windows. */
export function mmpChart(container, durations, curves, { height = 260, unit = 'W', fmtVal = v => `${Math.round(v)} W` } = {}) {
  const labels = durations.map(d => d < 60 ? `${d}s` : d < 3600 ? `${Math.round(d / 60)}m` : `${(d / 3600).toFixed(d % 3600 ? 1 : 0)}h`);
  const t = themeDefaults();
  return chart(container, {
    type: 'line',
    data: { labels, datasets: curves.map(c => ({ label: c.label, data: c.values.map(v => Number.isFinite(v) ? +v.toFixed(1) : null), borderColor: c.color, backgroundColor: c.color + '22', fill: c.fill ? 'origin' : false, borderDash: c.dash ? [5, 4] : undefined, spanGaps: true, tension: 0.3, pointRadius: 0 })) },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: { x: { grid: { display: false }, ticks: xTicks({ maxTicksLimit: 10 }) }, y: { beginAtZero: true, grid: { color: t.grid }, title: { display: true, text: unit, color: t.muted } } },
      plugins: { legend: { display: curves.length > 1, position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw == null ? '–' : fmtVal(ctx.raw)}` } } },
    },
  }, { height });
}

/** Power-phase donut (crank angle) drawn as SVG. */
export function powerPhaseDonut(phase, { label = 'Left', color = '#2E9E4F' } = {}) {
  const r = 44, cx = 56, cy = 56;
  const arc = (a0, a1, rad, w, op) => {
    const toXY = (a, rr) => [cx + rr * Math.sin(a * Math.PI / 180), cy - rr * Math.cos(a * Math.PI / 180)];
    let span = ((a1 - a0) % 360 + 360) % 360; if (span === 0) span = 360;
    const large = span > 180 ? 1 : 0;
    const [x0, y0] = toXY(a0, rad), [x1, y1] = toXY(a0 + span, rad);
    return `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${rad} ${rad} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${w}" opacity="${op}"/>`;
  };
  const ok = Number.isFinite(phase?.start) && Number.isFinite(phase?.end);
  const svg = `<svg viewBox="0 0 112 112" width="112" height="112" role="img" aria-label="${label} power phase">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line)" stroke-width="10"/>
    ${ok ? arc(phase.start, phase.end, r, 10, 0.45) : ''}
    ${ok && Number.isFinite(phase.peakStart) ? arc(phase.peakStart, phase.peakEnd, r, 10, 1) : ''}
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="12" fill="var(--muted)">TDC</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">${label}</text>
  </svg>`;
  const wrap = h('div', { class: 'phase', html: svg });
  if (ok) wrap.appendChild(h('div', { class: 'phase-vals' }, `${Math.round(phase.start)}° → ${Math.round(phase.end)}°`, h('br'), h('small', null, `peak ${Math.round(phase.peakStart)}° → ${Math.round(phase.peakEnd)}°`)));
  return wrap;
}
