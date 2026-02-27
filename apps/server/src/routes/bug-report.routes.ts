import { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { createJob, getJobStatus } from '../services/bug-report-job.service.js';

export async function bugReportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  /**
   * POST /api/bug-report/jobs
   * Create a background job to download, decrypt, and parse bug reports
   * from send-solo.io links.
   */
  app.post<{
    Body: {
      links: Array<{ url: string; password: string }>;
    };
  }>('/api/bug-report/jobs', async (request, reply) => {
    const { links } = request.body;

    if (!links || !Array.isArray(links) || links.length === 0) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'BadRequest',
        message: 'links array is required (each entry needs url and password)',
      });
    }

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      if (!link.url || typeof link.url !== 'string') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'BadRequest',
          message: `links[${i}].url is required`,
        });
      }
      if (typeof link.password !== 'string') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'BadRequest',
          message: `links[${i}].password must be a string`,
        });
      }
    }

    const jobId = await createJob(request.user.id, links);
    return reply.send({ jobId });
  });

  /**
   * GET /api/bug-report/jobs/:jobId
   * Get the status and results of a bug report processing job.
   */
  app.get<{
    Params: { jobId: string };
  }>('/api/bug-report/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params;

    const job = await getJobStatus(jobId);
    if (!job) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'NotFound',
        message: 'Job not found or expired',
      });
    }

    return reply.send(job);
  });
}
