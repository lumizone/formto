import dns from 'dns/promises';
import net from 'net';
import validator from 'validator';
import {
  normalizeEmailConfig,
  normalizeEmailList,
  normalizeSingleEmail
} from './emailSecurity.js';

const ALLOWED_WEBHOOK_PORTS = new Set(['80', '443', '3000', '4000', '5000', '8000', '8080', '8443', '9000']);
const ALLOWED_FORM_FIELD_TYPES = new Set([
  'text',
  'email',
  'tel',
  'number',
  'textarea',
  'checkbox',
  'select',
  'radio',
  'file',
  'date',
  'url'
]);
const SAFE_FIELD_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const SAFE_ENDPOINT_REGEX = /^(?!-)[a-z0-9-]{3,64}(?<!-)$/;

function isRestrictedHostname(hostname) {
  const normalized = hostname.toLowerCase();

  return normalized === 'localhost' ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal');
}

function isSuspiciousIpLiteral(hostname) {
  return /^[0-9]+$/.test(hostname) || hostname.includes('0x');
}

function ipv4ToInt(ip) {
  return ip.split('.').reduce((value, octet) => ((value << 8) >>> 0) + Number(octet), 0) >>> 0;
}

function isPrivateIpv4(ip) {
  const value = ipv4ToInt(ip);
  const ranges = [
    ['0.0.0.0', '0.255.255.255'],
    ['10.0.0.0', '10.255.255.255'],
    ['100.64.0.0', '100.127.255.255'],
    ['127.0.0.0', '127.255.255.255'],
    ['169.254.0.0', '169.254.255.255'],
    ['172.16.0.0', '172.31.255.255'],
    ['192.0.0.0', '192.0.0.255'],
    ['192.0.2.0', '192.0.2.255'],
    ['192.168.0.0', '192.168.255.255'],
    ['198.18.0.0', '198.19.255.255'],
    ['198.51.100.0', '198.51.100.255'],
    ['203.0.113.0', '203.0.113.255'],
    ['224.0.0.0', '255.255.255.255']
  ];

  return ranges.some(([start, end]) => value >= ipv4ToInt(start) && value <= ipv4ToInt(end));
}

function isPrivateIpv6(ip) {
  const normalized = ip.toLowerCase();

  return normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.') ||
    /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(normalized) ||
    normalized.startsWith('2001:db8:');
}

function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    return isPrivateIpv4(address);
  }
  if (family === 6) {
    return isPrivateIpv6(address);
  }
  return true;
}

function normalizeTemplateOption(option) {
  if (typeof option === 'string') {
    const trimmed = option.trim();
    if (!trimmed) {
      return null;
    }
    return {
      label: trimmed,
      value: trimmed
    };
  }

  if (option && typeof option === 'object') {
    const label = String(option.label ?? option.value ?? '').trim();
    const value = String(option.value ?? option.label ?? '').trim();

    if (!label || !value) {
      return null;
    }

    return { label, value };
  }

  return null;
}

