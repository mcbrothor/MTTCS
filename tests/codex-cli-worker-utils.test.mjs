import assert from 'node:assert/strict';
import {
  DAILY_TOP5_PROVIDER_ORDER,
  buildCodexDailyTop5Prompt,
  buildCodexIbPrompt,
  getTelegramChatIds,
  parseCodexCliJsonOutput,
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
  assert.deepEqual(DAILY_TOP5_PROVIDER_ORDER, [
    'codex-cli',
    'local-llm',
    'gemini',
    'groq',
    'cerebras',
    'rule-based',
  ]);
  const prompt = buildCodexDailyTop5Prompt('daily prompt');
  assert.match(prompt, /MTN Daily Screener market Top10/);
  assert.match(prompt, /markets\.US and markets\.KR/);
  assert.match(prompt, /<mtn_daily_top5_prompt>/);
  assert.equal(parseCodexCliJsonOutput('{"markets":{"US":[],"KR":[]}}').markets.US.length, 0);
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

{
  assert.deepEqual(
    getTelegramChatIds({ TELEGRAM_ALLOWED_CHAT_IDS: ' 123,456 ,, 789 ' }),
    ['123', '456', '789']
  );
  assert.deepEqual(
    getTelegramChatIds({ TELEGRAM_CHAT_ID: 'legacy-chat' }),
    ['legacy-chat']
  );
}

console.log('codex cli worker utils tests passed');
