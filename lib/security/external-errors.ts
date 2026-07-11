type ExternalProvider = 'KIS' | 'DART' | string;

interface ErrorLike {
  message?: unknown;
  code?: unknown;
  response?: {
    status?: unknown;
    data?: unknown;
  };
}

export interface SanitizedExternalError {
  provider: ExternalProvider;
  operation: string;
  status?: number;
  code?: string;
  message: string;
}

const SENSITIVE_KEY_PATTERN =
  /(authorization|proxy-authorization|appkey|appsecret|crtfc_key|api[_-]?key|access[_-]?token|refresh[_-]?token|bot[_-]?token|secret)/i;

function configuredSecrets(env: NodeJS.ProcessEnv) {
  return [
    env.KIS_APP_KEY,
    env.KIS_APP_SECRET,
    env.DART_API_KEY,
    env.TELEGRAM_BOT_TOKEN,
    env.TELEGRAM_WEBHOOK_SECRET,
  ].filter((value): value is string => Boolean(value && value.length >= 4));
}

export function redactSensitiveText(value: unknown, env: NodeJS.ProcessEnv = process.env) {
  let text = typeof value === 'string' ? value : String(value ?? 'Unknown external provider error');

  for (const secret of configuredSecrets(env)) {
    text = text.split(secret).join('[REDACTED]');
  }

  return text
    .replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
    .replace(
      /([?&](?:authorization|appkey|appsecret|crtfc_key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret)=)[^&#\s]*/gi,
      '$1[REDACTED]'
    )
    .replace(
      /(["']?(?:authorization|appkey|appsecret|crtfc_key|api[_-]?key|access[_-]?token|refresh[_-]?token|bot[_-]?token|secret)["']?\s*[:=]\s*["']?)[^\s,"'}&]+/gi,
      '$1[REDACTED]'
    )
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_TELEGRAM_TOKEN]');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function providerMessage(error: ErrorLike) {
  const data = asRecord(error.response?.data);
  if (data) {
    for (const key of ['message', 'msg1', 'error_description', 'error']) {
      if (!SENSITIVE_KEY_PATTERN.test(key) && typeof data[key] === 'string') return data[key];
    }
  }
  return typeof error.message === 'string' ? error.message : 'Unknown external provider error';
}

/**
 * Returns a small allowlisted log object. Axios request config, headers, body,
 * and response payload are deliberately never copied into the result.
 */
export function sanitizeExternalError(
  provider: ExternalProvider,
  operation: string,
  error: unknown,
  env: NodeJS.ProcessEnv = process.env
): SanitizedExternalError {
  const source = (error && typeof error === 'object' ? error : {}) as ErrorLike;
  const status = typeof source.response?.status === 'number' ? source.response.status : undefined;
  const responseData = asRecord(source.response?.data);
  const rawCode = responseData?.code ?? responseData?.rt_cd ?? source.code;
  const code = typeof rawCode === 'string' || typeof rawCode === 'number'
    ? redactSensitiveText(String(rawCode), env).slice(0, 120)
    : undefined;

  return {
    provider,
    operation,
    ...(status === undefined ? {} : { status }),
    ...(code ? { code } : {}),
    message: redactSensitiveText(providerMessage(source), env).slice(0, 500),
  };
}