/**
 * Validate webhook URL to prevent SSRF attacks
 * @param {string} url - The webhook URL to validate
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export async function validateWebhookUrl(url, options = {}) {
  const resolution = await resolveWebhookTarget(url, options);
  if (!resolution.valid) {
    return {
      valid: false,
      error: resolution.error
    };
  }

  return { valid: true };
}

export async function resolveWebhookTarget(url, options = {}) {
  const { requireHttps = false } = options;

  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (!validator.isURL(url, {
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
    allow_underscores: false
  })) {
    return { valid: false, error: 'Invalid URL format' };
  }

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    if (requireHttps && parsedUrl.protocol !== 'https:') {
      return { valid: false, error: 'Webhook URL must use https' };
    }

    if (isRestrictedHostname(hostname) || isSuspiciousIpLiteral(hostname)) {
      return { valid: false, error: 'Webhook URL points to a restricted host' };
    }

    if (parsedUrl.port && !ALLOWED_WEBHOOK_PORTS.has(parsedUrl.port)) {
      return { valid: false, error: 'Webhook URL uses non-standard port' };
    }

    const resolvedAddresses = net.isIP(hostname)
      ? [{ address: hostname, family: net.isIP(hostname) }]
      : await dns.lookup(hostname, { all: true, verbatim: true });

    if (!resolvedAddresses.length) {
      return { valid: false, error: 'Webhook hostname could not be resolved' };
    }

    for (const result of resolvedAddresses) {
      if (isPrivateAddress(result.address)) {
        return { valid: false, error: 'Webhook URL resolves to a restricted network' };
      }
    }

    const selectedAddress = resolvedAddresses[0];

    return {
      valid: true,
      parsedUrl,
      hostname,
      pinnedAddress: selectedAddress.address,
      family: selectedAddress.family || net.isIP(selectedAddress.address)
    };
  } catch (error) {
    return { valid: false, error: 'Invalid webhook URL' };
  }
}

export function validateFormEndpoint(endpoint) {
  if (typeof endpoint !== 'string') {
    return { valid: false, error: 'Endpoint must be a string' };
  }

  const normalizedValue = endpoint.trim().toLowerCase();
  if (!SAFE_ENDPOINT_REGEX.test(normalizedValue)) {
    return {
      valid: false,
      error: 'Endpoint must be 3-64 characters and contain only lowercase letters, numbers, and hyphens'
    };
  }

  return {
    valid: true,
    normalizedValue
  };
}

export function validateHostedFields(fields) {
  if (fields === undefined) {
    return { valid: true, sanitizedFields: undefined };
  }

  if (!Array.isArray(fields)) {
    return { valid: false, error: 'Fields must be an array' };
  }

  if (fields.length > 50) {
    return { valid: false, error: 'Too many fields configured (max 50)' };
  }

  const sanitizedFields = [];

  for (const field of fields) {
    if (!field || typeof field !== 'object') {
      return { valid: false, error: 'Each field must be an object' };
    }

    const name = String(field.name || '').trim();
    const type = String(field.type || 'text').trim().toLowerCase();
    const label = String(field.label || name).trim();

    if (!SAFE_FIELD_NAME_REGEX.test(name)) {
      return {
        valid: false,
        error: `Invalid field name "${name}". Use letters, numbers, underscores, and hyphens only.`
      };
    }

    if (!ALLOWED_FORM_FIELD_TYPES.has(type)) {
      return {
        valid: false,
        error: `Unsupported field type "${type}"`
      };
    }

    if (!label || label.length > 120) {
      return {
        valid: false,
        error: `Invalid label for field "${name}"`
      };
    }

    const sanitizedField = {
      name,
      label,
      type,
      required: Boolean(field.required)
    };

    if (type === 'select' || type === 'radio') {
      if (!Array.isArray(field.options) || field.options.length === 0 || field.options.length > 50) {
        return {
          valid: false,
          error: `Field "${name}" must include 1-50 options`
        };
      }

      const options = field.options.map(normalizeTemplateOption).filter(Boolean);
      if (options.length === 0) {
        return {
          valid: false,
          error: `Field "${name}" must include valid options`
        };
      }

      sanitizedField.options = options.map((option) => ({
        label: option.label.slice(0, 120),
        value: option.value.slice(0, 120)
      }));
    }

    if (type === 'checkbox' && field.value !== undefined && field.value !== null) {
      sanitizedField.value = String(field.value).slice(0, 120);
    }

    sanitizedFields.push(sanitizedField);
  }

  return { valid: true, sanitizedFields };
}

/**
 * Validate submission data to prevent injection attacks
 * @param {object} data - The submission data to validate
 * @returns {{valid: boolean, error?: string}}
 */
