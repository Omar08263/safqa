import { useEffect, useRef, useState } from 'react';
import { isStaticDemo } from '../lib/local';
import { useSession } from '../lib/session';
import { useTr } from '../lib/tr';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void;
          renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const baseUrl = import.meta.env.VITE_API_URL || '';

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function GoogleButton({ onDone }: { onDone: () => void }) {
  const tr = useTr();
  const { raw, acceptTokens } = useSession();
  const slot = useRef<HTMLDivElement | null>(null);
  const [serverGoogle, setServerGoogle] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Real API mode: the server owns Google OAuth (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URL).
  useEffect(() => {
    if (isStaticDemo) return;
    fetch(`${baseUrl}/api/meta`)
      .then((r) => r.json())
      .then((m) => setServerGoogle(Boolean(m?.oauth?.google)))
      .catch(() => setServerGoogle(false));
  }, []);

  // Static mode: Google Identity Services in the browser, gated by VITE_GOOGLE_CLIENT_ID.
  useEffect(() => {
    if (!isStaticDemo || !clientId || !slot.current) return;
    const el = slot.current;
    const init = () => {
      window.google?.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          try {
            const res = await raw<{ accessToken: string; refreshToken: string; picture?: string | null }>('/api/auth/google', 'POST', { credential });
            if (res.picture) window.localStorage.setItem('safqa.googlePicture', res.picture);
            await acceptTokens(res.accessToken, res.refreshToken);
            onDone();
          } catch {
            setError(tr('جوجل رفض الدخول. جرّب تاني.', 'Google sign-in was rejected. Try again.'));
          }
        },
      });
      window.google?.accounts.id.renderButton(el, { theme: 'outline', size: 'large', shape: 'pill', width: 320, text: 'continue_with' });
    };
    if (window.google) init();
    else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = init;
      script.onerror = () => setError(tr('تعذّر تحميل خدمة جوجل.', 'Could not load Google services.'));
      document.head.appendChild(script);
    }
  }, [acceptTokens, onDone, raw, tr]);

  if (isStaticDemo && clientId) {
    return (
      <div>
        <div ref={slot} className="flex min-h-11 justify-center" />
        {error ? <p className="mt-2 text-center text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }
  if (!isStaticDemo && serverGoogle) {
    return (
      <a href={`${baseUrl}/api/auth/oauth/google`} className="press flex h-11 w-full items-center justify-center gap-3 rounded-full border border-border bg-white font-semibold text-[#1f1f1f] shadow-sm transition hover:shadow-md">
        <GoogleGlyph /> {tr('المتابعة بحساب جوجل', 'Continue with Google')}
      </a>
    );
  }
  return (
    <div data-testid="google-not-configured">
      <button type="button" disabled aria-disabled="true" className="flex h-11 w-full cursor-not-allowed items-center justify-center gap-3 rounded-full border border-border bg-white font-semibold text-[#1f1f1f] opacity-70">
        <GoogleGlyph /> {tr('المتابعة بحساب جوجل', 'Continue with Google')}
      </button>
      <p className="mt-2 text-center text-xs text-muted">
        {tr('تسجيل جوجل لسه مش متفعّل: محتاج Google Client ID من صاحب الموقع.', 'Google sign-in is not configured yet: the site owner needs to add a Google Client ID.')}
      </p>
    </div>
  );
}
