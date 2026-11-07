// RiderHQ — exercise demo modal and inline thumbnails.
import { h, modal, icon } from './dom.js';
import { exerciseDemo, hasDemo, videoUrl } from '../coach/figures.js';
import { EXERCISES } from '../coach/gym.js';
import { hasVideo, embedUrl, watchUrl, thumbUrl } from '../coach/videos.js';

function videoLink(name, cls = 'btn small') {
  return h('a', { class: cls, href: videoUrl(name), target: '_blank', rel: 'noopener' }, icon('play'), 'Watch real videos');
}

export function showExercise(key, { sets = null, reps = null, note = null } = {}) {
  const ex = EXERCISES[key]; if (!ex) return;
  const demo = exerciseDemo(key, { size: 'large' });
  // Real video, loaded only when tapped (saves data on the go).
  let player = null;
  if (hasVideo(key)) {
    player = h('div', { class: 'video-slot' }, h('img', { class: 'video-thumb', src: thumbUrl(key), alt: '', loading: 'lazy' }));
    const play = h('button', { class: 'video-play', type: 'button', onClick: () => { player.innerHTML = ''; player.classList.add('on'); player.appendChild(h('iframe', { src: embedUrl(key), title: `${ex.name} — video demonstration`, allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: 'true', loading: 'lazy', referrerpolicy: 'strict-origin-when-cross-origin' })); } },
      icon('play'), h('span', null, 'Play real video'), h('small', null, 'YouTube · uses data'));
    player.appendChild(play);
  }
  modal(ex.name, h('div', { class: 'stack' },
    player,
    demo ? h('details', { class: 'demo-fold', open: !player }, h('summary', null, 'Start and finish positions'), demo) : (player ? null : h('p', { class: 'muted' }, 'No illustration for this one — the videos show it best.')),
    sets ? h('p', null, h('strong', null, `${sets} × ${reps}`), note ? ` — ${note}` : '') : null,
    h('p', null, ex.cue),
    h('div', { class: 'row' }, hasVideo(key) ? h('a', { class: 'btn small', href: watchUrl(key), target: '_blank', rel: 'noopener' }, icon('play'), 'Open in YouTube') : videoLink(ex.name, 'btn small primary'), hasVideo(key) ? videoLink(ex.name) : null),
  ), { wide: true });
}

/** Small looping thumbnail (or a video tile when there is no illustration) that opens the full demo. */
export function demoThumb(key, opts = {}) {
  const name = EXERCISES[key]?.name || key;
  const btn = h('button', { class: 'demo-btn', type: 'button', 'aria-label': `Show how to do ${name}`, onClick: (e) => { e.stopPropagation(); showExercise(key, opts); } });
  if (hasDemo(key)) btn.appendChild(exerciseDemo(key, { size: 'thumb' }));
  else btn.appendChild(h('span', { class: 'fg thumb fg-novid' }, icon('play'), h('small', null, 'Video')));
  return btn;
}

/** Exercise name rendered as a link that opens the demo. */
export function exerciseLink(key, label, opts = {}) {
  return h('button', { class: 'ex-link', type: 'button', onClick: () => showExercise(key, opts) }, label || EXERCISES[key]?.name || key);
}
