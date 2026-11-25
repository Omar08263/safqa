// Safqa Hub themes — classic script in <head> so the saved theme applies before first paint (no inline script: CSP).
(function (w) {
  var KEY = 'hub.theme';
  var THEMES = [
    { id: 'dark', label: 'داكن', icon: '🌙', color: '#12110E', dark: true },
    { id: 'light', label: 'فاتح', icon: '☀️', color: '#F3EEE4', dark: false },
    { id: 'navy', label: 'ليلي', icon: '🌌', color: '#0B1220', dark: true }
  ];
  function get() {
    var id = document.documentElement.dataset.theme || localStorage.getItem(KEY);
    return THEMES.find(function (t) { return t.id === id; }) || THEMES[0];
  }
  function apply(t) {
    var root = document.documentElement;
    root.dataset.theme = t.id;
    root.classList.toggle('dark', !!t.dark);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t.color);
  }
  function set(id) {
    var t = THEMES.find(function (x) { return x.id === id; }) || THEMES[0];
    try { localStorage.setItem(KEY, t.id); } catch (e) {}
    apply(t);
    return t;
  }
  function cycle() {
    var i = THEMES.findIndex(function (x) { return x.id === get().id; });
    return set(THEMES[(i + 1) % THEMES.length].id);
  }
  var q = null;
  try { q = new URLSearchParams(location.search).get('theme'); } catch (e) {}
  if (q && THEMES.find(function (t) { return t.id === q; })) apply(THEMES.find(function (t) { return t.id === q; }));
  else apply(get());
  w.SafqaTheme = { KEY: KEY, THEMES: THEMES, get: get, set: set, cycle: cycle, apply: apply };
})(window);
