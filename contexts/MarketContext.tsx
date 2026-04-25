'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { DataSourceMeta, MacroRegime, MasterFilterMetricDetail, MasterFilterResponse } from '@/types';
import type { MacroScoreBreakdown } from '@/lib/macro/compute';

export type MarketSelection = 'US' | 'KR' | 'KR_KOSPI' | 'KR_KOSDAQ';

interface MarketContextValue {
  data: MasterFilterResponse | null;
  isLoading: boolean;
  error: Error | null;
  isStale: boolean;
  market: MarketSelection;
  setMarket: (market: MarketSelection) => void;
  bypassRisk: boolean;
  setBypassRisk: (value: boolean) => void;
  macroRegime: MacroRegime | null;
  macroScore: number | null;
  macroBreakdown: MacroScoreBreakdown[];
  conflictWarning: string | null;
}

const STATE_ORDER = { GREEN: 0, YELLOW: 1, RED: 2 } as const;
const REGIME_ORDER = { RISK_ON: 0, NEUTRAL: 1, RISK_OFF: 2 } as const;

/**
 * 마스터필터와 매크로 사이 신호 불일치 감지
 *
 * 위계 원칙: 마스터필터 RED/YELLOW면 매크로 무관 NO-GO.
 * 진입 권유 어조는 사용하지 않는다.
 */
function detectConflict(mfState: 'GREEN' | 'YELLOW' | 'RED', regime: MacroRegime): string | null {
  // GREEN + RISK_OFF: 게이트는 통과했으나 글로벌 자금흐름이 위험회피 — 비중 50%로 제한
  if (mfState === 'GREEN' && regime === 'RISK_OFF') {
    return '마스터필터 GREEN이지만 매크로 RISK-OFF — 신규 진입 시 비중 50%로 제한하고 손절선을 강화하세요.';
  }
  // RED + RISK_ON: 매크로 환경이 좋아도 시장 게이트 미통과 → 신규 진입 금지
  if (mfState === 'RED' && regime === 'RISK_ON') {
    return '마스터필터 RED 상태 — 매크로 RISK-ON이라도 신규 진입 보류. 시장 게이트 미통과.';
  }
  // YELLOW + RISK_OFF: 이중 부정 신호
  if (mfState === 'YELLOW' && regime === 'RISK_OFF') {
    return '마스터필터 YELLOW + 매크로 RISK-OFF — 신규 진입 금지. 기존 포지션 방어에 집중하세요.';
  }
  return null;
}

const MarketContext = createContext<MarketContextValue>({
  data: null,
  isLoading: true,
  error: null,
  isStale: false,
  market: 'US' as MarketSelection,
  setMarket: () => {},
  bypassRisk: false,
  setBypassRisk: () => {},
  macroRegime: null,
  macroScore: null,
  macroBreakdown: [],
  conflictWarning: null,
});

const createEmptyMetric = (label: string, threshold: string | number, unit: string): MasterFilterMetricDetail => ({
  label,
  value: 'N/A',
  threshold,
  status: 'FAIL',
  unit,
  description: '데이터를 불러오지 못했습니다.',
  source: 'System Fallback',
  score: 0,
  weight: 20,
});

