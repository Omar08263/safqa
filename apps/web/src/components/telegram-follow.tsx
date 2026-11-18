import { Send } from 'lucide-react';
import { TELEGRAM_BOT_URL } from '../lib/edge';
import { useTr } from '../lib/tr';

/** «تابعنا على تيليجرام» — opens @SafqaDealsBot (real AI agents + real price-drop alerts). */
export function TelegramFollowButton({ compact = false, url = TELEGRAM_BOT_URL }: { compact?: boolean; url?: string }) {
  const tr = useTr();
  return (
    <a href={url} target="_blank" rel="noreferrer" className={`press inline-flex items-center gap-2 rounded-full bg-[#229ED9] font-semibold text-white shadow-lg shadow-[#229ED9]/30 transition hover:brightness-110 ${compact ? 'h-9 px-3.5 text-sm' : 'h-11 px-5'}`}>
      <Send className="h-4 w-4" />
      {tr('تابعنا على تيليجرام', 'Follow us on Telegram')}
    </a>
  );
}
