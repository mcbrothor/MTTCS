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

function parseJsonCandidate(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sanitizeReportMarkdown(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith(',') || trimmed.startsWith('}')) return '';
  if (trimmed.startsWith('"') && !trimmed.includes('\n#') && !trimmed.includes('\n##')) return '';
  return trimmed;
}

function sanitizeFallbackMarkdown(text) {
  const trimmed = String(text || '').trim();
  if (trimmed.startsWith('{') || trimmed.includes('"schema_version"')) {
    return 'AI 엔진 응답 포맷 오류 발생\n\n모델이 요청한 마크다운 리포트 형식을 지키지 않아 본문을 렌더링할 수 없습니다.';
  }
  return sanitizeReportMarkdown(trimmed);
}

export function parseIbResponse(raw) {
  const trimmed = String(raw || '').trim();

  const part1Idx = trimmed.indexOf('[PART 1: JSON METADATA]');
  const part2Idx = trimmed.indexOf('[PART 2: MARKDOWN REPORT]');
  if (part1Idx !== -1 && part2Idx !== -1 && part2Idx > part1Idx) {
    const part1Block = trimmed.slice(part1Idx + '[PART 1: JSON METADATA]'.length, part2Idx).trim();
    const part2Block = trimmed.slice(part2Idx + '[PART 2: MARKDOWN REPORT]'.length).trim();
    const fenceMatch = part1Block.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    let jsonStr = fenceMatch ? fenceMatch[1] : part1Block;
    const start = jsonStr.indexOf('{');
    if (start !== -1) {
      const close = findBalancedClose(jsonStr, start, 0);
      if (close !== -1) jsonStr = jsonStr.slice(start, close + 1);
    }
    const metadata = parseJsonCandidate(jsonStr);
    if (metadata && typeof metadata === 'object') {
      return { metadata, reportMarkdown: sanitizeReportMarkdown(part2Block), parseFailed: false };
    }
  }

  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = trimmed.match(fenceRegex);
  if (match) {
    const metadata = parseJsonCandidate(match[1]);
    if (metadata && typeof metadata === 'object') {
      const fenceEnd = (match.index ?? 0) + match[0].length;
      return {
        metadata,
        reportMarkdown: sanitizeReportMarkdown(trimmed.slice(fenceEnd).trim()),
        parseFailed: false,
      };
    }
  }

  const direct = parseJsonCandidate(trimmed);
  if (direct && typeof direct === 'object') {
    const embedded = typeof direct.report_markdown === 'string' ? direct.report_markdown : '';
    return { metadata: direct, reportMarkdown: embedded, parseFailed: false };
  }

  const start = trimmed.indexOf('{');
  if (start === -1) {
    return { metadata: null, reportMarkdown: sanitizeFallbackMarkdown(trimmed), parseFailed: true };
  }

  const firstClose = findBalancedClose(trimmed, start, 0);
  if (firstClose === -1) {
    return { metadata: null, reportMarkdown: sanitizeFallbackMarkdown(trimmed), parseFailed: true };
  }

  const jsonCandidate = trimmed.slice(start, firstClose + 1);
  const rest = trimmed.slice(firstClose + 1).trimStart();
  if (rest.startsWith(',') || rest.startsWith('}') || rest.startsWith('"')) {
    const stitchClose = findBalancedClose(rest, 0, 1);
    if (stitchClose !== -1) {
      const stitched = jsonCandidate.slice(0, -1) + rest.slice(0, stitchClose + 1);
      const metadata = parseJsonCandidate(stitched);
      if (metadata && typeof metadata === 'object') {
        return {
          metadata,
          reportMarkdown: sanitizeReportMarkdown(rest.slice(stitchClose + 1).trim()),
          parseFailed: false,
        };
      }
    }
  }

  const metadata = parseJsonCandidate(jsonCandidate);
  if (metadata && typeof metadata === 'object') {
    return { metadata, reportMarkdown: sanitizeReportMarkdown(rest), parseFailed: false };
  }

  return { metadata: null, reportMarkdown: sanitizeFallbackMarkdown(rest), parseFailed: true };
}

export function buildCodexIbPrompt(mtnPrompt) {
  return [
    'You are the Codex CLI provider for MTN IB validation.',
    'Do not edit files, run commands, browse the web, or request live data.',
    'Use only the MTN prompt inside <mtn_ib_prompt>.',
    'Return only an object matching the provided JSON schema.',
    'Put structured committee JSON in metadata and the Korean markdown report in report_markdown.',
    '',
    '<mtn_ib_prompt>',
    mtnPrompt,
    '</mtn_ib_prompt>',
  ].join('\n');
}

export const DAILY_TOP5_PROVIDER_ORDER = [
  'codex-cli',
  'local-llm',
  'gemini',
  'groq',
  'cerebras',
  'rule-based',
];

export function buildCodexDailyTop5Prompt(mtnPrompt) {
  return [
    'You are the Codex CLI provider for MTN Daily Screener market Top10.',
    'Do not edit files. Use the supplied MTN candidates plus any available public market context to judge relative Top10 quality.',
    'Use only the MTN daily screener prompt inside <mtn_daily_top5_prompt>.',
    'Return only an object matching the provided JSON schema.',
    'The JSON must include markets.US and markets.KR, each with exactly ten valid tickers from the supplied candidate list.',
    '',
    '<mtn_daily_top5_prompt>',
    mtnPrompt,
    '</mtn_daily_top5_prompt>',
  ].join('\n');
}

export function getTelegramChatIds(env = process.env) {
  const configured = env.TELEGRAM_ALLOWED_CHAT_IDS || env.TELEGRAM_CHAT_ID || '';
  return configured
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function parseCodexCliOutput(raw) {
  const parsed = parseJsonCandidate(String(raw || '').trim());
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Codex CLI output was not valid JSON.');
  }

  const metadata = parsed.metadata && typeof parsed.metadata === 'object'
    ? parsed.metadata
    : {};
  const reportMarkdown = sanitizeReportMarkdown(parsed.report_markdown);

  if (!reportMarkdown) {
    throw new Error('Codex CLI output did not include report_markdown.');
  }

  return {
    metadata,
    reportMarkdown,
    rawResponse: JSON.stringify({ ...metadata, report_markdown: reportMarkdown }, null, 2),
  };
}

export function parseCodexCliJsonOutput(raw) {
  const parsed = parseJsonCandidate(String(raw || '').trim());
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Codex CLI output was not valid JSON.');
  }
  return parsed;
}
