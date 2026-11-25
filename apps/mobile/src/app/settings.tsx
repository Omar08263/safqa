import Constants from 'expo-constants';
import { applyOtaNow, checkForOta, otaInfo } from '../lib/ota';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useToast } from '../components/toast';
import { Card, Chip, SectionTitle } from '../components/ui';
import { SNAPSHOT_URL } from '../lib/data';
import { tap } from '../lib/feedback';
import { cairoTime } from '../lib/format';
import { useGrid } from '../lib/layout';
import { ensurePermission } from '../lib/notify';
import { useSnapshot } from '../lib/snapshot';
import { useSettings } from '../lib/store';
import { onSound, setSound, soundOn } from '../lib/sfx';
import { useEffect, useState } from 'react';
import { type as t, useColors } from '../lib/theme';

function Row({ title, hint, value, onChange }: { title: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <View style={{ flex: 1 }}>
        <Text style={[t.title, { color: c.ink }]}>{title}</Text>
        <Text style={[t.meta, { color: c.muted }]}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={(v) => { tap(); onChange(v); }} accessibilityLabel={title} trackColor={{ true: c.palm, false: c.line }} thumbColor="#fff" />
    </View>
  );
}

export default function Settings() {
  const c = useColors();
  const { gutter } = useGrid();
  const { settings, update } = useSettings();
  const { data, refresh } = useSnapshot();
  const toast = useToast();
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: gutter, paddingBottom: 40, gap: 12 }}>
      <Card>
        <SectionTitle title="المظهر" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="زي الموبايل" active={settings.theme === 'system'} onPress={() => update({ theme: 'system' })} />
          <Chip label="☀️ فاتح" active={settings.theme === 'light'} onPress={() => update({ theme: 'light' })} />
          <Chip label="🌙 غامق" active={settings.theme === 'dark'} onPress={() => update({ theme: 'dark' })} />
        </View>
      </Card>
      <Card>
        <SectionTitle title="الإحساس والتنبيهات" />
        <SoundRow />
        <Row title="اهتزاز خفيف" hint="لمسة صغيرة لما تضغط أو تضيف للمراقبة" value={settings.haptics} onChange={(v) => update({ haptics: v })} />
        <Row
          title="تنبيهات نزول السعر"
          hint="إشعار على الموبايل لما منتج بتراقبه ينزل"
          value={settings.notifications}
          onChange={async (v) => {
            if (!v) return update({ notifications: false });
            const ok = await ensurePermission();
            update({ notifications: ok });
            if (!ok) toast({ text: 'افتح التنبيهات لصفقة من إعدادات الموبايل الأول' });
          }}
        />
        <Text style={[t.small, { color: c.muted, marginTop: 6 }]}>نبهني لما السعر ينزل بنسبة:</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          {[3, 5, 10, 15].map((p) => <Chip key={p} label={`${p}%+`} active={settings.minDropPct === p} onPress={() => update({ minDropPct: p })} />)}
        </View>
      </Card>
      <Card style={{ gap: 6 }}>
        <SectionTitle title="البيانات" />
        <Text style={[t.small, { color: c.ink }]}>آخر تحديث للأسعار: {data ? `${cairoTime(data.snap.recordedAt)} (القاهرة)` : '—'}</Text>
        <Text style={[t.meta, { color: c.muted }]} selectable>المصدر: {SNAPSHOT_URL}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <Chip label="🔄 حدّث دلوقتي" onPress={() => void refresh().then(() => toast({ text: 'جبنا أحدث الأسعار ✨' }))} />
          <Chip
            label="🧹 امسح بياناتي"
            onPress={() =>
              Alert.alert('تمسح كل حاجة؟', 'المراقبة والإعدادات والنسخة المحفوظة هيتمسحوا من الموبايل ده.', [
                { text: 'لا', style: 'cancel' },
                { text: 'امسح', style: 'destructive', onPress: () => void AsyncStorage.clear().then(() => toast({ text: 'اتمسح. اقفل التطبيق وافتحه تاني.' })) },
              ])
            }
          />
        </View>
      </Card>
      <OtaRow />
      <Text style={[t.meta, { color: c.muted, textAlign: 'center' }]}>صفقة {Constants.expoConfig?.version ?? '5.2.0'} · مفتوح المصدر · من غير إعلانات ومن غير دفع</Text>
    </ScrollView>
  );
}

function SoundRow() {
  const [on, setOn] = useState(soundOn());
  useEffect(() => onSound(setOn), []);
  return <Row title="أصوات الواجهة" hint="أصوات هادية وفخمة مع كل ضغطة (متولّدة بالكود، CC0)" value={on} onChange={(v) => setSound(v)} />;
}

/** Over-the-air updates: which code is running and a manual «check now». */
function OtaRow() {
  const c = useColors();
  const toast = useToast();
  const [info, setInfo] = useState(otaInfo());
  if (!info.enabled) return null;
  const when = info.createdAt && !info.embedded ? new Date(info.createdAt).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' }) : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Text style={[t.meta, { color: c.muted }]}>{info.emergency ? '🛟 رجعنا لنسخة سليمة تلقائيًا' : when ? `📦 آخر تحديث تلقائي: ${when}` : '📦 النسخة الأصلية للتطبيق'}</Text>
      <Chip
        label={info.pending ? '✨ طبّق التحديث' : '🔎 دوّر على تحديث'}
        onPress={() => {
          if (info.pending) { void applyOtaNow(); return; }
          void checkForOta(true).then((r) => {
            setInfo(otaInfo());
            toast({ text: r === 'downloaded' ? 'نزل تحديث جديد ✨ هيشتغل أول ما تقفل التطبيق وتفتحه' : r === 'error' ? 'مش قادرين نوصل لسيرفر التحديثات دلوقتي' : 'إنت على أحدث نسخة 👌' });
          });
        }}
      />
    </View>
  );
}
