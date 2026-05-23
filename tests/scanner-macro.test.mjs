import assert from 'node:assert/strict';
import { passesScannerMacroPolicy } from '../lib/finance/market/macro-policy.ts';

console.log('=== Scanner Macro Tests ===\n');

{
  assert.equal(passesScannerMacroPolicy({ status: 'done', rsRating: 95 }, 'HALT', false), false);
  assert.equal(passesScannerMacroPolicy({ status: 'error', rsRating: 95 }, 'HALT', false), true);
  console.log('OK HALT blocks completed scanner candidates while keeping error rows visible');
}

{
  assert.equal(passesScannerMacroPolicy({ status: 'done', rsRating: 79 }, 'REDUCED', false), false);
  assert.equal(passesScannerMacroPolicy({ status: 'done', rsRating: 80 }, 'REDUCED', false), true);
  assert.equal(passesScannerMacroPolicy({ status: 'done', rsRating: 50 }, 'REDUCED', true), true);
  console.log('OK REDUCED compresses the view to RS 80+ unless all results are explicitly shown');
}

console.log('\n=== All Scanner Macro Tests Passed ===');
