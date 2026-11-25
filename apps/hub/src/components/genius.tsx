// Owner-only toolkit in the native Hub: Autopilot switch, command agent (preview → approve → rollback), CEO brief read aloud, deal hunter.
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Switch, TextInput, View } from 'react-native';
import { ago, api, fmt, post } from '../lib/api';
import { play } from '../lib/sfx';
import { C } from '../lib/theme';
import { Btn, Card, Pill, T, s } from './ui';

export function Genius() {
  const [o, setO] = useState<any>(null);
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const load = useCallback(async () => setO(await api('/api/v2/hub/owner')), []);
  useEffect(() => { void load().catch((e) => Alert.alert('⚠️', e.message)); return () => { void Speech.stop(); }; }, [load]);
  if (!o) return <T muted style={{ textAlign: 'center', marginTop: 40 }}>جاري التحميل…</T>;
  const ask = async () => {
    if (!text.trim()) return;
    setBusy(true); setPlan(null);
    try { const r = await post('/api/v2/hub/command', { text }); play(r.id ? 'ok' : 'no'); setPlan(r); } catch (e: any) { play('no'); Alert.alert('⚠️', e.message); }
    setBusy(false);
  };
  const say = () => {
    if (!o.brief) return;
    if (speaking) { void Speech.stop(); setSpeaking(false); return; }
    setSpeaking(true); play('chime');
    Speech.speak(o.brief.body, { language: 'ar-EG', rate: 0.98, onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false), onError: () => setSpeaking(false) });
  };
  return (
    <>
      <Card accent={C.gold}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}><T b size={18}>🧠 أدواتي الذكية</T><T muted size={11}>للمالك بس · كل حاجة في السجل · {o.aiLeft} نداء AI فاضل</T></View>
          <View style={{ alignItems: 'center' }}><Switch value={o.autopilot} onValueChange={async (v) => { play(v ? 'chime' : 'no'); await post('/api/v2/hub/owner/autopilot', { global: v }); await load(); }} trackColor={{ true: C.brand, false: '#334155' }} /><T size={10} muted>الطيار الآلي</T></View>
        </View>
        <View style={[s.row, { marginTop: 8 }]}>{o.agents.map((a: any) => <Pill key={a.id} text={`${a.emoji} ${a.name} · ${a.auto ? 'لوحده' : 'يقترح'}`} tone={a.enabled ? 'info' : 'mut'} />)}</View>
      </Card>

      <Card i={1}>
        <T b>🧞 قول لأمين عايز إيه</T>
        <T muted size={11}>«حط بانر رمضان» · «وقّف برومو الباقة الذهبي» · «اقفل عدسة الأسعار». الفلوس والحظر والمسح لأ.</T>
        <TextInput value={text} onChangeText={setText} placeholder="اكتب أمرك…" placeholderTextColor={C.muted} onSubmitEditing={ask} accessibilityLabel="الأمر"
          style={{ backgroundColor: C.panel2, color: C.ink, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, marginVertical: 8, textAlign: 'right' }} />
        <Btn title="✨ خطّط" kind="gold" busy={busy} onPress={ask} cue="coin" />
        {plan ? (
          <View style={{ marginTop: 10 }}>
            <T>{plan.say}</T>
            {(plan.actions ?? []).map((a: any, i: number) => (
              <View key={i} style={{ backgroundColor: C.panel2, borderRadius: 12, padding: 10, marginTop: 6 }}>
                <T b size={13}>{a.preview?.label}</T>
                {a.preview?.before ? <T muted size={12}>دلوقتي: {a.preview.before}</T> : null}
                <T size={12} style={{ color: C.gold }}>بعد: {a.preview?.after}</T>
              </View>
            ))}
            {plan.id ? <View style={[s.row, { marginTop: 8 }]}><Btn small kind="primary" title="✅ نفّذ" cue="chime" onPress={async () => { try { await post(`/api/v2/hub/changes/${plan.id}/apply`); setPlan(null); setText(''); await load(); } catch (e: any) { Alert.alert('⚠️', e.message); } }} /><Btn small title="إلغاء" onPress={() => setPlan(null)} /></View> : null}
          </View>
        ) : null}
      </Card>

      <Card i={2}>
        <View style={[s.row, { justifyContent: 'space-between' }]}><T b>🎙️ موجز المدير</T>{o.brief ? <T muted size={11}>{o.brief.day}</T> : null}</View>
        {o.brief ? <T size={14} style={{ marginTop: 6, lineHeight: 26 }}>{o.brief.body}</T> : <T muted>بيطلع كل يوم 8 الصبح.</T>}
        <View style={[s.row, { marginTop: 8 }]}>
          {o.brief ? <Btn small kind="gold" title={speaking ? '⏹ وقّف' : '🔊 اسمعه'} onPress={say} cue="tap" /> : null}
          <Btn small title="🔄 موجز جديد" onPress={async () => { try { await post('/api/v2/hub/brief'); await load(); } catch (e: any) { Alert.alert('⚠️', e.message); } }} cue="nav" />
        </View>
      </Card>

      <Card i={3}>
        <View style={[s.row, { justifyContent: 'space-between' }]}><T b>🎯 صيد اليوم</T><Pill text={o.featured.on ? `ظاهر · ${(o.featured.items ?? []).length}` : 'مش ظاهر'} tone={o.featured.on ? 'ok' : 'mut'} /></View>
        {(o.featured.items ?? []).slice(0, 4).map((d: any) => (
          <View key={d.id} style={[s.row, { marginTop: 8, flexWrap: 'nowrap' }]}>
            {d.image ? <Image source={{ uri: d.image }} style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: '#fff' }} resizeMode="contain" /> : null}
            <View style={{ flex: 1 }}><T size={12} b>{d.title}</T><T size={12} style={{ color: C.gold }}>{fmt(d.price)} ج · −{d.pct}%</T></View>
          </View>
        ))}
        <View style={[s.row, { marginTop: 8 }]}><Btn small kind="primary" title="🎯 حدّث الصيد" cue="coin" onPress={async () => { try { await post('/api/v2/hub/deals-hunt/feature', { ids: [] }); await load(); } catch (e: any) { Alert.alert('⚠️', e.message); } }} /></View>
      </Card>

      <Card i={4}>
        <T b>📜 التغييرات</T>
        {o.changes.slice(0, 12).map((c: any) => (
          <View key={c.id} style={[s.row, { marginTop: 8, flexWrap: 'nowrap' }]}>
            <View style={{ flex: 1 }}><T size={12} b>{c.source === 'auto' ? '🤖 ' : '🧞 '}{c.title}</T><T muted size={10}>{c.actor} · {ago(c.applied_at ?? c.at)} · {c.status === 'applied' ? 'اتنفذ' : c.status === 'rolled_back' ? 'اترجع' : c.status === 'previewed' ? 'مستني' : c.status}</T></View>
            {c.status === 'applied' ? <Btn small title="↩️" onPress={() => Alert.alert('ترجّعه؟', c.title, [{ text: 'لأ' }, { text: 'رجّع', onPress: async () => { await post(`/api/v2/hub/changes/${c.id}/rollback`); play('ok'); await load(); } }])} /> : null}
          </View>
        ))}
        {!o.changes.length ? <T muted size={12}>لسه مفيش</T> : null}
      </Card>
    </>
  );
}
