// RiderHQ — plain-language explanations for every number and term in the app.
import { h, modal } from './dom.js';

/** key → { term, what, good? } — written for someone new to cycling. */
export const GLOSSARY = {
  ftp: { term: 'FTP (Functional Threshold Power)', what: 'The highest power you can hold for about an hour, in watts. It is the anchor for every power zone, workout target and training-load number.', good: 'Tested with a 20-minute all-out effort: FTP ≈ 95% of that average. Retest every 6–8 weeks.' },
  wkg: { term: 'W/kg (watts per kilogram)', what: 'Power divided by body weight. On climbs this decides your speed more than raw watts.', good: 'Recreational riders: 2.0–2.5 fit beginner, 2.5–3.2 solid club rider, 3.2–4.0 strong amateur.' },
  np: { term: 'Normalized Power (NP)', what: 'An "effective" average power that accounts for surges. Hard bursts cost more than steady riding, so NP is higher than average power on stop-start rides.', good: 'Close to average power = steady ride. Much higher = lots of surges.' },
  avgpower: { term: 'Average power', what: 'Plain average of your power, counting the time you coast at 0 W (same as your Magene app).' },
  if: { term: 'Intensity Factor (IF)', what: 'How hard the ride was compared with your FTP: NP ÷ FTP.', good: 'Under 0.75 easy/endurance · 0.75–0.85 tempo · 0.85–0.95 hard · ~1.0 = a one-hour race effort.' },
  tss: { term: 'TSS (Training Stress Score)', what: 'One number for how much training a ride gave you, from duration × intensity². One hour at FTP = 100.', good: 'Under 150 recover by next day · 150–300 some fatigue next day · 300+ tired for a few days.' },
  hrtss: { term: 'hrTSS (heart-rate training stress)', what: 'TSS estimated from heart rate for rides without a power meter (your October rides). One hour at threshold heart rate = 100.' },
  load: { term: 'Training load', what: 'The stress score used for your fitness chart: TSS when power is available, hrTSS otherwise.' },
  vi: { term: 'Variability Index (VI)', what: 'NP ÷ average power — how even your pedaling effort was.', good: '1.00–1.05 very steady · 1.05–1.15 normal road ride · above 1.2 very stop-start.' },
  ef: { term: 'Efficiency Factor (EF)', what: 'Watts you produce per heartbeat (NP ÷ average HR). As your aerobic fitness grows, you make more power at the same heart rate, so EF rises.', good: 'Compare only similar easy rides. A rising trend over weeks = fitter.' },
  decoupling: { term: 'Aerobic decoupling', what: 'Compares the first and second half of a ride: if heart rate drifts up while power stays the same, your aerobic endurance is the limit.', good: 'Under 5% on rides over an hour = good endurance for that duration.' },
  ctl: { term: 'Fitness (CTL)', what: 'Your 6-week rolling average of daily training load. It rises slowly with consistent training and falls when you stop.', good: 'Beginners 20–40 · a 6-day tour wants about 55–70. Grow it 3–6 points per week.' },
  atl: { term: 'Fatigue (ATL)', what: 'Your 1-week rolling average of daily load — how tired recent training has made you. It rises and falls quickly.' },
  tsb: { term: 'Form (TSB)', what: 'Fitness minus fatigue (yesterday\'s values). Negative = you are carrying fatigue; positive = fresh.', good: '−10 to −30 productive training · −10 to +5 neutral · +5 to +25 fresh for an event · below −30 overreaching.' },
  ramp: { term: 'Ramp rate', what: 'How much your Fitness (CTL) changed in the last 7 days.', good: '+3 to +6 per week is sustainable; above +8 risks overdoing it.' },
  acwr: { term: 'Acute : chronic load', what: 'Last week\'s load compared with your last 4 weeks. Sudden spikes are when people get sick or hurt.', good: '0.8–1.3 sweet spot · above 1.5 spike — hold volume steady.' },
  monotony: { term: 'Monotony', what: 'How similar your daily loads are. Very similar days with no easy ones (high monotony) add stress.', good: 'Under 2 is fine.' },
  readiness: { term: 'Readiness', what: 'A 0–100 score for today from sleep, resting heart rate, HRV, how you feel and your form. It tells you whether to do the planned hard session.', good: '62+ go ahead · 45–61 ease off · under 45 rest or very easy.' },
  powerzones: { term: 'Power zones (Z1–Z7)', what: 'Seven intensity bands set from your FTP. Z1 recovery (<55%) · Z2 endurance (56–75%) · Z3 tempo (76–90%) · Z4 threshold (91–105%) · Z5 VO2max (106–120%) · Z6 anaerobic (121–150%) · Z7 sprint (>150%).', good: 'Most riding for endurance events belongs in Z2. Time in Z3–Z4 is "moderate", Z5+ is "hard".' },
  hrzones: { term: 'Heart-rate zones', what: 'Intensity bands from your heart rate, as % of max HR (same boundaries as your Magene app): Z1 relaxed <50% · Z2 50–60% · Z3 60–70% · Z4 70–80% · Z5 80–90% · Z6 90%+.', good: 'Long endurance rides should sit mostly in Z3–Z4 (about 110–146 bpm for you).' },
  threezone: { term: 'Easy / moderate / hard', what: 'Your time grouped into three bands: easy (below ~75% FTP), moderate (75–105% FTP) and hard (above 105% FTP).', good: 'Endurance training works best with about 80% easy. Lots of "moderate" means easy days are too hard.' },
  distribution: { term: 'Distribution type', what: 'The shape of your easy/moderate/hard mix. Polarized = mostly easy plus some hard · Pyramidal = easy > moderate > hard · Threshold = lots of moderate · Base = almost all easy · HIIT = lots of hard.', good: 'Polarized or pyramidal for base training.' },
  pi: { term: 'Polarization index', what: 'A single number describing how polarized (easy + hard, little moderate) your training is.', good: '2.0 or more = polarized.' },
  mmp: { term: 'Power curve', what: 'Your best average power for every duration, from 1 second to hours. Each point is your record for that length of effort in the chosen window.', good: 'The curve moving up over the months = you are getting stronger at that duration.' },
  profile: { term: 'Power profile', what: 'Your best 5-second, 1-minute, 5-minute and FTP power in W/kg, compared with standard rider categories. The weakest one is your limiter.' },
  eftp: { term: 'Estimated FTP', what: 'FTP estimated from your best efforts in the window, without a formal test. Treat it as a guide; a fresh 20-minute test is more reliable.' },
  cp: { term: 'Critical power (CP) and W′', what: 'CP is the power you can sustain for a long time (close to FTP). W′ ("W prime") is your limited battery of energy above CP — sprints and hard climbs drain it, easy riding refills it.' },
  wbal: { term: 'W′ balance', what: 'How full your above-threshold "battery" was during the ride. Dips show hard efforts; a deep dip means you nearly emptied it.' },
  cadence: { term: 'Cadence', what: 'Pedal revolutions per minute (rpm).', good: '85–95 rpm on flats saves your legs on long days; 70–80 seated on climbs.' },
  balance: { term: 'Left / right balance', what: 'Share of power from each leg.', good: '48/52 to 52/48 is normal. Above about 53/47 for weeks, check bike fit, cleats or a weaker leg.' },
  te: { term: 'Torque effectiveness', what: 'How much of each pedal stroke pushes forward rather than the other leg having to lift a "dead" leg.', good: 'Typically 60–100%; higher at higher power.' },
  ps: { term: 'Pedal smoothness', what: 'How evenly power is spread around each revolution (average ÷ peak).', good: '15–35% is typical; 100% is impossible.' },
  phase: { term: 'Power phase', what: 'The part of the pedal circle (in degrees, 0° = top) where you produce power. The darker "peak" arc is where most power happens.', good: 'Start around 335–350°, end around 190–230°, peak near the front of the stroke.' },
  standing: { term: 'Standing vs seated', what: 'Time out of the saddle and the power/cadence you used there. Standing gives more power on steep pitches but costs more energy.' },
  coasting: { term: 'Coasting', what: 'Time with zero power — freewheeling downhill, at lights or in traffic. Zone times exclude it, like your Magene app.' },
  vam: { term: 'VAM', what: 'Meters climbed per hour on a climb. It lets you compare climbing ability across different hills.', good: 'Recreational 400–700 · strong amateur 900–1,200 · pros 1,600+ m/h.' },
  climbcat: { term: 'Climb category', what: 'Difficulty of a climb from its length × gradient. Cat 4 is the easiest categorized climb, then Cat 3, 2, 1 and HC (hardest).' },
  kj: { term: 'Work (kJ) and calories', what: 'Kilojoules of work you did on the pedals. Because the body is ~22% efficient, kJ of work ≈ kcal burned.' },
  carbsph: { term: 'Carbs per hour', what: 'Grams of carbohydrate you took in per hour of riding, from gels, food and drinks. Your body stores only ~90 minutes of hard-riding fuel, so on longer rides what you eat sets how the last hour goes.', good: '30–60 g/h for rides of 1–2.5 hours; 60–90 g/h beyond that. Spread it out: something every 20–30 minutes.' },
  rpe: { term: 'RPE (perceived effort)', what: 'How hard the ride felt to you, from 1 (very easy) to 10 (maximal). It adds context to the numbers.' },
  lthr: { term: 'Threshold heart rate (LTHR)', what: 'The heart rate you can hold for about an hour all-out. Used for heart-rate zones and hrTSS. Yours is about 161–162 bpm.' },
  hrmax: { term: 'Max heart rate', what: 'The highest heart rate you reach. Yours is 183 bpm (Oct 31 ride).' },
  rhr: { term: 'Resting heart rate', what: 'Your heart rate at rest, best measured while sleeping. Several bpm above your normal = fatigue, stress or illness.' },
  hrv: { term: 'HRV (heart-rate variability)', what: 'The tiny variation between heartbeats. Higher than your normal = recovered; lower = stressed or tired. Compare only with your own baseline.' },
  sweetspot: { term: 'Sweet spot', what: 'Riding at 88–93% of FTP: hard but sustainable for 10–20 minute blocks. The most time-efficient way to raise FTP.' },
  tempo: { term: 'Tempo', what: '76–90% of FTP — "comfortably hard", breathing deeper but you can still talk in short sentences.' },
  endurance: { term: 'Endurance / Zone 2', what: '56–75% of FTP — conversational pace you could hold for hours. It builds the aerobic engine a multi-day tour needs.' },
  threshold: { term: 'Threshold', what: '91–105% of FTP — the hardest effort you can hold for 20–60 minutes.' },
  vo2: { term: 'VO2max intervals', what: '106–120% of FTP for 3–8 minutes. Very hard; raises your aerobic ceiling.' },
  recoveryweek: { term: 'Recovery week', what: 'Every fourth week the plan cuts volume by about 40% so your body absorbs the training. Fitness actually improves during these weeks.' },
  phasebase: { term: 'Training phases', what: 'Base builds aerobic fitness and strength · Build adds threshold, climbing and back-to-back days · Taper cuts volume before the event so you arrive fresh.' },
  e1rm: { term: 'Estimated 1RM', what: 'The heaviest weight you could lift once, estimated from a set (weight × (1 + reps ÷ 30)). Used to track strength progress without maxing out.' },
  rir: { term: 'Reps in reserve', what: 'How many more reps you could have done at the end of a set. "2 in reserve" means stop 2 reps before failure.' },
};

