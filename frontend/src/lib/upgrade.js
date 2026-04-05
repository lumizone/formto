/**
 * Parse a 403 API error and extract upgrade requirement information.
 *
 * Returns null if the error is not a plan-gated 403, otherwise returns
 * { requiredPlan, featureKey, title, description, message }.
 */

const FEATURE_MAP = [
  {
    key: 'webhook_retry',
    match: (msg) => msg.includes('webhook retry'),
    title: 'Unlock webhook retry',
    description: 'Retry failed webhook deliveries automatically. Ensure your integrations always receive submission data.',
  },
  {
    key: 'webhooks',
    match: (msg) => msg.includes('webhook'),
    title: 'Unlock webhook automations',
    description: 'Send form submissions to Zapier, Make, n8n, Slack, Discord, or any URL — automatically.',
  },
  {
    key: 'email_templates',
    match: (msg) => msg.includes('custom email template'),
    title: 'Unlock custom email templates',
    description: 'Design branded notification emails with your own logo, colors, and HTML layout.',
  },
  {
    key: 'autoresponder',
    match: (msg) => msg.includes('autoresponder'),
    title: 'Unlock autoresponders',
    description: 'Automatically send confirmation emails to people who submit your forms.',
  },
  {
    key: 'captcha',
    match: (msg) => msg.includes('captcha'),
    title: 'Unlock advanced spam protection',
    description: 'Add Cloudflare Turnstile or other CAPTCHA providers to block bot submissions.',
  },
];

/**
 * @param {unknown} error - An axios-style error (or any object)
 * @returns {{ requiredPlan: string, featureKey: string|null, title: string, description: string, message: string } | null}
 */
export function parseUpgradeRequirement(error) {
  if (!error || typeof error !== 'object') return null;

  // Must be an HTTP 403
  if (error.response?.status !== 403) return null;

  // Message — prefer response body, fall back to JS error message
  const message = error.response?.data?.message || error.message || '';
  if (!message) return null;

  // Must match "requires X plan" pattern
  const planMatch = /requires\s+(\w+)\s+plan/i.exec(message);
  if (!planMatch) return null;

  const raw = planMatch[1];
  const requiredPlan = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();

  // Detect feature key (order matters: webhook_retry before webhooks)
  const lower = message.toLowerCase();
  const feature = FEATURE_MAP.find((f) => f.match(lower)) ?? null;

  return {
    requiredPlan,
    featureKey: feature?.key ?? null,
    title: feature?.title ?? 'Upgrade required',
    description: feature?.description ?? 'This form setting is available on a higher plan.',
    message,
  };
}
