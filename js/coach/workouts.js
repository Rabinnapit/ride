// RiderHQ — structured workout library, planned-load math and exports (.zwo / .mrc).
// Segments: {dur (s), lo, hi (fraction of FTP; ramp when lo != hi), cad (rpm, optional), text (optional), kind}

const S = (dur, p, extra = {}) => ({ dur, lo: p, hi: p, ...extra });
const ramp = (dur, lo, hi, extra = {}) => ({ dur, lo, hi, ...extra });
const reps = (n, on, off, lastOff = true) => { const out = []; for (let i = 0; i < n; i++) { out.push({ ...on, text: on.text || `Interval ${i + 1} of ${n}` }); if (i < n - 1 || lastOff) out.push({ ...off, text: off.text || 'Recover' }); } return out; };
const warm = (m = 10) => ramp(m * 60, 0.45, 0.70, { text: 'Warm up — build gradually, light gear' });
const cool = (m = 8) => ramp(m * 60, 0.65, 0.40, { text: 'Cool down — spin easy' });

export const CATEGORY = {
  recovery: { label: 'Recovery', zone: 1, color: '#7589A8' },
  endurance: { label: 'Endurance', zone: 2, color: '#1A63C9' },
  tempo: { label: 'Tempo', zone: 3, color: '#2E9E4F' },
  sweetspot: { label: 'Sweet spot', zone: 3.5, color: '#2E9E4F' },
  threshold: { label: 'Threshold', zone: 4, color: '#D4A106' },
  vo2: { label: 'VO2max', zone: 5, color: '#E8731A' },
  anaerobic: { label: 'Anaerobic', zone: 6, color: '#D33A2F' },
  sprint: { label: 'Sprint', zone: 7, color: '#7B3FBF' },
  climbing: { label: 'Climbing', zone: 4, color: '#D4A106' },
  test: { label: 'Test', zone: 4, color: '#1B2733' },
  opener: { label: 'Opener', zone: 3, color: '#2E9E4F' },
};

