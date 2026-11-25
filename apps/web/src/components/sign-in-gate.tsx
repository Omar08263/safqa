import { Link } from '@tanstack/react-router';
import { usePrefs } from '../lib/prefs';

/** One signed-out state for every members-only page: a real heading, why to sign in, and a way back here after. */
export function SignInGate({ emoji, ar, en, ledeAr, ledeEn }: { emoji: string; ar: string; en: string; ledeAr: string; ledeEn: string }) {
  const { locale } = usePrefs();
  const tr = (a: string, e: string) => (locale === 'ar' ? a : e);
  const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
  return (
    <section className="glass page-enter mx-auto max-w-xl rounded-[2rem] border border-border p-8 text-center shadow-sm">
      <p className="text-5xl" aria-hidden="true">{emoji}</p>
      <h1 className="mt-3 text-2xl font-bold">{tr(ar, en)}</h1>
      <p className="mt-2 text-[15px] leading-7 text-muted">{tr(ledeAr, ledeEn)}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/login" search={{ next } as never} className="press shine inline-flex h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground">
          {tr('سجّل دخول — ببلاش', 'Sign in — free')}
        </Link>
        <Link to="/radar" className="press inline-flex h-11 items-center rounded-full border border-border px-6 font-semibold">
          {tr('اتفرّج على العروض الأول', 'Browse deals first')}
        </Link>
      </div>
      <p className="mt-4 text-xs text-muted">{tr('حسابك بيفضل محفوظ 60 يوم على الجهاز ده، ومتزامن مع التطبيق وتيليجرام.', 'You stay signed in for 60 days on this device, synced with the app and Telegram.')}</p>
    </section>
  );
}
