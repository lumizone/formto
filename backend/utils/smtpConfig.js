// Older saves encoded the JSONB value twice. Accept those rows until resaved.
export function normalizeSmtpConfig(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function maskSmtpConfig(value) {
  const config = normalizeSmtpConfig(value);
  return config?.pass ? { ...config, pass: '••••••••' } : config;
}
