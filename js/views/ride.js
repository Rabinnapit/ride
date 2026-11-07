// RideHQ — ride detail: summary, map, streams, zones, power curve, dynamics, climbs, laps, AI analysis.
import { state, registerView, navigate, db, updateRide, deleteRide, recomputeRide, refreshData } from '../app.js';
import { h, icon, tile, section, empty, button, segmented, zoneBars, kv, table, modal, confirmDialog, toast, input, field, pill, downloadFile, h3i } from '../ui/dom.js';
import { withInfo } from '../ui/glossary.js';
import { streamsChart, routeMap, mmpChart, barsChart, lineChart, powerPhaseDonut, ZONE_COLORS } from '../ui/charts.js';
import { getSettings, units, fmtDuration, fmtNum, rideLocalDate, rideLocalTime, fmtDate, addDays, todayIso } from '../settings.js';
import { MMP_DURATIONS } from '../metrics/compute.js';
import { aggregate, ridesInRange } from '../metrics/aggregate.js';
import { CADENCE_BUCKETS } from '../metrics/zones.js';
import { askCoach, rideAnalysisPrompt, riderContext, aiConfigured, chatMessageForRide, syncReady } from '../ai/ai.js';
import { pushRide, pullCoachNotes } from '../sync/github.js';
import { buildFocus } from '../coach/focus.js';
import { fuelingPlan } from '../modules/extras.js';

const MMP_KEY = [5, 60, 300, 1200, 3600];

