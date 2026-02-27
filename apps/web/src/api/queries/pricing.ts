import { api } from '../client';

interface PricingResponse {
  prices: Record<string, Record<string, number>>;
}

export async function fetchPrices(
  provider: string,
  types: string[],
  regions: string[],
): Promise<Record<string, Record<string, number>>> {
  const params = new URLSearchParams({ provider, types: types.join(',') });
  if (regions.length > 0) {
    params.set('regions', regions.join(','));
  }
  const data = await api.get<PricingResponse>(`/pricing?${params.toString()}`);
  return data.prices;
}
