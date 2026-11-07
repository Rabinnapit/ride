// RiderHQ — tiny DOM helpers and shared components.
import { withInfo } from './glossary.js';
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string' && k !== 'list') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const frag = (...children) => append(document.createDocumentFragment(), children);
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
  rides: '<circle cx="6" cy="17" r="3.5"/><circle cx="18" cy="17" r="3.5"/><path d="M6 17 10 8h4l2 4h4"/><path d="m14 8 4 9"/><path d="M10 8 8 4h3"/>',
  analyze: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  train: '<path d="M4 12h3l2-5 3 10 3-7 2 2h3"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  gym: '<path d="M3 10v4"/><path d="M21 10v4"/><path d="M6 8v8"/><path d="M18 8v8"/><path d="M6 12h12"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  wrench: '<path d="M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9-2-2z"/>',
  food: '<path d="M5 3v18"/><path d="M5 3c-2 0-2 6 0 6"/><path d="M12 3v8a2 2 0 0 0 2 2v8"/><path d="M19 3v18"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 20h16"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7"/><path d="M12 17h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  check: '<path d="m5 12 4 4L19 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.3 1.5A3.5 3.5 0 0 1 17.5 18z"/>',
  sync: '<path d="M4 12a8 8 0 0 1 14-5l2-2v6h-6l2-2a5 5 0 0 0-9 3"/><path d="M20 12a8 8 0 0 1-14 5l-2 2v-6h6l-2 2a5 5 0 0 0 9-3"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  warn: '<path d="M12 3 2 20h20z"/><path d="M12 9v5M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  minus: '<path d="M5 12h14"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
};
export function icon(name, cls = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '20'); svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true'); if (cls) svg.setAttribute('class', cls);
  svg.innerHTML = ICONS[name] || ICONS.info;
  return svg;
}

/** Numeric tile: big number, small label, optional sub-line. */
export function tile(value, label, sub = null, cls = '', term = null) {
  return h('div', { class: `tile ${cls}` }, h('div', { class: 'tile-value' }, value), h('div', { class: 'tile-label' }, typeof label === 'string' ? withInfo(label, term) : label), sub != null ? h('div', { class: 'tile-sub' }, sub) : null);
}
export function section(title, body, { sub = null, actions = null, cls = '', term = null } = {}) {
  return h('section', { class: `panel ${cls}` },
    h('div', { class: 'panel-head' }, h('div', null, h('h2', null, typeof title === 'string' ? withInfo(title, term) : title), sub ? h('p', { class: 'panel-sub' }, sub) : null), actions ? h('div', { class: 'panel-actions' }, actions) : null),
    h('div', { class: 'panel-body' }, body));
}
/** Small heading with an explanation button when it names a known term. */
export function h3i(text, term = null) { return h('h3', null, withInfo(text, term)); }
export function empty(text, action = null) { return h('div', { class: 'empty' }, h('p', null, text), action); }

/** Zone distribution bars, highest zone on top (Z7 … Z1), each row: badge · name · range · bar · time · %. */
export function zoneBars(zones, seconds, { fmtTime, unit = 'W', totalOverride = null } = {}) {
  const total = totalOverride ?? seconds.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...seconds);
  const rows = zones.map((z, i) => {
    const s = seconds[i] || 0, p = total ? s / total * 100 : 0;
    const range = z.hi === Infinity ? `> ${z.lo - 1}` : `${z.lo}–${z.hi}`;
    const name = String(z.name).replace(/^Z\d+[a-c]?\s+/, '');
    return h('div', { class: 'zone-row' },
      h('div', { class: 'zone-name' }, h('span', { class: 'zone-badge', style: { background: z.color } }, `Z${i + 1}`), name, h('span', { class: 'zone-range' }, ` ${range} ${unit}`)),
      h('div', { class: 'zone-bar' }, h('div', { class: 'zone-fill', style: { width: `${s / max * 100}%`, background: z.color } })),
      h('div', { class: 'zone-time' }, fmtTime(s)), h('div', { class: 'zone-pct' }, `${p.toFixed(1)}%`));
  });
  return h('div', { class: 'zones' }, rows.reverse());
}

