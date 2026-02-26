import { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../auth/guards.js';
import { getAllSettings, setSetting } from '../services/settings.service.js';
import { BadRequestError } from '../utils/errors.js';
import { callTool, resetSession } from '../integrations/mcp/client.js';
import { getRedisClient, isRedisAvailable } from '../services/cache.service.js';
import { getWarmupStatus } from '../services/openai-summary.service.js';
import { env } from '../config/env.js';

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  const adminOnly = { preHandler: [requireRole('admin')] };

  /**
   * GET /api/settings
   * Get all application settings. (admin only)
   */
  app.get('/api/settings', adminOnly, async (_request, reply) => {
    const settings = await getAllSettings();
    return reply.send(settings);
  });

  /**
   * PUT /api/settings/:key
   * Update a single setting by key. (admin only)
   */
  app.put<{ Params: { key: string }; Body: { value: string } }>(
    '/api/settings/:key',
    adminOnly,
    async (request, reply) => {
      const { key } = request.params;
      const { value } = request.body as { value: string };

      if (!value && value !== '') {
        throw new BadRequestError('value is required');
      }

      await setSetting(key, value);
      return reply.send({ success: true, key, value });
    },
  );

  /**
   * GET /api/settings/connections
   * Test backend MCP connection status. (admin only)
   */
  app.get('/api/settings/connections', adminOnly, async (_request, reply) => {
    let mcpConnected = false;
    let lastError: string | null = null;

    try {
      await callTool('get_portfolio_stats', {});
      mcpConnected = true;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown error';
    }

    return reply.send({
      mcp: {
        connected: mcpConnected,
        lastError,
      },
    });
  });

  /**
   * POST /api/settings/mcp-reconnect
   * Force reconnect to MCP server. (admin only)
   */
  app.post('/api/settings/mcp-reconnect', adminOnly, async (_request, reply) => {
    resetSession();

    let connected = false;
    let error: string | null = null;

    try {
      await callTool('get_portfolio_stats', {});
      connected = true;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
    }

    return reply.send({ connected, error });
  });

  /**
   * GET /api/settings/cache/stats
   * Get Redis cache statistics and performance metrics.
   */
  app.get('/api/settings/cache/stats', async (_request, reply) => {
    const client = getRedisClient();
    const connected = isRedisAvailable() && client !== null;

    if (!connected || !client) {
      return reply.send({
        connected: false,
        server: null,
        memory: null,
        stats: null,
      });
    }

    try {
      const info = await client.info();
      const parse = (section: string, key: string): string => {
        const regex = new RegExp(`^${key}:(.+)$`, 'm');
        const match = section.match(regex) || info.match(regex);
        return match ? match[1].trim() : '';
      };

      // Key counts — total + per-prefix breakdown
      const allKeys = await client.keys('*');
      const totalKeys = allKeys.length;
      const prefixCounts: Record<string, number> = {};
      for (const key of allKeys) {
        // Extract prefix: "mcp:account:xxx" → "mcp:account", "support-mcp:foo" → "support-mcp:foo"
        const parts = key.split(':');
        const prefix = parts.length >= 2 ? `${parts[0]}:${parts[1]}` : parts[0];
        prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
      }
      // Sort by count descending
      const keysByPrefix = Object.entries(prefixCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([prefix, count]) => ({ prefix, count }));

      const mcpKeys = allKeys.filter((k) => k.startsWith('mcp:')).length;
      const supportMcpKeys = allKeys.filter((k) => k.startsWith('support-mcp:')).length;

      // Measure PING latency
      const pingStart = Date.now();
      await client.ping();
      const pingLatencyMs = Date.now() - pingStart;

      // Parse keyspace for average TTL
      const keyspaceInfo = parse(info, 'db0');
      let avgTtlMs = 0;
      if (keyspaceInfo) {
        const ttlMatch = keyspaceInfo.match(/avg_ttl=(\d+)/);
        if (ttlMatch) avgTtlMs = parseInt(ttlMatch[1]);
      }

      const hits = parseInt(parse(info, 'keyspace_hits')) || 0;
      const misses = parseInt(parse(info, 'keyspace_misses')) || 0;
      const hitsTotal = hits + misses;

      return reply.send({
        connected: true,
        server: {
          redisVersion: parse(info, 'redis_version'),
          uptimeSeconds: parseInt(parse(info, 'uptime_in_seconds')) || 0,
          connectedClients: parseInt(parse(info, 'connected_clients')) || 0,
          blockedClients: parseInt(parse(info, 'blocked_clients')) || 0,
          totalConnectionsReceived: parseInt(parse(info, 'total_connections_received')) || 0,
          rejectedConnections: parseInt(parse(info, 'rejected_connections')) || 0,
          pingLatencyMs,
        },
        memory: {
          usedMemory: parse(info, 'used_memory_human'),
          usedMemoryPeak: parse(info, 'used_memory_peak_human'),
          maxMemory: parse(info, 'maxmemory_human') || '0B',
          fragmentationRatio: parseFloat(parse(info, 'mem_fragmentation_ratio')) || 0,
        },
        cpu: {
          usedCpuSys: parseFloat(parse(info, 'used_cpu_sys')) || 0,
          usedCpuUser: parseFloat(parse(info, 'used_cpu_user')) || 0,
        },
        stats: {
          totalKeys,
          mcpKeys,
          supportMcpKeys,
          keysByPrefix,
          hits,
          misses,
          hitRate: hitsTotal > 0 ? Math.round((hits / hitsTotal) * 10000) / 100 : 0,
          evictedKeys: parseInt(parse(info, 'evicted_keys')) || 0,
          expiredKeys: parseInt(parse(info, 'expired_keys')) || 0,
          avgTtlMs,
          totalCommandsProcessed: parseInt(parse(info, 'total_commands_processed')) || 0,
          instantaneousOpsPerSec: parseInt(parse(info, 'instantaneous_ops_per_sec')) || 0,
          networkInputBytes: parseInt(parse(info, 'total_net_input_bytes')) || 0,
          networkOutputBytes: parseInt(parse(info, 'total_net_output_bytes')) || 0,
        },
      });
    } catch {
      return reply.send({
        connected: false,
        server: null,
        memory: null,
        stats: null,
      });
    }
  });

  /**
   * POST /api/settings/cache/flush
   * Flush the Redis cache.
   */
  app.post('/api/settings/cache/flush', async (_request, reply) => {
    const client = getRedisClient();

    if (!client || !isRedisAvailable()) {
      return reply.status(503).send({ success: false, error: 'Redis is not available' });
    }

    try {
      await client.flushdb();
      return reply.send({ success: true });
    } catch (err) {
      return reply.status(500).send({ success: false, error: (err as Error).message });
    }
  });

  /**
   * GET /api/settings/cache/warmup-status
   * Get the current Gong brief warmup status.
   */
  app.get('/api/settings/cache/warmup-status', async (_request, reply) => {
    return reply.send(getWarmupStatus());
  });

  /**
   * GET /api/settings/openai/status
   * Get OpenAI integration status: config, connectivity, and cached summary stats.
   */
  app.get('/api/settings/openai/status', async (_request, reply) => {
    const configured = !!env.OPENAI_API_KEY;
    const baseUrl = env.OPENAI_BASE_URL;

    let connected = false;
    let model: string | null = null;
    let latencyMs: number | null = null;
    let error: string | null = null;

    // Count cached OpenAI keys in Redis
    let cachedOverviews = 0;
    let cachedThreadSummaries = 0;

    const client = getRedisClient();
    if (client && isRedisAvailable()) {
      try {
        const keys = await client.keys('openai:*');
        cachedOverviews = keys.filter((k) => k.startsWith('openai:account-overview:')).length;
        cachedThreadSummaries = keys.filter((k) => k.startsWith('openai:thread-summary:')).length;
      } catch {
        // ignore
      }
    }

    // Test OpenAI connectivity with a minimal request
    if (configured) {
      try {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({
          apiKey: env.OPENAI_API_KEY,
          baseURL: env.OPENAI_BASE_URL,
        });

        const start = Date.now();
        const response = await openai.chat.completions.create({
          model: env.OPENAI_MODEL,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        });
        latencyMs = Date.now() - start;
        model = response.model;
        connected = true;
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
      }
    }

    return reply.send({
      configured,
      connected,
      baseUrl,
      model,
      latencyMs,
      error,
      cache: {
        accountOverviews: cachedOverviews,
        threadSummaries: cachedThreadSummaries,
      },
    });
  });
}
