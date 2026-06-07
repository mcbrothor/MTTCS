import type { PortfolioRiskSummary, SecurityProfile, Trade } from '../../../types/index.ts';
import { buildTradePositionLifecycle } from './position-lifecycle.ts';
import { evaluateRiskGate } from './risk-gate.ts';
import { getDefaultRiskPolicy } from './risk-policy.ts';

function finite(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function action(severity: 'BLOCK' | 'REDUCE' | 'WARN', title: string, detail: string) {
  return { severity, title, detail };
}

export function getMaxPositionsForEquity(totalEquity: number, market: 'US' | 'KR' = 'KR') {
  if (market === 'KR') {
    if (totalEquity <= 2_000_000) return 2;
    if (totalEquity <= 10_000_000) return 5;
    return 10;
  } else {
    // US
    if (totalEquity <= 2_000) return 2;
    if (totalEquity <= 10_000) return 5;
    return 10;
  }
}

export function calculatePortfolioRiskSummary(
  trades: Trade[],
  totalEquity: number,
  profiles: SecurityProfile[] = [],
  market: 'US' | 'KR' = 'US'
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
  const sectorRiskMap = new Map<string, { sector: string; openRisk: number; count: number }>();

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

    const riskRow = sectorRiskMap.get(sector) || { sector, openRisk: 0, count: 0 };
    riskRow.openRisk += finite(trade.metrics?.openRisk);
    riskRow.count += 1;
    sectorRiskMap.set(sector, riskRow);
  }

  const maxPositions = getMaxPositionsForEquity(equity, market);
  const policy = getDefaultRiskPolicy(market);
  const portfolioHeatPct = equity > 0 ? Number(((totalOpenRisk / equity) * 100).toFixed(2)) : 0;
  const riskBudgetRemaining = Number(Math.max(equity * policy.maxPortfolioHeatPct - totalOpenRisk, 0).toFixed(2));
  const warnings: string[] = [];
  const actions: PortfolioRiskSummary['actions'] = [];
  if (active.length > maxPositions) {
    warnings.push(`Active positions exceed the seed-size limit: ${active.length}/${maxPositions}.`);
    actions.push(action('REDUCE', 'Reduce position count', `활성 포지션을 ${maxPositions}개 이하로 줄이기 전까지 신규 진입을 보류합니다.`));
  }
  if (equity > 0 && totalOpenRisk / equity > 0.08) {
    warnings.push('Total open risk is above 8% of account equity.');
    actions.push(action('BLOCK', 'Stop new entries', '총 오픈 리스크가 8%를 넘었습니다. 손절선 상향, 부분 청산, 저신뢰 포지션 축소를 먼저 실행합니다.'));
  }
  if (equity > 0 && totalOpenRisk / equity >= policy.maxPortfolioHeatPct) {
    warnings.push(`Portfolio heat is above the standard risk policy limit: ${portfolioHeatPct}%.`);
    actions.push(action('BLOCK', 'Restore risk budget', `Portfolio heat가 정책 한도 ${policy.maxPortfolioHeatPct * 100}% 이상입니다. risk budget이 회복될 때까지 신규 계획 저장을 보류합니다.`));
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
      actions.push(action('WARN', `Trim ${row.sector} concentration`, `${row.sector} 노출이 ${row.exposurePct}%입니다. 같은 섹터 신규 진입은 중단하고, 가장 약한 포지션부터 축소 후보로 표시합니다.`));
    }
  }

  const sectorRisk = Array.from(sectorRiskMap.values())
    .map((row) => ({
      ...row,
      openRisk: Number(row.openRisk.toFixed(2)),
      riskPct: equity > 0 ? Number(((row.openRisk / equity) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.openRisk - a.openRisk);

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
      openRiskPct: equity > 0 ? Number(((finite(trade.metrics?.openRisk) / equity) * 100).toFixed(2)) : 0,
      pyramidCount: lifecycle.pyramidCount,
      partialExitCount: lifecycle.partialExitCount,
      latestAction: lifecycle.events.at(-1)?.action ?? null,
    };
  });
  const largestSectorRiskPct = sectorRisk[0]?.riskPct ?? 0;
  const riskGate = evaluateRiskGate({
    policy,
    totalEquity: equity,
    candidateRisk: 0,
    currentOpenRisk: totalOpenRisk,
    sectorRiskPct: largestSectorRiskPct,
  });
  if (riskGate.status === 'REDUCE') {
    actions.push(action('REDUCE', 'Use reduced sizing', '포트폴리오 risk gate가 REDUCE입니다. 신규 후보는 기본 리스크보다 낮은 수량으로만 검토합니다.'));
  } else if (riskGate.status === 'BLOCK') {
    actions.push(action('BLOCK', 'Portfolio risk gate blocked', '포트폴리오 risk gate가 BLOCK입니다. 기존 리스크를 줄이기 전까지 신규 진입을 중단합니다.'));
  }

  return {
    totalEquity: Number(equity.toFixed(2)),
    investedCapital: Number(investedCapital.toFixed(2)),
    cash: Number(Math.max(equity - investedCapital, 0).toFixed(2)),
    cashPct: equity > 0 ? Number((((equity - investedCapital) / equity) * 100).toFixed(2)) : 0,
    activePositions: active.length,
    maxPositions,
    totalOpenRisk: Number(totalOpenRisk.toFixed(2)),
    openRiskPct: equity > 0 ? Number(((totalOpenRisk / equity) * 100).toFixed(2)) : 0,
    portfolioHeatPct,
    riskBudgetRemaining,
    sectorExposure,
    sectorRisk,
    riskGate,
    warnings,
    actions,
    positions,
  };
}