export function validateSubmissionData(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Submission data must be an object' };
  }

  if (Object.prototype.hasOwnProperty.call(data, '__proto__') ||
      Object.prototype.hasOwnProperty.call(data, 'constructor') ||
      Object.prototype.hasOwnProperty.call(data, 'prototype')) {
    return { valid: false, error: 'Invalid field names detected' };
  }

  const MAX_FIELDS = 50;
  const MAX_KEY_LENGTH = 100;
  const MAX_VALUE_LENGTH = 10000;

  const fields = Object.entries(data);

  if (fields.length === 0) {
    return { valid: false, error: 'Submission data cannot be empty' };
  }

  if (fields.length > MAX_FIELDS) {
    return { valid: false, error: `Too many fields (max ${MAX_FIELDS})` };
  }

  for (const [key, value] of fields) {
    if (typeof key !== 'string' || key.length === 0) {
      return { valid: false, error: 'Field names must be non-empty strings' };
    }

    if (key.length > MAX_KEY_LENGTH) {
      return { valid: false, error: `Field name too long (max ${MAX_KEY_LENGTH} characters)` };
    }

    if (key.startsWith('_') || key.includes('$') || key.includes('.')) {
      return { valid: false, error: 'Field names cannot start with _ or contain $ or .' };
    }

    if (value === null || value === undefined) {
      continue;
    }

    const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (valueStr.length > MAX_VALUE_LENGTH) {
      return { valid: false, error: `Field value too long (max ${MAX_VALUE_LENGTH} characters)` };
    }

    if (typeof value === 'object') {
      const depth = getObjectDepth(value);
      if (depth > 5) {
        return { valid: false, error: 'Nested objects too deep (max 5 levels)' };
      }
    }
  }

  return { valid: true };
}

/**
 * Validate email template fields when creating/updating forms
 * @param {object} templateData - Template fields from request body
 * @returns {{valid: boolean, error?: string}}
 */
export function validateEmailTemplate(templateData) {
  const {
    email_template_enabled,
    email_template_subject,
    email_template_body,
    logo_url,
    notification_email,
    notification_emails,
    email_config
  } = templateData;

  if (email_template_enabled && !email_template_body) {
    return { valid: false, error: 'Email template body is required when template is enabled' };
  }

  if (email_template_subject !== undefined && email_template_subject !== null) {
    if (typeof email_template_subject !== 'string') {
      return { valid: false, error: 'Email template subject must be a string' };
    }
    if (email_template_subject.length > 200) {
      return { valid: false, error: 'Email template subject too long (max 200 characters)' };
    }
  }

  if (email_template_body !== undefined && email_template_body !== null) {
    if (typeof email_template_body !== 'string') {
      return { valid: false, error: 'Email template body must be a string' };
    }

    const templateSize = Buffer.byteLength(email_template_body, 'utf8');
    if (templateSize > 51200) {
      return { valid: false, error: 'Email template body too large (max 50KB)' };
    }

    if (email_template_body.includes('<script') ||
        email_template_body.includes('javascript:') ||
        email_template_body.includes('onerror=') ||
        email_template_body.includes('onclick=')) {
      return { valid: false, error: 'Email template contains potentially dangerous content' };
    }
  }

  if (logo_url !== undefined && logo_url !== null && logo_url !== '') {
    if (typeof logo_url !== 'string') {
      return { valid: false, error: 'Logo URL must be a string' };
    }

    if (!validator.isURL(logo_url, {
      protocols: ['http', 'https'],
      require_protocol: true
    })) {
      return { valid: false, error: 'Invalid logo URL format' };
    }

    try {
      const parsedUrl = new URL(logo_url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return { valid: false, error: 'Logo URL must use http or https protocol' };
      }
    } catch (error) {
      return { valid: false, error: 'Invalid logo URL' };
    }
  }

  if (notification_email !== undefined && notification_email !== null && notification_email !== '') {
    const notificationEmailResult = normalizeSingleEmail(notification_email, {
      fieldName: 'notification email',
      allowEmpty: true
    });
    if (!notificationEmailResult.valid) {
      return { valid: false, error: notificationEmailResult.error };
    }
  }

  if (notification_emails !== undefined) {
    const notificationEmailsResult = normalizeEmailList(notification_emails, {
      fieldName: 'notification_emails',
      allowEmpty: true
    });
    if (!notificationEmailsResult.valid) {
      return { valid: false, error: notificationEmailsResult.error };
    }
  }

  if (email_config !== undefined) {
    const emailConfigResult = normalizeEmailConfig(email_config, { allowEmpty: true });
    if (!emailConfigResult.valid) {
      return { valid: false, error: emailConfigResult.error };
    }
  }

  return { valid: true };
}

function getObjectDepth(obj, currentDepth = 0) {
  if (typeof obj !== 'object' || obj === null) {
    return currentDepth;
  }

  const depths = Object.values(obj).map((value) =>
    getObjectDepth(value, currentDepth + 1)
  );

  return depths.length > 0 ? Math.max(...depths) : currentDepth;
}
