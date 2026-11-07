// RideHQ — strength training for cyclists: exercise library, periodised session templates, progression.

export const EXERCISES = {
  // Lower body
  backsquat: { name: 'Back squat', group: 'lower', cue: 'Half to parallel depth; drive up fast; brace like a hard pedal stroke.' },
  gobletsquat: { name: 'Goblet squat', group: 'lower', cue: 'Elbows inside knees at the bottom; chest tall.' },
  trapbar: { name: 'Trap-bar deadlift', group: 'lower', cue: 'Push the floor away; neutral spine; stand tall.' },
  rdl: { name: 'Romanian deadlift', group: 'lower', cue: 'Hinge at the hips, soft knees, bar close; feel the hamstrings.' },
  split: { name: 'Bulgarian split squat', group: 'lower', cue: 'Rear foot on bench; front shin vertical; control the descent.' },
  stepup: { name: 'Step-up', group: 'lower', cue: 'Knee-height box; drive through the whole foot; no push-off from the back leg.' },
  lunge: { name: 'Walking lunge', group: 'lower', cue: 'Long stride; torso upright; knee tracks over toes.' },
  hipthrust: { name: 'Hip thrust', group: 'lower', cue: 'Chin tucked; squeeze glutes hard at the top for a second.' },
  legpress: { name: 'Leg press', group: 'lower', cue: 'Feet mid-platform; full range without the hips lifting.' },
  slrdl: { name: 'Single-leg RDL', group: 'lower', cue: 'Hips square; reach long; balance before weight.' },
  calf: { name: 'Calf raise (straight + bent knee)', group: 'lower', cue: 'Full range; pause at the top; slow lowering.' },
  nordic: { name: 'Nordic curl (assisted)', group: 'lower', cue: 'Lower as slowly as you can; push back up if needed.' },
  copenhagen: { name: 'Copenhagen plank', group: 'core', cue: 'Top leg on bench; hips high; adductors working.' },
  // Upper body — holding the aero position
  row: { name: 'Bent-over row', group: 'upper', cue: 'Hinge 45°; pull elbows back; squeeze shoulder blades.' },
  cablerow: { name: 'Seated cable row', group: 'upper', cue: 'Chest up; elbows to hips; no shrugging.' },
  pulldown: { name: 'Lat pulldown / pull-up', group: 'upper', cue: 'Pull to the collarbone; lead with the elbows.' },
  pushup: { name: 'Push-up', group: 'upper', cue: 'Body in one line; elbows at 45°; full lockout.' },
  dbbench: { name: 'Dumbbell bench press', group: 'upper', cue: 'Shoulder blades pinned; press up and slightly in.' },
  cgbench: { name: 'Close-grip bench press', group: 'upper', cue: 'Hands shoulder-width; elbows tucked; triceps drive the lockout.' },
  pushdown: { name: 'Triceps pushdown', group: 'upper', cue: 'Elbows pinned to your sides; full extension; slow return.' },
  ohtri: { name: 'Overhead triceps extension', group: 'upper', cue: 'Elbows pointing forward; stretch at the bottom.' },
  dips: { name: 'Dips (bench or bar)', group: 'upper', cue: 'Shoulders down; stop at 90°; press through the heel of the hand.' },
  ohp: { name: 'Overhead press', group: 'upper', cue: 'Glutes tight; bar path straight; head through at the top.' },
  latraise: { name: 'Lateral raise', group: 'upper', cue: 'Lead with the elbows; stop at shoulder height; light weight.' },
  facepull: { name: 'Face pull', group: 'upper', cue: 'Rope to the forehead; elbows high; external rotation at the end.' },
  reardelt: { name: 'Rear-delt fly', group: 'upper', cue: 'Slight elbow bend; squeeze between the shoulder blades.' },
  farmer: { name: 'Farmer carry', group: 'upper', cue: 'Heavy dumbbells; tall posture; grip and traps — like holding the bars for hours.' },
  shrug: { name: 'Dumbbell shrug', group: 'upper', cue: 'Straight up; pause; slow down.' },
  curl: { name: 'Biceps curl (hammer)', group: 'upper', cue: 'Elbows still; control the lowering.' },
  wrist: { name: 'Wrist curls / plate pinch', group: 'upper', cue: 'Forearm endurance for long days on the hoods and drops.' },
  // Core & aero position
  aerohold: { name: 'Aero hold (forearm plank, hips back)', group: 'core', cue: 'Forearms on a bench, hips back like on the hoods; hold 60–90 s with a neutral neck.' },
  plank: { name: 'Front plank', group: 'core', cue: 'Ribs down; glutes on; breathe.' },
  sideplank: { name: 'Side plank', group: 'core', cue: 'Stack hips; press the floor away.' },
  deadbug: { name: 'Dead bug', group: 'core', cue: 'Low back pressed down; opposite arm and leg slow.' },
  birddog: { name: 'Bird dog', group: 'core', cue: 'Reach long; no rotation; pause 2 s.' },
  pallof: { name: 'Pallof press', group: 'core', cue: 'Resist the rotation; press slow; tall posture.' },
  kneeraise: { name: 'Hanging knee raise', group: 'core', cue: 'Control; no swing; exhale at the top.' },
  backext: { name: 'Back extension', group: 'core', cue: 'Hinge from the hips; squeeze glutes at the top; no hyperextension.' },
  bridge: { name: 'Glute bridge', group: 'core', cue: 'Heels close; squeeze at the top.' },
  // Mobility
  couch: { name: 'Couch stretch (hip flexors)', group: 'mobility', cue: '60–90 s per side; glute on; ribs down.' },
  nineties: { name: '90/90 hip switches', group: 'mobility', cue: 'Slow; tall spine; 10 per side.' },
  openbook: { name: 'Thoracic open book', group: 'mobility', cue: 'Side-lying; rotate the top arm; eyes follow the hand.' },
  catcamel: { name: 'Cat–camel', group: 'mobility', cue: 'Segment by segment; 10 slow reps.' },
  pigeon: { name: 'Pigeon stretch', group: 'mobility', cue: '60 s per side; breathe into the hip.' },
  hamfloss: { name: 'Hamstring floss', group: 'mobility', cue: 'Lying; straighten and bend the knee with a strap; 15 reps.' },
  bandwalk: { name: 'Banded lateral walks', group: 'mobility', cue: 'Knees out; athletic stance; 15 each way.' },
  clamshell: { name: 'Clamshell', group: 'mobility', cue: 'Hips stacked; 15 slow reps per side.' },
};

