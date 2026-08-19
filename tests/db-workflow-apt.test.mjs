import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const workflowPath of [
  '../.github/workflows/db-backup.yml',
  '../.github/workflows/db-maintenance.yml',
]) {
  const workflow = readFileSync(new URL(workflowPath, import.meta.url), 'utf8');
  assert.match(
    workflow,
    /mirror\+file:\/etc\/apt\/apt-mirrors\.txt#https:\/\/archive\.ubuntu\.com\/ubuntu\/#g/,
    `${workflowPath} must bypass the unreliable Azure apt mirror`,
  );
  assert.match(
    workflow,
    /Acquire::Retries=3/,
    `${workflowPath} must bound and retry transient package-index failures`,
  );
  assert.match(
    workflow,
    /Acquire::https::Timeout=20/,
    `${workflowPath} must bound package mirror timeouts`,
  );
}

console.log('database workflow apt reliability tests passed');