let toastTimer = null;
export function toast(msg, { error = false, ms = 3200 } = {}) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status' }); document.body.appendChild(t); }
  t.textContent = msg; t.className = `show ${error ? 'error' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, ms);
}
export function modal(title, body, { actions = [], wide = false } = {}) {
  const back = h('div', { class: 'modal-back', onClick: (e) => { if (e.target === back) close(); } });
  const close = () => back.remove();
  const box = h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'modal-head' }, h('h3', null, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onClick: close }, icon('close'))),
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('div', { class: 'modal-actions' }, actions.map(a => h('button', { class: `btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}`, onClick: async () => { const r = await a.onClick?.(); if (r !== false) close(); } }, a.label))) : null);
  back.appendChild(box); document.body.appendChild(back);
  return { close };
}
export function confirmDialog(title, text) {
  return new Promise(resolve => modal(title, h('p', null, text), { actions: [{ label: 'Cancel', onClick: () => resolve(false) }, { label: 'Confirm', primary: true, danger: true, onClick: () => resolve(true) }] }));
}
export function downloadFile(name, content, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function field(label, input, hint = null) { return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'field-hint' }, hint) : null); }
export function input(attrs = {}) { return h('input', { class: 'input', ...attrs }); }
export function select(options, value, attrs = {}) {
  const sel = h('select', { class: 'input', ...attrs }, options.map(o => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
  return sel;
}
export function button(label, onClick, { primary = false, small = false, danger = false, iconName = null, cls = '' } = {}) {
  return h('button', { class: `btn ${primary ? 'primary' : ''} ${small ? 'small' : ''} ${danger ? 'danger' : ''} ${cls}`, onClick }, iconName ? icon(iconName) : null, label);
}
export function segmented(options, value, onChange, { cls = '' } = {}) {
  const wrap = h('div', { class: `segmented ${cls}`, role: 'tablist' });
  for (const o of options) {
    const b = h('button', { class: `seg ${String(o.value) === String(value) ? 'active' : ''}`, role: 'tab', 'aria-selected': String(o.value) === String(value), onClick: () => { wrap.querySelectorAll('.seg').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-selected', 'false'); }); b.classList.add('active'); b.setAttribute('aria-selected', 'true'); onChange(o.value); } }, o.label);
    wrap.appendChild(b);
  }
  return wrap;
}
export function delta(cur, prev, { higherIsBetter = true, fmt = v => v.toFixed(0), suffix = '' } = {}) {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  const d = cur - prev, p = d / Math.abs(prev) * 100;
  const good = higherIsBetter ? d > 0 : d < 0;
  return h('span', { class: `delta ${d === 0 ? '' : good ? 'up' : 'down'}` }, `${d > 0 ? '+' : ''}${fmt(d)}${suffix} (${p > 0 ? '+' : ''}${p.toFixed(0)}%)`);
}
export function kv(rows) { return h('dl', { class: 'kv' }, rows.filter(Boolean).map(([k, v]) => [h('dt', null, k), h('dd', null, v)])); }
export function table(headers, rows, { cls = '' } = {}) {
  return h('div', { class: 'table-wrap' }, h('table', { class: `table ${cls}` }, h('thead', null, h('tr', null, headers.map(x => h('th', null, x)))), h('tbody', null, rows.map(r => h('tr', null, r.map(c => h('td', null, c)))))));
}
export function progress(pct, { color = null, label = null } = {}) {
  return h('div', { class: 'progress' }, h('div', { class: 'progress-fill', style: { width: `${Math.max(0, Math.min(100, pct))}%`, background: color || undefined } }), label ? h('span', { class: 'progress-label' }, label) : null);
}
export function pill(text, cls = '') { return h('span', { class: `pill ${cls}` }, text); }