export const GYM_PHASES = {
  aa: { label: 'Anatomical adaptation', weeks: 'first 4 weeks', scheme: '2–3 sets × 12–15, moderate load, perfect form' },
  strength: { label: 'Max strength', weeks: 'winter block', scheme: '3–4 sets × 4–6, heavy (80–90% 1RM), fast concentric, full rest' },
  maintain: { label: 'Maintenance', weeks: 'build phase', scheme: '2–3 sets × 3–5, heavy, once a week' },
  taper: { label: 'Taper', weeks: 'last 2 weeks', scheme: 'light, 2 sets × 5, keep the pattern, no soreness' },
};

const ex = (key, sets, reps, note = '') => ({ key, name: EXERCISES[key].name, group: EXERCISES[key].group, sets, reps, note, cue: EXERCISES[key].cue });

/** Session templates by phase. A = lower + core, B = upper (aero position) + core, C = full body (maintenance). */
export const SESSIONS = {
  aa: {
    A: { title: 'Legs & core — adaptation', items: [ex('gobletsquat', 3, '12–15'), ex('rdl', 3, '12'), ex('split', 3, '10 / leg'), ex('stepup', 2, '10 / leg'), ex('calf', 3, '15'), ex('bridge', 2, '15'), ex('deadbug', 3, '10 / side'), ex('birddog', 3, '8 / side'), ex('aerohold', 3, '45 s')] },
    B: { title: 'Upper body & aero position — adaptation', items: [ex('pushup', 3, '12–15'), ex('cablerow', 3, '12'), ex('pulldown', 3, '12'), ex('ohp', 3, '10'), ex('pushdown', 3, '15'), ex('facepull', 3, '15'), ex('latraise', 2, '15'), ex('farmer', 3, '40 m'), ex('pallof', 3, '10 / side'), ex('sideplank', 3, '40 s / side'), ex('aerohold', 3, '60 s')] },
  },
  strength: {
    A: { title: 'Legs — max strength', items: [ex('backsquat', 4, '4–6', 'heavy; 2–3 min rest'), ex('trapbar', 3, '5', 'heavy'), ex('split', 3, '6 / leg', 'dumbbells'), ex('hipthrust', 3, '8'), ex('calf', 3, '8', 'heavy, slow'), ex('copenhagen', 3, '30 s / side'), ex('pallof', 3, '10 / side'), ex('aerohold', 3, '75 s')] },
    B: { title: 'Upper body & aero position — strength', items: [ex('cgbench', 4, '5', 'triceps focus'), ex('row', 4, '6'), ex('pulldown', 3, '6–8'), ex('ohp', 3, '6'), ex('dips', 3, '8–10'), ex('ohtri', 3, '10'), ex('facepull', 3, '15'), ex('farmer', 3, '40 m', 'heavy'), ex('kneeraise', 3, '10'), ex('plank', 3, '60 s'), ex('aerohold', 3, '90 s')] },
  },
  maintain: {
    C: { title: 'Full body — maintenance', items: [ex('backsquat', 3, '4', 'heavy but crisp'), ex('rdl', 3, '5'), ex('cgbench', 3, '6'), ex('row', 3, '6'), ex('pushdown', 2, '12'), ex('facepull', 2, '15'), ex('pallof', 2, '10 / side'), ex('aerohold', 3, '90 s')] },
    B: { title: 'Upper body & aero — maintenance', items: [ex('cgbench', 3, '6'), ex('cablerow', 3, '8'), ex('ohp', 3, '6'), ex('dips', 3, '8'), ex('facepull', 3, '15'), ex('farmer', 3, '40 m'), ex('sideplank', 3, '45 s / side'), ex('aerohold', 3, '90 s')] },
  },
  taper: {
    C: { title: 'Full body — taper', items: [ex('gobletsquat', 2, '5', 'light'), ex('rdl', 2, '5', 'light'), ex('pushup', 2, '10'), ex('cablerow', 2, '8'), ex('aerohold', 2, '60 s'), ex('deadbug', 2, '8 / side')] },
  },
};

