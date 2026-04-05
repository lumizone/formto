import nodemailer from 'nodemailer';
import escapeHtml from 'escape-html';
import dotenv from 'dotenv';
import {
  getSafeNotificationRecipients,
  getSafeReplyToEmail,
  getSafeSenderEmail
} from './emailSecurity.js';

dotenv.config();

function createTransport(cfg = {}) {
  const host   = cfg.host   || process.env.SMTP_HOST   || 'localhost';
  const port   = Number(cfg.port   || process.env.SMTP_PORT  || 587);
  const secure = cfg.secure !== undefined ? cfg.secure : process.env.SMTP_SECURE === 'true';
  const user   = cfg.user   || process.env.SMTP_USER;
  const pass   = cfg.pass   || process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host, port, secure,
    auth: user ? { user, pass } : undefined
  });
}

// Lazy singleton for env-based transport
let _transport = null;
function getTransport() {
  if (!_transport) _transport = createTransport();
  return _transport;
}

// Per-request transport using user's smtp_config (or env fallback)
export function getTransportForUser(smtpConfig) {
  if (!smtpConfig?.host) return getTransport();
  return createTransport(smtpConfig);
}

export function getFromForUser(smtpConfig) {
  return smtpConfig?.from || process.env.FROM_EMAIL || 'FormTo <noreply@localhost>';
}

// ─── Template helpers ─────────────────────────────────────────────────────────

function replaceVariables(template, data) {
  let result = template;
  Object.keys(data).forEach(key => {
    const value = escapeHtml(String(data[key] ?? ''));
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  });
  return result.replace(/\{\{[^}]+\}\}/g, '');
}

function sanitizeTemplate(html) {
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  html = html.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  html = html.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');
  html = html.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  html = html.replace(/src\s*=\s*["']javascript:[^"']*["']/gi, 'src=""');
  html = html.replace(/href\s*=\s*["']data:[^"']*["']/gi, 'href="#"');
  html = html.replace(/src\s*=\s*["']data:(?!image\/)[^"']*["']/gi, 'src=""');
  html = html.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  html = html.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  html = html.replace(/<base\b[^<]*>/gi, '');
  return html;
}

function generateDefaultEmailTemplate(formName, submissionData) {
  const sanitizedFormName = escapeHtml(formName);
  const fields = Object.entries(submissionData)
    .map(([key, value]) => `<p><strong>${escapeHtml(String(key))}:</strong> ${escapeHtml(String(value))}</p>`)
    .join('');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563EB;">New Form Submission</h2>
      <p><strong>Form:</strong> ${sanitizedFormName}</p>
      <p><strong>Date:</strong> ${new Date().toLocaleString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })}</p>
      <hr style="border: 1px solid #e5e7eb; margin: 20px 0;" />
      <h3>Submission Details:</h3>
      ${fields}
      <hr style="border: 1px solid #e5e7eb; margin: 20px 0;" />
      <p style="color: #6b7280; font-size: 12px;">Powered by FormTo</p>
    </div>
  `;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const emailHelpers = {
  // Send a submission notification email.
  // formConfig must contain:
  //   - notification_emails: string[]   — recipient(s), e.g. [owner_notify_email]
  //   - _smtpConfig: object|null        — user's SMTP config from users.smtp_config
  async sendSubmissionNotification(formConfig, submissionData) {
    const recipients = Array.isArray(formConfig.notification_emails)
      ? formConfig.notification_emails.filter(Boolean)
      : [];
    if (recipients.length === 0) {
      throw new Error('No recipient email configured');
    }

    const smtpCfg  = formConfig._smtpConfig || null;
    const transport = getTransportForUser(smtpCfg);
    const from      = getFromForUser(smtpCfg);
    const formName  = formConfig.name || formConfig.endpoint || 'Form';

    let subject, htmlBody;

    if (formConfig.email_template_enabled && formConfig.email_template_body) {
      const templateSize = Buffer.byteLength(formConfig.email_template_body, 'utf8');
      if (templateSize > 51200) throw new Error('Template size exceeds 50KB limit');

      let validatedLogoUrl = '';
      if (formConfig.logo_url) {
        try {
          const u = new URL(formConfig.logo_url);
          if (u.protocol === 'http:' || u.protocol === 'https:') validatedLogoUrl = formConfig.logo_url;
        } catch {}
      }

      const vars = {
        form_name: formName,
        date:     new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        time:     new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        datetime: new Date().toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        logo: validatedLogoUrl,
        ...submissionData
      };

      subject = replaceVariables(formConfig.email_template_subject || 'New submission from {{form_name}}', vars);
      let tmpl = sanitizeTemplate(formConfig.email_template_body);
      tmpl = validatedLogoUrl
        ? tmpl.replace(/\{\{#if logo\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1')
        : tmpl.replace(/\{\{#if logo\}\}[\s\S]*?\{\{\/if\}\}/g, '');
      htmlBody = replaceVariables(tmpl, vars);
    } else {
      subject  = `New submission — ${formName}`;
      htmlBody = generateDefaultEmailTemplate(formName, submissionData);
    }

    const info = await transport.sendMail({ from, to: recipients, subject, html: htmlBody });
    return { success: true, messageId: info.messageId };
  },

  // Generic send (used for autoresponder, test emails etc.)
  async sendEmail({ smtpConfig, from, to, subject, html, replyTo }) {
    const transport = getTransportForUser(smtpConfig || null);
    const sender    = from || getFromForUser(smtpConfig || null);
    const info = await transport.sendMail({
      from:    sender,
      to:      Array.isArray(to) ? to : [to],
      subject: subject || 'Notification from FormTo',
      html,
      ...(replyTo ? { replyTo } : {})
    });
    return { success: true, messageId: info.messageId };
  }
};

export { replaceVariables, sanitizeTemplate, generateDefaultEmailTemplate };
