import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * GET /api/cron/purge-metrics
 * 데이터 보존 정책 수행 (3개월 경과 데이터 압축, 1년 경과 데이터 삭제)
 */
export async function GET(req: NextRequest) {
  // 인증 확인 (cron-job.org 등의 외부 호출 시 API 키 또는 헤더 검증 필요)
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  try {
    console.log('[Cron] Starting stock metrics retention maintenance...');
    
    // DB에 정의된 RPC 함수 호출
    const { error } = await supabase.rpc('maintain_stock_metrics_retention');

    if (error) {
      console.error('[Cron] Failed to maintain retention:', error);
      throw error;
    }

    console.log('[Cron] Retention maintenance completed successfully.');
    
    return NextResponse.json({ 
      success: true, 
      timestamp: new Date().toISOString(),
      message: 'Retention policy applied.' 
    });
  } catch (err: any) {
    console.error('[Cron] Error in purge-metrics:', err);
    return NextResponse.json({ 
      success: false, 
      error: err.message 
    }, { status: 500 });
  }
}
