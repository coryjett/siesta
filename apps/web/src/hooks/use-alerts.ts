import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useHomeData, useMyActionItems } from '../api/queries/home';
import { useOpportunities } from '../api/queries/opportunities';
import type { POCSummaryResponse } from '../api/queries/accounts';
import { api } from '../api/client';

export interface AccountAlert {
  id: string;
  accountId: string;
  accountName: string;
  severity: 'critical' | 'warning';
  title: string;
  detail: string;
}

export function useAlerts(): { alerts: AccountAlert[]; isLoading: boolean } {
  const { data, isLoading: homeLoading } = useHomeData();
  const { data: myActionItemsData, isLoading: aiItemsLoading } = useMyActionItems();
  const { data: opportunities } = useOpportunities();

  const openAiItems = useMemo(
    () => (myActionItemsData?.items ?? []).filter((i) => i.status === 'open'),
    [myActionItemsData],
  );

  const accountIds = useMemo(
    () => (data?.myAccounts ?? []).map((a: { id: string }) => a.id),
    [data],
  );

  const pocQueries = useQueries({
    queries: accountIds.map((id) => ({
      queryKey: ['accounts', id, 'poc-summary'],
      queryFn: () => api.get<POCSummaryResponse>(`/accounts/${id}/poc-summary`),
      staleTime: 60 * 60 * 1000,
      retry: 1,
    })),
  });

  const healthMap = useMemo(() => {
    const map = new Map<string, { rating: 'green' | 'yellow' | 'red'; reason: string }>();
    accountIds.forEach((id, i) => {
      const health = pocQueries[i]?.data?.health;
      if (health) map.set(id, health);
    });
    return map;
  }, [accountIds, pocQueries]);

  const interactionQueries = useQueries({
    queries: accountIds.map((id) => ({
      queryKey: ['accounts', id, 'interactions', { sourceTypes: ['gong_call'], limit: 1 }],
      queryFn: () => api.get<Array<{ date: string }>>(`/accounts/${id}/interactions?sourceTypes=gong_call&limit=5`),
      staleTime: 5 * 60 * 1000,
      enabled: accountIds.length > 0,
    })),
  });

  const accountExtras = useMemo(() => {
    const map = new Map<string, { oppStage: string | null; oppAmount: number | null; oppCloseDate: string | null; lastCallDate: string | null; daysSinceLastCall: number | null }>();
    accountIds.forEach((id, idx) => {
      const interactions = interactionQueries[idx]?.data;
      const lastCall = Array.isArray(interactions)
        ? interactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
        : null;
      const daysSinceLastCall = lastCall?.date
        ? Math.floor((Date.now() - new Date(lastCall.date).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      const accountOpps = (opportunities ?? []).filter(
        (o) => o.accountId === id && !o.isClosed,
      );
      const primaryOpp = accountOpps[0];

      map.set(id, {
        oppStage: primaryOpp?.stage ?? null,
        oppAmount: primaryOpp?.amount ?? null,
        oppCloseDate: primaryOpp?.closeDate ?? null,
        lastCallDate: lastCall?.date ?? null,
        daysSinceLastCall,
      });
    });
    return map;
  }, [accountIds, interactionQueries, opportunities]);

  const alerts = useMemo<AccountAlert[]>(() => {
    const accounts = data?.myAccounts ?? [];
    const now = Date.now();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const result: AccountAlert[] = [];

    for (const account of accounts) {
      const health = healthMap.get(account.id);
      const extras = accountExtras.get(account.id);
      const days = extras?.daysSinceLastCall;
      const closeDate = extras?.oppCloseDate;
      const hasOpenOpp = extras?.oppStage != null;
      const daysToClose = closeDate
        ? Math.ceil((new Date(closeDate).getTime() - now) / (1000 * 60 * 60 * 24))
        : null;
      const closeText = daysToClose != null
        ? daysToClose <= 0 ? 'past close date' : `closing in ${daysToClose}d`
        : '';

      const overdueCount = openAiItems.filter(
        (i) => i.accountId === account.id && i.date && now - new Date(i.date).getTime() > fourteenDaysMs,
      ).length;

      // Critical: POC at risk, deal closing soon
      if (health?.rating === 'red' && daysToClose != null && daysToClose <= 30) {
        const amountText = extras?.oppAmount ? `$${(extras.oppAmount / 1000).toFixed(0)}K deal ` : '';
        result.push({
          id: `${account.id}:poc-risk-closing`,
          accountId: account.id,
          accountName: account.name,
          severity: 'critical',
          title: 'POC at risk',
          detail: `Red POC health with ${amountText}${closeText}`,
        });
      }

      // Critical: Stale account with open deal
      if (days != null && days > 14 && hasOpenOpp) {
        result.push({
          id: `${account.id}:stale-open-deal`,
          accountId: account.id,
          accountName: account.name,
          severity: 'critical',
          title: 'Stale account',
          detail: `No calls in ${days}d with open opportunity`,
        });
      }

      // Warning: POC health declining
      if (health?.rating === 'yellow') {
        result.push({
          id: `${account.id}:poc-yellow`,
          accountId: account.id,
          accountName: account.name,
          severity: 'warning',
          title: 'POC health declining',
          detail: health.reason || 'Yellow POC health',
        });
      }

      // Warning: Many overdue action items
      if (overdueCount >= 3) {
        result.push({
          id: `${account.id}:many-overdue`,
          accountId: account.id,
          accountName: account.name,
          severity: 'warning',
          title: 'Overdue action items',
          detail: `${overdueCount} action items overdue (>14 days)`,
        });
      }

      // Warning: Deal closing soon, no recent call
      if (daysToClose != null && daysToClose <= 30 && days != null && days > 7) {
        result.push({
          id: `${account.id}:closing-no-call`,
          accountId: account.id,
          accountName: account.name,
          severity: 'warning',
          title: 'Deal closing soon',
          detail: `${closeText}, last call ${days}d ago`,
        });
      }
    }

    // Sort: critical first, then by close date (soonest first)
    result.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
      const aClose = accountExtras.get(a.accountId)?.oppCloseDate;
      const bClose = accountExtras.get(b.accountId)?.oppCloseDate;
      if (aClose && bClose) return new Date(aClose).getTime() - new Date(bClose).getTime();
      if (aClose) return -1;
      if (bClose) return 1;
      return 0;
    });

    return result;
  }, [data?.myAccounts, healthMap, accountExtras, openAiItems]);

  return { alerts, isLoading: homeLoading || aiItemsLoading };
}
