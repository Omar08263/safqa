// «الجديد في صفقة» — animated release stories driven by the changelog JSON from the API (same source as the site).
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../lib/api';
import { success, tap } from '../lib/feedback';
import { play } from '../lib/sfx';

export const WHATS_NEW_SEEN = 'safqa.whatsnew.seen.v1';
const SITE = ((Constants.expoConfig?.extra as { siteUrl?: string } | undefined)?.siteUrl ?? 'https://safqaeg.pages.dev').replace(/\/$/, '');
type Slide = { id: string; emoji: string; title: string; body: string; image: string; to?: string; cta?: string; color?: string };
type Release = { version: string; codename?: string; headline: string; lede: string; slides: Slide[] };
const DUR = 7000;

export async function fetchChangelog(): Promise<{ latest: string; releases: Release[] } | null> {
  try { const r = await fetch(`${API_URL}/api/v2/changelog`); return r.ok ? await r.json() : null; } catch { return null; }
}

function Confetti() {
  const { width, height } = useWindowDimensions();
  const bits = useMemo(() => Array.from({ length: 28 }, (_, i) => ({ x: Math.random() * width, d: 900 + Math.random() * 1200, e: ['✨', '🎉', '💛', '⭐', '🟡', '🟢'][i % 6], v: new Animated.Value(0) })), [width]);
  useEffect(() => { bits.forEach((b) => Animated.timing(b.v, { toValue: 1, duration: b.d, easing: Easing.out(Easing.quad), useNativeDriver: true }).start()); }, [bits]);
  return <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>{bits.map((b, i) => <Animated.Text key={i} style={{ position: 'absolute', left: b.x, top: -20, fontSize: 18, opacity: b.v.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }), transform: [{ translateY: b.v.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.8] }) }, { rotate: b.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 360}deg`] }) }] }}>{b.e}</Animated.Text>)}</View>;
}

export default function WhatsNew() {
  const insets = useSafeAreaInsets();
  const [rel, setRel] = useState<Release | null>(null);
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);
  const [calm, setCalm] = useState(false);
  const prog = useRef(new Animated.Value(0)).current;
  const zoom = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => { void fetchChangelog().then((c) => setRel(c?.releases?.[0] ?? null)); void AccessibilityInfo.isReduceMotionEnabled().then(setCalm); }, []);
  const close = async () => { if (rel) await AsyncStorage.setItem(WHATS_NEW_SEEN, rel.version); tap(); router.back(); };
  const go = (n: number) => {
    if (!rel) return;
    if (n >= rel.slides.length) { setDone(true); success(); play('chime'); return; }
    setI(Math.max(0, n)); play(n > i ? 'nav' : 'tap');
  };
  useEffect(() => {
    if (!rel || done) return;
    prog.setValue(0); zoom.setValue(0); pop.setValue(0);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 120 }).start();
    if (!calm) Animated.timing(zoom, { toValue: 1, duration: DUR + 2000, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    const a = Animated.timing(prog, { toValue: 1, duration: DUR, easing: Easing.linear, useNativeDriver: false });
    a.start(({ finished }) => finished && go(i + 1));
    return () => a.stop();
  }, [rel, i, done, calm]);
  if (!rel) return <View style={{ flex: 1, backgroundColor: '#05081a' }} />;
  const s = rel.slides[i]!;
  return (
    <View style={{ flex: 1, backgroundColor: '#05081a' }}>
      <Animated.View style={{ position: 'absolute', inset: 0, transform: [{ scale: zoom.interpolate({ inputRange: [0, 1], outputRange: [1.02, 1.14] }) }] }}>
        <Image source={{ uri: `${SITE}/${s.image}` }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={350} accessibilityIgnoresInvertColors />
      </Animated.View>
      <LinearGradient colors={['rgba(5,8,26,0.55)', 'transparent', 'rgba(5,8,26,0.92)', '#05081a']} locations={[0, 0.3, 0.62, 1]} style={{ position: 'absolute', inset: 0 }} />
      <View style={{ flexDirection: 'row', gap: 4, paddingTop: insets.top + 10, paddingHorizontal: 14 }}>
        {rel.slides.map((x, k) => <View key={x.id} style={{ flex: 1, height: 3, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}><Animated.View style={{ height: '100%', backgroundColor: '#fff', width: k < i || done ? '100%' : k === i ? prog.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) : '0%' }} /></View>)}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, marginTop: 10 }}>
        <Text style={{ color: '#ffd76a', fontWeight: '800' }}>✦ صفقة {rel.version}{rel.codename ? ` · ${rel.codename}` : ''}</Text>
        <Pressable onPress={close} accessibilityLabel="اقفل" hitSlop={12}><Text style={{ color: '#fff', fontSize: 22 }}>✕</Text></Pressable>
      </View>
      <Pressable style={{ flex: 1 }} onPress={(e) => go(e.nativeEvent.locationX < 120 ? i + 1 : i - 1)} accessibilityLabel="التالي" />
      <Animated.View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 22, opacity: pop, transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }}>
        {i === 0 && !done ? <Text style={{ color: '#fff', fontSize: 15, opacity: 0.8, marginBottom: 6, textAlign: 'right' }}>{rel.headline}</Text> : null}
        <Text style={{ fontSize: 44, textAlign: 'right' }}>{done ? '🎉' : s.emoji}</Text>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'right' }}>{done ? 'كده إنت عارف كل الجديد!' : s.title}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15.5, lineHeight: 26, marginTop: 6, textAlign: 'right' }}>{done ? 'جرّب المزايا الجديدة على الموقع — والتطبيق بيتحدّث معاها.' : s.body}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          {done ? <Pressable onPress={close} style={{ flex: 1, backgroundColor: '#f5b524', borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}><Text style={{ fontWeight: '900', color: '#2a1a00', fontSize: 16 }}>يلا بينا ✨</Text></Pressable>
            : <>
              {s.to ? <Pressable onPress={() => { tap(); void WebBrowser.openBrowserAsync(`${SITE}${s.to}`); }} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '800' }}>{s.cta ?? 'جرّبها'} ←</Text></Pressable> : null}
              <Pressable onPress={() => go(i + 1)} style={{ flex: 1, backgroundColor: s.color ?? '#f5b524', borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}><Text style={{ fontWeight: '900', color: '#fff', fontSize: 16 }}>{i === rel.slides.length - 1 ? 'خلصنا' : 'التالي'}</Text></Pressable>
            </>}
        </View>
      </Animated.View>
      {done && !calm ? <Confetti /> : null}
    </View>
  );
}
