import assert from 'node:assert/strict';
import {
  buildCodexIbPrompt,
  parseCodexCliOutput,
  parseIbResponse,
} from '../scripts/lib/codex-cli-worker-utils.mjs';

{
  const prompt = buildCodexIbPrompt('MTN source prompt');
  assert.match(prompt, /Do not edit files/);
  assert.match(prompt, /<mtn_ib_prompt>/);
  assert.match(prompt, /MTN source prompt/);
}

{
  const result = parseCodexCliOutput(JSON.stringify({
    metadata: { committee_consensus: { top3_tickers: ['AAPL'] } },
    report_markdown: '# Report\n\nCodex analysis',
  }));
  assert.equal(result.metadata.committee_consensus.top3_tickers[0], 'AAPL');
  assert.match(result.rawResponse, /report_markdown/);
  assert.equal(result.reportMarkdown, '# Report\n\nCodex analysis');
}

{
  const raw = JSON.stringify({
    committee_consensus: { top3_tickers: ['NVDA'] },
    report_markdown: '# Embedded report',
  });
  const parsed = parseIbResponse(raw);
  assert.equal(parsed.parseFailed, false);
  assert.equal(parsed.reportMarkdown, '# Embedded report');
}

assert.throws(
  () => parseCodexCliOutput('not json'),
  /not valid JSON/
);

console.log('codex cli worker utils tests passed');
