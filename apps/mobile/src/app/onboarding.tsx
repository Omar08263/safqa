import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Logo } from '../components/ui';
import { success, tap } from '../lib/feedback';
import { ensurePermission } from '../lib/notify';
import { useSettings } from '../lib/store';
import { type as t } from '../lib/theme';

const SLIDES = [
  { emoji: null, title: 'أهلاً بيك في صفقة', body: 'بنجمع الأسعار الحقيقية من المتاجر المصرية كل يوم، وبنقولك الصفقة تستاهل ولا لأ.' },
  { emoji: '🕵️', title: 'بنكشف الخصومات الوهمية', body: 'لو السعر «قبل الخصم» اتنفخ قبلها بأيام، هتشوف علامة ⚠️ واضحة.' },
  { emoji: '📈', title: 'تاريخ السعر قدامك', body: 'رسم بياني لكل متجر، ووسيط آخر 30 يوم، عشان تعرف السعر ده كويس فعلاً.' },
  { emoji: '🔔', title: 'راقب ونبهك', body: 'حدد السعر اللي عايزه، والموبايل هيبعتلك إشعار أول ما ينزل. من غير حساب.' },
];

export default function Onboarding() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { update } = useSettings();
  const [i, setI] = useState(0);
  const ref = useRef<{ scrollTo: (o: { x: number; animated: boolean }) => void } | null>(null);
  const float = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, [float]);
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [i, fade]);

  const go = (n: number) => {
    tap();
    setI(n);
    ref.current?.scrollTo({ x: n * width, animated: true });
  };
  const finish = async (askNotify: boolean) => {
    if (askNotify) {
      const ok = await ensurePermission().catch(() => false);
      update({ notifications: ok });
    }
    success();
    update({ onboarded: true });
    router.replace('/');
  };
  const last = i === SLIDES.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: '#0A5240' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="تخطي الجولة" onPress={() => void finish(false)} style={{ position: 'absolute', top: insets.top + 12, left: 20, zIndex: 2, padding: 8 }}>
        <Text style={[t.small, { color: '#CFEFE3', fontWeight: '700' }]}>تخطي</Text>
      </Pressable>
      <ScrollView
        ref={ref as never}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setI(Math.round(Math.abs(e.nativeEvent.contentOffset.x) / width))}
      >
        {SLIDES.map((s, n) => (
          <View key={n} style={{ width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 18 }}>
            <Animated.View style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) }] }}>
              {s.emoji ? <Text style={{ fontSize: 96 }}>{s.emoji}</Text> : <Logo size={150} />}
            </Animated.View>
            <Animated.View style={{ opacity: n === i ? fade : 1, gap: 10, maxWidth: 480 }}>
              <Text style={[t.h1, { color: '#FFF8EC', textAlign: 'center' }]} accessibilityRole="header">{s.title}</Text>
              <Text style={[t.body, { color: '#CFEFE3', textAlign: 'center', fontSize: 17, lineHeight: 27 }]}>{s.body}</Text>
            </Animated.View>
          </View>
        ))}
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24, gap: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }} accessibilityLabel={`شريحة ${i + 1} من ${SLIDES.length}`}>
          {SLIDES.map((_, n) => (
            <Pressable key={n} onPress={() => go(n)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`روح للشريحة ${n + 1}`}>
              <View style={{ width: n === i ? 26 : 8, height: 8, borderRadius: 4, backgroundColor: n === i ? '#F0B429' : '#2E7C66' }} />
            </Pressable>
          ))}
        </View>
        {last ? (
          <View style={{ gap: 10 }}>
            <Button label="يلا نبدأ، وشغّل التنبيهات" icon="🔔" onPress={() => void finish(true)} />
            <Pressable accessibilityRole="button" onPress={() => void finish(false)} style={{ alignItems: 'center', padding: 8 }}>
              <Text style={[t.small, { color: '#CFEFE3' }]}>ابدأ من غير تنبيهات</Text>
            </Pressable>
          </View>
        ) : (
          <Button label="التالي" onPress={() => go(i + 1)} />
        )}
      </View>
    </View>
  );
}
