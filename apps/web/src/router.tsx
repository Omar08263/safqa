import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from '@tanstack/react-router';
import { Shell } from './components/shell';
import { AdminPage } from './pages/admin';
import { AlertsPage } from './pages/alerts';
import { AssistantPage } from './pages/assistant';
import { HomePage } from './pages/home';
import { LoginPage } from './pages/login';
import { ProductPage } from './pages/product';
import { SearchFilters, SearchPage } from './pages/search';
import { WatchlistPage } from './pages/watchlist';

const rootRoute = createRootRoute({
  component: () => (
    <Shell>
      <Outlet />
    </Shell>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
});

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/search',
  validateSearch: (search: Record<string, unknown>): SearchFilters => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    store: typeof search.store === 'string' ? search.store : undefined,
    category: typeof search.category === 'string' ? search.category : undefined,
    minDiscount: numberOrUndefined(search.minDiscount),
    minPrice: numberOrUndefined(search.minPrice),
    maxPrice: numberOrUndefined(search.maxPrice),
    inStock:
      search.inStock === true ||
      search.inStock === '1' ||
      search.inStock === 'true',
    hideFake:
      search.hideFake === true ||
      search.hideFake === '1' ||
      search.hideFake === 'true',
    sort:
      search.sort === 'price_asc' ||
      search.sort === 'discount' ||
      search.sort === 'score'
        ? search.sort
        : 'score',
  }),
  component: function SearchRoute() {
    const search = searchRoute.useSearch();
    return <SearchPage search={search} />;
  },
});

const productRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/product/$id',
  component: function ProductRoute() {
    const { id } = productRoute.useParams();
    return <ProductPage id={id} />;
  },
});

const watchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/watchlist',
  component: WatchlistPage,
});

const assistantRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/assistant',
  component: AssistantPage,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: AdminPage,
});

const alertsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/alerts',
  component: AlertsPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

const routeTree = rootRoute.addChildren([
  indexRoute,
  searchRoute,
  productRoute,
  watchRoute,
  alertsRoute,
  assistantRoute,
  adminRoute,
  loginRoute,
]);

export const router = createRouter({
  routeTree,
  // The static demo (no server rewrites) uses #/ URLs so deep links survive reloads.
  history:
    import.meta.env.VITE_DEMO_MODE === 'static'
      ? createHashHistory()
      : undefined,
  defaultNotFoundComponent: () => (
    <p className="text-center">
      <Link to="/">صفقة</Link>
    </p>
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
