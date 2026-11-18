import { FormEvent, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';

interface ProviderRow {
  id: string;
  label: string;
  configured: boolean;
  model: string;
  keyEnv: string;
  keyHint: string | null;
  freeTier: string;
  freeNote: string;
}

interface Overview {
  stores: Array<{ slug: string; status: string; nameEn: string }>;
  crawl: Record<string, number>;
  debates: { count: number; tokens: number };
  providers?: ProviderRow[];
  roles?: Array<{ role: string; chain: string[] }>;
  router?: Array<{
    id: string;
    provider: string;
    model: string;
    circuit: string;
    ewmaMs: number;
    dailyUsed: number;
    dailyCap: number | null;
    successes: number;
    failures: number;
    lastError: string | null;
  }>;
}

export function AdminPage() {
  const { client } = useSession();
  const { t } = usePrefs();
  const [token, setToken] = useState(() => window.sessionStorage.getItem('safqa.admin') ?? '');
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(event?: FormEvent) {
    event?.preventDefault();
    window.sessionStorage.setItem('safqa.admin', token);
    setError(null);
    try {
      setData(await client.admin(token));
    } catch (caught) {
      setData(null);
      setError(caught instanceof Error ? caught.message : t('common.error'));
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-semibold">{t('admin.title')}</h1>
      <form onSubmit={(event) => void load(event)} className="mt-4 flex gap-2">
        <Input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={t('admin.token')}
          aria-label={t('admin.token')}
        />
        <Button type="submit">{t('action.search')}</Button>
      </form>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {data ? (
        <div className="mt-6 space-y-4">
          <p>
            {data.debates.count} debates · {data.debates.tokens} tokens
          </p>
          <p>{Object.entries(data.crawl).map(([heat, count]) => `${heat} ${count}`).join(' · ')}</p>
          <ul className="space-y-1 text-sm">
            {data.stores.map((store) => (
              <li key={store.slug}>
                {store.nameEn} — {store.status}
              </li>
            ))}
          </ul>
          <h2 className="text-xl font-semibold">{t('admin.providers')}</h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-accent text-xs">
                <tr>
                  <th className="p-2">Provider</th>
                  <th className="p-2">Key</th>
                  <th className="p-2">Model</th>
                  <th className="p-2">Free tier</th>
                </tr>
              </thead>
              <tbody>
                {(data.providers ?? []).map((provider) => (
                  <tr key={provider.id} className="border-t border-border">
                    <td className="p-2">
                      {provider.label}
                      <div className="text-xs text-muted">{provider.keyEnv}</div>
                    </td>
                    <td className="p-2">{provider.configured ? (provider.keyHint ?? 'ready') : 'missing'}</td>
                    <td className="p-2">{provider.model}</td>
                    <td className="p-2" title={provider.freeNote}>
                      {provider.freeTier}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="text-xl font-semibold">Router</h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-accent text-xs">
                <tr>
                  <th className="p-2">Model</th>
                  <th className="p-2">Circuit</th>
                  <th className="p-2">EWMA ms</th>
                  <th className="p-2">Quota</th>
                  <th className="p-2">OK / fail</th>
                </tr>
              </thead>
              <tbody>
                {(data.router ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="p-2">
                      {row.model}
                      <div className="text-xs text-muted">{row.provider}</div>
                    </td>
                    <td className="p-2">{row.circuit}</td>
                    <td className="p-2">{row.ewmaMs}</td>
                    <td className="p-2">
                      {row.dailyUsed}
                      {row.dailyCap == null ? '' : ` / ${row.dailyCap}`}
                    </td>
                    <td className="p-2">
                      {row.successes} / {row.failures}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-1 text-xs text-muted">
            {(data.roles ?? []).map((role) => (
              <li key={role.role}>
                {role.role}: {role.chain.join(' → ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
