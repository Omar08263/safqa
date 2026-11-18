/// <reference path="./web-push.d.ts" />

export interface DeliveryResult {
  channel: 'web_push' | 'expo' | 'telegram';
  delivered: boolean;
  reason?: string;
}

export interface DeliveryInput {
  title: string;
  body: string;
  webPush: Array<{ endpoint: string; p256dh: string; auth: string }>;
  expoPushToken?: string | null;
  telegramChatId?: string | null;
  enableWebPush: boolean;
  enableExpo: boolean;
  enableTelegram: boolean;
}

/**
 * Optional channels. Missing credentials are reported, not invented.
 * Web Push needs VAPID keys. Expo posts to Expo's push service.
 * Telegram needs TELEGRAM_BOT_TOKEN plus a chat id on the user.
 */
export async function deliverAlert(input: DeliveryInput, env = process.env): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];
  if (input.enableWebPush) results.push(await sendWebPush(input, env));
  if (input.enableExpo) results.push(await sendExpo(input, env));
  if (input.enableTelegram) results.push(await sendTelegram(input, env));
  return results;
}

async function sendWebPush(input: DeliveryInput, env: NodeJS.ProcessEnv): Promise<DeliveryResult> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return { channel: 'web_push', delivered: false, reason: 'not_configured' };
  }
  if (input.webPush.length === 0) {
    return { channel: 'web_push', delivered: false, reason: 'no_subscription' };
  }
  const webpush = (await import('web-push')).default;
  webpush.setVapidDetails(
    env.VAPID_SUBJECT || 'mailto:bot@safqa.example',
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  const payload = JSON.stringify({ title: input.title, body: input.body });
  let delivered = 0;
  for (const subscription of input.webPush) {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload,
      );
      delivered += 1;
    } catch (error) {
      console.warn('web push failed', error instanceof Error ? error.message : error);
    }
  }
  return delivered > 0
    ? { channel: 'web_push', delivered: true }
    : { channel: 'web_push', delivered: false, reason: 'send_failed' };
}

async function sendExpo(input: DeliveryInput, env: NodeJS.ProcessEnv): Promise<DeliveryResult> {
  if (!input.expoPushToken) return { channel: 'expo', delivered: false, reason: 'no_token' };
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      to: input.expoPushToken,
      title: input.title,
      body: input.body,
      sound: 'default',
    }),
  });
  if (!response.ok) return { channel: 'expo', delivered: false, reason: `http_${response.status}` };
  return { channel: 'expo', delivered: true };
}

async function sendTelegram(input: DeliveryInput, env: NodeJS.ProcessEnv): Promise<DeliveryResult> {
  if (!env.TELEGRAM_BOT_TOKEN) return { channel: 'telegram', delivered: false, reason: 'not_configured' };
  if (!input.telegramChatId) return { channel: 'telegram', delivered: false, reason: 'no_chat' };
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: input.telegramChatId,
      text: `${input.title}\n${input.body}`,
    }),
  });
  if (!response.ok) return { channel: 'telegram', delivered: false, reason: `http_${response.status}` };
  return { channel: 'telegram', delivered: true };
}
