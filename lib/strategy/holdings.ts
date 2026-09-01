import type { SupabaseClient } from '@supabase/supabase-js';

interface HoldingRow {
  ticker?: string | null;
}

function normalizeTicker(value: unknown) {
  return String(value || '').trim().toUpperCase().replace(/\.(KS|KQ)$/, '');
}

export function extractStrategyHoldings(rows: HoldingRow[], universe: readonly string[]) {
  const allowed = new Set(universe.map(normalizeTicker));
  return [...new Set(rows.map((row) => normalizeTicker(row.ticker)).filter((ticker) => ticker && allowed.has(ticker)))];
}

export async function loadStrategyHoldings(args: {
  client: SupabaseClient;
  ownerId: string;
  universe: readonly string[];
}) {
  const { data, error } = await args.client
    .from('trades')
    .select('ticker')
    .eq('user_id', args.ownerId)
    .eq('status', 'ACTIVE');
  if (error) throw error;
  return extractStrategyHoldings(data || [], args.universe);
}