registerView('ride', (root, { id }) => {
  const r = state.rides.find(x => x.id === id);
  if (!r) { root.appendChild(empty('Ride not found.', button('Back to rides', () => navigate('rides')))); return; }
  const s = getSettings();
  const wkg = r.paramsUsed?.weightKg || s.profile.weightKg;
  const power = r.hasPower && r.powerValid !== false && Number.isFinite(r.np);
  let xMode = 'time', cleanup = null;

  const head = h('div', { class: 'page-head ride-head' },
    h('button', { class: 'icon-btn', onClick: () => history.length > 1 ? history.back() : navigate('rides'), 'aria-label': 'Back' }, icon('back')),
    h('div', { class: 'ride-title' }, h('h1', { contentEditable: 'true', spellcheck: 'false', onBlur: (e) => { const name = e.target.textContent.trim(); if (name && name !== r.name) updateRide(r.id, { name }); } }, r.name),
      h('div', { class: 'muted' }, `${fmtDate(rideLocalDate(r), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · ${rideLocalTime(r)} · ${r.deviceName || r.source}${r.bikeName ? ` · ${r.bikeName}` : ''}`, r.indoor ? pill('indoor') : null)),
    h('div', { class: 'page-actions' }, button('Analyze with Claude', () => askClaude(r), { iconName: 'spark', small: true, primary: true }), button('More', () => rideMenu(r), { small: true })),
  );

  // ---- display panel ----
  const disp = h('section', { class: 'display' },
    h('div', { class: 'display-row five' },
      cell(units.dist(r.distanceM).v.toFixed(2), units.dist(r.distanceM).u), cell(fmtDuration(r.timerSec), 'moving time'), cell(units.elevStr(r.ascentM), 'climbing'),
      power ? cell(Math.round(r.np), 'NP (W)') : cell(Number.isFinite(r.avgHr) ? Math.round(r.avgHr) : '–', 'avg HR'),
      cell(fmtNum(r.load), r.loadSource === 'power' ? 'TSS' : r.loadSource === 'hr' ? 'hrTSS' : 'load'),
    ),
    h('div', { class: 'display-row five' },
      cell(units.speedStr(r.avgSpeed, 1).split(' ')[0], `avg ${units.speed(0).u}`),
      power ? cell(Math.round(r.avgPower), 'avg W') : cell(Number.isFinite(r.maxHr) ? Math.round(r.maxHr) : '–', 'max HR'),
      power ? cell(r.if.toFixed(2), 'intensity') : cell(fmtNum(r.kcal), 'kcal'),
      power ? cell(r.vi.toFixed(2), 'variability') : cell(fmtDuration(r.elapsedSec), 'elapsed'),
      power ? cell((r.np / wkg).toFixed(2), 'NP W/kg') : cell(units.tempStr(r.avgTemp), 'avg temp'),
    ));

  const notes = [];
  if (r.powerSuspect || r.powerValid === false) notes.push(h('div', { class: 'alert warn static' }, icon('warn'), h('span', null, r.powerValid === false ? `Power data excluded from stats: ${r.powerNote || 'marked unreliable'}. ` : `Power looks unreliable: ${r.powerSuspectReason} `), button(r.powerValid === false ? 'Include power' : 'Exclude power', async () => { await recomputeRide(r, { powerValid: r.powerValid === false }); await refreshData(); navigate(`ride/${r.id}`); }, { small: true })));
  if (r.ftpSuspectLow) notes.push(h('div', { class: 'alert warn static' }, icon('info'), h('span', null, `Normalized power (${Math.round(r.np)} W) stayed above your FTP setting (${r.paramsUsed.ftp} W) for ${fmtDuration(r.timerSec, { short: true })}. By definition FTP is ~1-hour power, so the setting is probably low — retest when fresh.`)));

  // ---- map + streams ----
  const mapPanel = h('section', { class: 'panel' });
  const streamPanel = section('Ride data', h('div', { class: 'streams' }), { actions: segmented([{ value: 'time', label: 'Time' }, { value: 'dist', label: 'Distance' }], xMode, v => { xMode = v; drawStreams(); }) });
  let chartHandle = null;
  const drawStreams = async () => {
    const st = await db.get('streams', r.id); if (!st) return;
    const box = streamPanel.querySelector('.streams'); box.innerHTML = '';
    if (chartHandle) chartHandle.destroy();
    const keys = [power ? 'power' : null, 'hr', 'cad', 'speed', 'alt', 'temp'].filter(k => k && st.streams[k]);
    const spd = units.speed(1), sp = v => units.speed(v).v, tc = c => units.temp(c).v, el = m => units.elev(m).v;
    const stats = {
      power: { avg: r.avgPower, max: r.maxPower, note: 'includes coasting' },
      hr: { avg: r.avgHr, max: r.maxHr },
      cad: { avg: r.avgCad, max: r.maxCad, note: 'pedaling only' },
      speed: { avg: sp(r.avgSpeed), max: sp(r.maxSpeed), dec: 1 },
      alt: { min: el(r.minAlt), max: el(r.maxAlt), extra: `Climbing ${units.elevStr(r.ascentM)}` },
      temp: { avg: tc(r.avgTemp), min: tc(r.minTemp), max: tc(r.maxTemp) },
    };
    chartHandle = streamsChart(box, st.streams, keys, { xMode, tempConv: tc, speedConv: sp, altConv: el, stats, units: { speed: spd.u, alt: units.elev(1).u, temp: units.temp(0).u } });
  };
  db.get('streams', r.id).then(st => {
    if (!st) return;
    if (st.streams.lat && !r.virtual) { mapPanel.appendChild(h('div', { class: 'panel-head' }, h('h2', null, 'Route'), h('p', { class: 'panel-sub' }, power ? 'Colored by power zone' : 'Colored by heart-rate zone'))); const body = h('div', { class: 'panel-body' }); mapPanel.appendChild(body); routeMap(body, st.streams, { colorBy: power ? 'power' : 'hr', zones: power ? r.powerZones : r.hrZones }); }
    else mapPanel.remove();
    drawStreams();
  });

  // ---- zones ----
  const zonePanel = section('Time in zones', h('div', { class: 'grid-2' },
    power ? h('div', null, h3i(`Power zones (FTP ${r.paramsUsed.ftp} W)`, 'powerzones'), zoneBars(r.powerZones, r.tizPower, { fmtTime: fmtDuration }), h('p', { class: 'small muted' }, `${fmtDuration(r.coastingSec, { short: true })} coasting (${r.coastingPct.toFixed(0)}%) not counted — matches your Magene app. Change in Settings → Zones.`)) : null,
    r.tizHr ? h('div', null, h('h3', null, ...withInfo(`Heart-rate zones (${s.zones.hrModel === 'pctmax' ? `max ${r.paramsUsed.hrmax}` : `LTHR ${r.paramsUsed.lthr}`})`, 'hrzones')), zoneBars(r.hrZones, r.tizHr, { fmtTime: fmtDuration, unit: 'bpm' })) : null,
  ), { sub: r.tiz3 ? `Easy / moderate / hard: ${r.tiz3.map(v => (v / Math.max(1, r.tiz3.reduce((a, b) => a + b, 0)) * 100).toFixed(0)).join(' / ')} % → ${r.distributionClass}${Number.isFinite(r.polarizationIndex) ? ` (polarization index ${r.polarizationIndex.toFixed(2)})` : ''}` : null });

  // ---- power curve ----
  let curvePanel = null;
  if (power && r.mmp) {
    const best90 = aggregate(ridesInRange(state.rides.filter(x => !x.excluded && x.id !== r.id), addDays(rideLocalDate(r), -89), rideLocalDate(r))).mmp;
    const rows = MMP_KEY.map(d => { const i = MMP_DURATIONS.indexOf(d); const v = r.mmp[i]; const b = best90?.[i]; return [d < 60 ? `${d} s` : `${d / 60} min`, Number.isFinite(v) ? `${Math.round(v)} W` : '–', Number.isFinite(v) ? (v / wkg).toFixed(2) : '–', Number.isFinite(b) ? `${Math.round(b)} W` : '–', Number.isFinite(v) && Number.isFinite(b) && v > b ? pill('new best', 'good') : '']; });
    curvePanel = section('Power curve', h('div', null, h('div', { class: 'mmp-chart' }), table(['Duration', 'This ride', 'W/kg', 'Best 90 d', ''], rows)), { sub: 'Mean-maximal power versus your best of the previous 90 days' });
    setTimeout(() => mmpChart(curvePanel.querySelector('.mmp-chart'), MMP_DURATIONS, [{ label: 'This ride', values: r.mmp, color: '#E8731A', fill: true }, best90 ? { label: 'Best 90 days', values: best90, color: '#1A63C9', dash: true } : null].filter(Boolean)), 0);
  }
  // HR curve
  let hrCurve = null;
  if (r.mmpHr) { hrCurve = section('Maximum average heart rate', h('div', { class: 'mmp-chart' })); setTimeout(() => mmpChart(hrCurve.querySelector('.mmp-chart'), MMP_DURATIONS, [{ label: 'HR', values: r.mmpHr, color: '#D33A2F', fill: true }], { unit: 'bpm', fmtVal: v => `${Math.round(v)} bpm`, height: 200 }), 0); }

  // ---- dynamics ----
  let dynPanel = null;
  if (power && Number.isFinite(r.balanceLeft)) {
    dynPanel = section('Cycling dynamics', h('div', null,
      h('div', { class: 'tiles' },
        tile(`${r.balanceLeft.toFixed(0)} / ${r.balanceRight.toFixed(0)}`, 'Left / right balance', Math.abs(r.balanceLeft - 50) > 3 ? 'outside 47–53' : 'normal'),
        tile(`${r.teLeft?.toFixed(1) ?? '–'}% · ${r.teRight?.toFixed(1) ?? '–'}%`, 'Torque effectiveness L · R', 'typical 60–100%'),
        tile(`${r.psLeft?.toFixed(1) ?? '–'}% · ${r.psRight?.toFixed(1) ?? '–'}%`, 'Pedal smoothness L · R', 'typical 15–35%'),
        tile(fmtDuration(r.standingSec), 'Standing', `${r.standCount}× · seated ${fmtDuration(r.timerSec - r.standingSec, { short: true })}`),
      ),
      r.powerPhase ? h('div', { class: 'phases' }, powerPhaseDonut(r.powerPhase.left, { label: 'Left', color: '#2E9E4F' }), powerPhaseDonut(r.powerPhase.right, { label: 'Right', color: '#1A63C9' }), h('div', { class: 'phase-legend' }, h('p', null, h('strong', null, 'Power phase'), ' — crank angles where you push (lighter arc) and where most power lands (darker arc). Starts near 335° and ends near 190° are typical; a peak phase centered around 90° means you push through the front of the stroke.'))) : null,
      table(['', 'Seated', 'Standing'], [['Avg power', `${fmtNum(r.avgPowerSeated)} W`, `${fmtNum(r.avgPowerStanding)} W`], ['Avg cadence', `${fmtNum(r.avgCadSeated)} rpm`, `${fmtNum(r.avgCadStanding)} rpm`], ['Time', fmtDuration(r.timerSec - r.standingSec), fmtDuration(r.standingSec)]]),
    ));
  }

  // ---- cadence ----
  let cadPanel = null;
  if (r.cadHist) {
    cadPanel = section('Cadence', h('div', null, h('div', { class: 'tiles compact' }, tile(`${fmtNum(r.avgCad)} rpm`, 'Average cadence', 'pedaling only', '', 'cadence'), tile(`${fmtNum(r.maxCad)} rpm`, 'Max'), tile(`${(r.cadHist.slice(0, 2).reduce((a, b) => a + b.seconds, 0) / Math.max(1, r.cadHist.reduce((a, b) => a + b.seconds, 0)) * 100).toFixed(0)}%`, 'Below 70 rpm')), h('div', { class: 'cad-chart' })));
    setTimeout(() => barsChart(cadPanel.querySelector('.cad-chart'), r.cadHist.map(x => x.key), [{ label: 'Time', data: r.cadHist.map(x => +(x.seconds / 60).toFixed(1)), backgroundColor: r.cadHist.map(x => x.color) }], { height: 180, yTitle: 'minutes', legend: false }), 0);
  }

  // ---- aerobic efficiency & W'bal ----
  let effPanel = null;
  if (power && Number.isFinite(r.ef)) {
    const rows = [[withInfo('Efficiency factor (NP ÷ HR)', 'ef'), r.ef.toFixed(2)], Number.isFinite(r.decoupling) ? [withInfo('Aerobic decoupling', 'decoupling'), `${r.decoupling.toFixed(1)}% — ${r.decoupling < 5 ? 'good' : 'aerobic endurance still building'} (EF ${r.ef1.toFixed(2)} → ${r.ef2.toFixed(2)})`] : null, [withInfo('Work', 'kj'), `${fmtNum(r.workKj)} kJ ≈ ${fmtNum(r.kcal)} kcal`], Number.isFinite(r.wbalMin) ? [withInfo("W' balance minimum", 'wbal'), `${(r.wbalMin / 1000).toFixed(1)} kJ at ${fmtDuration(r.wbalMinAt)} (CP ${r.cpUsed} W, W' ${(r.wprimeUsed / 1000).toFixed(0)} kJ)${r.wbalMin < 0 ? ' — below zero means your FTP setting is too low' : ''}`] : null];
    effPanel = section('Aerobic efficiency & energy', h('div', null, kv(rows), r.wbalCurve ? h('div', { class: 'wbal-chart' }) : null));
    if (r.wbalCurve) setTimeout(() => lineChart(effPanel.querySelector('.wbal-chart'), r.wbalCurve.map((_, i) => fmtDuration(i * 10, { short: true })), [{ label: "W' balance (kJ)", data: r.wbalCurve.map(v => +(v / 1000).toFixed(2)), borderColor: '#D4A106', backgroundColor: '#D4A10622', fill: 'origin', pointRadius: 0 }], { height: 160, yTitle: 'kJ', legend: false }), 0);
  }

  // ---- climbs ----
  let climbPanel = null;
  if (r.climbs?.length) {
    climbPanel = section('Climbs', table(['#', 'At', 'Length', 'Gain', 'Avg', 'Max', 'Time', 'VAM', power ? 'Power' : 'HR', 'Cat'], r.climbs.map((c, i) => [i + 1, units.distStr(c.startDist, 1), units.distStr(c.lengthM, 2), units.elevStr(c.gainM), `${c.avgGrade.toFixed(1)}%`, `${c.maxGrade.toFixed(0)}%`, fmtDuration(c.seconds), `${Math.round(c.vam)} m/h`, power ? `${fmtNum(c.avgPower)} W (${(c.avgPower / wkg).toFixed(1)} W/kg)` : fmtNum(c.avgHr), c.category || '–'])), { sub: `${r.climbCount} detected (≥ 300 m at ≥ 3%) · ${fmtDuration(r.climbSec, { short: true })} climbing · ${units.elevStr(r.climbGainM)}` });
  } else if (r.terrain) climbPanel = section('Terrain', h('div', { class: 'tiles compact' }, tile(fmtDuration(r.terrain.upSec, { short: true }), 'Uphill (≥3%)'), tile(fmtDuration(r.terrain.flatSec, { short: true }), 'Flat'), tile(fmtDuration(r.terrain.downSec, { short: true }), 'Downhill'), power && Number.isFinite(r.terrain.avgPowerUp) ? tile(`${fmtNum(r.terrain.avgPowerUp)} W`, 'Avg power uphill') : null));

  // ---- laps ----
  let lapPanel = null;
  if (r.laps?.length > 1) lapPanel = section('Laps', table(['Lap', 'Time', 'Distance', 'Avg speed', 'Avg HR', power ? 'Avg W' : '', power ? 'NP' : '', 'Climb'].filter(Boolean), r.laps.map(l => [l.index, fmtDuration(l.timer), units.distStr(l.distance, 2), units.speedStr(l.avgSpeed), fmtNum(l.avgHr), power ? fmtNum(l.avgPower) : null, power ? fmtNum(l.np) : null, units.elevStr(l.ascent)].filter(x => x !== null))));

  // ---- fueling & conditions ----
  const fuel = fuelingPlan({ hours: r.timerSec / 3600, intensityIf: power ? r.if : 0.7, weightKg: wkg, tempF: Number.isFinite(r.avgTemp) ? r.avgTemp * 9 / 5 + 32 : 60 });
  const condPanel = section('Conditions & fueling', kv([
    ['Temperature', Number.isFinite(r.avgTemp) ? `${units.tempStr(r.minTemp)} – ${units.tempStr(r.maxTemp)} (avg ${units.tempStr(r.avgTemp)})` : '–'],
    ['Elapsed / moving', `${fmtDuration(r.elapsedSec)} / ${fmtDuration(r.timerSec)} (${fmtDuration(r.elapsedSec - r.timerSec, { short: true })} stopped)`],
    ['Energy', `${fmtNum(r.kcal)} kcal${power ? ' from power' : ' (device estimate)'}`],
    ['What this ride needed', `${fuel.carbsPerHour} g carbs/h (${fuel.carbsTotal} g total), ${fuel.fluidPerHour} ml/h fluid, ~${fuel.sodiumPerHour} mg sodium/h`],
    ['Sensors', (r.sensors || []).map(x => `${x.type}${x.name ? ` (${x.name})` : ''}`).join(', ') || '–'],
  ]));

  // ---- notes / RPE ----
  const rpeSel = h('select', { class: 'input', onChange: (e) => updateRide(r.id, { rpe: +e.target.value || null }) }, [h('option', { value: '' }, 'RPE…'), ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => h('option', { value: n, selected: r.rpe === n }, `${n} — ${['', 'very easy', 'easy', 'moderate', 'somewhat hard', 'hard', 'hard+', 'very hard', 'very hard+', 'extremely hard', 'max'][n]}`))]);
  const notesArea = h('textarea', { class: 'input', rows: 3, placeholder: 'How did it feel? Nutrition, wind, mechanicals…', onBlur: (e) => { if (e.target.value !== (r.notes || '')) updateRide(r.id, { notes: e.target.value }); } }, r.notes || '');
  const notePanel = section('Your notes', h('div', { class: 'stack' }, field('Perceived effort', rpeSel), field('Notes', notesArea)));

  // ---- AI analyses ----
  const aiPanel = section('Coach analysis', h('div', { class: 'ai-list' }), { actions: h('div', { class: 'row' },
    button('Analyze with Claude', () => askClaude(r), { primary: true, small: true, iconName: 'spark' }),
    syncReady() ? button('Get saved analysis', async () => { try { const n = await pullCoachNotes(); toast(n ? `${n} new note${n > 1 ? 's' : ''} from Claude` : 'No new notes yet'); navigate(`ride/${r.id}`); } catch (e) { toast(e.message, { error: true, ms: 8000 }); } }, { small: true, iconName: 'sync' }) : null,
    aiConfigured() ? button('Analyze with API key', () => analyzeWithAi(r), { small: true }) : null) });
  db.getAll('ai').then(all => { const mine = all.filter(a => a.rideId === r.id).sort((a, b) => b.ts.localeCompare(a.ts)); const box = aiPanel.querySelector('.ai-list'); if (!mine.length) box.appendChild(h('p', { class: 'muted small' }, syncReady() ? 'No analysis yet. Tap Analyze with Claude, paste the message in the chat, then Get saved analysis here.' : 'No analysis yet. Tap Analyze with Claude to send this ride to your coaching chat.')); for (const a of mine) box.appendChild(renderAnalysis(a)); });

  root.append(head, disp, ...notes, mapPanel, streamPanel, zonePanel, curvePanel, dynPanel, cadPanel, effPanel, climbPanel, hrCurve, lapPanel, condPanel, notePanel, aiPanel);
  return () => { if (chartHandle) chartHandle.destroy(); };
});

