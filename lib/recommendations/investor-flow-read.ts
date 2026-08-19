import type { SupabaseClient } from '@supabase/supabase-js';

export type InvestorFlowDatabaseRow = {
  ticker: string;
  trade_date: string;
  foreign_net_buy_qty: number;
  institution_net_buy_qty: number;
  foreign_net_buy_amount_mkrw: number;
  institution_net_buy_amount_mkrw: number;
  turnover_amount_mkrw: number;
  provider: string;
  quality: 'FULL' | 'STALE';
  observed_at: string;
  raw_json: Record<string, string>;
};

const PAGE_SIZE = 1_000;

export async function readInvestorFlowRows(input: {
  client: SupabaseClient;
  startDate: string;
  endDate: string;
  pageSize?: number;
}) {
  const pageSize = Math.min(PAGE_SIZE, Math.max(1, input.pageSize || PAGE_SIZE));
  const rows: InvestorFlowDatabaseRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await input.client
      .from('kr_investor_flow_daily')
      .select('*')
      .gte('trade_date', input.startDate)
      .lte('trade_date', input.endDate)
      .order('trade_date')
      .order('ticker')
      .order('provider')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data || []) as InvestorFlowDatabaseRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}
