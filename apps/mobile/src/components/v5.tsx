import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { getAuth } from '../lib/api';
import { success, tap, warn } from '../lib/feedback';
import { egp, pct } from '../lib/format';
import { radius, type as t, useColors } from '../lib/theme';
import { heatLevel, shopifyThumb, v5, type V5Card } from '../lib/v5';
import { useToast } from './toast';
import { Badge, Tile } from './ui';

const HEAT_COLORS = ['#8C8273', '#E8890C', '#E8590C', '#D9381E'];

/** 🔥 heat badge; the flame breathes on hot deals. */
export function HeatBadge({ heat }: { heat: number }) {
  const lvl = heatLevel(heat);
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (lvl < 2) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1.18, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(a, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [lvl, a]);
  const color = HEAT_COLORS[lvl]!;
  return (
    <View accessibilityLabel={`سخونة ${Math.round(heat)} درجة`} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: `${color}22` }}>
      <Animated.Text style={{ fontSize: 12, transform: [{ scale: a }] }}>{lvl ? '🔥' : '🧊'}</Animated.Text>
      <Text style={[t.meta, { color, fontWeight: '800', fontVariant: ['tabular-nums'] }]}>{Math.round(heat)}°</Text>
    </View>
  );
}

/** Hot / cold vote (Pepper-style). Works anonymous (rate-limited) or signed in. */
export function VoteBar({ id, hot, cold, heat }: { id: string; hot: number; cold: number; heat: number }) {
  const c = useColors();
  const toast = useToast();
  const [s, setS] = useState({ hot, cold, heat, mine: 0 });
  const bump = useRef(new Animated.Value(1)).current;
  const vote = async (v: 1 | -1) => {
    tap();
    const next = s.mine === v ? 0 : v;
    const prev = s;
    setS({ ...s, mine: next, hot: s.hot + (next === 1 ? 1 : 0) - (s.mine === 1 ? 1 : 0), cold: s.cold + (next === -1 ? 1 : 0) - (s.mine === -1 ? 1 : 0) });
    Animated.sequence([Animated.timing(bump, { toValue: 1.25, duration: 120, useNativeDriver: true }), Animated.spring(bump, { toValue: 1, useNativeDriver: true })]).start();
    try {
      const r = await v5.vote(id, next as 1 | -1 | 0);
      setS({ hot: r.hot, cold: r.cold, heat: r.heat, mine: r.mine });
      if (next === 1) success();
    } catch (e) {
      setS(prev); warn();
      toast({ text: (e as Error).message || 'التصويت مش متاح دلوقتي', action: getAuth().user ? undefined : { label: 'سجّل دخول', onPress: () => router.push('/account') } });
    }
  };
  const btn = (v: 1 | -1, label: string, color: string) => (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: s.mine === v }} accessibilityLabel={v === 1 ? 'صفقة سخنة' : 'صفقة باردة'} onPress={() => void vote(v)} hitSlop={8}
      style={({ pressed }) => ({ paddingHorizontal: 12, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: s.mine === v ? color : c.chip, opacity: pressed ? 0.8 : 1 })}>
      <Text style={{ fontSize: 15, color: s.mine === v ? '#fff' : c.ink, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {btn(-1, `🧊 ${s.cold}`, '#3D6FB4')}
      <Animated.View style={{ transform: [{ scale: bump }] }}><HeatBadge heat={s.heat} /></Animated.View>
      {btn(1, `🔥 ${s.hot}`, '#E8590C')}
    </View>
  );
}

export function V5Card({ p }: { p: V5Card }) {
  const c = useColors();
  const o = p.bestOffer;
  const drop = p.v5?.dropPct && p.v5.dropPct > 0 ? p.v5.dropPct : null;
  const atLow = o && p.v5?.low != null && o.priceEgp <= p.v5.low;
  const hot = heatLevel(p.v5?.heat ?? 0) >= 2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${p.titleAr}، ${egp(o?.priceEgp)}، ${o?.store.nameAr ?? ''}`}
      onPress={() => { tap(); router.push(`/item/${p.id}`); }}
      style={({ pressed }) => ({ flex: 1, borderWidth: hot ? 2 : 1, borderColor: hot ? '#E8590C88' : c.line, backgroundColor: c.card, borderRadius: radius.lg, padding: 10, transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      <Tile uri={shopifyThumb(p.image)} size="100%" label={p.titleAr} />
      <View style={{ gap: 4, marginTop: 10 }}>
        <Text style={[t.meta, { color: c.muted }]} numberOfLines={1}>{o?.store.nameAr ?? '—'}{p.offerCount > 1 ? ` · ${p.offerCount} متاجر` : ''}</Text>
        <Text style={[t.title, { color: c.ink, minHeight: 40 }]} numberOfLines={2}>{p.titleAr || p.titleEn}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[t.price, { color: c.ink }]}>{egp(o?.priceEgp)}</Text>
          <HeatBadge heat={p.v5?.heat ?? 0} />
        </View>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', minHeight: 20 }}>
          {drop ? <Badge text={`↓ ${pct(drop)}`} color={c.palm} /> : null}
          {atLow ? <Badge text="أقل سعر متسجل" color={c.primary} /> : null}
          {o && !o.inStock ? <Badge text="نفد" color={c.clay} /> : null}
          {p.condition && p.condition !== 'new' ? <Badge text={p.condition === 'used' ? 'مستعمل' : 'متجدد'} color={c.muted} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Small pulsing "live" dot. */
export function LiveDot() {
  const a = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(a, { toValue: 0.4, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#E5484D', opacity: a }} />;
}
