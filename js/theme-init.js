// Runs before first paint: apply the saved theme so there is no flash.
(function () {
  try { var t = localStorage.getItem('ridehq.theme'); if (t) document.documentElement.setAttribute('data-theme', t); else if (matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.setAttribute('data-theme', 'dark'); } catch (e) { /* ignore */ }
})();
