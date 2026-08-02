import assert from 'node:assert/strict';
import {
  bandForScore,
  computeRiskBarometer,
  evaluateRiskThreshold,
  scoreToGaugeAngle,
} from '../lib/risk-barometer/model.ts';
import { extractSecFlowTtmPair } from '../lib/finance/providers/sec-edgar-api.ts';
import {
  fredQuarterEndTimestamp,
  hashRiskBarometerInputs,
} from '../lib/risk-barometer/service.ts';

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run('applies all ten v1 thresholds at the boundary', () => {
  assert.equal(evaluateRiskThreshold('sp500_concentration', 26.999), false);
  assert.equal(evaluateRiskThreshold('sp500_concentration', 27), true);
  assert.equal(evaluateRiskThreshold('household_equity_exposure', 29.999), false);
  assert.equal(evaluateRiskThreshold('household_equity_exposure', 30), true);
  assert.equal(evaluateRiskThreshold('margin_debt', 999_999_999_999), false);
  assert.equal(evaluateRiskThreshold('margin_debt', 1_000_000_000_000), true);
  assert.equal(evaluateRiskThreshold('market_participation', -9.999, { spyReturn20d: 1 }), false);
  assert.equal(evaluateRiskThreshold('market_participation', -10, { spyReturn20d: 1 }), true);
  assert.equal(evaluateRiskThreshold('market_participation', -10.001, { spyReturn20d: 0 }), false);
  assert.equal(evaluateRiskThreshold('valuation_driven_returns', 49.999), false);
  assert.equal(evaluateRiskThreshold('valuation_driven_returns', 50), true);
  assert.equal(evaluateRiskThreshold('hyperscaler_fcf', 100, { priorValue: 100 }), false);
  assert.equal(evaluateRiskThreshold('hyperscaler_fcf', 99.999, { priorValue: 100 }), true);
  assert.equal(evaluateRiskThreshold('hyperscaler_leverage', 10, {
    interestCoverage: 10,
    netDebtToMarketCapPct: 10,
  }), false);
  assert.equal(evaluateRiskThreshold('hyperscaler_leverage', 9.999, {
    interestCoverage: 9.999,
    netDebtToMarketCapPct: 10,
  }), true);
  assert.equal(evaluateRiskThreshold('hyperscaler_leverage', 10.001, {
    interestCoverage: 10,
    netDebtToMarketCapPct: 10.001,
  }), true);
  assert.equal(evaluateRiskThreshold('corporate_cross_holdings', 9.999), false);
  assert.equal(evaluateRiskThreshold('corporate_cross_holdings', 10), true);
  assert.equal(evaluateRiskThreshold('capital_market_frenzy', 0.75), false);
  assert.equal(evaluateRiskThreshold('capital_market_frenzy', 0.751), true);
  assert.equal(evaluateRiskThreshold('equity_risk_premium', 0), false);
  assert.equal(evaluateRiskThreshold('equity_risk_premium', -0.001), true);
});

const keys = [
  'sp500_concentration',
  'household_equity_exposure',
  'margin_debt',
  'market_participation',
  'valuation_driven_returns',
  'hyperscaler_fcf',
  'hyperscaler_leverage',
  'corporate_cross_holdings',
  'capital_market_frenzy',
  'equity_risk_premium',
];

function inputs(triggeredCount, count = 10, observedAt = '2026-07-28T20:00:00.000Z') {
  return keys.slice(0, count).map((key, index) => ({
    key,
    value: index + 1,
    triggered: index < triggeredCount,
    observedAt,
  }));
}

run('keeps 3 and 7 as inclusive band boundaries', () => {
  assert.equal(bandForScore(2.9), 'LOW');
  assert.equal(bandForScore(3), 'CAUTION');
  assert.equal(bandForScore(6.9), 'CAUTION');
  assert.equal(bandForScore(7), 'HIGH');
});

run('scores ten valid indicators as an integer', () => {
  const result = computeRiskBarometer(inputs(4), {
    asOf: '2026-07-28T23:59:59.000Z',
  });
  assert.equal(result.quality, 'VALID');
  assert.equal(result.score, 4);
  assert.equal(result.rawScore, 4);
  assert.deepEqual(result.coverage, { valid: 10, total: 10 });
});

run('normalizes eight or nine indicators and blocks fewer than eight', () => {
  const degraded = computeRiskBarometer(inputs(5, 8), {
    asOf: '2026-07-28T23:59:59.000Z',
  });
  assert.equal(degraded.quality, 'DEGRADED');
  assert.equal(degraded.score, 6.3);
  assert.equal(degraded.coverage.valid, 8);

  const blocked = computeRiskBarometer(inputs(7, 7), {
    asOf: '2026-07-28T23:59:59.000Z',
  });
  assert.equal(blocked.quality, 'BLOCKED');
  assert.equal(blocked.score, null);
  assert.equal(blocked.rawScore, 7);
});

run('removes stale observations from coverage instead of treating them as safe', () => {
  const rows = inputs(4);
  rows[0] = {
    ...rows[0],
    observedAt: '2026-07-20T00:00:00.000Z',
    freshnessHours: 36,
  };
  const result = computeRiskBarometer(rows, {
    asOf: '2026-07-28T23:59:59.000Z',
  });
  assert.equal(result.quality, 'DEGRADED');
  assert.equal(result.coverage.valid, 9);
  assert.equal(result.indicators[0].status, 'UNKNOWN');
  assert.equal(result.indicators[0].contribution, 0);
});

run('maps 0, 5 and 10 to the semicircle endpoints and midpoint', () => {
  assert.equal(scoreToGaugeAngle(0), -90);
  assert.equal(scoreToGaugeAngle(5), 0);
  assert.equal(scoreToGaugeAngle(10), 90);
  assert.equal(scoreToGaugeAngle(15), 90);
});

run('keeps the input hash deterministic and binds it to the freshness reference time', () => {
  const rows = inputs(4);
  const first = hashRiskBarometerInputs(rows, '2026-07-28T23:59:59.000Z');
  const reordered = hashRiskBarometerInputs([...rows].reverse(), '2026-07-28T23:59:59.000Z');
  const nextDay = hashRiskBarometerInputs(rows, '2026-07-29T23:59:59.000Z');
  assert.equal(first, reordered);
  assert.notEqual(first, nextDay);
  assert.match(first, /^[0-9a-f]{64}$/);
});

run('interprets FRED quarterly period-start labels at the corresponding quarter end', () => {
  assert.equal(
    fredQuarterEndTimestamp('2026-01-01'),
    '2026-03-31T23:59:59.000Z',
  );
  assert.equal(
    fredQuarterEndTimestamp('2026-04-01'),
    '2026-06-30T23:59:59.000Z',
  );
});

run('uses the configured SEC fallback tag when the preferred tag is absent', () => {
  const facts = {
    facts: {
      'us-gaap': {
        PaymentsToAcquireProductiveAssets: {
          units: {
            USD: [
              {
                fy: 2025,
                fp: 'FY',
                form: '10-K',
                filed: '2026-02-01',
                start: '2025-01-01',
                end: '2025-12-31',
                val: 120,
              },
              {
                fy: 2024,
                fp: 'FY',
                form: '10-K',
                filed: '2025-02-01',
                start: '2024-01-01',
                end: '2024-12-31',
                val: 100,
              },
            ],
          },
        },
      },
    },
  };
  const result = extractSecFlowTtmPair(
    facts,
    ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
    ['USD'],
  );
  assert.equal(result.current, 120);
  assert.equal(result.prior, 100);
});

console.log('risk barometer model tests passed');
