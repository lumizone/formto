import validator from 'validator';

const DEFAULT_FROM_EMAIL = process.env.FROM_EMAIL || process.env.DEFAULT_FROM_EMAIL || 'FormTo <noreply@localhost>';
const MAX_NOTIFICATION_RECIPIENTS = 5;
const MAX_EMAIL_SUBJECT_LENGTH = 200;
const MAX_DISPLAY_NAME_LENGTH = 100;
const EMAIL_CONFIG_FIELDS = new Set(['to', 'from', 'subject', 'replyTo']);

function parseEmailIdentity(value, { allowDisplayName = false } = {}) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue || /[\r\n]/.test(trimmedValue)) {
    return null;
  }

  if (allowDisplayName) {
    const match = trimmedValue.match(/^(?:"?([^"\r\n<>]{0,100})"?\s*)?<\s*([^<>\s]+@[^<>\s]+)\s*>$/);
    if (match) {
      const displayName = String(match[1] || '').trim();
      const email = String(match[2] || '').trim().toLowerCase();

      if (!validator.isEmail(email)) {
        return null;
      }

      return {
        displayName: displayName.slice(0, MAX_DISPLAY_NAME_LENGTH),
        email
      };
    }
  }

  if (!validator.isEmail(trimmedValue)) {
    return null;
  }

  return {
    displayName: '',
    email: trimmedValue.toLowerCase()
  };
}

function formatEmailIdentity(identity) {
  if (!identity) {
    return null;
  }

  return identity.displayName
    ? `${identity.displayName} <${identity.email}>`
    : identity.email;
}

function getEmailDomain(email) {
  return String(email || '').split('@')[1]?.toLowerCase() || '';
}

function getAllowedSenderDomains() {
  const domains = new Set();
  const defaultIdentity = parseEmailIdentity(DEFAULT_FROM_EMAIL, { allowDisplayName: true });

  if (defaultIdentity?.email) {
    domains.add(getEmailDomain(defaultIdentity.email));
  }

  const configuredDomains = String(process.env.ALLOWED_FROM_EMAIL_DOMAINS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  for (const domain of configuredDomains) {
    domains.add(domain);
  }

  return domains;
}

export function normalizeSingleEmail(value, options = {}) {
  const {
    fieldName = 'email',
    allowDisplayName = false,
    allowEmpty = true,
    enforceAllowedSenderDomain = false
  } = options;

  if (value === undefined || value === null || value === '') {
    return {
      valid: allowEmpty,
      normalized: null,
      error: allowEmpty ? null : `${fieldName} is required`
    };
  }

  const identity = parseEmailIdentity(value, { allowDisplayName });
  if (!identity) {
    return {
      valid: false,
      error: `Invalid ${fieldName} format`
    };
  }

  if (enforceAllowedSenderDomain) {
    const allowedDomains = getAllowedSenderDomains();
    const emailDomain = getEmailDomain(identity.email);

    if (!allowedDomains.has(emailDomain)) {
      return {
        valid: false,
        error: `${fieldName} must use an approved sender domain`
      };
    }
  }

  return {
    valid: true,
    normalized: allowDisplayName ? formatEmailIdentity(identity) : identity.email
  };
}

export function normalizeEmailList(value, options = {}) {
  const {
    fieldName = 'emails',
    allowEmpty = true,
    maxRecipients = MAX_NOTIFICATION_RECIPIENTS
  } = options;

  if (value === undefined || value === null || value === '') {
    return {
      valid: true,
      normalized: []
    };
  }

  const candidates = Array.isArray(value) ? value : [value];
  const normalized = [];
  const seen = new Set();

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || String(candidate).trim() === '') {
      continue;
    }

    if (typeof candidate !== 'string') {
      return {
        valid: false,
        error: `${fieldName} must contain only email strings`
      };
    }

    const email = candidate.trim().toLowerCase();
    if (!validator.isEmail(email)) {
      return {
        valid: false,
        error: `Invalid ${fieldName} entry`
      };
    }

    if (!seen.has(email)) {
      seen.add(email);
      normalized.push(email);
    }
  }

  if (!allowEmpty && normalized.length === 0) {
    return {
      valid: false,
      error: `${fieldName} must contain at least one recipient`
    };
  }

  if (normalized.length > maxRecipients) {
    return {
      valid: false,
      error: `${fieldName} supports up to ${maxRecipients} recipients`
    };
  }

  return {
    valid: true,
    normalized
  };
}

