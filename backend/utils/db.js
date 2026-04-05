import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL ||
  `postgresql://${process.env.DB_USER || 'formto'}:${encodeURIComponent(process.env.POSTGRES_PASSWORD || '')}@${process.env.DB_HOST || 'postgres'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'formto'}`;

const sql = postgres(DATABASE_URL, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
  onnotice: () => {}
});

export default sql;

// ─── Form helpers ─────────────────────────────────────────────────────────────

export const dbHelpers = {
  // Get form config by endpoint (used by public submission handler)
  async getFormByEndpoint(endpoint) {
    const [form] = await sql`
      SELECT f.*,
             u.id               AS owner_uuid,
             u.notify_email     AS owner_notify_email,
             u.telegram_bot_token AS owner_telegram_bot_token,
             u.telegram_chat_id   AS owner_telegram_chat_id,
             u.smtp_config        AS owner_smtp_config,
             u.slack_webhook_url  AS owner_slack_webhook_url
      FROM forms f
      JOIN users u ON u.id = f.user_id
      WHERE f.endpoint = ${endpoint}
      LIMIT 1
    `;
    return form || null;
  },

  // Save a submission (without files)
  async saveSubmission(formId, formEndpoint, data, metadata) {
    const [submission] = await sql`
      INSERT INTO submissions (form_id, form_endpoint, data, metadata)
      VALUES (${formId}, ${formEndpoint}, ${sql.json(data)}, ${sql.json(metadata)})
      RETURNING *
    `;
    await sql`SELECT increment_submission_count(${formId})`;
    return submission;
  },

  // Save a submission with file URLs
  async saveSubmissionWithFiles(formId, formEndpoint, data, fileUrls, metadata) {
    const [submission] = await sql`
      INSERT INTO submissions (form_id, form_endpoint, data, file_urls, metadata)
      VALUES (${formId}, ${formEndpoint}, ${sql.json(data)}, ${sql.json(fileUrls)}, ${sql.json(metadata)})
      RETURNING *
    `;
    await sql`SELECT increment_submission_count(${formId})`;
    return submission;
  },

  // Upload file to local storage (no-op in OSS — returns null; use storage adapter)
  // Override this via STORAGE_ADAPTER env if needed.
  async uploadFile(bucket, path, buffer, contentType) {
    // OSS: no built-in object storage. File uploads are disabled by default.
    // Implement your own adapter here (S3, MinIO, local disk, etc.)
    return null;
  }
};
