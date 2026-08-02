#!/usr/bin/env node

import { writePgServiceFile } from './lib/pg-service-file.mjs';

const outputPath = process.argv[2];
const passfilePath = process.argv[3];
const serviceName = process.argv[4] || 'mtn_backup_source';
if (!outputPath || !passfilePath) {
  process.stderr.write('Usage: write-pg-service-file.mjs SERVICE_OUTPUT_PATH PASSFILE_OUTPUT_PATH [SERVICE_NAME]\n');
  process.exit(2);
}

try {
  await writePgServiceFile({
    databaseUrl: process.env.MTN_PG_SERVICE_DATABASE_URL,
    outputPath,
    passfilePath,
    serviceName,
  });
} catch (error) {
  process.stderr.write(`${error.message || String(error)}\n`);
  process.exit(1);
}
