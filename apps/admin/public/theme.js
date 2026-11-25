// Safqa Hub themes + fonts — classic script in <head> so the saved look applies before first paint (no inline script: CSP).
(function (w) {
  var KEY = 'hub.theme';
  var FONT_KEY = 'hub.font';
  var THEMES = [
    { id: 'dark', label: 'داكن', icon: '🌙', color: '#12110E', dark: true },
    { id: 'light', label: 'رملي', icon: '🏜️', color: '#F3EEE4', dark: false },
    { id: 'white', label: 'أبيض', icon: '🤍', color: '#FFFFFF', dark: false },
    { id: 'navy', label: 'ليلي', icon: '🌌', color: '#0B1220', dark: true }
  ];
  var FONTS = [
    { id: 'plex', label: 'خط صفقة (IBM Plex Sans Arabic)', family: '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif' },
    { id: 'cairo', label: 'القاهرة (Cairo)', family: '"Cairo", "Segoe UI", Tahoma, sans-serif', lazy: '/fonts/cairo.css' },
    { id: 'tajawal', label: 'تجوّال (Tajawal)', family: '"Tajawal", "Segoe UI", Tahoma, sans-serif', lazy: '/fonts/tajawal.css' },
    { id: 'kufi', label: 'كوفي (Noto Kufi Arabic)', family: '"Noto Kufi Arabic", "Segoe UI", Tahoma, sans-serif', lazy: '/fonts/kufi.css' },
    { id: 'readex', label: 'ريدكس (Readex Pro)', family: '"Readex Pro", "Segoe UI", Tahoma, sans-serif', lazy: '/fonts/readex.css' },
    { id: 'system', label: 'الافتراضي للنظام', family: 'system-ui, "Segoe UI", Tahoma, sans-serif' }
  ];
  var loaded = { plex: 1, system: 1 };
  function get() {
    var id = document.documentElement.dataset.theme || localStorage.getItem(KEY);
    return THEMES.find(function (t) { return t.id === id; }) || THEMES[0];
  }
  function getFont() {
    var id = document.documentElement.dataset.font || localStorage.getItem(FONT_KEY);
    return FONTS.find(function (f) { return f.id === id; }) || FONTS[0];
  }
  function loadFont(f) {
    if (!f || loaded[f.id] || !f.lazy) return;
    loaded[f.id] = 1;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = f.lazy;
    document.head.appendChild(l);
  }
  function apply(t, f) {
    t = t || get();
    f = f || getFont();
    var root = document.documentElement;
    root.dataset.theme = t.id;
    root.dataset.font = f.id;
    root.classList.toggle('dark', !!t.dark);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t.color);
    loadFont(f);
  }
  function set(id) {
    var t = THEMES.find(function (x) { return x.id === id; }) || THEMES[0];
    try { localStorage.setItem(KEY, t.id); } catch (e) {}
    apply(t, getFont());
    return t;
  }
  function setFont(id) {
    var f = FONTS.find(function (x) { return x.id === id; }) || FONTS[0];
    try { localStorage.setItem(FONT_KEY, f.id); } catch (e) {}
    apply(get(), f);
    return f;
  }
  function cycle() {
    var i = THEMES.findIndex(function (x) { return x.id === get().id; });
    return set(THEMES[(i + 1) % THEMES.length].id);
  }
  var q = null;
  try { q = new URLSearchParams(location.search).get('theme'); } catch (e) {}
  if (q && THEMES.find(function (t) { return t.id === q; })) apply(THEMES.find(function (t) { return t.id === q; }), getFont());
  else apply(get(), getFont());
  w.SafqaTheme = { KEY: KEY, FONT_KEY: FONT_KEY, THEMES: THEMES, FONTS: FONTS, get: get, getFont: getFont, set: set, setFont: setFont, cycle: cycle, apply: apply };
})(window);
