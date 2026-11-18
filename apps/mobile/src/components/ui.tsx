import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { imageOf, type Product, type Snapshot } from '../lib/data';
import { tap } from '../lib/feedback';
import { egp, pct } from '../lib/format';
import { radius, type as t, useColors } from '../lib/theme';

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="شعار صفقة">
      <Defs>
        <LinearGradient id="bg" x1="0.1" y1="0" x2="0.9" y2="1">
          <Stop offset="0" stopColor="#10805F" />
          <Stop offset="0.55" stopColor="#0A5240" />
          <Stop offset="1" stopColor="#062C23" />
        </LinearGradient>
        <LinearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFE29A" />
          <Stop offset="0.35" stopColor="#FFC233" />
          <Stop offset="0.75" stopColor="#F59E0B" />
          <Stop offset="1" stopColor="#E8590C" />
        </LinearGradient>
      </Defs>
      <Rect x="32" y="32" width="960" height="960" rx="240" fill="url(#bg)" />
      <Path d="M 690 322 C 650 236 462 226 400 304 C 330 392 420 466 522 492 C 642 522 712 578 676 680 C 640 780 450 792 352 712" fill="none" stroke="url(#gold)" strokeWidth={128} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="664" cy="300" r="34" fill="#0A5240" />
      <Path d="M 812 640 C 817 680 829 692 869 697 C 829 702 817 714 812 754 C 807 714 795 702 755 697 C 795 692 807 680 812 640 Z" fill="#FFF4D6" />
      <Path d="M 268 228 C 272 256 280 264 308 268 C 280 272 272 280 268 308 C 264 280 256 272 228 268 C 256 264 264 256 268 228 Z" fill="#FFF4D6" opacity={0.85} />
    </Svg>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return <View style={[{ backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, padding: 16 }, style]}>{children}</View>;
}

export function Chip({ label, active, onPress, accessibilityLabel }: { label: string; active?: boolean; onPress?: () => void; accessibilityLabel?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => { tap(); onPress?.(); }}
      style={({ pressed }) => [{ paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', borderRadius: 999, backgroundColor: active ? c.ink : c.chip, opacity: pressed ? 0.75 : 1 }]}
    >
      <Text style={[t.small, { color: active ? c.bg : c.ink, fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
}

export function Button({ label, onPress, kind = 'primary', icon, disabled, accessibilityLabel }: { label: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'palm'; icon?: string; disabled?: boolean; accessibilityLabel?: string }) {
  const c = useColors();
  const bg = kind === 'primary' ? c.primary : kind === 'palm' ? c.palm : c.chip;
  const fg = kind === 'palm' ? '#fff' : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => [{ minHeight: 48, borderRadius: 999, paddingHorizontal: 20, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      {icon ? <Text style={{ fontSize: 16 }}>{icon}</Text> : null}
      <Text style={[t.title, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** Square tile: same size, white background, padded, contain. */
export function Tile({ uri, size, label }: { uri?: string; size: number | `${number}%`; label: string }) {
  const c = useColors();
  return (
    <View style={{ width: size, aspectRatio: 1, borderRadius: radius.md, backgroundColor: c.tile, overflow: 'hidden', padding: typeof size === 'number' ? size * 0.08 : 10, alignItems: 'center', justifyContent: 'center' }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" transition={180} accessibilityLabel={label} cachePolicy="memory-disk" />
      ) : (
        <Text style={{ fontSize: 28 }} accessibilityLabel={label}>🛍️</Text>
      )}
    </View>
  );
}

export function ScorePill({ score }: { score: number }) {
  const c = useColors();
  const color = score >= 75 ? c.palm : score >= 50 ? c.primary : c.clay;
  return (
    <View accessibilityLabel={`تقييم الصفقة ${score} من 100`} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1.5, borderColor: color }}>
      <Text style={[t.meta, { color, fontWeight: '800', fontVariant: ['tabular-nums'] }]}>{score}</Text>
    </View>
  );
}

export function DealCard({ p, snap, wide }: { p: Product; snap: Snapshot; wide?: boolean }) {
  const c = useColors();
  const o = p.bestOffer;
  const fake = o?.fakeDiscount;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${p.titleAr}، ${egp(o?.priceEgp)}${fake ? '، خصم وهمي' : ''}`}
      onPress={() => { tap(); router.push(`/product/${p.id}`); }}
      style={({ pressed }) => [s.card, { backgroundColor: c.card, borderColor: c.line, flex: 1, maxWidth: wide ? undefined : '100%', transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <Tile uri={imageOf(snap, p)} size="100%" label={p.titleAr} />
      <View style={{ gap: 4, marginTop: 10 }}>
        <Text style={[t.meta, { color: c.muted }]} numberOfLines={1}>{o?.store.nameAr ?? '—'} · {p.category?.nameAr ?? ''}</Text>
        <Text style={[t.title, { color: c.ink, minHeight: 40 }]} numberOfLines={2}>{p.titleAr}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <Text style={[t.price, { color: c.ink }]}>{egp(o?.priceEgp)}</Text>
          {o ? <ScorePill score={o.dealScore} /> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', minHeight: 20 }}>
          {fake ? <Badge text="⚠️ خصم وهمي" color={c.clay} /> : o?.discountPct ? <Badge text={`-${pct(o.discountPct)}`} color={c.palm} /> : null}
          {p.offerCount > 1 ? <Badge text={`${p.offerCount} متاجر`} color={c.muted} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

export function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: `${color}22` }}>
      <Text style={[t.meta, { color, fontWeight: '700' }]}>{text}</Text>
    </View>
  );
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ marginTop: 22, marginBottom: 10, gap: 2 }}>
      <Text style={[t.h2, { color: c.ink }]} accessibilityRole="header">{title}</Text>
      {hint ? <Text style={[t.small, { color: c.muted }]}>{hint}</Text> : null}
    </View>
  );
}

export function StateMessage({ emoji, title, body, action }: { emoji: string; title: string; body?: string; action?: { label: string; onPress: () => void } }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 }}>
      <Text style={{ fontSize: 44 }}>{emoji}</Text>
      <Text style={[t.h3, { color: c.ink, textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[t.body, { color: c.muted, textAlign: 'center' }]}>{body}</Text> : null}
      {action ? <View style={{ marginTop: 10 }}><Button label={action.label} onPress={action.onPress} /></View> : null}
    </View>
  );
}

export function Loading({ line = 'بنجيب أحدث الأسعار…' }: { line?: string }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }} accessibilityLiveRegion="polite">
      <ActivityIndicator color={c.palm} size="large" />
      <Text style={[t.small, { color: c.muted }]}>{line}</Text>
    </View>
  );
}

export function SkeletonGrid({ columns }: { columns: number }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }} accessibilityLabel="جاري التحميل">
      {Array.from({ length: columns * 2 }).map((_, i) => (
        <View key={i} style={{ width: `${100 / columns - 4}%`, gap: 8 }}>
          <View style={{ aspectRatio: 1, borderRadius: radius.md, backgroundColor: c.chip }} />
          <View style={{ height: 12, width: '60%', borderRadius: 6, backgroundColor: c.chip }} />
          <View style={{ height: 14, width: '90%', borderRadius: 6, backgroundColor: c.chip }} />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: 10 },
});