function fallbackMarketData(market: MarketSelection): MasterFilterResponse {
  const updatedAt = new Date().toISOString();
  const meta: DataSourceMeta = {
    asOf: updatedAt,
    source: 'System Fallback',
    provider: 'MTN',
    delay: 'UNKNOWN',
    fallbackUsed: true,
    warnings: ['Master filter data could not be loaded.'],
  };

  return {
    state: 'YELLOW',
    market,
    metrics: {
      trend: createEmptyMetric('Trend Alignment', 'PASS', ''),
      breadth: createEmptyMetric('Market Breadth', 'PASS', ''),
      volatility: createEmptyMetric('Volatility Regime', 'PASS', ''),
      ftd: createEmptyMetric('Follow-Through Day', 'PASS', ''),
      distribution: createEmptyMetric('Distribution Days', 'PASS', ''),
      newHighLow: createEmptyMetric('New High/Low', 'PASS', ''),
      sectorRotation: createEmptyMetric('Sector Leadership', 'PASS', ''),
      score: 0,
      p3Score: 0,
      meta,
      mainPrice: 0,
      ma50: 0,
      ma150: 0,
      ma200: 0,
      mainHistory: [],
      vixHistory: [],
      movingAverageHistory: [],
      sectorRows: [],
      ftdReason: '마스터 필터 API 응답이 없어 Follow-Through Day를 확인하지 못했습니다.',
      updatedAt,
    },
    insightLog: '마스터 필터 데이터를 불러오지 못했습니다. 안전을 위해 신규 진입은 보수적으로 판단하세요.',
    isAiGenerated: false,
    aiProviderUsed: 'rules',
    aiModelUsed: 'system-fallback',
    aiFallbackChain: [{ provider: 'rules', model: 'system-fallback', status: 'success' }],
    aiModelInsights: [{
      id: '99-rules-system-fallback',
      provider: 'rules',
      label: 'rules',
      model: 'system-fallback',
      status: 'success',
      text: '마스터 필터 데이터를 불러오지 못했습니다. 안전을 위해 신규 진입은 보수적으로 판단하세요.',
      selected: true,
      priority: 99,
      generatedAt: updatedAt,
    }],
    aiErrorSummary: '브라우저가 마스터 필터 API 응답을 받지 못해 로컬 fallback 데이터를 표시합니다.',
  };
}

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<MasterFilterResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [market, setMarket] = useState<MarketSelection>('US');
  const [macroRegime, setMacroRegime] = useState<MacroRegime | null>(null);
  const [macroScore, setMacroScore] = useState<number | null>(null);
  const [macroBreakdown, setMacroBreakdown] = useState<MacroScoreBreakdown[]>([]);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [bypassRisk, setBypassRiskState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('bypass_risk') === 'true';
  });

  const setBypassRisk = (value: boolean) => {
    sessionStorage.setItem('bypass_risk', String(value));
    setBypassRiskState(value);
  };

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    let mounted = true;

    async function fetchMarketData() {
      setIsLoading(true);
      try {
        const [mfResponse, macroResponse] = await Promise.allSettled([
          fetch(`/api/master-filter?market=${market}`, { signal: controller.signal }),
          fetch('/api/macro'),
        ]);

        if (mfResponse.status === 'rejected' || (mfResponse.status === 'fulfilled' && !mfResponse.value.ok)) {
          const payload = mfResponse.status === 'fulfilled' ? await mfResponse.value.json().catch(() => null) : null;
          throw new Error(payload?.message || '마스터 필터 데이터를 불러오지 못했습니다.');
        }

        const result = (await (mfResponse as PromiseFulfilledResult<Response>).value.json()) as MasterFilterResponse;

        let regime: MacroRegime | null = null;
        let score: number | null = null;
        let breakdown: MacroScoreBreakdown[] = [];
        if (macroResponse.status === 'fulfilled' && macroResponse.value.ok) {
          const macroJson = await macroResponse.value.json().catch(() => null);
          if (macroJson?.regime) regime = macroJson.regime as MacroRegime;
          if (typeof macroJson?.score === 'number') score = macroJson.score;
          if (Array.isArray(macroJson?.breakdown)) breakdown = macroJson.breakdown;
        }

        if (mounted) {
          setData({ ...result, market });
          setMacroRegime(regime);
          setMacroScore(score);
          setMacroBreakdown(breakdown);
          setConflictWarning(regime ? detectConflict(result.state, regime) : null);
          setIsStale(result.metrics?.meta?.fallbackUsed === true || (result.metrics?.meta?.warnings?.length ?? 0) > 0);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          const message = err instanceof DOMException && err.name === 'AbortError' ? '마스터 필터 요청 시간이 초과되었습니다.' : '알 수 없는 오류';
          setError(err instanceof Error ? err : new Error(message));
          setIsStale(true);
          setData(fallbackMarketData(market));
        }
      } finally {
        window.clearTimeout(timeout);
        if (mounted) setIsLoading(false);
      }
    }

    fetchMarketData();

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [market]);

  return (
    <MarketContext.Provider value={{ data, isLoading, error, isStale, market, setMarket, bypassRisk, setBypassRisk, macroRegime, macroScore, macroBreakdown, conflictWarning }}>
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  return useContext(MarketContext);
}
