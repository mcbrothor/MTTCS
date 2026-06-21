import { spawnSync } from 'node:child_process';
import path from 'node:path';

const tests = [
  'tests/immediate-features.test.mjs',
  'tests/calculations.test.mjs',
  'tests/macro-reliability.test.mjs',
  'tests/model-governance.test.mjs',
  'tests/professional-risk.test.mjs',
  'tests/risk-gate.test.mjs',
  'tests/price-metrics.test.mjs',
  'tests/adr-presentation.test.mjs',
  'tests/toss-api.test.mjs',
  'tests/clipboard.test.mjs',
  'tests/sepa-core.test.mjs',
  'tests/vcp-engine.test.mjs',
  'tests/high-tight-flag-safety.test.mjs',
  'tests/rs-proxy.test.mjs',
  'tests/trade-metrics.test.mjs',
  'tests/position-lifecycle.test.mjs',
  'tests/live-trade-pricing.test.mjs',
  'tests/e2e-lifecycle.test.mjs',
  'tests/scanner-universes.test.mjs',
  'tests/scanner-macro.test.mjs',
  'tests/scanner-presentation.test.mjs',
  'tests/scanner-telegram.test.mjs',
  'tests/daily-screeners.test.mjs',
  'tests/daily-scanner-snapshot.test.mjs',
  'tests/daily-screener-cron.test.mjs',
  'tests/recommendation-persistence.test.mjs',
  'tests/recommendation-performance.test.mjs',
  'tests/recommendation-summary.test.mjs',
  'tests/recommendation-weekly-report.test.mjs',
  'tests/canslim-analysis.test.mjs',
  'tests/canslim-engine.test.mjs',
  'tests/canslim-pillars.test.mjs',
  'tests/modern-leader-engine.test.mjs',
  'tests/surge-score.test.mjs',
  'tests/qullamaggie-score.test.mjs',
  'tests/contest.test.mjs',
  'tests/contest-rule-engine-sir.test.mjs',
  'tests/contest-ib-prompt-sir.test.mjs',
  'tests/codex-cli-worker-utils.test.mjs',
  'tests/market-insight-router.test.mjs',
  'tests/contest-presentation.test.mjs',
  'tests/history-presentation.test.mjs',
  'tests/review-stats.test.mjs',
  'tests/portfolio-risk.test.mjs',
  'tests/trade-snapshot.test.mjs',
];

const jitiBin = path.join(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'jiti.cmd' : 'jiti',
);

for (const testFile of tests) {
  const result = spawnSync(jitiBin, [testFile], {
    stdio: 'inherit',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