// Labels used in the app → glossary key (first match wins).
const MATCH = [
  [/^fitness\b|ctl/i, 'ctl'], [/^fatigue|atl\b/i, 'atl'], [/^form\b|tsb/i, 'tsb'], [/readiness/i, 'readiness'],
  [/^np w\/kg|w\/kg/i, 'wkg'], [/^np\b|normalized power/i, 'np'], [/hrtss/i, 'hrtss'], [/^tss\b|training stress/i, 'tss'], [/training load|^load$/i, 'load'],
  [/intensity distribution|easy \/ moderate|easy, moderate/i, 'threezone'], [/^intensity$|avg intensity|intensity factor/i, 'if'], [/variability/i, 'vi'],
  [/efficiency factor/i, 'ef'], [/decoupling/i, 'decoupling'], [/ctl ramp|ramp rate/i, 'ramp'], [/acute/i, 'acwr'], [/monotony/i, 'monotony'],
  [/power zones/i, 'powerzones'], [/heart-rate zones|hr zones/i, 'hrzones'], [/power curve|maximum average power/i, 'mmp'], [/power profile/i, 'profile'],
  [/estimated ftp/i, 'eftp'], [/w′ balance|w' balance/i, 'wbal'], [/^ftp|ftp history|ftp set/i, 'ftp'], [/cadence/i, 'cadence'], [/left \/ right|l\/r/i, 'balance'],
  [/torque/i, 'te'], [/smoothness/i, 'ps'], [/power phase/i, 'phase'], [/standing/i, 'standing'], [/coasting/i, 'coasting'], [/^vam|vam$/i, 'vam'],
  [/^avg w$|avg power|average power/i, 'avgpower'], [/kcal|work \(kj|^work$/i, 'kj'], [/perceived effort|rpe/i, 'rpe'], [/threshold hr|lactate threshold/i, 'lthr'],
  [/max heart rate/i, 'hrmax'], [/resting h/i, 'rhr'], [/hrv/i, 'hrv'], [/climbs?$/i, 'climbcat'], [/strength progress|1rm/i, 'e1rm'], [/where the time went|time in zones/i, 'powerzones'],
  [/fitness, fatigue/i, 'ctl'],
];
export function termFor(label) {
  const t = String(label || '').trim();
  for (const [re, key] of MATCH) if (re.test(t)) return key;
  return null;
}

export function explain(key) {
  const g = GLOSSARY[key]; if (!g) return;
  modal(g.term, h('div', { class: 'stack' }, h('p', null, g.what), g.good ? h('p', { class: 'gl-good' }, h('strong', null, 'What to look for: '), g.good) : null, h('a', { href: '#/glossary', class: 'small' }, 'All terms')));
}
/** Small "?" button that explains a term. */
export function infoBtn(key) {
  if (!GLOSSARY[key]) return null;
  return h('button', { class: 'info-btn', type: 'button', 'aria-label': `What is ${GLOSSARY[key].term}?`, onClick: (e) => { e.preventDefault(); e.stopPropagation(); explain(key); } }, '?');
}
/** Label text followed by an info button when the label is a known term. */
export function withInfo(label, key = null) {
  const k = key || termFor(label);
  const btn = k ? infoBtn(k) : null;
  return btn ? [label, ' ', btn] : [label];
}
