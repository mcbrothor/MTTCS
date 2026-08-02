import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  BACKUP_HARD_CAP_BYTES,
  RETENTION_APPLY_CONFIRMATION,
  assertRetentionApplyAuthorized,
  inspectEncryptedBackupFile,
  planBackupRetention,
  validateBackupKey,
  validateR2Environment,
} from "../scripts/backup-r2-retention-lib.mjs";
import {
  createAwsCliR2Client,
  parseBackupRetentionArgs,
  runBackupRetentionCommand,
} from "../scripts/r2-backup-retention.mjs";

const prefix = "mtn/supabase/";
const temporaryRoots = [];

function keyFor(date, suffix = "") {
  const stamp = date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(".000", "");
  return `${prefix}mtn-public-${stamp}${suffix}.dump.age`;
}

function objectFor(date, size = 100, suffix = "") {
  return { Key: keyFor(date, suffix), Size: size };
}

function expectFailure(action, pattern, forbiddenValues = []) {
  assert.throws(action, (error) => {
    assert.match(error.message, pattern);
    for (const value of forbiddenValues)
      assert.doesNotMatch(error.message, new RegExp(value));
    return true;
  });
}

try {
  assert.equal(
    validateBackupKey(
      "mtn/supabase/mtn-public-20260802T123456Z.dump.age",
      prefix,
    ).timestamp,
    "2026-08-02T12:34:56.000Z",
  );
  for (const unsafeKey of [
    "mtn/supabase/mtn-public-20260802T123456Z.dump",
    "mtn/supabase/mtn-public-20260802T123456Z.dump.age.sha256",
    "mtn/supabase/age-secret-key.txt",
    "other/mtn-public-20260802T123456Z.dump.age",
    "mtn/supabase/../mtn-public-20260802T123456Z.dump.age",
  ]) {
    expectFailure(
      () => validateBackupKey(unsafeKey, prefix),
      /refus|unexpected|ciphertext/i,
    );
  }

  const manyObjects = [];
  const newestDate = new Date("2026-08-02T23:00:00.000Z");
  for (let day = 0; day < 400; day += 1) {
    const recent = new Date(newestDate.getTime() - day * 86_400_000);
    const olderSameDay = new Date(recent.getTime() - 3_600_000);
    manyObjects.push(objectFor(olderSameDay, 100), objectFor(recent, 110));
  }
  const forwardPlan = planBackupRetention({ objects: manyObjects, prefix });
  const reversePlan = planBackupRetention({
    objects: [...manyObjects].reverse(),
    prefix,
  });
  assert.equal(forwardPlan.tierSelections.daily.length, 7);
  assert.equal(forwardPlan.tierSelections.weekly.length, 8);
  assert.equal(forwardPlan.tierSelections.monthly.length, 12);
  assert.deepEqual(reversePlan.tierSelections, forwardPlan.tierSelections);
  assert.deepEqual(reversePlan.deleteKeys, forwardPlan.deleteKeys);
  assert.equal(forwardPlan.tierSelections.daily[0], keyFor(newestDate));

  const existing = objectFor(
    new Date("2026-08-01T12:00:00.000Z"),
    BACKUP_HARD_CAP_BYTES - 200,
  );
  const candidate = objectFor(new Date("2026-08-02T12:00:00.000Z"), 200);
  const atCap = planBackupRetention({
    objects: [existing],
    newObject: candidate,
    prefix,
  });
  assert.equal(atCap.projectedBytes, BACKUP_HARD_CAP_BYTES);
  expectFailure(
    () =>
      planBackupRetention({
        objects: [existing],
        newObject: { ...candidate, Size: 201 },
        prefix,
      }),
    /hard cap/i,
  );
  expectFailure(
    () =>
      planBackupRetention({
        objects: [existing],
        newObject: { ...existing },
        prefix,
      }),
    /already exists/i,
  );

  const goodEnvironment = {
    R2_ENDPOINT_URL:
      "https://0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com",
    R2_BUCKET_NAME: "mtn-backups",
    R2_BACKUP_PREFIX: prefix,
    R2_ACCESS_KEY_ID: "access-id-value",
    R2_SECRET_ACCESS_KEY: "secret-value-that-must-never-print",
  };
  const safeConfig = validateR2Environment(goodEnvironment);
  assert.equal(safeConfig.region, "auto");
  assert.equal(safeConfig.bucket, "mtn-backups");
  assert.equal(safeConfig.prefix, prefix);
  assert.equal(
    validateR2Environment({ ...goodEnvironment, R2_SESSION_TOKEN: "" })
      .credentials.sessionToken,
    undefined,
  );
  for (const unsafeEndpoint of [
    "http://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    "https://s3.amazonaws.com",
    "https://user:pass@0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
  ]) {
    expectFailure(
      () =>
        validateR2Environment({
          ...goodEnvironment,
          R2_ENDPOINT_URL: unsafeEndpoint,
        }),
      /R2_ENDPOINT_URL/i,
      [goodEnvironment.R2_ACCESS_KEY_ID, goodEnvironment.R2_SECRET_ACCESS_KEY],
    );
  }
  expectFailure(
    () =>
      validateR2Environment({
        ...goodEnvironment,
        R2_BACKUP_PREFIX: "../backups/",
      }),
    /R2_BACKUP_PREFIX/i,
  );

  assert.equal(
    assertRetentionApplyAuthorized({ applyRequested: false, env: {} }),
    false,
  );
  expectFailure(
    () => assertRetentionApplyAuthorized({ applyRequested: true, env: {} }),
    /APPLY_BACKUP_RETENTION/i,
  );
  assert.equal(
    assertRetentionApplyAuthorized({
      applyRequested: true,
      env: { APPLY_BACKUP_RETENTION: RETENTION_APPLY_CONFIRMATION },
    }),
    true,
  );

  const root = await mkdtemp(path.join(tmpdir(), "mtn-r2-retention-test-"));
  temporaryRoots.push(root);
  const encryptedPath = path.join(root, "mtn-public-20260802T123456Z.dump.age");
  await writeFile(
    encryptedPath,
    "age-encryption.org/v1\n-> X25519 test\n--- test\nciphertext",
  );
  const inspected = await inspectEncryptedBackupFile(encryptedPath, prefix);
  assert.equal(inspected.key, `${prefix}${path.basename(encryptedPath)}`);
  assert.ok(inspected.size > 0);

  const plaintextPath = path.join(root, "mtn-public-20260802T123457Z.dump.age");
  await writeFile(plaintextPath, "PGDMP plaintext custom dump");
  await assert.rejects(
    () => inspectEncryptedBackupFile(plaintextPath, prefix),
    /valid age ciphertext/i,
  );
  const keyFilePath = path.join(root, "mtn-public-20260802T123458Z.dump.age");
  await writeFile(keyFilePath, "AGE-SECRET-KEY-1EXAMPLE");
  await assert.rejects(
    () => inspectEncryptedBackupFile(keyFilePath, prefix),
    /key material|valid age ciphertext/i,
  );

  assert.deepEqual(
    parseBackupRetentionArgs(["plan-upload", `--file=${encryptedPath}`]),
    { command: "plan-upload", file: encryptedPath, applyRetention: false },
  );
  expectFailure(
    () => parseBackupRetentionArgs(["unknown"]),
    /unknown command/i,
  );
  expectFailure(
    () =>
      parseBackupRetentionArgs([
        "retention",
        "--apply-retention",
        "--file=nope",
      ]),
    /does not accept --file/i,
  );

  const calls = [];
  const output = [];
  const emptyClient = {
    async listObjects() {
      calls.push({ operation: "list" });
      return [];
    },
    async putObject(_config, input) {
      calls.push({ operation: "put", ...input });
    },
    async deleteObject(_config, key) {
      calls.push({ operation: "delete", key });
    },
  };
  const planReport = await runBackupRetentionCommand({
    argv: ["plan-upload", `--file=${encryptedPath}`],
    env: goodEnvironment,
    client: emptyClient,
    writeOutput: (value) => output.push(value),
  });
  assert.equal(planReport.action, "plan-upload");
  assert.deepEqual(
    calls.map((call) => call.operation),
    ["list"],
  );

  const uploadReport = await runBackupRetentionCommand({
    argv: ["upload", `--file=${encryptedPath}`],
    env: goodEnvironment,
    client: emptyClient,
    writeOutput: (value) => output.push(value),
  });
  assert.equal(uploadReport.action, "uploaded");
  assert.equal(calls.at(-1).operation, "put");
  assert.equal(calls.at(-1).key, `${prefix}${path.basename(encryptedPath)}`);

  let overCapUploadAttempted = false;
  await assert.rejects(
    () =>
      runBackupRetentionCommand({
        argv: ["upload", `--file=${encryptedPath}`],
        env: goodEnvironment,
        client: {
          async listObjects() {
            return [
              objectFor(
                new Date("2026-08-01T12:00:00.000Z"),
                BACKUP_HARD_CAP_BYTES,
              ),
            ];
          },
          async putObject() {
            overCapUploadAttempted = true;
          },
          async deleteObject() {
            throw new Error("unexpected delete");
          },
        },
        writeOutput: (value) => output.push(value),
      }),
    /hard cap/i,
  );
  assert.equal(
    overCapUploadAttempted,
    false,
    "hard-cap failure must occur before put-object",
  );

  const retentionCalls = [];
  const retentionClient = {
    async listObjects() {
      retentionCalls.push({ operation: "list" });
      return manyObjects;
    },
    async putObject() {
      throw new Error("unexpected upload");
    },
    async deleteObject(_config, key) {
      retentionCalls.push({ operation: "delete", key });
    },
  };
  const dryRunReport = await runBackupRetentionCommand({
    argv: ["retention"],
    env: goodEnvironment,
    client: retentionClient,
    writeOutput: (value) => output.push(value),
  });
  assert.equal(dryRunReport.dryRun, true);
  assert.ok(dryRunReport.deleteKeys.length > 0);
  assert.equal(
    retentionCalls.some((call) => call.operation === "delete"),
    false,
  );
  await assert.rejects(
    () =>
      runBackupRetentionCommand({
        argv: ["retention", "--apply-retention"],
        env: goodEnvironment,
        client: retentionClient,
        writeOutput: (value) => output.push(value),
      }),
    /APPLY_BACKUP_RETENTION/i,
  );
  const applyReport = await runBackupRetentionCommand({
    argv: ["retention", "--apply-retention"],
    env: {
      ...goodEnvironment,
      APPLY_BACKUP_RETENTION: RETENTION_APPLY_CONFIRMATION,
    },
    client: retentionClient,
    writeOutput: (value) => output.push(value),
  });
  assert.equal(applyReport.dryRun, false);
  assert.equal(applyReport.deletedCount, applyReport.deleteKeys.length);
  assert.ok(
    retentionCalls.filter((call) => call.operation === "delete").length > 0,
  );

  let unsafeDeleteAttempted = false;
  await assert.rejects(
    () =>
      runBackupRetentionCommand({
        argv: ["retention", "--apply-retention"],
        env: {
          ...goodEnvironment,
          APPLY_BACKUP_RETENTION: RETENTION_APPLY_CONFIRMATION,
        },
        client: {
          async listObjects() {
            return [
              {
                Key: `${prefix}mtn-public-20260802T123456Z.dump.age.sha256`,
                Size: 64,
              },
            ];
          },
          async putObject() {
            throw new Error("unexpected upload");
          },
          async deleteObject() {
            unsafeDeleteAttempted = true;
          },
        },
        writeOutput: (value) => output.push(value),
      }),
    /only canonical .*\.dump\.age ciphertext/i,
  );
  assert.equal(
    unsafeDeleteAttempted,
    false,
    "unexpected keys must block retention before delete-object",
  );

  const emittedOutput = output.join("\n");
  assert.doesNotMatch(
    emittedOutput,
    new RegExp(goodEnvironment.R2_ACCESS_KEY_ID),
  );
  assert.doesNotMatch(
    emittedOutput,
    new RegExp(goodEnvironment.R2_SECRET_ACCESS_KEY),
  );

  const originalPath = process.env.PATH;
  process.env.PATH = "/mtn-test-no-executables";
  try {
    await assert.rejects(
      () => createAwsCliR2Client().listObjects(safeConfig),
      (error) => {
        assert.match(error.message, /credential values are suppressed/i);
        assert.doesNotMatch(
          error.message,
          new RegExp(goodEnvironment.R2_ACCESS_KEY_ID),
        );
        assert.doesNotMatch(
          error.message,
          new RegExp(goodEnvironment.R2_SECRET_ACCESS_KEY),
        );
        return true;
      },
    );
  } finally {
    process.env.PATH = originalPath;
  }

  console.log("R2 backup retention tests passed");
} finally {
  await Promise.all(
    temporaryRoots.map((root) => rm(root, { recursive: true, force: true })),
  );
}