/** Workout definitions. `build(min)` returns segments for the requested duration (minutes). */
export const WORKOUTS = [
  { id: 'rec30', name: 'Recovery spin', cat: 'recovery', min: [30, 45], why: 'Flush the legs; keep HR low. Conversation pace.',
    build: m => [S(m * 60, 0.50, { cad: 90, text: 'Easy — if it feels like work, back off' })] },
  { id: 'z2', name: 'Endurance ride', cat: 'endurance', min: [45, 60, 90, 120, 150, 180, 210, 240, 300], why: 'Aerobic base: mitochondria, fat oxidation, durability. The engine behind every long day.',
    build: m => [warm(8), S((m - 14) * 60, 0.65, { cad: 85, text: 'Steady Z2 — nose-breathing effort, 85–95 rpm' }), cool(6)] },
  { id: 'z2cad', name: 'Endurance + cadence drills', cat: 'endurance', min: [45, 60, 75, 90], why: 'Z2 with spin-ups to smooth the pedal stroke and raise your natural cadence.',
    build: m => [warm(8), S(10 * 60, 0.62, { cad: 90 }), ...reps(6, S(60, 0.70, { cad: 105, text: 'Spin-up: 100–110 rpm, stay smooth, no bouncing' }), S(120, 0.60, { cad: 85 })), S(Math.max(1, m - 8 - 10 - 18 - 6) * 60, 0.65, { cad: 90, text: 'Back to steady Z2' }), cool(6)] },
  { id: 'longtempo', name: 'Long ride with tempo blocks', cat: 'endurance', min: [150, 180, 210, 240, 270, 300], why: 'Long Z2 with tempo in the second hour — teaches you to push when tired, the core skill of a 6-day tour.',
    build: m => { const blocks = m >= 240 ? 3 : 2; const rest = m - 10 - 60 - blocks * 20 - 8; return [warm(10), S(60 * 60, 0.65, { cad: 88, text: 'Hour 1: steady Z2, eat and drink' }), ...reps(blocks, S(15 * 60, 0.82, { cad: 85, text: 'Tempo block — strong but controlled' }), S(5 * 60, 0.60)), S(Math.max(10, rest) * 60, 0.63, { text: 'Finish steady; keep fueling' }), cool(8)]; } },
  { id: 'durability', name: 'Durability long ride', cat: 'endurance', min: [180, 210, 240, 270, 300, 330, 360], why: 'Sweet spot after 2+ hours in the saddle: builds the fatigue resistance a 100 km-per-day tour needs.',
    build: m => { const rest = m - 10 - 120 - 20 - 8; return [warm(10), S(120 * 60, 0.65, { cad: 88, text: 'Two hours Z2 — fuel 60 g carbs/h' }), S(20 * 60, 0.88, { cad: 85, text: 'Sweet spot on tired legs — hold it' }), S(Math.max(10, rest) * 60, 0.62, { text: 'Easy to finish' }), cool(8)]; } },
  { id: 'tempo2x20', name: 'Tempo 2×20', cat: 'tempo', min: [60, 75, 90], why: 'Muscular endurance at a sustainable hard-ish effort.',
    build: m => [warm(8), ...reps(2, S(20 * 60, 0.82, { cad: 85, text: 'Tempo — breathing deeper, still rhythmic' }), S(4 * 60, 0.55)), S(Math.max(0, m - 8 - 48 - 4) * 60, 0.60), cool(4)] },
  { id: 'tempo45', name: 'Tempo 2×12 (45 min)', cat: 'tempo', min: [45], why: 'A weekday tempo dose: muscular endurance without the recovery cost of threshold.',
    build: () => [warm(8), ...reps(2, S(12 * 60, 0.83, { cad: 85, text: 'Tempo — strong but conversational in short sentences' }), S(4 * 60, 0.55)), S(1 * 60, 0.60), cool(4)] },
  { id: 'ss3x12', name: 'Sweet spot 3×12', cat: 'sweetspot', min: [60, 75], why: 'The most time-efficient FTP builder for 45–75 minute windows.',
    build: m => [warm(8), ...reps(3, S(12 * 60, 0.90, { cad: 88, text: 'Sweet spot — 88–93% FTP' }), S(4 * 60, 0.55)), S(Math.max(0, m - 8 - 48 - 4) * 60, 0.60), cool(4)] },
  { id: 'ss2x20', name: 'Sweet spot 2×20', cat: 'sweetspot', min: [75, 90], why: 'Longer sweet-spot blocks — threshold durability.',
    build: m => [warm(10), ...reps(2, S(20 * 60, 0.90, { cad: 88, text: 'Sweet spot — settle in, hold form' }), S(6 * 60, 0.55)), S(Math.max(0, m - 10 - 52 - 8) * 60, 0.60), cool(8)] },
  { id: 'ss45', name: 'Sweet spot 2×10 (45 min)', cat: 'sweetspot', min: [45], why: 'A 45-minute sweet-spot dose for weekday mornings.',
    build: () => [warm(8), ...reps(2, S(10 * 60, 0.90, { cad: 88, text: 'Sweet spot — 88–93% FTP' }), S(4 * 60, 0.55)), S(5 * 60, 0.60), cool(4)] },
  { id: 'lowcad', name: 'Low-cadence climbing sweet spot', cat: 'climbing', min: [45, 60, 75], why: 'Big gear, 55–65 rpm, sweet-spot power: the specific strength for steep 10% ramps.',
    build: m => { const n = m >= 75 ? 5 : m >= 60 ? 4 : 3; const wu = m >= 75 ? 10 : m >= 60 ? 8 : 6; const cd = m - wu - n * 12; return [warm(wu), ...reps(n, S(8 * 60, 0.90, { cad: 60, text: 'Seated, 55–65 rpm, hands on tops — like a steep ramp' }), S(4 * 60, 0.55, { cad: 90 })), cool(Math.max(3, cd))]; } },
  { id: 'biggear', name: 'Big-gear force intervals', cat: 'climbing', min: [45, 60], why: 'Force production at very low cadence — pairs with your gym work.',
    build: m => { const n = m >= 60 ? 6 : 4; return [warm(8), ...reps(n, S(5 * 60, 0.83, { cad: 52, text: 'Seated, 50–55 rpm, drive from the hips, light upper body' }), S(3 * 60, 0.55, { cad: 95 })), cool(Math.max(4, m - 8 - n * 8))]; } },
  { id: 'climbsim', name: 'Climb simulation 3×10', cat: 'climbing', min: [60, 75], why: 'Ten-minute climbs at 85–92% with standing surges — rehearses the hills on the 4 Rivers path.',
    build: m => [warm(8), ...[0, 1, 2].flatMap(i => [S(8 * 60, 0.88, { cad: 68, text: `Climb ${i + 1}: seated, 65–70 rpm` }), S(2 * 60, 0.98, { cad: 60, text: 'Stand for the final 2 min' }), S(5 * 60, 0.55, { text: 'Recover' })]), S(Math.max(0, m - 8 - 45 - 4) * 60, 0.60), cool(4)] },
  { id: 'hillreps', name: 'Hill repeats (outdoor)', cat: 'climbing', min: [60, 75, 90], why: 'Real hills: 3–5 min climbs near threshold, mixing seated and standing.',
    build: m => { const n = m >= 90 ? 8 : m >= 75 ? 6 : 5; return [warm(15), ...reps(n, S(4 * 60, 1.00, { cad: 70, text: 'Climb hard — seated 3 min, stand the last minute' }), S(4 * 60, 0.50, { text: 'Roll back down, easy' })), cool(Math.max(5, m - 15 - n * 8))]; } },
  { id: 'thr2x20', name: 'Threshold 2×20', cat: 'threshold', min: [75, 90], why: 'The classic FTP session: two 20-minute efforts at 95–100%.',
    build: m => [warm(10), ...reps(2, S(20 * 60, 0.97, { cad: 90, text: 'Threshold — steady, 95–100% FTP' }), S(7 * 60, 0.50)), S(Math.max(0, m - 10 - 54 - 6) * 60, 0.60), cool(6)] },
  { id: 'thr3x10', name: 'Threshold 3×10', cat: 'threshold', min: [60, 75], why: 'Threshold in digestible 10-minute blocks.',
    build: m => [warm(8), ...reps(3, S(10 * 60, 0.98, { cad: 90, text: 'Threshold' }), S(5 * 60, 0.50)), S(Math.max(0, m - 8 - 45 - 6) * 60, 0.60), cool(6)] },
  { id: 'overunder', name: 'Over-unders 3×9', cat: 'threshold', min: [60, 75], why: 'Alternating 95% / 105% teaches lactate clearance for surging climbs.',
    build: m => { const block = () => [S(120, 0.95, { text: 'Under — 95%' }), S(60, 1.06, { text: 'Over — 106%' }), S(120, 0.95, { text: 'Under' }), S(60, 1.06, { text: 'Over' }), S(120, 0.95, { text: 'Under' }), S(60, 1.06, { text: 'Over' })]; return [warm(10), ...[0, 1, 2].flatMap(i => [...block(), S(5 * 60, 0.50, { text: 'Recover' })]), S(Math.max(0, m - 10 - 42 - 8) * 60, 0.60), cool(8)]; } },
  { id: 'vo2_5x4', name: 'VO2max 5×4', cat: 'vo2', min: [60, 75], why: 'Raises the aerobic ceiling; 4-minute efforts at 110–118%.',
    build: m => [warm(12), ...reps(5, S(4 * 60, 1.14, { cad: 95, text: 'VO2max — hard, breathe big' }), S(4 * 60, 0.50)), S(Math.max(0, m - 12 - 40 - 8) * 60, 0.60), cool(8)] },
  { id: 'vo2_45', name: 'VO2max 4×3 (45 min)', cat: 'vo2', min: [45], why: 'Compact VO2max dose for a weekday morning.',
    build: () => [warm(10), ...reps(4, S(3 * 60, 1.15, { cad: 95, text: 'VO2max — hard' }), S(3 * 60, 0.50)), S(3 * 60, 0.60), cool(8)] },
  { id: 'vo2_3030', name: '30/30s — 3 sets of 10', cat: 'vo2', min: [60], why: 'Short on/offs accumulate VO2max time with less mental cost.',
    build: () => [warm(12), ...[0, 1, 2].flatMap(() => [...reps(10, S(30, 1.20, { text: 'ON — 120%' }), S(30, 0.50, { text: 'off' })), S(4 * 60, 0.50, { text: 'Set recovery' })]), cool(6)] },
  { id: 'anaer8x1', name: 'Anaerobic 8×1', cat: 'anaerobic', min: [60], why: 'One-minute efforts at 130%: repeatability for punchy ramps.',
    build: () => [warm(12), ...reps(8, S(60, 1.30, { text: 'All in for one minute' }), S(3 * 60, 0.45)), S(8 * 60, 0.60), cool(8)] },
  { id: 'sprints', name: 'Sprints 6×15 s', cat: 'sprint', min: [45, 60], why: 'Neuromuscular power and leg speed.',
    build: m => [warm(10), ...reps(6, S(15, 1.80, { text: 'Max sprint — seated start, then stand' }), S(4 * 60 - 15, 0.50)), S(Math.max(1, m - 10 - 24 - 6) * 60, 0.60), cool(6)] },
  { id: 'ftp20', name: 'FTP test — 20 minute', cat: 'test', min: [70], why: 'Allen/Coggan protocol. FTP = 95% of the 20-min average. Zero-offset the power meter first.',
    build: () => [warm(15), ...reps(3, S(60, 1.05, { cad: 100, text: 'Fast pedalling 100 rpm' }), S(60, 0.55)), S(4 * 60, 0.60), S(5 * 60, 1.15, { text: '5-min all-out clearing effort' }), S(10 * 60, 0.55, { text: 'Easy recovery' }), S(20 * 60, 1.00, { text: '20-MIN TEST — even pace, hold as high as you can' }), cool(10)] },
  { id: 'ramp', name: 'FTP test — ramp', cat: 'test', min: [35], why: 'Starts easy and rises ~6% FTP per minute until you cannot continue. FTP = 75% of best 1-minute power.',
    build: () => [S(5 * 60, 0.46, { text: 'Warm up at 46%' }), ...Array.from({ length: 20 }, (_, i) => S(60, 0.52 + i * 0.06, { text: `Step ${i + 1}: ${Math.round((0.52 + i * 0.06) * 100)}%` })), cool(10)] },
  { id: 'opener', name: 'Opener', cat: 'opener', min: [40, 45], why: 'The day before a big ride: short, sharp, leaves you fresh.',
    build: m => [warm(10), S(5 * 60, 0.75), ...reps(3, S(60, 1.05, { cad: 95 }), S(2 * 60, 0.50)), S((m - 32) * 60, 0.65), cool(8)] },
];
export const workoutById = id => WORKOUTS.find(w => w.id === id);

