// Safqa Hub (native): pairing → command center with decisions, payments, autopilot agents, flags and the audit log.
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, Card, Pill, Ring, T, s } from '../components/ui';
import { Genius } from '../components/genius';
import { ago, api, claim, fmt, HUB_WEB, hydrate, logout, onAuth, post } from '../lib/api';
import { initSfx, play, setSound, soundOn } from '../lib/sfx';
import { C } from '../lib/theme';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });

export default function Index() {
  const [state, setState] = useState<'boot' | 'pair' | 'in'>('boot');
  const url = Linking.useURL();
  useEffect(() => { void Promise.all([hydrate(), initSfx()]).then(([on]) => { setState(on ? 'in' : 'pair'); void SplashScreen.hideAsync().catch(() => undefined); }); return onAuth((on) => setState(on ? 'in' : 'pair')); }, []);
  const deepCode = url ? Linking.parse(url).queryParams?.code : undefined;
  if (state === 'boot') return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return state === 'pair' ? <Pair initial={typeof deepCode === 'string' ? deepCode : ''} /> : <Main />;
}

function Pair({ initial }: { initial: string }) {
  const [code, setCode] = useState(initial.replace(/\D/g, ''));
  const [busy, setBusy] = useState(false);
  const go = useCallback(async (c = code) => {
    if (c.length !== 8) return Alert.alert('الكود 8 أرقام', 'اعمل كود من Safqa Hub على الويب ← «ربط تطبيق Hub».');
    setBusy(true);
    try { await claim(c); play('chime'); void Notifications.requestPermissionsAsync().catch(() => undefined); } catch (e: any) { play('no'); Alert.alert('مش شغال', e.message); } finally { setBusy(false); }
  }, [code]);
  useEffect(() => { if (initial.replace(/\D/g, '').length === 8) void go(initial.replace(/\D/g, '')); }, [initial]);
  return (
    <LinearGradient colors={['#0E2A24', C.bg, '#1A1405']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, padding: 22, justifyContent: 'center' }}>
        <Image source={require('../../assets/icon.png')} style={{ width: 96, height: 96, alignSelf: 'center', borderRadius: 24, marginBottom: 12 }} />
        <T b size={26} style={{ textAlign: 'center' }}>Safqa Hub</T>
        <T muted style={{ textAlign: 'center', marginBottom: 22 }}>مركز قيادة صفقة في جيبك. افتح Safqa Hub على الويب بحساب جوجل بتاعك ← «📱 ربط تطبيق Hub» واكتب الكود هنا.</T>
        <TextInput value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" placeholder="•••• ••••" placeholderTextColor={C.muted} maxLength={8} accessibilityLabel="كود الربط"
          style={{ backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 16, color: C.gold, fontSize: 34, fontWeight: '900', letterSpacing: 8, textAlign: 'center', paddingVertical: 14, marginBottom: 14 }} />
        <Btn title="🔗 اربط الجهاز" kind="gold" busy={busy} onPress={() => void go()} cue="coin" />
        <View style={{ height: 10 }} />
        <Btn title="افتح Safqa Hub على الويب" onPress={() => void WebBrowser.openBrowserAsync(`${HUB_WEB}/#/pair`)} cue="nav" />
        <T muted size={12} style={{ textAlign: 'center', marginTop: 18 }}>الكود لمرة واحدة وصالح 5 دقايق. الحساب لازم يكون حساب المالك (جوجل). كل ربط بيتسجل في السجل.</T>
      </SafeAreaView>
    </LinearGradient>
  );
}

type Tab = 'home' | 'genius' | 'decisions' | 'payments' | 'agents' | 'flags' | 'audit';
const TABS: [Tab, string, string][] = [['home', '🛰️', 'القيادة'], ['genius', '🧠', 'أدواتي'], ['decisions', '🧭', 'القرارات'], ['payments', '💳', 'المدفوعات'], ['agents', '🤝', 'الوكلاء'], ['flags', '🎛️', 'المزايا'], ['audit', '📜', 'السجل']];

