import type { MasterFilterMetricDetail } from '@/types';

export const ADVANCE_DECLINE_RATIO_BANDS = [
  { range: '75% 이하', meaning: '과매도·침체권' },
  { range: '75~100%', meaning: '하락 종목이 더 많은 구간' },
  { range: '100%', meaning: '상승·하락 종목 수 균형' },
  { range: '100~120%', meaning: '상승 종목이 더 많은 구간' },
  { range: '120% 이상', meaning: '과매수·과열권' },
] as const;

export function getAverageDailyRangeGuidance(status: MasterFilterMetricDetail['status']) {
  if (status === 'PASS') {
    return {
      label: '안정 구간',
      action: '평소의 진입 비중과 손절 원칙을 적용할 수 있습니다.',
    };
  }

  if (status === 'WARNING') {
    return {
      label: '주의 구간',
      action: '신규 진입 수량을 줄이고 손절폭이 과도하지 않은지 확인하세요.',
    };
  }

  return {
    label: '과열 변동폭',
    action: '추격 진입을 피하고 변동성이 진정될 때까지 보수적으로 대응하세요.',
  };
}
