import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { InteractionDetail } from '@siesta/shared';

export function useInteractionDetail(
  accountId: string | undefined,
  sourceType: string | undefined,
  recordId: string | undefined,
  title?: string,
  options?: { brief?: boolean },
) {
  const brief = options?.brief ?? false;
  return useQuery<InteractionDetail>({
    queryKey: ['interactions', accountId, sourceType, recordId, brief ? 'brief' : 'default'],
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (title) searchParams.set('title', title);
      if (brief) searchParams.set('brief', 'true');
      const qs = searchParams.toString();
      return api.get<InteractionDetail>(
        `/interactions/${accountId}/${sourceType}/${recordId}${qs ? `?${qs}` : ''}`,
      );
    },
    enabled: !!accountId && !!sourceType && !!recordId,
    staleTime: sourceType === 'gong_call' ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000, // gong: 24h (immutable), other: 5 min
  });
}