export function normalizeEmailConfig(value, options = {}) {
  const { allowEmpty = true } = options;

  if (value === undefined || value === null || value === '') {
    return {
      valid: allowEmpty,
      normalized: null,
      error: allowEmpty ? null : 'email_config is required'
    };
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return {
      valid: false,
      error: 'email_config must be an object'
    };
  }

  const unknownFields = Object.keys(value).filter((key) => !EMAIL_CONFIG_FIELDS.has(key));
  if (unknownFields.length > 0) {
    return {
      valid: false,
      error: `email_config contains unsupported fields: ${unknownFields.join(', ')}`
    };
  }

  const normalizedConfig = {};

  const toResult = normalizeEmailList(value.to, {
    fieldName: 'email_config.to',
    allowEmpty: true,
    maxRecipients: MAX_NOTIFICATION_RECIPIENTS
  });
  if (!toResult.valid) {
    return toResult;
  }
  if (toResult.normalized.length > 0) {
    normalizedConfig.to = toResult.normalized;
  }

  const fromResult = normalizeSingleEmail(value.from, {
    fieldName: 'email_config.from',
    allowDisplayName: true,
    allowEmpty: true,
    enforceAllowedSenderDomain: true
  });
  if (!fromResult.valid) {
    return fromResult;
  }
  if (fromResult.normalized) {
    normalizedConfig.from = fromResult.normalized;
  }

  const replyToResult = normalizeSingleEmail(value.replyTo, {
    fieldName: 'email_config.replyTo',
    allowEmpty: true
  });
  if (!replyToResult.valid) {
    return replyToResult;
  }
  if (replyToResult.normalized) {
    normalizedConfig.replyTo = replyToResult.normalized;
  }

  if (value.subject !== undefined && value.subject !== null && value.subject !== '') {
    if (typeof value.subject !== 'string') {
      return {
        valid: false,
        error: 'email_config.subject must be a string'
      };
    }

    const subject = value.subject.trim();
    if (subject.length > MAX_EMAIL_SUBJECT_LENGTH) {
      return {
        valid: false,
        error: `email_config.subject must be ${MAX_EMAIL_SUBJECT_LENGTH} characters or less`
      };
    }

    if (/[\r\n]/.test(subject)) {
      return {
        valid: false,
        error: 'email_config.subject must not contain line breaks'
      };
    }

    if (subject) {
      normalizedConfig.subject = subject;
    }
  }

  return {
    valid: true,
    normalized: Object.keys(normalizedConfig).length > 0 ? normalizedConfig : null
  };
}

export function getSafeNotificationRecipients(formConfig = {}) {
  const candidateSources = [
    formConfig._resolved_recipients,
    formConfig.email_config?.to,
    formConfig.notification_emails,
    formConfig.notification_email
  ];

  for (const recipientsSource of candidateSources) {
    const result = normalizeEmailList(recipientsSource, {
      fieldName: 'notification recipients',
      allowEmpty: true,
      maxRecipients: MAX_NOTIFICATION_RECIPIENTS
    });

    if (result.valid && result.normalized.length > 0) {
      return result.normalized;
    }
  }

  return [];
}

export function getSafeSenderEmail(value) {
  const fromResult = normalizeSingleEmail(value, {
    fieldName: 'email_config.from',
    allowDisplayName: true,
    allowEmpty: true,
    enforceAllowedSenderDomain: true
  });

  return fromResult.valid && fromResult.normalized
    ? fromResult.normalized
    : DEFAULT_FROM_EMAIL;
}

export function getSafeReplyToEmail(value) {
  const replyToResult = normalizeSingleEmail(value, {
    fieldName: 'replyTo',
    allowEmpty: true
  });

  return replyToResult.valid ? (replyToResult.normalized || undefined) : undefined;
}

export function getDefaultSenderEmail() {
  return DEFAULT_FROM_EMAIL;
}
