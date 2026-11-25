// One way to show money everywhere: grouped digits, a real gap before the currency, bidi-isolated.
import type { ReactNode } from 'react';

type Loc = 'ar' | 'en';
const group = (n: number) => Math.round(n).toLocaleString('en-US');

/** <Money v={6500} locale="ar" /> → «6,500 ج.م» as an isolated inline unit (currency never glued to digits). */
export function Money({ v, locale, className = '' }: { v: number; locale: Loc; className?: string }) {
  return (
    <span className={`money ${className}`} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {locale === 'ar' ? <><bdi className="money-n">{group(v)}</bdi><span className="money-c">ج.م</span></> : <><span className="money-c">EGP</span><bdi className="money-n">{group(v)}</bdi></>}
    </span>
  );
}

/** Formats free text from the API/agents: groups bare 4+ digit numbers (10699 → 10,699) and isolates every
 *  amount (with its ج.م / EGP / % suffix) so digits never jumble with the Arabic around them. */
export function NumText({ text }: { text: string }): ReactNode {
  const fixed = text.replace(/\d{4,}(?![\d,])/g, (d) => (d.length > 4 || Number(d) >= 1000 ? Number(d).toLocaleString('en-US') : d));
  const parts = fixed.split(/((?:EGP\s?)?\d[\d,]*(?:\.\d+)?(?:\s?(?:ج\.م|جنيه|ج|EGP|%|°))?)/g);
  return <>{parts.map((p, i) => (i % 2 ? <bdi key={i} className="num whitespace-nowrap">{p.replace(/(\d)\s?(ج\.م|جنيه|ج|EGP)/, '$1\u00a0$2').replace(/EGP\s?(\d)/, 'EGP\u00a0$1')}</bdi> : p))}</>;
}
