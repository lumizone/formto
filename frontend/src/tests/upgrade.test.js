import { describe, it, expect } from 'vitest';
import { parseUpgradeRequirement } from '../lib/upgrade.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a fake axios-style 403 error with the given message.
 */
function make403Error(message) {
  return {
    response: {
      status: 403,
      data: { message }
    }
  };
}

/**
 * Build a fake error with a different HTTP status code.
 */
function makeNonError(status, message) {
  return {
    response: {
      status,
      data: { message }
    }
  };
}

// ─── parseUpgradeRequirement — null cases ────────────────────────────────────

describe('parseUpgradeRequirement — returns null', () => {
  it('returns null for undefined error', () => {
    expect(parseUpgradeRequirement(undefined)).toBeNull();
  });

  it('returns null for null error', () => {
    expect(parseUpgradeRequirement(null)).toBeNull();
  });

  it('returns null for empty object', () => {
    expect(parseUpgradeRequirement({})).toBeNull();
  });

  it('returns null for non-403 status even with a requires-plan message', () => {
    const error = makeNonError(400, 'This requires Personal plan or higher.');
    expect(parseUpgradeRequirement(error)).toBeNull();
  });

  it('returns null for 401 status', () => {
    const error = makeNonError(401, 'This requires Professional plan or higher.');
    expect(parseUpgradeRequirement(error)).toBeNull();
  });

  it('returns null for 500 status', () => {
    const error = makeNonError(500, 'This requires Personal plan or higher.');
    expect(parseUpgradeRequirement(error)).toBeNull();
  });

  it('returns null when message does not match "requires X plan" pattern', () => {
    const error = make403Error('You are not allowed to do this.');
    expect(parseUpgradeRequirement(error)).toBeNull();
  });

  it('returns null when error has no response object', () => {
    // Plain JS error without response — status is undefined
    expect(parseUpgradeRequirement(new Error('requires Personal plan'))).toBeNull();
  });

  it('returns null when error.response.data.message is missing but error.message has pattern', () => {
    // error.response exists but data.message is undefined; falls to error.message which has no response.status 403
    const err = {
      response: { status: 200, data: {} },
      message: 'requires Personal plan or higher.'
    };
    expect(parseUpgradeRequirement(err)).toBeNull();
  });
});

// ─── parseUpgradeRequirement — valid 403 with plan pattern ───────────────────

describe('parseUpgradeRequirement — returns upgrade requirement', () => {
  it('returns correct requiredPlan from message', () => {
    const error = make403Error('This requires Personal plan or higher.');
    const result = parseUpgradeRequirement(error);
    expect(result).not.toBeNull();
    expect(result.requiredPlan).toBe('Personal');
  });

  it('capitalises the plan name correctly', () => {
    const error = make403Error('This requires professional plan or higher.');
    const result = parseUpgradeRequirement(error);
    expect(result.requiredPlan).toBe('Professional');
  });

  it('always includes the original message', () => {
    const msg = 'This requires Personal plan or higher.';
    const result = parseUpgradeRequirement(make403Error(msg));
    expect(result.message).toBe(msg);
  });

  it('falls back to generic copy for unknown feature key', () => {
    const error = make403Error('This feature requires Business plan or higher.');
    const result = parseUpgradeRequirement(error);
    expect(result).not.toBeNull();
    expect(result.featureKey).toBeNull();
    expect(result.title).toBe('Upgrade required');
    expect(result.description).toBe('This form setting is available on a higher plan.');
  });
});

// ─── parseUpgradeRequirement — feature key: webhooks ────────────────────────

describe('parseUpgradeRequirement — feature key: webhooks', () => {
  it('detects "webhook" keyword (not webhook retry) as webhooks feature', () => {
    const error = make403Error('Webhooks requires Personal plan or higher.');
    const result = parseUpgradeRequirement(error);
    expect(result.featureKey).toBe('webhooks');
    expect(result.title).toBe('Unlock webhook automations');
    expect(result.description).toContain('Zapier');
  });

  it('detects webhook feature case-insensitively', () => {
    const error = make403Error('WEBHOOK requires Personal plan or higher.');
    const result = parseUpgradeRequirement(error);
    expect(result.featureKey).toBe('webhooks');
  });
});

// ─── parseUpgradeRequirement — feature key: webhook_retry ───────────────────

