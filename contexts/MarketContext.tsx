'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { DataSourceMeta, MacroRegime, MasterFilterMetricDetail, MasterFilterResponse } from '@/types';
import type { MacroScoreBreakdown } from '@/lib/macro/compute';

export type MarketSelection = 'US' | 'KR';

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

/**
 * 진입 가능 신호와 큰 흐름 사이 신호 불일치 감지
 *
 * 위계 원칙: 진입 가능 신호가 좋지 않으면 큰 흐름과 무관하게 새 매수 보류.
 */
function detectConflict(mfState: 'GREEN' | 'YELLOW' | 'RED' | 'GREY', regime: MacroRegime): string | null {
  if (mfState === 'GREY') {
    return '데이터 확인 필요 — 수집이 늦어져 큰 흐름 신호 적용을 잠시 보류합니다.';
  }
  if (mfState === 'GREEN' && regime === 'RISK_OFF') {
    return '진입 가능 신호는 좋지만 큰 흐름이 불안합니다 — 새 매수 시 권장 비중을 50%로 줄이고 손절선을 더 엄격히 보세요.';
  }
  if (mfState === 'RED' && regime === 'RISK_ON') {
    return '큰 흐름은 좋아 보여도 진입 가능 신호가 위험합니다 — 새 매수는 보류하세요.';
  }
  if (mfState === 'YELLOW' && regime === 'RISK_OFF') {
    return '진입 가능 신호도 애매하고 큰 흐름도 불안합니다 — 새 매수보다 기존 포지션 방어에 집중하세요.';
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
  status: 'WARNING',
  unit,
  description: '데이터 소스 장애로 해당 지표를 채점하지 않았습니다.',
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
    state: 'GREY',
    market,
    metrics: {
      trend: createEmptyMetric('추세', '좋음', ''),
      breadth: createEmptyMetric('함께 오르는 종목 비율', '좋음', ''),
      volatility: createEmptyMetric('시장 불안도', '낮음', ''),
      ftd: createEmptyMetric('반등 확인일', '확인됨', ''),
      distribution: createEmptyMetric('큰손 매도 흔적', '적음', ''),
      newHighLow: createEmptyMetric('새 고점/새 저점 균형', '좋음', ''),
      sectorRotation: createEmptyMetric('강한 업종', '확산', ''),
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
      ftdReason: '진입 가능 신호 API 응답이 없어 반등 확인일을 확인하지 못했습니다.',
      updatedAt,
    },
    insightLog: '진입 가능 신호 데이터를 불러오지 못했습니다. 현재 화면은 시장 약세 판정이 아니라 데이터 확인 필요 상태입니다.',
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
      text: '진입 가능 신호 데이터를 불러오지 못했습니다. 현재 화면은 시장 약세 판정이 아니라 데이터 확인 필요 상태입니다.',
      selected: true,
      priority: 99,
      generatedAt: updatedAt,
    }],
    aiErrorSummary: '브라우저가 진입 가능 신호 API 응답을 받지 못해 임시 데이터를 표시합니다. 점수와 상태는 투자 판단에 사용하지 마세요.',
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
      setData(null); // market 전환 시 이전 데이터 초기화
      try {
        const [mfResponse, macroResponse] = await Promise.allSettled([
          fetch(`/api/master-filter?market=${market}`, { signal: controller.signal }),
          fetch('/api/macro', { signal: controller.signal }),
        ]);

        if (mfResponse.status === 'rejected' || (mfResponse.status === 'fulfilled' && !mfResponse.value.ok)) {
          const payload = mfResponse.status === 'fulfilled' ? await mfResponse.value.json().catch(() => null) : null;
          throw new Error(payload?.message || '진입 가능 신호 데이터를 불러오지 못했습니다.');
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
          const message = err instanceof DOMException && err.name === 'AbortError' ? '진입 가능 신호 요청 시간이 초과되었습니다.' : '알 수 없는 오류';
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