/** Build the segment list (fixes any null segments). */
export function buildWorkout(id, minutes) {
  const w = workoutById(id); if (!w) return null;
  const fits = w.min.filter(x => x <= minutes + 5);
  const m = w.min.includes(minutes) ? minutes : fits.length ? fits[fits.length - 1] : w.min[0];
  const segs = (w.build(m) || []).filter(Boolean).filter(s => s.dur > 0);
  return { id: w.id, name: w.name, cat: w.cat, minutes: m, segments: segs, why: w.why, durationSec: segs.reduce((a, s) => a + s.dur, 0) };
}
export function plannedTss(segments) {
  let t = 0; for (const s of segments) { const f = (s.lo + s.hi) / 2; t += (s.dur / 3600) * f * f * 100; } return t;
}
export function plannedIf(segments) { const sec = segments.reduce((a, s) => a + s.dur, 0); return sec ? Math.sqrt(plannedTss(segments) / 100 / (sec / 3600)) : 0; }

/** Human-readable structure lines with watt targets. */
export function describeSegments(segments, ftp) {
  const out = []; let i = 0;
  while (i < segments.length) {
    const s = segments[i];
    // collapse repeats of identical on/off pairs
    let n = 1;
    if (i + 1 < segments.length) {
      const key = (a, b) => a.dur === b.dur && a.lo === b.lo && a.hi === b.hi;
      while (i + 2 * n + 1 < segments.length && key(segments[i + 2 * n], s) && key(segments[i + 2 * n + 1], segments[i + 1])) n++;
    }
    const w = (f) => ftp ? `${Math.round(f * ftp)} W` : `${Math.round(f * 100)}%`;
    const fmt = (seg) => seg.lo === seg.hi ? `${Math.round(seg.dur / 60)} min @ ${w(seg.lo)}${seg.cad ? ` · ${seg.cad} rpm` : ''}` : `${Math.round(seg.dur / 60)} min ramp ${w(seg.lo)} → ${w(seg.hi)}`;
    if (n > 1) { out.push(`${n} × (${fmt(s)} / ${fmt(segments[i + 1])})`); i += 2 * n; }
    else { out.push(fmt(s) + (s.text ? ` — ${s.text}` : '')); i++; }
  }
  return out;
}

