// Regression test for parseIbResponse — mirrors the route's logic.
// Covers the malformed-JSON case that caused raw JSON to leak into the IB report UI.

import assert from 'node:assert/strict';

function findBalancedClose(text, from, startDepth) {
  let depth = startDepth;
  let inString = false;
  let escaped = false;
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth += 1;
    if (c === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function sanitizeReportMarkdown(text) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith(',') || trimmed.startsWith('}')) return '';
  if (trimmed.startsWith('"') && !trimmed.includes('\n#') && !trimmed.includes('\n##')) return '';
  return trimmed;
}

function parseIbResponse(raw) {
  const trimmed = raw.trim();
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = trimmed.match(fenceRegex);
  if (match) {
    const jsonStr = match[1];
    const fenceEnd = (match.index ?? 0) + match[0].length;
    const reportMarkdown = trimmed.slice(fenceEnd).trim();
    try {
      const metadata = JSON.parse(jsonStr);
      return { metadata, reportMarkdown: sanitizeReportMarkdown(reportMarkdown), parseFailed: false };
    } catch {}
  }
  try {
    const metadata = JSON.parse(trimmed);
    const embedded = typeof metadata.report_markdown === 'string' ? metadata.report_markdown : '';
    return { metadata, reportMarkdown: embedded, parseFailed: false };
  } catch {}
  const start = trimmed.indexOf('{');
  if (start === -1) return { metadata: null, reportMarkdown: trimmed, parseFailed: true };
  const firstClose = findBalancedClose(trimmed, start, 0);
  if (firstClose === -1) return { metadata: null, reportMarkdown: trimmed, parseFailed: true };
  const jsonCandidate = trimmed.slice(start, firstClose + 1);
  const rest = trimmed.slice(firstClose + 1).trimStart();
  if (rest.startsWith(',') || rest.startsWith('}') || rest.startsWith('"')) {
    const stitchClose = findBalancedClose(rest, 0, 1);
    if (stitchClose !== -1) {
      const stitched = jsonCandidate.slice(0, -1) + rest.slice(0, stitchClose + 1);
      try {
        const metadata = JSON.parse(stitched);
        const reportMarkdown = rest.slice(stitchClose + 1).trim();
        return { metadata, reportMarkdown: sanitizeReportMarkdown(reportMarkdown), parseFailed: false };
      } catch {}
    }
  }
  try {
    const metadata = JSON.parse(jsonCandidate);
    return { metadata, reportMarkdown: sanitizeReportMarkdown(rest), parseFailed: false };
  } catch {
    return { metadata: null, reportMarkdown: rest, parseFailed: true };
  }
}

console.log('=== IB parser regression tests ===\n');

// Regression: LLM closed outer object too early, leaving `, "candidates":[...]` as orphan.
// Prior parser leaked the orphan into report_markdown and ReactMarkdown rendered raw JSON.
{
  const malformed = '{ "schema_version": "v1", "committee_consensus": { "top3_tickers": ["AMAT","INTC","LRCX"], "mtn_alignment": "PARTIAL_RERANK" } }, "candidates": [ { "ticker": "AMAT", "ib_verdict": "STRONG_BUY" } ] }\n\n# Investment Committee Memorandum\n\n## 1. Executive Summary\n시장은 GREEN 국면입니다.';
  const r = parseIbResponse(malformed);
  assert.equal(r.parseFailed, false);
  assert.ok(r.metadata?.committee_consensus, 'committee_consensus stitched');
  assert.equal(r.metadata?.candidates?.length, 1, 'candidates stitched');
  assert.ok(r.reportMarkdown.startsWith('# Investment Committee Memorandum'));
  console.log('OK malformed-JSON outer-close-too-early is stitched and report is clean');
}

// Properly fenced — must still work
{
  const fenced = '```json\n{"schema_version":"v1","committee_consensus":{"top3_tickers":["A"]}}\n```\n\n# Report\n\n## Section 1\n내용';
  const r = parseIbResponse(fenced);
  assert.equal(r.parseFailed, false);
  assert.ok(r.metadata?.committee_consensus);
  assert.ok(r.reportMarkdown.startsWith('# Report'));
  console.log('OK fenced format');
}

// Well-formed inline JSON + markdown
{
  const ok = '{"committee_consensus":{"top3_tickers":["X"]},"candidates":[]}\n\n# Memo\n## Section';
  const r = parseIbResponse(ok);
  assert.equal(r.parseFailed, false);
  assert.equal(Array.isArray(r.metadata?.candidates), true);
  assert.ok(r.reportMarkdown.startsWith('# Memo'));
  console.log('OK well-formed inline');
}

// Pure JSON only, report inside `report_markdown` field
{
  const pure = '{"committee_consensus":{"top3_tickers":["X"]},"candidates":[],"report_markdown":"# Embedded\\n## Body"}';
  const r = parseIbResponse(pure);
  assert.equal(r.parseFailed, false);
  assert.equal(r.reportMarkdown, '# Embedded\n## Body');
  console.log('OK pure JSON with embedded report_markdown');
}

// No JSON at all — whole text is the report
{
  const raw = '# Just Markdown\n\nNo JSON here.';
  const r = parseIbResponse(raw);
  assert.equal(r.parseFailed, true);
  assert.ok(r.reportMarkdown.startsWith('# Just Markdown'));
  console.log('OK pure markdown fallback');
}

console.log('\n=== All IB parser tests passed ===');
