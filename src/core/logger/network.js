const FETCH_LOGGER_FLAG = '__COOKERP_FETCH_LOGGER_INSTALLED__';

const SENSITIVE_HEADER_KEYS = new Set([
  'authorization', 'cookie', 'set-cookie', 'x-api-key', 'proxy-authorization',
]);

const SENSITIVE_BODY_KEYS = new Set([
  'access_token', 'refresh_token', 'id_token', 'token', 'authorization',
  'code', 'code_verifier', 'password', 'secret', 'client_secret',
]);

function redactIfSensitive(key, value) {
  if (value == null) return value;
  return SENSITIVE_BODY_KEYS.has(String(key).toLowerCase()) ? '[REDACTED]' : value;
}

function sanitizeHeaders(headersInput) {
  if (!headersInput) return undefined;
  const sanitized = {};

  if (typeof Headers !== 'undefined' && headersInput instanceof Headers) {
    headersInput.forEach((value, key) => {
      sanitized[key] = SENSITIVE_HEADER_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : value;
    });
    return sanitized;
  }

  if (Array.isArray(headersInput)) {
    for (const [key, value] of headersInput) {
      sanitized[key] = SENSITIVE_HEADER_KEYS.has(String(key).toLowerCase()) ? '[REDACTED]' : value;
    }
    return sanitized;
  }

  for (const key of Object.keys(headersInput)) {
    sanitized[key] = SENSITIVE_HEADER_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : headersInput[key];
  }
  return sanitized;
}

function sanitizeBody(body, contentType) {
  if (!body) return undefined;
  if (typeof body !== 'string') return '[NON_TEXT_BODY]';

  const ct = (contentType || '').toLowerCase();

  if (ct.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(body);
    const sanitized = {};
    for (const [key, value] of params.entries()) sanitized[key] = redactIfSensitive(key, value);
    return sanitized;
  }

  if (ct.includes('application/json')) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object') {
        const sanitized = {};
        for (const key of Object.keys(parsed)) sanitized[key] = redactIfSensitive(key, parsed[key]);
        return sanitized;
      }
    } catch {
      return '[UNPARSABLE_JSON_BODY]';
    }
  }

  return '[TEXT_BODY_OMITTED]';
}

function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_BODY_KEYS.has(key.toLowerCase())) parsed.searchParams.set(key, '[REDACTED]');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function installNetworkLogger() {
  if (globalThis[FETCH_LOGGER_FLAG]) return;

  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== 'function') return;

  globalThis.fetch = async (input, init = {}) => {
    const startedAt = Date.now();
    const requestUrl = typeof input === 'string' ? input : input?.url;
    const method = init.method || (typeof input !== 'string' && input?.method) || 'GET';
    const headers = init.headers || (typeof input !== 'string' ? input?.headers : undefined);
    const contentType = headers && typeof headers === 'object'
      ? headers['Content-Type'] || headers['content-type']
      : undefined;

    console.log('[API][REQ]', {
      method,
      url: sanitizeUrl(requestUrl || ''),
      headers: sanitizeHeaders(headers),
      body: sanitizeBody(init.body, contentType),
    });

    try {
      const response = await originalFetch(input, init);
      console.log('[API][RES]', {
        method,
        url: sanitizeUrl(requestUrl || ''),
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      console.log('[API][ERR]', {
        method,
        url: sanitizeUrl(requestUrl || ''),
        durationMs: Date.now() - startedAt,
        message: error?.message || 'Unknown network error',
      });
      throw error;
    }
  };

  globalThis[FETCH_LOGGER_FLAG] = true;
}
