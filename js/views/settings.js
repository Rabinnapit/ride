// RideHQ — Settings (profile, FTP history, zones, units, event, schedule, AI, sync, backup, data) and How-to.
import { state, registerView, navigate, db, refreshData, recomputeAll, recomputePmc } from '../app.js';
import { h, icon, section, button, table, input, field, toast, select, kv, modal, confirmDialog, downloadFile, pill } from '../ui/dom.js';
import { getSettings, saveSettings, units, todayIso, fmtDate, hrmaxEstimate, ageAt, DAY_NAMES, currentFtp } from '../settings.js';
import { CLAUDE_MODELS, listGeminiModels } from '../ai/ai.js';
import { testConnection, pushAll, pullData, listRemoteRides, downloadRemote } from '../sync/github.js';
import { exportBackup, importBackup } from '../modules/extras.js';
import { importFile } from '../app.js';
import { storageEstimate } from '../db.js';

registerView('settings', (root) => {
  const s = getSettings();
  const num = v => v === '' || v == null ? null : +v;
  const recomputeNote = h('p', { class: 'small muted' }, 'Changes to FTP, HR values, weight or zone model recompute every ride automatically.');

  // ---- profile ----
  const p = s.profile;
  const prof = h('div', { class: 'grid-3' },
    field('Name', input({ type: 'text', value: p.name || '', onChange: e => saveSettings({ profile: { name: e.target.value } }) })),
    field('Date of birth', input({ type: 'date', value: p.dob || '', onChange: e => saveSettings({ profile: { dob: e.target.value } }).then(() => navigate('settings')) }), p.dob ? `Age ${ageAt(todayIso())} · Tanaka max HR ≈ ${hrmaxEstimate()}` : null),
    field('Sex (for HR formulas)', select([{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }], p.sex, { onChange: e => saveSettings({ profile: { sex: e.target.value } }) })),
    field('Height (cm)', input({ type: 'number', value: p.heightCm || '', onChange: e => saveSettings({ profile: { heightCm: num(e.target.value) } }) })),
    field(`Weight (${units.weight(1).u})`, input({ type: 'number', step: '0.1', value: p.weightKg ? units.weight(p.weightKg).v.toFixed(1) : '', onChange: e => withRecompute({ profile: { weightKg: e.target.value === '' ? null : units.weightToKg(+e.target.value) } }) }), 'Daily weights in Wellness override this by date'),
    field('Max heart rate', input({ type: 'number', value: p.hrmax || '', placeholder: String(hrmaxEstimate()), onChange: e => withRecompute({ profile: { hrmax: num(e.target.value) } }) }), `Highest seen in your rides: ${Math.max(0, ...state.rides.map(r => r.maxHr || 0)) || '–'}`),
    field('Resting heart rate', input({ type: 'number', value: p.hrrest || '', onChange: e => withRecompute({ profile: { hrrest: num(e.target.value) } }) }), 'Sleeping RHR from Fitbit'),
    field('Lactate threshold HR', input({ type: 'number', value: p.lthr || '', placeholder: p.hrmax ? String(Math.round(p.hrmax * 0.9)) : '', onChange: e => withRecompute({ profile: { lthr: num(e.target.value) } }) }), 'Avg HR of a 20-min all-out effort (Friel: last 20 of a 30-min TT)'),
    field("W′ (anaerobic capacity, J)", input({ type: 'number', value: p.wprime || 15000, onChange: e => withRecompute({ profile: { wprime: num(e.target.value) || 15000 } }) }), 'Default 15 kJ; the Analyze tab estimates it from your power curve'),
  );
  // FTP history
  const ftpRows = [...(p.ftpHistory || [])].sort((a, b) => b.date.localeCompare(a.date));
  const ftpBox = h('div', null,
    table(['Effective from', 'FTP', 'Note', ''], ftpRows.map(f => [f.date, `${f.ftp} W`, f.note || '', h('button', { class: 'icon-btn', 'aria-label': 'Delete', onClick: () => withRecompute({ profile: { ftpHistory: p.ftpHistory.filter(x => x !== f) } }) }, icon('trash'))])),
    h('div', { class: 'row' }, input({ type: 'date', value: todayIso(), id: 'ftp-date' }), input({ type: 'number', placeholder: 'FTP (W)', id: 'ftp-val', style: { maxWidth: '120px' } }), input({ type: 'text', placeholder: 'note (test type)', id: 'ftp-note' }), button('Add FTP', () => { const d = root.querySelector('#ftp-date').value, v = +root.querySelector('#ftp-val').value; if (!d || !v) { toast('Date and FTP needed', { error: true }); return; } withRecompute({ profile: { ftpHistory: [...(p.ftpHistory || []), { date: d, ftp: v, note: root.querySelector('#ftp-note').value }] } }); }, { primary: true, small: true })),
    h('p', { class: 'small muted' }, 'Each ride uses the FTP that was in force on its date, so old rides keep the right TSS when you improve.'),
  );
  const profilePanel = section('Rider profile', h('div', { class: 'stack' }, prof, h('h3', null, `FTP history (current ${currentFtp(s) || '–'} W)`), ftpBox, recomputeNote));

  // ---- zones & units ----
  const z = s.zones;
  const zonesPanel = section('Zones & units', h('div', { class: 'grid-3' },
    field('Heart-rate zone model', select([{ value: 'pctmax', label: '% of max HR (5 zones, like Magene)' }, { value: 'lthr', label: 'Coggan % of LTHR (5 zones)' }, { value: 'friel', label: 'Friel % of LTHR (7 zones)' }], z.hrModel, { onChange: e => withRecompute({ zones: { hrModel: e.target.value } }) })),
    field('Power zone time', select([{ value: 'true', label: 'Exclude coasting (0 W) — matches Magene' }, { value: 'false', label: 'Count coasting as zone 1' }], String(z.skipZero), { onChange: e => withRecompute({ zones: { skipZero: e.target.value === 'true' } }) })),
    field('Easy / moderate boundary (LT1, % FTP)', input({ type: 'number', step: '0.01', value: z.lt1Pct, onChange: e => withRecompute({ zones: { lt1Pct: +e.target.value || 0.75 } }) })),
    field('Moderate / hard boundary (LT2, % FTP)', input({ type: 'number', step: '0.01', value: z.lt2Pct, onChange: e => withRecompute({ zones: { lt2Pct: +e.target.value || 1.05 } }) })),
    field('Distance & speed', select([{ value: 'km', label: 'Kilometres' }, { value: 'mi', label: 'Miles' }], s.units.distance, { onChange: e => saveSettings({ units: { distance: e.target.value } }).then(() => navigate('settings')) })),
    field('Elevation', select([{ value: 'm', label: 'Metres' }, { value: 'ft', label: 'Feet' }], s.units.elevation, { onChange: e => saveSettings({ units: { elevation: e.target.value } }).then(() => navigate('settings')) })),
    field('Weight', select([{ value: 'lb', label: 'Pounds' }, { value: 'kg', label: 'Kilograms' }], s.units.weight, { onChange: e => saveSettings({ units: { weight: e.target.value } }).then(() => navigate('settings')) })),
    field('Temperature', select([{ value: 'F', label: 'Fahrenheit' }, { value: 'C', label: 'Celsius' }], s.units.temperature, { onChange: e => saveSettings({ units: { temperature: e.target.value } }).then(() => navigate('settings')) })),
    field('Theme', select([{ value: 'system', label: 'Follow device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], s.theme, { onChange: e => saveSettings({ theme: e.target.value }).then(() => location.reload()) })),
  ));

  // ---- goals & schedule ----
  const g = s.goals, ev = g.event, sc = s.schedule;
  const dayPick = (key, multi) => {
    const wrap = h('div', { class: 'daypick' });
    for (let d = 0; d < 7; d++) {
      const on = multi ? sc[key].includes(d) : sc[key] === d;
      wrap.appendChild(h('button', { class: `seg ${on ? 'active' : ''}`, type: 'button', onClick: async () => { if (multi) { const set = new Set(sc[key]); set.has(d) ? set.delete(d) : set.add(d); await saveSettings({ schedule: { [key]: [...set].sort() } }); } else await saveSettings({ schedule: { [key]: d } }); navigate('settings'); } }, DAY_NAMES[d]));
    }
    return wrap;
  };
  const goalPanel = section('Goal event & schedule', h('div', { class: 'stack' },
    h('div', { class: 'grid-3' },
      field('Event name', input({ type: 'text', value: ev.name, onChange: e => saveSettings({ goals: { event: { name: e.target.value } } }) })),
      field('Event date', input({ type: 'date', value: ev.date, onChange: e => saveSettings({ goals: { event: { date: e.target.value } } }).then(() => navigate('settings')) })),
      field('Total distance (km)', input({ type: 'number', value: ev.distanceKm, onChange: e => saveSettings({ goals: { event: { distanceKm: +e.target.value } } }) })),
      field('Days', input({ type: 'number', value: ev.days, onChange: e => saveSettings({ goals: { event: { days: +e.target.value } } }) })),
      field('Steepest grade (%)', input({ type: 'number', value: ev.steepestGradePct, onChange: e => saveSettings({ goals: { event: { steepestGradePct: +e.target.value } } }) })),
      field('Target FTP (W)', input({ type: 'number', value: g.targetFtp || '', placeholder: currentFtp(s) ? String(Math.round(currentFtp(s) * 1.25)) : '', onChange: e => saveSettings({ goals: { targetFtp: num(e.target.value) } }) })),
    ),
    field('What you are training for', h('textarea', { class: 'input', rows: 2, onChange: e => saveSettings({ goals: { notes: e.target.value } }) }, g.notes || '')),
    h('div', { class: 'grid-2' },
      field('Long ride day', dayPick('longRideDay', false)), field('Second ride day', dayPick('secondRideDay', false)),
      field('Weekday ride days', dayPick('weekdayRideDays', true)), field('Gym days', dayPick('gymDays', true)), field('Rest days', dayPick('restDays', true)),
    ),
    h('div', { class: 'grid-3' },
      field('Weekday ride length (min)', input({ type: 'number', value: sc.weekdayRideMin, onChange: e => saveSettings({ schedule: { weekdayRideMin: +e.target.value || 45 } }) })),
      field('Gym session length (min)', input({ type: 'number', value: sc.gymMin, onChange: e => saveSettings({ schedule: { gymMin: +e.target.value || 60 } }) })),
      field('Hours per week available', input({ type: 'number', step: '0.5', value: sc.hoursPerWeek, onChange: e => saveSettings({ schedule: { hoursPerWeek: +e.target.value || 7 } }) })),
      field('Max intensity days / week', select([1, 2, 3].map(n => ({ value: n, label: String(n) })), sc.maxIntensityDays, { onChange: e => saveSettings({ schedule: { maxIntensityDays: +e.target.value } }) })),
      field('No outdoor rides below (°F)', input({ type: 'number', value: sc.outdoorMinTempF, onChange: e => saveSettings({ schedule: { outdoorMinTempF: +e.target.value } }) })),
      field('Indoor trainer available from', input({ type: 'date', value: sc.indoorAvailableFrom || '', onChange: e => saveSettings({ schedule: { indoorAvailableFrom: e.target.value || null } }) })),
      field('Weather location (lat, lon)', input({ type: 'text', value: `${s.location.lat}, ${s.location.lon}`, onChange: e => { const m = e.target.value.match(/(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)/); if (m) saveSettings({ location: { lat: +m[1], lon: +m[3] } }); } }), 'Default is Pyeongtaek'),
    ),
  ));

  // ---- AI ----
  const a = s.ai;
  const geminiModelSel = select([{ value: '', label: a.geminiModel ? a.geminiModel : 'Load models with your key…' }, ...(a.geminiModel ? [{ value: a.geminiModel, label: a.geminiModel }] : [])], a.geminiModel, { onChange: e => saveSettings({ ai: { geminiModel: e.target.value } }) });
  const aiPanel = section('AI coach', h('div', { class: 'stack' },
    field('Provider', select([{ value: 'gemini', label: 'Google Gemini (free tier / $10 monthly credit with Google AI Pro)' }, { value: 'claude', label: 'Anthropic Claude (API key, pay as you go)' }], a.provider, { onChange: e => saveSettings({ ai: { provider: e.target.value } }).then(() => navigate('settings')) })),
    a.provider === 'gemini' ? h('div', { class: 'grid-2' },
      field('Gemini API key', input({ type: 'password', value: a.geminiKey, autocomplete: 'off', onChange: e => saveSettings({ ai: { geminiKey: e.target.value.trim() } }) }), 'Google AI Studio → Get API key. Restrict it to the Generative Language API.'),
      field('Model', h('div', { class: 'row' }, geminiModelSel, button('Load models', async () => { try { const key = getSettings().ai.geminiKey; const models = await listGeminiModels(key); geminiModelSel.innerHTML = ''; for (const m of models) geminiModelSel.appendChild(h('option', { value: m.id, selected: m.id === getSettings().ai.geminiModel || (!getSettings().ai.geminiModel && /flash/i.test(m.id) && !/lite|8b/i.test(m.id)) }, m.label)); await saveSettings({ ai: { geminiModel: geminiModelSel.value } }); toast(`${models.length} models loaded`); } catch (err) { toast(err.message, { error: true, ms: 8000 }); } }, { small: true })), 'Flash models are fast and cheap; Pro models reason more deeply.'),
    ) : h('div', { class: 'grid-2' },
      field('Claude API key', input({ type: 'password', value: a.claudeKey, autocomplete: 'off', onChange: e => saveSettings({ ai: { claudeKey: e.target.value.trim() } }) }), 'platform.claude.com → API keys. Claude Pro chat does not include API credit; Max does.'),
      field('Model', select(CLAUDE_MODELS.map(m => ({ value: m.id, label: m.label })), a.claudeModel, { onChange: e => saveSettings({ ai: { claudeModel: e.target.value } }) })),
    ),
    h('p', { class: 'small muted' }, 'Keys are stored only in this browser (IndexedDB) and sent straight to the provider — never to GitHub or anywhere else. A ride analysis costs well under a cent on Flash/Haiku; set a spend cap in the provider console anyway.'),
  ));

  // ---- sync ----
  const sy = s.sync;
  const statusEl = h('p', { class: 'small muted' }, sy.lastPush ? `Last backup ${new Date(sy.lastPush).toLocaleString()}` : 'Not connected');
  const syncPanel = section('Backup to GitHub (private repo)', h('div', { class: 'stack' },
    h('div', { class: 'grid-3' },
      field('Repository owner', input({ type: 'text', value: sy.owner, placeholder: 'rabinnapit', onChange: e => saveSettings({ sync: { owner: e.target.value.trim() } }) })),
      field('Repository name', input({ type: 'text', value: sy.repo, onChange: e => saveSettings({ sync: { repo: e.target.value.trim() } }) })),
      field('Branch', input({ type: 'text', value: sy.branch, onChange: e => saveSettings({ sync: { branch: e.target.value.trim() || 'main' } }) })),
      field('Fine-grained token', input({ type: 'password', value: sy.token, autocomplete: 'off', onChange: e => saveSettings({ sync: { token: e.target.value.trim() } }) }), 'Contents: read & write on this one repository only'),
      field('Back up automatically after import', select([{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }], String(sy.autoPush), { onChange: e => saveSettings({ sync: { autoPush: e.target.value === 'true' } }) })),
    ),
    h('div', { class: 'row' },
      button('Test connection', async () => { try { const r = await testConnection(); toast(`Connected to ${r.name} (${r.private ? 'private' : 'PUBLIC — make it private!'})`, { ms: 6000 }); } catch (e) { toast(e.message, { error: true, ms: 8000 }); } }),
      button('Back up everything now', async () => { try { statusEl.textContent = 'Uploading…'; const n = await pushAll(state.rides, m => statusEl.textContent = m); statusEl.textContent = `Done — ${n} new ride file${n === 1 ? '' : 's'} uploaded`; toast('Backup complete'); } catch (e) { statusEl.textContent = e.message; toast(e.message, { error: true, ms: 8000 }); } }, { primary: true }),
      button('Restore from GitHub', async () => { if (!(await confirmDialog('Restore from GitHub?', 'Downloads rides and data that are missing on this device. Existing rides are kept.'))) return; try { statusEl.textContent = 'Listing…'; const pre = await pullData(); if (Array.isArray(pre.overrides) && pre.overrides.length) await db.setSetting('overrides', pre.overrides); if (pre.settings && !getSettings().profile.ftpHistory?.length) { const cur = getSettings(); await saveSettings({ ...pre.settings, ai: cur.ai, sync: cur.sync }); } const list = await listRemoteRides(); const have = new Set(state.rides.map(r => (getSettings().sync.pushed || {})[r.id]).filter(Boolean)); let n = 0; for (const f of list) { const base = f.path.replace(/\.fit$/, ''); if (have.has(base)) continue; statusEl.textContent = `Downloading ${f.name}`; const buf = await downloadRemote(f.path); const r = await importFile(buf, f.name, { silent: true }); if (!r.duplicate) n++; } const data = await pullData(); for (const [store, rows] of Object.entries({ wellness: data.wellness, plans: data.plans, gymlog: data.gymlog, equipment: data.equipment, planlog: data.planlog })) if (Array.isArray(rows) && rows.length) await db.bulkPut(store, rows); if (data.settings) { const cur = getSettings(); await saveSettings({ ...data.settings, ai: cur.ai, sync: cur.sync }); } await refreshData(); statusEl.textContent = `Restored ${n} ride${n === 1 ? '' : 's'}`; toast('Restore complete'); navigate('settings'); } catch (e) { statusEl.textContent = e.message; toast(e.message, { error: true, ms: 8000 }); } }),
    ),
    statusEl,
    h('details', null, h('summary', null, 'How to create the repo and token (2 minutes)'), h('ol', { class: 'steps' },
      h('li', null, 'On github.com, create a new repository named ', h('code', null, 'ridehq-data'), ' and set it to ', h('b', null, 'Private'), '. Your ride files contain GPS tracks that start at home — never put them in the public Pages repo.'),
      h('li', null, 'Settings → Developer settings → Personal access tokens → ', h('b', null, 'Fine-grained tokens'), ' → Generate new token.'),
      h('li', null, 'Repository access: ', h('b', null, 'Only select repositories'), ' → ridehq-data. Permissions: Repository permissions → ', h('b', null, 'Contents: Read and write'), '. Expiry: 1 year.'),
      h('li', null, 'Paste the token above, set owner to your GitHub username, then Test connection and Back up everything now.'),
      h('li', null, 'On another device: install the app, paste the same token, then Restore from GitHub.'),
    )),
  ), { sub: 'Raw .fit files plus summaries, wellness, plans, gym log and equipment. Keys are never uploaded.' });

  // ---- backup & data ----
  const storage = h('p', { class: 'small muted' }, 'Storage: …');
  storageEstimate().then(e => { if (e) storage.textContent = `Storage used: ${(e.usage / 1048576).toFixed(1)} MB of ${(e.quota / 1048576).toFixed(0)} MB available · ${state.rides.length} rides`; });
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onChange: async e => { const f = e.target.files[0]; if (!f) return; try { const obj = JSON.parse(await f.text()); const n = await importBackup(obj, { importRide: (buf, name) => importFile(buf, name, { silent: true }) }); await refreshData(); toast(`Backup restored (${n} rides)`); navigate('settings'); } catch (err) { toast(err.message, { error: true, ms: 8000 }); } e.target.value = ''; } });
  const dataPanel = section('Backup file & data', h('div', { class: 'stack' },
    h('div', { class: 'row' },
      button('Download backup (summaries)', async () => downloadFile(`ridehq-backup-${todayIso()}.json`, JSON.stringify(await exportBackup()), 'application/json'), { iconName: 'download' }),
      button('Download full backup (with .fit files)', async () => downloadFile(`ridehq-full-${todayIso()}.json`, JSON.stringify(await exportBackup({ includeFit: true })), 'application/json'), { iconName: 'download' }),
      button('Restore from backup file', () => fileIn.click(), { iconName: 'upload' }), fileIn,
    ),
    h('div', { class: 'row' },
      button('Recompute all rides', async () => { toast('Recomputing…'); await recomputeAll(); toast('Done'); navigate('settings'); }),
      button('Delete all data', async () => { if (await confirmDialog('Delete everything?', 'Removes all rides, wellness, plans, gym logs, equipment and settings from this device. Your GitHub backup is untouched.')) { for (const st of ['rides', 'streams', 'raw', 'wellness', 'plans', 'gymlog', 'equipment', 'ai', 'planlog', 'settings']) await db.clear(st); location.reload(); } }, { danger: true }),
    ),
    storage,
  ));

  root.append(h('div', { class: 'page-head' }, h('h1', null, 'Settings')), profilePanel, zonesPanel, goalPanel, aiPanel, syncPanel, dataPanel);

  async function withRecompute(patch) {
    await saveSettings(patch);
    toast('Recomputing rides…');
    await recomputeAll();
    recomputePmc();
    toast('Updated');
    navigate('settings');
  }
});

registerView('howto', (root) => {
  const li = (...c) => h('li', null, ...c);
  root.append(h('div', { class: 'page-head' }, h('h1', null, 'How to')),
    section('Get rides in', h('ol', { class: 'steps' },
      li(h('b', null, 'From the Magene C706 / OnelapFit app (phone):'), ' open the ride → share/export → choose ', h('b', null, 'FIT'), ' → pick ', h('b', null, 'RideHQ'), ' in the share sheet (install the app to your home screen first: browser menu → Add to Home screen). The file imports automatically.'),
      li(h('b', null, 'Any device:'), ' tap Import ride (or drag .fit files onto the page). You can select many files at once — duplicates are skipped.'),
      li(h('b', null, 'Zwift:'), ' zwift.com → My activities → open the ride → download .fit, or copy from Documents/Zwift/Activities on the PC. Virtual rides import with power, HR and cadence; the map is hidden.'),
      li(h('b', null, 'Missing history:'), ' export the rides you have in OnelapFit that are not here yet; the Performance chart only counts what has been imported.'),
    )),
    section('After each ride', h('ol', { class: 'steps' },
      li('Import the file. The ride opens with NP, TSS, zones, power curve, dynamics and climbs.'),
      li('Rate the effort (RPE) and add a note — the coach uses them.'),
      li('Tap ', h('b', null, 'Coach'), ' for an AI read of the ride; check ', h('b', null, 'Train → Focus'), ' for what to work on.'),
      li('Log wellness in the morning (sleep, resting HR, HRV from Fitbit) to get a readiness score.'),
    )),
    section('Training with the plan', h('ol', { class: 'steps' },
      li('Train → Generate 14-day plan. It reads your schedule, fitness, the weeks left to the event and the weather forecast (indoor when the 7 am temperature is under your cutoff).'),
      li('Open a workout to see steps with watt targets. Export ', h('b', null, '.zwo'), ' for Zwift (Documents/Zwift/Workouts/<Zwift ID>/) or ', h('b', null, '.mrc'), ' for other trainer apps. Outdoor: ride to the watt/HR targets on the C706 lap screen.'),
      li('Rides are matched to the plan by date; gym sessions are logged in the Gym tab.'),
      li('Regenerate every two weeks or whenever life changes. Recovery weeks come every fourth week — honour them.'),
    )),
    section('Keys and privacy', h('ul', null,
      li('Everything is computed in your browser and stored on this device. Nothing is sent anywhere unless you add a key: AI requests go straight to Google/Anthropic, backups go to your private GitHub repo.'),
      li('The public rabinnapit.github.io repo holds only the app code — never ride files.'),
      li('To use the app on a second device, install it there, paste the GitHub token, Restore from GitHub.'),
    )),
    section('Formulas (so you can check the maths)', h('ul', null,
      li('Normalized Power: 30-s rolling average, fourth power, averaged, fourth root. Short sensor gaps (≤ 10 s) count as 0 W, like your Magene app.'),
      li('IF = NP ÷ FTP · TSS = hours × IF² × 100 (moving time) · VI = NP ÷ average power · EF = NP ÷ average HR.'),
      li('hrTSS for HR-only rides: Banister TRIMP scaled so one hour at threshold HR = 100.'),
      li('Fitness (CTL) and fatigue (ATL): exponentially weighted daily load with 42- and 7-day constants; form (TSB) = yesterday\'s CTL − ATL.'),
      li('Power zones: Coggan 7 zones of FTP; HR zones: % of max HR by default (switch to LTHR models in Settings). Coasting is excluded from power-zone time by default.'),
      li('Easy/moderate/hard: below 75% FTP / 75–105% / above 105% (Intervals.icu mapping); polarisation index per Treff et al. 2019.'),
      li('Climbs: ≥ 300 m long, ≥ 20 m gain, ≥ 3% average; category from length × grade (Strava-style thresholds). VAM = metres climbed per hour.'),
      li('Readiness: HRV and resting HR versus your 60-day baseline, sleep, how you feel and form, weighted 30/15/20/15/20.'),
    )),
  );
});
export { fmtDate, kv, pill, modal };
