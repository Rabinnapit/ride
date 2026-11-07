// RideHQ — animated exercise demos. A stick figure in side (or front) view, posed by joint angles,
// tweened between the start position and the end of one rep. Pure SVG, no images.
//
// Angles are absolute segment directions in screen space: 0 = pointing down, 90 = forward (right),
// 180 = up, -90 = backward (left). Torso is measured hip → neck. L = far limbs (drawn lighter).

const LEN = { torso: 30, thigh: 22, shin: 22, ua: 14, fa: 13, hand: 4, foot: 7, head: 5.5 };
const FLOOR = 110;
const rad = d => d * Math.PI / 180;
const dir = a => [Math.sin(rad(a)), Math.cos(rad(a))];
const add = (p, a, l) => { const [dx, dy] = dir(a); return [p[0] + dx * l, p[1] + dy * l]; };

const STAND = { torso: 180, thighR: 0, shinR: 0, thighL: 0, shinL: 0, footR: 90, footL: 90, uaR: 0, faR: 0, uaL: 0, faL: 0, arch: 0, lift: 0 };

/** Forward kinematics from the hip; then translate so the anchor point sits at its target. */
function solve(pose, view) {
  const p = { ...STAND, ...pose };
  for (const k of ['thigh', 'shin', 'foot', 'ua', 'fa']) if (pose[k + 'R'] != null && pose[k + 'L'] == null) p[k + 'L'] = pose[k + 'R'];
  const hipC = [0, 0];
  const hw = view === 'front' ? 5 : 0, sw = view === 'front' ? 9 : 0;
  const J = {};
  J.hip = hipC;
  J.neck = add(hipC, p.torso, LEN.torso);
  J.head = add(J.neck, p.torso + (p.headTilt || 0), LEN.head + 1.5);
  const shoulder = [J.neck[0], J.neck[1] + 2 - (p.lift || 0)];
  for (const s of ['R', 'L']) {
    const sign = s === 'R' ? 1 : -1;
    const hip = [hipC[0] + sign * hw, hipC[1]];
    J['hip' + s] = hip;
    J['knee' + s] = add(hip, p['thigh' + s], LEN.thigh);
    J['ankle' + s] = add(J['knee' + s], p['shin' + s], LEN.shin);
    J['toe' + s] = add(J['ankle' + s], p['foot' + s], LEN.foot);
    const sh = [shoulder[0] + sign * sw, shoulder[1]];
    J['shoulder' + s] = sh;
    J['elbow' + s] = add(sh, p['ua' + s], LEN.ua);
    J['hand' + s] = add(J['elbow' + s], p['fa' + s], LEN.fa);
  }
  const [ak, at] = p.anchor || ['toeR', [86, FLOOR]];
  const off = [at[0] - J[ak][0], at[1] - J[ak][1]];
  for (const k of Object.keys(J)) J[k] = [J[k][0] + off[0], J[k][1] + off[1]];
  J.arch = p.arch || 0;
  return J;
}

// ---- prop drawing helpers (in solved coordinates) ----
const PROP = {
  floor: () => `<line x1="4" y1="${FLOOR}" x2="156" y2="${FLOOR}" class="fg-floor"/>`,
  bench: (x0, x1, y) => `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="5" rx="1.5" class="fg-prop"/><line x1="${x0 + 4}" y1="${y + 5}" x2="${x0 + 4}" y2="${FLOOR}" class="fg-prop-line"/><line x1="${x1 - 4}" y1="${y + 5}" x2="${x1 - 4}" y2="${FLOOR}" class="fg-prop-line"/>`,
  box: (x0, x1, y) => `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="${FLOOR - y}" rx="1.5" class="fg-prop"/>`,
  wall: x => `<line x1="${x}" y1="40" x2="${x}" y2="${FLOOR}" class="fg-prop-line"/>`,
  bar: (y, x0 = 40, x1 = 120) => `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" class="fg-prop-line" stroke-width="2.5"/>`,
};
const dumbbell = p => `<rect x="${p[0] - 4}" y="${p[1] - 2.2}" width="8" height="4.4" rx="1.5" class="fg-weight"/>`;
const plateBar = p => `<circle cx="${p[0]}" cy="${p[1]}" r="7" class="fg-weight"/><circle cx="${p[0]}" cy="${p[1]}" r="1.6" class="fg-hub"/>`;
const kettle = p => `<circle cx="${p[0]}" cy="${p[1] + 5}" r="5" class="fg-weight"/>`;
const cable = (p, to) => `<line x1="${to[0]}" y1="${to[1]}" x2="${p[0]}" y2="${p[1]}" class="fg-cable"/><circle cx="${to[0]}" cy="${to[1]}" r="2" class="fg-hub"/>`;

