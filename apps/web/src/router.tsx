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
import { lazy, Suspense } from 'react';

// Feature pages are code-split so the first load stays small.
// biome-ignore lint/suspicious/noExplicitAny: lazy pages have varied props.
const lz = <M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M) =>
  lazy(async () => ({ default: (await load())[name] as React.ComponentType<any> }));
const HelpPage = lz(() => import('./pages/help'), 'HelpPage');
const AboutPage = lz(() => import('./pages/help'), 'AboutPage');
const PrivacyPage = lz(() => import('./pages/legal'), 'PrivacyPage');
const TermsPage = lz(() => import('./pages/legal'), 'TermsPage');
const CalendarPage = lz(() => import('./pages/explore'), 'CalendarPage');
const CategoriesPage = lz(() => import('./pages/explore'), 'CategoriesPage');
const InsightsPage = lz(() => import('./pages/explore'), 'InsightsPage');
const StoresPage = lz(() => import('./pages/explore'), 'StoresPage');
const CollectionsPage = lz(() => import('./pages/collections'), 'CollectionsPage');
const SharedPage = lz(() => import('./pages/collections'), 'SharedPage') as unknown as React.ComponentType<{ d?: string }>;
const ComparePage = lz(() => import('./pages/compare'), 'ComparePage') as unknown as React.ComponentType<{ ids?: string }>;
const DashboardPage = lz(() => import('./pages/dashboard'), 'DashboardPage');
const AchievementsPage = lz(() => import('./pages/dashboard'), 'AchievementsPage');
const FeaturesPage = lz(() => import('./pages/features'), 'FeaturesPage');
const ProfilePage = lz(() => import('./pages/account'), 'ProfilePage');
const SettingsPage = lz(() => import('./pages/account'), 'SettingsPage');
const ReferralPage = lz(() => import('./pages/account'), 'ReferralPage');
const SavingsPage = lz(() => import('./pages/savings'), 'SavingsPage');
const CommunityPage = lz(() => import('./pages/community'), 'CommunityPage');
const MemberPage = lz(() => import('./pages/community'), 'MemberPage') as unknown as React.ComponentType<{ id: string }>;
const ChatPage = lz(() => import('./pages/chat'), 'ChatPage') as unknown as React.ComponentType<{ dm?: string }>;
const RulesPage = lz(() => import('./pages/rules'), 'RulesPage');
const AgentsPage = lz(() => import('./pages/agents'), 'AgentsPage');
const AgentPage = lz(() => import('./pages/agents'), 'AgentPage') as unknown as React.ComponentType<{ id: string }>;
const RadarPage = lz(() => import('./pages/radar'), 'RadarPage');
const ToolboxPage = lz(() => import('./pages/toolbox'), 'ToolboxPage') as unknown as React.ComponentType<{ q?: string; tool?: string }>;
const AppPage = lz(() => import('./pages/app'), 'AppPage');
const ToolsPage = lz(() => import('./pages/tools'), 'ToolsPage') as unknown as React.ComponentType<{ price?: number }>;

const rootRoute = createRootRoute({
  component: () => (
    <Shell>
      <Suspense fallback={<div className="skeleton mx-auto h-64 max-w-5xl rounded-3xl" aria-busy="true" />}>
        <Outlet />
      </Suspense>
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

const simple = <P extends string>(path: P, component: () => React.ReactNode) => createRoute({ getParentRoute: () => rootRoute, path, component: component as () => React.JSX.Element });

const toolsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tools',
  validateSearch: (s: Record<string, unknown>): { price?: number } => ({ price: numberOrUndefined(s.price) }),
  component: function ToolsRoute() {
    const { price } = toolsRoute.useSearch();
    return <ToolsPage price={price} />;
  },
});
const compareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/compare',
  validateSearch: (s: Record<string, unknown>): { ids?: string } => ({ ids: typeof s.ids === 'string' ? s.ids : undefined }),
  component: function CompareRoute() {
    const { ids } = compareRoute.useSearch();
    return <ComparePage ids={ids} />;
  },
});
const sharedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shared',
  validateSearch: (s: Record<string, unknown>): { d?: string } => ({ d: typeof s.d === 'string' ? s.d : undefined }),
  component: function SharedRoute() {
    const { d } = sharedRoute.useSearch();
    return <SharedPage d={d} />;
  },
});
const str = (x: unknown) => (typeof x === 'string' && x ? x : undefined);
const toolboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/toolbox',
  validateSearch: (s: Record<string, unknown>): { q?: string; tool?: string } => ({ q: str(s.q), tool: str(s.tool) }),
  component: function ToolboxRoute() {
    const { q, tool } = toolboxRoute.useSearch();
    return <ToolboxPage q={q} tool={tool} />;
  },
});
const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  validateSearch: (s: Record<string, unknown>): { dm?: string } => ({ dm: str(s.dm) }),
  component: function ChatRoute() {
    const { dm } = chatRoute.useSearch();
    return <ChatPage dm={dm} />;
  },
});
const memberRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/u/$id',
  component: function MemberRoute() {
    const { id } = memberRoute.useParams();
    return <MemberPage id={id} />;
  },
});
const agentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents/$id',
  component: function AgentRoute() {
    const { id } = agentRoute.useParams();
    return <AgentPage id={id} />;
  },
});
const extraRoutes = [
  toolboxRoute,
  chatRoute,
  memberRoute,
  agentRoute,
  simple('/community', () => <CommunityPage />),
  simple('/rules', () => <RulesPage />),
  simple('/agents', () => <AgentsPage />),
  simple('/radar', () => <RadarPage />),
  simple('/app', () => <AppPage />),
  toolsRoute,
  compareRoute,
  sharedRoute,
  simple('/features', () => <FeaturesPage />),
  simple('/dashboard', () => <DashboardPage />),
  simple('/achievements', () => <AchievementsPage />),
  simple('/collections', () => <CollectionsPage />),
  simple('/savings', () => <SavingsPage />),
  simple('/calendar', () => <CalendarPage />),
  simple('/categories', () => <CategoriesPage />),
  simple('/stores', () => <StoresPage />),
  simple('/insights', () => <InsightsPage />),
  simple('/profile', () => <ProfilePage />),
  simple('/settings', () => <SettingsPage />),
  simple('/referral', () => <ReferralPage />),
  simple('/help', () => <HelpPage />),
  simple('/about', () => <AboutPage />),
  simple('/privacy', () => <PrivacyPage />),
  simple('/terms', () => <TermsPage />),
];

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
  ...extraRoutes,
]);

export const router = createRouter({
  routeTree,
  // The static demo (no server rewrites) uses #/ URLs so deep links survive reloads.
  history:
    import.meta.env.VITE_DEMO_MODE === 'static'
      ? createHashHistory()
      : undefined,
  defaultNotFoundComponent: () => (
    <div className="py-20 text-center">
      <p className="text-gradient text-7xl font-bold">404</p>
      <p className="mt-3 text-muted">الصفحة دي مش موجودة · Page not found</p>
      <Link to="/" className="mt-4 inline-block font-semibold text-primary">صفقة ← الرئيسية</Link>
    </div>
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
