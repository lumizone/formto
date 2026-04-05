import http from 'http';
import https from 'https';
import net from 'net';
import { resolveWebhookTarget } from './validation.js';

function hasHeader(headers, headerName) {
  const normalizedHeader = headerName.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === normalizedHeader);
}

export async function sendPinnedWebhookRequest(url, options = {}) {
  const {
    method = 'POST',
    headers = {},
    body = null,
    timeoutMs = 10000,
    maxResponseBytes = 256 * 1024
  } = options;

  const resolution = await resolveWebhookTarget(url);
  if (!resolution.valid) {
    throw new Error(resolution.error || 'Invalid webhook URL');
  }

  const requestBody = body == null
    ? null
    : Buffer.isBuffer(body)
      ? body
      : Buffer.from(String(body));

  const requestHeaders = { ...headers };
  if (requestBody && !hasHeader(requestHeaders, 'content-length')) {
    requestHeaders['Content-Length'] = String(requestBody.length);
  }

  const transport = resolution.parsedUrl.protocol === 'https:' ? https : http;
  const servername = net.isIP(resolution.hostname) ? undefined : resolution.hostname;

  return new Promise((resolve, reject) => {
    let settled = false;
    let absoluteTimeout = null;

    const finalizeResolve = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(absoluteTimeout);
      resolve(value);
    };

    const finalizeReject = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(absoluteTimeout);
      reject(error);
    };

    const req = transport.request(resolution.parsedUrl, {
      method,
      headers: requestHeaders,
      lookup: (_hostname, _options, callback) => callback(null, resolution.pinnedAddress, resolution.family),
      ...(servername ? { servername } : {})
    }, (res) => {
      const status = res.statusCode || 0;

      if (status >= 300 && status < 400) {
        res.resume();
        finalizeReject(new Error('Redirects are not allowed'));
        return;
      }

      let responseSize = 0;
      res.on('data', (chunk) => {
        responseSize += chunk.length;

        if (responseSize > maxResponseBytes) {
          const responseError = new Error('Response too large');
          responseError.name = 'ResponseTooLargeError';
          res.destroy(responseError);
        }
      });
      res.on('error', finalizeReject);
      res.on('end', () => {
        finalizeResolve({
          ok: status >= 200 && status < 300,
          status,
          statusText: res.statusMessage || '',
          headers: res.headers,
          responseSize
        });
      });
    });

    absoluteTimeout = setTimeout(() => {
      const timeoutError = new Error('Request deadline exceeded');
      timeoutError.name = 'TimeoutError';
      req.destroy(timeoutError);
    }, timeoutMs);

    req.on('error', finalizeReject);
    req.setTimeout(timeoutMs, () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      req.destroy(timeoutError);
    });

    if (requestBody) {
      req.write(requestBody);
    }

    req.end();
  });
}
