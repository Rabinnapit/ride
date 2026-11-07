// RiderHQ — exercise demos: two illustrated frames (start / end of one rep) cross-faded into a loop,
// plus a link to real-life videos for every exercise.
// Illustrations: Everkinetic open data (Greg Priday), CC BY-SA 4.0 — see img/ex/NOTICE.md.

/** key → [start label, end label]. Files: img/ex/<key>-a.webp (start) and -b.webp (end). */
const ILLUS = {
  gobletsquat: ['Standing tall, weight at your chest', 'Bottom — hips at or below knees'],
  backsquat: ['Standing, bar on upper back', 'Bottom — thighs about parallel'],
  trapbar: ['Set up — hips back, chest up, flat back', 'Lockout — stand tall'],
  rdl: ['Standing, bar at the thighs', 'Hinged — bar below the knees, back flat'],
  split: ['Rear foot up on the bench', 'Bottom — back knee near the floor'],
  stepup: ['Standing, box in front', 'Foot on the box — drive up through the heel'],
  lunge: ['Standing tall', 'Bottom — both knees about 90°'],
  bridge: ['Lying, knees bent', 'Hips up — squeeze the glutes'],
  legpress: ['Legs extended, knees soft', 'Bottom — knees toward the chest'],
  calf: ['Heels down', 'Top — high on the toes, pause'],
  row: ['Hinged, arms long', 'Bar pulled to the belly, elbows back'],
  cablerow: ['Arms forward, back tall', 'Handle to the ribs, shoulder blades squeezed'],
  pulldown: ['Arms up, gripping wide', 'Bar to the upper chest, elbows down'],
  pushup: ['Top — straight line head to heels', 'Bottom — chest near the floor'],
  dbbench: ['Dumbbells pressed up', 'Lowered to the chest'],
  cgbench: ['Bar pressed up, hands shoulder-width', 'Bar to the lower chest, elbows tucked'],
  pushdown: ['Elbows pinned, hands at chest', 'Arms straight — squeeze the triceps'],
  ohtri: ['Arms overhead', 'Lowered behind the head — elbows forward'],
  dips: ['Arms straight, hands on the bench', 'Bottom — elbows at 90°'],
  ohp: ['Bar at shoulder height', 'Pressed overhead'],
  latraise: ['Arms at your sides', 'Arms at shoulder height'],
  bandfly: ['Arms forward, band taut', 'Arms out wide — squeeze the shoulder blades'],
  reardelt: ['Chest on the incline bench, arms hanging', 'Arms out wide — squeeze the back'],
  shrug: ['Shoulders relaxed', 'Shoulders up to the ears, pause'],
  curl: ['Arms long, thumbs forward', 'Top — elbows still at your sides'],
  sideplank: ['Hips down', 'Hips lifted — straight line, hold'],
  backext: ['Hinged over the pad', 'Body in one line — glutes squeezed'],
  hipadd: ['Leg out to the side', 'Pulled across — torso still'],
  hipraise: ['Lying, knees bent', 'Hips curled off the floor'],
  abroll: ['Kneeling, bar under the shoulders', 'Rolled out — ribs down, back flat'],
  goodmorning: ['Standing, bar on upper back', 'Hinged — back flat, soft knees'],
};

export function hasDemo(key) { return !!ILLUS[key]; }
export const DEMO_KEYS = Object.keys(ILLUS);

/** YouTube search for real-life demonstrations. */
export function videoUrl(name) { return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise proper form`)}`; }

// One shared animation loop for every demo on the page.
const live = new Set();
let raf = 0;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function tick(now) {
  for (const f of live) { if (!f.el.isConnected) { live.delete(f); continue; } f.frame(now); }
  raf = live.size ? requestAnimationFrame(tick) : 0;
}
// Cycle (ms): hold start, fade, hold end, fade back.
const HOLD = 1300, FADE = 450, CYCLE = 2 * (HOLD + FADE);

/**
 * Build an animated demo for an exercise key, or null when no illustration exists.
 * size: 'thumb' (small, no caption) or 'large' (with phase caption and credit).
 */
export function exerciseDemo(key, { size = 'large' } = {}) {
  const labels = ILLUS[key]; if (!labels) return null;
  const [startL, endL] = labels;
  const wrap = document.createElement('div');
  wrap.className = `fg ${size}`;
  const mk = (tag, alt) => { const i = document.createElement('img'); i.src = `img/ex/${key}-${tag}.webp`; i.alt = alt; i.decoding = 'async'; i.loading = 'lazy'; return i; };
  if (reduced()) {
    const row = document.createElement('div'); row.className = 'fg-static';
    for (const [tag, l] of [['a', startL], ['b', endL]]) { const fig = document.createElement('figure'); fig.className = 'fg-stage'; fig.append(mk(tag, l)); if (size === 'large') { const c = document.createElement('figcaption'); c.textContent = l; fig.append(c); } row.append(fig); }
    wrap.append(row);
  } else {
    const stage = document.createElement('div'); stage.className = 'fg-stage';
    const a = mk('a', startL), b = mk('b', endL); b.className = 'fg-b';
    stage.append(a, b); wrap.append(stage);
    let cap = null;
    if (size === 'large') { cap = document.createElement('div'); cap.className = 'fg-cap'; cap.textContent = startL; wrap.append(cap); }
    const t0 = performance.now() + (size === 'thumb' ? Math.random() * 900 : 0);
    let last = -1;
    const frame = (now) => {
      const m = ((now - t0) % CYCLE + CYCLE) % CYCLE;
      let o;
      if (m < HOLD) o = 0; else if (m < HOLD + FADE) o = (m - HOLD) / FADE; else if (m < 2 * HOLD + FADE) o = 1; else o = 1 - (m - 2 * HOLD - FADE) / FADE;
      if (o !== last) { b.style.opacity = o.toFixed(3); last = o; if (cap) cap.textContent = o >= 0.5 ? endL : startL; }
    };
    frame(performance.now());
    live.add({ el: wrap, frame });
    if (!raf) raf = requestAnimationFrame(tick);
  }
  if (size === 'large') {
    const credit = document.createElement('p'); credit.className = 'fg-credit';
    credit.innerHTML = 'Illustration: <a href="https://github.com/everkinetic/data" target="_blank" rel="noopener">Everkinetic</a> (Greg Priday), CC BY-SA 4.0';
    wrap.append(credit);
  }
  return wrap;
}
