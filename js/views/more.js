// RideHQ — More: menu, AI coach conversation & weekly review, equipment/maintenance, fueling.
import { state, registerView, navigate, db, refreshData } from '../app.js';
import { h, icon, section, empty, button, table, input, field, toast, tile, select, kv, modal, confirmDialog, progress, pill } from '../ui/dom.js';
import { renderAnalysis, markdownish } from './ride.js';
import { getSettings, units, fmtDuration, fmtNum, todayIso, addDays, rideLocalDate, fmtDate, currentFtp } from '../settings.js';
import { aggregate, ridesInRange } from '../metrics/aggregate.js';
import { buildFocus } from '../coach/focus.js';
import { askCoach, weeklyReviewPrompt, freeChatPrompt, riderContext, aiConfigured, validateAdjustments, chatMessageForReview, syncReady } from '../ai/ai.js';
import { pullCoachNotes } from '../sync/github.js';
import { GLOSSARY } from '../ui/glossary.js';
import { COMPONENT_TYPES, componentStatus, fuelingPlan, eventFueling } from '../modules/extras.js';

registerView('more', (root) => {
  const items = [
    ['gym', 'Gym', 'Log sets, estimated 1RM, periodization', 'gym'], ['wellness', 'Wellness', 'Sleep, resting HR, HRV, readiness', 'heart'],
    ['coach', 'Coach', 'Claude analysis, notebook, weekly review', 'spark'], ['equipment', 'Equipment', 'Chain, tires, pads by kilometer', 'wrench'],
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
  const head = h('div', { class: 'page-head' }, h('h1', null, 'Equipment'), button('Add component', () => compDialog(null, bikes, odoFor), { primary: true, small: true, iconName: 'plus' }));
  const odoPanel = section('Odometer', h('div', { class: 'tiles compact' }, bikes.map(b => tile(units.distStr(odoFor(b) * 1000, 0), b, `${rides.filter(r => (r.bikeName || 'Bike') === b).length} rides`))), { sub: 'Distance from imported rides, per bike profile on the Magene' });
  const comps = state.equipment.slice().sort((a, b) => componentStatus(b, odoFor(b.bike || bikes[0] || 'Bike')).pct - componentStatus(a, odoFor(a.bike || bikes[0] || 'Bike')).pct);
  const list = comps.length ? h('div', { class: 'stack' }, comps.map(c => { const st = componentStatus(c, odoFor(c.bike || bikes[0] || 'Bike')); const t = COMPONENT_TYPES.find(x => x.key === c.type); return h('button', { class: `session comp ${st.state}`, onClick: () => compDialog(c, bikes, odoFor) }, h('span', { class: 'session-text' }, h('b', null, c.name || t?.label || c.type, ' ', st.state === 'due' ? pill('due', 'bad') : st.state === 'soon' ? pill('soon', 'warn') : null), h('small', null, `${c.bike || ''} · installed ${c.installedDate || '–'}${st.usedKm != null ? ` · ${st.usedKm.toFixed(0)} / ${st.limitKm} km` : ''}${st.usedDays != null ? ` · ${st.usedDays} / ${st.limitDays} days` : ''}`), progress(st.pct * 100, { color: st.state === 'due' ? '#D33A2F' : st.state === 'soon' ? '#E8731A' : '#2E9E4F' }))); })) : empty('Add your chain, tires and pads with the odometer reading when they were installed. Alerts appear on Home when service is due.');
  const guide = section('Service intervals', table(['Component', 'Typical', 'Rule'], COMPONENT_TYPES.map(t => [t.label, t.km ? `${t.km.toLocaleString()} km` : `${t.days} days`, h('span', { class: 'small' }, t.note)])), { sub: 'Defaults you can override per component. Wax lube and clean drivetrains stretch these; wet winter rides shorten them.' });
  root.append(head, odoPanel, section('Components', list), guide);
});
function compDialog(c, bikes, odoFor) {
  const typeSel = select(COMPONENT_TYPES.map(t => ({ value: t.key, label: t.label })), c?.type || 'chain');
  const bikeSel = select((bikes.length ? bikes : ['Bike']).map(b => ({ value: b, label: b })), c?.bike || bikes[0] || 'Bike');
  const name = input({ type: 'text', value: c?.name || '', placeholder: 'e.g. KMC X12' });
  const date = input({ type: 'date', value: c?.installedDate || todayIso() });
  const odo = input({ type: 'number', step: '1', value: c?.installedOdoKm ?? Math.round(odoFor(bikeSel.value)), placeholder: 'km' });
  const limKm = input({ type: 'number', value: c?.limitKm || '', placeholder: 'default' });
  const limDays = input({ type: 'number', value: c?.limitDays || '', placeholder: 'default' });
  const body = h('div', { class: 'grid-2' }, field('Type', typeSel), field('Bike', bikeSel), field('Name / model', name), field('Installed on', date), field('Odometer at install (km)', odo, 'Current odometer is pre-filled'), field('Replace after (km)', limKm), field('Replace after (days)', limDays));
  const actions = [{ label: 'Save', primary: true, onClick: async () => { await db.put('equipment', { id: c?.id || `c-${Date.now()}`, type: typeSel.value, bike: bikeSel.value, name: name.value, installedDate: date.value, installedOdoKm: +odo.value || 0, limitKm: +limKm.value || null, limitDays: +limDays.value || null }); await refreshData(); navigate('equipment'); } }];
  if (c) actions.unshift({ label: 'Delete', danger: true, onClick: async () => { await db.delete('equipment', c.id); await refreshData(); navigate('equipment'); } });
  modal(c ? 'Edit component' : 'Add component', body, { actions });
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
  root.append(h('div', { class: 'page-head' }, h('h1', null, 'Fueling')), calc, evPanel);
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
    h('p', { class: 'lead' }, 'Every term in RideHQ in plain English. Tap the small ? next to any number in the app to see its entry.'),
    input({ type: 'search', placeholder: 'Search, e.g. TSS, form, cadence', id: 'gloss-q', onInput: e => { q = e.target.value.trim().toLowerCase(); draw(); } }),
    list);
});
