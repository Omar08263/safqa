// Static demo backend. When the web app is built with VITE_DEMO_MODE=static
// (e.g. for a free Hugging Face static Space), every /api/* call is answered in
// the browser from a snapshot recorded from a real, seeded Safqa API
// (deploy/hf/record-snapshot.mjs). Login, watchlist, alerts, and settings are
// emulated per browser in localStorage. Nothing is sent to a server.
// biome-ignore lint/suspicious/noExplicitAny: snapshot JSON mirrors API schemas validated by the client.
type Json = any;

interface Snapshot {
  recordedAt: string;
  all: Json[];
  routes: Record<string, Json>;
  products: Record<
    string,
    {
      detail: Json;
      history?: Json;
      debate?: Json;
      prediction?: Json;
      stack?: Json;
      media?: Json;
    }
  >;
  demo: { user: Json; watchlist: Json[]; alerts: Json[]; settings: Json };
  chats: { message: string; response: Json }[];
  fx?: { base: string; rates: Record<string, number>; updatedAt: string; source: string } | null;
}

const KEY = 'safqa.demo.state.v1';
const DEMO_EMAIL = 'demo@safqa.app';
const DEMO_PASSWORD = 'demo1234';

interface State {
  users: { email: string; password: string; user: Json }[];
  sessions: Record<string, string>; // token -> email
  watch: Record<string, Json[]>;
  alerts: Record<string, Json[]>;
  settings: Record<string, Json>;
  resets?: Record<string, { code: string; exp: number }>;
}

