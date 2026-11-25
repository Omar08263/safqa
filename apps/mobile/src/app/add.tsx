import * as Clipboard from 'expo-clipboard';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useToast } from '../components/toast';
import { Button, Card } from '../components/ui';
import { success, warn } from '../lib/feedback';
import { useGrid } from '../lib/layout';
import { radius, type as t, useColors } from '../lib/theme';
import { v5 } from '../lib/v5';

export default function AddLink() {
  const c = useColors();
  const { gutter } = useGrid();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const go = async () => {
    if (!/^https?:\/\//.test(url.trim())) { warn(); setMsg('الصق رابط كامل بيبدأ بـ https://'); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await v5.submit(url.trim());
      if (r.productId) { success(); toast({ text: 'تمام! بقينا نتابع سعره ✓' }); router.replace(`/item/${r.productId}`); return; }
      setMsg(r.message ?? 'مقدرناش نقرا المنتج من الصفحة دي.');
    } catch (e) { warn(); setMsg((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: gutter, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'الصق رابط منتج' }} />
      <Text style={[t.h2, { color: c.ink }]}>🔗 تابع أي منتج برابطه</Text>
      <Text style={[t.body, { color: c.muted }]}>الصق رابط صفحة منتج من متجر مصري. بنقرا بياناتها العامة (الاسم والسعر) بنفس قواعد robots.txt، وبعدها بنتابع السعر ونقارنه بالمتاجر التانية.</Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 12 }}>
        <TextInput value={url} onChangeText={setUrl} placeholder="https://…" placeholderTextColor={c.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url" accessibilityLabel="رابط المنتج"
          style={[t.body, { flex: 1, minHeight: 52, color: c.ink, writingDirection: 'ltr', textAlign: 'left' }]} onSubmitEditing={() => void go()} />
        <Button label="لصق" kind="ghost" onPress={() => void Clipboard.getStringAsync().then((s) => s && setUrl(s.trim()))} />
      </View>
      <Button label={busy ? 'بنقرا الصفحة…' : 'تابع السعر'} icon="✨" disabled={busy} onPress={() => void go()} />
      {msg ? <Card style={{ borderColor: c.clay }}><Text style={[t.small, { color: c.ink }]}>{msg}</Text></Card> : null}
      <Card style={{ gap: 6 }}>
        <Text style={[t.title, { color: c.ink }]}>ملحوظة عن أمازون ونون</Text>
        <Text style={[t.small, { color: c.muted }]}>المتجرين دول بيمنعوا البرامج الآلية، وإحنا مبنتحايلش على الحماية دي. أمازون بيشتغل عن طريق API الرسمي للشركاء لما يتفعّل، ونون عن طريق فيد الشركاء.</Text>
      </Card>
    </ScrollView>
  );
}
