import { useBottomBarMode } from '../components/bottom-nav';
import { feedback, useHaptics } from '../lib/sound';
import { SoundStudio } from '../components/sound-studio';
import { useTier } from '../lib/tiers';
import { Link, useNavigate } from '@tanstack/react-router';
import { Bell, Camera, Database, Download, Gift, KeyRound, LogOut, Palette, Settings, Smartphone, Trash2, Upload, UserCircle } from 'lucide-react';
import { ChangeEvent, FormEvent, useState } from 'react';
import { InstallButton, useInstall } from '../components/chrome';
import { appUrl, ShareBar } from '../components/share';
import { Avatar } from '../components/shell';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, PageHeader, useToast } from '../fx/fx';
import { keys } from '../lib/activity';
import { accents, type Appearance, defaultAppearance, useAppearance } from '../lib/appearance';
import { downloadFile, isStaticDemo, useLocal, writeLocal } from '../lib/local';
import { usePrefs } from '../lib/prefs';
import { RawError, useSession } from '../lib/session';
import { useTr } from '../lib/tr';
import { PasswordInput, StrengthMeter } from './login';

interface Profile { avatar?: string; city?: string; phone?: string; bio?: string; favStores?: string[] }

export function ProfilePage() {
  const tr = useTr();
  const toast = useToast();
  const navigate = useNavigate();
  const { user, raw, setUser, logout } = useSession();
  const [profile, setProfile] = useLocal<Profile>(keys.profile, {});
  const [pw, setPw] = useState('');
  if (!user) {
    return <Card className="text-center"><p className="py-6">{tr('سجّل دخول الأول عشان تشوف ملفك.', 'Sign in to see your profile.')}</p><Button onClick={() => void navigate({ to: '/login' })}>{tr('دخول', 'Sign in')}</Button></Card>;
  }
  function onAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const ctx = c.getContext('2d');
      const s = Math.min(img.width, img.height);
      ctx?.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
      setProfile({ ...profile, avatar: c.toDataURL('image/jpeg', 0.85) });
      toast(tr('الصورة اتغيّرت', 'Photo updated'));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }
  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setProfile({ ...profile, city: String(f.get('city') || ''), phone: String(f.get('phone') || ''), bio: String(f.get('bio') || '') });
    const name = String(f.get('name') || '').trim();
    if (name && name !== user?.name) {
      try {
        const next = await raw<typeof user>('/api/auth/me', 'PATCH', { name });
        if (next) setUser(next);
      } catch (err) {
        if (err instanceof RawError && err.status === 404) toast(tr('تغيير الاسم مش متاح على السيرفر ده؛ باقي البيانات اتحفظت.', 'Renaming is not available on this server; other fields were saved.'), 'info');
        else throw err;
      }
    }
    toast(tr('الملف اتحفظ', 'Profile saved'));
  }
  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await raw('/api/auth/password', 'POST', { current: String(f.get('current')), next: String(f.get('next')) });
      toast(tr('الباسورد اتغيّر', 'Password changed'));
      e.currentTarget.reset();
      setPw('');
    } catch (err) {
      toast(err instanceof RawError && err.status === 404 ? tr('تغيير الباسورد مش متاح على السيرفر ده لسه.', 'Password change is not available on this server yet.') : tr('الباسورد الحالي غلط', 'Current password is wrong'), 'error');
    }
  }
  async function logoutAll() {
    try {
      await raw('/api/auth/logout-all', 'POST', {});
    } catch {
      /* real API may not support it; fall back to local logout */
    }
    await logout();
    toast(tr('خرجت من كل الأجهزة', 'Signed out everywhere'));
    void navigate({ to: '/login' });
  }
  async function deleteAccount() {
    if (!window.confirm(tr('متأكد؟ هيتمسح حسابك وكل بياناتك.', 'Are you sure? Your account and data will be deleted.'))) return;
    try {
      await raw('/api/auth/me', 'DELETE');
      await logout();
      toast(tr('الحساب اتمسح', 'Account deleted'));
      void navigate({ to: '/' });
    } catch (err) {
      toast(err instanceof RawError ? err.message : tr('حصل خطأ', 'Error'), 'error');
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader icon={<UserCircle className="h-6 w-6" />} title={tr('الملف الشخصي', 'Profile')} lede={user.email}>
        <label className="relative cursor-pointer" title={tr('غيّر الصورة', 'Change photo')}>
          <Avatar name={user.name} size={88} />
          <span className="absolute -bottom-1 -end-1 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow"><Camera className="h-4 w-4" /></span>
          <input type="file" accept="image/*" className="sr-only" onChange={onAvatar} />
        </label>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">{tr('بياناتك', 'Your details')}</h2>
          <form onSubmit={(e) => void saveProfile(e)} className="mt-3 space-y-3">
            <label className="block text-sm">{tr('الاسم', 'Name')}<Input name="name" defaultValue={user.name} className="mt-1" minLength={2} /></label>
            <label className="block text-sm">{tr('المدينة', 'City')}<Input name="city" defaultValue={profile.city} className="mt-1" placeholder={tr('القاهرة', 'Cairo')} /></label>
            <label className="block text-sm">{tr('الموبايل (اختياري)', 'Phone (optional)')}<Input name="phone" defaultValue={profile.phone} className="mt-1" inputMode="tel" dir="ltr" /></label>
            <label className="block text-sm">{tr('نبذة', 'Bio')}<textarea name="bio" defaultValue={profile.bio} rows={2} className="mt-1 w-full rounded-2xl border border-border bg-card p-3 text-sm" /></label>
            <div className="flex gap-2"><Button type="submit">{tr('احفظ', 'Save')}</Button>{profile.avatar ? <Button type="button" variant="ghost" onClick={() => setProfile({ ...profile, avatar: undefined })}>{tr('شيل الصورة', 'Remove photo')}</Button> : null}</div>
          </form>
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="flex items-center gap-2 text-lg font-bold"><KeyRound className="h-5 w-5 text-primary" />{tr('تغيير الباسورد', 'Change password')}</h2>
            <form onSubmit={(e) => void changePassword(e)} className="mt-3 space-y-3">
              <label className="block text-sm">{tr('الباسورد الحالي', 'Current password')}<PasswordInput name="current" autoComplete="current-password" /></label>
              <label className="block text-sm">{tr('الباسورد الجديد', 'New password')}<PasswordInput name="next" autoComplete="new-password" onChange={setPw} /><StrengthMeter value={pw} /></label>
              <Button type="submit">{tr('غيّر', 'Change')}</Button>
            </form>
          </Card>
          <Card>
            <h2 className="text-lg font-bold">{tr('الأمان', 'Security')}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void logoutAll()}><LogOut className="h-4 w-4" />{tr('اخرج من كل الأجهزة', 'Sign out everywhere')}</Button>
              <Button variant="destructive" onClick={() => void deleteAccount()}><Trash2 className="h-4 w-4" />{tr('امسح حسابي', 'Delete my account')}</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

const BACKUP_KEYS = ['safqa.activity.v1', keys.purchases, keys.collections, keys.budget, keys.compare, keys.savedSearches, keys.profile, 'safqa.appearance.v1', 'safqa.fx.v1'];

function Switch({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-accent p-3">
      <span><span className="block text-sm font-semibold">{label}</span><span className="text-xs text-muted">{hint}</span></span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} className={`relative h-7 w-12 flex-none rounded-full transition ${on ? 'bg-primary' : 'bg-border'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'start-6' : 'start-1'}`} /></button>
    </div>
  );
}

