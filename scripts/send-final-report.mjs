import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config({ path: '.env.local' });

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatIds = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',').map((id) => id.trim()).filter(Boolean) || [];

const report = `
🚀 *MTN 시스템 배포 완료 리포트*
---------------------------------------
✅ *마스터 필터*: P3 스코어링 엔진 통합 완료
✅ *매크로 분석*: 리스크 ON/OFF 레짐 판별 도입
✅ *시계열 고도화*: 최근 30일 추세 스파크라인 적용
✅ *자동화*: Vercel Cron을 통한 일일 리포트 활성화
✅ *DB 동기화*: 히스토리 테이블 마이그레이션 완료

이제 텔레그램을 통해 매일 아침 시장 상황을 받아보실 수 있습니다.
[MTN 대시보드 바로가기](https://mttcs.vercel.app)
---------------------------------------
`.trim();

async function main() {
  if (!token || chatIds.length === 0) {
    console.error('설정 누락: TOKEN 또는 CHAT_IDS를 확인하세요.');
    return;
  }

  console.log('텔레그램 리포트 발송 중...');
  
  for (const chatId of chatIds) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: report,
        parse_mode: 'Markdown',
      }),
    });
    
    if (response.ok) {
      console.log(`[${chatId}] 발송 성공`);
    } else {
      const err = await response.text();
      console.error(`[${chatId}] 발송 실패: ${err}`);
    }
  }
}

main();
