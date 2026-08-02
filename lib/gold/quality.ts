import type {
  GoldQualityView,
} from './api-contract';
import type { OHLCData } from '@/types';

export function assessGoldPriceDataset(
  dataset: { bars: OHLCData[] },
  options: {
    now?: Date;
    macroComplete?: boolean;
    wgcPeriod?: string | null;
    wgcAgeDays?: number | null;
  } = {},
): GoldQualityView {
  const priceAsOf = dataset.bars.at(-1)?.date || null;
  const now = options.now || new Date();
  const ageDays = priceAsOf
    ? Math.floor((now.getTime() - new Date(`${priceAsOf}T23:59:59Z`).getTime()) / 86_400_000)
    : Number.POSITIVE_INFINITY;
  const reasons: string[] = [];
  if (dataset.bars.length < 200) reasons.push('상품 OHLC가 200봉 미만입니다.');
  if (!priceAsOf) reasons.push('상품 최종 가격 기준일이 없습니다.');
  else if (ageDays > 7) reasons.push(`상품 가격이 ${ageDays}일 지연되었습니다.`);

  const priceBlocked = dataset.bars.length < 200 || ageDays > 7;
  const macroComplete = options.macroComplete ?? true;
  if (!macroComplete) reasons.push('완전한 매크로 입력이 없어 전술 비중을 차단합니다.');

  return {
    status: priceBlocked ? 'BLOCKED' : macroComplete ? 'VALID' : 'DEGRADED',
    reasons,
    priceBars: dataset.bars.length,
    priceAsOf,
    macroComplete,
    wgcPeriod: options.wgcPeriod ?? null,
    wgcAgeDays: options.wgcAgeDays ?? null,
  };
}
