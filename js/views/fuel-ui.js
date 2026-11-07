// RiderHQ — fuel UI: the per-ride fuel log, your product list, and barcode lookup.
import { state, navigate, updateRide } from '../app.js';
import { h, icon, section, button, input, field, select, modal, toast, progress, confirmDialog } from '../ui/dom.js';
import { fmtDuration } from '../settings.js';
import { fuelItems, saveFuelItems, cleanItem, fuelTotals, fuelTarget, fuelVerdict, fluidPerHour, lookupBarcode, barcodeFromPhoto, barcodeSupported, FUEL_KINDS } from '../modules/fuel.js';
import { syncReady } from '../ai/ai.js';

const fmt = v => Math.round(v).toLocaleString();
const nutritionLine = it => [`${fmt(it.carbs)} g carbs`, it.fluidMl ? `${fmt(it.fluidMl)} ml` : null, it.sodiumMg ? `${fmt(it.sodiumMg)} mg sodium` : null, it.caffeineMg ? `${fmt(it.caffeineMg)} mg caffeine` : null].filter(Boolean).join(', ');

/** Fuel log for one ride: +/− counters for your products, totals, carbs per hour against the target. */
export function fuelPanel(r) {
  const hours = r.timerSec / 3600;
  const tg = fuelTarget(hours);
  const items = fuelItems();
  const entries = (r.fuel?.entries || []).map(e => ({ ...e }));
  const qtyOf = id => entries.find(e => e.id === id)?.qty || 0;
  const body = h('div', { class: 'fuel' });
  let saveTimer = null;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const clean = entries.filter(e => e.qty > 0);
      await updateRide(r.id, { fuel: { entries: clean, updatedAt: new Date().toISOString() } });
      if (syncReady()) import('../sync/github.js').then(m => m.pushRide({ ...state.rides.find(x => x.id === r.id) })).catch(e => console.warn('fuel backup', e));
    }, 700);
  };
  const setQty = (it, q) => {
    q = Math.max(0, Math.min(30, q));
    let e = entries.find(x => x.id === it.id);
    if (!e) { e = { id: it.id, name: it.name, serving: it.serving, carbs: it.carbs, sodiumMg: it.sodiumMg, fluidMl: it.fluidMl, caffeineMg: it.caffeineMg, kcal: it.kcal, qty: 0 }; entries.push(e); }
    e.qty = q; draw(); persist();
  };
  const draw = () => {
    body.innerHTML = '';
    const known = new Set(items.map(i => i.id));
    const rows = [...items, ...entries.filter(e => !known.has(e.id) && e.qty > 0)];
    body.appendChild(h('div', { class: 'fuel-rows' }, rows.map(it => {
      const q = qtyOf(it.id);
      return h('div', { class: `fuel-row ${q ? 'on' : ''}` },
        h('div', { class: 'fuel-name' }, h('b', null, it.name), h('small', null, `${it.serving} · ${nutritionLine(it)}`)),
        h('div', { class: 'stepper', role: 'group', 'aria-label': `${it.name} servings` },
          h('button', { class: 'icon-btn', 'aria-label': `One less ${it.name}`, disabled: !q, onClick: () => setQty(it, q - 1) }, icon('minus')),
          h('output', { 'aria-live': 'polite' }, q),
          h('button', { class: 'icon-btn', 'aria-label': `One more ${it.name}`, onClick: () => setQty(it, q + 1) }, icon('plus'))));
    })));
    const t = fuelTotals(entries), v = fuelVerdict(entries, hours);
    const gph = hours > 0 ? t.carbs / hours : 0;
    const fluidNeed = fluidPerHour(Number.isFinite(r.avgTemp) ? r.avgTemp * 9 / 5 + 32 : 60);
    body.appendChild(h('div', { class: 'fuel-sum' },
      h('div', { class: 'fuel-big' }, h('span', { class: 'n' }, fmt(gph)), h('span', { class: 'u' }, 'g carbs per hour'), h('span', { class: 'of' }, hours >= 1 ? `target ${tg.lo}–${tg.hi}` : 'short ride')),
      hours >= 1 ? h('div', { class: 'fuel-meter', 'aria-hidden': 'true' }, progress(tg.hi ? gph / tg.hi * 100 : 0, { color: v.level === 'ok' ? 'var(--good)' : v.level === 'none' ? 'var(--line-strong)' : 'var(--amber)' }), h('span', { class: 'mark', style: { left: `${tg.lo / tg.hi * 100}%` } })) : null,
      h('p', { class: `fuel-verdict ${v.level}` }, icon(v.level === 'ok' ? 'check' : v.level === 'none' ? 'info' : 'warn'), h('span', null, v.text)),
      h('p', { class: 'small muted' }, `${fmt(t.carbs)} g carbs in ${fmtDuration(r.timerSec, { short: true })} · ${fmt(t.fluidMl)} ml from logged drinks (about ${fluidNeed} ml per hour suits this temperature) · ${fmt(t.sodiumMg)} mg sodium${t.caffeineMg ? ` · ${fmt(t.caffeineMg)} mg caffeine` : ''}`),
    ));
  };
  draw();
  return section('Fuel', body, { sub: `What you ate and drank on this ride. ${tg.text}`, term: 'carbsph', actions: button('My products', () => navigate('nutrition'), { small: true, iconName: 'food' }) });
}

