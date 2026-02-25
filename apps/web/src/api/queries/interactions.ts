import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { InteractionDetail } from '@siesta/shared';

export function useInteractionDetail(
  accountId: string | undefined,
  sourceType: string | undefined,
  recordId: string | undefined,
) {
  return useQuery<InteractionDetail>({
    queryKey: ['interactions', accountId, sourceType, recordId],
    queryFn: () =>
      api.get<InteractionDetail>(
        `/interactions/${accountId}/${sourceType}/${recordId}`,
      ),
    enabled: !!accountId && !!sourceType && !!recordId,
  });
}
