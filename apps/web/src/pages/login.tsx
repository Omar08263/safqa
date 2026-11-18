import { ApiError } from '@safqa/api-client';
import { useNavigate } from '@tanstack/react-router';
import { FormEvent, useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';

export function LoginPage() {
  const { t } = usePrefs();
  const { login, register, acceptTokens } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = hash.get('accessToken');
    const refreshToken = hash.get('refreshToken');
    if (!accessToken || !refreshToken) return;
    void acceptTokens(accessToken, refreshToken).then(() => {
      window.location.hash = '';
      void navigate({ to: '/watchlist' });
    });
  }, [acceptTokens, navigate]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(String(data.get('email')), String(data.get('password')));
      } else {
        await register(String(data.get('name')), String(data.get('email')), String(data.get('password')));
      }
      void navigate({ to: '/watchlist' });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('auth.invalid'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-6">
      <h1 className="text-2xl font-semibold">{mode === 'login' ? t('action.login') : t('action.register')}</h1>
      <p className="mt-2 text-sm text-muted">
        {t('auth.demo')}: demo@safqa.app / demo1234
      </p>
      <form onSubmit={onSubmit} className="mt-5 space-y-3">
        {mode === 'register' ? (
          <label className="block text-sm">
            {t('auth.name')}
            <Input name="name" className="mt-1" required minLength={2} />
          </label>
        ) : null}
        <label className="block text-sm">
          {t('auth.email')}
          <Input name="email" type="email" className="mt-1" required defaultValue="demo@safqa.app" />
        </label>
        <label className="block text-sm">
          {t('auth.password')}
          <Input name="password" type="password" className="mt-1" required minLength={8} defaultValue="demo1234" />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={pending} className="w-full">
          {mode === 'login' ? t('action.login') : t('action.register')}
        </Button>
      </form>
      <button
        type="button"
        className="mt-4 text-sm text-muted"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
      >
        {mode === 'login' ? t('auth.switchRegister') : t('auth.switchLogin')}
      </button>
    </div>
  );
}
