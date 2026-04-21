import { supabaseServer } from '@/lib/supabase/server';
import { getMarketDailyPrice } from '@/lib/finance/providers/kis-api';
import { calculateReturnPct, isReviewDue, summarizeContestReview } from '@/lib/contest';
import { sendTelegramMessage } from '@/lib/telegram';
import type { ContestMarket, ContestReview } from '@/types';

interface DueReviewRow extends ContestReview {
  contest_candidates: {
    id: string;
    ticker: string;
    exchange: string;
    actual_invested: boolean;
    beauty_contest_sessions: {
      id: string;
      market: ContestMarket;
    };
  };
}

function latestClose(data: { date: string; close: number }[]) {
  const row = [...data].reverse().find((item) => Number.isFinite(item.close));
  if (!row) return null;
  return { close: row.close, date: row.date };
}

export async function runContestReviewBatch(market: ContestMarket) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseServer
    .from('contest_reviews')
    .select(`
      *,
      contest_candidates!inner(
        id,
        ticker,
        exchange,
        actual_invested,
        beauty_contest_sessions!inner(id, market)
      )
    `)
    .lte('due_date', today)
    .in('status', ['PENDING', 'ERROR'])
    .eq('contest_candidates.beauty_contest_sessions.market', market);

  if (error) throw error;

  const rows = ((data || []) as unknown as DueReviewRow[]).filter((review) => isReviewDue(review));
  const updates: { reviewId: string; ticker: string; status: string; returnPct: number | null; error?: string }[] = [];

  for (const row of rows) {
    const candidate = row.contest_candidates;
    try {
      const bars = await getMarketDailyPrice(candidate.ticker, candidate.exchange, 80);
      const close = latestClose(bars);
      if (!close) throw new Error('No price bars returned.');
      const returnPct = calculateReturnPct(row.base_price, close.close);

      const { error: updateError } = await supabaseServer
        .from('contest_reviews')
        .update({
          review_price: close.close,
          return_pct: returnPct,
          price_as_of: close.date,
          price_source: `KIS ${candidate.exchange}`,
          status: 'UPDATED',
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      if (updateError) throw updateError;
      updates.push({ reviewId: row.id, ticker: candidate.ticker, status: 'UPDATED', returnPct });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown price fetch error';
      await supabaseServer
        .from('contest_reviews')
        .update({
          status: 'ERROR',
          error_message: message.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      updates.push({ reviewId: row.id, ticker: candidate.ticker, status: 'ERROR', returnPct: null, error: message });
    }
  }

  if (updates.length > 0) {
    const sessionIds = Array.from(new Set(rows.map((row) => row.contest_candidates.beauty_contest_sessions.id)));
    const { data: candidates } = await supabaseServer
      .from('contest_candidates')
      .select('*, contest_reviews(*)')
      .in('session_id', sessionIds);
    const summary = summarizeContestReview((candidates || []) as never);
    const lines = [
      `*MTN Beauty Contest ${market} review batch*`,
      `Updated: ${updates.filter((item) => item.status === 'UPDATED').length}/${updates.length}`,
      summary.best ? `Best: ${summary.best.ticker} ${summary.best.returnPct}%` : null,
      summary.worst ? `Worst: ${summary.worst.ticker} ${summary.worst.returnPct}%` : null,
      summary.missedLeaders.length ? `Missed leaders: ${summary.missedLeaders.join(', ')}` : null,
    ].filter(Boolean);
    await sendTelegramMessage(lines.join('\n')).catch(() => null);
  }

  return { market, checked: rows.length, updated: updates.filter((item) => item.status === 'UPDATED').length, updates };
}

export function validateCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
  }

  // 헤더 검증 또는 쿼리 파라미터 검증 허용 (수동 테스트용)
  const authHeader = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret');

  return authHeader === `Bearer ${secret}` || querySecret === secret;
}
