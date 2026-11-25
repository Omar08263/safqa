// Apply the saved font + palette before first paint (no inline script: CSP).
// Keys and ids must stay in sync with apps/web/src/lib/skins.ts.
(function (w) {
  var FONT_KEY = 'safqa.font';
  var SKIN_KEY = 'safqa.skin';
  var THEME_KEY = 'safqa.theme';
  var FONTS = { plex: 1, cairo: 1, tajawal: 1, kufi: 1, readex: 1, system: 1 };
  var SKINS = { sand: 'light', white: 'light', dark: 'dark', navy: 'dark' };
  var COLORS = { sand: '#F3EEE4', white: '#FFFFFF', dark: '#12110E', navy: '#0B1220' };
  var loaded = { plex: 1, system: 1 };

  function font() {
    var id = null;
    try { id = localStorage.getItem(FONT_KEY); } catch (e) {}
    return FONTS[id] ? id : 'plex';
  }
  function skin() {
    var s = null, t = null;
    try { s = localStorage.getItem(SKIN_KEY); t = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (SKINS[s]) return s;
    return t === 'dark' ? 'dark' : 'sand';
  }
  function loadFont(id) {
    if (loaded[id]) return;
    loaded[id] = 1;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = '/fonts/' + id + '.css';
    document.head.appendChild(l);
  }
  function apply(nextSkin, nextFont) {
    var s = nextSkin || skin();
    var f = nextFont || font();
    if (!SKINS[s]) s = 'sand';
    if (!FONTS[f]) f = 'plex';
    var root = document.documentElement;
    var dark = SKINS[s] === 'dark';
    root.dataset.theme = s;
    root.dataset.font = f;
    root.classList.toggle('dark', dark);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', COLORS[s] || '#c9840a');
    loadFont(f);
    return { skin: s, font: f, dark: dark };
  }
  function setFont(id) {
    if (!FONTS[id]) id = 'plex';
    try { localStorage.setItem(FONT_KEY, id); } catch (e) {}
    return apply(null, id);
  }
  function setSkin(id) {
    if (!SKINS[id]) id = 'sand';
    try {
      localStorage.setItem(SKIN_KEY, id);
      localStorage.setItem(THEME_KEY, SKINS[id]);
    } catch (e) {}
    return apply(id, null);
  }
  apply();
  w.SafqaAppearance = {
    FONT_KEY: FONT_KEY, SKIN_KEY: SKIN_KEY, THEME_KEY: THEME_KEY,
    FONTS: FONTS, SKINS: SKINS, font: font, skin: skin,
    apply: apply, setFont: setFont, setSkin: setSkin, loadFont: loadFont
  };
})(window);
