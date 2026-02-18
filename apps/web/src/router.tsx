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

const kanbanRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/opportunities/kanban',
  component: lazyRouteComponent(() => import('./pages/opportunities/kanban')),
});

const opportunityDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/opportunities/$opportunityId',
  component: lazyRouteComponent(
    () => import('./pages/opportunities/$opportunityId'),
  ),
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

const gongSearchRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/gong/search',
  component: lazyRouteComponent(() => import('./pages/gong/search')),
});

const callDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/gong/$callId',
  component: lazyRouteComponent(() => import('./pages/gong/$callId')),
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
    kanbanRoute,
    opportunityDetailRoute,
    accountsRoute,
    accountDetailRoute,
    gongSearchRoute,
    callDetailRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