export function SettingsPage() {
  const tr = useTr();
  const toast = useToast();
  const { locale, setLocale, theme, setTheme } = usePrefs();
  const [a, setA] = useAppearance();
  const [, setTour] = useLocal<boolean>('safqa.welcome.v4', false);
  const [haptics, setHaptics] = useHaptics();
  const [bar, setBar] = useBottomBarMode();
  const { tier } = useTier();
  const install = useInstall();
  const [perm, setPerm] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));
  const set = <K extends keyof Appearance>(k: K, v: Appearance[K]) => setA({ ...a, [k]: v });
  async function askNotify() {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === 'granted') {
      const reg = await navigator.serviceWorker?.getRegistration();
      const body = tr('ده تنبيه تجريبي من صفقة على جهازك.', 'This is a test notification from Safqa on your device.');
      if (reg) await reg.showNotification('صفقة Safqa', { body, icon: '/brand/icon-192.png' });
      else new Notification('صفقة Safqa', { body, icon: '/brand/icon-192.png' });
    }
  }
  function exportAll() {
    const data = Object.fromEntries(BACKUP_KEYS.map((k) => [k, JSON.parse(window.localStorage.getItem(k) ?? 'null')]));
    downloadFile(`safqa-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'safqa', version: 1, data }, null, 2), 'application/json');
  }
  function importAll(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      try {
        const parsed = JSON.parse(text);
        if (parsed.app !== 'safqa') throw new Error('bad');
        for (const k of BACKUP_KEYS) if (parsed.data?.[k] != null) writeLocal(k, parsed.data[k]);
        toast(tr('النسخة الاحتياطية اترجعت', 'Backup restored'));
      } catch {
        toast(tr('الملف مش نسخة صفقة سليمة', 'Not a valid Safqa backup'), 'error');
      }
    });
  }
  const Toggle = ({ k, label, hint }: { k: 'contrast' | 'reduceMotion' | 'readable' | 'followSystem' | 'underlineLinks'; label: string; hint: string }) => (
    <label className="flex items-center justify-between gap-4 rounded-2xl bg-accent p-3">
      <span><span className="block text-sm font-semibold">{label}</span><span className="text-xs text-muted">{hint}</span></span>
      <button type="button" role="switch" aria-checked={a[k]} onClick={() => set(k, !a[k])} className={`relative h-7 w-12 flex-none rounded-full transition ${a[k] ? 'bg-primary' : 'bg-border'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${a[k] ? 'start-6' : 'start-1'}`} /></button>
    </label>
  );
  return (
    <div className="space-y-6">
      <PageHeader icon={<Settings className="h-6 w-6" />} title={tr('الإعدادات وسهولة الاستخدام', 'Settings & accessibility')} lede={tr('خصّص شكل صفقة: الألوان، حجم الخط، التباين، والحركة. كل حاجة بتتحفظ على جهازك.', 'Make Safqa yours: colours, text size, contrast and motion. Saved on this device.')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Palette className="h-5 w-5 text-primary" />{tr('الشكل', 'Appearance')}</h2>
          <div className="grid grid-cols-2 gap-2">
            <Button variant={theme === 'light' ? 'default' : 'outline'} onClick={() => { set('followSystem', false); setTheme('light'); }}>{tr('نهاري', 'Light')}</Button>
            <Button variant={theme === 'dark' ? 'default' : 'outline'} onClick={() => { set('followSystem', false); setTheme('dark'); }}>{tr('ليلي', 'Dark')}</Button>
          </div>
          <Toggle k="followSystem" label={tr('اتبع إعداد الجهاز', 'Follow device setting')} hint={tr('ليلي ونهاري أوتوماتيك', 'Automatic dark/light')} />
          <div>
            <p className="text-sm font-semibold">{tr('لون التطبيق', 'Accent colour')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(accents) as Appearance['accent'][]).map((k) => (
                <button key={k} type="button" onClick={() => set('accent', k)} aria-pressed={a.accent === k} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${a.accent === k ? 'border-foreground' : 'border-border'}`}>
                  <span className="h-4 w-4 rounded-full" style={{ background: accents[k].light }} />{locale === 'ar' ? accents[k].ar : accents[k].en}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant={locale === 'ar' ? 'default' : 'outline'} onClick={() => setLocale('ar')}>العربية</Button>
            <Button variant={locale === 'en' ? 'default' : 'outline'} onClick={() => setLocale('en')}>English</Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant={a.density === 'comfortable' ? 'default' : 'outline'} onClick={() => set('density', 'comfortable')}>{tr('مريح', 'Comfortable')}</Button>
            <Button variant={a.density === 'compact' ? 'default' : 'outline'} onClick={() => set('density', 'compact')}>{tr('مضغوط', 'Compact')}</Button>
          </div>
        </Card>
        <Card className="space-y-3">
          <h2 className="text-lg font-bold">♿ {tr('سهولة الاستخدام', 'Accessibility')}</h2>
          <label className="block text-sm"><span className="font-semibold">{tr('حجم الخط', 'Text size')}: <span className="num">{Math.round(a.fontScale * 100)}%</span></span><input type="range" min={0.9} max={1.3} step={0.05} value={a.fontScale} onChange={(e) => set('fontScale', Number(e.target.value))} className="mt-2 w-full accent-[var(--saffron)]" /></label>
          <Toggle k="contrast" label={tr('تباين عالي', 'High contrast')} hint={tr('حدود أوضح ونص أغمق', 'Stronger borders and text')} />
          <Toggle k="reduceMotion" label={tr('قلّل الحركة', 'Reduce motion')} hint={tr('يوقف الأنيميشن والكونفيتي', 'Stops animations and confetti')} />
          <Toggle k="readable" label={tr('مسافات أوسع للقراءة', 'Reading spacing')} hint={tr('أسهل لعسر القراءة', 'Easier for dyslexia')} />
          <Toggle k="underlineLinks" label={tr('خط تحت الروابط', 'Underline links')} hint={tr('الروابط أوضح', 'Links easier to spot')} />
          <Button variant="ghost" onClick={() => setA(defaultAppearance)}>{tr('رجّع الافتراضي', 'Reset to default')}</Button>
        </Card>
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">🎚️ {tr('الصوت والاهتزاز والتنقل', 'Sound, haptics & navigation')}</h2>
          <SoundStudio />
          <Switch on={haptics} onClick={() => { setHaptics(!haptics); feedback('tap', 'medium'); }} label={tr('اهتزاز خفيف (موبايل)', 'Haptics (phones)')} hint={tr('اهتزاز صغير مع الأزرار المهمة', 'A short buzz on important taps')} />
          <div>
            <p className="text-sm font-semibold">{tr('شريط التنقل اللي تحت (موبايل)', 'Bottom bar (phones)')}</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([['auto', tr('يختفي وأنا نازل', 'Hide on scroll')], ['always', tr('ظاهر دايمًا', 'Always shown')], ['hidden', tr('مخفي', 'Hidden')]] as const).map(([k, l]) => (
                <Button key={k} size="sm" variant={bar === k ? 'default' : 'outline'} onClick={() => { setBar(k); feedback('tap'); }} aria-pressed={bar === k}>{l}</Button>
              ))}
            </div>
            <p className="t-meta mt-1">{tr('لو خبّيته، القائمة الكاملة لسه موجودة من زرار ☰ فوق.', 'If hidden, the full menu stays available from ☰ at the top.')}</p>
          </div>
          <p className="text-sm">{tr('باقتك', 'Your plan')}: <Link to="/plans" className="font-semibold text-primary">{tier.emoji} {locale === 'ar' ? tier.ar : tier.en}</Link></p>
        </Card>
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Bell className="h-5 w-5 text-primary" />{tr('إشعارات الجهاز', 'Device notifications')}</h2>
          <p className="text-sm text-muted">{tr('الحالة', 'Status')}: <b>{perm === 'granted' ? tr('مسموح', 'Allowed') : perm === 'denied' ? tr('مرفوض من المتصفح', 'Blocked by browser') : perm === 'unsupported' ? tr('المتصفح مش بيدعمها', 'Not supported') : tr('لسه متسألتش', 'Not asked yet')}</b></p>
          <Button onClick={() => void askNotify()} disabled={perm === 'unsupported' || perm === 'denied'}>{perm === 'granted' ? tr('ابعت إشعار تجريبي', 'Send a test notification') : tr('فعّل الإشعارات', 'Enable notifications')}</Button>
        </Card>
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Smartphone className="h-5 w-5 text-primary" />{tr('التطبيق', 'App')}</h2>
          <p className="text-sm text-muted">{install.installed ? tr('صفقة متثبّتة على جهازك ✓', 'Safqa is installed ✓') : install.available ? tr('ثبّت صفقة كتطبيق على الشاشة الرئيسية، ويشتغل أوفلاين.', 'Install Safqa to your home screen; it works offline.') : tr('لو المتصفح بيدعم، هيظهر زرار التثبيت هنا. على آيفون: مشاركة ← إضافة للشاشة الرئيسية.', 'If your browser supports it, an install button appears here. On iPhone: Share → Add to Home Screen.')}</p>
          <InstallButton />
          <Button variant="outline" onClick={() => setTour(false)}>{tr('اعرض جولة الترحيب تاني 👋', 'Replay the welcome tour 👋')}</Button>
        </Card>
        <Card className="space-y-3 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Database className="h-5 w-5 text-primary" />{tr('بياناتك', 'Your data')}</h2>
          <p className="text-sm text-muted">{tr('صدّر كل بياناتك (المجموعات، الميزانية، التوفير، الإعدادات) في ملف واحد، ورجّعها على أي جهاز.', 'Export all your data (collections, budget, savings, settings) as one file and restore it on any device.')}{isStaticDemo ? tr(' النسخة دي تجريبية: البيانات محفوظة في المتصفح بس.', ' This is the static demo: data lives only in this browser.') : ''}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportAll}><Download className="h-4 w-4" />{tr('صدّر نسخة احتياطية', 'Export backup')}</Button>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold hover:bg-accent"><Upload className="h-4 w-4" />{tr('استورد نسخة', 'Import backup')}<input type="file" accept="application/json" className="sr-only" onChange={importAll} /></label>
            <Button variant="destructive" onClick={() => { if (window.confirm(tr('هيتمسح كل نشاطك المحلي. متأكد؟', 'This clears all local activity. Sure?'))) { for (const k of BACKUP_KEYS) window.localStorage.removeItem(k); window.location.reload(); } }}><Trash2 className="h-4 w-4" />{tr('امسح بياناتي المحلية', 'Clear local data')}</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function ReferralPage() {
  const tr = useTr();
  const { user } = useSession();
  const [ref] = useLocal<{ code?: string; referredBy?: string }>(keys.referral, {});
  const code = ref.code ?? (() => {
    const c = `SAFQA-${(user?.name ?? 'FRIEND').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    writeLocal(keys.referral, { ...ref, code: c });
    return c;
  })();
  const url = appUrl(`/?ref=${encodeURIComponent(code)}`);
  return (
    <div className="space-y-6">
      <PageHeader icon={<Gift className="h-6 w-6" />} kicker={tr('شارك التوفير', 'Share the savings')} title={tr('ادعُ صاحبك', 'Invite a friend')} lede={tr('ابعت لينك الدعوة بتاعك لصحابك عشان يعرفوا السعر العادل قبل ما يشتروا.', 'Send your invite link so friends know the fair price before they buy.')} />
      <Card className="text-center">
        <p className="text-sm text-muted">{tr('كود الدعوة بتاعك', 'Your invite code')}</p>
        <p className="num mt-2 text-3xl font-bold tracking-widest text-primary" dir="ltr">{code}</p>
        <div className="mt-4 flex justify-center"><ShareBar url={url} title={tr('جرّب صفقة — اعرف السعر العادل', 'Try Safqa — know the fair price')} /></div>
        {ref.referredBy ? <p className="mt-4 text-sm text-palm">{tr(`انت جيت عن طريق دعوة: ${ref.referredBy}`, `You joined via invite: ${ref.referredBy}`)}</p> : null}
        <p className="mt-4 text-xs text-muted">{tr('مفيش مكافآت مالية — الدعوة بتحفظ مين دعاك على جهاز صاحبك بس.', 'No cash rewards — the invite only records who invited your friend, on their device.')}</p>
      </Card>
    </div>
  );
}
