import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { play, type Cue } from '../lib/sfx';
import { C } from '../lib/theme';

/** Card that springs in (staggered by index). */
export function Card({ children, style, i = 0, accent }: { children: ReactNode; style?: StyleProp<ViewStyle>; i?: number; accent?: string }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(a, { toValue: 1, delay: i * 50, useNativeDriver: true, damping: 14, stiffness: 140 }).start(); }, [a, i]);
  return (
    <Animated.View style={[s.card, accent ? { borderTopColor: accent, borderTopWidth: 3 } : null, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }, style]}>
      {children}
    </Animated.View>
  );
}

/** Button with spring press, haptic + sound. */
export function Btn({ title, onPress, kind = 'plain', cue = 'tap', busy, small, disabled }: { title: string; onPress: () => void; kind?: 'plain' | 'primary' | 'gold' | 'danger'; cue?: Cue; busy?: boolean; small?: boolean; disabled?: boolean }) {
  const sc = useRef(new Animated.Value(1)).current;
  const spring = (v: number) => Animated.spring(sc, { toValue: v, useNativeDriver: true, damping: 10, stiffness: 400 }).start();
  const grad = kind === 'primary' ? ['#22C58B', '#168A64'] : kind === 'gold' ? ['#FFD76A', '#E19C0B'] : kind === 'danger' ? ['#F05252', '#B91C1C'] : [C.panel2, C.panel2];
  return (
    <Pressable disabled={disabled || busy} onPressIn={() => spring(0.93)} onPressOut={() => spring(1)} onPress={() => { play(cue); onPress(); }} accessibilityRole="button" accessibilityLabel={title}>
      <Animated.View style={{ transform: [{ scale: sc }], opacity: disabled ? 0.5 : 1 }}>
        <LinearGradient colors={grad as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.btn, small && s.btnS, kind === 'plain' && { borderWidth: 1, borderColor: C.line }]}>
          {busy ? <ActivityIndicator color={kind === 'gold' ? '#2A1A00' : '#fff'} /> : <Text style={[s.btnT, small && { fontSize: 13 }, kind === 'gold' && { color: '#2A1A00' }]}>{title}</Text>}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

export function Ring({ pct, color, size = 64, children }: { pct: number; color: string; size?: number; children?: ReactNode }) {
  const r = 15.5, len = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 36 36" style={StyleSheet.absoluteFill}>
        <Circle cx={18} cy={18} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
        <Circle cx={18} cy={18} r={r} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeDasharray={`${(Math.max(0, Math.min(100, pct)) / 100) * len} ${len}`} transform="rotate(-90 18 18)" />
      </Svg>
      {children}
    </View>
  );
}

export function Pill({ text, tone = 'info' }: { text: string; tone?: 'ok' | 'warn' | 'bad' | 'info' | 'mut' }) {
  const col = { ok: C.ok, warn: C.warn, bad: C.danger, info: C.info, mut: C.muted }[tone];
  return <View style={[s.pill, { backgroundColor: `${col}26` }]}><Text style={{ color: col, fontSize: 11.5, fontWeight: '800' }}>{text}</Text></View>;
}

export const T = ({ children, style, muted, b, size }: { children: ReactNode; style?: any; muted?: boolean; b?: boolean; size?: number }) => (
  <Text style={[{ color: muted ? C.muted : C.ink, fontWeight: b ? '800' : '500', fontSize: size ?? 14, textAlign: 'right', writingDirection: 'rtl', lineHeight: (size ?? 14) * 1.6 }, style]}>{children}</Text>
);

export const s = StyleSheet.create({
  card: { backgroundColor: C.panel, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 12 },
  btn: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  btnS: { paddingHorizontal: 12, paddingVertical: 7, minHeight: 34, borderRadius: 11 },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  pill: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 2, alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
