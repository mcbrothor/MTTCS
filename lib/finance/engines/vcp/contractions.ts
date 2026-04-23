import type { OHLCData, VcpContraction } from '../../../../types/index.ts';
import { type LocalExtremum, MIN_CONTRACTION_DEPTH, clamp, round } from './_shared.ts';

/**
 * Peak→Trough 쌍을 찾아 수축 단계를 구성합니다.
 * Minervini 기준: 각 수축은 이전보다 깊이가 얕아야 하며,
 * 수축의 최소 깊이는 종목의 전체 변동성에 따라 적응형으로 결정됩니다.
 */
export function detectContractions(data: OHLCData[], extrema: LocalExtremum[]): VcpContraction[] {
  const contractions: VcpContraction[] = [];
  const peaks = extrema.filter((e) => e.type === 'peak');
  const troughs = extrema.filter((e) => e.type === 'trough');

  const avgDailyRange = data.length > 0
    ? data.reduce((sum, d) => sum + ((d.high - d.low) / d.close) * 100, 0) / data.length
    : MIN_CONTRACTION_DEPTH;
  const adaptiveMinDepth = Math.max(MIN_CONTRACTION_DEPTH, round(avgDailyRange * 1.5));

  for (const peak of peaks) {
    const nextTrough = troughs.find((t) => t.index > peak.index);
    if (!nextTrough) continue;

    const depthPct = round(((peak.price - nextTrough.price) / peak.price) * 100);
    if (depthPct < adaptiveMinDepth) continue;

    const segmentData = data.slice(peak.index, nextTrough.index + 1);
    const avgVolume = segmentData.length > 0
      ? round(segmentData.reduce((sum, d) => sum + d.volume, 0) / segmentData.length, 0)
      : 0;

    contractions.push({
      peakDate: peak.date,
      troughDate: nextTrough.date,
      peakPrice: round(peak.price),
      troughPrice: round(nextTrough.price),
      depthPct,
      avgVolume,
    });
  }

  return contractions;
}

/**
 * 수축 점수 산출 (0~100)
 * - 2~6개의 수축이 있고, 각 수축이 이전보다 얕으면 높은 점수
 * - 수축 수가 적거나 깊이가 증가하면 감점
 */
export function scoreContractions(contractions: VcpContraction[]): { score: number; details: string[] } {
  const details: string[] = [];

  if (contractions.length < 2) {
    details.push(`수축 ${contractions.length}개 감지 — 최소 2개 이상 필요합니다.`);
    return { score: contractions.length === 1 ? 20 : 0, details };
  }

  const sequentialLowering = validateSequentialLowering(contractions);
  let progressiveCount = 0;
  for (let i = 1; i < contractions.length; i++) {
    if (contractions[i].depthPct < contractions[i - 1].depthPct && sequentialLowering.pairs[i - 1]?.passed) {
      progressiveCount++;
    }
  }

  const progressiveRatio = progressiveCount / (contractions.length - 1);
  const progressiveScore = round(progressiveRatio * 60);

  const validContractions = contractions.slice(0, 6);
  const countBonus = validContractions.length >= 2 && validContractions.length <= 4 ? 20 : 10;

  if (contractions.length > 6) {
    details.push(`주의: 수축이 ${contractions.length}개로 너무 많습니다. 이론상 6개 초과는 패턴 실패 가능성이 높습니다.`);
  }

  const lastDepth = contractions.at(-1)?.depthPct ?? 100;
  const tightnessBonus = lastDepth <= 10 ? 20 : lastDepth <= 15 ? 10 : 0;

  const score = clamp(progressiveScore + countBonus + tightnessBonus, 0, 100);

  details.push(`수축 ${contractions.length}개 감지, 깊이: ${contractions.map((c) => `${c.depthPct}%`).join(' → ')}`);
  details.push(`점진적 수축 비율: ${round(progressiveRatio * 100, 0)}% (${progressiveCount}/${contractions.length - 1})`);
  details.push(`고점·저점 동시 하락 비율: ${round(sequentialLowering.ratio * 100, 0)}% (${sequentialLowering.passedCount}/${Math.max(1, contractions.length - 1)})`);
  if (lastDepth <= 10) details.push(`최종 수축 ${lastDepth}% — 매우 타이트한 패턴`);

  return { score, details };
}

export function validateSequentialLowering(contractions: VcpContraction[]) {
  const pairs = [];
  for (let i = 1; i < contractions.length; i++) {
    const previous = contractions[i - 1];
    const current = contractions[i];
    pairs.push({
      passed: current.peakPrice < previous.peakPrice && current.troughPrice < previous.troughPrice,
    });
  }

  const passedCount = pairs.filter((item) => item.passed).length;
  const ratio = pairs.length > 0 ? passedCount / pairs.length : 0;

  return {
    pairs,
    passedCount,
    ratio,
  };
}

/**
 * 거래량 건조화 점수 (0~100)
 * - 수축 구간별 거래량이 왼→오른으로 줄어들면 높은 점수
 * - 50일 평균 대비 최종 구간 거래량이 낮을수록 좋음
 */
export function scoreVolumeDryUp(
  data: OHLCData[],
  contractions: VcpContraction[]
): { score: number; details: string[] } {
  const details: string[] = [];

  if (contractions.length < 2) {
    return { score: 30, details: ['수축이 부족해 볼륨 건조화를 판정하기 어렵습니다.'] };
  }

  let decreasingCount = 0;
  for (let i = 1; i < contractions.length; i++) {
    if (contractions[i].avgVolume < contractions[i - 1].avgVolume) {
      decreasingCount++;
    }
  }
  const decreasingRatio = decreasingCount / (contractions.length - 1);
  const trendScore = round(decreasingRatio * 70);

  const recentSlice = data.slice(-50);
  const avg50Volume = recentSlice.length > 0
    ? recentSlice.reduce((sum, d) => sum + d.volume, 0) / recentSlice.length
    : 1;

  const lastContractionVolume = contractions.at(-1)?.avgVolume ?? avg50Volume;
  const volumeRatio = lastContractionVolume / avg50Volume;
  const ratioScore = clamp(round((1 - volumeRatio) * 50), 0, 50);

  const score = clamp(trendScore + ratioScore, 0, 100);

  details.push(`볼륨 감소 추세: ${round(decreasingRatio * 100, 0)}% (${decreasingCount}/${contractions.length - 1})`);
  details.push(`최종 수축 볼륨은 50일 평균의 ${round(volumeRatio * 100, 0)}%`);

  return { score, details };
}
