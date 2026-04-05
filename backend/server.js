import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';

import { authMiddleware, optionalAuthMiddleware } from './middleware/auth.js';
import { getRequestIp, rateLimitPresets, spamDetectionMiddleware, honeypotDetectionMiddleware } from './middleware/rateLimit.js';

import authRoutes       from './routes/auth.js';
import formRoutes       from './routes/forms.js';
import submissionRoutes from './routes/submissions.js';
import publicRoutes     from './routes/public.js';
import webhookRoutes    from './routes/webhooks.js';

import sql from './utils/db.js';

dotenv.config();

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    ...(process.env.NODE_ENV !== 'production' && {
      transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' } }
    })
  },
  trustProxy: process.env.NODE_ENV === 'production'
    ? ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']
    : false,
  bodyLimit: 524288,     // 512KB
  requestTimeout: 30000,
  connectionTimeout: 10000
});

// ─── CORS ─────────────────────────────────────────────────────────────────────

// Derive CORS allowed origins: explicit list, or from DOMAIN env var (Caddy same-domain setup)
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : process.env.DOMAIN
    ? [`https://${process.env.DOMAIN}`, `http://${process.env.DOMAIN}`]
    : ['http://localhost:5173', 'http://localhost:80', 'http://localhost'];

fastify.addHook('onRequest', async (request, reply) => {
  const origin = request.headers.origin;
  const url    = request.url;

  if (url.startsWith('/f/')) {
    reply.header('Access-Control-Allow-Origin', origin || '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
    if (request.method === 'OPTIONS') { reply.status(204).send(); return; }
    return;
  }

  if (origin) {
    if (corsOrigins.includes(origin) || corsOrigins.includes('*')) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
      reply.header('Access-Control-Allow-Credentials', 'true');
      if (request.method === 'OPTIONS') { reply.status(204).send(); return; }
    } else {
      console.warn(`[CORS] Blocked origin: ${origin} for ${url}`);
      return reply.status(403).send({ error: 'CORS not allowed' });
    }
  }
});

await fastify.register(cors, { origin: false });
await fastify.register(helmet, { contentSecurityPolicy: false });
await fastify.register(formbody);
await fastify.register(multipart, {
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024, files: 10 }
});

// ─── Rate limiting (in-memory) ────────────────────────────────────────────────

await fastify.register(rateLimit, {
  max: 200,
  timeWindow: '1 minute',
  keyGenerator: (req) => `global-${getRequestIp(req)}`,
  errorResponseBuilder: (req, ctx) => ({
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: Math.ceil(ctx.ttl / 1000)
  })
});

// ─── Decorate with middleware ─────────────────────────────────────────────────

fastify.decorate('auth',                  authMiddleware);
fastify.decorate('optionalAuth',          optionalAuthMiddleware);
fastify.decorate('rateLimitFormSubmission', rateLimitPresets.formSubmission);
fastify.decorate('rateLimitSensitive',    rateLimitPresets.sensitive);
fastify.decorate('rateLimitExport',       rateLimitPresets.export);
fastify.decorate('rateLimitWebhookTest',  rateLimitPresets.webhookTest);
fastify.decorate('rateLimitWebhookRetry', rateLimitPresets.webhookRetry);
fastify.decorate('rateLimitReplyEmail',   rateLimitPresets.replyEmail);
fastify.decorate('spamDetection',         spamDetectionMiddleware);
fastify.decorate('honeypotDetection',     honeypotDetectionMiddleware);

// ─── Request logging ──────────────────────────────────────────────────────────

fastify.addHook('onResponse', async (request, reply) => {
  if (request.url === '/health') return;
  const userId = request.user?.userId || 'anon';
  const ip     = getRequestIp(request);
  console.log(`[${new Date().toISOString()}] ${ip} ${request.method} ${request.url} ${reply.statusCode} ${reply.elapsedTime?.toFixed(0) || 0}ms user:${userId}`);
});

// ─── Routes ───────────────────────────────────────────────────────────────────

await fastify.register(publicRoutes);
await fastify.register(authRoutes,        { prefix: '/api/auth' });
await fastify.register(formRoutes,        { prefix: '/api/forms' });
await fastify.register(submissionRoutes,  { prefix: '/api/submissions' });
await fastify.register(webhookRoutes,     { prefix: '/api/webhooks' });

// ─── Built-in endpoints ───────────────────────────────────────────────────────

fastify.get('/', async () => ({
  name: 'FormTo',
  version: '1.0.0',
  status: 'ok',
  docs: 'https://github.com/yourusername/formto'
}));

fastify.get('/health', async (request, reply) => {
  let dbHealthy = false;
  try {
    await sql`SELECT 1`;
    dbHealthy = true;
  } catch {}

  return reply.status(dbHealthy ? 200 : 503).send({
    status: dbHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: { database: dbHealthy ? 'ok' : 'error' }
  });
});

// ─── Error handlers ───────────────────────────────────────────────────────────

fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  const isDev = process.env.NODE_ENV !== 'production';
  reply.status(error.statusCode || 500).send({
    error: error.name || 'Internal Server Error',
    message: isDev ? error.message : 'An error occurred'
  });
});

fastify.setNotFoundHandler((request, reply) => {
  reply.status(404).send({ error: 'Not Found', message: `${request.method} ${request.url} not found` });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const closeGracefully = async (signal) => {
  console.log(`\nReceived ${signal}, shutting down…`);
  try { await fastify.close(); console.log('✓ Fastify closed'); } catch (e) { console.error(e.message); }
  try { await sql.end(); console.log('✓ DB pool closed'); } catch (e) { console.error(e.message); }
  process.exit(0);
};

process.on('SIGINT',  closeGracefully);
process.on('SIGTERM', closeGracefully);

const start = async () => {
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || '0.0.0.0';

  await fastify.listen({ port, host });

  const INSECURE_SECRETS = new Set([
    'change-me-generate-with-openssl-rand-hex-32',
    'secret',
    'changeme',
    'your-secret-key',
  ]);
  if (INSECURE_SECRETS.has(process.env.JWT_SECRET)) {
    console.warn('');
    console.warn('  ⚠️  WARNING: JWT_SECRET is set to a known default value.');
    console.warn('     Generate a secure secret:  openssl rand -hex 32');
    console.warn('     Then update formto.env and restart.');
    console.warn('');
  }

  const INSECURE_DB_PASSWORDS = new Set([
    'change_me_strong_password',
    'postgres',
    'password',
    'changeme',
  ]);
  if (INSECURE_DB_PASSWORDS.has(process.env.POSTGRES_PASSWORD)) {
    console.warn('');
    console.warn('  ⚠️  WARNING: POSTGRES_PASSWORD is set to a known default value.');
    console.warn('     Generate a secure password:  openssl rand -base64 32');
    console.warn('     Then update formto.env and restart.');
    console.warn('');
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  FormTo Open Source');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Env:    ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Server: http://${host}:${port}`);
  console.log(`  Health: http://${host}:${port}/health`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
};

start().catch(err => { fastify.log.error(err); process.exit(1); });
