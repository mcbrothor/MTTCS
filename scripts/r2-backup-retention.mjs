#!/usr/bin/env node

import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  assertRetentionApplyAuthorized,
  inspectEncryptedBackupFile,
  planBackupRetention,
  validateBackupKey,
  validateR2Environment,
} from "./backup-r2-retention-lib.mjs";

const execFileAsync = promisify(execFile);
const COMMANDS = new Set(["plan-upload", "upload", "retention"]);

function fail(message) {
  throw new Error(`R2 backup retention failed: ${message}`);
}

export function parseBackupRetentionArgs(argv) {
  if (!Array.isArray(argv) || argv.length === 0 || !COMMANDS.has(argv[0])) {
    fail("Unknown command; use plan-upload, upload, or retention.");
  }
  const options = {
    command: argv[0],
    applyRetention: false,
  };
  for (const argument of argv.slice(1)) {
    if (argument === "--apply-retention") {
      if (options.applyRetention)
        fail("--apply-retention may only be provided once.");
      options.applyRetention = true;
    } else if (argument.startsWith("--file=")) {
      if (options.file !== undefined) fail("--file may only be provided once.");
      options.file = argument.slice("--file=".length);
      if (!options.file) fail("--file requires a path.");
    } else {
      fail(`Unknown option for ${options.command}.`);
    }
  }
  if (options.command === "retention") {
    if (options.file !== undefined)
      fail("The retention command does not accept --file.");
  } else {
    if (!options.file)
      fail(`${options.command} requires --file=<ciphertext.dump.age>.`);
    if (options.applyRetention)
      fail("--apply-retention is only valid with the retention command.");
  }
  return options;
}

function awsEnvironment(config) {
  const childEnvironment = {
    ...process.env,
    AWS_ACCESS_KEY_ID: config.credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: config.credentials.secretAccessKey,
    AWS_DEFAULT_REGION: config.region,
    AWS_REGION: config.region,
    AWS_EC2_METADATA_DISABLED: "true",
    AWS_PAGER: "",
    AWS_REQUEST_CHECKSUM_CALCULATION: "WHEN_REQUIRED",
    AWS_RESPONSE_CHECKSUM_VALIDATION: "WHEN_REQUIRED",
  };
  if (config.credentials.sessionToken) {
    childEnvironment.AWS_SESSION_TOKEN = config.credentials.sessionToken;
  } else {
    delete childEnvironment.AWS_SESSION_TOKEN;
  }
  return childEnvironment;
}

async function executeAws(config, operation, args) {
  try {
    return await execFileAsync(
      "aws",
      [
        "s3api",
        operation,
        ...args,
        "--endpoint-url",
        config.endpoint,
        "--region",
        config.region,
        "--no-cli-pager",
        "--output",
        "json",
      ],
      {
        env: awsEnvironment(config),
        maxBuffer: 20_000_000,
      },
    );
  } catch (error) {
    const exitCode = Number.isInteger(error?.code)
      ? ` (exit ${error.code})`
      : "";
    fail(
      `S3-compatible R2 ${operation} operation failed${exitCode}; credential values are suppressed.`,
    );
  }
}

export function createAwsCliR2Client() {
  return {
    async listObjects(config) {
      const result = await executeAws(config, "list-objects-v2", [
        "--bucket",
        config.bucket,
      ]);
      let payload;
      try {
        payload = JSON.parse(result.stdout || "{}");
      } catch {
        fail("S3-compatible R2 list-objects-v2 returned invalid JSON.");
      }
      if (payload.IsTruncated === true) {
        fail(
          "R2 object inventory is truncated; refusing a partial retention plan.",
        );
      }
      if (payload.Contents !== undefined && !Array.isArray(payload.Contents)) {
        fail("R2 object inventory has an unexpected Contents shape.");
      }
      return payload.Contents || [];
    },

    async putObject(config, { filePath, key }) {
      validateBackupKey(key, config.prefix);
      await executeAws(config, "put-object", [
        "--bucket",
        config.bucket,
        "--key",
        key,
        "--body",
        filePath,
        "--content-type",
        "application/octet-stream",
        "--if-none-match",
        "*",
      ]);
    },

    async deleteObject(config, key) {
      validateBackupKey(key, config.prefix);
      await executeAws(config, "delete-object", [
        "--bucket",
        config.bucket,
        "--key",
        key,
      ]);
    },
  };
}

function retentionReport(plan) {
  return {
    tierSelections: plan.tierSelections,
    retainedCount: plan.retained.length,
    deleteKeys: plan.deleteKeys,
    storedBytesAfterRetention: plan.storedBytesAfterRetention,
  };
}

export async function runBackupRetentionCommand({
  argv,
  env = process.env,
  client = createAwsCliR2Client(),
  writeOutput = (value) => process.stdout.write(value),
} = {}) {
  const options = parseBackupRetentionArgs(argv);
  const config = validateR2Environment(env);

  if (options.command === "retention") {
    const applyAuthorized = assertRetentionApplyAuthorized({
      applyRequested: options.applyRetention,
      env,
    });
    const objects = await client.listObjects(config);
    const plan = planBackupRetention({ objects, prefix: config.prefix });
    if (applyAuthorized) {
      for (const key of plan.deleteKeys) {
        validateBackupKey(key, config.prefix);
        await client.deleteObject(config, key);
      }
    }
    const report = {
      schemaVersion: 1,
      action: applyAuthorized ? "retention-applied" : "retention-dry-run",
      dryRun: !applyAuthorized,
      hardCapBytes: plan.hardCapBytes,
      existingBytes: plan.existingBytes,
      overHardCap: plan.overHardCap,
      ...retentionReport(plan),
      deletedCount: applyAuthorized ? plan.deleteKeys.length : 0,
    };
    writeOutput(`${JSON.stringify(report, null, 2)}\n`);
    return report;
  }

  const inspected = await inspectEncryptedBackupFile(
    options.file,
    config.prefix,
  );
  const objects = await client.listObjects(config);
  const plan = planBackupRetention({
    objects,
    newObject: { Key: inspected.key, Size: inspected.size },
    prefix: config.prefix,
  });
  if (options.command === "upload") {
    await client.putObject(config, inspected);
  }
  const report = {
    schemaVersion: 1,
    action: options.command === "upload" ? "uploaded" : "plan-upload",
    key: inspected.key,
    hardCapBytes: plan.hardCapBytes,
    existingBytes: plan.existingBytes,
    uploadBytes: plan.newBytes,
    projectedBytes: plan.projectedBytes,
    ...retentionReport(plan),
  };
  writeOutput(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

const isEntrypoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runBackupRetentionCommand({ argv: process.argv.slice(2) }).catch((error) => {
    process.stderr.write(`${error.message || String(error)}\n`);
    process.exitCode = 1;
  });
}
