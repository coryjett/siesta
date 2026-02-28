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

const accountSummaryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts/$accountId/summary',
  component: lazyRouteComponent(
    () => import('./pages/accounts/$accountId.summary'),
  ),
});

const accountPOCStatusRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts/$accountId/poc-status',
  component: lazyRouteComponent(
    () => import('./pages/accounts/$accountId.poc-status'),
  ),
});

const accountTechnicalDetailsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts/$accountId/technical-details',
  component: lazyRouteComponent(
    () => import('./pages/accounts/$accountId.technical-details'),
  ),
});

const interactionDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/interactions/$accountId/$sourceType/$recordId',
  component: lazyRouteComponent(
    () => import('./pages/interactions/$accountId.$sourceType.$recordId'),
  ),
});

const actionItemsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/action-items',
  component: lazyRouteComponent(
    () => import('./pages/action-items/index'),
  ),
});

const opportunitiesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/opportunities',
  component: lazyRouteComponent(
    () => import('./pages/opportunities/index'),
  ),
});

const opportunityDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/opportunities/$opportunityId',
  component: lazyRouteComponent(
    () => import('./pages/opportunities/$opportunityId'),
  ),
});

const meetingBriefRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/meetings/brief/$accountId',
  component: lazyRouteComponent(
    () => import('./pages/meetings/brief'),
  ),
});

const insightsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/insights',
  component: lazyRouteComponent(() => import('./pages/insights/index')),
});

const toolsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/tools',
  component: lazyRouteComponent(() => import('./pages/tools/index')),
});

const ambientCalculatorRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/tools/ambient-calculator',
  component: lazyRouteComponent(
    () => import('./pages/tools/ambient-calculator'),
  ),
});

const contactsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/contacts',
  component: lazyRouteComponent(() => import('./pages/contacts/index')),
});

const resourcesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/resources',
  component: lazyRouteComponent(() => import('./pages/resources/index')),
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
    actionItemsRoute,
    accountDetailRoute,
    accountSummaryRoute,
    accountPOCStatusRoute,
    accountTechnicalDetailsRoute,
    interactionDetailRoute,
    opportunitiesRoute,
    opportunityDetailRoute,
    meetingBriefRoute,
    contactsRoute,
    insightsRoute,
    toolsRoute,
    ambientCalculatorRoute,
    resourcesRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