/**
 * Exercise definitions: start pose, end pose (one rep = start → end → start), view, props, and what the end position is called.
 * props(J) returns SVG drawn behind the figure; tool(J) is drawn in front (weights in hands).
 */
const sq = { thighR: 85, shinR: -25, footR: 90 };
const DEF = {
  gobletsquat: { a: { uaR: 20, faR: 165 }, b: { torso: 148, ...sq, uaR: 45, faR: 170 }, tool: J => kettle(J.handR), endLabel: 'Bottom of the squat' },
  backsquat: { a: { uaR: -35, faR: 165 }, b: { torso: 140, ...sq, uaR: -10, faR: 175 }, tool: J => plateBar([J.neck[0] - 3, J.neck[1] + 1]), endLabel: 'Bottom — hips at or just above knees' },
  trapbar: { a: { torso: 128, thighR: 72, shinR: -12, uaR: 3, faR: 3 }, b: {}, tool: J => plateBar(J.handR), endLabel: 'Lockout — stand tall', startLabel: 'Start — hips back, chest up' },
  rdl: { a: { uaR: 3, faR: 3 }, b: { torso: 98, thighR: 14, shinR: -6, uaR: 0, faR: 0 }, tool: J => plateBar(J.handR), endLabel: 'Hinged — bar below knees, back flat' },
  slrdl: { a: { thighL: -8, shinL: -12, footL: 60 }, b: { torso: 96, thighR: 10, shinR: -6, thighL: -92, shinL: -92, footL: 0 }, tool: J => dumbbell(J.handR), endLabel: 'Hinged on one leg — hips square' },
  split: { a: { thighR: 12, shinR: 0, thighL: -28, shinL: -100, footL: 180 }, b: { torso: 172, thighR: 80, shinR: -14, thighL: -8, shinL: -98, footL: 180 }, props: () => PROP.bench(18, 52, 80), tool: J => dumbbell(J.handR), endLabel: 'Bottom — back knee near the floor' },
  lunge: { a: {}, b: { torso: 176, thighR: 82, shinR: -4, thighL: -14, shinL: -82, footL: 175 }, tool: J => dumbbell(J.handR), endLabel: 'Bottom — both knees about 90°' },
  stepup: { a: { anchor: ['toeR', [104, 90]], thighR: 72, shinR: -10, thighL: -6, shinL: -8 }, b: { anchor: ['toeR', [104, 90]], thighL: -12, shinL: -40, footL: 70 }, props: () => PROP.box(82, 120, 90), tool: J => dumbbell(J.handR), endLabel: 'Top — standing tall on the box' },
  hipthrust: { a: { anchor: ['toeR', [116, FLOOR]], torso: -112, thighR: 130, shinR: -10, uaR: -95, faR: -95, headTilt: 70 }, b: { anchor: ['toeR', [116, FLOOR]], torso: -92, thighR: 95, shinR: -6, uaR: -95, faR: -95, headTilt: 80 }, props: () => PROP.bench(30, 70, 93), tool: J => plateBar([J.hip[0], J.hip[1] - 4]), endLabel: 'Top — hips level, squeeze' },
  bridge: { a: { anchor: ['neck', [40, 104]], torso: -90, thighR: 135, shinR: 10, uaR: -95, faR: -95, headTilt: 90 }, b: { anchor: ['neck', [40, 104]], torso: -62, thighR: 102, shinR: 8, uaR: -95, faR: -95, headTilt: 60 }, endLabel: 'Top — shoulders to knees in a line' },
  legpress: { a: { anchor: ['hip', [55, 92]], torso: -132, thighR: 112, shinR: 108, footR: 200, uaR: 10, faR: 40 }, b: { anchor: ['hip', [55, 92]], torso: -132, thighR: 158, shinR: 62, footR: 155, uaR: 10, faR: 40 }, props: () => `<line x1="20" y1="102" x2="70" y2="96" class="fg-prop-line" stroke-width="3"/>`, tool: J => `<line x1="${J.toeR[0] - 6}" y1="${J.toeR[1] - 8}" x2="${J.toeR[0] + 6}" y2="${J.toeR[1] + 8}" class="fg-prop-line" stroke-width="3"/>`, endLabel: 'Bottom — knees toward chest, low back down' },
  calf: { a: {}, b: { footR: 58, footL: 58 }, tool: J => dumbbell(J.handR), endLabel: 'Top — high on the toes, pause' },
  nordic: { a: { anchor: ['kneeR', [60, 107]], thighR: 0, shinR: -90, footR: 180, uaR: 60, faR: 120 }, b: { anchor: ['kneeR', [60, 107]], torso: 130, thighR: -50, shinR: -90, footR: 180, uaR: 100, faR: 110 }, props: () => `<rect x="10" y="100" width="12" height="6" rx="2" class="fg-prop"/>`, endLabel: 'Lowered slowly — hips stay straight' },
  copenhagen: { view: 'front', a: { anchor: ['toeR', [26, 86]], torso: 102, thighR: -78, shinR: -80, thighL: -60, shinL: -20, footR: -90, uaR: 0, faR: 90, uaL: 160, faL: 160 }, b: { anchor: ['toeR', [26, 86]], torso: 106, thighR: -72, shinR: -72, thighL: -72, shinL: -72, footR: -90, uaR: 0, faR: 90, uaL: 160, faL: 160 }, props: () => PROP.bench(8, 40, 86), endLabel: 'Hips up — both legs in line' },
  // upper body
  row: { a: { torso: 112, thighR: 16, shinR: -6, uaR: 0, faR: 0 }, b: { torso: 112, thighR: 16, shinR: -6, uaR: -70, faR: 10 }, tool: J => plateBar(J.handR), endLabel: 'Bar to the belly button, elbows back' },
  cablerow: { a: { anchor: ['hip', [60, 100]], torso: 160, thighR: 88, shinR: 80, footR: 170, uaR: 92, faR: 92 }, b: { anchor: ['hip', [60, 100]], torso: 182, thighR: 88, shinR: 80, footR: 170, uaR: -55, faR: 88 }, props: () => PROP.bench(36, 76, 102), tool: J => cable(J.handR, [150, 96]), endLabel: 'Handle to the ribs, shoulder blades squeezed' },
  pulldown: { a: { anchor: ['hip', [74, 82]], torso: 172, thighR: 90, shinR: 0, uaR: 168, faR: 172 }, b: { anchor: ['hip', [74, 82]], torso: 168, thighR: 90, shinR: 0, uaR: -18, faR: 172 }, props: () => PROP.bench(56, 92, 84), tool: J => `${cable(J.handR, [J.handR[0], 4])}<line x1="${J.handR[0] - 14}" y1="${J.handR[1]}" x2="${J.handR[0] + 10}" y2="${J.handR[1]}" class="fg-prop-line" stroke-width="2.5"/>`, endLabel: 'Bar to the collarbone, elbows down' },
  pushup: { a: { anchor: ['toeR', [30, FLOOR]], torso: 107, thighR: -75, shinR: -75, footR: 12, uaR: 2, faR: 2 }, b: { anchor: ['toeR', [30, FLOOR]], torso: 96, thighR: -84, shinR: -84, footR: 12, uaR: -48, faR: 14 }, endLabel: 'Bottom — chest near the floor, body straight' },
  dbbench: { a: { anchor: ['hip', [92, 86]], torso: -90, thighR: 78, shinR: 0, uaR: 180, faR: 180, headTilt: 90 }, b: { anchor: ['hip', [92, 86]], torso: -90, thighR: 78, shinR: 0, uaR: 25, faR: 178, headTilt: 90 }, props: () => PROP.bench(48, 100, 88), tool: J => dumbbell(J.handR), endLabel: 'Bottom — elbows just below the bench' },
  cgbench: { a: { anchor: ['hip', [92, 86]], torso: -90, thighR: 78, shinR: 0, uaR: 180, faR: 180, headTilt: 90 }, b: { anchor: ['hip', [92, 86]], torso: -90, thighR: 78, shinR: 0, uaR: 10, faR: 172, headTilt: 90 }, props: () => PROP.bench(48, 100, 88), tool: J => plateBar(J.handR), endLabel: 'Bar to the lower chest, elbows tucked' },
  dips: { a: { anchor: ['handR', [50, 80]], torso: 180, thighR: 70, shinR: 62, uaR: -6, faR: -4 }, b: { anchor: ['handR', [50, 80]], torso: 176, thighR: 70, shinR: 62, uaR: -98, faR: 8 }, props: () => PROP.bench(26, 54, 80), endLabel: 'Bottom — elbows at 90°' },
  ohp: { a: { uaR: -12, faR: 168 }, b: { uaR: 176, faR: 180 }, tool: J => plateBar(J.handR), endLabel: 'Lockout overhead, ribs down' },
  pushdown: { a: { torso: 174, uaR: 4, faR: 148 }, b: { torso: 174, uaR: 4, faR: 2 }, tool: J => cable(J.handR, [104, 8]), endLabel: 'Arms straight — elbows pinned' },
  ohtri: { a: { uaR: 172, faR: -30 }, b: { uaR: 172, faR: 178 }, tool: J => dumbbell(J.handR), endLabel: 'Arms extended overhead' },
  latraise: { view: 'front', a: { uaR: 12, faR: 12, uaL: -12, faL: -12 }, b: { uaR: 88, faR: 92, uaL: -88, faL: -92 }, tool: J => dumbbell(J.handR) + dumbbell(J.handL), endLabel: 'Arms at shoulder height' },
  facepull: { a: { uaR: 88, faR: 92 }, b: { uaR: -98, faR: 150 }, tool: J => cable(J.handR, [150, 34]), endLabel: 'Rope to the forehead, elbows high' },
  reardelt: { a: { torso: 108, thighR: 14, shinR: -6, uaR: 2, faR: 4 }, b: { torso: 108, thighR: 14, shinR: -6, uaR: -82, faR: -80 }, tool: J => dumbbell(J.handR), endLabel: 'Arms out wide, squeeze the shoulder blades' },
  farmer: { a: { anchor: ['hip', [80, 66]], thighR: 20, shinR: 4, thighL: -18, shinL: -14, uaR: 2, faR: 2 }, b: { anchor: ['hip', [80, 66]], thighR: -18, shinR: -14, thighL: 20, shinL: 4, uaR: 2, faR: 2 }, tool: J => dumbbell([J.handR[0], J.handR[1] + 2]), endLabel: 'Walk tall, heavy hands' },
  shrug: { view: 'front', a: { uaR: 6, faR: 6, uaL: -6, faL: -6 }, b: { uaR: 6, faR: 6, uaL: -6, faL: -6, lift: 5 }, tool: J => dumbbell(J.handR) + dumbbell(J.handL), endLabel: 'Shoulders up to the ears, pause' },
  curl: { a: { uaR: 2, faR: 4 }, b: { uaR: 8, faR: 158 }, tool: J => dumbbell(J.handR), endLabel: 'Top — elbows still at your sides' },
  wrist: { a: { anchor: ['hip', [70, 82]], torso: 168, thighR: 90, shinR: 0, uaR: 30, faR: 95 }, b: { anchor: ['hip', [70, 82]], torso: 168, thighR: 90, shinR: 0, uaR: 30, faR: 112 }, props: () => PROP.bench(50, 84, 84), tool: J => dumbbell(J.handR), endLabel: 'Wrist curled up, forearm on the thigh' },
  // core
  aerohold: { a: { anchor: ['kneeR', [42, 108]], torso: 100, thighR: -10, shinR: -90, footR: 180, uaR: 10, faR: 90 }, b: { anchor: ['toeR', [26, FLOOR]], torso: 112, thighR: -70, shinR: -70, footR: 14, uaR: 10, faR: 90 }, props: () => PROP.box(88, 130, 74), endLabel: 'Hold — hips back like riding on the hoods', startLabel: 'Set up on the knees' },
  plank: { a: { anchor: ['kneeR', [44, 108]], torso: 98, thighR: -40, shinR: -90, footR: 180, uaR: 0, faR: 90 }, b: { anchor: ['toeR', [30, FLOOR]], torso: 99, thighR: -81, shinR: -81, footR: 12, uaR: 0, faR: 90 }, endLabel: 'Hold — straight line, ribs down', startLabel: 'Set up on the knees' },
  sideplank: { view: 'front', a: { anchor: ['toeR', [26, FLOOR]], torso: 96, thighR: -86, shinR: -86, footR: -90, uaR: 0, faR: 90, uaL: 175, faL: 175 }, b: { anchor: ['toeR', [26, FLOOR]], torso: 104, thighR: -74, shinR: -74, footR: -90, uaR: 0, faR: 90, uaL: 175, faL: 175 }, endLabel: 'Hips lifted — hold' },
  deadbug: { a: { anchor: ['hip', [84, 104]], torso: -90, thighR: 180, shinR: 90, uaR: 180, faR: 180, headTilt: 90 }, b: { anchor: ['hip', [84, 104]], torso: -90, thighR: 180, shinR: 90, thighL: 98, shinL: 96, uaR: 180, faR: 180, uaL: -98, faL: -96, headTilt: 90 }, endLabel: 'Opposite arm and leg reach long, back flat' },
  birddog: { a: { anchor: ['kneeR', [62, 108]], torso: 82, thighR: 0, shinR: -90, footR: 180, uaR: 0, faR: 0 }, b: { anchor: ['kneeL', [62, 108]], torso: 90, thighL: 0, shinL: -90, footL: 180, thighR: -90, shinR: -90, footR: -90, uaL: 0, faL: 0, uaR: 92, faR: 92 }, endLabel: 'Reach long — opposite arm and leg, hold 2 s' },
  pallof: { a: { thighR: 6, thighL: -6, uaR: 30, faR: 150 }, b: { thighR: 6, thighL: -6, uaR: 92, faR: 90 }, tool: J => cable(J.handR, [10, 48]), endLabel: 'Arms extended — resist the twist' },
  kneeraise: { a: { anchor: ['handR', [82, 10]], torso: 180, uaR: 180, faR: 180, thighR: 0, shinR: 0, footR: 30 }, b: { anchor: ['handR', [82, 10]], torso: 186, uaR: 180, faR: 180, thighR: 104, shinR: 8, footR: 80 }, props: () => PROP.bar(10, 50, 120), endLabel: 'Knees to hip height, no swing' },
  backext: { a: { anchor: ['hip', [72, 66]], torso: 20, thighR: -45, shinR: -45, footR: -135, uaR: 150, faR: 30 }, b: { anchor: ['hip', [72, 66]], torso: 135, thighR: -45, shinR: -45, footR: -135, uaR: 30, faR: 150 }, props: () => `<line x1="30" y1="${FLOOR}" x2="70" y2="70" class="fg-prop-line" stroke-width="3"/>`, endLabel: 'Body in one line — glutes squeezed' },
  // mobility
  couch: { a: { anchor: ['kneeL', [44, 108]], torso: 150, thighL: 8, shinL: 172, footL: 90, thighR: 92, shinR: 0, uaR: 60, faR: 20 }, b: { anchor: ['kneeL', [44, 108]], torso: 186, thighL: -6, shinL: 172, footL: 90, thighR: 92, shinR: 4, uaR: 20, faR: 10 }, props: () => PROP.wall(36), endLabel: 'Tall torso, squeeze the back glute' },
  openbook: { a: { anchor: ['hip', [92, 104]], torso: -90, thighR: 60, shinR: -10, uaR: 90, faR: 90, uaL: 90, faL: 90, headTilt: 90 }, b: { anchor: ['hip', [92, 104]], torso: -90, thighR: 60, shinR: -10, uaR: 90, faR: 90, uaL: 180, faL: -110, headTilt: 120 }, endLabel: 'Top arm open, eyes follow the hand' },
  catcamel: { a: { anchor: ['kneeR', [62, 108]], torso: 82, thighR: 0, shinR: -90, footR: 180, arch: 7, headTilt: 50 }, b: { anchor: ['kneeR', [62, 108]], torso: 82, thighR: 0, shinR: -90, footR: 180, arch: -6, headTilt: -30 }, endLabel: 'Back drops, chest forward', startLabel: 'Back rounded up' },
  pigeon: { a: { anchor: ['hip', [74, 96]], torso: 182, thighR: 72, shinR: -92, footR: -180, thighL: -96, shinL: -96, footL: -180, uaR: 5, faR: 5 }, b: { anchor: ['hip', [74, 96]], torso: 96, thighR: 72, shinR: -92, footR: -180, thighL: -96, shinL: -96, footL: -180, uaR: 92, faR: 92 }, endLabel: 'Fold forward, breathe into the hip' },
  hamfloss: { a: { anchor: ['hip', [72, 104]], torso: -90, thighL: 90, shinL: 90, footL: 180, thighR: 176, shinR: 100, uaR: 150, faR: 120, headTilt: 90 }, b: { anchor: ['hip', [72, 104]], torso: -90, thighL: 90, shinL: 90, footL: 180, thighR: 172, shinR: 176, uaR: 150, faR: 120, headTilt: 90 }, endLabel: 'Knee straight — hold the thigh still' },
  bandwalk: { view: 'front', a: { anchor: ['hip', [80, 70]], torso: 178, thighR: 12, shinR: -2, thighL: -12, shinL: 2, uaR: 20, faR: 60, uaL: -20, faL: -60 }, b: { anchor: ['hip', [76, 70]], torso: 178, thighR: 26, shinR: 4, thighL: -10, shinL: 2, uaR: 20, faR: 60, uaL: -20, faL: -60 }, tool: J => `<line x1="${J.kneeL[0]}" y1="${J.kneeL[1] + 2}" x2="${J.kneeR[0]}" y2="${J.kneeR[1] + 2}" class="fg-band"/>`, endLabel: 'Step out — knees push against the band' },
  clamshell: { a: { anchor: ['hip', [84, 102]], torso: -88, thighR: 60, shinR: -30, thighL: 60, shinL: -30, uaR: -170, faR: 140, headTilt: 80 }, b: { anchor: ['hip', [84, 102]], torso: -88, thighR: 60, shinR: -30, thighL: 120, shinL: -30, uaR: -170, faR: 140, headTilt: 80 }, tool: J => `<line x1="${J.kneeL[0]}" y1="${J.kneeL[1]}" x2="${J.kneeR[0]}" y2="${J.kneeR[1]}" class="fg-band"/>`, endLabel: 'Top knee opens — feet stay together' },
};
// Lower-body barbell squat variations reuse
DEF.legpress.view = 'side';

