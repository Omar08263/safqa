import { formatEGP, localized } from '@safqa/shared';
import { useNavigate } from '@tanstack/react-router';
import { Layers, Plus, Trash2, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { DealCard } from '../components/bits';
import { appUrl, ShareBar } from '../components/share';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, PageHeader, Reveal, useToast } from '../fx/fx';
import { type Collection, keys } from '../lib/activity';
import { useCatalog } from '../lib/catalog';
import { useLocal } from '../lib/local';
import { usePrefs } from '../lib/prefs';
import { useTr } from '../lib/tr';

const emojis = ['🎁', '💍', '🏠', '🎮', '📱', '🎓', '🌙', '⭐'];

export function encodeCollection(c: Pick<Collection, 'name' | 'emoji' | 'ids'>) {
  const bytes = new TextEncoder().encode(JSON.stringify({ n: c.name, e: c.emoji, i: c.ids }));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeCollection(s: string): { name: string; emoji: string; ids: string[] } | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    return { name: String(o.n), emoji: String(o.e), ids: (o.i as unknown[]).map(String).slice(0, 50) };
  } catch {
    return null;
  }
}

export function CollectionsPage() {
  const tr = useTr();
  const toast = useToast();
  const { locale } = usePrefs();
  const catalog = useCatalog();
  const [list, setList] = useLocal<Collection[]>(keys.collections, []);
  const [emoji, setEmoji] = useState('🎁');
  const [open, setOpen] = useState<string | null>(null);
  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') || '').trim();
    if (!name) return;
    const c = { id: crypto.randomUUID(), name, emoji, ids: [], createdAt: new Date().toISOString() };
    setList([c, ...list]);
    setOpen(c.id);
    toast(tr('المجموعة اتعملت', 'Collection created'));
    e.currentTarget.reset();
  }
  const products = catalog.data?.items ?? [];
  return (
    <div>
      <PageHeader icon={<Layers className="h-6 w-6" />} kicker={tr('قوائم أمنيات وهدايا', 'Wishlists & gift lists')} title={tr('المجموعات', 'Collections')} lede={tr('اعمل قوائم زي "جهاز العروسة" أو "هدايا رمضان"، اعرف إجمالي سعرها، وشاركها بلينك أو QR.', 'Make lists like "wedding setup" or "Ramadan gifts", see their total, and share them by link or QR.')} />
      <Card className="mb-6">
        <form onSubmit={create} className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1" role="radiogroup" aria-label={tr('أيقونة', 'Icon')}>
            {emojis.map((e) => <button key={e} type="button" role="radio" aria-checked={emoji === e} onClick={() => setEmoji(e)} className={`grid h-9 w-9 place-items-center rounded-xl text-lg ${emoji === e ? 'bg-primary/20 ring-2 ring-primary' : 'bg-accent'}`}>{e}</button>)}
          </div>
          <Input name="name" placeholder={tr('اسم المجموعة', 'Collection name')} className="min-w-48 flex-1" required />
          <Button type="submit"><Plus className="h-4 w-4" />{tr('مجموعة جديدة', 'New collection')}</Button>
        </form>
      </Card>
      {list.length === 0 ? <p className="text-center text-muted">{tr('لسه معندكش مجموعات.', 'No collections yet.')}</p> : null}
      <div className="space-y-4">
        {list.map((c, ci) => {
          const items = c.ids.map((id) => products.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
          const total = items.reduce((s, p) => s + (p.bestOffer?.priceEgp ?? 0), 0);
          const isOpen = open === c.id;
          return (
            <Reveal key={c.id} delay={ci * 60}>
              <Card>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => setOpen(isOpen ? null : c.id)} className="flex flex-1 items-center gap-3 text-start" aria-expanded={isOpen}>
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-2xl">{c.emoji}</span>
                    <span><span className="block text-lg font-bold">{c.name}</span><span className="text-sm text-muted">{items.length} {tr('منتج', 'items')} · <span className="num">{formatEGP(total, locale)}</span></span></span>
                  </button>
                  <ShareBar url={appUrl(`/shared?d=${encodeCollection(c)}`)} title={c.name} />
                  <button type="button" aria-label={tr('امسح المجموعة', 'Delete collection')} onClick={() => setList(list.filter((x) => x.id !== c.id))} className="rounded-full p-2 hover:bg-accent"><Trash2 className="h-4 w-4 text-muted" /></button>
                </div>
                {isOpen ? (
                  <div className="page-enter mt-4">
                    <select aria-label={tr('ضيف منتج', 'Add product')} className="h-10 w-full rounded-full border border-border bg-card px-4 text-sm sm:w-80" value="" onChange={(e) => { const id = e.target.value; if (id) setList(list.map((x) => (x.id === c.id && !x.ids.includes(id) ? { ...x, ids: [...x.ids, id] } : x))); }}>
                      <option value="">{tr('+ ضيف منتج', '+ Add product')}</option>
                      {products.filter((p) => !c.ids.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{localized(locale, { ar: p.titleAr, en: p.titleEn })}</option>)}
                    </select>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {items.map((p, i) => (
                        <div key={p.id} className="relative">
                          <DealCard product={p} index={i} />
                          <button type="button" className="absolute -end-2 -top-2 z-30 grid h-7 w-7 place-items-center rounded-full bg-destructive text-white shadow" aria-label={tr('شيل', 'Remove')} onClick={() => setList(list.map((x) => (x.id === c.id ? { ...x, ids: x.ids.filter((y) => y !== p.id) } : x)))}><X className="h-4 w-4" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </Card>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}

export function SharedPage({ d }: { d?: string }) {
  const tr = useTr();
  const toast = useToast();
  const { locale } = usePrefs();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const [list, setList] = useLocal<Collection[]>(keys.collections, []);
  const data = d ? decodeCollection(d) : null;
  if (!data) return <Card className="text-center"><p className="py-8">{tr('اللينك ده مش سليم.', 'This link is not valid.')}</p></Card>;
  const items = data.ids.map((id) => catalog.data?.items.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const total = items.reduce((s, p) => s + (p.bestOffer?.priceEgp ?? 0), 0);
  return (
    <div>
      <PageHeader kicker={tr('مجموعة متشاركة معاك', 'A collection shared with you')} title={`${data.emoji} ${data.name}`} lede={tr(`${items.length} منتج · إجمالي ${formatEGP(total, locale)} بأحسن الأسعار دلوقتي`, `${items.length} items · ${formatEGP(total, locale)} total at today's best prices`)}>
        <Button onClick={() => { setList([{ id: crypto.randomUUID(), name: data.name, emoji: data.emoji, ids: data.ids, createdAt: new Date().toISOString() }, ...list]); toast(tr('اتحفظت في مجموعاتك', 'Saved to your collections')); void navigate({ to: '/collections' }); }}><Plus className="h-4 w-4" />{tr('احفظها عندي', 'Save a copy')}</Button>
      </PageHeader>
      <div className="deal-grid">{items.map((p, i) => <DealCard key={p.id} product={p} index={i} />)}</div>
    </div>
  );
}
