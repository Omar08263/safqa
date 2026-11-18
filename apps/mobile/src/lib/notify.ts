/**
 * Local notifications for the watchlist. After every snapshot refresh the app
 * compares each watched product's real price with the user's target (or the
 * price when it was added) and notifies once per drop. No server involved.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Snapshot } from './data';
import { egp } from './format';
import { getState, patchWatch } from './store';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('price-drops', {
      name: 'نزول الأسعار',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#0E6B52',
      vibrationPattern: [0, 120, 80, 120],
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function checkWatchlist(snap: Snapshot): Promise<number> {
  const { watch, settings } = getState();
  if (!settings.notifications || watch.length === 0) return 0;
  let sent = 0;
  const next = await Promise.all(
    watch.map(async (w) => {
      const p = snap.all.find((x) => x.id === w.id);
      const price = p?.bestOffer?.priceEgp ?? null;
      if (!p || price == null) return w;
      const base = w.lastPrice ?? price;
      const hitTarget = w.target != null && price <= w.target;
      const dropPct = base > 0 ? ((base - price) / base) * 100 : 0;
      const recently = w.notifiedAt && Date.now() - Date.parse(w.notifiedAt) < 20 * 3600_000;
      if ((hitTarget || dropPct >= settings.minDropPct) && !recently) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: hitTarget ? '🎯 وصل للسعر اللي عايزه!' : `🔥 نزل ${Math.round(dropPct)}%`,
            body: `${p.titleAr}\n${egp(price)} في ${p.bestOffer?.store.nameAr ?? ''}`,
            data: { productId: p.id },
          },
          trigger: Platform.OS === 'android' ? { channelId: 'price-drops', seconds: 1 } as Notifications.NotificationTriggerInput : null,
        });
        sent += 1;
        return { ...w, lastPrice: price, notifiedAt: new Date().toISOString() };
      }
      return { ...w, lastPrice: w.lastPrice ?? price };
    }),
  );
  patchWatch(next);
  return sent;
}