export function hasDemo(key) { return !!DEF[key]; }

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpPose(A, B, t) {
  const o = {};
  for (const k of Object.keys(A)) {
    if (k === 'anchor') o.anchor = [A.anchor[0], [lerp(A.anchor[1][0], B.anchor[1][0], t), lerp(A.anchor[1][1], B.anchor[1][1], t)]];
    else o[k] = lerp(A[k], B[k], t);
  }
  return o;
}
function fullPose(p) {
  const o = { ...STAND, ...p };
  for (const k of ['thigh', 'shin', 'foot', 'ua', 'fa']) if (p[k + 'R'] != null && p[k + 'L'] == null) o[k + 'L'] = p[k + 'R'];
  if (!o.anchor) o.anchor = ['toeR', [86, FLOOR]];
  if (o.headTilt == null) o.headTilt = 0;
  return o;
}

function limb(points, cls) { return `<polyline points="${points.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" class="${cls}"/>`; }

function draw(def, J) {
  const torsoPath = (() => {
    const mid = [(J.hip[0] + J.neck[0]) / 2, (J.hip[1] + J.neck[1]) / 2];
    const dx = J.neck[0] - J.hip[0], dy = J.neck[1] - J.hip[1], len = Math.hypot(dx, dy) || 1;
    const nx = dy / len, ny = -dx / len; // left-hand normal (screen up for a forward-leaning torso)
    const c = [mid[0] + nx * J.arch * 1.6, mid[1] + ny * J.arch * 1.6];
    return `<path d="M${J.hip[0].toFixed(1)},${J.hip[1].toFixed(1)} Q${c[0].toFixed(1)},${c[1].toFixed(1)} ${J.neck[0].toFixed(1)},${J.neck[1].toFixed(1)}" class="fg-body"/>`;
  })();
  return [
    PROP.floor(), def.props ? def.props(J) : '',
    limb([J.hipL, J.kneeL, J.ankleL, J.toeL], 'fg-far'), limb([J.shoulderL, J.elbowL, J.handL], 'fg-far'),
    torsoPath, `<circle cx="${J.head[0].toFixed(1)}" cy="${J.head[1].toFixed(1)}" r="${LEN.head}" class="fg-head"/>`,
    limb([J.hipR, J.kneeR, J.ankleR, J.toeR], 'fg-body'), limb([J.shoulderR, J.elbowR, J.handR], 'fg-body'),
    def.tool ? def.tool(J) : '',
  ].join('');
}

