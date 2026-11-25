import { ApiError } from '@safqa/api-client';
import { useNavigate } from '@tanstack/react-router';
import { Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck, Sparkles, User } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { GoogleButton } from '../components/google-button';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { confetti, Logo, useToast } from '../fx/fx';
import { isStaticDemo } from '../lib/local';
import { RawError, useSession } from '../lib/session';
import { useTr } from '../lib/tr';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

export function passwordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^\w\s]/.test(pw)) score++;
  return Math.min(4, score);
}

export function StrengthMeter({ value }: { value: string }) {
  const tr = useTr();
  const s = passwordStrength(value);
  const labels = [tr('ضعيفة جدًا', 'Very weak'), tr('ضعيفة', 'Weak'), tr('متوسطة', 'Fair'), tr('قوية', 'Strong'), tr('قوية جدًا', 'Very strong')];
  const colors = ['var(--clay)', 'var(--clay)', 'var(--saffron)', 'var(--palm)', 'var(--palm)'];
  if (!value) return null;
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-1.5 flex-1 rounded-full transition-colors" style={{ background: i < s ? colors[s] : 'var(--chip)' }} />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">{labels[s]}</p>
    </div>
  );
}

export function PasswordInput({ name, defaultValue, onChange, autoComplete }: { name: string; defaultValue?: string; onChange?: (v: string) => void; autoComplete?: string }) {
  const tr = useTr();
  const [show, setShow] = useState(false);
  return (
    <div className="relative mt-1">
      <Lock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <Input name={name} type={show ? 'text' : 'password'} required minLength={8} defaultValue={defaultValue} autoComplete={autoComplete} className="ps-9 pe-10" onChange={(e) => onChange?.(e.target.value)} />
      <button type="button" className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted hover:bg-accent" aria-label={show ? tr('إخفاء الباسورد', 'Hide password') : tr('إظهار الباسورد', 'Show password')} onClick={() => setShow(!show)}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function LoginPage() {
  const tr = useTr();
  const toast = useToast();
  const { login, register, acceptTokens, raw } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pw, setPw] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [remember, setRemember] = useState(() => window.localStorage.getItem('safqa.rememberEmail') ?? '');

  useEffect(() => {
    const hash = new URLSearchParams(window.location.search || window.location.hash.replace(/^#/, ''));
    const accessToken = hash.get('accessToken');
    const refreshToken = hash.get('refreshToken');
    if (!accessToken || !refreshToken) return;
    void acceptTokens(accessToken, refreshToken).then(() => {
      window.history.replaceState(null, '', '/login');
      void navigate({ to: '/dashboard' });
    });
  }, [acceptTokens, navigate]);

  const done = useCallback(() => {
    confetti({ count: 90 });
    toast(tr('أهلًا بيك في صفقة!', 'Welcome to Safqa!'));
    void navigate({ to: '/dashboard' });
  }, [navigate, toast, tr]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '').trim().toLowerCase();
    setPending(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'login') {
        await login(email, String(data.get('password')));
        if (data.get('remember')) window.localStorage.setItem('safqa.rememberEmail', email);
        else window.localStorage.removeItem('safqa.rememberEmail');
        setRemember(data.get('remember') ? email : '');
        done();
      } else if (mode === 'register') {
        if (!data.get('terms')) throw new Error(tr('لازم توافق على الشروط.', 'Please accept the terms.'));
        await register(String(data.get('name')), email, String(data.get('password')));
        done();
      } else if (mode === 'forgot') {
        const res = await raw<{ ok: boolean; demoCode: string | null }>('/api/auth/forgot', 'POST', { email });
        setResetEmail(email);
        setMode('reset');
        setInfo(
          res.demoCode
            ? tr(`نسخة تجريبية من غير سيرفر بريد: كود الاستعادة هو ${res.demoCode} (صالح 15 دقيقة).`, `Static demo with no mail server: your reset code is ${res.demoCode} (valid 15 minutes).`)
            : tr('لو الإيميل مسجّل، هيوصلك كود الاستعادة.', 'If that email is registered, a reset code is on its way.'),
        );
      } else {
        await raw('/api/auth/reset', 'POST', { email: resetEmail, code: String(data.get('code')), password: String(data.get('password')) });
        toast(tr('الباسورد اتغيّر. سجّل دخول بالجديد.', 'Password changed. Sign in with the new one.'));
        setMode('login');
      }
    } catch (caught) {
      if (caught instanceof RawError && caught.status === 404)
        setError(tr('استعادة الباسورد مش متاحة على السيرفر ده لسه.', 'Password reset is not available on this server yet.'));
      else setError(caught instanceof ApiError || caught instanceof RawError || caught instanceof Error ? caught.message : tr('حصل خطأ', 'Something went wrong'));
    } finally {
      setPending(false);
    }
  }

  const titles: Record<Mode, string> = {
    login: tr('أهلًا بيك تاني', 'Welcome back'),
    register: tr('اعمل حساب مجاني', 'Create a free account'),
    forgot: tr('نسيت الباسورد؟', 'Forgot password?'),
    reset: tr('اختار باسورد جديد', 'Choose a new password'),
  };

  return (
    <div className="grid items-stretch gap-6 lg:grid-cols-2">
      <aside className="page-hero relative hidden overflow-hidden rounded-[2rem] border border-border p-10 lg:block">
        <div className="mesh" aria-hidden="true" />
        <div className="relative flex h-full flex-col justify-between gap-8">
          <Logo size={56} sub={tr('اعرف السعر العادل قبل ما تدفع', 'Know the fair price before you pay')} />
          <div>
            <h2 className="text-4xl font-bold leading-tight">{tr('حسابك بيفتحلك كل المميزات.', 'Your account unlocks everything.')}</h2>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                tr('تنبيه لحظة ما السعر يوصل لهدفك', 'Alerts the moment a price hits your target'),
                tr('قوائم ومجموعات تشاركها بلينك وQR', 'Collections you can share by link and QR'),
                tr('متتبع توفير وميزانية وشارات إنجاز', 'Savings tracker, budget and achievement badges'),
                tr('بياناتك على جهازك، تصدّرها وقت ما تحب', 'Your data stays on your device; export it any time'),
              ].map((line) => (
                <li key={line} className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 flex-none text-palm" /> {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="glass float-slow max-w-xs rounded-2xl p-4 text-sm" style={{ ['--r' as string]: '-2deg' }}>
            <p className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" /> {tr('نزل السعر!', 'Price dropped!')}</p>
            <p className="mt-1 text-muted">{tr('سوني WH-1000XM5 بقت 14,999 ج.م على نون', 'Sony WH-1000XM5 is now EGP 14,999 on Noon')}</p>
          </div>
        </div>
      </aside>

      <div className="glass mx-auto w-full max-w-md rounded-[2rem] p-6 sm:p-8 page-enter">
        <div className="lg:hidden"><Logo size={44} /></div>
        <h1 className="mt-4 text-2xl font-bold lg:mt-0">{titles[mode]}</h1>
        {mode === 'login' || mode === 'register' ? (
          <>
            <div className="mt-4 grid grid-cols-2 rounded-full bg-accent p-1 text-sm" role="tablist">
              {(['login', 'register'] as const).map((m) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null); }} className={`rounded-full py-2 font-semibold transition ${mode === m ? 'bg-card shadow' : 'text-muted'}`}>
                  {m === 'login' ? tr('تسجيل الدخول', 'Sign in') : tr('حساب جديد', 'Sign up')}
                </button>
              ))}
            </div>
            <div className="mt-5"><GoogleButton onDone={done} /></div>
            <p className="mt-3 text-center text-[11px] leading-5 text-muted">
              {tr('بالمتابعة أنت توافق على', 'By continuing you agree to the')} <a href="/terms.html" className="font-semibold text-primary">{tr('الشروط والأحكام', 'Terms')}</a> {tr('و', 'and')} <a href="/privacy.html" className="font-semibold text-primary">{tr('سياسة الخصوصية', 'Privacy Policy')}</a>.
            </p>
            <div className="my-5 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-border" />{tr('أو بالبريد الإلكتروني', 'or with email')}<span className="h-px flex-1 bg-border" /></div>
          </>
        ) : null}
        {mode === 'login' && isStaticDemo ? (
          <p className="mb-3 rounded-2xl bg-accent px-3 py-2 text-xs text-muted">{tr('حساب تجريبي', 'Demo account')}: demo@safqa.app / demo1234</p>
        ) : null}
        <form onSubmit={onSubmit} className="space-y-3" key={mode}>
          {mode === 'register' ? (
            <label className="block text-sm">
              {tr('الاسم', 'Name')}
              <div className="relative mt-1"><User className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input name="name" className="ps-9" required minLength={2} autoComplete="name" /></div>
            </label>
          ) : null}
          {mode !== 'reset' ? (
            <label className="block text-sm">
              {tr('البريد الإلكتروني', 'Email')}
              <div className="relative mt-1"><Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input name="email" type="email" className="ps-9" required autoComplete="email" defaultValue={mode === 'login' ? remember || (isStaticDemo ? 'demo@safqa.app' : '') : ''} /></div>
            </label>
          ) : (
            <label className="block text-sm">
              {tr('كود الاستعادة (6 أرقام)', 'Reset code (6 digits)')}
              <div className="relative mt-1"><KeyRound className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input name="code" inputMode="numeric" pattern="[0-9]{6}" required className="ps-9 tracking-[0.4em]" /></div>
            </label>
          )}
          {mode !== 'forgot' ? (
            <label className="block text-sm">
              {mode === 'reset' ? tr('الباسورد الجديد', 'New password') : tr('الباسورد', 'Password')}
              <PasswordInput name="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} defaultValue={mode === 'login' && isStaticDemo && !remember ? 'demo1234' : undefined} onChange={setPw} />
              {mode !== 'login' ? <StrengthMeter value={pw} /> : null}
            </label>
          ) : null}
          {mode === 'login' ? (
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="remember" defaultChecked={Boolean(remember)} className="accent-[var(--saffron)]" /> {tr('افتكر إيميلي', 'Remember my email')}</label>
              <button type="button" className="font-semibold text-primary" onClick={() => { setMode('forgot'); setError(null); }}>{tr('نسيت الباسورد؟', 'Forgot password?')}</button>
            </div>
          ) : null}
          {mode === 'register' ? (
            <label className="flex items-start gap-2 text-xs text-muted"><input type="checkbox" name="terms" className="mt-0.5 accent-[var(--saffron)]" /> <span>{tr('أوافق على', 'I agree to the')} <a href="/terms.html" className="font-semibold text-primary">{tr('الشروط والأحكام', 'Terms')}</a> {tr('و', 'and')} <a href="/privacy.html" className="font-semibold text-primary">{tr('سياسة الخصوصية', 'Privacy Policy')}</a>{tr('، وإن بيانات التنبيهات تتحفظ عندي وأقدر أمسحها في أي وقت.', ', and that alert data is stored on my device and I can delete it any time.')}</span></label>
          ) : null}
          {info ? <p className="rounded-2xl bg-palm/10 px-3 py-2 text-sm text-palm">{info}</p> : null}
          {error ? <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}
          <Button type="submit" size="lg" disabled={pending} className="shine w-full">
            {pending ? tr('لحظة…', 'One moment…') : mode === 'login' ? tr('دخول', 'Sign in') : mode === 'register' ? tr('إنشاء الحساب', 'Create account') : mode === 'forgot' ? tr('ابعت كود الاستعادة', 'Send reset code') : tr('غيّر الباسورد', 'Change password')}
          </Button>
        </form>
        {mode === 'forgot' || mode === 'reset' ? (
          <button type="button" className="mt-4 text-sm text-muted" onClick={() => setMode('login')}>{tr('رجوع لتسجيل الدخول', 'Back to sign in')}</button>
        ) : null}
      </div>
    </div>
  );
}
