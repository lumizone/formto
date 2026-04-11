import crypto from 'crypto';
import path from 'path';
import escapeHtml from 'escape-html';
import sql, { dbHelpers } from '../utils/db.js';
import { emailHelpers } from '../utils/mailer.js';
import { sendSlackNotification } from '../utils/slack.js';
import { evaluateHoneypotPayload, getRequestIp } from '../middleware/rateLimit.js';
import { validateHostedFields, validateSubmissionData, validateWebhookUrl } from '../utils/validation.js';
import { sendPinnedWebhookRequest } from '../utils/webhookHttp.js';
import validator from 'validator';
import { sendTelegramNotification } from '../utils/telegram.js';

const MAX_FILE_SIZE_BYTES = (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;

const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'application/x-zip-compressed'
]);

function sanitizeFilename(filename = 'file') {
  return path.basename(filename).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 200) || 'file';
}

function isBlockedByList(blocklist = [], data = {}, ip = '') {
  for (const entry of blocklist) {
    if (!entry?.type || !entry?.value) continue;
    const v = String(entry.value).toLowerCase();
    if (entry.type === 'ip' && ip === v) return true;
    if (entry.type === 'email') {
      const emailVal = Object.values(data).find(val => String(val).toLowerCase() === v);
      if (emailVal) return true;
    }
    if (entry.type === 'domain') {
      const domainMatch = Object.values(data).some(val => {
        const s = String(val).toLowerCase();
        return s.endsWith(`@${v}`) || s === v;
      });
      if (domainMatch) return true;
    }
  }
  return false;
}

async function deliverWebhook(form, submissionData, metadata) {
  const urls = [form.webhook_url, form.slack_webhook_url, form.discord_webhook_url].filter(Boolean);

  for (const url of urls) {
    try {
      const validation = await validateWebhookUrl(url);
      if (!validation.valid) continue;

      const payload = {
        event: 'form.submission',
        form: { id: form.id, name: form.name, endpoint: form.endpoint },
        submission: { data: submissionData, metadata, timestamp: new Date().toISOString() }
      };

      await sendPinnedWebhookRequest(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'FormTo-Webhook/1.0',
          'X-FormTo-Event': 'form.submission',
          'X-FormTo-Signature': crypto.createHmac('sha256', process.env.JWT_SECRET || 'secret').update(JSON.stringify(payload)).digest('hex')
        },
        body: JSON.stringify(payload),
        timeoutMs: 8000
      });

      // Log webhook delivery
      await sql`
        INSERT INTO webhook_logs (form_id, payload, status)
        VALUES (${form.id}, ${sql.json(payload)}, 'success')
      `;
    } catch (err) {
      console.error(`[Webhook] Delivery failed to ${url}:`, err.message);
      try {
        await sql`
          INSERT INTO webhook_logs (form_id, payload, status)
          VALUES (${form.id}, ${sql.json({ url, error: err.message })}, 'failed')
        `;
      } catch {}
    }
  }
}

// ─── Hosted form renderer ──────────────────────────────────────────────────────

