import { NextRequest, NextResponse } from 'next/server';
import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await props.params;
    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    const data = await getYahooDailyPrice(ticker);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[PriceHistoryAPI] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