export const MOBILITY = { title: 'Mobility — 12 minutes', items: [ex('couch', 1, '90 s / side'), ex('nineties', 1, '10 / side'), ex('openbook', 1, '10 / side'), ex('catcamel', 1, '10'), ex('pigeon', 1, '60 s / side'), ex('bandwalk', 1, '15 each way'), ex('clamshell', 1, '15 / side')] };

/** Epley estimated 1RM. */
export const e1rm = (w, reps) => reps > 0 ? w * (1 + reps / 30) : w;

/** Suggest next load from the last logged sets of an exercise (RIR = reps in reserve the user reported). */
export function progression(lastSets, fmt = kg => `${kg.toFixed(1)} kg`) {
  if (!lastSets?.length) return 'Start light; find a weight you can do all sets with 2 reps in reserve.';
  const allRir2 = lastSets.every(s => (s.rir ?? 2) >= 2);
  const anyFail = lastSets.some(s => (s.rir ?? 2) <= 0);
  const top = Math.max(...lastSets.map(s => s.weight || 0));
  if (anyFail) return `Keep ${fmt(top)} and nail every set before adding load.`;
  if (allRir2) return `Add 2.5–5 kg next time (${fmt(top + 2.5)}–${fmt(top + 5)}).`;
  return `Stay at ${fmt(top)}; add a rep per set.`;
}
