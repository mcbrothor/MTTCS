import { AlertTriangle, CheckCircle2, Shield, XCircle } from 'lucide-react';

export function getCanslimLabel(pass: boolean, failedPillar: string | null) {
  if (pass) {
    return { text: '통과', color: 'text-emerald-400', icon: CheckCircle2 };
  }

  switch (failedPillar) {
    case 'M_REDUCED':
      return { text: '시장 약세 (RS 90+ 한정)', color: 'text-amber-400', icon: AlertTriangle };
    case 'M':
      return { text: '시장 중단', color: 'text-rose-400', icon: Shield };
    case 'C_EPS':
      return { text: '분기 EPS 급감', color: 'text-rose-400', icon: XCircle };
    case 'C_SALES':
      return { text: '분기 매출 부족', color: 'text-rose-400', icon: XCircle };
    case 'A_NEGATIVE_EPS':
      return { text: '최근 적자 이력', color: 'text-rose-400', icon: XCircle };
    case 'A_ROE':
      return { text: 'ROE 미달', color: 'text-rose-400', icon: XCircle };
    case 'A_ANNUAL':
      return { text: '연간 EPS 부족', color: 'text-rose-400', icon: XCircle };
    case 'N_TOO_FAR':
      return { text: '신고가 과이탈', color: 'text-rose-400', icon: XCircle };
    case 'S_VOLUME':
      return { text: '거래량 부족', color: 'text-rose-400', icon: XCircle };
    case 'L_RS':
      return { text: 'RS 80 미만', color: 'text-rose-400', icon: XCircle };
    case 'I_TREND':
      return { text: '기관 이탈', color: 'text-rose-400', icon: XCircle };
    case 'I_COUNT':
      return { text: '기관 수 부족', color: 'text-rose-400', icon: XCircle };
    default:
      return { text: failedPillar || '조건 미달', color: 'text-rose-400', icon: XCircle };
  }
}
