import assert from 'node:assert/strict';
import test from 'node:test';
import AdmZip from 'adm-zip';
import { parseInvestmentIdeaRows } from '../lib/watchlist/import.ts';

test('CSV investment ideas map Korean headers and reject non-URL sources', () => {
  const csv = '종목코드,거래소,투자논지,촉매,무효화조건,검토일,상태,출처\n005930,KOSPI,"AI 수요",실적|HBM,점유율 하락,2026-09-01,WATCHING,https://example.com|memo';
  const [row] = parseInvestmentIdeaRows({ buffer: Buffer.from(csv), fileName: 'ideas.csv' });
  assert.equal(row.ticker, '005930');
  assert.deepEqual(row.catalysts, ['실적', 'HBM']);
  assert.equal(row.idea_status, 'WATCHING');
  assert.deepEqual(row.source_refs, [{ url: 'https://example.com' }]);
});

test('XLSX first worksheet is imported without executing macros', () => {
  const zip = new AdmZip();
  zip.addFile('xl/sharedStrings.xml', Buffer.from('<sst><si><t>ticker</t></si><si><t>thesis</t></si><si><t>AAPL</t></si><si><t>Services growth</t></si></sst>'));
  zip.addFile('xl/worksheets/sheet1.xml', Buffer.from('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row></sheetData></worksheet>'));
  const [row] = parseInvestmentIdeaRows({ buffer: zip.toBuffer(), fileName: 'ideas.xlsx' });
  assert.equal(row.ticker, 'AAPL');
  assert.equal(row.thesis, 'Services growth');
});
