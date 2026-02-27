import crypto from 'node:crypto';
import { getRedisClient, setCache, getCache } from './cache.service.js';
import { downloadFromSend } from './send-download.service.js';
import { parseBugReport, type ParsedBugReport } from './bug-report.service.js';
import { logger } from '../utils/logger.js';

// ── Types ──────────────────────────────────────────────────────────────────────

interface LinkEntry {
  url: string;
  password: string;
}

interface JobData {
  status: 'processing' | 'completed' | 'failed';
  results?: ParsedBugReport[];
  error?: string;
  linksTotal: number;
  linksProcessed: number;
}

const JOB_TTL = 24 * 60 * 60; // 24 hours
const CHAT_HISTORY_TTL = 7 * 24 * 60 * 60; // 7 days

function jobKey(jobId: string): string {
  return `bugreport:job:${jobId}`;
}

function chatHistoryKey(userId: string): string {
  return `chat:history:${userId}`;
}

function chatUnreadKey(userId: string): string {
  return `chat:unread:${userId}`;
}

// ── Job management ─────────────────────────────────────────────────────────────

/**
 * Create a new bug report processing job. Downloads, decrypts, and parses
 * bug reports from send-solo.io in the background.
 */
export async function createJob(
  userId: string,
  links: LinkEntry[],
): Promise<string> {
  const jobId = crypto.randomUUID();

  const initialData: JobData = {
    status: 'processing',
    linksTotal: links.length,
    linksProcessed: 0,
  };

  await setCache(jobKey(jobId), initialData, JOB_TTL);

  // Spawn background processing (fire and forget)
  processJob(jobId, userId, links).catch((err) => {
    logger.error({ err, jobId }, 'Bug report job failed unexpectedly');
  });

  return jobId;
}

/**
 * Get the current status + results for a job.
 */
export async function getJobStatus(jobId: string): Promise<JobData | null> {
  return getCache<JobData>(jobKey(jobId));
}

// ── Background processing ──────────────────────────────────────────────────────

async function processJob(
  jobId: string,
  userId: string,
  links: LinkEntry[],
): Promise<void> {
  // Process all links concurrently
  const settled = await Promise.allSettled(
    links.map(async (link, i) => {
      logger.info({ jobId, linkIndex: i, url: link.url }, 'Downloading from send-solo.io');

      const { data, metadata } = await downloadFromSend(link.url, link.password);

      logger.info({ jobId, linkIndex: i, size: data.length }, 'Download complete, parsing');

      // Send-solo.io bundles multiple files by concatenating them.
      // Split using the manifest sizes, then parse each file individually.
      const files: Buffer[] = [];
      if (metadata.manifest?.files && metadata.manifest.files.length > 1) {
        let offset = 0;
        for (const entry of metadata.manifest.files) {
          const end = offset + entry.size;
          if (end <= data.length) {
            files.push(data.subarray(offset, end));
          }
          offset = end;
        }
        logger.info({ jobId, linkIndex: i, fileCount: files.length }, 'Split send-archive into individual files');
      } else {
        files.push(data);
      }

      const results: ParsedBugReport[] = [];
      for (const file of files) {
        try {
          const parsed = await parseBugReport(file);
          results.push(...parsed);
        } catch (parseErr) {
          const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          logger.warn({ jobId, linkIndex: i, error: parseMsg }, 'Failed to parse one file in archive, continuing');
        }
      }

      logger.info({ jobId, linkIndex: i, clusters: results.length }, 'Parsed bug report successfully');
      return results;
    }),
  );

  // Merge results and errors from all settled promises
  const allResults: ParsedBugReport[] = [];
  const errors: string[] = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    } else {
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`Link ${i + 1}: ${msg}`);
      logger.error({ err: result.reason, jobId, linkIndex: i }, 'Failed to process link');
    }
  }

  // Final status
  const finalData: JobData =
    allResults.length > 0
      ? {
          status: 'completed',
          results: allResults,
          error: errors.length > 0 ? errors.join('; ') : undefined,
          linksTotal: links.length,
          linksProcessed: links.length,
        }
      : {
          status: 'failed',
          error: errors.join('; ') || 'No data could be parsed',
          linksTotal: links.length,
          linksProcessed: links.length,
        };

  await setCache(jobKey(jobId), finalData, JOB_TTL);

  // Send chat notification
  await notifyUser(userId, jobId, finalData);
}

// ── Chat notification ──────────────────────────────────────────────────────────

async function notifyUser(userId: string, jobId: string, data: JobData): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    let message: string;

    if (data.status === 'completed' && data.results) {
      const clusterCount = data.results.length;
      const clusterNames = data.results.map((r) => r.clusterName || 'unknown').join(', ');
      message =
        `Bug reports processed! Found **${clusterCount}** cluster${clusterCount !== 1 ? 's' : ''}: ${clusterNames}. ` +
        `[View in Calculator](/tools/ambient-calculator?jobId=${jobId})`;
    } else {
      message = `Bug report processing failed: ${data.error ?? 'Unknown error'}`;
    }

    // Append notification to chat history
    const historyRaw = await redis.get(chatHistoryKey(userId));
    const history: Array<{ role: string; content: string }> = historyRaw
      ? JSON.parse(historyRaw)
      : [];

    history.push({ role: 'assistant', content: message });

    await redis.set(
      chatHistoryKey(userId),
      JSON.stringify(history),
      'EX',
      CHAT_HISTORY_TTL,
    );

    // Set unread flag
    await redis.set(chatUnreadKey(userId), '1', 'EX', CHAT_HISTORY_TTL);

    logger.info({ userId, jobId }, 'Chat notification sent for bug report job');
  } catch (err) {
    logger.error({ err, userId, jobId }, 'Failed to send chat notification');
  }
}
