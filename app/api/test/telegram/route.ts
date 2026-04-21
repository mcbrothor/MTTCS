import { NextResponse } from 'next/server';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const message = `🚀 *MTN 시스템 알림 테스트*\n\n텔레그램 연동이 성공적으로 완료되었습니다!\n\n기준 시각: ${new Date().toLocaleString('ko-KR')}\n환경: ${process.env.NODE_ENV}`;
    
    const result = await sendTelegramMessage(message);
    
    if (result.skipped) {
      return NextResponse.json({ 
        success: false, 
        message: '토큰 또는 Chat ID 설정이 누락되었습니다. .env.local 파일을 확인해 주세요.' 
      }, { status: 400 });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `${result.sent}개의 채팅방으로 테스트 메시지를 발송했습니다.` 
    });
  } catch (error) {
    console.error('Telegram test error:', error);
    return NextResponse.json({ 
      success: false, 
      message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.' 
    }, { status: 500 });
  }
}
