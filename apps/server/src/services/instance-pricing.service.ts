import { Readable } from 'node:stream';
import StreamArray from 'stream-json/streamers/StreamArray.js';
import yaml from 'js-yaml';
import { cachedCall } from './cache.service.js';
import { logger } from '../utils/logger.js';

const HOURS_PER_MONTH = 730;
const CACHE_TTL = 86400; // 24 hours

type PriceIndex = Record<string, Record<string, number>>; // type -> region -> monthly price

const URLS: Record<string, string> = {
  AWS: 'https://instances.vantage.sh/instances.json',
  Azure: 'https://instances.vantage.sh/azure/instances.json',
  GCP: 'https://raw.githubusercontent.com/Cyclenerd/google-cloud-pricing-cost-calculator/master/pricing.yml',
};

/**
 * Stream-parse the large AWS/Azure JSON from vantage.sh.
 * Builds a full index: { instanceType: { region: monthlyPrice } }
 */
async function fetchVantageIndex(provider: 'AWS' | 'Azure'): Promise<PriceIndex> {
  const url = URLS[provider];
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch ${provider} pricing: ${response.status}`);
  }

  const index: PriceIndex = {};

  return new Promise<PriceIndex>((resolve, reject) => {
    const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream);
    const pipeline = nodeStream.pipe(StreamArray.withParser());

    pipeline.on('data', ({ value }: { value: Record<string, unknown> }) => {
      const instanceType = value.instance_type as string | undefined;
      const pricing = value.pricing as Record<string, { linux?: { ondemand?: string } }> | undefined;

      if (!instanceType || !pricing) return;

      const regions: Record<string, number> = {};
      for (const [region, info] of Object.entries(pricing)) {
        const hourly = parseFloat(info?.linux?.ondemand ?? '');
        if (!isNaN(hourly) && hourly > 0) {
          regions[region] = Math.round(hourly * HOURS_PER_MONTH * 100) / 100;
        }
      }

      if (Object.keys(regions).length > 0) {
        index[instanceType] = regions;
      }
    });

    pipeline.on('end', () => resolve(index));
    pipeline.on('error', reject);
  });
}

/**
 * Fetch and parse the GCP pricing YAML.
 * Builds a full index: { instanceType: { region: monthlyPrice } }
 */
async function fetchGcpIndex(): Promise<PriceIndex> {
  const url = URLS.GCP;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch GCP pricing: ${response.status}`);
  }

  const text = await response.text();
  const data = yaml.load(text) as {
    compute?: {
      instance?: Record<string, { cost?: Record<string, { hour?: number }> }>;
    };
  };

  const instances = data?.compute?.instance;
  if (!instances) return {};

  const index: PriceIndex = {};

  for (const [type, info] of Object.entries(instances)) {
    if (!info?.cost) continue;

    const regions: Record<string, number> = {};
    for (const [region, costInfo] of Object.entries(info.cost)) {
      const hourly = costInfo?.hour;
      if (typeof hourly === 'number' && hourly > 0) {
        regions[region] = Math.round(hourly * HOURS_PER_MONTH * 100) / 100;
      }
    }

    if (Object.keys(regions).length > 0) {
      index[type] = regions;
    }
  }

  return index;
}

/**
 * Get the full pricing index for a provider, cached in Redis for 24h.
 */
async function getProviderIndex(provider: 'AWS' | 'Azure' | 'GCP'): Promise<PriceIndex> {
  const cacheKey = `pricing:${provider.toLowerCase()}:index`;

  return cachedCall(cacheKey, CACHE_TTL, async () => {
    logger.info({ provider }, 'Fetching instance pricing from external source');

    if (provider === 'GCP') {
      return fetchGcpIndex();
    }
    return fetchVantageIndex(provider);
  });
}

/**
 * Fetch monthly on-demand prices for specific instance types.
 *
 * Returns: { [instanceType]: { [region]: monthlyPrice } }
 */
export async function fetchInstancePrices(
  provider: 'AWS' | 'Azure' | 'GCP',
  instanceTypes: string[],
  regions: string[],
): Promise<Record<string, Record<string, number>>> {
  const index = await getProviderIndex(provider);

  const result: Record<string, Record<string, number>> = {};

  for (const type of instanceTypes) {
    const typeData = index[type];
    if (!typeData) continue;

    const filtered: Record<string, number> = {};
    if (regions.length > 0) {
      for (const region of regions) {
        if (typeData[region] !== undefined) {
          filtered[region] = typeData[region];
        }
      }
    } else {
      Object.assign(filtered, typeData);
    }

    if (Object.keys(filtered).length > 0) {
      result[type] = filtered;
    }
  }

  return result;
}
