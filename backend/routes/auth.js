import sql from '../utils/db.js';
import { signToken, hashPassword, checkPassword } from '../utils/auth.js';
import { getTransportForUser, getFromForUser } from '../utils/mailer.js';

const MIN_PASSWORD_LENGTH = 8;

export default async function authRoutes(fastify) {
  // Check if first-run setup is needed (no users exist yet)
  fastify.get('/setup-status', async () => {
    const [row] = await sql`SELECT COUNT(*)::int AS count FROM users`;
    return { needsSetup: row.count === 0 };
  });

  // First-run setup — create the initial account (only if no users exist)
  fastify.post('/setup', async (request, reply) => {
    const [row] = await sql`SELECT COUNT(*)::int AS count FROM users`;
    if (row.count > 0) {
      return reply.status(403).send({ error: 'Setup already completed' });
    }

    const { username, password } = request.body || {};
    if (!username || !password) {
      return reply.status(400).send({ error: 'username and password are required' });
    }
    if (String(username).trim().length < 2) {
      return reply.status(400).send({ error: 'Username must be at least 2 characters' });
    }
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return reply.status(400).send({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const passwordHash = await hashPassword(String(password));
    const [user] = await sql`
      INSERT INTO users (username, password_hash, name)
      VALUES (${String(username).trim()}, ${passwordHash}, ${String(username).trim()})
      RETURNING id, username, email, name, avatar_url, created_at
    `;

    const token = await signToken({ userId: user.id, username: user.username, name: user.name, email: user.email });
    return reply.status(201).send({ token, user });
  });

  // Login
  fastify.post('/login', async (request, reply) => {
    const { username, password } = request.body || {};

    if (!username || !password) {
      return reply.status(400).send({ error: 'username and password are required' });
    }

    const [user] = await sql`
      SELECT id, username, email, name, avatar_url, password_hash, created_at
      FROM users WHERE username = ${String(username).trim()} LIMIT 1
    `;

    if (!user || !(await checkPassword(String(password), user.password_hash))) {
      return reply.status(401).send({ error: 'Invalid username or password' });
    }

    const { password_hash: _, ...safeUser } = user;
    const token = await signToken({ userId: user.id, username: user.username, name: user.name, email: user.email });
    return { token, user: safeUser };
  });

  // Get current user (smtp pass is masked — never returned in plain text)
  fastify.get('/me', { preHandler: fastify.auth }, async (request, reply) => {
    const [user] = await sql`
      SELECT id, username, email, name, avatar_url, notify_email, telegram_bot_token, telegram_chat_id, slack_webhook_url, smtp_config, created_at, updated_at
      FROM users WHERE id = ${request.user.userId} LIMIT 1
    `;
    if (!user) return reply.status(404).send({ error: 'User not found' });

    // Mask SMTP password before returning to frontend
    if (user.smtp_config?.pass) {
      user.smtp_config = { ...user.smtp_config, pass: '••••••••' };
    }
    return { user };
  });

  // Send test email using user's smtp_config
  fastify.post('/test-email', { preHandler: fastify.auth }, async (request, reply) => {
    const [user] = await sql`SELECT smtp_config, notify_email FROM users WHERE id = ${request.user.userId}`;
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const to = user.notify_email;
    if (!to) return reply.status(400).send({ error: 'No notification email configured' });

    try {
      const transport = getTransportForUser(user.smtp_config);
      const from = getFromForUser(user.smtp_config);
      await transport.sendMail({
        from,
        to,
        subject: 'FormTo — test email',
        html: '<p>This is a test email from <strong>FormTo</strong>. Your email notifications are working correctly.</p>'
      });
      return { success: true };
    } catch (err) {
      return reply.status(502).send({ error: `Failed to send: ${err.message}` });
    }
  });

  // Update profile (name, email, password, notification channels, smtp_config)
  fastify.put('/me', { preHandler: fastify.auth }, async (request, reply) => {
    const { name, email, password, currentPassword, notify_email, telegram_bot_token, telegram_chat_id, slack_webhook_url, smtp_config } = request.body || {};
    const updates = {};

    if (name !== undefined) updates.name = String(name).trim() || null;
    if (notify_email !== undefined) updates.notify_email = String(notify_email).trim().toLowerCase() || null;
    if (telegram_bot_token !== undefined) updates.telegram_bot_token = String(telegram_bot_token).trim() || null;
    if (telegram_chat_id !== undefined) updates.telegram_chat_id = String(telegram_chat_id).trim() || null;
    if (slack_webhook_url !== undefined) updates.slack_webhook_url = String(slack_webhook_url).trim() || null;

    if (smtp_config !== undefined) {
      if (smtp_config === null) {
        updates.smtp_config = null;
      } else {
        // If pass is the masked placeholder, keep existing password
        const existing = smtp_config.pass === '••••••••'
          ? (await sql`SELECT smtp_config FROM users WHERE id = ${request.user.userId}`)[0]?.smtp_config
          : null;
        updates.smtp_config = JSON.stringify({
          host:   smtp_config.host?.trim()   || null,
          port:   Number(smtp_config.port)   || 587,
          secure: !!smtp_config.secure,
          user:   smtp_config.user?.trim()   || null,
          pass:   smtp_config.pass === '••••••••' ? existing?.pass : smtp_config.pass?.trim() || null,
          from:   smtp_config.from?.trim()   || null,
        });
      }
    }

    if (email !== undefined) {
      const normalizedEmail = String(email).trim().toLowerCase();
      const [existing] = await sql`
        SELECT id FROM users WHERE email = ${normalizedEmail} AND id != ${request.user.userId}
      `;
      if (existing) return reply.status(409).send({ error: 'Email already in use' });
      updates.email = normalizedEmail;
    }

    if (password !== undefined) {
      if (!currentPassword) {
        return reply.status(400).send({ error: 'currentPassword is required to change password' });
      }
      const [user] = await sql`SELECT password_hash FROM users WHERE id = ${request.user.userId}`;
      if (!(await checkPassword(String(currentPassword), user.password_hash))) {
        return reply.status(401).send({ error: 'Current password is incorrect' });
      }
      if (String(password).length < MIN_PASSWORD_LENGTH) {
        return reply.status(400).send({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }
      updates.password_hash = await hashPassword(String(password));
    }

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    updates.updated_at = new Date();
    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [request.user.userId, ...Object.values(updates)];

    const [updated] = await sql.unsafe(
      `UPDATE users SET ${setClauses} WHERE id = $1 RETURNING id, username, email, name, avatar_url, notify_email, telegram_bot_token, telegram_chat_id, slack_webhook_url, smtp_config, created_at, updated_at`,
      values
    );

    // Mask smtp pass before returning
    if (updated?.smtp_config?.pass) {
      updated.smtp_config = { ...updated.smtp_config, pass: '••••••••' };
    }
    return { user: updated };
  });
}
