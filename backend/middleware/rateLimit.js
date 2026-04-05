// In-memory rate limiting — no Redis required.

export function getRequestIp(request) {
  return (
    request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    request.ip ||
    '127.0.0.1'
  );
}

// ─── Generic in-memory rate limiter factory ───────────────────────────────────

function createRateLimiter({ max, windowMs, keyFn, message }) {
  const store = new Map(); // key → { count, windowStart }

  // Clean stale entries every 5 minutes
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, v] of store) {
      if (v.windowStart < cutoff) store.delete(k);
    }
  }, 300_000).unref?.();

  return async function rateLimitMiddleware(request, reply) {
    const key = keyFn(request);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
      store.set(key, { count: 1, windowStart: now });
      return;
    }

    entry.count++;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      reply.header('Retry-After', retryAfter);
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: message || 'Rate limit exceeded. Please try again later.',
        retryAfter
      });
    }
  };
}

// ─── Presets (used as preHandler in routes) ───────────────────────────────────

export const rateLimitPresets = {
  formSubmission: createRateLimiter({
    max: 10,
    windowMs: 60_000,
    keyFn: (req) => `form:${req.params?.endpoint || 'x'}:${getRequestIp(req)}`,
    message: 'Too many submissions. Please wait a moment.'
  }),
  authenticated: createRateLimiter({
    max: 200,
    windowMs: 60_000,
    keyFn: (req) => `auth:${req.user?.userId || getRequestIp(req)}`
  }),
  sensitive: createRateLimiter({
    max: 10,
    windowMs: 15 * 60_000,
    keyFn: (req) => `sensitive:${req.user?.userId || getRequestIp(req)}`
  }),
  export: createRateLimiter({
    max: 10,
    windowMs: 60 * 60_000,
    keyFn: (req) => `export:${req.user?.userId || getRequestIp(req)}`
  }),
  webhookTest: createRateLimiter({
    max: 20,
    windowMs: 60_000,
    keyFn: (req) => `wh-test:${req.user?.userId || getRequestIp(req)}`
  }),
  webhookRetry: createRateLimiter({
    max: 10,
    windowMs: 5 * 60_000,
    keyFn: (req) => `wh-retry:${req.user?.userId || getRequestIp(req)}`
  }),
  replyEmail: createRateLimiter({
    max: 25,
    windowMs: 60 * 60_000,
    keyFn: (req) => `reply:${req.user?.userId || getRequestIp(req)}`
  }),
  auth: createRateLimiter({
    max: 10,
    windowMs: 5 * 60_000,
    keyFn: (req) => `auth-ip:${getRequestIp(req)}`,
    message: 'Too many login attempts. Please wait.'
  })
};

// ─── Honeypot detection ───────────────────────────────────────────────────────

const HONEYPOT_FIELDS = new Set([
  'website', 'fax', 'phone2', '_honeypot', '_gotcha',
  'url', 'homepage', 'company_url', 'refer', 'referrer_url',
  'address2', 'zip2'
]);

export function evaluateHoneypotPayload(data = {}) {
  const keys = Object.keys(data);
  for (const key of keys) {
    if (HONEYPOT_FIELDS.has(key.toLowerCase()) && data[key]) {
      return { blocked: true };
    }
  }
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([k]) => !HONEYPOT_FIELDS.has(k.toLowerCase()))
  );
  return { blocked: false, cleanData };
}

export async function honeypotDetectionMiddleware(request, reply) {
  const body = request.body || {};
  const { blocked } = evaluateHoneypotPayload(body);
  if (blocked) {
    return reply.status(200).send({ success: true });
  }
}

// ─── Spam detection (per-IP submission burst) ─────────────────────────────────

export const spamDetectionMiddleware = createRateLimiter({
  max: 10,
  windowMs: 60_000,
  keyFn: (req) => `spam:${getRequestIp(req)}`,
  message: 'Submission rate exceeded. Please slow down.'
});
