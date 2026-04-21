import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { sendTelegramMessage } from '@/lib/telegram';
import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';
import { getMarketDailyPrice } from '@/lib/finance/providers/kis-api';

interface OHLCData {
  date: string;
  close: number;
  volume: number;
}

function calculateDistributionDays(data: OHLCData[], lookback = 25) {
  let count = 0;
  for (let index = Math.max(1, data.length - lookback); index < data.length; index += 1) {
    const prev = data[index - 1];
    const curr = data[index];
    if (curr.close < prev.close && curr.volume > prev.volume) {
      count += 1;
    }
  }
  return count;
}

async function fetchLatestPrice(ticker: string, market: string): Promise<number | null> {
  try {
    if (market === 'KR') {
      const exchange = /^\d{6}$/.test(ticker) ? (ticker.startsWith('0') || ticker.startsWith('1') || ticker.startsWith('2') || ticker.startsWith('3') ? 'KOSPI' : 'KOSDAQ') : 'KOSPI'; // Simplification, usually just fetch using KIS
      try {
        const data = await getMarketDailyPrice(ticker, exchange, 2);
        if (data.length > 0) return data[data.length - 1].close;
      } catch {
        const formatted = `${ticker}.KS`; // fallback
        const yData = await getYahooDailyPrice(formatted);
        if (yData.length > 0) return yData[yData.length - 1].close;
      }
    } else {
      const yData = await getYahooDailyPrice(ticker);
      if (yData.length > 0) return yData[yData.length - 1].close;
    }
  } catch (error) {
    console.error(`Error fetching price for ${ticker}:`, error);
  }
  return null;
}

export async function GET(request: Request) {
  // 보안 검증: cron 요청만 허용
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const alerts: string[] = [];

    // 1. PLANNED / ACTIVE 종목 가져오기
    const { data: trades, error } = await supabaseServer
      .from('trades')
      .select('id, ticker, status, market, entry_pivot, initial_stop, current_stop')
      .in('status', ['PLANNED', 'ACTIVE']);

    if (error) throw error;

    for (const trade of trades || []) {
      const price = await fetchLatestPrice(trade.ticker, trade.market);
      if (!price) continue;

      if (trade.status === 'PLANNED' && trade.entry_pivot) {
        // 피벗 ±5% 이내 접근 시 알림
        const distance = ((price - trade.entry_pivot) / trade.entry_pivot) * 100;
        if (Math.abs(distance) <= 5) {
          alerts.push(`🎯 [PLANNED] *${trade.ticker}* 피벗가 접근!\n- 현재가: ${price}\n- 피벗가: ${trade.entry_pivot} (${distance > 0 ? '+' : ''}${distance.toFixed(2)}%)`);
        }
      }

      if (trade.status === 'ACTIVE') {
        // 현재 스탑리밋 3% 이내 접근 시 알림
        const stopLimit = trade.current_stop || trade.initial_stop;
        if (stopLimit) {
          const distance = ((price - stopLimit) / stopLimit) * 100;
          if (distance <= 3 && distance >= -5) {
            alerts.push(`⚠️ [ACTIVE] *${trade.ticker}* 손절가 근접!\n- 현재가: ${price}\n- 손절가: ${stopLimit} (+${distance.toFixed(2)}% 남음)`);
          }
        }
      }
    }

    // 2. 매크로 DD 카운트 체크
    for (const symbol of ['^KS200', 'QQQ']) {
      try {
        const data = await getYahooDailyPrice(symbol);
        const dd = calculateDistributionDays(data, 25);
        if (dd >= 5) {
          alerts.push(`🚨 [MACRO] *${symbol}* Distribution Days 주의!\n- 최근 25일 내 기관 매도일: ${dd}일`);
        }
      } catch (e) {
        console.error('Failed macro stats fetching', e);
      }
    }

    if (alerts.length > 0) {
      const message = `*MTN 알림 리포트*\n\n${alerts.join('\n\n')}`;
      await sendTelegramMessage(message);
    }

    return NextResponse.json({ success: true, alerts_sent: alerts.length });

  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
