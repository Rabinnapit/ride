// RideHQ — Wellness: daily entry (sleep, resting HR, HRV, weight, how you feel) → readiness; trends.
import { state, registerView, navigate, db, refreshData, recomputePmc } from '../app.js';
import { h, icon, section, empty, button, table, input, field, toast, tile, select } from '../ui/dom.js';
import { lineChart } from '../ui/charts.js';
import { getSettings, saveSettings, units, todayIso, fmtDate, addDays } from '../settings.js';
import { readinessScore } from '../metrics/readiness.js';

registerView('wellness', (root) => {
  const s = getSettings();
  const today = todayIso();
  let date = today;
  const existing = () => state.wellness.find(w => w.date === date) || {};
  const form = h('form', { class: 'wellness-form', onSubmit: e => { e.preventDefault(); save(); } });
  const f = {};
  const build = () => {
    const w = existing();
    form.innerHTML = '';
    const scale = (key, label, lo, hi) => field(label, select([1, 2, 3, 4, 5].map(n => ({ value: n, label: `${n}${n === 1 ? ` — ${lo}` : n === 5 ? ` — ${hi}` : ''}` })), w[key] || 3, { onChange: e => f[key].v = +e.target.value }));
    f.date = { v: date }; f.sleepHours = { v: w.sleepHours ?? '' }; f.sleepQuality = { v: w.sleepQuality ?? 3 }; f.rhr = { v: w.rhr ?? '' }; f.hrv = { v: w.hrv ?? '' }; f.weight = { v: w.weightKg != null ? units.weight(w.weightKg).v.toFixed(1) : '' };
    f.soreness = { v: w.soreness ?? 3 }; f.fatigue = { v: w.fatigue ?? 3 }; f.stress = { v: w.stress ?? 3 }; f.mood = { v: w.mood ?? 3 }; f.motivation = { v: w.motivation ?? 3 }; f.notes = { v: w.notes ?? '' };
    form.append(
      h('div', { class: 'grid-3' },
        field('Date', input({ type: 'date', value: date, max: today, onChange: e => { date = e.target.value; build(); } })),
        field('Sleep (hours)', input({ type: 'number', step: '0.1', min: 0, max: 14, value: f.sleepHours.v, onInput: e => f.sleepHours.v = e.target.value, placeholder: 'from Fitbit' })),
        scale('sleepQuality', 'Sleep quality', 'poor', 'excellent'),
        field('Resting HR (bpm)', input({ type: 'number', min: 30, max: 120, value: f.rhr.v, onInput: e => f.rhr.v = e.target.value, placeholder: 'sleeping RHR' })),
        field('HRV (ms, rMSSD)', input({ type: 'number', min: 5, max: 250, value: f.hrv.v, onInput: e => f.hrv.v = e.target.value, placeholder: 'Fitbit HRV' })),
        field(`Weight (${units.weight(1).u})`, input({ type: 'number', step: '0.1', value: f.weight.v, onInput: e => f.weight.v = e.target.value })),
        scale('soreness', 'Muscle soreness', 'none', 'very sore'), scale('fatigue', 'Fatigue', 'fresh', 'exhausted'), scale('stress', 'Life stress', 'calm', 'very stressed'), scale('mood', 'Mood', 'low', 'great'), scale('motivation', 'Motivation to train', 'none', 'fired up'),
        field('Notes', input({ type: 'text', value: f.notes.v, onInput: e => f.notes.v = e.target.value, placeholder: 'illness, travel, alcohol…' })),
      ),
      h('div', { class: 'row' }, button('Save', save, { primary: true }), w.date ? button('Delete', async () => { await db.delete('wellness', w.date); await refreshData(); navigate('wellness'); }, { danger: true }) : null),
    );
  };
  async function save() {
    const num = v => v === '' || v == null ? null : +v;
    const rec = { date, sleepHours: num(f.sleepHours.v), sleepQuality: num(f.sleepQuality.v), rhr: num(f.rhr.v), hrv: num(f.hrv.v), weightKg: f.weight.v === '' ? null : units.weightToKg(+f.weight.v, s), soreness: num(f.soreness.v), fatigue: num(f.fatigue.v), stress: num(f.stress.v), mood: num(f.mood.v), motivation: num(f.motivation.v), notes: f.notes.v, updatedAt: new Date().toISOString() };
    await db.put('wellness', rec);
    if (rec.weightKg) await saveSettings({ profile: { weightKg: rec.weightKg } });
    if (rec.rhr && date === today) await saveSettings({ profile: { hrrest: rec.rhr } });
    await refreshData(); recomputePmc(); toast('Saved'); navigate('wellness');
  }
  build();

  const r = state.readiness;
  const readyPanel = section('Readiness today', r ? h('div', null, h('div', { class: 'tiles compact' }, tile(r.score, 'Score', r.band === 'green' ? 'green — go' : r.band === 'amber' ? 'amber — ease off' : 'red — rest', r.band)), h('p', null, r.advice), table(['Signal', 'Score'], r.parts.map(p => [p.label, `${p.pct}%`])), h('p', { class: 'small muted' }, 'Weights: HRV 30%, resting HR 15%, sleep 20%, how you feel 15%, training form 20%. Baselines use your last 60 days, so the first week is approximate.')) : empty('Log today to get a score.'));
  const entryPanel = section('Daily log', form, { sub: 'From your Fitbit Sense 2: sleep, sleeping resting HR and HRV. Then five quick 1–5 ratings.' });

  // trends
  const hist = state.wellness.slice(-60);
  const trendPanel = section('Last 60 days', hist.length >= 2 ? h('div', { class: 'grid-2' }, h('div', null, h('h3', null, 'Resting HR & HRV'), h('div', { class: 'w-hr' })), h('div', null, h('h3', null, `Weight (${units.weight(1).u})`), h('div', { class: 'w-wt' })), h('div', null, h('h3', null, 'Sleep (hours)'), h('div', { class: 'w-sl' })), h('div', null, h('h3', null, 'Readiness'), h('div', { class: 'w-rd' }))) : empty('Two or more days of entries draw the trends.'));
  if (hist.length >= 2) setTimeout(() => {
    const labels = hist.map(w => fmtDate(w.date));
    lineChart(trendPanel.querySelector('.w-hr'), labels, [{ label: 'Resting HR', data: hist.map(w => w.rhr), borderColor: '#D33A2F', backgroundColor: '#D33A2F', pointRadius: 3 }, { label: 'HRV (ms)', data: hist.map(w => w.hrv), borderColor: '#1A63C9', backgroundColor: '#1A63C9', pointRadius: 3 }], { height: 180, avg: true, avgDecimals: 0, avgLabel: 'Avg resting HR' });
    lineChart(trendPanel.querySelector('.w-wt'), labels, [{ label: 'Weight', data: hist.map(w => w.weightKg ? +units.weight(w.weightKg).v.toFixed(1) : null), borderColor: '#2E9E4F', backgroundColor: '#2E9E4F', pointRadius: 3 }], { height: 180, avg: true });
    lineChart(trendPanel.querySelector('.w-sl'), labels, [{ label: 'Sleep', data: hist.map(w => w.sleepHours), borderColor: '#7B3FBF', backgroundColor: '#7B3FBF', pointRadius: 3 }], { height: 180, yMin: 0, avg: true });
    const scores = hist.map((w, i) => { const pm = state.pmc.find(p => p.date === w.date); const sc = readinessScore(w, hist.slice(Math.max(0, i - 60), i), pm?.tsb); return sc ? sc.score : null; });
    lineChart(trendPanel.querySelector('.w-rd'), labels, [{ label: 'Readiness', data: scores, borderColor: '#E8731A', backgroundColor: '#E8731A', pointRadius: 3 }], { height: 180, yMin: 0, yMax: 100, avg: true, avgDecimals: 0 });
  }, 0);

  root.append(h('div', { class: 'page-head' }, h('h1', null, 'Wellness')), h('div', { class: 'grid-2' }, readyPanel, entryPanel), trendPanel);
});
export { icon, addDays };
