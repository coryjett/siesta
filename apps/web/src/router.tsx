import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  lazyRouteComponent,
} from '@tanstack/react-router';
import AppShell from './components/layout/app-shell';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: lazyRouteComponent(() => import('./pages/login')),
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppShell,
});

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./pages/home')),
});

const accountsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts',
  component: lazyRouteComponent(() => import('./pages/accounts/index')),
});

const accountDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts/$accountId',
  component: lazyRouteComponent(() => import('./pages/accounts/$accountId')),
});

const searchRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/search',
  component: lazyRouteComponent(() => import('./pages/search/index')),
});

const interactionDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/interactions/$accountId/$sourceType/$recordId',
  component: lazyRouteComponent(
    () => import('./pages/interactions/$accountId.$sourceType.$recordId'),
  ),
});

const opportunityDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/opportunities/$opportunityId',
  component: lazyRouteComponent(
    () => import('./pages/opportunities/$opportunityId'),
  ),
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('./pages/settings/index')),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    homeRoute,
    accountsRoute,
    accountDetailRoute,
    searchRoute,
    interactionDetailRoute,
    opportunityDetailRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
