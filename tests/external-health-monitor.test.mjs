import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/external-health-monitor.yml', import.meta.url), 'utf8');
const cli = readFileSync(new URL('../scripts/check-operations-health.mjs', import.meta.url), 'utf8');

assert.match(workflow, /cron:\s*'\*\/30 \* \* \* \*'/);
assert.match(workflow, /MTN_HEALTH_TOKEN:\s*\$\{\{ secrets\.MTN_HEALTH_TOKEN \}\}/);
assert.match(workflow, /check-operations-health\.mjs/);
assert.match(workflow, /actions\/cache\/restore@v4/);
assert.match(workflow, /MTN_ALERT_STATE_PATH/);
assert.match(workflow, /actions\/cache\/save@v4/);
assert.doesNotMatch(workflow, /curl[^\n]+TELEGRAM_BOT_TOKEN/);

assert.match(cli, /runHealthCheck/);
assert.match(cli, /MTN_ALERT_STATE_PATH/);
assert.match(cli, /process\.exitCode\s*=\s*1/);
assert.doesNotMatch(cli, /console\.log\([^\n]*(?:TOKEN|token)/);

console.log('external health monitor tests passed');
