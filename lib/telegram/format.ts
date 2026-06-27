import { MasterFilterResponse } from '@/types';

/**
 * 시장 상태에 따른 이모지와 상태 메시지 매핑
 */
const STATUS_MAP = {
  GREEN: { emoji: '🟢', text: '공격적 진입 가능 (강세)', guide: '새로운 기회를 적극적으로 탐색하고 수익을 극대화하세요.' },
  YELLOW: { emoji: '🟡', text: '주의 및 경계 (중립)', guide: '포지션 크기를 줄이고 변동성에 대비하세요. 손절가를 타이트하게 관리할 때입니다.' },
  RED: { emoji: '🔴', text: '방어적 대응 권장 (약세)', guide: '신규 매수보다 현금화와 기존 포지션 방어를 최우선으로 하세요.' },
  GREY: { emoji: '⚪', text: '데이터 수집 중 (대기)', guide: '시장 데이터가 불충분합니다. 데이터가 수집될 때까지 신규 진입을 보류하세요.' },
};

/**
 * 텔레그램용 풍부한 시장 보고서 생성
 */
export function formatDetailedMarketReport(res: MasterFilterResponse) {
  const { market, state, metrics, isAiGenerated, aiProviderUsed, aiModelUsed } = res;
  const config = STATUS_MAP[state] || STATUS_MAP.YELLOW;
  const updatedAt = new Date(metrics.updatedAt).toLocaleString('ko-KR');

  const sections = [
    `${config.emoji} *[MTN 시장 리포트: ${market}]*`,
    `"${config.guide}"`,
    '',
    `✅ *현재 상태*: \`${config.text}\``,
    `📊 *종합 점수*: \`${metrics.p3Score}/100\``,
    metrics.earlyWarnings ? `⚠️ *위험 조기경보*: \`${metrics.earlyWarnings.summary}\`` : null,
    metrics.earlyWarnings ? `🧭 *돈의 이동*: \`${metrics.earlyWarnings.rotation.label}\`` : null,
    '',
    '🤖 *MTN Centaur AI 분석 인사이트*',
    res.insightLog || '분석 데이터를 수집하는 중입니다...',
    '',
    '🔍 *상세 지표 분석*',
    `• *지수 평균선 위치*: ${metrics.trend.status === 'PASS' ? '📈' : '📉'} ${metrics.trend.value} (${metrics.trend.status})`,
    `• *시장 폭*: ${metrics.breadth.status === 'PASS' ? '✅' : '⚠️'} ${metrics.breadth.value}% (${metrics.breadth.status})`,
    `• *시장 불안도*: ${metrics.volatility.status === 'PASS' ? '💎' : '🔥'} ${metrics.volatility.value} (${metrics.volatility.status})`,
    `• *새 고점/새 저점 힘겨루기*: ${metrics.newHighLow?.status === 'PASS' ? '💪' : '🩹'} ${metrics.newHighLow?.value} (${metrics.newHighLow?.status})`,
    `• *강한 업종*: ${metrics.sectorRotation?.status === 'PASS' ? '🧭' : '🌫️'} ${metrics.sectorRotation?.status}`,
    '',
    `📅 *기준 일자*: \`${updatedAt}\``,
    `[MTN 대시보드 바로가기](https://mttcs.vercel.app/master-filter)`,
    `_Powered by ${isAiGenerated ? `${aiProviderUsed} (${aiModelUsed})` : 'Rule-based Engine'}_`,
  ];

  return sections.filter(Boolean).join('\n');
}
