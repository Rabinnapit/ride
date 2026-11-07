// RiderHQ — fuel: your products (gels, bananas, drinks…), per-ride fuel logs, carb targets, pack lists and barcode lookup.
import { getSettings, saveSettings } from '../settings.js';

/** Starter list. Values are typical — scan the barcode or edit them to match your exact products. */
export const DEFAULT_FUEL = [
  { id: 'gel', name: 'Energy gel', kind: 'gel', serving: '1 gel (about 32 g)', carbs: 22, sugars: 11, sodiumMg: 60, caffeineMg: 0, fluidMl: 0, kcal: 100, note: 'Typical gel. Edit it to match yours, or scan its barcode.' },
  { id: 'banana', name: 'Banana', kind: 'food', serving: '1 medium (118 g)', carbs: 27, sugars: 14, sodiumMg: 1, caffeineMg: 0, fluidMl: 0, kcal: 105, note: 'USDA values for a medium banana; also 420 mg potassium.' },
  { id: 'gatorade', name: 'Gatorade', kind: 'drink', serving: '1 bottle (600 ml)', carbs: 36, sugars: 34, sodiumMg: 270, caffeineMg: 0, fluidMl: 600, kcal: 140, note: 'Thirst Quencher is about 6 g carbs per 100 ml. Check your bottle size.' },
  { id: 'water', name: 'Water', kind: 'drink', serving: '1 bottle (600 ml)', carbs: 0, sugars: 0, sodiumMg: 0, caffeineMg: 0, fluidMl: 600, kcal: 0, note: '' },
];
export const FUEL_KINDS = [{ value: 'gel', label: 'Gel / chew' }, { value: 'food', label: 'Food / bar' }, { value: 'drink', label: 'Drink' }, { value: 'other', label: 'Other' }];
const NUM_KEYS = ['carbs', 'sugars', 'sodiumMg', 'caffeineMg', 'fluidMl', 'kcal'];

export function fuelItems(s = getSettings()) { return s.fuel?.items?.length ? s.fuel.items : DEFAULT_FUEL; }
export async function saveFuelItems(items) { await saveSettings({ fuel: { items } }); }
export function cleanItem(it) {
  const o = { id: it.id || `f${Date.now().toString(36)}`, name: (it.name || 'Item').trim(), kind: it.kind || 'other', serving: (it.serving || '1 serving').trim(), note: it.note || '', source: it.source || 'manual' };
  for (const k of NUM_KEYS) { const v = +it[k]; o[k] = Number.isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : 0; }
  if (it.barcode) o.barcode = String(it.barcode);
  return o;
}
/** Add Claude-supplied products (coach/fuel-items.json) that aren't in the list yet. Returns how many were added. */
export async function mergeFuelItems(incoming) {
  if (!Array.isArray(incoming) || !incoming.length) return 0;
  const cur = [...fuelItems()];
  const have = new Set(cur.map(i => i.id)), codes = new Set(cur.map(i => i.barcode).filter(Boolean));
  let n = 0;
  for (const it of incoming) { if (!it?.name || have.has(it.id) || (it.barcode && codes.has(String(it.barcode)))) continue; cur.push(cleanItem({ ...it, source: it.source || 'claude' })); n++; }
  if (n) await saveFuelItems(cur);
  return n;
}

