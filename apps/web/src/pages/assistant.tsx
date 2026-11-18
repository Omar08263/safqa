import type { ProductCard } from '@safqa/shared';
import { localized } from '@safqa/shared';
import { FormEvent, useState } from 'react';
import { DealCard } from '../components/bits';
import { Markdown } from '../components/markdown';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Bot, Sparkles } from 'lucide-react';
import { PageHeader } from '../fx/fx';
import { track } from '../lib/activity';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  provider?: string;
  products?: ProductCard[];
}

export function AssistantPage() {
  const { client } = useSession();
  const { t, locale } = usePrefs();
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);

  async function onSubmit(event: FormEvent | null, preset?: string) {
    event?.preventDefault();
    const message = (preset ?? text).trim();
    track.chat();
    if (!message) return;
    setText('');
    setTurns((current) => [...current, { role: 'user', text: message }]);
    setPending(true);
    try {
      const reply = await client.chat(message);
      setTurns((current) => [
        ...current,
        {
          role: 'assistant',
          text: reply.reply,
          provider: reply.provider,
          products: reply.products,
        },
      ]);
    } catch {
      setTurns((current) => [
        ...current,
        { role: 'assistant', text: t('common.error') },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader icon={<Bot className="h-6 w-6" />} title={t('nav.assistant')} lede={t('chat.empty')} />
      <div className="flex flex-wrap gap-2">
        {(locale === 'ar'
          ? ['ايه أحسن عرض النهارده؟', 'فين أرخص موبايل؟', 'هل خصم سوني حقيقي؟', 'عايز سماعة كويسة بأقل من 5000 جنيه']
          : ['Best laptop deal right now?', 'Cheapest headphones in stock', 'Which offers look fake?']
        ).map((q) => (
          <button key={q} type="button" disabled={pending} onClick={() => void onSubmit(null, q)} className="glass press rounded-full px-3 py-1.5 text-sm hover:border-primary">
            <Sparkles className="me-1 inline h-3.5 w-3.5 text-primary" />{q}
          </button>
        ))}
      </div>
      <div className="mt-6 space-y-4" aria-live="polite">
        {turns.map((turn, index) => (
          <div
            key={`${turn.role}-${index}`}
            className="rounded-3xl border border-border bg-card p-4"
          >
            <p className="text-xs text-muted">
              {turn.role === 'user'
                ? locale === 'ar'
                  ? 'أنت'
                  : 'You'
                : 'صفقة'}
            </p>
            {turn.role === 'assistant' ? (
              <div className="mt-1">
                <Markdown text={turn.text} />
              </div>
            ) : (
              <p className="mt-1 leading-7">{turn.text}</p>
            )}
            {turn.provider ? (
              <p className="mt-2 text-xs text-muted">{turn.provider}</p>
            ) : null}
            {turn.products && turn.products.length > 0 ? (
              <div className="deal-grid mt-3">
                {turn.products.map((product) => (
                  <DealCard key={product.id} product={product} />
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="mt-6 flex gap-2"
      >
        <label className="sr-only" htmlFor="assistant-q">
          {t('nav.assistant')}
        </label>
        <Input
          id="assistant-q"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('chat.placeholder')}
        />
        <Button type="submit" disabled={pending}>
          {t('chat.send')}
        </Button>
      </form>
      <p className="sr-only">
        {localized(locale, { ar: 'مساعد تسوق', en: 'Shopping assistant' })}
      </p>
    </div>
  );
}