// One shared animation loop for every demo on the page.
const live = new Set();
let raf = 0;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function tick(now) {
  for (const f of live) { if (!f.svg.isConnected) { live.delete(f); continue; } f.frame(now); }
  raf = live.size ? requestAnimationFrame(tick) : 0;
}
// Cycle (ms): hold start, move to end, hold end, return.
const HOLD_A = 700, MOVE = 1300, HOLD_B = 450;
const CYCLE = HOLD_A + MOVE + HOLD_B + MOVE;
const ease = t => 0.5 - 0.5 * Math.cos(Math.PI * t);

/**
 * Build an animated demo for an exercise key. Returns an element, or null when no demo exists.
 * size: 'thumb' (small, no caption) or 'large' (with phase caption).
 */
export function exerciseDemo(key, { size = 'large' } = {}) {
  const def = DEF[key]; if (!def) return null;
  const A = fullPose(def.a), B = fullPose({ ...def.b, anchor: def.b.anchor || def.a.anchor });
  // make sure A has every key B has
  for (const k of Object.keys(B)) if (A[k] == null) A[k] = STAND[k] ?? 0;
  const view = def.view || 'side';
  const wrap = document.createElement('div');
  wrap.className = `fg ${size}`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 160 120'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Animation: ${def.startLabel || 'start position'}, then ${def.endLabel}`);
  wrap.appendChild(svg);
  let cap = null;
  if (size === 'large') { cap = document.createElement('div'); cap.className = 'fg-cap'; wrap.appendChild(cap); }
  const render = (t) => { svg.innerHTML = draw(def, solve(lerpPose(A, B, t), view)); };
  if (reduced()) {
    // Static: start and end side by side
    render(0); const s2 = svg.cloneNode(true); render(1); const s1 = svg.cloneNode(true);
    wrap.innerHTML = ''; const row = document.createElement('div'); row.className = 'fg-static';
    s2.setAttribute('aria-label', def.startLabel || 'Start position'); s1.setAttribute('aria-label', def.endLabel);
    row.append(s2, s1); wrap.appendChild(row);
    if (size === 'large') { const c = document.createElement('div'); c.className = 'fg-cap'; c.textContent = `Left: ${def.startLabel || 'start position'} · Right: ${def.endLabel}`; wrap.appendChild(c); }
    return wrap;
  }
  const t0 = performance.now() + Math.random() * 400;
  let lastPhase = '';
  const frame = (now) => {
    const m = ((now - t0) % CYCLE + CYCLE) % CYCLE;
    let t, phase;
    const startL = def.startLabel || 'Start position';
    if (m < HOLD_A) { t = 0; phase = startL; }
    else if (m < HOLD_A + MOVE) { t = ease((m - HOLD_A) / MOVE); phase = t < 0.5 ? startL : def.endLabel; }
    else if (m < HOLD_A + MOVE + HOLD_B) { t = 1; phase = def.endLabel; }
    else { t = 1 - ease((m - HOLD_A - MOVE - HOLD_B) / MOVE); phase = t > 0.5 ? def.endLabel : startL; }
    render(t);
    if (cap && phase !== lastPhase) { cap.textContent = phase; lastPhase = phase; }
  };
  frame(performance.now());
  live.add({ svg, frame });
  if (!raf) raf = requestAnimationFrame(tick);
  return wrap;
}
export const DEMO_KEYS = Object.keys(DEF);