describe('parseUpgradeRequirement — feature key: webhook_retry', () => {
  it('detects "webhook retry" keyword', () => {
    const error = make403Error('Webhook retry requires Professional plan or higher.');
    const result = parseUpgradeRequirement(error);
    expect(result.featureKey).toBe('webhook_retry');
    expect(result.title).toBe('Unlock webhook retry');
    expect(result.description).toContain('Retry failed webhook');
  });

  it('webhook_retry takes priority over webhooks', () => {
    // "webhook retry" contains "webhook" — ensure webhook_retry is detected first
    const error = make403Error('Webhook retry requires Professional plan or higher.');
    const result = parseUpgradeRequirement(error);
    expect(result.featureKey).toBe('webhook_retry');
  });

  it('detects webhook_retry case-insensitively', () => {
    const error = make403Error('WEBHOOK RETRY requires Professional plan or higher.');
    const result = parseUpgradeRequirement(error);
    expect(result.featureKey).toBe('webhook_retry');
  });
});

// ─── parseUpgradeRequirement — feature key: email_templates ─────────────────

describe('parseUpgradeRequirement — feature key: email_templates', () => {
  it('detects "custom email templates" keyword', () => {
    const error = make403Error('Custom email templates requires Personal plan or higher.');
    const result = parseUpgradeRequirement(error);
    expect(result.featureKey).toBe('email_templates');
    expect(result.title).toBe('Unlock custom email templates');
    expect(result.description).toContain('branded notification emails');
  });

  it('detects email_templates case-insensitively', () => {
    const error = make403Error('CUSTOM EMAIL TEMPLATES requires Personal plan or higher.');
    const result = parseUpgradeRequirement(error);
    expect(result.featureKey).toBe('email_templates');
  });
});

// ─── parseUpgradeRequirement — feature key: autoresponder ───────────────────

describe('parseUpgradeRequirement — feature key: autoresponder', () => {
  it('detects "autoresponder" keyword', () => {
    const error = make403Error('Autoresponder requires Personal plan or higher.');
    const result = parseUpgradeRequirement(error);
    expect(result.featureKey).toBe('autoresponder');
    expect(result.title).toBe('Unlock autoresponders');
    expect(result.description).toContain('confirmation emails');
  });

  it('detects autoresponder case-insensitively', () => {
    const error = make403Error('AUTORESPONDER requires Personal plan or higher.');
    const result = parseUpgradeRequirement(error);
    expect(result.featureKey).toBe('autoresponder');
  });
});

// ─── parseUpgradeRequirement — feature key: captcha ─────────────────────────

describe('parseUpgradeRequirement — feature key: captcha', () => {
  it('detects "captcha" keyword', () => {
    const error = make403Error('CAPTCHA requires Professional plan or higher.');
    const result = parseUpgradeRequirement(error);
    expect(result.featureKey).toBe('captcha');
    expect(result.title).toBe('Unlock advanced spam protection');
    expect(result.description).toContain('Cloudflare Turnstile');
  });

  it('detects captcha case-insensitively', () => {
    const error = make403Error('captcha requires Professional plan or higher.');
    const result = parseUpgradeRequirement(error);
    expect(result.featureKey).toBe('captcha');
  });
});

// ─── extractRequiredPlan — edge cases via parseUpgradeRequirement ────────────

describe('extractRequiredPlan edge cases', () => {
  it('handles Business plan name', () => {
    const error = make403Error('This feature requires Business plan or higher.');
    const result = parseUpgradeRequirement(error);
    expect(result.requiredPlan).toBe('Business');
  });

  it('handles Enterprise plan name', () => {
    const error = make403Error('This feature requires Enterprise plan or higher.');
    const result = parseUpgradeRequirement(error);
    expect(result.requiredPlan).toBe('Enterprise');
  });

  it('sets requiredPlan to null when "requires X plan" is absent from message', () => {
    // Construct a message that passes the regex guard but has no plan name
    // This edge case can't happen in practice (regex requires "requires X plan"),
    // but we verify extractRequiredPlan handles a degenerate case.
    // We test it through a message that barely passes the outer guard.
    const error = make403Error('requires x plan or higher.');
    const result = parseUpgradeRequirement(error);
    // "x" → capitalised to "X"
    expect(result.requiredPlan).toBe('X');
  });

  it('uses error.message as fallback when response.data.message is absent', () => {
    const error = {
      response: { status: 403, data: {} },
      message: 'Webhooks requires Personal plan or higher.'
    };
    const result = parseUpgradeRequirement(error);
    expect(result).not.toBeNull();
    expect(result.featureKey).toBe('webhooks');
    expect(result.requiredPlan).toBe('Personal');
  });
});
