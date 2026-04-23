import type { PortfolioRiskSummary, SecurityProfile, Trade } from '../../../types/index.ts';
import { buildTradePositionLifecycle } from './position-lifecycle.ts';

function finite(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function getMaxPositionsForEquity(totalEquity: number) {
  if (totalEquity <= 1_000_000) return 2;
  if (totalEquity <= 10_000_000) return 5;
  return 10;
}

export function calculatePortfolioRiskSummary(
  trades: Trade[],
  totalEquity: number,
  profiles: SecurityProfile[] = []
): PortfolioRiskSummary {
  const active = trades.filter((trade) => trade.status === 'ACTIVE');
  const profileByTicker = new Map(profiles.map((profile) => [profile.ticker.toUpperCase(), profile]));
  const investedCapital = active.reduce((sum, trade) => {
    const shares = finite(trade.metrics?.netShares ?? trade.total_shares ?? trade.position_size);
    const entry = finite(trade.metrics?.avgEntryPrice ?? trade.entry_price);
    return sum + shares * entry;
  }, 0);
  const totalOpenRisk = active.reduce((sum, trade) => sum + finite(trade.metrics?.openRisk), 0);
  const equity = totalEquity > 0 ? totalEquity : investedCapital;
  const sectorMap = new Map<string, { sector: string; exposure: number; count: number }>();

  for (const trade of active) {
    const shares = finite(trade.metrics?.netShares ?? trade.total_shares ?? trade.position_size);
    const entry = finite(trade.metrics?.avgEntryPrice ?? trade.entry_price);
    const exposure = shares * entry;
    const profile = profileByTicker.get(trade.ticker.toUpperCase());
    const sector = profile?.sector || 'Unknown';
    const row = sectorMap.get(sector) || { sector, exposure: 0, count: 0 };
    row.exposure += exposure;
    row.count += 1;
    sectorMap.set(sector, row);
  }

  const maxPositions = getMaxPositionsForEquity(equity);
  const warnings: string[] = [];
  if (active.length > maxPositions) {
    warnings.push(`Active positions exceed the seed-size limit: ${active.length}/${maxPositions}.`);
  }
  if (equity > 0 && totalOpenRisk / equity > 0.08) {
    warnings.push('Total open risk is above 8% of account equity.');
  }

  const sectorExposure = Array.from(sectorMap.values())
    .map((row) => ({
      ...row,
      exposure: Number(row.exposure.toFixed(2)),
      exposurePct: equity > 0 ? Number(((row.exposure / equity) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.exposure - a.exposure);

  for (const row of sectorExposure) {
    if (row.exposurePct >= 35 && row.count >= 2) {
      warnings.push(`${row.sector} concentration is high: ${row.exposurePct}%.`);
    }
  }

  const positions = active.map((trade) => {
    const lifecycle = buildTradePositionLifecycle(trade);
    const profile = profileByTicker.get(trade.ticker.toUpperCase());
    const netShares = finite(trade.metrics?.netShares ?? trade.total_shares ?? trade.position_size);
    const avgEntryPrice = trade.metrics?.avgEntryPrice ?? trade.entry_price ?? null;
    const currentPrice = trade.metrics?.currentPrice ?? null;
    return {
      ticker: trade.ticker,
      status: trade.status,
      sector: profile?.sector || 'Unknown',
      exposure: Number((netShares * finite(avgEntryPrice)).toFixed(2)),
      netShares: Number(netShares.toFixed(4)),
      avgEntryPrice: avgEntryPrice === null ? null : Number(avgEntryPrice.toFixed(4)),
      currentPrice: currentPrice === null ? null : Number(currentPrice.toFixed(4)),
      unrealizedPnL: trade.metrics?.unrealizedPnL ?? null,
      unrealizedR: trade.metrics?.unrealizedR ?? null,
      openRisk: Number(finite(trade.metrics?.openRisk).toFixed(2)),
      pyramidCount: lifecycle.pyramidCount,
      partialExitCount: lifecycle.partialExitCount,
      latestAction: lifecycle.events.at(-1)?.action ?? null,
    };
  });

  return {
    totalEquity: Number(equity.toFixed(2)),
    investedCapital: Number(investedCapital.toFixed(2)),
    cash: Number(Math.max(equity - investedCapital, 0).toFixed(2)),
    cashPct: equity > 0 ? Number((((equity - investedCapital) / equity) * 100).toFixed(2)) : 0,
    activePositions: active.length,
    maxPositions,
    totalOpenRisk: Number(totalOpenRisk.toFixed(2)),
    openRiskPct: equity > 0 ? Number(((totalOpenRisk / equity) * 100).toFixed(2)) : 0,
    sectorExposure,
    warnings,
    positions,
  };
}
