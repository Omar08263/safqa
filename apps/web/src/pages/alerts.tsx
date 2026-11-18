import type { AlertSettings } from '@safqa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';

export function AlertsPage() {
  const { client, user } = useSession();
  const { t } = usePrefs();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ['alert-settings'],
    queryFn: () => client.alertSettings(),
    enabled: Boolean(user),
  });
  const alerts = useQuery({
    queryKey: ['alerts'],
    queryFn: () => client.alerts(),
    enabled: Boolean(user),
  });
  const save = useMutation({
    mutationFn: (patch: Partial<AlertSettings>) => client.updateAlertSettings(patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['alert-settings'] });
    },
  });
  const test = useMutation({
    mutationFn: () => client.sendTestAlert(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  if (!user) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-8 text-center">
        <Link to="/login" className="font-semibold text-primary">
          {t('nav.login')}
        </Link>
      </div>
    );
  }

  const current = settings.data;

  return (
    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-3xl border border-border bg-card p-5">
        <h1 className="text-2xl font-semibold">{t('alerts.settings')}</h1>
        {current ? (
          <form
            className="mt-4 space-y-3 text-sm"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              save.mutate({
                priceDrop: data.get('priceDrop') === 'on',
                backInStock: data.get('backInStock') === 'on',
                targetHit: data.get('targetHit') === 'on',
                webPush: data.get('webPush') === 'on',
                expoPush: data.get('expoPush') === 'on',
                telegram: data.get('telegram') === 'on',
                minDropPct: Number(data.get('minDropPct') || 5),
                telegramChatId: String(data.get('telegramChatId') || '') || null,
                expoPushToken: String(data.get('expoPushToken') || '') || null,
              });
            }}
          >
            <Check name="priceDrop" label={t('alerts.priceDrop')} defaultChecked={current.priceDrop} />
            <Check name="backInStock" label={t('alerts.backInStock')} defaultChecked={current.backInStock} />
            <Check name="targetHit" label={t('alerts.targetHit')} defaultChecked={current.targetHit} />
            <Check name="webPush" label={t('alerts.webPush')} defaultChecked={current.webPush} />
            <Check name="expoPush" label={t('alerts.expo')} defaultChecked={current.expoPush} />
            <Check name="telegram" label={t('alerts.telegram')} defaultChecked={current.telegram} />
            <label className="block">
              {t('alerts.minDrop')}
              <Input name="minDropPct" className="mt-1" defaultValue={current.minDropPct} />
            </label>
            <label className="block">
              {t('alerts.telegram')}
              <Input name="telegramChatId" className="mt-1" defaultValue={current.telegramChatId ?? ''} placeholder={t('alerts.telegramHint')} />
            </label>
            <label className="block">
              {t('alerts.expo')}
              <Input name="expoPushToken" className="mt-1" defaultValue={current.expoPushToken ?? ''} placeholder={t('alerts.expoHint')} />
            </label>
            <div className="flex gap-2">
              <Button type="submit">{t('action.save')}</Button>
              <Button type="button" variant="outline" onClick={() => test.mutate()}>
                {t('action.sendTest')}
              </Button>
            </div>
            <p className="text-xs text-muted">{t('alerts.test')}</p>
          </form>
        ) : (
          <p className="mt-4">{t('common.loading')}</p>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-xl font-semibold">{t('alerts.title')}</h2>
        {alerts.data && alerts.data.items.length === 0 ? <p className="text-muted">{t('alerts.empty')}</p> : null}
        <div className="space-y-3">
          {alerts.data?.items.map((alert) => (
            <article key={alert.id} className="rounded-3xl border border-border bg-card p-4">
              <p className="text-xs text-muted">{new Date(alert.createdAt).toLocaleString(localeTag())}</p>
              <h3 className="mt-1 font-semibold">{alert.title}</h3>
              <p className="mt-1 text-sm leading-6">{alert.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}

function localeTag() {
  return document.documentElement.lang === 'ar' ? 'ar-EG' : 'en-GB';
}
