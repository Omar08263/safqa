import { keys } from './activity';
import { useLocal } from './local';

export const COMPARE_MAX = 4;
export function useCompare() {
  const [ids, setIds] = useLocal<string[]>(keys.compare, []);
  return {
    ids,
    has: (id: string) => ids.includes(id),
    toggle: (id: string): 'added' | 'removed' | 'full' => {
      if (ids.includes(id)) {
        setIds(ids.filter((x) => x !== id));
        return 'removed';
      }
      if (ids.length >= COMPARE_MAX) return 'full';
      setIds([...ids, id]);
      return 'added';
    },
    remove: (id: string) => setIds(ids.filter((x) => x !== id)),
    clear: () => setIds([]),
    set: setIds,
  };
}
