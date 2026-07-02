import assert from 'node:assert/strict';
import { formatScannerTelegramMessage } from '../lib/scanner-telegram.ts';
import { chunkTelegramMessage, isSuppressedTelegramMessage, normalizeTelegramPhotos } from '../lib/telegram.ts';

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

{
  const longMessage = Array.from({ length: 80 }, (_, index) => `${index + 1}. ${'A'.repeat(90)}`).join('\n');
  const chunks = chunkTelegramMessage(longMessage, 1000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 1000));
  assert.equal(chunks.join('\n'), longMessage);
}

{
  const photos = normalizeTelegramPhotos([
    ' https://example.com/chart-a.png ',
    { imageUrl: 'https://example.com/chart-b.png', caption: 'ETF 구성 Top 15' },
    { photoUrl: '   ' },
    { src: 123 },
    null,
  ]);
  assert.deepEqual(photos, [
    { url: 'https://example.com/chart-a.png', caption: null },
    { url: 'https://example.com/chart-b.png', caption: 'ETF 구성 Top 15' },
  ]);
}

{
  assert.equal(isSuppressedTelegramMessage('🔴 *[MTN 시장 리포트: US]*'), true);
  assert.equal(isSuppressedTelegramMessage('🟢 [MTN 시장 리포트: KR]\nPowered by groq (openai/gpt-oss-120b)'), true);
  assert.equal(isSuppressedTelegramMessage('🛡️ *MTN 매크로 레짐 리포트*'), true);
  assert.equal(isSuppressedTelegramMessage('[MTN Scanner] 후보 요약'), false);
}

console.log('scanner telegram tests passed');
