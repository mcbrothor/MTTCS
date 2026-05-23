import type { ContestCandidate, ContestLlmRecommendation, WatchlistPriority } from '@/types';

export function contestCandidatePlanHref(candidate: Pick<ContestCandidate, 'ticker' | 'exchange'>) {
  return `/plan?ticker=${encodeURIComponent(candidate.ticker)}&exchange=${encodeURIComponent(candidate.exchange)}`;
}

export interface ContestPlanQueueItem {
  ticker: string;
  exchange: string;
  name: string | null;
}

export const CONTEST_PLAN_QUEUE_STORAGE_KEY = 'mtn:plan:contest-queue:v1';

export function contestPlanQueue(candidates: Pick<ContestCandidate, 'ticker' | 'exchange' | 'name'>[]): ContestPlanQueueItem[] {
  return candidates.map((candidate) => ({
    ticker: candidate.ticker,
    exchange: candidate.exchange,
    name: candidate.name ?? null,
  }));
}

export function contestPlanQueueHref(candidates: Pick<ContestCandidate, 'ticker' | 'exchange' | 'name'>[]) {
  const first = candidates[0];
  if (!first) return '/plan';
  const params = new URLSearchParams({
    ticker: first.ticker,
    exchange: first.exchange,
    source: 'contest',
    autoAnalyze: '1',
  });
  return `/plan?${params.toString()}`;
}

export function contestWatchlistPriority(recommendation: ContestLlmRecommendation | null | undefined): WatchlistPriority {
  if (recommendation === 'PROCEED') return 2;
  if (recommendation === 'WATCH') return 1;
  return 0;
}

export function contestFollowUpCopy(finalPickCount: number) {
  if (finalPickCount > 0) {
    return {
      title: '후속 작업 진행',
      description: `최종 선정한 ${finalPickCount}개 종목을 관심종목에 등록하고 매매 계획으로 이어갈 수 있습니다.`,
      empty: false,
    };
  }

  return {
    title: '직접 후속 종목 선택',
    description: '최종 선정 종목이 없어도 아래 후보 중 직접 진행할 종목을 선택해 관심종목과 매매 계획으로 이어갈 수 있습니다.',
    empty: true,
  };
}
