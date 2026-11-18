import { createSafqaClient } from '@safqa/api-client';

const base = process.env.API_PUBLIC_URL ?? 'http://127.0.0.1:8787';

function client(token: string) {
  return createSafqaClient({ baseUrl: base, getAccessToken: () => token });
}

const anon = createSafqaClient({ baseUrl: base, getAccessToken: () => null });
const auth = await anon.login({ email: 'demo@safqa.app', password: 'demo1234' });
const web = client(auth.accessToken);
const mobile = client(auth.accessToken);

const deals = await web.deals();
const watching = new Set((await mobile.watchlist()).items.map((item) => item.product.id));
const product = deals.items.find((item) => !watching.has(item.id)) ?? deals.items[0];
if (!product) throw new Error('seeded deals are missing');

const seen: string[] = [];
const stop = mobile.subscribe((event) => {
  seen.push(event.type);
});

const added = await web.addWatch(product.id, 12345);
const reflected = await mobile.watchlist();
if (!reflected.items.some((item) => item.id === added.id)) {
  throw new Error('watchlist write from web was not visible to the mobile client');
}

const started = Date.now();
while (!seen.includes('watchlist.updated') && Date.now() - started < 4000) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}
stop();
await web.removeWatch(added.id);
const after = await mobile.watchlist();
if (after.items.some((item) => item.id === added.id)) {
  throw new Error('watchlist delete from web was still visible to the mobile client');
}

if (!seen.includes('watchlist.updated')) {
  throw new Error(`SSE did not deliver watchlist.updated (saw ${seen.join(',') || 'nothing'})`);
}

console.log(`sync ok for ${product.titleEn} via REST + SSE`);
