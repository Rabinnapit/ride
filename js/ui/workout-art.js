// RiderHQ — pictures for bike workouts: an intensity profile (height = effort, color = zone, FTP as a line)
// and a "how it feels" scale. Built as inline SVG so it works offline and in both themes.
import { h } from './dom.js';

const ZONES = [ // upper bound as fraction of FTP, color, short name, feel
  { to: 0.55, color: '#7589A8', name: 'Recovery', feel: 'Very easy. You could sing.' },
  { to: 0.75, color: '#1A63C9', name: 'Endurance', feel: 'Easy. Full sentences, nose breathing.' },
  { to: 0.90, color: '#2E9E4F', name: 'Tempo', feel: 'Working. Short sentences only.' },
  { to: 1.05, color: '#D4A106', name: 'Threshold', feel: 'Hard. A few words at a time.' },
  { to: 1.20, color: '#E8731A', name: 'VO2max', feel: 'Very hard. Breathing is the limit.' },
  { to: 1.50, color: '#D33A2F', name: 'Anaerobic', feel: 'Burning legs, under 3 min.' },
  { to: 9, color: '#7B3FBF', name: 'Sprint', feel: 'All-out, seconds.' },
];
export const zoneFor = f => ZONES.find(z => f < z.to) || ZONES[ZONES.length - 1];
const svg = (tag, attrs = {}, ...kids) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v); for (const k of kids) if (k) el.append(k); return el; };
const mmss = s => s >= 3600 ? `${(s / 3600).toFixed(s % 3600 ? 1 : 0)} h` : `${Math.round(s / 60)} min`;

/** Group identical back-to-back on/off pairs so "3 × 12 min" gets one label instead of three. */
function groups(segments) {
  const out = []; let i = 0;
  while (i < segments.length) {
    const s = segments[i]; let n = 1;
    const same = (a, b) => a.dur === b.dur && a.lo === b.lo && a.hi === b.hi;
    if (i + 1 < segments.length) while (i + 2 * n + 1 < segments.length && same(segments[i + 2 * n], s) && same(segments[i + 2 * n + 1], segments[i + 1])) n++;
    if (n > 1) { out.push({ start: i, count: 2 * n, reps: n, on: s, off: segments[i + 1] }); i += 2 * n; } else { out.push({ start: i, count: 1, reps: 1, on: s }); i++; }
  }
  return out;
}

/**
 * The profile picture. segments: [{dur, lo, hi, cad?, text?}] (fractions of FTP).
 * compact: no labels (for cards). Returns an element.
 */
export function workoutProfile(segments, { ftp = null, compact = false, height = compact ? 56 : 150 } = {}) {
  const total = segments.reduce((a, s) => a + s.dur, 0) || 1;
  const W = 600, H = height, padB = compact ? 0 : 20, padT = compact ? 2 : 20;
  const maxF = Math.max(1.25, ...segments.map(s => Math.max(s.lo, s.hi))) + 0.05;
  const y = f => padT + (H - padT - padB) * (1 - f / maxF);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: `wo-art ${compact ? 'compact' : ''}`, role: 'img', 'aria-label': 'Workout profile: height is effort, color is the training zone' });
  // zone bands (faint) and the FTP line
  if (!compact) {
    root.append(svg('line', { x1: 0, x2: W, y1: y(1), y2: y(1), class: 'wo-ftp' }));
    root.append(svg('text', { x: W - 4, y: y(1) - 4, class: 'wo-ftp-t', 'text-anchor': 'end' }, document.createTextNode(ftp ? `FTP ${ftp} W` : 'FTP')));
  }
  let x = 0;
  for (const s of segments) {
    const w = s.dur / total * W;
    const z = zoneFor((s.lo + s.hi) / 2);
    if (s.lo === s.hi) root.append(svg('rect', { x: x.toFixed(1), y: y(s.lo).toFixed(1), width: Math.max(0.5, w - 0.8).toFixed(1), height: (y(0) - y(s.lo)).toFixed(1), fill: z.color, rx: compact ? 1 : 2 }));
    else root.append(svg('polygon', { points: `${x.toFixed(1)},${y(0)} ${x.toFixed(1)},${y(s.lo).toFixed(1)} ${(x + w - 0.8).toFixed(1)},${y(s.hi).toFixed(1)} ${(x + w - 0.8).toFixed(1)},${y(0)}`, fill: z.color }));
    x += w;
  }
  if (!compact) {
    // labels on the main blocks
    x = 0;
    for (const g of groups(segments)) {
      const dur = g.count === 1 ? g.on.dur : g.reps * (g.on.dur + g.off.dur);
      const w = dur / total * W;
      const f = (g.on.lo + g.on.hi) / 2;
      if (w > 80 && f >= 0.5) {
        const watts = ftp ? `${Math.round(f * ftp)} W` : `${Math.round(f * 100)}%`;
        const label = g.reps > 1 ? `${g.reps} × ${mmss(g.on.dur)} @ ${watts}` : `${mmss(g.on.dur)} @ ${watts}`;
        const ty = Math.max(padT + 14, y(Math.max(g.on.lo, g.on.hi)) - 6);
        root.append(svg('text', { x: (x + w / 2).toFixed(1), y: ty.toFixed(1), class: 'wo-lab', 'text-anchor': 'middle' }, document.createTextNode(label)));
      }
      x += w;
    }
    // time ticks
    const step = total > 5400 ? 1800 : total > 2400 ? 900 : 600;
    for (let t = 0; t <= total; t += step) root.append(svg('text', { x: (t / total * W).toFixed(1), y: H - 4, class: 'wo-tick', 'text-anchor': t === 0 ? 'start' : t + step > total ? 'end' : 'middle' }, document.createTextNode(t ? mmss(t) : '0')));
  }
  return root;
}

/** "How it feels" scale: the seven zones as a strip, the workout's hardest sustained zone marked. */
export function feelScale(segments) {
  const main = segments.filter(s => s.dur >= 120).reduce((a, s) => Math.max(a, (s.lo + s.hi) / 2), 0);
  const z = zoneFor(main || 0.5);
  return h('div', { class: 'feel' },
    h('div', { class: 'feel-strip' }, ZONES.map(k => h('span', { class: k === z ? 'on' : '', style: { background: k.color }, title: k.name }))),
    h('p', { class: 'feel-text' }, h('b', null, `${z.name}: `), z.feel));
}
/** Legend of the zones used in this workout. */
export function zoneLegend(segments) {
  const used = new Set(segments.map(s => zoneFor((s.lo + s.hi) / 2).name));
  return h('div', { class: 'wo-legend' }, ZONES.filter(z => used.has(z.name)).map(z => h('span', null, h('i', { style: { background: z.color } }), z.name)));
}