/** Your product list (Fueling page). */
export function fuelLibraryPanel() {
  const list = h('div', { class: 'fuel-lib' });
  const draw = () => {
    list.innerHTML = '';
    for (const it of fuelItems()) list.appendChild(h('div', { class: 'fuel-item' },
      h('div', { class: 'fuel-name' }, h('b', null, it.name), h('small', null, `${it.serving} · ${nutritionLine(it)}${it.source === 'openfoodfacts' ? ' · from Open Food Facts' : it.source === 'claude' ? ' · added by Claude from your photo' : ''}`)),
      h('div', { class: 'row' }, button('Edit', () => productDialog(it, draw), { small: true }), button('Remove', async () => { if (await confirmDialog(`Remove ${it.name}?`, 'Rides you already logged keep their numbers.')) { await saveFuelItems(fuelItems().filter(x => x.id !== it.id)); draw(); } }, { small: true, danger: true }))));
  };
  draw();
  return section('My fuel', h('div', { class: 'stack' }, list,
    h('div', { class: 'row' }, button('Scan a barcode', () => scanProduct(draw), { primary: true, iconName: 'camera' }), button('Add by hand', () => productDialog(null, draw), { iconName: 'plus' })),
    h('p', { class: 'small muted' }, 'Product not found, or the label is in Korean? Send a photo of its nutrition label to Claude in your coaching chat. Claude adds it to this list, and it shows up the next time the app opens.')),
  { sub: 'The products you carry. Your ride fuel log and pack lists use these numbers.' });
}

/** Edit or create a product. */
export function productDialog(item, onSaved = () => {}, { isNew = !item } = {}) {
  const it = { ...(item || { kind: 'gel', serving: '1 serving', carbs: '', sugars: '', sodiumMg: '', caffeineMg: '', fluidMl: '', kcal: '' }) };
  const num = (k, label, hint) => field(label, input({ type: 'number', inputmode: 'decimal', min: 0, step: 'any', value: it[k] ?? '', onInput: e => { it[k] = e.target.value; } }), hint);
  const body = h('div', { class: 'grid-2' },
    field('Name', input({ type: 'text', value: it.name || '', placeholder: 'e.g. SiS GO gel, orange', onInput: e => { it.name = e.target.value; } })),
    field('Type', select(FUEL_KINDS, it.kind || 'other', { onChange: e => { it.kind = e.target.value; } })),
    field('One serving is', input({ type: 'text', value: it.serving || '', placeholder: 'e.g. 1 gel (60 ml)', onInput: e => { it.serving = e.target.value; } })),
    num('carbs', 'Carbohydrate (g)', 'per serving'), num('sugars', 'of which sugars (g)'), num('sodiumMg', 'Sodium (mg)', 'Label shows salt? Sodium = salt ÷ 2.5'),
    num('fluidMl', 'Fluid (ml)', 'for drinks'), num('caffeineMg', 'Caffeine (mg)'), num('kcal', 'Energy (kcal)'),
  );
  if (it.note) body.appendChild(h('p', { class: 'small muted', style: { gridColumn: '1 / -1' } }, it.note));
  modal(isNew ? 'Add product' : `Edit ${it.name}`, body, { actions: [{ label: isNew ? 'Add product' : 'Save changes', primary: true, onClick: async () => {
    if (!String(it.name || '').trim()) { toast('Give the product a name', { error: true }); return false; }
    const clean = cleanItem(it);
    const cur = fuelItems().filter(x => x.id !== clean.id);
    await saveFuelItems(isNew ? [...cur, clean] : fuelItems().map(x => x.id === clean.id ? clean : x));
    toast(isNew ? `${clean.name} added` : 'Changes saved'); onSaved(clean);
  } }] });
}

/** Photo of a barcode → Open Food Facts → product editor (prefilled). */
export function scanProduct(onSaved = () => {}) {
  const status = h('p', { class: 'small muted', role: 'status' });
  const codeIn = input({ type: 'text', inputmode: 'numeric', placeholder: 'e.g. 8801234567890', autocomplete: 'off' });
  let m = null;
  const go = async (code) => {
    status.textContent = 'Looking it up…';
    try {
      const it = await lookupBarcode(code);
      if (!it) { status.textContent = ''; status.append('Not in the food database yet. ', h('a', { href: '#', onClick: e => { e.preventDefault(); m.close(); productDialog({ name: '', kind: 'gel', serving: '1 serving', barcode: code }, onSaved, { isNew: true }); } }, 'Add it by hand'), ', or send a photo of the label to Claude.'); return; }
      m.close(); productDialog(it, onSaved, { isNew: true });
    } catch (e) { status.textContent = e.message; }
  };
  const file = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' }, onChange: async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    status.textContent = 'Reading the barcode…';
    try { const code = await barcodeFromPhoto(f); if (!code) { status.textContent = 'No barcode found in that photo. Fill the frame with the barcode, in good light, or type the number.'; return; } codeIn.value = code; go(code); } catch (err) { status.textContent = err.message; }
  } });
  const body = h('div', { class: 'stack' },
    h('p', null, 'Photograph the barcode on the packet. The app reads the number and looks up carbs, sodium and caffeine in Open Food Facts, a free food database.'),
    barcodeSupported() ? h('div', { class: 'row' }, button('Take photo of barcode', () => file.click(), { primary: true, iconName: 'camera' }), file) : h('p', { class: 'small muted' }, 'This browser can’t read barcodes from photos (Chrome on Android can). Type the number instead.'),
    h('div', { class: 'row scan-manual' }, field('Number under the barcode', codeIn), button('Look up', () => go(codeIn.value), { small: true })),
    status);
  m = modal('Add a product by barcode', body);
}