// ---------- logs & targets ----------
/** Entries are snapshots: [{id, name, qty, carbs, sodiumMg, fluidMl, caffeineMg, kcal}] — editing a product later doesn't rewrite history. */
export function fuelTotals(entries = []) {
  const t = { carbs: 0, sodiumMg: 0, fluidMl: 0, caffeineMg: 0, kcal: 0, count: 0 };
  for (const e of entries || []) { const q = +e.qty || 0; if (!q) continue; t.count += q; for (const k of ['carbs', 'sodiumMg', 'fluidMl', 'caffeineMg', 'kcal']) t[k] += (+e[k] || 0) * q; }
  return t;
}
/** Carbohydrate target by ride length (ACSM / ISSN ranges). The low end of 60–90 g/h is the right start until your gut is trained. */
export function fuelTarget(hours) {
  if (hours < 1) return { lo: 0, hi: 30, target: 0, text: 'Under an hour: water is enough if you ate before.' };
  if (hours < 2.5) return { lo: 30, hi: 60, target: 45, text: '1–2.5 hours: 30–60 g of carbs per hour.' };
  return { lo: 60, hi: 90, target: 60, text: 'Over 2.5 hours: 60–90 g per hour. Start at 60 and train your gut up.' };
}
export function fluidPerHour(tempF = 60) { return tempF > 80 ? 800 : tempF > 65 ? 650 : 500; }
export function fuelVerdict(entries, hours) {
  const t = fuelTotals(entries), tg = fuelTarget(hours);
  if (!t.count) return { level: 'none', gph: 0, text: 'Nothing logged yet.' };
  const gph = hours > 0 ? t.carbs / hours : 0;
  if (hours < 1) return { level: 'ok', gph, text: 'Short ride: fuel was optional.' };
  if (gph < tg.lo * 0.75) return { level: 'low', gph, text: `Well under target. Aim for ${tg.lo}–${tg.hi} g per hour: under-fueling is what makes the last hour fade.` };
  if (gph < tg.lo) return { level: 'low', gph, text: `A little under target (${tg.lo}–${tg.hi} g per hour). One more gel or half a bottle of sports drink per hour closes the gap.` };
  if (gph > tg.hi * 1.15) return { level: 'high', gph, text: `Above ${tg.hi} g per hour. Fine if your stomach handled it; otherwise spread it out.` };
  return { level: 'ok', gph, text: `On target (${tg.lo}–${tg.hi} g per hour).` };
}
/** What to pack for a planned ride, from your own products: carb drink for ~every 1.5 h, a banana per 2 h, gels for the rest. */
export function packList(hours, tempF = 60, items = fuelItems()) {
  const tg = fuelTarget(hours);
  const fluidNeed = Math.round(fluidPerHour(tempF) * hours);
  if (hours < 1) return { lines: [{ name: 'Water', qty: 1, unit: 'bottle' }], carbs: 0, need: 0, fluidNeed, target: tg };
  const need = Math.round(tg.target * hours);
  const drink = items.find(i => i.kind === 'drink' && i.carbs > 0), food = items.find(i => i.kind === 'food' && i.carbs > 0), gel = items.find(i => i.kind === 'gel' && i.carbs > 0);
  const lines = []; let carbs = 0, fluid = 0;
  const add = (it, qty) => { if (!it || qty <= 0) return; lines.push({ id: it.id, name: it.name, qty, carbs: it.carbs }); carbs += it.carbs * qty; fluid += (it.fluidMl || 0) * qty; };
  if (drink) add(drink, Math.max(1, Math.round(hours / 1.5)));
  if (food && hours >= 1.5) add(food, Math.max(1, Math.floor(hours / 2)));
  const filler = gel || food || drink;
  if (filler && carbs < need) add(filler, Math.ceil((need - carbs) / filler.carbs));
  const water = Math.max(0, Math.ceil((fluidNeed - fluid) / 600));
  if (water) lines.push({ id: 'water', name: 'Water', qty: water, unit: 'bottle', carbs: 0 });
  return { lines: mergeLines(lines), carbs, need, fluidNeed, target: tg };
}
function mergeLines(lines) { const m = new Map(); for (const l of lines) { const k = l.id || l.name; if (m.has(k)) m.get(k).qty += l.qty; else m.set(k, { ...l }); } return [...m.values()]; }
export function packText(p) { return p.lines.map(l => `${l.qty} × ${l.name}${l.unit === 'bottle' && l.name === 'Water' ? ' (600 ml)' : ''}`).join(', '); }

