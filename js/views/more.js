// RiderHQ — More: menu, AI coach conversation & weekly review, equipment/maintenance, fueling.
import { state, registerView, navigate, db, refreshData } from '../app.js';
import { h, icon, section, empty, button, table, input, field, toast, tile, select, kv, modal, confirmDialog, progress, pill } from '../ui/dom.js';
import { renderAnalysis, markdownish } from './ride.js';
import { getSettings, units, fmtDuration, fmtNum, todayIso, addDays, rideLocalDate, fmtDate, currentFtp } from '../settings.js';
import { aggregate, ridesInRange } from '../metrics/aggregate.js';
import { buildFocus } from '../coach/focus.js';
import { askCoach, weeklyReviewPrompt, freeChatPrompt, riderContext, aiConfigured, validateAdjustments, chatMessageForReview, syncReady } from '../ai/ai.js';
import { pullCoachNotes } from '../sync/github.js';
import { GLOSSARY } from '../ui/glossary.js';
import { COMPONENT_TYPES, componentStatus, typeOf, dueText, presetC5Aero, fuelingPlan, eventFueling } from '../modules/extras.js';

import { fuelLibraryPanel } from './fuel-ui.js';
registerView('more', (root) => {
  const items = [
    ['gym', 'Gym', 'Log sets, estimated 1RM, periodization', 'gym'], ['wellness', 'Wellness', 'Sleep, resting HR, HRV, readiness', 'heart'],
    ['coach', 'Coach', 'Claude analysis, notebook, weekly review', 'spark'], ['equipment', 'Maintenance', 'Chain wax, tires, brakes, bike checks', 'wrench'],
    ['nutrition', 'Fueling', 'Carbs per hour, event plan', 'food'], ['glossary', 'What the numbers mean', 'Plain-English explanation of every term', 'info'], ['settings', 'Settings', 'Profile, FTP, zones, units, sync, backup', 'settings'], ['howto', 'How to', 'Install, share from OnelapFit, Zwift, backup', 'help'],
  ];
  root.append(h('div', { class: 'page-head' }, h('h1', null, 'More')), h('div', { class: 'menu' }, items.map(([r, t, d, i]) => h('a', { class: 'menu-item', href: `#/${r}` }, icon(i), h('span', null, h('b', null, t), h('small', null, d))))));
});

