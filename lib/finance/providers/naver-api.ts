import type { FundamentalSnapshot } from '@/types';

interface NaverFinanceRow {
  title?: string;
  recentYearFinancialDataList?: Array<{
    date?: string;
    value?: string | number | null;
  }>;
}

function parseNaverNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === 'string' ? v.replace(/[,\s]/g, '') : String(v);
  if (s === '-' || s === '' || s === 'null') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function findRow(rows: NaverFinanceRow[], keywords: string[]): NaverFinanceRow | undefined {
  return rows.find((r) => {
    const t = (r.title ?? '').trim();
    return keywords.some((kw) => t.includes(kw));
  });
}

function rowValues(row: NaverFinanceRow | undefined): (number | null)[] {
  return (row?.recentYearFinancialDataList ?? []).map((d) => parseNaverNumber(d?.value));
}

/**
 * Naver Finance 모바일 API에서 연간 재무 데이터를 조회합니다.
 * Yahoo Finance 실패 시 한국 종목 펀더멘털 보강에 사용됩니다.
 */
export async function getNaverFinanceFundamentals(
  stockCode: string
): Promise<FundamentalSnapshot | null> {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${stockCode}/finance/annual`,
      {
        headers: {
          'user-agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
          accept: 'application/json',
          referer: 'https://m.stock.naver.com/',
        },
      }
    );

    if (!res.ok) return null;

    const payload = await res.json() as { financeInfo?: NaverFinanceRow[] };
    const rows: NaverFinanceRow[] = payload?.financeInfo ?? [];
    if (rows.length === 0) return null;

    const revenueRow = findRow(rows, ['매출액', '수익(매출액)', '영업수익']);
    const netRow = findRow(rows, ['당기순이익']);
    const equityRow = findRow(rows, ['자본총계', '자기자본']);
    const debtRow = findRow(rows, ['부채총계', '총부채']);

    // recentYearFinancialDataList는 최신 연도 순으로 정렬됨
    const revenues = rowValues(revenueRow);
    const netIncomes = rowValues(netRow);
    const equities = rowValues(equityRow);
    const debts = rowValues(debtRow);

    const [rev0, rev1] = revenues;
    const [net0, net1] = netIncomes;
    const [eq0] = equities;
    const [debt0] = debts;

    const revenueGrowth =
      rev0 != null && rev1 != null && rev1 !== 0
        ? Number((((rev0 - rev1) / Math.abs(rev1)) * 100).toFixed(2))
        : null;

    const epsGrowth =
      net0 != null && net1 != null && net1 !== 0
        ? Number((((net0 - net1) / Math.abs(net1)) * 100).toFixed(2))
        : null;

    const roe =
      net0 != null && eq0 != null && eq0 !== 0
        ? Number(((net0 / eq0) * 100).toFixed(2))
        : null;

    const debtToEquity =
      debt0 != null && eq0 != null && eq0 !== 0
        ? Number(((debt0 / eq0) * 100).toFixed(2))
        : null;

    if (revenueGrowth === null && epsGrowth === null && roe === null) return null;

    return {
      epsGrowthPct: epsGrowth,
      revenueGrowthPct: revenueGrowth,
      roePct: roe,
      debtToEquityPct: debtToEquity,
      source: 'Naver Finance',
    };
  } catch {
    return null;
  }
}
