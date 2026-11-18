import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { cached, type Loaded, loadSnapshot } from './data';
import { checkWatchlist } from './notify';

interface Ctx { data: Loaded | null; loading: boolean; error: string | null; refresh: () => Promise<void> }
const SnapshotContext = createContext<Ctx>({ data: null, loading: true, error: null, refresh: async () => undefined });

export function SnapshotProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadSnapshot();
      setData(next);
      setError(next.fromCache ? 'offline' : null);
      void checkWatchlist(next.snap).catch(() => undefined);
    } catch {
      setError('failed');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void cached().then((c) => c && setData((d) => d ?? c));
    void refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  return <SnapshotContext.Provider value={{ data, loading, error, refresh }}>{children}</SnapshotContext.Provider>;
}
export const useSnapshot = () => useContext(SnapshotContext);
