import { useQuery } from '@tanstack/react-query';
import { useSession } from './session';

/** Every product the API knows (search with no filters). */
export function useCatalog() {
  const { client } = useSession();
  return useQuery({ queryKey: ['catalog'], queryFn: () => client.search({}), staleTime: 60_000 });
}

export function useProductBundle(id: string) {
  const { client } = useSession();
  const product = useQuery({ queryKey: ['product', id], queryFn: () => client.product(id) });
  const history = useQuery({ queryKey: ['history', id], queryFn: () => client.history(id) });
  const prediction = useQuery({ queryKey: ['prediction', id], queryFn: () => client.prediction(id) });
  return { product, history, prediction };
}
