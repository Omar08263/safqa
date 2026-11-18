import { MessageCircle } from 'lucide-react';
import { ChannelsCard, TELEGRAM_BOT } from '../components/social';
import { Card, PageHeader } from '../fx/fx';
import { useCatalog } from '../lib/catalog';
import { useTr } from '../lib/tr';

export function ChannelsPage() {
  const tr = useTr();
  const catalog = useCatalog();
  const items = [...(catalog.data?.items ?? [])].filter((p) => p.bestOffer && !p.bestOffer.fakeDiscount).sort((a, b) => (b.bestOffer?.dealScore ?? 0) - (a.bestOffer?.dealScore ?? 0));
  return (
    <div className="space-y-8">
      <PageHeader kicker={tr('صفقة في جيبك', 'Safqa in your pocket')} title={tr('واتساب وتيليجرام', 'WhatsApp & Telegram')} lede={tr('خلّي أقوى العروض الحقيقية توصلك في المكان اللي بتتكلم فيه أصلًا. وكل حاجة هنا مكتوب جنبها هي شغالة إزاي بالظبط.', 'Get the strongest real deals where you already chat, with a plain note on exactly how each option works.')} icon={<MessageCircle className="h-6 w-6" />} />
      <ChannelsCard items={items} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card><p className="font-bold">✅ {tr('شغال دلوقتي', 'Works now')}</p><ul className="t-body mt-2 list-inside list-disc text-muted"><li>{tr('زرار واتساب وتيليجرام على كل منتج وكل عرض في الرادار', 'WhatsApp & Telegram buttons on every product and radar deal')}</li><li>{tr('رسالة جاهزة بأقوى 5 عروض النهارده', 'A ready message with today\'s top 5 deals')}</li><li>{tr('إشعارات المتصفح من صفحة الرادار', 'Browser notifications from the radar page')}</li></ul></Card>
        <Card><p className="font-bold">🛠️ {tr('جاهز ومستني ربط', 'Ready, waiting to be connected')}</p><ul className="t-body mt-2 list-inside list-disc text-muted"><li>{tr('سكربت ينشر عروض اليوم على قناة تيليجرام كل صبح (deploy/telegram/post-deals.ts)', 'A script that posts today\'s deals to a Telegram channel every morning (deploy/telegram/post-deals.ts)')}</li><li>{TELEGRAM_BOT ? tr(`البوت: @${TELEGRAM_BOT}`, `Bot: @${TELEGRAM_BOT}`) : tr('بوت تيليجرام: محتاج نعمله من BotFather وبعدين بيشتغل لوحده', 'Telegram bot: created via BotFather, then it runs on its own')}</li></ul></Card>
        <Card><p className="font-bold">🚫 {tr('مش متاح ببلاش', 'Not available for free')}</p><ul className="t-body mt-2 list-inside list-disc text-muted"><li>{tr('بوت واتساب بيرد أوتوماتيك: محتاج WhatsApp Business API مدفوع', 'An auto-replying WhatsApp bot needs the paid WhatsApp Business API')}</li></ul></Card>
      </div>
    </div>
  );
}