export function toZwo(workout, { author = 'RiderHQ', ftp } = {}) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const lines = [];
  for (const s of workout.segments) {
    const cad = s.cad ? ` Cadence="${s.cad}"` : '';
    if (s.lo !== s.hi) lines.push(`    <Ramp Duration="${s.dur}" PowerLow="${s.lo.toFixed(2)}" PowerHigh="${s.hi.toFixed(2)}"${cad}/>`);
    else lines.push(`    <SteadyState Duration="${s.dur}" Power="${s.lo.toFixed(2)}"${cad}${s.text ? `>\n      <textevent timeoffset="0" message="${esc(s.text)}"/>\n    </SteadyState` : '/'}>`);
  }
  return `<workout_file>\n  <author>${esc(author)}</author>\n  <name>${esc(workout.name)}</name>\n  <description>${esc(workout.why || '')}${ftp ? ` (built for FTP ${ftp} W)` : ''}</description>\n  <sportType>bike</sportType>\n  <tags><tag name="RiderHQ"/><tag name="${esc(CATEGORY[workout.cat]?.label || workout.cat)}"/></tags>\n  <workout>\n${lines.join('\n')}\n  </workout>\n</workout_file>\n`;
}
export function toMrc(workout) {
  const rows = []; let t = 0;
  for (const s of workout.segments) {
    rows.push(`${(t / 60).toFixed(2)}\t${Math.round(s.lo * 100)}`);
    t += s.dur;
    rows.push(`${(t / 60).toFixed(2)}\t${Math.round(s.hi * 100)}`);
  }
  return `[COURSE HEADER]\nVERSION = 2\nUNITS = ENGLISH\nDESCRIPTION = ${workout.name}\nFILE NAME = ${workout.id}.mrc\nMINUTES PERCENT\n[END COURSE HEADER]\n[COURSE DATA]\n${rows.join('\n')}\n[END COURSE DATA]\n`;
}