function cell(v, l, term = null) { return h('div', { class: 'display-cell' }, h('div', { class: 'dv' }, v), h('div', { class: 'dl' }, ...withInfo(l, term))); }

export function renderAnalysis(a) {
  const p = a.parsed;
  const box = h('article', { class: 'ai-card' }, h('div', { class: 'ai-meta' }, `${new Date(a.ts).toLocaleString()} · ${a.model}${a.usage ? ` · ${a.usage.input + a.usage.output} tokens` : ''}`));
  if (p?.headline) {
    box.append(h('h3', null, p.headline),
      p.keyInsights?.length ? h('ul', null, p.keyInsights.map(x => h('li', null, x))) : null,
      p.concerns?.length ? h('div', null, h('h4', null, 'Concerns'), h('ul', null, p.concerns.map(x => h('li', null, x)))) : null,
      p.focusNext14Days ? h('p', null, h('strong', null, 'Next 14 days: '), p.focusNext14Days) : null,
      p.planAdjustments?.length ? h('div', null, h('h4', null, 'Suggested plan changes'), h('ul', null, p.planAdjustments.map(x => h('li', null, h('strong', null, x.date), ` — ${x.change} `, h('span', { class: 'muted' }, `(${x.reason})`))))) : null,
      p.fuelingNote ? h('p', { class: 'small' }, h('strong', null, 'Fueling: '), p.fuelingNote) : null,
      p.body ? h('details', null, h('summary', null, 'Full analysis'), h('div', { class: 'md' }, ...markdownish(p.body))) : null,
      p.confidence ? h('p', { class: 'small muted' }, `Confidence: ${p.confidence}`) : null);
  } else box.appendChild(h('div', { class: 'md' }, ...markdownish(a.output || '')));
  return box;
}
export function markdownish(text) {
  const out = []; let list = null, listTag = '', tbl = null;
  for (const line of String(text).split('\n')) {
    const l = line.trim();
    if (/^\|.*\|$/.test(l)) {
      const cells = l.slice(1, -1).split('|').map(c => c.trim());
      if (cells.every(c => /^:?-+:?$/.test(c))) continue;
      if (!tbl) { tbl = h('table', { class: 'table' }); out.push(h('div', { class: 'table-wrap' }, tbl)); tbl.appendChild(h('tr', null, cells.map(c => h('th', { html: inline(c) })))); }
      else tbl.appendChild(h('tr', null, cells.map(c => h('td', { html: inline(c) }))));
      continue;
    }
    tbl = null;
    const ul = /^[-*•] /.test(l), ol = /^\d+\. /.test(l);
    if (ul || ol) { const tag = ul ? 'ul' : 'ol'; if (!list || listTag !== tag) { list = h(tag); listTag = tag; out.push(list); } list.appendChild(h('li', { html: inline(l.replace(/^([-*•]|\d+\.) /, '')) })); continue; }
    list = null;
    if (!l) continue;
    if (/^#{1,4} /.test(l)) out.push(h('h4', { html: inline(l.replace(/^#+ /, '')) }));
    else out.push(h('p', { html: inline(l) }));
  }
  return out;
}
function inline(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>'); }

/** Copy a message for the coaching chat (ride id when synced, full data otherwise) and offer the chat link. */
function askClaude(r) {
  const s = getSettings();
  const msg = chatMessageForRide(r, state.rides, s);
  let copied = false;
  try { navigator.clipboard.writeText(msg).then(() => { copied = true; status.textContent = 'Copied. Open the chat and paste it.'; }).catch(() => { status.textContent = 'Copy failed — select the text above and copy it.'; ta.select(); }); } catch { /* handled by the textarea */ }
  if (syncReady(s) && !(s.sync.pushed || {})[r.id]) pushRide(r).then(() => toast('Ride backed up for Claude')).catch(e => toast(`Backup failed: ${e.message}`, { error: true, ms: 8000 }));
  const ta = h('textarea', { class: 'input chat-msg', readOnly: true }, msg);
  const status = h('p', { class: 'small muted' }, 'Copying…');
  const link = h('a', { class: 'btn primary', href: s.coach?.chatUrl || 'https://claude.ai', target: '_blank', rel: 'noopener' }, 'Open Claude chat');
  modal('Analyze with Claude', h('div', { class: 'stack' },
    h('p', null, syncReady(s) ? 'This message points Claude at the ride in your backup repo, where your full history is.' : 'This message carries the ride and your ride history, because backup sync is not set up yet.'),
    ta, status, h('div', { class: 'row' }, link),
    h('p', { class: 'small muted' }, syncReady(s) ? 'Claude saves the analysis to the repo. Come back and tap Get saved analysis.' : 'Paste the analysis back as a ride note if you want to keep it here.'),
  ));
  void copied;
}

async function analyzeWithAi(r) {
  if (!aiConfigured()) { toast('Add an API key in Settings → AI coach first', { error: true }); navigate('settings'); return; }
  toast('Asking the coach…', { ms: 8000 });
  try {
    const s = getSettings();
    const rides = state.rides.filter(x => !x.excluded);
    const focus = buildFocus({ settings: s, rides, pmc: state.pmc, readiness: state.readiness, wellnessCount: state.wellness.length });
    const ctx = riderContext(s, { focus, pmcToday: state.pmc.find(p => p.date === todayIso()), readiness: state.readiness, plan: state.plan });
    const recent = ridesInRange(rides.filter(x => x.id !== r.id), addDays(rideLocalDate(r), -30), rideLocalDate(r));
    const rec = await askCoach({ kind: 'ride', user: rideAnalysisPrompt(r, recent, ctx), meta: { rideId: r.id } });
    toast('Analysis ready');
    navigate(`ride/${r.id}`);
    void rec;
  } catch (e) { toast(e.message, { error: true, ms: 8000 }); }
}

function rideMenu(r) {
  const body = h('div', { class: 'stack' },
    button(r.excluded ? 'Include in stats' : 'Exclude from stats', async () => { await updateRide(r.id, { excluded: !r.excluded }); m.close(); navigate(`ride/${r.id}`); }),
    r.hasPower ? button(r.powerValid === false ? 'Treat power data as valid' : 'Mark power data unreliable', async () => { await recomputeRide(r, { powerValid: r.powerValid === false }); await refreshData(); m.close(); navigate(`ride/${r.id}`); }) : null,
    button('Download original .fit', async () => { const raw = await db.get('raw', r.id); if (raw) downloadFile(raw.fileName || `${r.id}.fit`, new Blob([raw.buffer])); }),
    button('Recompute with current settings', async () => { await recomputeRide(r); await refreshData(); m.close(); navigate(`ride/${r.id}`); toast('Recomputed'); }),
    button('Delete ride', async () => { if (await confirmDialog('Delete ride?', 'This removes the ride, its data and the original file from this device.')) { await deleteRide(r.id); m.close(); navigate('rides'); } }, { danger: true }),
  );
  const m = modal(r.name, body);
}
export { zoneBars, CADENCE_BUCKETS, ZONE_COLORS };
