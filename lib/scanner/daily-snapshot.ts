import type { DailyScreenerSource } from '@/lib/daily-screeners';
import type { ScannerUniverse } from '@/types';

export interface DailyScannerSnapshotRun {
  id: string;
  runDate: string;
  status: 'completed' | 'failed';
  completedAt: string | null;
  updatedAt: string;
  warning: string | null;
}

export interface DailyScannerSnapshotCandidate {
  source: DailyScreenerSource;
  universe: ScannerUniverse;
  ticker: string;
  exchange: string;
  name: string | null;
  score: number;
  grade: string;
  rank: number | null;
  price: number | null;
  priceAsOf: string | null;
  reason: string | null;
  metrics: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface DailyScannerSnapshot {
  run: DailyScannerSnapshotRun | null;
  candidates: DailyScannerSnapshotCandidate[];
}

interface SnapshotRunRow {
  id: string;
  run_date: string;
  status: 'completed' | 'failed';
  completed_at: string | null;
  updated_at: string;
  error_summary: string | null;
}

interface SnapshotCandidateRow {
  source: DailyScreenerSource;
  universe: ScannerUniverse;
  ticker: string;
  exchange: string;
  name: string | null;
  score: number | string;
  grade: string;
  source_rank: number | null;
  price: number | string | null;
  price_as_of: string | null;
  reason: string | null;
  raw_metrics: Record<string, unknown> | null;
  raw: Record<string, unknown> | null;
}

function numberOrNull(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toDailyScannerSnapshot(
  run: SnapshotRunRow | null,
  rows: SnapshotCandidateRow[],
): DailyScannerSnapshot {
  return {
    run: run ? {
      id: run.id,
      runDate: run.run_date,
      status: run.status,
      completedAt: run.completed_at,
      updatedAt: run.updated_at,
      warning: run.status === 'failed' ? run.error_summary : null,
    } : null,
    candidates: rows.map((row) => ({
      source: row.source,
      universe: row.universe,
      ticker: row.ticker,
      exchange: row.exchange,
      name: row.name,
      score: numberOrNull(row.score) ?? 0,
      grade: row.grade,
      rank: row.source_rank,
      price: numberOrNull(row.price),
      priceAsOf: row.price_as_of,
      reason: row.reason,
      metrics: row.raw_metrics ?? {},
      raw: row.raw ?? {},
    })),
  };
}
