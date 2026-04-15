/**
 * 환경변수 검증 유틸리티
 * - 필수 환경변수 누락 시 명확한 에러 메시지를 출력합니다.
 * - Non-null assertion(!) 대신 이 모듈을 통해 안전하게 접근합니다.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[MTN] 필수 환경변수 "${name}"이(가) 설정되지 않았습니다. .env.local 파일을 확인하세요.`
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

// --- Supabase ---

export function supabaseUrl(): string {
  return required('NEXT_PUBLIC_SUPABASE_URL');
}

export function supabaseAnonKey(): string {
  return required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export function supabaseServiceRoleKey(): string {
  return required('SUPABASE_SERVICE_ROLE_KEY');
}

// --- KIS API ---

export function kisAppKey(): string {
  return required('KIS_APP_KEY');
}

export function kisAppSecret(): string {
  return required('KIS_APP_SECRET');
}

export function kisBaseUrl(): string {
  return optional('KIS_BASE_URL', 'https://openapi.koreainvestment.com:9443');
}

// --- Telegram ---

export function telegramBotToken(): string {
  return required('TELEGRAM_BOT_TOKEN');
}

export function telegramAllowedChatIds(): string[] {
  return optional('TELEGRAM_ALLOWED_CHAT_IDS', '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function telegramWebhookSecret(): string {
  return optional('TELEGRAM_WEBHOOK_SECRET', '');
}

// --- SEC ---

export function secUserAgent(): string {
  return optional('SEC_USER_AGENT', 'MTN/4.0 contact@mtn.local');
}
