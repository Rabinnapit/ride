// RideHQ — exercise demo modal and inline thumbnails.
import { h, modal } from './dom.js';
import { exerciseDemo, hasDemo } from '../coach/figures.js';
import { EXERCISES } from '../coach/gym.js';

export function showExercise(key, { sets = null, reps = null, note = null } = {}) {
  const ex = EXERCISES[key]; if (!ex) return;
  const demo = exerciseDemo(key, { size: 'large' });
  modal(ex.name, h('div', { class: 'stack' },
    demo || h('p', { class: 'muted' }, 'No animation for this one yet.'),
    sets ? h('p', null, h('strong', null, `${sets} × ${reps}`), note ? ` — ${note}` : '') : null,
    h('p', null, ex.cue),
  ));
}

/** Small looping thumbnail that opens the full demo when tapped. */
export function demoThumb(key, opts = {}) {
  if (!hasDemo(key)) return null;
  const btn = h('button', { class: 'demo-btn', type: 'button', 'aria-label': `Show how to do ${EXERCISES[key]?.name || key}`, onClick: (e) => { e.stopPropagation(); showExercise(key, opts); } });
  btn.appendChild(exerciseDemo(key, { size: 'thumb' }));
  return btn;
}

/** Exercise name rendered as a link that opens the demo. */
export function exerciseLink(key, label, opts = {}) {
  return h('button', { class: 'ex-link', type: 'button', onClick: () => showExercise(key, opts) }, label || EXERCISES[key]?.name || key);
}