// ---------- AI coach ----------
registerView('coach', (root) => {
  const s = getSettings();
  const today = todayIso();
  const rides = state.rides.filter(r => !r.excluded);
  const head = h('div', { class: 'page-head' }, h('h1', null, 'Coach'));
  // ---- Claude chat coach (no API key) ----
  const reviewMsg = () => chatMessageForReview(state.rides, state.wellness, state.plan, s);
  const nbBox = h('div', { class: 'notebook' });
  db.getSetting('coachNotebook', null).then(nb => { if (nb?.text) { nbBox.append(...markdownish(nb.text), h('p', { class: 'small muted' }, `Updated ${new Date(nb.fetchedAt).toLocaleString()}`)); } else nbBox.appendChild(h('p', { class: 'muted' }, syncReady(s) ? 'No notebook yet — tap Get Claude\'s notes after your first analysis.' : 'Claude keeps a running notebook about your training in your backup repo. Connect backup (Settings → Backup to GitHub) to see it here.')); });
  const chatPanel = section('Claude chat coach', h('div', { class: 'stack' },
    h('p', null, 'Your coach lives in the Claude chat. Tap a button: it copies a message and opens the chat; paste and send. Claude reads your rides, saves each analysis, and keeps a notebook so past rides are never re-analyzed.'),
    h('div', { class: 'row' },
      button('Weekly review', () => { const m = reviewMsg(); try { navigator.clipboard.writeText(m).then(() => toast('Copied — paste it in the chat')).catch(() => toast('Copy failed — use Settings backup instead', { error: true })); } catch { /* ignore */ } window.open(s.coach?.chatUrl || 'https://claude.ai', '_blank', 'noopener'); }, { primary: true, iconName: 'spark' }),
      h('a', { class: 'btn', href: s.coach?.chatUrl || 'https://claude.ai', target: '_blank', rel: 'noopener' }, 'Open the chat'),
      syncReady(s) ? button('Get Claude\'s notes', async () => { try { const n = await pullCoachNotes(); toast(n ? `${n} new note${n > 1 ? 's' : ''}` : 'Up to date'); navigate('coach'); } catch (e) { toast(e.message, { error: true, ms: 8000 }); } }, { iconName: 'sync' }) : null,
    ),
    h('h3', null, 'Coach notebook'), nbBox,
  ));
  root.append(head, chatPanel);
  if (!aiConfigured(s)) {
    const hist = section('Saved analyses', h('div', { class: 'ai-list' }));
    db.getAll('ai').then(all => { const box = hist.querySelector('.ai-list'); const list = all.sort((a, b) => b.ts.localeCompare(a.ts)); if (!list.length) box.appendChild(h('p', { class: 'muted' }, 'Nothing yet.')); for (const a of list) { const card = renderAnalysis(a); if (a.rideId) card.appendChild(h('a', { href: `#/ride/${a.rideId}`, class: 'small' }, 'Open ride')); box.appendChild(card); } });
    root.append(hist, h('p', { class: 'small muted' }, 'Optional: add a Gemini or Claude API key in Settings → AI coach to also ask questions inside the app.'));
    return;
  }
  const ctxOf = () => { const focus = buildFocus({ settings: s, rides, pmc: state.pmc, today, readiness: state.readiness, wellnessCount: state.wellness.length }); return riderContext(s, { focus, pmcToday: state.pmc.find(p => p.date === today), readiness: state.readiness, plan: state.plan }); };
  const ask = h('form', { class: 'ask', onSubmit: async e => {
    e.preventDefault(); const q = qInput.value.trim(); if (!q) return; if (!aiConfigured(s)) { navigate('settings'); return; }
    btn.disabled = true; btn.textContent = 'Thinking…';
    try { const a7 = aggregate(ridesInRange(rides, addDays(today, -6), today)), a30 = aggregate(ridesInRange(rides, addDays(today, -29), today)); await askCoach({ kind: 'chat', user: freeChatPrompt(q, ctxOf(), { last7: a7, last30: a30, wellnessLast14: state.wellness.slice(-14) }), schema: null, meta: { question: q } }); qInput.value = ''; navigate('coach'); }
    catch (err) { toast(err.message, { error: true, ms: 8000 }); } finally { btn.disabled = false; btn.textContent = 'Ask'; }
  } });
  const qInput = h('textarea', { class: 'input', rows: 3, placeholder: 'e.g. My legs felt heavy on Saturday — should I move Tuesday\'s intervals? / How should I pace a 10% climb at my FTP? / Build me a fueling plan for a 120 km ride.' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Ask');
  ask.append(qInput, h('div', { class: 'row' }, btn, button('Weekly review', async () => {
    if (!aiConfigured(s)) { navigate('settings'); return; }
    toast('Writing your weekly review…', { ms: 8000 });
    try { const a7 = aggregate(ridesInRange(rides, addDays(today, -6), today)), a30 = aggregate(ridesInRange(rides, addDays(today, -29), today)); const rec = await askCoach({ kind: 'weekly', user: weeklyReviewPrompt(ridesInRange(rides, addDays(today, -29), today), a7, a30, ctxOf(), state.wellness.slice(-14)) }); if (rec.parsed?.planAdjustments?.length && state.plan) { const v = validateAdjustments(rec.parsed.planAdjustments, state.plan); rec.parsed.validated = v; await db.put('ai', rec); } navigate('coach'); }
    catch (err) { toast(err.message, { error: true, ms: 8000 }); }
  }, { iconName: 'spark' })));
  const askPanel = section('Ask the coach', ask, { sub: 'The coach gets your profile, goals, form, the rule-based focus list, the last 30 days and the current plan with every question.' });
  const histPanel = section('History', h('div', { class: 'ai-list' }), { actions: button('Clear', async () => { if (await confirmDialog('Clear coach history?', 'Removes all stored AI analyses on this device.')) { await db.clear('ai'); navigate('coach'); } }, { small: true }) });
  db.getAll('ai').then(all => {
    const box = histPanel.querySelector('.ai-list'); const list = all.sort((a, b) => b.ts.localeCompare(a.ts));
    if (!list.length) box.appendChild(h('p', { class: 'muted' }, 'Nothing yet.'));
    for (const a of list) {
      const card = renderAnalysis(a);
      if (a.kind === 'chat') card.insertBefore(h('p', { class: 'ai-q' }, h('strong', null, 'You: '), a.question || ''), card.children[1]);
      if (a.kind === 'ride' && a.rideId) card.appendChild(h('a', { href: `#/ride/${a.rideId}`, class: 'small' }, 'Open ride'));
      if (a.parsed?.validated) card.appendChild(h('p', { class: 'small muted' }, `${a.parsed.validated.ok.length} adjustment${a.parsed.validated.ok.length === 1 ? '' : 's'} pass the plan rules${a.parsed.validated.rejected.length ? `; ${a.parsed.validated.rejected.length} rejected (${a.parsed.validated.rejected.map(x => x.why).join('; ')})` : ''}.`));
      box.appendChild(card);
    }
  });
  root.append(askPanel, histPanel);
});

// ---------- equipment ----------
registerView('equipment', (root) => {
  const rides = state.rides.filter(r => !r.excluded);
  const bikes = [...new Set(rides.map(r => r.bikeName || 'Bike'))];
  const odoFor = b => rides.filter(r => (r.bikeName || 'Bike') === b).reduce((a, r) => a + r.distanceM, 0) / 1000;
  const bikeOf = c => c.bike || bikes[0] || 'Bike';
  const head = h('div', { class: 'page-head' }, h('h1', null, 'Maintenance'), h('div', { class: 'page-actions' }, button('Add item', () => compDialog(null, bikes, odoFor), { small: true, iconName: 'plus' })));
  const odoPanel = section('Odometer', h('div', { class: 'tiles compact' }, (bikes.length ? bikes : ['Bike']).map(b => tile(units.distStr(odoFor(b) * 1000, 0), b, `${rides.filter(r => (r.bikeName || 'Bike') === b).length} rides`))), { sub: 'Distance from your imported rides. Service counters run off this, so import every ride (indoor trainer rides count for the drivetrain too).' });

  if (!state.equipment.length) {
    const setup = section('Set up your Winspace C5 Aero', h('div', { class: 'stack' },
      h('p', null, 'Adds the maintenance list for your bike: chain wax every 400 km, tires, brakes, the T47 bottom bracket, headset, integrated cockpit bolts, seatpost, cleats and power pedals. Each starts counting from today; edit any item you serviced at a different time.'),
      h('div', { class: 'row' }, button('Set up C5 Aero', () => presetDialog(bikes, odoFor), { primary: true }), button('Add items one by one', () => compDialog(null, bikes, odoFor))),
    ));
    root.append(head, odoPanel, setup, guidePanel());
    return;
  }
  const rows = state.equipment.map(c => ({ c, t: typeOf(c.type), st: componentStatus(c, odoFor(bikeOf(c))) }));
  const attention = rows.filter(r => r.st.state !== 'ok').sort((a, b) => b.st.pct - a.st.pct);
  const item = ({ c, t, st }) => h('div', { class: `mt-item ${st.state}` },
    h('button', { class: 'mt-main', onClick: () => compDialog(c, bikes, odoFor) },
      h('span', { class: 'mt-name' }, c.name || t.label, c.name && c.name !== t.label ? h('small', null, ` ${t.label}`) : null),
      h('span', { class: 'mt-due' }, st.state === 'due' ? icon('warn') : null, dueText(st)),
      h('span', { class: 'mt-bar', role: 'progressbar', 'aria-valuenow': Math.round(Math.min(1, st.pct) * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: `${Math.min(100, st.pct * 100)}%` } })),
      h('small', { class: 'mt-meta' }, `${t.kind === 'service' ? 'Last done' : 'Installed'} ${fmtDate(c.installedDate)}${st.usedKm != null ? ` · ${Math.round(st.usedKm).toLocaleString()} of ${st.limitKm.toLocaleString()} km` : ''}${st.usedDays != null && st.limitDays ? ` · ${st.usedDays} of ${st.limitDays} days` : ''}`)),
    button(t.kind === 'service' ? 'Done' : 'Replaced', () => markDone(c, odoFor(bikeOf(c)), t), { small: true, primary: st.state === 'due', iconName: 'check' }));
  const attPanel = attention.length ? section('Needs attention', h('div', { class: 'mt-list' }, attention.map(item)), { sub: 'Due now or coming up within the next ride or two.' }) : section('Needs attention', h('p', { class: 'muted' }, 'Nothing due. Keep zero-offsetting the pedals before each ride.'));
  const groups = [...new Set(COMPONENT_TYPES.map(t => t.group)), 'Other'];
  const byGroup = groups.map(g => [g, rows.filter(r => (r.t.group || 'Other') === g).sort((a, b) => b.st.pct - a.st.pct)]).filter(([, rs]) => rs.length);
  const allPanel = section('Everything', h('div', null, byGroup.map(([g, rs]) => h('div', { class: 'mt-group' }, h('h3', null, g), h('div', { class: 'mt-list' }, rs.map(item))))), { sub: 'Tap an item to change its interval or last-done date. Done resets the counter to today and the current odometer.' });
  const log = state.equipment.flatMap(c => (c.history || []).map((x, i) => ({ ...x, c, i, last: i === c.history.length - 1, name: c.name || typeOf(c.type).label }))).sort((a, b) => b.date.localeCompare(a.date) || b.i - a.i).slice(0, 20);
  const logPanel = log.length ? section('Service log', table(['Date', 'Item', 'Odometer', ''], log.map(x => [fmtDate(x.date), `${x.name}${x.action === 'replaced' ? ' (replaced)' : ''}`, `${Math.round(x.odoKm).toLocaleString()} km`,
    h('div', { class: 'row log-actions' },
      x.last ? button('Undo', () => undoEntry(x.c, x.i), { small: true }) : null,
      button('Delete', () => deleteEntry(x.c, x.i), { small: true, danger: true }))])),
  { sub: 'Undo takes back the latest check-off for an item and restores its counter to where it was. Delete just removes a line from the log; the counter stays as it is.' }) : null;
  root.append(head, odoPanel, attPanel, allPanel, logPanel, guidePanel());
});
function guidePanel() {
  return section('Service intervals', h('details', { class: 'demo-fold' }, h('summary', null, 'How often, and how to tell'), table(['Item', 'Every', 'How to tell'], COMPONENT_TYPES.map(t => [t.label, [t.km ? `${t.km.toLocaleString()} km` : null, t.days ? `${t.days} days` : null].filter(Boolean).join(' or '), h('span', { class: 'small' }, t.note)]))), { sub: 'Defaults you can change per item. Wet or gritty rides shorten everything; a clean waxed drivetrain stretches chain and cassette life.' });
}
async function markDone(c, odoKm, t) {
  const today = todayIso();
  const history = [...(c.history || []), { date: today, odoKm, action: t.kind === 'service' ? 'done' : 'replaced', prevDate: c.installedDate, prevOdoKm: c.installedOdoKm }];
  await db.put('equipment', { ...c, installedDate: today, installedOdoKm: Math.round(odoKm), history });
  await refreshData(); toast(`${c.name || t.label}: ${t.kind === 'service' ? 'done' : 'replaced'}. Counter reset.`); navigate('equipment');
}
async function undoEntry(c, i) {
  const e = c.history[i];
  const restored = { ...c, history: c.history.filter((_, j) => j !== i) };
  if (e.prevDate !== undefined) { restored.installedDate = e.prevDate; restored.installedOdoKm = e.prevOdoKm; }
  await db.put('equipment', restored); await refreshData(); toast(`${c.name || typeOf(c.type).label}: check-off undone, counter restored`); navigate('equipment');
}
async function deleteEntry(c, i) {
  if (!(await confirmDialog('Delete this log entry?', 'The item’s counter is not changed. Use Undo on the latest entry to restore the counter.'))) return;
  await db.put('equipment', { ...c, history: c.history.filter((_, j) => j !== i) }); await refreshData(); toast('Log entry deleted'); navigate('equipment');
}
function presetDialog(bikes, odoFor) {
  const bike = bikes[0] || 'Bike';
  const di2 = select([{ value: 'di2', label: 'Electronic (Di2)' }, { value: 'mech', label: 'Mechanical cables' }], 'di2');
  const tires = select([{ value: 'tubes', label: 'Inner tubes' }, { value: 'tubeless', label: 'Tubeless' }], 'tubes');
  const waxKm = input({ type: 'number', min: 0, step: 1, value: 0 });
  const body = h('div', { class: 'stack' },
    h('div', { class: 'grid-2' }, field('Shifting', di2), field('Tires', tires), field('Km since your last chain wax', waxKm, 'Roughly is fine; 0 if you just waxed it')),
    h('p', { class: 'small muted' }, 'Everything else starts from today. Edit any item later if you know when it was last done.'));
  modal('Set up Winspace C5 Aero', body, { actions: [{ label: 'Add maintenance list', primary: true, onClick: async () => {
    const odo = Math.round(odoFor(bike)); const today = todayIso();
    const keys = presetC5Aero({ di2: di2.value === 'di2', tubeless: tires.value === 'tubeless' });
    let i = 0;
    for (const k of keys) await db.put('equipment', { id: `c-${Date.now()}-${i++}`, type: k, bike, name: '', installedDate: today, installedOdoKm: k === 'wax' ? odo - (+waxKm.value || 0) : odo, limitKm: null, limitDays: null, history: [] });
    await refreshData(); toast(`${keys.length} items added`); navigate('equipment');
  } }] });
}
function compDialog(c, bikes, odoFor) {
  const typeSel = select(COMPONENT_TYPES.map(t => ({ value: t.key, label: `${t.group}: ${t.label}` })), c?.type || 'wax');
  const bikeSel = select((bikes.length ? bikes : ['Bike']).map(b => ({ value: b, label: b })), c?.bike || bikes[0] || 'Bike');
  const name = input({ type: 'text', value: c?.name || '', placeholder: 'optional, e.g. KMC X12, GP5000 28 mm' });
  const date = input({ type: 'date', value: c?.installedDate || todayIso() });
  const odo = input({ type: 'number', step: '1', value: c?.installedOdoKm ?? Math.round(odoFor(bikeSel.value)), placeholder: 'km' });
  const t0 = typeOf(c?.type || 'wax');
  const limKm = input({ type: 'number', value: c?.limitKm || '', placeholder: t0.km ? `default ${t0.km}` : 'none' });
  const limDays = input({ type: 'number', value: c?.limitDays || '', placeholder: t0.days ? `default ${t0.days}` : 'none' });
  typeSel.addEventListener('change', () => { const t = typeOf(typeSel.value); limKm.placeholder = t.km ? `default ${t.km}` : 'none'; limDays.placeholder = t.days ? `default ${t.days}` : 'none'; });
  const body = h('div', { class: 'grid-2' }, field('Item', typeSel), field('Bike', bikeSel), field('Name / model', name), field('Last done / installed on', date), field('Odometer then (km)', odo, 'Current odometer is pre-filled'), field('Every (km)', limKm), field('Every (days)', limDays));
  const actions = [{ label: 'Save', primary: true, onClick: async () => { await db.put('equipment', { ...(c || {}), id: c?.id || `c-${Date.now()}`, type: typeSel.value, bike: bikeSel.value, name: name.value, installedDate: date.value, installedOdoKm: Number.isFinite(parseFloat(odo.value)) ? +odo.value : 0, limitKm: +limKm.value || null, limitDays: +limDays.value || null, history: c?.history || [] }); await refreshData(); navigate('equipment'); } }];
  if (c) actions.unshift({ label: 'Delete item', danger: true, onClick: async () => { if (!(await confirmDialog(`Delete ${c.name || typeOf(c.type).label}?`, 'Removes the item and its service log.'))) return false; await db.delete('equipment', c.id); await refreshData(); navigate('equipment'); } });
  modal(c ? `Edit ${c.name || typeOf(c.type).label}` : 'Add maintenance item', body, { actions });
}

// ---------- nutrition ----------
registerView('nutrition', (root) => {
  const s = getSettings();
  const weightKg = s.profile.weightKg || 75, ftp = currentFtp(s) || 150;
  let hours = 3, intensity = 0.7, tempF = 60;
  const out = h('div');
  const draw = () => { const f = fuelingPlan({ hours, intensityIf: intensity, weightKg, tempF }); const kj = Math.round(hours * 3600 * ftp * intensity * 0.92 / 1000); out.innerHTML = ''; out.append(h('div', { class: 'tiles compact' }, tile(`${f.carbsPerHour} g/h`, 'Carbohydrate', `${f.carbsTotal} g total`), tile(`${f.fluidPerHour} ml/h`, 'Fluid', `${(f.fluidTotal / 1000).toFixed(1)} L total`), tile(`${f.sodiumPerHour} mg/h`, 'Sodium'), tile(`~${kj.toLocaleString()} kcal`, 'Energy burned', `${kj.toLocaleString()} kJ of work`)), kv([['On the bike', f.examples], ['Before', f.preRide], ['After', f.recovery]])); };
  const calc = section('Ride fueling calculator', h('div', null, h('div', { class: 'grid-3' }, field('Duration (hours)', input({ type: 'number', step: '0.5', min: 0.5, max: 12, value: hours, onInput: e => { hours = +e.target.value || 1; draw(); } })), field('Intensity (IF)', select([[0.55, 'Recovery 0.55'], [0.65, 'Endurance 0.65'], [0.72, 'Long ride 0.72'], [0.8, 'Tempo 0.80'], [0.88, 'Hard 0.88']].map(([v, l]) => ({ value: v, label: l })), intensity, { onChange: e => { intensity = +e.target.value; draw(); } })), field('Temperature (°F)', input({ type: 'number', value: tempF, onInput: e => { tempF = +e.target.value || 60; draw(); } }))), out), { sub: 'ISSN / ACSM ranges: 30–60 g/h up to 2.5 h, 60–90 g/h beyond; 1 kJ of work ≈ 1 kcal burned.' });
  draw();
  const ev = s.goals.event; let evPanel = null;
  if (ev?.distanceKm) { const e = eventFueling(ev, weightKg, ftp); evPanel = section(`${ev.name} — fueling plan`, h('div', null, h('div', { class: 'tiles compact' }, tile(`${e.perDayKm.toFixed(0)} km`, 'Per day'), tile(`~${e.hours.toFixed(1)} h`, 'Riding per day', 'at ~20 km/h touring pace'), tile(`${e.carbsOnBike} g`, 'Carbs on the bike / day'), tile(`~${e.kjPerDay.toLocaleString()} kcal`, 'Riding energy / day')), kv([['Two days before', e.carbLoad], ['Every tour day', e.daily], ['Shopping list per day', `${Math.ceil(e.carbsOnBike / 25)} gels or rice cakes (25 g each), 2 bottles with 40 g carb mix, salt tabs, one real meal at the halfway stamp.`]]))); }
  root.append(h('div', { class: 'page-head' }, h('h1', null, 'Fueling')), fuelLibraryPanel(), calc, evPanel);
});
export { fmtDuration, fmtNum, rideLocalDate, fmtDate, markdownish };

// ---------- glossary ----------
registerView('glossary', (root) => {
  let q = '';
  const list = h('div', { class: 'gloss-list' });
  const draw = () => {
    list.innerHTML = '';
    const items = Object.entries(GLOSSARY).filter(([, g]) => !q || (g.term + ' ' + g.what).toLowerCase().includes(q)).sort((a, b) => a[1].term.localeCompare(b[1].term));
    for (const [, g] of items) list.appendChild(h('div', { class: 'panel gloss-item' }, h('h3', null, g.term), h('p', null, g.what), g.good ? h('p', { class: 'small muted' }, h('strong', null, 'What to look for: '), g.good) : null));
    if (!items.length) list.appendChild(h('p', { class: 'muted' }, 'No term matches that search.'));
  };
  draw();
  root.append(h('div', { class: 'page-head' }, h('h1', null, 'What the numbers mean')),
    h('p', { class: 'lead' }, 'Every term in RiderHQ in plain English. Tap the small ? next to any number in the app to see its entry.'),
    input({ type: 'search', placeholder: 'Search, e.g. TSS, form, cadence', id: 'gloss-q', onInput: e => { q = e.target.value.trim().toLowerCase(); draw(); } }),
    list);
});
