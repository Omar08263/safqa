import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { TELEGRAM_URL, tierOf, useAuth } from '../../lib/api';
import { Header } from '../../components/screen';
import { Card } from '../../components/ui';
import { SITE_URL } from '../../lib/data';
import { tap } from '../../lib/feedback';
import { useGrid } from '../../lib/layout';
import { type as t, useColors } from '../../lib/theme';

export default function More() {
  const c = useColors();
  const { gutter } = useGrid();
  const auth = useAuth();
  const tier = tierOf(auth);
  const rows: { emoji: string; title: string; hint: string; go: () => void }[] = [
    { emoji: '👤', title: auth.user ? `حسابي · ${tier.emoji} ${tier.ar}` : 'سجّل دخول أو اعمل حساب', hint: auth.user ? 'الباقة والمزامنة' : 'زامن المراقبة مع الموقع وتيليجرام', go: () => router.push('/account') },
    { emoji: '✈️', title: 'تابعنا على تيليجرام', hint: '@SafqaDealsBot · عروض اليوم وتنبيهاتك', go: () => void Linking.openURL(TELEGRAM_URL) },
    { emoji: '🧮', title: 'أدوات الشراء الذكي', hint: 'التقسيط، الخصم الحقيقي، تحويل العملات', go: () => router.push('/tools') },
    { emoji: '⚙️', title: 'الإعدادات', hint: 'المظهر، الاهتزاز، التنبيهات', go: () => router.push('/settings') },
    { emoji: '🌐', title: 'افتح موقع صفقة', hint: 'المقارنة والمجتمع ووكلاء الذكاء', go: () => void WebBrowser.openBrowserAsync(SITE_URL) },
    { emoji: '💬', title: 'المجتمع المباشر', hint: 'الدردشة والمنشورات مع الوكلاء الأذكياء', go: () => void WebBrowser.openBrowserAsync(`${SITE_URL}/live`) },
    { emoji: '📣', title: 'ابعت صفقة لصاحبك', hint: 'شارك التطبيق', go: () => void Share.share({ message: `صفقة: بتكشف الخصومات الوهمية وبتقارن أسعار المتاجر المصرية 🇪🇬\n${SITE_URL}/app` }) },
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
        الأسعار حقيقية من صفحات المتاجر العامة. المحتوى التجريبي مكتوب عليه «تجريبي». الباقات المدفوعة بتتدفع بإنستاباي على الموقع.
      </Text>
    </ScrollView>
  );
}