// ---------- barcode → nutrition (Open Food Facts) ----------
export function barcodeSupported() { return typeof window !== 'undefined' && 'BarcodeDetector' in window; }
/** Read an EAN/UPC barcode from a photo (Chrome on Android). Returns the digits or null. */
export async function barcodeFromPhoto(file) {
  if (!barcodeSupported()) throw new Error('This browser can’t read barcodes from photos. Type the number under the barcode instead.');
  const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
  let usable = formats;
  try { const sup = await window.BarcodeDetector.getSupportedFormats(); usable = formats.filter(f => sup.includes(f)); } catch { /* use all */ }
  const det = new window.BarcodeDetector({ formats: usable.length ? usable : formats });
  const bmp = await createImageBitmap(file);
  try { const codes = await det.detect(bmp); return codes[0]?.rawValue || null; } finally { bmp.close?.(); }
}
const num = v => (v == null || v === '' || !Number.isFinite(+v)) ? null : +v;
/** Look a product up by barcode in Open Food Facts. Returns a fuel item (per serving) or null when the product isn't in the database. */
export async function lookupBarcode(code) {
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length < 8) throw new Error('That barcode looks too short — check the digits.');
  const fields = 'code,product_name,product_name_en,product_name_ko,brands,serving_size,serving_quantity,serving_quantity_unit,quantity,product_quantity,product_quantity_unit,nutriments,categories_tags';
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=${fields}`, typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(10000) } : {});
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Food database error ${res.status}`);
  const j = await res.json();
  if (!j || j.status === 0 || !j.product) return null;
  return productToItem(j.product, clean);
}
/** Open Food Facts product → fuel item per serving. Mass nutrients come in grams (sodium too); _100g means per 100 g or 100 ml. */
export function productToItem(p, code) {
  const n = p.nutriments || {};
  const isDrink = (p.categories_tags || []).some(t => /beverage|drink|sport.?drink/.test(t)) || /ml|cl|fl\s?oz|\bl\b/i.test(`${p.serving_size || ''} ${p.quantity || ''}`);
  const unitFrom = s => (/ml|cl|fl\s?oz|\bl\b/i.test(s || '') ? 'ml' : 'g');
  let size = num(p.serving_quantity), unit = (p.serving_quantity_unit || unitFrom(p.serving_size)).toLowerCase();
  if (!size) { size = num(p.product_quantity); unit = (p.product_quantity_unit || unitFrom(p.quantity)).toLowerCase(); } // single-serve gels and bottles
  const per = (key) => { const sv = num(n[`${key}_serving`]); if (sv != null && num(p.serving_quantity)) return sv; const h = num(n[`${key}_100g`]); return h != null && size ? h * size / 100 : (sv ?? null); };
  const carbs = per('carbohydrates'), sugars = per('sugars'), sodiumG = per('sodium') ?? (per('salt') != null ? per('salt') / 2.5 : null), caffG = per('caffeine'), kcal = per('energy-kcal') ?? (per('energy') != null ? per('energy') / 4.184 : null);
  const name = [p.brands?.split(',')[0]?.trim(), p.product_name_en || p.product_name || p.product_name_ko].filter(Boolean).join(' ').trim() || `Product ${code}`;
  return cleanItem({
    id: `bc${code}`, barcode: code, name, kind: isDrink ? 'drink' : /gel/i.test(name) ? 'gel' : 'food',
    serving: size ? `1 serving (${Math.round(size)} ${unit === 'ml' ? 'ml' : 'g'})` : (p.serving_size || '1 serving'),
    carbs: carbs ?? 0, sugars: sugars ?? 0, sodiumMg: sodiumG != null ? sodiumG * 1000 : 0, caffeineMg: caffG != null ? (caffG < 1 ? caffG * 1000 : caffG) : 0,
    fluidMl: isDrink && unit === 'ml' && size ? size : 0, kcal: kcal ?? 0, source: 'openfoodfacts',
    note: carbs == null ? 'The database has no carb value for this product — check the label.' : 'From Open Food Facts. Check it against the label.',
  });
}
