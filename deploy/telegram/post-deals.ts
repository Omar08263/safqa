/**
 * Posts today's strongest REAL deals to a Safqa Telegram channel or chat.
 *
 *   npx tsx deploy/telegram/post-deals.ts [--dry-run] [--snapshot=<path|url>]
 *
 * Env (read from the process or from /home/box/.safqa/telegram.env if present):
 *   TELEGRAM_BOT_TOKEN  bot token from @BotFather (never commit it)
 *   TELEGRAM_CHAT_ID    channel username (@safqa_eg) or numeric chat id
 *   SAFQA_SITE          default https://safqa-eg-safqa.static.hf.space
 * Without a token it prints the message and exits 0, so routines never fail.
 * The same deal set is not posted twice (state in ~/.safqa/telegram-last.json).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const envFile = process.env.SAFQA_TELEGRAM_ENV || '/home/box/.safqa/telegram.env';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2];
  }
}
const token = process.env.TELEGRAM_BOT_TOKEN || '';
const chat = process.env.TELEGRAM_CHAT_ID || '';
const site = (process.env.SAFQA_SITE || 'https://safqa-eg-safqa.static.hf.space').replace(/\/$/, '');
const dry = process.argv.includes('--dry-run') || !token || !chat;
const snapArg = process.argv.find((a) => a.startsWith('--snapshot='))?.split('=')[1];
const statePath = resolve(homedir(), '.safqa/telegram-last.json');

interface Offer { priceEgp: number; listPriceEgp: number | null; dealScore: number; fakeDiscount: boolean; inStock: boolean; discountPct: number | null; store: { nameAr: string } }
interface Card { id: string; titleAr: string; bestOffer: Offer | null }

async function loadSnapshot(): Promise<{ recordedAt: string; all: Card[] }> {
  const src = snapArg || (existsSync(resolve(root, 'apps/web/public/demo/snapshot.json')) ? resolve(root, 'apps/web/public/demo/snapshot.json') : `${site}/demo/snapshot.json`);
  if (/^https?:/.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
    return (await res.json()) as { recordedAt: string; all: Card[] };
  }
  return JSON.parse(readFileSync(src, 'utf8'));
}

const fmt = (n: number) => `${Math.round(n).toLocaleString('en-US')} ج.م`;
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);

const snap = await loadSnapshot();
const deals = snap.all
  .filter((p) => p.bestOffer && p.bestOffer.inStock && !p.bestOffer.fakeDiscount)
  .sort((a, b) => (b.bestOffer!.dealScore - a.bestOffer!.dealScore) || ((b.bestOffer!.discountPct ?? 0) - (a.bestOffer!.discountPct ?? 0)))
  .slice(0, 5);
if (deals.length === 0) {
  console.log('telegram: no deals in the snapshot; nothing to post');
  process.exit(0);
}
const when = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', dateStyle: 'medium' }).format(new Date(snap.recordedAt));
const lines = deals.map((p, i) => {
  const o = p.bestOffer!;
  const off = o.listPriceEgp && o.listPriceEgp > o.priceEgp ? ` <s>${fmt(o.listPriceEgp)}</s>` : '';
  return `${['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i]} <a href="${site}/#/product/${p.id}">${esc(p.titleAr)}</a>\n   💰 <b>${fmt(o.priceEgp)}</b>${off} · ${esc(o.store.nameAr)} · درجة ${o.dealScore}/100`;
});
const text = [`📡 <b>أقوى عروض النهارده من صفقة</b> (${when})`, 'أسعار حقيقية من صفحات المتاجر نفسها، والخصومات الوهمية مستبعدة.', '', ...lines, '', `🔎 كل العروض: ${site}/#/radar`].join('\n');

const fingerprint = deals.map((p) => `${p.id}:${p.bestOffer!.priceEgp}`).join('|');
const last = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
if (dry) {
  console.log(token && chat ? '--- dry run ---' : 'telegram: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set; printing instead of posting');
  console.log(text);
  process.exit(0);
}
if (last.fingerprint === fingerprint) {
  console.log('telegram: same deals as the last post; skipping');
  process.exit(0);
}
const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: false }),
});
const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
if (!res.ok || !body.ok) {
  console.error(`telegram: post failed (${res.status}) ${body.description ?? ''}`);
  process.exit(1);
}
writeFileSync(statePath, JSON.stringify({ fingerprint, at: new Date().toISOString() }));
console.log(`telegram: posted ${deals.length} deals to ${chat}`);
