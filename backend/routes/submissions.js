import sql from '../utils/db.js';
import { emailHelpers } from '../utils/mailer.js';
import { getSafeReplyToEmail } from '../utils/emailSecurity.js';
import escapeHtml from 'escape-html';
import validator from 'validator';

const INTERNAL_ERROR_MESSAGE = 'Please try again later.';

function renderSafeReplyHtml(message) {
  const escaped = escapeHtml(String(message || ''))
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '<br>');
  return `
    <div style="font-family:sans-serif;max-width:600px;line-height:1.6">
      <p style="font-size:12px;color:#6b7280;margin:0 0 16px;">This message was sent in response to your form submission.</p>
      <div>${escaped}</div>
    </div>
  `;
}

// Helper: ensure submission belongs to the user (via form ownership)
async function getOwnedSubmission(submissionId, userId) {
  const [row] = await sql`
    SELECT s.*, f.user_id AS form_user_id,
           f.name AS form_name, f.notification_email, f.notification_emails
    FROM submissions s
    JOIN forms f ON f.id = s.form_id
    WHERE s.id = ${submissionId} AND f.user_id = ${userId}
    LIMIT 1
  `;
  return row || null;
}

export default async function submissionRoutes(fastify) {
  // GET /api/submissions/stats — global stats
  fastify.get('/stats', { preHandler: fastify.auth }, async (request, reply) => {
    try {
      const userId = request.user.userId;

      const [stats] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE s.archived = false)::int                                                                AS "totalSubmissions",
          COUNT(*) FILTER (WHERE s.archived = false AND s.read_at IS NULL)::int                                         AS "unreadCount",
          COUNT(*) FILTER (WHERE s.archived = true)::int                                                                AS "archivedCount",
          COUNT(*) FILTER (WHERE s.archived = false AND s.created_at >= NOW() - INTERVAL '1 day')::int                  AS "submissionsToday",
          COUNT(*) FILTER (WHERE s.archived = false AND s.created_at >= date_trunc('month', NOW()))::int                AS "submissionsThisMonth",
          (SELECT COUNT(*)::int FROM forms WHERE user_id = ${userId})                                                   AS "totalForms"
        FROM submissions s
        JOIN forms f ON f.id = s.form_id
        WHERE f.user_id = ${userId}
      `;

      // Last 10 submissions for activity feed
      const recentActivity = await sql`
        SELECT s.id, s.form_id, s.data, s.created_at, f.name AS form_name
        FROM submissions s
        JOIN forms f ON f.id = s.form_id
        WHERE f.user_id = ${userId} AND s.archived = false
        ORDER BY s.created_at DESC
        LIMIT 10
      `;

      return { stats: { ...stats, recentActivity } };
    } catch (err) {
      console.error('Error fetching stats:', err);
      return reply.status(500).send({ error: 'Failed to fetch stats', message: INTERNAL_ERROR_MESSAGE });
    }
  });

  // GET /api/submissions/analytics — chart data
  fastify.get('/analytics', { preHandler: fastify.auth }, async (request, reply) => {
    try {
      const userId = request.user.userId;
      const range = request.query.range || '7days';

      const rangeMap = { today: '1 day', '7days': '7 days', '30days': '30 days', '90days': '90 days', all: '100 years' };
      const interval = Object.hasOwn(rangeMap, range) ? rangeMap[range] : '7 days';

      const submissions = await sql.unsafe(
        `SELECT s.id, s.form_id, s.form_endpoint, s.created_at, f.name AS form_name
         FROM submissions s
         JOIN forms f ON f.id = s.form_id
         WHERE f.user_id = $1
           AND s.created_at >= NOW() - INTERVAL '${interval}'
           AND s.archived = false
         ORDER BY s.created_at DESC`,
        [userId]
      );

      const forms = await sql`
        SELECT id, name, endpoint, active, submission_count, created_at
        FROM forms WHERE user_id = ${userId} ORDER BY created_at DESC
      `;

      return { analyticsData: { submissions, forms } };
    } catch (err) {
      console.error('Error fetching analytics:', err);
      return reply.status(500).send({ error: 'Failed to fetch analytics', message: INTERNAL_ERROR_MESSAGE });
    }
  });

  // GET /api/submissions/all — inbox
  fastify.get('/all', { preHandler: fastify.auth }, async (request, reply) => {
    try {
      const userId = request.user.userId;
      const page   = Math.max(1, parseInt(request.query.page) || 1);
      const limit  = Math.min(100, Math.max(1, parseInt(request.query.limit) || 50));
      const offset = (page - 1) * limit;
      const { formId, status } = request.query;

      // Build filter params for the main query ($1=userId, $2=limit, $3=offset, then extras)
      const params = [userId, limit, offset];
      let whereExtra = '';
      if (formId) {
        params.push(formId);
        whereExtra += ` AND s.form_id = $${params.length}`;
      }
      if (status) {
        params.push(status);
        whereExtra += ` AND s.status = $${params.length}`;
      }

      // Build separate params for the count query ($1=userId, then extras)
      // whereExtra references params.length positions from the main query (4, 5, ...),
      // so we need a separate counter that starts at 2 (after $1=userId)
      const countParams = [userId];
      let countWhereExtra = '';
      if (formId) {
        countParams.push(formId);
        countWhereExtra += ` AND s.form_id = $${countParams.length}`;
      }
      if (status) {
        countParams.push(status);
        countWhereExtra += ` AND s.status = $${countParams.length}`;
      }

      const submissions = await sql.unsafe(
        `SELECT s.*, f.name AS form_name
         FROM submissions s
         JOIN forms f ON f.id = s.form_id
         WHERE f.user_id = $1 AND s.archived = false ${whereExtra}
         ORDER BY s.created_at DESC
         LIMIT $2 OFFSET $3`,
        params
      );

      const [{ total }] = await sql.unsafe(
        `SELECT COUNT(*) AS total
         FROM submissions s JOIN forms f ON f.id = s.form_id
         WHERE f.user_id = $1 AND s.archived = false ${countWhereExtra}`,
        countParams
      );

      const forms = await sql`
        SELECT id, name FROM forms WHERE user_id = ${userId} ORDER BY name
      `;

      return {
        submissionsData: {
          submissions,
          forms,
          pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) }
        }
      };
    } catch (err) {
      console.error('Error fetching all submissions:', err);
      return reply.status(500).send({ error: 'Failed to fetch submissions', message: INTERNAL_ERROR_MESSAGE });
    }
  });

  // GET /api/submissions/form/:formId
  fastify.get('/form/:formId', { preHandler: fastify.auth }, async (request, reply) => {
    try {
      const { formId } = request.params;
      const page     = Math.max(1, parseInt(request.query.page) || 1);
      const limit    = Math.min(100, Math.max(1, parseInt(request.query.limit) || 50));
      const offset   = (page - 1) * limit;
      const archived = request.query.archived === 'true';

      const [form] = await sql`SELECT id FROM forms WHERE id = ${formId} AND user_id = ${request.user.userId}`;
      if (!form) return reply.status(404).send({ error: 'Form not found' });

      const submissions = await sql`
        SELECT * FROM submissions
        WHERE form_id = ${formId} AND archived = ${archived}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const [{ total }] = await sql`
        SELECT COUNT(*) AS total FROM submissions WHERE form_id = ${formId} AND archived = ${archived}
      `;

      return { submissions, pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) } };
    } catch (err) {
      console.error('Error fetching form submissions:', err);
      return reply.status(500).send({ error: 'Failed to fetch submissions', message: INTERNAL_ERROR_MESSAGE });
    }
  });

  // GET /api/submissions/form/:formId/stats
  fastify.get('/form/:formId/stats', { preHandler: fastify.auth }, async (request, reply) => {
    try {
      const { formId } = request.params;
      const [form] = await sql`SELECT id FROM forms WHERE id = ${formId} AND user_id = ${request.user.userId}`;
      if (!form) return reply.status(404).send({ error: 'Form not found' });

      const [stats] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE archived = false)::int                                                    AS total,
          COUNT(*) FILTER (WHERE archived = false AND read_at IS NULL)::int                                AS unread,
          COUNT(*) FILTER (WHERE archived = true)::int                                                     AS archived,
          COUNT(*) FILTER (WHERE archived = false AND created_at >= NOW() - INTERVAL '7 days')::int        AS this_week,
          COUNT(*) FILTER (WHERE archived = false AND created_at >= date_trunc('day', NOW()))::int          AS today
        FROM submissions WHERE form_id = ${formId}
      `;
      return { stats };
    } catch (err) {
      console.error('Error fetching form stats:', err);
      return reply.status(500).send({ error: 'Failed to fetch stats', message: INTERNAL_ERROR_MESSAGE });
    }
  });

  // GET /api/submissions/form/:formId/export — CSV
  fastify.get('/form/:formId/export', {
    preHandler: [fastify.auth, fastify.rateLimitExport]
  }, async (request, reply) => {
    try {
      const { formId } = request.params;
      const [form] = await sql`SELECT id, name FROM forms WHERE id = ${formId} AND user_id = ${request.user.userId}`;
      if (!form) return reply.status(404).send({ error: 'Form not found' });

      const submissions = await sql`
        SELECT * FROM submissions WHERE form_id = ${formId} AND archived = false ORDER BY created_at DESC
      `;

      if (submissions.length === 0) {
        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', `attachment; filename="submissions.csv"`);
        return reply.send('id,created_at\n');
      }

      const allKeys = ['id', 'created_at', 'status', ...new Set(submissions.flatMap(s => Object.keys(s.data || {})))];

      const csvLines = [
        allKeys.map(k => `"${k}"`).join(','),
        ...submissions.map(s => allKeys.map(k => {
          let val = '';
          if (k === 'id') val = s.id;
          else if (k === 'created_at') val = s.created_at;
          else if (k === 'status') val = s.status;
          else val = s.data?.[k] ?? '';
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(','))
      ];

      const safeName = (form.name || 'submissions')
        .replace(/[\r\n"\\]/g, '')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 50) || 'submissions';
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="${safeName}-submissions.csv"`);
      return reply.send(csvLines.join('\n'));
    } catch (err) {
      console.error('Error exporting CSV:', err);
      return reply.status(500).send({ error: 'Failed to export', message: INTERNAL_ERROR_MESSAGE });
    }
  });

  // DELETE /api/submissions/:id — archive (soft delete)
  fastify.delete('/:submissionId', {
    preHandler: [fastify.auth, fastify.rateLimitSensitive]
  }, async (request, reply) => {
    try {
      const sub = await getOwnedSubmission(request.params.submissionId, request.user.userId);
      if (!sub) return reply.status(404).send({ error: 'Submission not found' });

      await sql`UPDATE submissions SET archived = true WHERE id = ${sub.id}`;
      return { success: true };
    } catch (err) {
      console.error('Error archiving submission:', err);
      return reply.status(500).send({ error: 'Failed to archive submission', message: INTERNAL_ERROR_MESSAGE });
    }
  });

  // PATCH /api/submissions/:id/restore
  fastify.patch('/:submissionId/restore', { preHandler: fastify.auth }, async (request, reply) => {
    try {
      const sub = await getOwnedSubmission(request.params.submissionId, request.user.userId);
      if (!sub) return reply.status(404).send({ error: 'Submission not found' });

      await sql`UPDATE submissions SET archived = false WHERE id = ${sub.id}`;
      return { success: true };
    } catch (err) {
      console.error('Error restoring submission:', err);
      return reply.status(500).send({ error: 'Failed to restore submission', message: INTERNAL_ERROR_MESSAGE });
    }
  });

  // DELETE /api/submissions/:id/permanent
  fastify.delete('/:submissionId/permanent', {
    preHandler: [fastify.auth, fastify.rateLimitSensitive]
  }, async (request, reply) => {
    try {
      const sub = await getOwnedSubmission(request.params.submissionId, request.user.userId);
      if (!sub) return reply.status(404).send({ error: 'Submission not found' });

      await sql`DELETE FROM submissions WHERE id = ${sub.id}`;
      return { success: true };
    } catch (err) {
      console.error('Error deleting submission:', err);
      return reply.status(500).send({ error: 'Failed to delete submission', message: INTERNAL_ERROR_MESSAGE });
    }
  });

  // PATCH /api/submissions/:id/status
  fastify.patch('/:submissionId/status', { preHandler: fastify.auth }, async (request, reply) => {
    const { status } = request.body || {};
    if (!['new', 'in_progress', 'resolved'].includes(status)) {
      return reply.status(400).send({ error: 'Invalid status. Must be: new, in_progress, resolved' });
    }
    try {
      const sub = await getOwnedSubmission(request.params.submissionId, request.user.userId);
      if (!sub) return reply.status(404).send({ error: 'Submission not found' });

      await sql`UPDATE submissions SET status = ${status} WHERE id = ${sub.id}`;
      return { success: true, status };
    } catch (err) {
      console.error('Error updating status:', err);
      return reply.status(500).send({ error: 'Failed to update status', message: INTERNAL_ERROR_MESSAGE });
    }
  });

  // PATCH /api/submissions/:id/notes
  fastify.patch('/:submissionId/notes', { preHandler: fastify.auth }, async (request, reply) => {
    try {
      const sub = await getOwnedSubmission(request.params.submissionId, request.user.userId);
      if (!sub) return reply.status(404).send({ error: 'Submission not found' });

      await sql`UPDATE submissions SET notes = ${request.body?.notes || null} WHERE id = ${sub.id}`;
      return { success: true };
    } catch (err) {
      console.error('Error updating notes:', err);
      return reply.status(500).send({ error: 'Failed to update notes', message: INTERNAL_ERROR_MESSAGE });
    }
  });

  // PATCH /api/submissions/:id/read
  fastify.patch('/:submissionId/read', { preHandler: fastify.auth }, async (request, reply) => {
    try {
      const sub = await getOwnedSubmission(request.params.submissionId, request.user.userId);
      if (!sub) return reply.status(404).send({ error: 'Submission not found' });

      await sql`UPDATE submissions SET read_at = NOW() WHERE id = ${sub.id} AND read_at IS NULL`;
      return { success: true };
    } catch (err) {
      console.error('Error marking read:', err);
      return reply.status(500).send({ error: 'Failed to mark as read', message: INTERNAL_ERROR_MESSAGE });
    }
  });

  // POST /api/submissions/read-all
  fastify.post('/read-all', { preHandler: fastify.auth }, async (request, reply) => {
    try {
      const userId  = request.user.userId;
      const formId  = request.body?.formId;

      let query;
      if (formId) {
        const [form] = await sql`SELECT id FROM forms WHERE id = ${formId} AND user_id = ${userId}`;
        if (!form) return reply.status(404).send({ error: 'Form not found' });
        query = sql`
          UPDATE submissions SET read_at = NOW()
          WHERE form_id = ${formId} AND archived = false AND read_at IS NULL
        `;
      } else {
        query = sql`
          UPDATE submissions s SET read_at = NOW()
          FROM forms f
          WHERE s.form_id = f.id AND f.user_id = ${userId}
            AND s.archived = false AND s.read_at IS NULL
        `;
      }
      await query;
      return { success: true };
    } catch (err) {
      console.error('Error marking all read:', err);
      return reply.status(500).send({ error: 'Failed to mark as read', message: INTERNAL_ERROR_MESSAGE });
    }
  });

  // POST /api/submissions/:id/reply — send email to submitter
  fastify.post('/:submissionId/reply', {
    preHandler: [fastify.auth, fastify.rateLimitReplyEmail]
  }, async (request, reply) => {
    try {
      const { subject, message } = request.body || {};

      if (!subject || !message) {
        return reply.status(400).send({ error: 'subject and message are required' });
      }
      if (String(subject).length > 200) return reply.status(400).send({ error: 'Subject too long (max 200 chars)' });
      if (String(message).length > 10000) return reply.status(400).send({ error: 'Message too long (max 10000 chars)' });

      const sub = await getOwnedSubmission(request.params.submissionId, request.user.userId);
      if (!sub) return reply.status(404).send({ error: 'Submission not found' });

      // Find email in submission data
      const rawSubmitterEmail = Object.entries(sub.data || {})
        .find(([k, v]) => k.toLowerCase().includes('email') && String(v).includes('@'))?.[1];

      if (!rawSubmitterEmail) {
        return reply.status(400).send({ error: 'No email address found in submission data' });
      }

      // Validate the email to prevent header injection
      const submitterEmail = String(rawSubmitterEmail).trim().replace(/[\r\n]/g, '');
      if (!validator.isEmail(submitterEmail)) {
        return reply.status(400).send({ error: 'Invalid email address found in submission data' });
      }

      const replyTo = getSafeReplyToEmail(sub.notification_email) || undefined;

      // Use the form owner's SMTP config so reply uses their configured email provider
      const [owner] = await sql`SELECT smtp_config, notify_email FROM users WHERE id = ${request.user.userId}`;
      const smtpConfig = owner?.smtp_config || null;

      const safeSubject = String(subject).replace(/[\r\n]/g, ' ').slice(0, 200);

      await emailHelpers.sendEmail({
        to: submitterEmail,
        subject: safeSubject,
        html: renderSafeReplyHtml(message),
        smtpConfig,
        ...(replyTo ? { replyTo } : {})
      });

      return { success: true };
    } catch (err) {
      console.error('Error sending reply:', err);
      return reply.status(500).send({ error: 'Failed to send reply', message: INTERNAL_ERROR_MESSAGE });
    }
  });
}
