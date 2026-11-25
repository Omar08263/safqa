// 🔔 ntfy phone push opt-in (https://ntfy.sh, open source). Private HMAC topic per user.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { edge, signedInToBackend } from '../lib/edge';
import { useFlag } from '../lib/remote';
import { useTr } from '../lib/tr';
import { useToast } from '../fx/fx';

interface NtfyInfo { on: boolean; enabled: boolean; topic: string; server: string; web: string; app: string; android: string; ios: string; fdroid: string }

export function NtfyCard() {
  const on = useFlag('sys_ntfy', true);
  const tr = useTr();
  const toast = useToast();
  const qc = useQueryClient();
  const signed = signedInToBackend();
  const q = useQuery({ queryKey: ['v6', 'ntfy'], queryFn: () => edge<NtfyInfo>('/api/v6/ntfy'), enabled: on && signed, retry: 0 });
  const save = useMutation({
    mutationFn: (enabled: boolean) => edge<NtfyInfo>('/api/v6/ntfy', { method: 'PUT', body: { enabled } }),
    onSuccess: (d) => { qc.setQueryData(['v6', 'ntfy'], d); toast(d.enabled ? tr('الجرس اتفعّل 🔔', 'Phone push on 🔔') : tr('الجرس اتقفل', 'Phone push off'), 'success'); },
    onError: (e: Error) => toast(/write_cap|2 بالليل/.test(e.message) ? tr('الحفظ متوقف مؤقتًا لحد 2 بالليل بتوقيت القاهرة — جرّب بعدها', 'Saving paused until 02:00 Cairo — try later') : tr('مقدرناش نحفظ', 'Could not save'), 'error'),
  });
  const test = useMutation({ mutationFn: () => edge<{ ok: boolean }>('/api/v6/ntfy/test', { method: 'POST' }), onSuccess: (r) => toast(r.ok ? tr('بعتنا إشعار تجريبي — بص على موبايلك', 'Test sent — check your phone') : tr('خدمة ntfy مردتش — جرّب تاني', 'ntfy did not answer'), r.ok ? 'success' : 'error') });
  if (!on || !signed) return null;
  const d = q.data;
  return (
    <div className="space-y-3 rounded-3xl border border-border bg-card p-4 text-sm">
      <p className="text-base font-bold">🔔 {tr('جرس الموبايل (من غير رقم ولا إيميل)', 'Phone push (no number, no email)')}</p>
      <p className="t-meta">{tr('بنبعت تنبيهاتك الذكية على تطبيق ntfy المجاني والمفتوح المصدر، على قناة سرّية خاصة بيك. مش محتاج تدينا رقمك.', 'We send your smart alerts to the free, open-source ntfy app on a private channel only you know. No phone number needed.')}</p>
      {d ? (
        <>
          <ol className="list-decimal space-y-1 ps-5">
            <li>{tr('نزّل تطبيق ntfy:', 'Install ntfy:')} <a className="font-semibold text-primary" href={d.android} target="_blank" rel="noopener noreferrer">Android</a> · <a className="font-semibold text-primary" href={d.ios} target="_blank" rel="noopener noreferrer">iPhone</a> · <a className="font-semibold text-primary" href={d.fdroid} target="_blank" rel="noopener noreferrer">F-Droid</a></li>
            <li>{tr('اشترك في قناتك:', 'Subscribe to your channel:')} <code className="num select-all rounded bg-accent px-1.5 py-0.5" dir="ltr">{d.topic}</code> <button type="button" className="text-xs font-semibold text-primary" onClick={() => { navigator.clipboard?.writeText(d.topic); toast(tr('اتنسخ', 'Copied')); }}>{tr('انسخ', 'Copy')}</button> · <a className="font-semibold text-primary" href={d.web} target="_blank" rel="noopener noreferrer">{tr('أو افتحها في المتصفح', 'or open in browser')}</a></li>
            <li>{tr('فعّل الجرس هنا وجرّب.', 'Turn it on here and test.')}</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={d.enabled} onClick={() => save.mutate(!d.enabled)} className={`press rounded-full px-4 py-2 font-bold ${d.enabled ? 'bg-foreground text-background' : 'bg-primary text-primary-foreground'}`}>{d.enabled ? tr('✓ شغّال — اقفله', '✓ On — turn off') : tr('فعّل الجرس', 'Turn on')}</button>
            <button type="button" onClick={() => test.mutate()} className="press rounded-full border border-border px-4 py-2 font-bold">{tr('ابعت تجربة', 'Send a test')}</button>
          </div>
          <p className="t-meta">{tr('الإشعارات بتعدّي على سيرفر ntfy.sh العام — متبعتش فيها أي بيانات شخصية، بس اسم المنتج وسعره.', 'Pushes go through the public ntfy.sh server — only product name and price, nothing personal.')}</p>
        </>
      ) : <p className="t-meta">{q.isError ? tr('مقدرناش نجيب إعدادات الجرس دلوقتي.', 'Could not load push settings.') : '…'}</p>}
    </div>
  );
}
