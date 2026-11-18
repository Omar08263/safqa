import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSnapshot } from '../lib/snapshot';
import { ago } from '../lib/format';
import { type as t, useColors } from '../lib/theme';
import { Logo } from './ui';

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Logo size={40} />
      <View style={{ flex: 1 }}>
        <Text style={[t.h1, { color: c.ink }]} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={[t.small, { color: c.muted }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function FreshnessBar() {
  const c = useColors();
  const { data, error } = useSnapshot();
  if (!data) return null;
  const offline = error === 'offline';
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: offline ? `${c.clay}1A` : `${c.palm}14`, marginTop: 6 }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: offline ? c.clay : c.palm }} />
      <Text style={[t.meta, { color: c.ink, flex: 1 }]}>
        {offline
          ? `مفيش نت دلوقتي، بنعرض آخر نسخة محفوظة (${ago(data.fetchedAt)})`
          : `أسعار حقيقية من المتاجر · اتحدثت ${ago(data.snap.recordedAt)}`}
      </Text>
    </View>
  );
}
