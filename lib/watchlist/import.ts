import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import type { InvestmentIdeaStatus } from '@/types';

export interface InvestmentIdeaImportRow {
  ticker: string;
  exchange: string;
  memo: string | null;
  tags: string[];
  thesis: string | null;
  catalysts: string[];
  invalidation: string | null;
  review_at: string | null;
  idea_status: InvestmentIdeaStatus;
  source_refs: { label?: string; url: string }[];
}

const STATUS = new Set<InvestmentIdeaStatus>(['DRAFT', 'WATCHING', 'READY', 'INVALIDATED', 'ARCHIVED']);

function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field); field = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(cellText).join('');
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return cellText(item.t ?? item['#text'] ?? item.r ?? '');
  }
  return '';
}

function xlsxRows(buffer: Buffer) {
  const zip = new AdmZip(buffer);
  const parser = new XMLParser({ ignoreAttributes: false });
  const sharedEntry = zip.getEntry('xl/sharedStrings.xml');
  const shared = sharedEntry
    ? (() => {
      const document = parser.parse(sharedEntry.getData().toString('utf8'));
      const values = document?.sst?.si || [];
      return (Array.isArray(values) ? values : [values]).map(cellText);
    })()
    : [];
  const sheetEntry = zip.getEntry('xl/worksheets/sheet1.xml');
  if (!sheetEntry) throw new Error('첫 번째 XLSX 워크시트를 찾을 수 없습니다.');
  const document = parser.parse(sheetEntry.getData().toString('utf8'));
  const rawRows = document?.worksheet?.sheetData?.row || [];
  return (Array.isArray(rawRows) ? rawRows : [rawRows]).map((rawRow: { c?: unknown }) => {
    const cells = rawRow?.c ? (Array.isArray(rawRow.c) ? rawRow.c : [rawRow.c]) : [];
    const row: string[] = [];
    for (const cell of cells as Array<Record<string, unknown>>) {
      const reference = String(cell['@_r'] || 'A1');
      const letters = reference.match(/[A-Z]+/)?.[0] || 'A';
      const column = [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
      const raw = cell.v ?? cell.is;
      row[column] = cell['@_t'] === 's' ? shared[Number(cellText(raw))] || '' : cellText(raw);
    }
    return row;
  });
}

function splitList(value: string) {
  return value.split(/[|;\n]/).map((item) => item.trim()).filter(Boolean);
}

function headerIndex(headers: string[], aliases: string[]) {
  const normalized = headers.map((header) => header.trim().toLowerCase().replaceAll(' ', '').replaceAll('_', ''));
  return normalized.findIndex((header) => aliases.includes(header));
}

function valueAt(row: string[], headers: string[], aliases: string[]) {
  const index = headerIndex(headers, aliases);
  return index >= 0 ? String(row[index] ?? '').trim() : '';
}

export function parseInvestmentIdeaRows(input: { buffer: Buffer; fileName: string }): InvestmentIdeaImportRow[] {
  const isXlsx = input.fileName.toLowerCase().endsWith('.xlsx');
  const rows = isXlsx
    ? xlsxRows(input.buffer)
    : csvRows(input.buffer.toString('utf8').replace(/^\uFEFF/, ''));
  if (rows.length < 2) return [];
  const headers = rows[0];
  const tickerColumn = headerIndex(headers, ['ticker', '티커', '종목코드', 'symbol']);
  if (tickerColumn < 0) throw new Error('ticker/티커/종목코드 열이 필요합니다.');
  return rows.slice(1).flatMap((row) => {
    const ticker = String(row[tickerColumn] || '').trim().toUpperCase();
    if (!ticker) return [];
    const statusValue = valueAt(row, headers, ['ideastatus', '상태', '아이디어상태']).toUpperCase() as InvestmentIdeaStatus;
    const sourceValues = splitList(valueAt(row, headers, ['sourcerefs', '출처', '참고자료', 'sources']));
    const rawReviewAt = valueAt(row, headers, ['reviewat', '검토일', '재검토일']);
    const reviewAt = isXlsx && /^\d+(?:\.\d+)?$/.test(rawReviewAt)
      ? new Date(Date.UTC(1899, 11, 30) + Number(rawReviewAt) * 86_400_000).toISOString().slice(0, 10)
      : rawReviewAt || null;
    return [{
      ticker,
      exchange: valueAt(row, headers, ['exchange', '거래소', '시장'])?.toUpperCase() || (/^\d{6}$/.test(ticker) ? 'KOSPI' : 'NAS'),
      memo: valueAt(row, headers, ['memo', '메모']) || null,
      tags: splitList(valueAt(row, headers, ['tags', '태그'])).slice(0, 10),
      thesis: valueAt(row, headers, ['thesis', '투자논지', '투자아이디어']) || null,
      catalysts: splitList(valueAt(row, headers, ['catalysts', '촉매', '카탈리스트'])),
      invalidation: valueAt(row, headers, ['invalidation', '무효화', '무효화조건']) || null,
      review_at: reviewAt,
      idea_status: STATUS.has(statusValue) ? statusValue : 'DRAFT',
      source_refs: sourceValues.filter((url) => /^https?:\/\//i.test(url)).map((url) => ({ url })),
    }];
  });
}
