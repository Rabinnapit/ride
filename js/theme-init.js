// Runs before first paint: apply the saved theme preference (auto follows the phone's day/night setting).
(function () {
  try {
    var pref = localStorage.getItem('ridehq.themePref') || 'system';
    var dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) { /* ignore */ }
})();
