import sql from '../utils/db.js';
import { validateWebhookUrl } from '../utils/validation.js';
import { sendPinnedWebhookRequest } from '../utils/webhookHttp.js';

const INTERNAL_ERROR_MESSAGE = 'Please try again later.';

function summarizeWebhookTarget(url) {
  try {
    const { protocol, host } = new URL(url);
    return `${protocol}//${host}`;
  } catch {
    return 'invalid-url';
  }
}

export default async function webhookRoutes(fastify) {
  // POST /api/webhooks/test
  fastify.post('/test', {
    preHandler: [fastify.auth, fastify.rateLimitWebhookTest]
  }, async (request, reply) => {
    try {
      const { url, payload } = request.body || {};

      if (!url) return reply.status(400).send({ error: 'Missing webhook URL' });

      const urlVal = await validateWebhookUrl(url, { requireHttps: true });
      if (!urlVal.valid) {
        console.warn(`[Webhook] SSRF blocked: ${summarizeWebhookTarget(url)} - ${urlVal.error}`);
        return reply.status(400).send({ error: 'Invalid webhook URL', message: urlVal.error });
      }

      const testPayload = payload || {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        message: 'This is a test webhook from FormTo'
      };

      const startedAt = Date.now();
      const response = await sendPinnedWebhookRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'FormTo-Webhook/1.0', 'X-FormTo-Event': 'webhook.test' },
        body: JSON.stringify(testPayload),
        timeoutMs: 10000
      });

      return {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        durationMs: Date.now() - startedAt
      };
    } catch (err) {
      console.error('Webhook test error:', err);
      return reply.status(500).send({ error: 'Failed to test webhook', message: INTERNAL_ERROR_MESSAGE });
    }
  });

  // GET /api/webhooks/logs/:formId
  fastify.get('/logs/:formId', { preHandler: fastify.auth }, async (request, reply) => {
    try {
      const { formId } = request.params;
      const page  = Math.max(1, parseInt(request.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit) || 50));
      const offset = (page - 1) * limit;

      const [form] = await sql`SELECT id FROM forms WHERE id = ${formId} AND user_id = ${request.user.userId}`;
      if (!form) return reply.status(404).send({ error: 'Form not found' });

      const logs = await sql`
        SELECT * FROM webhook_logs
        WHERE form_id = ${formId}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const [{ total }] = await sql`SELECT COUNT(*) AS total FROM webhook_logs WHERE form_id = ${formId}`;

      return { logs, pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) } };
    } catch (err) {
      console.error('Error fetching webhook logs:', err);
      return reply.status(500).send({ error: 'Failed to fetch webhook logs', message: INTERNAL_ERROR_MESSAGE });
    }
  });

  // POST /api/webhooks/retry/:logId
  fastify.post('/retry/:logId', {
    preHandler: [fastify.auth, fastify.rateLimitWebhookRetry]
  }, async (request, reply) => {
    try {
      const { logId } = request.params;

      const [log] = await sql`
        SELECT wl.*, f.user_id AS form_user_id, f.webhook_url
        FROM webhook_logs wl
        JOIN forms f ON f.id = wl.form_id
        WHERE wl.id = ${logId}
        LIMIT 1
      `;

      if (!log) return reply.status(404).send({ error: 'Webhook log not found' });
      if (log.form_user_id !== request.user.userId) return reply.status(403).send({ error: 'Forbidden' });

      if (!log.webhook_url) {
        return reply.status(400).send({ error: 'Form has no webhook URL configured' });
      }

      const urlVal = await validateWebhookUrl(log.webhook_url);
      if (!urlVal.valid) {
        return reply.status(400).send({ error: 'Webhook URL failed security validation' });
      }

      const response = await sendPinnedWebhookRequest(log.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'FormTo-Webhook/1.0', 'X-FormTo-Retry': 'true' },
        body: JSON.stringify(log.payload),
        timeoutMs: 10000
      });

      await sql`
        UPDATE webhook_logs
        SET retry_count  = ${(log.retry_count || 0) + 1},
            last_retry_at = NOW(),
            status        = ${response.ok ? 'success' : 'failed'}
        WHERE id = ${logId}
      `;

      return { success: response.ok, status: response.status };
    } catch (err) {
      console.error('Webhook retry error:', err);
      return reply.status(500).send({ error: 'Failed to retry webhook', message: INTERNAL_ERROR_MESSAGE });
    }
  });
}
