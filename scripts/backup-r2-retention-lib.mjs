import { lstat, open } from "node:fs/promises";
import path from "node:path";

export const BACKUP_HARD_CAP_BYTES = 8_000_000_000;
export const RETENTION_LIMITS = Object.freeze({
  daily: 7,
  weekly: 8,
  monthly: 12,
});
export const RETENTION_APPLY_CONFIRMATION = "DELETE_EXPIRED_CIPHERTEXT";

const AGE_HEADER = "age-encryption.org/v1\n";
const BACKUP_BASENAME_PATTERN = /^mtn-public-(\d{8}T\d{6}Z)\.dump\.age$/;
const R2_ENDPOINT_HOST_PATTERN =
  /^[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/;

function fail(message) {
  throw new Error(`R2 backup retention failed: ${message}`);
}

function validatePrefix(prefix) {
  if (
    typeof prefix !== "string" ||
    prefix.length < 2 ||
    prefix.length > 256 ||
    prefix.startsWith("/") ||
    !prefix.endsWith("/") ||
    prefix.includes("//")
  ) {
    fail(
      "R2_BACKUP_PREFIX must be a relative, non-empty prefix ending in one slash.",
    );
  }
  const segments = prefix.slice(0, -1).split("/");
  if (
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        !/^[a-z0-9][a-z0-9._-]*$/.test(segment),
    )
  ) {
    fail("R2_BACKUP_PREFIX contains an unsafe path segment.");
  }
  return prefix;
}

function parseStamp(stamp) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);
  if (!match) fail("Backup key contains an invalid UTC timestamp.");
  const timestamp = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    ),
  );
  const canonical = timestamp
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(".000", "");
  if (canonical !== stamp)
    fail("Backup key contains a non-canonical UTC timestamp.");
  return timestamp;
}

export function validateBackupKey(key, prefix) {
  const safePrefix = validatePrefix(prefix);
  if (typeof key !== "string" || !key.startsWith(safePrefix)) {
    fail(
      "Refusing an unexpected R2 object key outside the configured backup prefix.",
    );
  }
  const basename = key.slice(safePrefix.length);
  if (basename.includes("/") || basename.includes("..")) {
    fail("Refusing an unexpected R2 object key with an unsafe path.");
  }
  const match = BACKUP_BASENAME_PATTERN.exec(basename);
  if (!match) {
    fail(
      "Refusing an unexpected object; only canonical mtn-public-*.dump.age ciphertext is allowed.",
    );
  }
  const date = parseStamp(match[1]);
  return {
    key,
    basename,
    date,
    timestamp: date.toISOString(),
  };
}

function normalizeSize(size, label) {
  const numeric = typeof size === "number" ? size : Number(size);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    fail(`${label} must have a positive integer byte size.`);
  }
  return numeric;
}

function normalizeObject(object, prefix, label) {
  if (!object || typeof object !== "object")
    fail(`${label} must be an object.`);
  const key = object.Key ?? object.key;
  const size = object.Size ?? object.size;
  return {
    ...validateBackupKey(key, prefix),
    size: normalizeSize(size, label),
  };
}

