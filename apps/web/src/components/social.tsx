import { TELEGRAM_BOT_URL } from '../lib/edge';
import { formatEGP, localized, type ProductCard } from '@safqa/shared';
import { MessageCircle, Send } from 'lucide-react';
import { useToast } from '../fx/fx';
import { track } from '../lib/activity';
import { usePrefs } from '../lib/prefs';
import { feedback } from '../lib/sound';
import { useTr } from '../lib/tr';
import { appUrl } from './share';

export const TELEGRAM_BOT: string = import.meta.env.VITE_TELEGRAM_BOT || '';

export const waLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
export const tgShareLink = (url: string, text: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

export function dealText(p: ProductCard, locale: 'ar' | 'en'): string {
  const o = p.bestOffer;
  const title = localized(locale, { ar: p.titleAr, en: p.titleEn });
  const store = o ? localized(locale, { ar: o.store.nameAr, en: o.store.nameEn }) : '';
  const price = o ? formatEGP(o.priceEgp, locale) : '';
  const score = o ? ` · ${locale === 'ar' ? 'درجة' : 'score'} ${o.dealScore}/100` : '';
  return locale === 'ar'
    ? `🔥 ${title}\n💰 ${price} في ${store}${score}\n👀 شوف تاريخ السعر قبل ما تشتري:`
    : `🔥 ${title}\n💰 ${price} at ${store}${score}\n👀 Check the price history first:`;
}

export function digestText(items: ProductCard[], locale: 'ar' | 'en'): string {
  const head = locale === 'ar' ? '📡 أقوى عروض النهارده من صفقة (أسعار حقيقية):' : "📡 Today's strongest deals from Safqa (real prices):";
  const lines = items.slice(0, 5).map((p, i) => {
    const o = p.bestOffer;
    return `${i + 1}. ${localized(locale, { ar: p.titleAr, en: p.titleEn })} — ${o ? formatEGP(o.priceEgp, locale) : ''}`;
  });
  return [head, ...lines, '', appUrl('/radar')].join('\n');
}

export function WhatsAppButton({ text, url, compact = false, label }: { text: string; url?: string; compact?: boolean; label?: string }) {
  const tr = useTr();
  const full = url ? `${text}\n${url}` : text;
  return (
    <a
      href={waLink(full)}
      target="_blank"
      rel="noreferrer"
      onClick={() => { track.share(); feedback('pop'); }}
      className={`press inline-flex items-center justify-center gap-1.5 rounded-full bg-[#25D366] font-semibold text-[#06391c] transition hover:brightness-105 ${compact ? 'h-9 w-9' : 'h-9 px-3.5 text-sm'}`}
      aria-label={label ?? tr('شارك على واتساب', 'Share on WhatsApp')}
      title={label ?? tr('شارك على واتساب', 'Share on WhatsApp')}
    >
      <WaIcon />
      {compact ? null : <span>{label ?? tr('واتساب', 'WhatsApp')}</span>}
    </a>
  );
}

export function TelegramButton({ text, url, compact = false }: { text: string; url: string; compact?: boolean }) {
  const tr = useTr();
  return (
    <a
      href={tgShareLink(url, text)}
      target="_blank"
      rel="noreferrer"
      onClick={() => { track.share(); feedback('pop'); }}
      className={`press inline-flex items-center justify-center gap-1.5 rounded-full bg-[#229ED9] font-semibold text-white transition hover:brightness-105 ${compact ? 'h-9 w-9' : 'h-9 px-3.5 text-sm'}`}
      aria-label={tr('شارك على تيليجرام', 'Share on Telegram')}
      title={tr('شارك على تيليجرام', 'Share on Telegram')}
    >
      <Send className="h-4 w-4" />
      {compact ? null : <span>{tr('تيليجرام', 'Telegram')}</span>}
    </a>
  );
}

/** "Deals on WhatsApp / Telegram" card. Honest about what is automatic and what is not. */
export function ChannelsCard({ items }: { items: ProductCard[] }) {
  const tr = useTr();
  const { locale } = usePrefs();
  const toast = useToast();
  const text = digestText(items, locale);
  return (
    <section className="grid gap-4 rounded-[1.75rem] border border-border bg-card p-5 md:grid-cols-2" aria-labelledby="channels-h">
      <div>
        <h2 id="channels-h" className="flex items-center gap-2 text-lg font-bold"><MessageCircle className="h-5 w-5 text-[#25D366]" />{tr('عروض النهارده على واتساب', "Today's deals on WhatsApp")}</h2>
        <p className="t-body mt-1 text-muted">{tr('دوسة واحدة وتبعت أقوى 5 عروض حقيقية لنفسك أو لجروب العيلة. الرسالة بتتكتب لوحدها وإنت اللي بتدوس إرسال.', 'One tap to send the 5 strongest real deals to yourself or a family group. The message is pre-written; you press send.')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <WhatsAppButton text={text} label={tr('ابعت العروض على واتساب', 'Send deals on WhatsApp')} />
          <button type="button" className="press h-9 rounded-full border border-border px-3.5 text-sm hover:bg-accent" onClick={() => { void navigator.clipboard?.writeText(text).then(() => toast(tr('الرسالة اتنسخت 📋', 'Message copied 📋'))); }}>{tr('انسخ الرسالة', 'Copy message')}</button>
        </div>
        <p className="t-meta mt-2">{tr('بوت واتساب أوتوماتيك محتاج حساب واتساب بيزنس مدفوع، فمش متاح دلوقتي. بنقولها بصراحة.', 'An automatic WhatsApp bot needs a paid WhatsApp Business API account, so it is not available yet. We say so plainly.')}</p>
      </div>
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><Send className="h-5 w-5 text-[#229ED9]" />{tr('صفقة على تيليجرام', 'Safqa on Telegram')}</h2>
        <p className="t-body mt-1 text-muted">{tr('بوت @SafqaDealsBot بيبعتلك أقوى عروض اليوم بأسعار حقيقية، وبينبهك لما منتج في قايمة متابعتك ينزل. دوس «ابدأ» في البوت وخلاص.', '@SafqaDealsBot sends the strongest real deals of the day and pings you when a watched product drops. Just press Start in the bot.')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={TELEGRAM_BOT_URL} target="_blank" rel="noreferrer" className="press inline-flex h-9 items-center gap-1.5 rounded-full bg-[#229ED9] px-3.5 text-sm font-semibold text-white"><Send className="h-4 w-4" />{tr('تابعنا على تيليجرام', 'Follow us on Telegram')}</a>
          <TelegramButton text={text} url={appUrl('/radar')} />
        </div>
      </div>
    </section>
  );
}

function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.9 9.9 0 0 0 12.04 2Zm5.8 14.13c-.24.68-1.42 1.3-1.95 1.35-.5.05-1.13.07-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.41.27-.29.58-.36.78-.36h.56c.18 0 .42-.07.66.5.24.59.82 2.03.89 2.18.07.14.12.31.02.5-.1.19-.14.31-.29.48-.14.17-.3.38-.43.51-.14.14-.29.3-.13.59.17.29.74 1.22 1.59 1.98 1.09.97 2.01 1.27 2.3 1.42.29.14.46.12.63-.07.17-.19.72-.84.92-1.13.19-.29.38-.24.65-.14.26.1 1.68.79 1.97.94.29.14.48.21.55.33.07.12.07.69-.17 1.37Z" />
    </svg>
  );
}