function decodeJwt(credential: string): Json | null {
  try {
    const part = credential.split('.')[1] ?? '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function fail(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}
function token(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `demo_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function installDemoApi(snapshotUrl: string): Promise<void> {
  const realFetch = window.fetch.bind(window);
  const snap: Snapshot = await realFetch(snapshotUrl).then((r) => r.json());

  const load = (): State => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as State;
    } catch {
      // fall through to a fresh state
    }
    return {
      users: [
        { email: DEMO_EMAIL, password: DEMO_PASSWORD, user: snap.demo.user },
      ],
      sessions: {},
      watch: { [DEMO_EMAIL]: snap.demo.watchlist },
      alerts: { [DEMO_EMAIL]: snap.demo.alerts },
      settings: { [DEMO_EMAIL]: snap.demo.settings },
    };
  };
  let state = load();
  const save = () => window.localStorage.setItem(KEY, JSON.stringify(state));

  const card = (id: string) =>
    snap.all.find((p) => p.id === id) ?? snap.products[id]?.detail;

  function issue(email: string) {
    const access = token();
    const refresh = token();
    state.sessions[access] = email;
    state.sessions[refresh] = email;
    save();
    const user = state.users.find((u) => u.email === email)?.user;
    return { accessToken: access, refreshToken: refresh, user };
  }

  function whoami(headers: Headers): string | null {
    const auth = headers.get('authorization') || '';
    const value = auth.replace(/^Bearer\s+/i, '');
    return state.sessions[value] ?? null;
  }

  function rank(offer: Json): number {
    return (
      (offer.condition === 'new' ? 0 : 50) +
      (offer.inStock ? 0 : 20) -
      offer.dealScore / 100 +
      offer.priceEgp / 1_000_000
    );
  }

  function search(params: URLSearchParams) {
    const needle = params.get('q')?.trim().toLowerCase();
    const store = params.get('store');
    const category = params.get('category');
    const inStock = params.get('inStock') === '1';
    const hideFake = params.get('hideFake') === '1';
    const minPrice = params.get('minPrice')
      ? Number(params.get('minPrice'))
      : null;
    const maxPrice = params.get('maxPrice')
      ? Number(params.get('maxPrice'))
      : null;
    const minDiscount = params.get('minDiscount')
      ? Number(params.get('minDiscount'))
      : null;
    const items: Json[] = [];
    for (const base of snap.all) {
      const detail = snap.products[base.id]?.detail;
      if (!detail) continue;
      if (category && base.category?.slug !== category) continue;
      if (needle) {
        const hay =
          `${base.titleAr} ${base.titleEn} ${base.brand ?? ''} ${base.model ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      const offers = (detail.offers as Json[]).filter((o) => {
        if (store && o.store.slug !== store) return false;
        if (inStock && !o.inStock) return false;
        if (hideFake && o.fakeDiscount) return false;
        if (minPrice != null && o.priceEgp < minPrice) return false;
        if (maxPrice != null && o.priceEgp > maxPrice) return false;
        if (minDiscount != null && (o.discountPct ?? 0) < minDiscount)
          return false;
        return true;
      });
      if (offers.length === 0) continue;
      const best = [...offers].sort((a, b) => rank(a) - rank(b))[0];
      const fresh = offers.filter((o) => o.condition === 'new' && o.inStock);
      const prices = (fresh.length ? fresh : offers).map((o) => o.priceEgp);
      items.push({
        ...base,
        offerCount: offers.length,
        lowestPriceEgp: Math.min(...prices),
        bestOffer: best,
      });
    }
    const sort = params.get('sort') || 'score';
    items.sort((a, b) => {
      if (sort === 'price_asc')
        return (a.bestOffer?.priceEgp ?? 0) - (b.bestOffer?.priceEgp ?? 0);
      if (sort === 'discount')
        return (
          (b.bestOffer?.discountPct ?? 0) - (a.bestOffer?.discountPct ?? 0)
        );
      return (b.bestOffer?.dealScore ?? 0) - (a.bestOffer?.dealScore ?? 0);
    });
    return { items };
  }

  function chat(message: string) {
    const recorded = snap.chats.find(
      (c) => c.message.trim() === message.trim(),
    );
    if (recorded) return recorded.response;
    const arabic = /[\u0600-\u06FF]/.test(message);
    const words = message
      .toLowerCase()
      .split(/[\s,.?!؟،]+/)
      .filter((w) => w.length > 2);
    const scored = snap.all
      .map((p) => {
        const hay =
          `${p.titleAr} ${p.titleEn} ${p.brand ?? ''} ${p.model ?? ''} ${p.category?.nameAr ?? ''} ${p.category?.nameEn ?? ''}`.toLowerCase();
        return { p, score: words.filter((w) => hay.includes(w)).length };
      })
      .filter((x) => x.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          (b.p.bestOffer?.dealScore ?? 0) - (a.p.bestOffer?.dealScore ?? 0),
      );
    const picks = (
      scored.length
        ? scored.map((x) => x.p)
        : [...snap.all].sort(
            (a, b) =>
              (b.bestOffer?.dealScore ?? 0) - (a.bestOffer?.dealScore ?? 0),
          )
    ).slice(0, 3);
    const lines = picks.map((p) =>
      arabic
        ? `- ${p.titleAr}: ${p.bestOffer?.priceEgp} جنيه على ${p.bestOffer?.store?.nameAr}`
        : `- ${p.titleEn}: EGP ${p.bestOffer?.priceEgp} at ${p.bestOffer?.store?.nameEn}`,
    );
    const head = scored.length
      ? arabic
        ? 'دي أقرب حاجات لطلبك:'
        : 'Closest matches:'
      : arabic
        ? 'ملقتش حاجة مطابقة بالظبط، بس دي أحسن العروض دلوقتي:'
        : 'No exact match, but these are the best deals now:';
    return {
      reply: `${head}\n${lines.join('\n')}`,
      provider: 'demo',
      products: picks.map((p) => snap.products[p.id]?.detail).filter(Boolean),
    };
  }

  async function handle(
    method: string,
    url: URL,
    headers: Headers,
    body: string | null,
  ): Promise<Response> {
    const path = url.pathname;
    const data = body
      ? (() => {
          try {
            return JSON.parse(body);
          } catch {
            return {};
          }
        })()
      : {};
    if (method === 'GET' && path === '/api/health')
      return json({ ok: true, db: 'snapshot', redis: 'off' });
    if (method === 'GET' && snap.routes[path] && path !== '/api/health')
      return json(snap.routes[path]);
    if (method === 'GET' && path === '/api/fx')
      return snap.fx ? json(snap.fx) : fail(404, 'not_found', 'No cached FX rates');
    if (method === 'GET' && path === '/api/media') {
      const map: Record<string, Json> = {};
      for (const [id, entry] of Object.entries(snap.products))
        if (entry.media?.images?.length)
          map[id] = { thumb: entry.media.images[0].thumb, full: entry.media.images[0].full, count: entry.media.images.length };
      return json({ recordedAt: snap.recordedAt, items: map });
    }
    const mediaMatch = path.match(/^\/api\/products\/([^/]+)\/media$/);
    if (method === 'GET' && mediaMatch) {
      const media = snap.products[mediaMatch[1] ?? '']?.media;
      return media ? json(media) : fail(404, 'not_found', 'No media for this product');
    }
    if (method === 'GET' && path === '/api/products/search')
      return json(search(url.searchParams));
    const productMatch = path.match(
      /^\/api\/products\/([^/]+)(?:\/(history|debate|prediction|stack))?$/,
    );
    if (method === 'GET' && productMatch) {
      const entry = snap.products[productMatch[1] ?? ''];
      const part = productMatch[2] as
        | 'history'
        | 'debate'
        | 'prediction'
        | 'stack'
        | undefined;
      const value = entry ? (part ? entry[part] : entry.detail) : null;
      return value ? json(value) : fail(404, 'not_found', 'Product not found');
    }
    if (method === 'POST' && path === '/api/chat') {
      if (!data.message || String(data.message).trim().length < 2)
        return fail(400, 'invalid_body', 'Say what you want');
      return json(chat(String(data.message)));
    }
    if (method === 'POST' && path === '/api/auth/login') {
      const found = state.users.find(
        (u) =>
          u.email === String(data.email || '').toLowerCase() &&
          u.password === data.password,
      );
      return found
        ? json(issue(found.email))
        : fail(401, 'invalid_credentials', 'Wrong email or password');
    }
    if (method === 'POST' && path === '/api/auth/register') {
      const email = String(data.email || '').toLowerCase();
      if (!email.includes('@') || String(data.password || '').length < 8)
        return fail(400, 'invalid_body', 'Check the form');
      if (state.users.some((u) => u.email === email))
        return fail(409, 'email_taken', 'Email already registered');
      state.users.push({
        email,
        password: data.password,
        user: {
          id: crypto.randomUUID(),
          email,
          name: data.name || email,
          locale: 'ar',
        },
      });
      state.watch[email] = [];
      state.alerts[email] = [];
      state.settings[email] = {
        ...snap.demo.settings,
        telegramChatId: null,
        expoPushToken: null,
        hasWebPush: false,
      };
      return json(issue(email));
    }
    if (method === 'POST' && path === '/api/auth/refresh') {
      const email = state.sessions[data.refreshToken];
      return email
        ? json(issue(email))
        : fail(401, 'invalid_refresh', 'Session expired');
    }
    if (method === 'POST' && path === '/api/auth/logout') {
      delete state.sessions[data.refreshToken];
      save();
      return json({ ok: true });
    }
    if (method === 'POST' && path === '/api/auth/google') {
      // Google Identity Services ID token. The static demo has no server, so the
      // token is decoded in the browser and checked for audience + expiry only.
      const claims = decodeJwt(String(data.credential || ''));
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!claims || !clientId || claims.aud !== clientId)
        return fail(401, 'invalid_google_token', 'Google token rejected');
      if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now())
        return fail(401, 'invalid_google_token', 'Google token expired');
      const email = String(claims.email || '').toLowerCase();
      if (!email || claims.email_verified === false)
        return fail(401, 'invalid_google_token', 'Google email not verified');
      let found = state.users.find((u) => u.email === email);
      if (!found) {
        found = {
          email,
          password: token(),
          user: { id: crypto.randomUUID(), email, name: claims.name || email, locale: 'ar' },
        };
        state.users.push(found);
        state.watch[email] = [];
        state.alerts[email] = [];
        state.settings[email] = { ...snap.demo.settings, telegramChatId: null, expoPushToken: null, hasWebPush: false };
      }
      return json({ ...issue(email), picture: claims.picture ?? null });
    }
    if (method === 'POST' && path === '/api/auth/forgot') {
      const email = String(data.email || '').toLowerCase();
      const exists = state.users.some((u) => u.email === email);
      if (!exists) return json({ ok: true, demoCode: null });
      const code = String(Math.floor(100000 + Math.random() * 900000));
      state.resets = { ...(state.resets ?? {}), [email]: { code, exp: Date.now() + 15 * 60_000 } };
      save();
      // No mail server in the static demo: the code is returned so the UI can show it.
      return json({ ok: true, demoCode: code });
    }
    if (method === 'POST' && path === '/api/auth/reset') {
      const email = String(data.email || '').toLowerCase();
      const entry = state.resets?.[email];
      if (!entry || entry.code !== String(data.code || '').trim() || entry.exp < Date.now())
        return fail(400, 'invalid_code', 'Wrong or expired code');
      if (String(data.password || '').length < 8) return fail(400, 'invalid_body', 'Password too short');
      const found = state.users.find((u) => u.email === email);
      if (found) found.password = String(data.password);
      delete state.resets?.[email];
      for (const [k, v] of Object.entries(state.sessions)) if (v === email) delete state.sessions[k];
      save();
      return json({ ok: true });
    }
    if (path === '/api/events')
      return fail(
        503,
        'redis_unavailable',
        'Live events are off in the static demo',
      );
    if (path.startsWith('/api/admin'))
      return fail(403, 'forbidden', 'Admin is disabled in the static demo');

    const email = whoami(headers);
    if (!email) return fail(401, 'unauthorized', 'Sign in first');
    const user = state.users.find((u) => u.email === email)?.user;
    if (method === 'GET' && path === '/api/auth/me') return json(user);
    if (method === 'PATCH' && path === '/api/auth/me') {
      const found = state.users.find((u) => u.email === email);
      if (!found) return fail(404, 'not_found', 'No user');
      if (typeof data.name === 'string' && data.name.trim().length >= 2) found.user = { ...found.user, name: data.name.trim() };
      if (data.locale === 'ar' || data.locale === 'en') found.user = { ...found.user, locale: data.locale };
      save();
      return json(found.user);
    }
    if (method === 'POST' && path === '/api/auth/password') {
      const found = state.users.find((u) => u.email === email);
      if (!found || found.password !== data.current) return fail(400, 'wrong_password', 'Current password is wrong');
      if (String(data.next || '').length < 8) return fail(400, 'invalid_body', 'Password too short');
      found.password = String(data.next);
      save();
      return json({ ok: true });
    }
    if (method === 'POST' && path === '/api/auth/logout-all') {
      for (const [k, v] of Object.entries(state.sessions)) if (v === email) delete state.sessions[k];
      save();
      return json({ ok: true });
    }
    if (method === 'DELETE' && path === '/api/auth/me') {
      if (email === DEMO_EMAIL) return fail(400, 'demo_account', 'The shared demo account cannot be deleted');
      state.users = state.users.filter((u) => u.email !== email);
      for (const [k, v] of Object.entries(state.sessions)) if (v === email) delete state.sessions[k];
      delete state.watch[email];
      delete state.alerts[email];
      delete state.settings[email];
      save();
      return json({ ok: true });
    }

    if (path === '/api/watchlist' && method === 'GET')
      return json({ items: state.watch[email] ?? [] });
    if (path === '/api/watchlist' && method === 'POST') {
      const product = card(data.productId);
      if (!product) return fail(404, 'not_found', 'Product not found');
      state.watch[email] = state.watch[email] ?? [];
      const list = state.watch[email];
      const existing = list.find((w) => w.product.id === data.productId);
      if (existing) return json(existing);
      const item = {
        id: crypto.randomUUID(),
        targetPriceEgp: data.targetPriceEgp ?? null,
        createdAt: new Date().toISOString(),
        product,
      };
      list.unshift(item);
      save();
      return json(item, 201);
    }
    const watchMatch = path.match(/^\/api\/watchlist\/([^/]+)$/);
    if (watchMatch) {
      const list = state.watch[email] ?? [];
      const item = list.find((w) => w.id === watchMatch[1]);
      if (!item) return fail(404, 'not_found', 'Not in your watchlist');
      if (method === 'DELETE') {
        state.watch[email] = list.filter((w) => w !== item);
        save();
        return json({ ok: true });
      }
      item.targetPriceEgp = data.targetPriceEgp ?? null;
      save();
      return json(item);
    }
    if (path === '/api/alerts' && method === 'GET')
      return json({ items: state.alerts[email] ?? [] });
    const readMatch = path.match(/^\/api\/alerts\/([^/]+)\/read$/);
    if (readMatch && method === 'POST') {
      const alert = (state.alerts[email] ?? []).find(
        (a) => a.id === readMatch[1],
      );
      if (alert) alert.read = true;
      save();
      return json({ ok: true });
    }
    if (path === '/api/alerts/settings') {
      if (method === 'PATCH')
        state.settings[email] = { ...state.settings[email], ...data };
      save();
      return json(state.settings[email]);
    }
    if (path === '/api/alerts/test' && method === 'POST') {
      const alert = {
        id: crypto.randomUUID(),
        type: 'price_drop',
        title: 'تجربة تنبيه من صفقة',
        body: 'ده تنبيه تجريبي من النسخة التجريبية.',
        read: false,
        createdAt: new Date().toISOString(),
        productId: snap.all[0]?.id ?? null,
      };
      state.alerts[email] = [alert, ...(state.alerts[email] ?? [])];
      save();
      return json(alert);
    }
    if (path.startsWith('/api/push/')) return json({ ok: true });
    return fail(404, 'not_found', `No demo route for ${method} ${path}`);
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(
      request ? request.url : String(input),
      window.location.href,
    );
    if (
      url.origin !== window.location.origin ||
      !url.pathname.startsWith('/api/')
    )
      return realFetch(input, init);
    const method = (init?.method || request?.method || 'GET').toUpperCase();
    const headers = new Headers(init?.headers || request?.headers);
    const body =
      typeof init?.body === 'string'
        ? init.body
        : request
          ? await request.text()
          : null;
    await new Promise((r) => setTimeout(r, 120));
    return handle(method, url, headers, body);
  };
  (window as unknown as { __safqaDemo: unknown }).__safqaDemo = {
    recordedAt: snap.recordedAt,
    reset: () => {
      window.localStorage.removeItem(KEY);
      state = load();
    },
  };
}
