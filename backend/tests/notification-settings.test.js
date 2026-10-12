import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Run against a disposable database initialized with migrations/001_init.sql.
test('notification settings persist as objects and preserve masked passwords', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.JWT_SECRET = 'notification-regression-test-only';
  const { default: Fastify } = await import('fastify');
  const { default: sql } = await import('../utils/db.js');
  const { default: authRoutes } = await import('../routes/auth.js');
  const { getTransportForUser, getFromForUser } = await import('../utils/mailer.js');
  const app = Fastify();
  let userId;
  t.after(async () => {
    await app.close();
    if (userId) await sql`DELETE FROM users WHERE id = ${userId}`;
    await sql.end();
  });
  const [user] = await sql`
    INSERT INTO users (username, password_hash)
    VALUES (${`notification-test-${randomUUID()}`}, 'unused') RETURNING id
  `;
  userId = user.id;
  app.decorate('auth', async request => { request.user = { userId }; });
  await app.register(authRoutes, { prefix: '/api/auth' });
  const config = {
    host: 'smtp.example.com', port: 465, secure: true,
    user: 'forms@example.com', pass: 'dummy-smtp-password',
    from: 'FormTo <forms@example.com>',
  };
  const save = payload => app.inject({ method: 'PUT', url: '/api/auth/me', payload });
  const read = () => app.inject({ method: 'GET', url: '/api/auth/me' });
  const assertMasked = response => {
    assert.equal(response.statusCode, 200);
    const saved = response.json().user;
    assert.equal(saved.smtp_config.host, config.host);
    assert.equal(saved.smtp_config.pass, '••••••••');
    assert.ok(!response.body.includes(config.pass));
    return saved;
  };

  await t.test('save and reload return the SMTP object with its password masked', async () => {
    assertMasked(await save({ notify_email: 'recipient@example.com', smtp_config: config }));
    assert.equal(assertMasked(await read()).notify_email, 'recipient@example.com');
    const [row] = await sql`SELECT jsonb_typeof(smtp_config) AS type FROM users WHERE id = ${userId}`;
    assert.equal(row.type, 'object');
  });

  await t.test('an unchanged masked password survives another save', async () => {
    assertMasked(await save({ smtp_config: { ...config, pass: '••••••••' } }));
    const [row] = await sql`SELECT smtp_config FROM users WHERE id = ${userId}`;
    assert.equal(row.smtp_config.pass, config.pass);
  });

  await t.test('legacy string values load, stay masked, and convert on resave', async () => {
    await sql`UPDATE users SET smtp_config = ${sql.json(JSON.stringify(config))} WHERE id = ${userId}`;
    assertMasked(await read());
    // Neither helper connects to SMTP or sends email.
    const transport = getTransportForUser(JSON.stringify(config));
    assert.equal(transport.options.host, config.host);
    assert.equal(transport.options.auth.pass, config.pass);
    assert.equal(getFromForUser(JSON.stringify(config)), config.from);
    transport.close();
    assertMasked(await save({ smtp_config: { ...config, pass: '••••••••' } }));
    const [row] = await sql`SELECT smtp_config FROM users WHERE id = ${userId}`;
    assert.deepEqual(row.smtp_config, config);
  });

  await t.test('profile-only updates preserve SMTP settings', async () => {
    assertMasked(await save({ name: 'Notification test' }));
  });

  await t.test('clearing settings persists null', async () => {
    const response = await save({ smtp_config: null, notify_email: null,
      telegram_bot_token: null, telegram_chat_id: null, slack_webhook_url: null });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().user.smtp_config, null);
    assert.equal((await read()).json().user.smtp_config, null);
    for (const key of ['notify_email', 'telegram_bot_token', 'telegram_chat_id', 'slack_webhook_url']) {
      assert.equal((await read()).json().user[key], null);
    }
  });
});