function isoWeekKey(date) {
  const thursday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((thursday - yearStart) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function selectTier(sortedObjects, limit, bucketFor) {
  const selected = [];
  const buckets = new Set();
  for (const object of sortedObjects) {
    const bucket = bucketFor(object.date);
    if (buckets.has(bucket)) continue;
    buckets.add(bucket);
    selected.push(object.key);
    if (selected.length === limit) break;
  }
  return selected;
}

export function planBackupRetention({
  objects,
  newObject,
  prefix,
  hardCapBytes = BACKUP_HARD_CAP_BYTES,
  limits = RETENTION_LIMITS,
} = {}) {
  validatePrefix(prefix);
  if (!Array.isArray(objects)) fail("R2 object inventory must be an array.");
  if (!Number.isSafeInteger(hardCapBytes) || hardCapBytes <= 0) {
    fail("The backup hard cap must be a positive integer byte count.");
  }
  for (const tier of ["daily", "weekly", "monthly"]) {
    if (!Number.isInteger(limits?.[tier]) || limits[tier] < 0) {
      fail(`Retention limit ${tier} must be a non-negative integer.`);
    }
  }

  const existing = objects.map((object, index) =>
    normalizeObject(object, prefix, `R2 object #${index + 1}`),
  );
  const existingKeys = new Set();
  for (const object of existing) {
    if (existingKeys.has(object.key))
      fail("R2 object inventory contains a duplicate key.");
    existingKeys.add(object.key);
  }

  const candidate = newObject
    ? normalizeObject(newObject, prefix, "New backup object")
    : null;
  if (candidate && existingKeys.has(candidate.key)) {
    fail(
      "The new backup object key already exists; refusing to overwrite ciphertext.",
    );
  }
  const existingBytes = existing.reduce(
    (total, object) => total + object.size,
    0,
  );
  if (!Number.isSafeInteger(existingBytes))
    fail("R2 object inventory byte total exceeds safe integer precision.");
  const newBytes = candidate?.size ?? 0;
  const projectedBytes = existingBytes + newBytes;
  if (!Number.isSafeInteger(projectedBytes))
    fail("Projected R2 byte total exceeds safe integer precision.");
  if (candidate && projectedBytes > hardCapBytes) {
    fail(
      `Projected ciphertext storage exceeds the ${hardCapBytes}-byte hard cap before upload.`,
    );
  }

  const inventory = candidate ? [...existing, candidate] : existing;
  const sorted = [...inventory].sort((left, right) => {
    const timeDifference = right.date.getTime() - left.date.getTime();
    return timeDifference || left.key.localeCompare(right.key);
  });
  const tierSelections = {
    daily: selectTier(sorted, limits.daily, (date) =>
      date.toISOString().slice(0, 10),
    ),
    weekly: selectTier(sorted, limits.weekly, isoWeekKey),
    monthly: selectTier(sorted, limits.monthly, (date) =>
      date.toISOString().slice(0, 7),
    ),
  };
  const retainedKeys = new Set(Object.values(tierSelections).flat());
  if (candidate && !retainedKeys.has(candidate.key)) {
    fail(
      "The new backup would not enter any retention tier; refusing an immediately expired upload.",
    );
  }
  const retained = sorted
    .filter((object) => retainedKeys.has(object.key))
    .map((object) => ({
      key: object.key,
      size: object.size,
      timestamp: object.timestamp,
      tiers: Object.entries(tierSelections)
        .filter(([, keys]) => keys.includes(object.key))
        .map(([tier]) => tier),
    }));
  const deleteKeys = existing
    .filter((object) => !retainedKeys.has(object.key))
    .map((object) => object.key)
    .sort((left, right) => left.localeCompare(right));

  return {
    hardCapBytes,
    existingBytes,
    newBytes,
    projectedBytes,
    overHardCap: projectedBytes > hardCapBytes,
    tierSelections,
    retained,
    deleteKeys,
    storedBytesAfterRetention: retained.reduce(
      (total, object) => total + object.size,
      0,
    ),
  };
}

function requireEnvironmentValue(env, name) {
  const value = env?.[name];
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    /[\r\n\0]/.test(value)
  ) {
    fail(
      `${name} is required and must not contain surrounding whitespace or control characters.`,
    );
  }
  return value;
}

export function validateR2Environment(env = process.env) {
  const endpointValue = requireEnvironmentValue(env, "R2_ENDPOINT_URL");
  const bucket = requireEnvironmentValue(env, "R2_BUCKET_NAME");
  const prefix = validatePrefix(
    requireEnvironmentValue(env, "R2_BACKUP_PREFIX"),
  );
  const accessKeyId = requireEnvironmentValue(env, "R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnvironmentValue(env, "R2_SECRET_ACCESS_KEY");
  let endpoint;
  try {
    endpoint = new URL(endpointValue);
  } catch {
    fail("R2_ENDPOINT_URL must be a valid Cloudflare R2 S3 endpoint.");
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port ||
    endpoint.pathname !== "/" ||
    endpoint.search ||
    endpoint.hash ||
    !R2_ENDPOINT_HOST_PATTERN.test(endpoint.hostname)
  ) {
    fail(
      "R2_ENDPOINT_URL must be an HTTPS Cloudflare R2 S3 endpoint without credentials or extra path data.",
    );
  }
  if (
    bucket.length < 3 ||
    bucket.length > 64 ||
    !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket) ||
    bucket.includes("..")
  ) {
    fail("R2_BUCKET_NAME must be a safe 3-64 character bucket name.");
  }
  const sessionToken = env.R2_SESSION_TOKEN || undefined;
  if (sessionToken !== undefined)
    requireEnvironmentValue(env, "R2_SESSION_TOKEN");
  return {
    endpoint: endpoint.origin,
    bucket,
    prefix,
    region: "auto",
    credentials: {
      accessKeyId,
      secretAccessKey,
      sessionToken: sessionToken || undefined,
    },
  };
}

export function assertRetentionApplyAuthorized({
  applyRequested,
  env = process.env,
} = {}) {
  if (!applyRequested) return false;
  if (env.APPLY_BACKUP_RETENTION !== RETENTION_APPLY_CONFIRMATION) {
    fail(
      `Deletion requires APPLY_BACKUP_RETENTION=${RETENTION_APPLY_CONFIRMATION}.`,
    );
  }
  return true;
}

export async function inspectEncryptedBackupFile(filePath, prefix) {
  if (typeof filePath !== "string" || filePath.length === 0)
    fail("An encrypted backup file path is required.");
  const metadata = await lstat(filePath).catch(() => null);
  if (
    !metadata ||
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size <= 0
  ) {
    fail(
      "Backup input must be a non-empty regular file and not a symbolic link.",
    );
  }
  const key = `${validatePrefix(prefix)}${path.basename(filePath)}`;
  validateBackupKey(key, prefix);
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(4_096);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead).toString("utf8");
    if (/AGE-SECRET-KEY-/i.test(header)) {
      fail("Refusing backup input containing age key material.");
    }
    if (
      !header.startsWith(AGE_HEADER) ||
      !header.includes("\n-> ") ||
      !header.includes("\n--- ")
    ) {
      fail(
        "Backup input is not valid age ciphertext; refusing plaintext or an unexpected file type.",
      );
    }
  } finally {
    await handle.close();
  }
  return {
    filePath: path.resolve(filePath),
    key,
    size: metadata.size,
  };
}
