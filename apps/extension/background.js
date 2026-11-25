// Safqa extension service worker: talks to the Safqa API (host permission → no page CORS issues).
const API = 'https://safqa-api.safqaeg.workers.dev';
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    try {
      if (msg.type === 'search') {
        const r = await fetch(`${API}/api/v5/search?limit=4&q=${encodeURIComponent(msg.q)}`);
        reply({ ok: r.ok, data: r.ok ? await r.json() : null });
      } else if (msg.type === 'observe') {
        const r = await fetch(`${API}/api/v5/observe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(msg.product) });
        reply({ ok: r.ok, data: await r.json().catch(() => null) });
      } else reply({ ok: false });
    } catch (e) { reply({ ok: false, error: String(e) }); }
  })();
  return true;
});
