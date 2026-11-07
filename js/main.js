// RiderHQ — entry point.
import { boot } from './app.js';
import './views/home.js';
import './views/rides.js';
import './views/ride.js';
import './views/analyze.js';
import './views/train.js';
import './views/gym.js';
import './views/wellness.js';
import './views/more.js';
import './views/settings.js';

boot().catch(err => {
  console.error(err);
  const el = document.getElementById('view') || document.body;
  el.innerHTML = `<div class="panel"><h2>RiderHQ could not start</h2><p>${(err && err.message) || err}</p><p class="small">Try a modern browser (Chrome, Edge, Safari 16+, Firefox) with storage enabled.</p></div>`;
});
