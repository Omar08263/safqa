import { router } from 'expo-router';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { Header } from '../../components/screen';
import { useToast } from '../../components/toast';
import { Button, Card, StateMessage, Tile } from '../../components/ui';
import { imageOf } from '../../lib/data';
import { success, tap, warn } from '../../lib/feedback';
import { egp, pct } from '../../lib/format';
import { useGrid } from '../../lib/layout';
import { checkWatchlist, ensurePermission } from '../../lib/notify';
import { useSnapshot } from '../../lib/snapshot';
import { useSettings, useWatch } from '../../lib/store';
import { TELEGRAM_URL, tierOf, useAuth } from '../../lib/api';
import { Linking } from 'react-native';
import { type as t, useColors } from '../../lib/theme';

export default function Watchlist() {
  const c = useColors();
  const { data } = useSnapshot();
  const { gutter } = useGrid();
  const watch = useWatch();
  const { settings, update } = useSettings();
  const toast = useToast();
  const auth = useAuth();
  const tier = tierOf(auth);

  const enable = async () => {
    const ok = await ensurePermission();
    update({ notifications: ok });
    if (ok) { success(); toast({ text: 'تمام! هنبعتلك أول ما السعر ينزل 🔔' }); }
    else { warn(); toast({ text: 'التنبيهات مقفولة من إعدادات الموبايل. افتحها من هناك وارجع.' }); }
  };
  const checkNow = async () => {
    if (!data) return;
    const n = await checkWatchlist(data.snap);
    toast({ text: n ? `بعتنالك ${n} تنبيه 🎉` : 'مفيش نزول جديد دلوقتي. هنفضل صاحيين 👀' });
  };

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: gutter, paddingBottom: 32, gap: 12 }}
      data={watch.items}
      keyExtractor={(w) => w.id}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Header title="بتراقب 👀" subtitle={`${watch.items.length} من ${watch.limit} منتج · باقة ${tier.ar} ${tier.emoji}`} />
          <Card style={{ gap: 8, padding: 12 }}>
            <Text style={[t.small, { color: c.ink }]}>
              {auth.user ? `☁️ قايمتك متزامنة مع حسابك (${auth.user.email}) على الموقع وتيليجرام.` : '📱 القايمة محفوظة على الموبايل ده بس. سجّل دخول عشان تتزامن مع الموقع وتوصلك تنبيهات تيليجرام.'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {!auth.user ? <Button label="سجّل دخول" kind="ghost" onPress={() => router.push('/account')} /> : null}
              <Button label="تابعنا على تيليجرام" icon="✈️" kind="ghost" accessibilityLabel="تابعنا على تيليجرام: بوت صفقة للعروض" onPress={() => void Linking.openURL(TELEGRAM_URL)} />
            </View>
          </Card>
          <Card style={{ gap: 10 }}>
            <Text style={[t.title, { color: c.ink }]}>{settings.notifications ? '🔔 التنبيهات شغالة' : '🔕 التنبيهات مقفولة'}</Text>
            <Text style={[t.small, { color: c.muted }]}>
              كل ما التطبيق يجيب أسعار جديدة بنقارن بالسعر اللي حددته (أو بالسعر وقت ما ضفت المنتج) ونبعتلك إشعار على الموبايل نفسه لو نزل {settings.minDropPct}% أو أكتر. مفيش سيرفر بيعرف إنت بتراقب إيه.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {!settings.notifications ? <Button label="شغّل التنبيهات" icon="🔔" kind="palm" onPress={() => void enable()} /> : null}
              <Button label="افحص دلوقتي" kind="ghost" onPress={() => void checkNow()} />
            </View>
          </Card>
        </View>
      }
      renderItem={({ item }) => {
        const p = data?.snap.all.find((x) => x.id === item.id);
        if (!p || !data) return null;
        const price = p.bestOffer?.priceEgp ?? null;
        const change = price != null && item.lastPrice ? ((price - item.lastPrice) / item.lastPrice) * 100 : 0;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${p.titleAr}، السعر ${egp(price)}`}
            onPress={() => { tap(); router.push(`/product/${p.id}`); }}
            onLongPress={() => {
              Alert.alert('تشيله من المراقبة؟', p.titleAr, [
                { text: 'لا، سيبه', style: 'cancel' },
                {
                  text: 'شيله', style: 'destructive', onPress: () => {
                    const prev = watch.remove(p.id);
                    toast({ text: 'شلناه من المراقبة', action: prev ? { label: 'رجّعه', onPress: () => watch.restore(prev) } : undefined });
                  },
                },
              ]);
            }}
          >
            <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12 }}>
              <Tile uri={imageOf(data.snap, p)} size={76} label={p.titleAr} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[t.title, { color: c.ink }]} numberOfLines={2}>{p.titleAr}</Text>
                <Text style={[t.price, { color: c.ink }]}>{egp(price)}</Text>
                <Text style={[t.meta, { color: change < 0 ? c.palm : change > 0 ? c.clay : c.muted }]}>
                  {change < 0 ? `نزل ${pct(-change)} من ساعة ما ضفته` : change > 0 ? `زاد ${pct(change)}` : 'ثابت لحد دلوقتي'}
                  {item.target ? ` · هدفك ${egp(item.target)}` : ''}
                </Text>
              </View>
            </Card>
          </Pressable>
        );
      }}
      ListFooterComponent={watch.items.length ? <Text style={[t.meta, { color: c.muted, textAlign: 'center', marginTop: 8 }]}>اضغط مطولًا على أي منتج عشان تشيله</Text> : undefined}
      ListEmptyComponent={
        <StateMessage emoji="🛎️" title="لسه مش بتراقب حاجة" body="افتح أي منتج ودوس «راقب السعر». هنقولك أول ما ينزل." action={{ label: 'شوف أحسن العروض', onPress: () => router.push('/') }} />
      }
    />
  );
}
