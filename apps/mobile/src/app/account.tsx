import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useToast } from '../components/toast';
import { Badge, Button, Card, Chip, SectionTitle } from '../components/ui';
import { ApiError, login, logout, refreshMe, register, TELEGRAM_URL, tierOf, useAuth } from '../lib/api';
import { SITE_URL } from '../lib/data';
import { success, warn } from '../lib/feedback';
import { egp } from '../lib/format';
import { useGrid } from '../lib/layout';
import { syncWatchlist } from '../lib/store';
import { radius, type as t, useColors } from '../lib/theme';

export default function Account() {
  const c = useColors();
  const { gutter, tablet } = useGrid();
  const auth = useAuth();
  const toast = useToast();
  const mine = tierOf(auth);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.includes('@') || password.length < 8) {
      setError('اكتب إيميل صح وكلمة سر 8 حروف على الأقل.');
      return;
    }
    setBusy(true);
    try {
      const u = mode === 'login' ? await login(email, password) : await register(name || email.split('@')[0]!, email, password);
      success();
      const r = await syncWatchlist();
      toast({ text: `أهلاً ${u.name.split(' ')[0]} 👋${r && (r.up || r.down) ? ` · زامنّا ${r.up + r.down} منتج` : ''}` });
    } catch (e) {
      warn();
      setError(e instanceof ApiError ? (e.status === 401 ? 'الإيميل أو الباسورد مش مظبوطين. راجعهم كده تاني.' : e.message) : 'مفيش اتصال بالسيرفر دلوقتي. جرّب تاني كمان شوية.');
    } finally {
      setBusy(false);
    }
  };

  const input = [t.body, { color: c.ink, borderColor: c.line, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, minHeight: 50, textAlign: 'right' as const, backgroundColor: c.bg }];
  const openPay = (id: string) => void WebBrowser.openBrowserAsync(`${SITE_URL}/pay?tier=${id}`);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: gutter, paddingBottom: 40, gap: 14 }} keyboardShouldPersistTaps="handled">
        {auth.user ? (
          <Card style={{ gap: 8 }}>
            <Text style={[t.h2, { color: c.ink }]}>{auth.user.name}</Text>
            <Text style={[t.small, { color: c.muted }]} selectable>{auth.user.email}</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge text={`${mine.emoji} باقة ${mine.ar}`} color={mine.color} />
              {auth.user.tierUntil ? <Text style={[t.meta, { color: c.muted }]}>لحد {new Date(auth.user.tierUntil).toLocaleDateString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo' })}</Text> : null}
            </View>
            <Text style={[t.meta, { color: c.muted }]}>الباقة بتتقري من السيرفر، فهي نفسها على الموقع وتيليجرام.</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <Chip label="🔄 حدّث باقتي" onPress={() => void refreshMe().then(() => toast({ text: 'اتحدثت ✨' }))} />
              <Chip label="↩️ خروج" onPress={() => void logout().then(() => toast({ text: 'خرجت. المراقبة لسه محفوظة على الموبايل.' }))} />
            </View>
          </Card>
        ) : (
          <Card style={{ gap: 10 }}>
            <SectionTitle title={mode === 'login' ? 'ادخل حسابك' : 'حساب جديد في ثانية'} hint="نفس حساب موقع صفقة: المراقبة والباقة والتنبيهات تتزامن في كل مكان." />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="دخول" active={mode === 'login'} onPress={() => setMode('login')} />
              <Chip label="حساب جديد" active={mode === 'register'} onPress={() => setMode('register')} />
            </View>
            {mode === 'register' ? <TextInput value={name} onChangeText={setName} placeholder="اسمك" placeholderTextColor={c.muted} accessibilityLabel="الاسم" style={input} autoComplete="name" /> : null}
            <TextInput value={email} onChangeText={setEmail} placeholder="الإيميل" placeholderTextColor={c.muted} accessibilityLabel="الإيميل" keyboardType="email-address" autoCapitalize="none" autoComplete="email" style={input} />
            <TextInput value={password} onChangeText={setPassword} placeholder="الباسورد (8 حروف أو أكتر)" placeholderTextColor={c.muted} accessibilityLabel="الباسورد" secureTextEntry autoComplete={mode === 'login' ? 'current-password' : 'new-password'} style={input} onSubmitEditing={() => void submit()} />
            {error ? <Text style={[t.small, { color: c.clay }]} accessibilityLiveRegion="assertive">{error}</Text> : null}
            {busy ? <ActivityIndicator color={c.palm} /> : <Button label={mode === 'login' ? 'ادخل' : 'اعمل الحساب'} kind="palm" onPress={() => void submit()} />}
            <Pressable onPress={() => void WebBrowser.openBrowserAsync(`${SITE_URL}/login`)} accessibilityRole="link">
              <Text style={[t.meta, { color: c.muted, textAlign: 'center' }]}>بتدخل بجوجل على الموقع؟ ادخل من الموقع واعمل كلمة سر من حسابك، وبعدين استخدمها هنا.</Text>
            </Pressable>
          </Card>
        )}

        <SectionTitle title="الباقات" hint="الدفع بإنستاباي من صفحة الدفع على موقع صفقة، من غير بطاقات ومن غير تجديد تلقائي." />
        <View style={{ flexDirection: tablet ? 'row' : 'column', gap: 10, flexWrap: 'wrap' }}>
          {auth.tiers.map((x) => {
            const active = x.id === mine.id;
            return (
              <Card key={x.id} style={{ flex: 1, minWidth: 220, gap: 6, borderColor: active ? c.palm : c.line }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[t.h3, { color: c.ink }]}>{x.emoji} {x.ar}</Text>
                  <Text style={[t.title, { color: c.ink }]}>{x.price ? `${egp(x.price)} / شهر` : 'ببلاش'}</Text>
                </View>
                <Text style={[t.small, { color: c.muted }]}>{x.limits.watchlist} منتج في المراقبة · {x.limits.alerts} تنبيه · {x.limits.agentQuestionsPerDay} سؤال للوكلاء يوميًا</Text>
                {active ? (
                  <Text style={[t.small, { color: c.palm, fontWeight: '700' }]}>باقتك الحالية ✓</Text>
                ) : x.price > 0 && x.price > mine.price ? (
                  <Button label={`رقّي لـ${x.ar}`} onPress={() => (auth.user ? openPay(x.id) : (setMode('register'), toast({ text: 'اعمل حساب الأول عشان الباقة تتسجل باسمك 🙂' })))} />
                ) : null}
              </Card>
            );
          })}
        </View>

        <Card style={{ gap: 8 }}>
          <Text style={[t.title, { color: c.ink }]}>✈️ صفقة على تيليجرام</Text>
          <Text style={[t.small, { color: c.muted }]}>بوت @SafqaDealsBot بيبعتلك أقوى عروض اليوم، ولو ربطته بحسابك بينبهك على المنتجات اللي بتراقبها.</Text>
          <Button label="تابعنا على تيليجرام" kind="ghost" onPress={() => void Linking.openURL(TELEGRAM_URL)} accessibilityLabel="تابعنا على تيليجرام، يفتح بوت صفقة" />
        </Card>
        <Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={[t.meta, { color: c.muted, textAlign: 'center' }]}>رجوع</Text></Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
