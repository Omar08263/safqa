// Builds Safqa's daily deals digest (HTML + text) from the recorded snapshot.
// DRY RUN ONLY: this script never sends mail. Sending is done by the owner's
// approved routine, only to addresses that opted in by emailing SAFQA SUBSCRIBE
// to the digest inbox (and did not later send UNSUBSCRIBE). See docs/email-digest.md.
//
//   npx tsx deploy/hf/email-digest.ts [snapshot.json] [outDir]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { signalsFrom } from '../../apps/web/src/lib/deal-signals';

const snapPath = process.argv[2] || 'apps/web/public/demo/snapshot.json';
const outDir = process.argv[3] || '/workspace/safqa-digest';
const SITE = 'https://safqa-eg-safqa.static.hf.space';
const INBOX = 'rxcc@agentmail.to';
const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
const items = snap.all;
const histories = Object.fromEntries(Object.entries(snap.products).map(([id, v]: [string, any]) => [id, v.history]));
const signals = signalsFrom(items, histories);
const drops = signals.filter((s) => s.kind === 'drop' || s.kind === 'all_time_low');
const fakes = signals.filter((s) => s.kind === 'fake_discount');
const top = [...items].filter((p: any) => p.bestOffer).sort((a: any, b: any) => b.bestOffer.dealScore - a.bestOffer.dealScore).slice(0, 5);
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const date = new Date(snap.recordedAt).toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'long' });
const subject = drops.length ? `🔥 ${drops.length} تخفيض حقيقي النهارده — ملخص صفقة ${date}` : `📊 ملخص صفقة ${date}: أحسن ${top.length} صفقات دلوقتي`;
const link = (id: string) => `${SITE}/#/product/${id}`;
const row = (title: string, sub: string, href: string, img?: string | null) => `<tr><td style="padding:10px 0;border-top:1px solid #eee">${img ? `<img src="${SITE}${img}" width="64" height="64" style="border-radius:12px;object-fit:contain;background:#f6f1e7;vertical-align:middle;margin-left:10px" alt="">` : ''}<a href="${href}" style="color:#1c1915;font-weight:700;text-decoration:none">${esc(title)}</a><div style="color:#6b6257;font-size:13px">${esc(sub)}</div></td></tr>`;
const html = `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#fffaf3;font-family:Tahoma,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table width="560" style="max-width:560px;padding:24px">
<tr><td><img src="${SITE}/brand/icon-192.png" width="48" height="48" alt="صفقة" style="border-radius:12px"> <span style="font-size:22px;font-weight:800;color:#1c1915">ملخص صفقة اليومي</span><div style="color:#6b6257">${esc(date)} · أسعار حقيقية من آخر تحديث</div></td></tr>
${drops.length ? `<tr><td style="padding-top:18px;font-size:18px;font-weight:800">🔥 تخفيضات حقيقية</td></tr>${drops.slice(0, 8).map((s) => row(s.headline, `${s.store} · ${fmt(s.priceEgp)} ج`, link(s.productId), items.find((p: any) => p.id === s.productId)?.image)).join('')}` : `<tr><td style="padding-top:18px;color:#6b6257">مفيش تخفيضات حقيقية في آخر 24 ساعة — ودي معلومة مهمة برضه: متستعجلش.</td></tr>`}
<tr><td style="padding-top:18px;font-size:18px;font-weight:800">🏆 أعلى درجات الصفقة دلوقتي</td></tr>
${top.map((p: any) => row(p.titleAr, `${p.bestOffer.store.nameAr} · ${fmt(p.lowestPriceEgp)} ج · درجة ${p.bestOffer.dealScore}/100`, link(p.id), p.image)).join('')}
${fakes.length ? `<tr><td style="padding-top:18px;font-size:18px;font-weight:800">⚠️ خصومات مشبوهة</td></tr>${fakes.slice(0, 5).map((s) => row(s.headline, s.body, link(s.productId))).join('')}` : ''}
<tr><td style="padding-top:24px"><a href="${SITE}/#/radar" style="background:#d99a1b;color:#fff;padding:12px 20px;border-radius:14px;text-decoration:none;font-weight:700">افتح رادار العروض</a></td></tr>
<tr><td style="padding-top:24px;color:#8a8175;font-size:12px">وصلك الإيميل ده لأنك بعت SAFQA SUBSCRIBE لـ ${INBOX}. لإلغاء الاشتراك ابعت UNSUBSCRIBE لنفس العنوان وهيتشال إيميلك من القايمة قبل الإرسال الجاي.</td></tr>
</table></td></tr></table></body></html>`;
const text = [`${subject}`, '', ...(drops.length ? drops.slice(0, 8).map((s) => `• ${s.headline} — ${link(s.productId)}`) : ['مفيش تخفيضات حقيقية في آخر 24 ساعة.']), '', 'أعلى درجات الصفقة:', ...top.map((p: any) => `• ${p.titleAr}: ${fmt(p.lowestPriceEgp)} ج (${p.bestOffer.dealScore}/100) — ${link(p.id)}`), '', `لإلغاء الاشتراك ابعت UNSUBSCRIBE لـ ${INBOX}`].join('\n');
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/digest.html`, html);
writeFileSync(`${outDir}/digest.txt`, text);
writeFileSync(`${outDir}/digest.json`, JSON.stringify({ subject, from: INBOX, builtAt: new Date().toISOString(), snapshotAt: snap.recordedAt, drops: drops.length, fakes: fakes.length }, null, 1));
console.log(`digest built (dry run, nothing sent): ${outDir} — ${subject}`);
