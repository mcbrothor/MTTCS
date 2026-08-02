import { writeFile } from 'node:fs/promises';

const SERVICE_NAME_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;
const SSL_MODES = new Set(['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']);

function fail(message) {
  throw new Error(`PostgreSQL service file rejected: ${message}`);
}

function decode(value, label) {
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded || /[\r\n\0]/.test(decoded)) fail(`${label} is empty or contains a control character.`);
    return decoded;
  } catch (error) {
    if (error.message?.startsWith('PostgreSQL service file rejected:')) throw error;
    fail(`${label} contains invalid percent encoding.`);
  }
}

function serviceValue(value, label) {
  const normalized = String(value);
  if (!normalized || /^[ \t]|[ \t]$/.test(normalized) || /[\r\n\0#]/.test(normalized)) {
    fail(`${label} cannot be represented safely in an INI service file.`);
  }
  return normalized;
}

function passfileValue(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll(':', '\\:');
}

export function buildPgServiceArtifacts(databaseUrl, serviceName = 'mtn_backup_source') {
  if (!SERVICE_NAME_PATTERN.test(serviceName)) fail('service name is invalid.');
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail('DATABASE_URL is not a valid PostgreSQL URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) fail('only postgres:// or postgresql:// URLs are accepted.');
  if (!parsed.hostname || !parsed.username || !parsed.password) fail('host, user, and password are required.');
  if (parsed.hash) fail('URL fragments are not accepted.');

  const database = decode(parsed.pathname.replace(/^\//, ''), 'database name');
  const user = decode(parsed.username, 'database user');
  const password = decode(parsed.password, 'database password');
  const host = parsed.hostname;
  if (/[\r\n\0]/.test(host)) fail('database host contains a control character.');
  const port = parsed.port || '5432';
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) fail('database port is invalid.');
  const sslmode = parsed.searchParams.get('sslmode') || 'require';
  if (!SSL_MODES.has(sslmode)) fail('sslmode is invalid.');

  const serviceConfig = [
    `[${serviceName}]`,
    `host=${serviceValue(host, 'database host')}`,
    `port=${serviceValue(port, 'database port')}`,
    `dbname=${serviceValue(database, 'database name')}`,
    `user=${serviceValue(user, 'database user')}`,
    `sslmode=${serviceValue(sslmode, 'sslmode')}`,
    'connect_timeout=30',
    'application_name=mtn_encrypted_backup',
    '',
  ].join('\n');
  const passfile = `${[host, port, database, user, password].map(passfileValue).join(':')}\n`;
  return { serviceConfig, passfile };
}

export function buildPgServiceConfig(databaseUrl, serviceName = 'mtn_backup_source') {
  return buildPgServiceArtifacts(databaseUrl, serviceName).serviceConfig;
}

export async function writePgServiceFile({
  databaseUrl,
  outputPath,
  passfilePath,
  serviceName = 'mtn_backup_source',
}) {
  if (!passfilePath) fail('passfile output path is required.');
  const { serviceConfig, passfile } = buildPgServiceArtifacts(databaseUrl, serviceName);
  await writeFile(outputPath, serviceConfig, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await writeFile(passfilePath, passfile, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
}
