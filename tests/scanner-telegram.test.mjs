import assert from 'node:assert/strict';
import { formatScannerTelegramMessage } from '../lib/scanner-telegram.ts';

{
  const message = formatScannerTelegramMessage({
    source: 'minervini',
    universe: 'NASDAQ100',
    generatedAt: new Date('2026-05-06T00:00:00.000Z'),
    candidates: [
      {
        ticker: 'NVDA',
        name: 'Nvidia Corp',
        recommendationTier: 'Recommended',
        rsRating: 96,
        vcpScore: 82,
        vcpGrade: 'strong',
        distanceToPivotPct: -1.2,
        recommendationReason: 'SEPA pass and valid VCP pivot',
      },
    ],
  });
  assert.match(message, /Minervini SEPA\/VCP/);
  assert.match(message, /NVDA/);
  assert.match(message, /VCP 82/);
}

{
  const message = formatScannerTelegramMessage({
    source: 'canslim',
    universe: 'SP500',
    candidates: [{ ticker: 'MSFT', dualTier: 'TIER_1', pass: true, confidence: 'HIGH', rsRating: 91 }],
  });
  assert.match(message, /O'Neil CANSLIM/);
  assert.match(message, /TIER\\_1|TIER_1/);
  assert.match(message, /MSFT/);
}

console.log('scanner telegram tests passed');