function Main() {
  const [tab, setTab] = useState<Tab>('home');
  const [ov, setOv] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const last = useRef<{ esc: number; pay: number } | null>(null);
  const load = useCallback(async () => {
    try {
      const o = await api('/api/v2/hub/overview'); setOv(o); setErr(null);
      const now = { esc: o.escalations.length, pay: o.stats.paymentsPending ?? 0 };
      if (last.current) {
        if (now.esc > last.current.esc) { play('alert'); void Notifications.scheduleNotificationAsync({ content: { title: '🧭 قرار جديد مستنيك', body: o.escalations[0]?.title ?? '' }, trigger: null }); }
        if (now.pay > last.current.pay) { play('coin'); void Notifications.scheduleNotificationAsync({ content: { title: '💳 دفع إنستاباي جديد', body: 'محتاج مراجعة' }, trigger: null }); }
      }
      last.current = now;
    } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { void load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const badge: Partial<Record<Tab, number>> = { decisions: ov?.escalations?.length, payments: ov?.stats?.paymentsPending };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 110 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.gold} colors={[C.brand]} />}>
        {err ? <Card><T>⚠️ {err}</T></Card> : null}
        {!ov ? <T muted style={{ textAlign: 'center', marginTop: 60 }}>جاري التحميل…</T> : tab === 'home' ? <Home o={ov} reload={load} go={setTab} /> : tab === 'genius' ? <Genius /> : tab === 'decisions' ? <Decisions o={ov} reload={load} /> : tab === 'payments' ? <Payments reload={load} /> : tab === 'agents' ? <Agents reload={load} /> : tab === 'flags' ? <Flags /> : <Audit />}
      </ScrollView>
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: 'rgba(11,18,32,0.97)', borderTopWidth: 1, borderTopColor: C.line, paddingBottom: 18, paddingTop: 8 }}>
        {TABS.map(([id, e, t]) => (
          <Pressable key={id} style={{ flex: 1, alignItems: 'center' }} onPress={() => { play('nav'); setTab(id); }} accessibilityRole="tab" accessibilityState={{ selected: tab === id }}>
            <Text style={{ fontSize: tab === id ? 22 : 19 }}>{e}</Text>
            <Text style={{ color: tab === id ? C.gold : C.muted, fontSize: 10.5, fontWeight: '700' }}>{t}</Text>
            {badge[id] ? <View style={{ position: 'absolute', top: -2, right: '22%', backgroundColor: C.danger, borderRadius: 9, paddingHorizontal: 5 }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>{badge[id]}</Text></View> : null}
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const pct = (a: any) => (a.next ? ((a.xp - a.rank.min) / (a.next.min - a.rank.min)) * 100 : 100);

function Home({ o, reload, go }: { o: any; reload: () => Promise<void>; go: (t: Tab) => void }) {
  const [busy, setBusy] = useState(false);
  const [snd, setSnd] = useState(soundOn());
  const st = o.stats;
  const used = (st.aiUsage ?? []).reduce((a: number, x: any) => a + x.calls, 0);
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false }));
  return (
    <>
      <LinearGradient colors={['#123a30', '#16213A', '#3a2a08']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.card, { padding: 18 }]}>
        <T muted size={11}>SAFQA HUB · {new Date().toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long' })}</T>
        <T b size={24}>{h < 12 ? 'صباح الفل' : 'مساء الفل'} يا ريّس 👋</T>
        <T muted>{o.escalations.length ? `في ${o.escalations.length} قرار محتاجك — الباقي الوكلاء ماسكينه.` : 'مفيش حاجة محتاجاك — الوكلاء ماسكين الدنيا ✨'}</T>
        <View style={[s.row, { justifyContent: 'space-around', marginVertical: 14 }]}>
          <Ring pct={(1 - used / Math.max(1, st.aiBudget)) * 100} color={C.violet} size={78}><T b size={17}>{st.aiBudgetLeft}</T></Ring>
          <Ring pct={Math.min(100, (o.errors24 / 50) * 100)} color={o.errors24 > 20 ? C.danger : C.info} size={78}><T b size={17}>{o.errors24}</T></Ring>
          <Ring pct={o.escalations.length ? 100 : 0} color={C.gold} size={78}><T b size={17}>{o.escalations.length}</T></Ring>
        </View>
        <View style={[s.row, { justifyContent: 'space-around' }]}><T muted size={11}>نداء AI فاضل</T><T muted size={11}>أخطاء 24س</T><T muted size={11}>قرارات</T></View>
        <View style={{ height: 12 }} />
        <Btn title="⚡ شغّل كل الوكلاء دلوقتي" kind="gold" busy={busy} cue="coin" onPress={async () => { setBusy(true); try { const r = await post('/api/v2/hub/agents/all/run'); play('chime'); Alert.alert('✅ خلصوا', r.items.map((x: any) => `${x.id}: ${x.note ?? 'تمام'}`).join('\n')); await reload(); } catch (e: any) { play('no'); Alert.alert('⚠️', e.message); } setBusy(false); }} />
      </LinearGradient>
      <View style={[s.row, { gap: 10 }]}>
        {[['👥', 'الأعضاء', fmt(st.users), `+${st.newUsers24h} النهارده`], ['💳', 'مدفوعات', String(st.paymentsPending), 'مستنية'], ['💰', 'إيراد 30 يوم', `${fmt(st.revenue30)} ج`, `الإجمالي ${fmt(st.revenue)}`], ['🛒', 'منتجات', fmt(st.products), st.snapshot ? `سحب ${ago(st.snapshot.recordedAt)}` : '']].map(([e, l, v, sub], i) => (
          <Card key={l} i={i} style={{ width: '48%', marginBottom: 0 }}><Text style={{ fontSize: 20 }}>{e}</Text><T b size={22}>{v}</T><T muted size={12}>{l}</T><T muted size={11}>{sub}</T></Card>
        ))}
      </View>
      <View style={{ height: 12 }} />
      {o.budget ? (
        <Card i={4} accent={o.budget.state === 'red' ? '#dc2626' : o.budget.state === 'amber' ? '#d97706' : '#16a34a'}>
          <T b>💾 ميزانية الكتابة في D1 (مجاني: 100 ألف صف/يوم للحساب)</T>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: '#0002', marginTop: 8, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, o.budget.pct)}%`, height: 10, backgroundColor: o.budget.state === 'red' ? '#dc2626' : o.budget.state === 'amber' ? '#d97706' : '#16a34a' }} />
          </View>
          <T size={13} style={{ marginTop: 6 }}>{o.budget.used.toLocaleString()} صف النهارده · الوكلاء بيقفوا عند {o.budget.bgCap.toLocaleString()}{o.budget.exhausted ? ' · ⛔ الحد خلص — بيرجع 2:00 بتوقيت القاهرة' : ''}</T>
          {o.budget.jobs.length ? <T muted size={12}>{o.budget.jobs.slice(0, 5).map((j: any) => `${j.job} ${j.rows}`).join(' · ')}</T> : null}
          {o.hunter?.[0] ? <T muted size={12}>🕷️ آخر تشغيل للصياد: {String((o.hunter[0] as any).at ?? '').slice(0, 16).replace('T', ' ')} · {String((o.hunter[0] as any).status ?? '')}</T> : null}
        </Card>
      ) : null}
      <Card i={4}><View style={[s.row, { justifyContent: 'space-between' }]}><T b>🤝 فريق الإدارة الآلي</T><Btn small title="الكل" onPress={() => go('agents')} cue="nav" /></View>
        <View style={[s.row, { justifyContent: 'space-between', marginTop: 10 }]}>
          {o.agents.map((a: any) => (<View key={a.id} style={{ alignItems: 'center', width: '24%', marginBottom: 10, opacity: a.enabled ? 1 : 0.4 }}><Ring pct={pct(a)} color={a.color} size={54}><Text style={{ fontSize: 22 }}>{a.emoji}</Text></Ring><T b size={12}>{a.name}</T><T muted size={10}>{a.rank.emoji} {a.rank.ar}</T></View>))}
        </View>
      </Card>
      {o.report ? <Card i={5}><T b>🗞️ تقرير راوي · {o.report.day}</T><T size={13} style={{ marginTop: 6 }}>{o.report.body}</T></Card> : null}
      <Card i={6}><T b>⚙️ الإعدادات</T>
        <View style={[s.row, { justifyContent: 'space-between', marginTop: 8 }]}><T>🔊 أصوات الواجهة</T><Switch value={snd} onValueChange={(v) => { setSnd(v); void setSound(v); }} trackColor={{ true: C.brand, false: '#334155' }} /></View>
        <View style={[s.row, { marginTop: 10 }]}><Btn small title="🌐 Hub على الويب" onPress={() => void WebBrowser.openBrowserAsync(HUB_WEB)} cue="nav" /><Btn small title="🛍️ الموقع" onPress={() => void WebBrowser.openBrowserAsync('https://safqaeg.pages.dev')} cue="nav" /><Btn small title="خروج" kind="danger" onPress={() => Alert.alert('خروج', 'هتحتاج كود ربط جديد.', [{ text: 'لأ' }, { text: 'اخرج', style: 'destructive', onPress: () => void logout() }])} /></View>
        <T muted size={11} style={{ marginTop: 8 }}>Safqa Hub 1.1.0 · الأصوات متولّدة بالكود (CC0)</T>
      </Card>
    </>
  );
}

function Decisions({ o, reload }: { o: any; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!o.escalations.length) return <Card><T b size={18} style={{ textAlign: 'center' }}>🎉 صفر قرارات</T><T muted style={{ textAlign: 'center' }}>الوكلاء بيرجعولك في القرارات الحقيقية بس.</T></Card>;
  return (<>{o.escalations.map((e: any, i: number) => { const ag = o.agents.find((a: any) => a.id === e.agent_id); return (
    <Card key={e.id} i={i} accent={ag?.color}>
      <View style={s.row}><Text style={{ fontSize: 24 }}>{ag?.emoji ?? '🤖'}</Text><View style={{ flex: 1 }}><T b>{e.title}</T><T muted size={11}>{ag?.name} · {e.kind} · {ago(e.at)}</T></View></View>
      {e.body ? <T size={13} style={{ marginVertical: 8 }}>{e.body}</T> : null}
      {e.suggestion ? <T size={12} style={{ color: C.gold, marginBottom: 8 }}>💡 اقتراح الوكيل: {e.options.find((x: any) => x.id === e.suggestion)?.ar ?? e.suggestion}</T> : null}
      <View style={s.row}>{e.options.map((op: any) => <Btn key={op.id} small kind={op.id === e.suggestion ? 'primary' : 'plain'} title={op.ar} busy={busy === `${e.id}:${op.id}`} cue={op.id === e.suggestion ? 'ok' : 'tap'} onPress={async () => { setBusy(`${e.id}:${op.id}`); try { await post(`/api/v2/hub/escalations/${e.id}`, { decision: op.id }); play('ok'); await reload(); } catch (er: any) { play('no'); Alert.alert('⚠️', er.message); } setBusy(null); }} />)}</View>
    </Card>); })}</>);
}

function Payments({ reload }: { reload: () => Promise<void> }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const load = useCallback(async () => { const [a, b] = await Promise.all([api('/api/v2/admin/payments?status=pending'), api('/api/v2/admin/payments?status=provisional')]); setItems([...b.items, ...a.items]); }, []);
  useEffect(() => { void load().catch((e) => Alert.alert('⚠️', e.message)); }, [load]);
  const act = async (p: any, a: string) => {
    try { await post(`/api/v2/admin/payments/${p.id}/${a}`, { note: a === 'approve' ? null : 'الإيصال مش مطابق' }); play(a === 'approve' ? 'coin' : 'no'); await load(); await reload(); } catch (e: any) { play('no'); Alert.alert('⚠️', e.message); }
  };
  if (!items) return <T muted style={{ textAlign: 'center', marginTop: 40 }}>جاري التحميل…</T>;
  if (!items.length) return <Card><T b size={18} style={{ textAlign: 'center' }}>💳 مفيش مدفوعات مستنية</T><T muted style={{ textAlign: 'center' }}>أمين الخزنة بيراجع الإيصالات أول بأول.</T></Card>;
  return (<>
    {items.map((p, i) => (
      <Card key={p.id} i={i}>
        <View style={[s.row, { justifyContent: 'space-between' }]}><T b>{p.userName}</T><Pill text={p.status === 'provisional' ? 'متفعّل مبدئيًا' : 'محتاج مراجعة'} tone={p.status === 'provisional' ? 'info' : 'warn'} /></View>
        <T b size={22} style={{ color: C.gold }}>{fmt(p.amount)} ج</T>
        <T muted size={12}>{p.tier} × {p.months} شهر · كود الدفع {p.refCode} · مرجع {p.txnRef ?? '—'} · {ago(p.submittedAt ?? p.createdAt)}</T>
        {p.confidence != null ? <View style={{ marginVertical: 8 }}><T size={12}>ثقة الذكاء الاصطناعي {Math.round(p.confidence * 100)}%</T><View style={{ height: 7, backgroundColor: C.panel2, borderRadius: 9, overflow: 'hidden' }}><View style={{ width: `${p.confidence * 100}%`, height: '100%', backgroundColor: p.confidence >= 0.8 ? C.ok : p.confidence >= 0.5 ? C.warn : C.danger }} /></View></View> : null}
        {(p.checks?.checks ?? []).map((c: any, k: number) => <T key={k} size={12}>{c.ok === true ? '✅' : c.ok === false ? '❌' : '❔'} {c.ar}</T>)}
        <View style={[s.row, { marginTop: 10 }]}>
          {p.hasReceipt ? <Btn small title="🧾 الإيصال" cue="nav" onPress={async () => { try { const r = await api(`/api/v2/admin/payments/${p.id}/receipt`); setImg(`data:${r.mime};base64,${r.data}`); } catch (e: any) { Alert.alert('⚠️', e.message); } }} /> : null}
          <Btn small kind="primary" title="✅ تأكيد" cue="coin" onPress={() => Alert.alert('تأكيد الدفع', `${fmt(p.amount)} ج من ${p.userName}؟`, [{ text: 'لأ' }, { text: 'أكّد', onPress: () => void act(p, 'approve') }])} />
          <Btn small kind="danger" title={p.status === 'provisional' ? '❌ إلغاء' : '❌ رفض'} onPress={() => Alert.alert('متأكد؟', 'هيوصل للعضو إن الإيصال مش مطابق.', [{ text: 'لأ' }, { text: 'أيوه', style: 'destructive', onPress: () => void act(p, p.status === 'provisional' ? 'revoke' : 'reject') }])} />
        </View>
      </Card>
    ))}
    <Modal visible={Boolean(img)} transparent animationType="fade" onRequestClose={() => setImg(null)}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.9)', justifyContent: 'center' }} onPress={() => setImg(null)}>{img ? <Image source={{ uri: img }} style={{ width: '100%', height: '85%' }} resizeMode="contain" /> : null}</Pressable>
    </Modal>
  </>);
}

function Agents({ reload }: { reload: () => Promise<void> }) {
  const [r, setR] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => setR(await api('/api/v2/hub/agents')), []);
  useEffect(() => { void load(); }, [load]);
  if (!r) return <T muted style={{ textAlign: 'center', marginTop: 40 }}>جاري التحميل…</T>;
  const upd = async (id: string, b: unknown) => { try { await post(`/api/v2/hub/agents/${id}`, b); play('ok'); await load(); } catch (e: any) { play('no'); Alert.alert('⚠️', e.message); } };
  return (<>
    <Card><T b>🎖️ سلّم الترقيات</T><View style={[s.row, { justifyContent: 'space-between', marginTop: 6 }]}>{r.ranks.map((k: any) => <View key={k.id} style={{ alignItems: 'center' }}><Text style={{ fontSize: 20 }}>{k.emoji}</Text><T size={11} b>{k.ar}</T><T size={10} muted>{k.min}+</T></View>)}</View>
      <T muted size={11}>تشغيلة ناجحة +1 · موافقتك على اقتراح +10 · رفضك −5</T></Card>
    {r.items.map((a: any, i: number) => (
      <Card key={a.id} i={i} accent={a.color}>
        <View style={s.row}><Ring pct={pct(a)} color={a.color} size={56}><Text style={{ fontSize: 22 }}>{a.emoji}</Text></Ring>
          <View style={{ flex: 1 }}><T b size={16}>{a.name} · {a.rank.emoji} {a.rank.ar}</T><T muted size={12}>{a.role}</T><T size={12}>{a.xp} XP{a.next ? ` · فاضل ${a.next.need} لـ ${a.next.ar}` : ' · أعلى رتبة'}</T></View>
          <Switch value={a.enabled} onValueChange={(v) => { play(v ? 'ok' : 'no'); void upd(a.id, { enabled: v }); }} trackColor={{ true: C.brand, false: '#334155' }} /></View>
        {a.lastNote ? <T muted size={12} style={{ marginTop: 6 }}>📝 {a.lastNote} · {ago(a.lastRun)}</T> : null}
        <View style={[s.row, { marginTop: 8 }]}>
          <Btn small kind="primary" title="▶ شغّله" busy={busy === a.id} onPress={async () => { setBusy(a.id); try { const x = await post(`/api/v2/hub/agents/${a.id}/run`); play('chime'); Alert.alert(a.name, x.note ?? 'خلص ✅'); await load(); await reload(); } catch (e: any) { play('no'); Alert.alert('⚠️', e.message); } setBusy(null); }} />
          <Btn small title="🏅 +25" cue="coin" onPress={() => void upd(a.id, { xp: 25 })} />
        </View>
      </Card>
    ))}
  </>);
}

function Flags() {
  const [items, setItems] = useState<any[] | null>(null);
  const load = useCallback(async () => setItems((await api('/api/v2/hub/flags')).items), []);
  useEffect(() => { void load(); }, [load]);
  if (!items) return <T muted style={{ textAlign: 'center', marginTop: 40 }}>جاري التحميل…</T>;
  const set = async (k: string, b: unknown) => { try { await post(`/api/v2/hub/flags/${k}`, b); await load(); } catch (e: any) { play('no'); Alert.alert('⚠️', e.message); } };
  return (<>
    <T muted size={12} style={{ marginBottom: 10 }}>التغيير بيوصل للموقع والتطبيق خلال 5 دقايق. «حارس» بيقفل الميزة المحمية لو عملت مشاكل.</T>
    {items.map((f, i) => (
      <Card key={f.key} i={i}>
        <View style={[s.row, { justifyContent: 'space-between' }]}><View style={{ flex: 1 }}><T b>{f.key}</T><T muted size={12}>{f.description}</T></View>
          <Switch value={Boolean(f.enabled)} onValueChange={(v) => { play(v ? 'ok' : 'no'); void set(f.key, { enabled: v }); }} trackColor={{ true: C.brand, false: '#334155' }} /></View>
        <View style={[s.row, { marginTop: 6 }]}>{[0, 25, 50, 100].map((p) => <Btn key={p} small kind={f.rollout === p ? 'primary' : 'plain'} title={`${p}%`} onPress={() => void set(f.key, { rollout: p })} />)}
          {f.rolled_back_at ? <Pill text="حارس رجّعها" tone="bad" /> : null}{f.guard ? <Pill text="🛡️ محمية" tone="mut" /> : null}</View>
      </Card>
    ))}
  </>);
}

function Audit() {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { void api('/api/v2/hub/audit').then((r) => setItems(r.items)); }, []);
  if (!items) return <T muted style={{ textAlign: 'center', marginTop: 40 }}>جاري التحميل…</T>;
  const SEV: Record<string, string> = { ok: '✅', info: '•', warn: '⚠️', bad: '⛔', error: '⛔' };
  return <Card>{items.map((a) => (<View key={a.id} style={[s.row, { alignItems: 'flex-start', marginBottom: 10, flexWrap: 'nowrap' }]}><Text style={{ width: 22, color: C.ink }}>{SEV[a.severity] ?? '•'}</Text><View style={{ flex: 1 }}><T b size={13}>{a.title}</T><T muted size={11}>{a.actor} · {a.kind} · {ago(a.at)}</T></View></View>))}</Card>;
}