function renderHostedForm(form) {
  const formName   = escapeHtml(form.name || 'Contact Form');
  const endpoint   = escapeHtml(form.endpoint);

  const fields = Array.isArray(form.fields) && form.fields.length > 0
    ? form.fields
    : [
        { name: 'name', label: 'Name', type: 'text', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'message', label: 'Message', type: 'textarea', required: false }
      ];

  const fieldsHtml = fields.map(f => {
    const label = `<label for="${escapeHtml(f.name)}" style="display:block;margin-bottom:4px;font-weight:500;font-size:14px;color:#374151;">${escapeHtml(f.label)}${f.required ? ' <span style="color:#ef4444">*</span>' : ''}</label>`;
    let input = '';
    const base = `id="${escapeHtml(f.name)}" name="${escapeHtml(f.name)}"${f.required ? ' required' : ''} style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;outline:none;box-sizing:border-box;"`;

    if (f.type === 'textarea') {
      input = `<textarea ${base} rows="4"></textarea>`;
    } else if (f.type === 'select') {
      const options = (f.options || []).map(o => `<option value="${escapeHtml(String(o.value))}">${escapeHtml(String(o.label))}</option>`).join('');
      input = `<select ${base}><option value="">Select...</option>${options}</select>`;
    } else if (f.type === 'checkbox') {
      input = `<input type="checkbox" id="${escapeHtml(f.name)}" name="${escapeHtml(f.name)}" value="${escapeHtml(String(f.value || 'on'))}"${f.required ? ' required' : ''} style="margin-right:6px;">`;
    } else {
      input = `<input type="${escapeHtml(f.type)}" ${base}>`;
    }
    return `<div style="margin-bottom:16px;">${label}${input}</div>`;
  }).join('');

  const redirectScript = form.redirect_url
    ? `window.location.href = ${JSON.stringify(form.redirect_url)};`
    : `document.getElementById('ft-form').innerHTML = '<p style="color:#16a34a;font-size:16px;text-align:center;">✓ Thank you! Your message has been sent.</p>';`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${formName}</title>
<style>body{font-family:system-ui,sans-serif;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box;}</style>
</head>
<body>
<div style="background:#fff;padding:32px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);width:100%;max-width:480px;">
  <h1 style="font-size:22px;font-weight:600;color:#111827;margin:0 0 24px;">${formName}</h1>
  <div id="ft-form">
    <form id="ft-inner">
      ${fieldsHtml}
      <input type="text" name="website" style="display:none" tabindex="-1" autocomplete="off">
      <button type="submit" style="width:100%;padding:10px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:15px;font-weight:500;cursor:pointer;">Submit</button>
    </form>
  </div>
</div>
<script>
document.getElementById('ft-inner').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = this.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Sending…';
  const data = Object.fromEntries(new FormData(this).entries());
  data._formto_js = '1';
  try {
    const r = await fetch('/f/${endpoint}', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (r.ok || r.status === 200) { ${redirectScript} }
    else { btn.disabled = false; btn.textContent = 'Submit'; alert('Something went wrong. Please try again.'); }
  } catch { btn.disabled = false; btn.textContent = 'Submit'; alert('Network error. Please try again.'); }
});
</script>
</body>
</html>`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export default async function publicRoutes(fastify) {
  // GET /f/:endpoint — render hosted form
  fastify.get('/f/:endpoint', async (request, reply) => {
    const { endpoint } = request.params;
    const form = await dbHelpers.getFormByEndpoint(endpoint);

    if (!form) return reply.status(404).send({ error: 'Form not found' });
    if (!form.active) {
      return reply.status(200).type('text/html').send(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px;"><h2>This form is no longer accepting submissions.</h2></body></html>`);
    }

    if (form.close_at && new Date(form.close_at) < new Date()) {
      return reply.status(200).type('text/html').send(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px;"><h2>This form is closed.</h2></body></html>`);
    }

    return reply.type('text/html').send(renderHostedForm(form));
  });

  // POST /f/:endpoint — receive submission
  fastify.post('/f/:endpoint', {
    preHandler: [fastify.rateLimitFormSubmission, fastify.spamDetection, fastify.honeypotDetection]
  }, async (request, reply) => {
    const { endpoint } = request.params;
    const ip = getRequestIp(request);

    try {
      const form = await dbHelpers.getFormByEndpoint(endpoint);

      if (!form) {
        return reply.status(404).send({ error: 'Form not found', message: 'No form found with this endpoint' });
      }

      if (!form.active) {
        return reply.status(422).send({ error: 'Form inactive', message: 'This form is not currently accepting submissions' });
      }

      if (form.close_at && new Date(form.close_at) < new Date()) {
        return reply.status(422).send({ error: 'Form closed', message: 'This form is no longer accepting submissions' });
      }

      // Parse body (JSON or form-encoded)
      let rawData = request.body || {};
      if (typeof rawData === 'string') {
        try { rawData = JSON.parse(rawData); } catch { rawData = {}; }
      }

      // Strip honeypot fields
      const { cleanData } = evaluateHoneypotPayload(rawData);
      const submissionData = cleanData || rawData;

      // Remove internal fields
      delete submissionData._formto_js;

      // Validate submission data
      const dataValidation = validateSubmissionData(submissionData);
      if (!dataValidation.valid) {
        return reply.status(400).send({ error: 'Invalid submission', message: dataValidation.error });
      }

      // Check blocklist
      if (Array.isArray(form.blocklist) && form.blocklist.length > 0) {
        if (isBlockedByList(form.blocklist, submissionData, ip)) {
          // Silent accept (don't tell bots they're blocked)
          return reply.status(200).send({ success: true });
        }
      }

      // Build metadata
      const metadata = {
        ip,
        userAgent: request.headers['user-agent'] || '',
        referer: request.headers.referer || request.headers.referrer || '',
        timestamp: new Date().toISOString()
      };

      // Save submission
      let submission;
      try {
        submission = await dbHelpers.saveSubmission(form.id, endpoint, submissionData, metadata);
      } catch (err) {
        if (err.message?.includes('FORM_SUBMISSION_LIMIT_REACHED')) {
          return reply.status(422).send({ error: 'Form closed', message: 'This form has reached its submission limit' });
        }
        throw err;
      }

      const formName = form.name || form.endpoint;

      // Email notification
      // Per-form notification_email overrides the account-level owner_notify_email
      const emailRecipient = form.notification_email || form.owner_notify_email;
      if (form.notify_email && emailRecipient) {
        emailHelpers.sendSubmissionNotification({
          ...form,
          notification_emails: [emailRecipient],
          _smtpConfig: form.owner_smtp_config
        }, submissionData).catch(err => {
          console.error('[Email] Notification failed:', err.message);
        });
      }

      // Telegram notification
      if (form.notify_telegram && form.owner_telegram_bot_token && form.owner_telegram_chat_id) {
        sendTelegramNotification(form.owner_telegram_bot_token, form.owner_telegram_chat_id, {
          formName,
          submissionData
        }).catch(err => {
          console.error('[Telegram] Notification failed:', err.message);
        });
      }

      // Slack notification
      if (form.notify_slack && form.owner_slack_webhook_url) {
        sendSlackNotification(form.owner_slack_webhook_url, {
          formName,
          submissionData
        }).catch(err => {
          console.error('[Slack] Notification failed:', err.message);
        });
      }

      // Deliver webhooks (fire and forget)
      if (form.webhook_url || form.slack_webhook_url || form.discord_webhook_url) {
        deliverWebhook(form, submissionData, metadata).catch(err => {
          console.error('[Webhook] Delivery error:', err.message);
        });
      }

      // Redirect or respond
      const acceptsHtml = request.headers.accept?.includes('text/html');
      if (form.redirect_url && acceptsHtml) {
        return reply.redirect(302, form.redirect_url);
      }

      return reply.status(200).send({ success: true });
    } catch (err) {
      console.error('Public submission error:', err);
      return reply.status(500).send({ error: 'Internal server error', message: 'Please try again later' });
    }
  });
}
