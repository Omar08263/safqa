import { useEffect, useState } from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  useNavigate,
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
const PlansPage = lz(() => import('./pages/plans'), 'PlansPage');
const ChannelsPage = lz(() => import('./pages/channels'), 'ChannelsPage');
const PayPage = lz(() => import('./pages/pay'), 'PayPage');
const LivePage = lz(() => import('./pages/live'), 'LivePage');
const StatusPage = lz(() => import('./v6/status'), 'StatusPage');
const SystemsPage = lz(() => import('./v6/systems'), 'SystemsPage');
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
const RulesPage = lz(() => import('./pages/rules'), 'RulesPage');
const AgentsPage = lz(() => import('./pages/agents'), 'AgentsPage');
const AgentPage = lz(() => import('./pages/agents'), 'AgentPage') as unknown as React.ComponentType<{ id: string }>;
const RadarPage = lz(() => import('./pages/radar'), 'RadarPage');
const ToolboxPage = lz(() => import('./pages/toolbox'), 'ToolboxPage') as unknown as React.ComponentType<{ q?: string; tool?: string }>;
const AppPage = lz(() => import('./pages/app'), 'AppPage');
const HotPage = lz(() => import('./pages/v5'), 'HotPage') as unknown as React.ComponentType<{ cat?: string; sort?: string }>;
const V5ProductPage = lz(() => import('./pages/v5'), 'V5ProductPage') as unknown as React.ComponentType<{ id: string }>;
const DropsPage = lz(() => import('./pages/v5'), 'DropsPage');
const CouponsPage = lz(() => import('./pages/v5'), 'CouponsPage');
const AddLinkPage = lz(() => import('./pages/v5'), 'AddLinkPage');
const SourcesPage = lz(() => import('./pages/v5'), 'SourcesPage');
const AiLabPage = lz(() => import('./future/ai-lab'), 'AiLabPage');
const LensPage = lz(() => import('./future/lens'), 'LensPage');
const VoicePage = lz(() => import('./future/voice'), 'VoicePage');
const TimeMachinePage = lz(() => import('./future/time-machine'), 'TimeMachinePage');
const GlobePage = lz(() => import('./future/globe'), 'GlobePage');
const WhatsNewPage = lz(() => import('./components/whats-new'), 'WhatsNewPage');
const SmartPage = lz(() => import('./pages/smart'), 'SmartPage') as unknown as React.ComponentType<{ tab?: string }>;
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

const hotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/hot',
  validateSearch: (s: Record<string, unknown>): { cat?: string; sort?: string } => ({ cat: typeof s.cat === 'string' ? s.cat : undefined, sort: typeof s.sort === 'string' ? s.sort : undefined }),
  component: function HotRoute() {
    const s = hotRoute.useSearch();
    return <HotPage cat={s.cat} sort={s.sort ?? 'heat'} />;
  },
});
const v5ProductRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$id',
  component: function V5ProductRoute() {
    const { id } = v5ProductRoute.useParams();
    return <V5ProductPage key={id} id={id} />;
  },
});
const dropsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/drops', component: DropsPage });
const couponsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/coupons', component: CouponsPage });
const addRoute = createRoute({ getParentRoute: () => rootRoute, path: '/add', component: AddLinkPage });
const smartRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/smart',
  validateSearch: (s: Record<string, unknown>): { tab?: string } => ({ tab: typeof s.tab === 'string' ? s.tab : undefined }),
  component: function SmartRoute() { const s = smartRoute.useSearch(); return <SmartPage key={s.tab} tab={s.tab} />; },
});
const sourcesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/sources', component: SourcesPage });

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
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({ next: typeof s.next === 'string' && s.next.startsWith('/') && !s.next.startsWith('//') ? s.next : undefined }),
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
  // One community: the old in-browser chat now lives on the server-backed #/live.
  component: () => <ToLive tab="chat" />,
});
const memberRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/u/$id',
  component: () => <ToLive tab="feed" />,
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
  simple('/ai', () => <AiLabPage />),
  simple('/lens', () => <LensPage />),
  simple('/voice', () => <VoicePage />),
  simple('/time-machine', () => <TimeMachinePage />),
  simple('/globe', () => <GlobePage />),
  simple('/whats-new', () => <WhatsNewPage />),
  toolboxRoute,
  chatRoute,
  memberRoute,
  agentRoute,
  simple('/community', () => <ToLive tab="feed" />),
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
  simple('/plans', () => <PlansPage />),
  simple('/channels', () => <ChannelsPage />),
  simple('/pay', () => <PayPage />),
  simple('/auth/callback', () => <AuthCallback />),
  simple('/live', () => <LivePage />),
  simple('/status', () => <StatusPage />),
  simple('/systems', () => <SystemsPage />),
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
  hotRoute,
  v5ProductRoute,
  dropsRoute,
  couponsRoute,
  addRoute,
  sourcesRoute,
  smartRoute,
  watchRoute,
  alertsRoute,
  assistantRoute,
  adminRoute,
  loginRoute,
  ...extraRoutes,
]);

/** /community, /chat and /u/:id all open the single server-synced community at /live. */
function ToLive({ tab }: { tab: 'chat' | 'feed' }) {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: '/live', search: { tab } as never, replace: true });
  }, [navigate, tab]);
  return null;
}

/** Google returns to /auth/callback#id_token=…; main.tsx finishes sign-in before the router starts. */
function AuthCallback() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: '/login', replace: true });
  }, [navigate]);
  return <div className="skeleton mx-auto h-64 max-w-5xl rounded-3xl" aria-busy="true" />;
}

const LOST = [
  { emoji: '🧭', ar: 'شكلك تهت في السوق!', en: 'Looks like you got lost in the souq!' },
  { emoji: '🛒', ar: 'العربية فاضية والصفحة دي مش موجودة', en: 'Empty cart, and this page does not exist' },
  { emoji: '🕵️', ar: 'دوّرنا في كل المتاجر… مفيش صفحة بالاسم ده', en: 'We searched every store… no page by that name' },
];

function NotFound() {
  const [pick] = useState(() => LOST[Math.floor(Math.random() * LOST.length)] ?? LOST[0]!);
  return (
    <div className="mx-auto max-w-lg py-16 text-center" role="alert">
      <p className="text-6xl" aria-hidden="true">{pick.emoji}</p>
      <p className="text-gradient mt-2 text-7xl font-bold">404</p>
      <h1 className="mt-3 text-xl font-bold">{pick.ar}</h1>
      <p className="mt-1 text-sm text-muted" lang="en" dir="ltr">{pick.en}</p>
      <p className="mt-4 text-[15px] text-muted">يمكن اللينك قديم أو فيه حرف ناقص. جرّب واحدة من دول:</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link to="/" className="press rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">الرئيسية</Link>
        <Link to="/hot" className="press rounded-full border border-border px-5 py-2.5 text-sm font-semibold">الصفقات السخنة 🔥</Link>
        <Link to="/search" search={{ q: '' } as never} className="press rounded-full border border-border px-5 py-2.5 text-sm font-semibold">دوّر على منتج</Link>
      </div>
    </div>
  );
}

export const router = createRouter({
  routeTree,
  // Clean history URLs (/login, /product/x). Cloudflare Pages serves index.html for
  // every path via public/_redirects, so deep links survive reloads.
  defaultNotFoundComponent: NotFound,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
