import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { Header } from '../../components/screen';
import { Card } from '../../components/ui';
import { SITE_URL } from '../../lib/data';
import { tap } from '../../lib/feedback';
import { useGrid } from '../../lib/layout';
import { type as t, useColors } from '../../lib/theme';

export default function More() {
  const c = useColors();
  const { gutter } = useGrid();
  const rows: { emoji: string; title: string; hint: string; go: () => void }[] = [
    { emoji: '🧮', title: 'أدوات الشراء الذكي', hint: 'التقسيط، الخصم الحقيقي، تحويل العملات', go: () => router.push('/tools') },
    { emoji: '⚙️', title: 'الإعدادات', hint: 'المظهر، الاهتزاز، التنبيهات', go: () => router.push('/settings') },
    { emoji: '🌐', title: 'افتح موقع صفقة', hint: 'المقارنة والمجتمع ووكلاء الذكاء', go: () => void WebBrowser.openBrowserAsync(SITE_URL) },
    { emoji: '💬', title: 'العروض على واتساب وتليجرام', hint: 'شارك أو تابع القناة', go: () => void WebBrowser.openBrowserAsync(`${SITE_URL}/#/channels`) },
    { emoji: '📣', title: 'ابعت صفقة لصاحبك', hint: 'شارك التطبيق', go: () => void Share.share({ message: `صفقة: بتكشف الخصومات الوهمية وبتقارن أسعار المتاجر المصرية 🇪🇬\n${SITE_URL}/#/app` }) },
    { emoji: '👋', title: 'شوف الجولة التعريفية تاني', hint: '30 ثانية', go: () => router.push('/onboarding') },
  ];
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: gutter, gap: 10, paddingBottom: 32 }}>
      <Header title="المزيد" subtitle="صفقة 4.0 · تطبيق أصلي، مش صفحة ويب" />
      {rows.map((r) => (
        <Pressable key={r.title} accessibilityRole="button" accessibilityLabel={`${r.title}: ${r.hint}`} onPress={() => { tap(); r.go(); }}>
          {({ pressed }) => (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, opacity: pressed ? 0.8 : 1 }}>
              <Text style={{ fontSize: 26 }}>{r.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[t.title, { color: c.ink }]}>{r.title}</Text>
                <Text style={[t.meta, { color: c.muted }]}>{r.hint}</Text>
              </View>
              <Text style={{ color: c.muted, fontSize: 18 }}>‹</Text>
            </Card>
          )}
        </Pressable>
      ))}
      <Text style={[t.meta, { color: c.muted, textAlign: 'center', marginTop: 12 }]}>
        الأسعار حقيقية من صفحات المتاجر العامة. المحتوى التجريبي مكتوب عليه «تجريبي». مفيش دفع جوه التطبيق.
      </Text>
    </ScrollView>
  );
}
