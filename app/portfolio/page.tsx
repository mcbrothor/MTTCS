'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Clipboard, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useMarket } from '@/contexts/MarketContext';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import FlowCtaButton from '@/components/ui/FlowCtaButton';
import AllocationGuidance from '@/components/portfolio/AllocationGuidance';
import AsyncStatePanel from '@/components/ui/AsyncStatePanel';
import SystemEvidencePanel, { SystemFailurePanel } from '@/components/ui/SystemEvidencePanel';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { toDisplayFailure, type DisplayFailure, type EvidenceState } from '@/components/ui/system-evidence';
import type { ApiFailure, ApiSuccess, DataSourceMeta, PortfolioRiskSummary } from '@/types';

type PortfolioActionSeverity = 'BLOCK' | 'REDUCE' | 'WARN';

function money(value: number, market: 'US' | 'KR') {
  return new Intl.NumberFormat(market === 'KR' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency: market === 'KR' ? 'KRW' : 'USD',
    maximumFractionDigits: market === 'KR' ? 0 : 2,
  }).format(value);
}

function signedMoney(value: number | null | undefined, market: 'US' | 'KR') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${money(value, market)}`;
}

function actionLabel(value: string | null | undefined) {
  if (value === 'INITIAL_ENTRY') return '초기 진입';
  if (value === 'PYRAMID') return '피라미딩';
  if (value === 'PARTIAL_EXIT') return '부분 매도';
  if (value === 'FULL_EXIT') return '전량 청산';
  if (value === 'MANUAL_EXIT') return '수동 청산';
  return value || '-';
}

function riskStatus(summary: PortfolioRiskSummary) {
  const blockCount = summary.actions?.filter((item) => item.severity === 'BLOCK').length ?? 0;
  const reduceCount = summary.actions?.filter((item) => item.severity === 'REDUCE').length ?? 0;
  if (blockCount > 0 || (summary.riskGate?.status === 'BLOCK')) {
    return {
      label: '신규 진입 중단',
      tone: 'border-rose-500/35 bg-rose-500/10 text-rose-100',
      icon: ShieldAlert,
      guidance: '새 매수보다 기존 포지션 리스크 축소가 먼저입니다.',
    };
  }
  if (reduceCount > 0 || (summary.riskGate?.status === 'REDUCE')) {
    return {
      label: '축소 사이징',
      tone: 'border-amber-500/35 bg-amber-500/10 text-amber-100',
      icon: AlertTriangle,
      guidance: '신규 후보는 평소보다 작은 수량으로만 검토합니다.',
    };
  }
  return {
    label: '정상 감시',
    tone: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100',
    icon: ShieldCheck,
    guidance: '계획된 손절선과 섹터 노출만 유지 점검합니다.',
  };
}

function severityLabel(value: PortfolioActionSeverity) {
  if (value === 'BLOCK') return '중단';
  if (value === 'REDUCE') return '축소';
  return '주의';
}

function actionTitle(value: string) {
  const map: Record<string, string> = {
    'Reduce position count': '보유 종목 수 축소',
    'Stop new entries': '신규 진입 중단',
    'Restore risk budget': '리스크 예산 회복',
    'Use reduced sizing': '축소 사이징 적용',
    'Portfolio risk gate blocked': '포트폴리오 리스크 차단',
  };
  if (value.startsWith('Trim ') && value.includes(' concentration')) return '섹터 집중 완화';
  return map[value] || value;
}

function actionDetail(title: string, detail: string) {
  if (title === 'Restore risk budget') return '리스크 예산이 회복될 때까지 신규 매수 계획 저장을 보류합니다. 먼저 손절선 조정, 부분 청산, 약한 포지션 축소를 검토합니다.';
  if (title === 'Use reduced sizing') return '새 후보를 검토하더라도 기본 수량보다 작게 잡고, 기존 포지션 리스크가 늘지 않게 관리합니다.';
  if (title === 'Portfolio risk gate blocked') return '포트폴리오 리스크 기준이 차단 상태입니다. 기존 리스크를 낮추기 전까지 신규 진입을 중단합니다.';
  return detail;
}

function warningText(value: string) {
  const positionMatch = value.match(/Active positions exceed the seed-size limit: (\d+)\/(\d+)/);
  if (positionMatch) return `활성 포지션이 계좌 규모 기준을 초과했습니다. 현재 ${positionMatch[1]}개, 권장 최대 ${positionMatch[2]}개입니다.`;
  if (value.includes('Total open risk is above 8%')) return '총 오픈 리스크가 계좌 기준 8%를 넘었습니다.';
  const heatMatch = value.match(/Portfolio heat is above the standard risk policy limit: ([\d.]+)%/);
  if (heatMatch) return `Portfolio Heat가 정책 한도를 넘었습니다. 현재 ${heatMatch[1]}%입니다.`;
  const concentrationMatch = value.match(/(.+) concentration is high: ([\d.]+)%/);
  if (concentrationMatch) return `${concentrationMatch[1]} 노출이 높습니다. 현재 ${concentrationMatch[2]}%입니다.`;
  return value;
}

function priorityActions(summary: PortfolioRiskSummary) {
  if (summary.actions && summary.actions.length > 0) {
    return summary.actions.slice(0, 3).map((item) => ({
      severity: item.severity,
      title: actionTitle(item.title),
      detail: actionDetail(item.title, item.detail),
    }));
  }
  return [{
    severity: 'WARN' as const,
    title: '손절선 유지 점검',
    detail: '보유 포지션의 손절선과 현재가 괴리를 확인하고, 계획 없는 추가 매수는 보류합니다.',
  }];
}

function PortfolioContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { market: contextMarket, setMarket: setContextMarket } = useMarket();

  const marketParam = searchParams.get('market');
  const initialMarket: 'US' | 'KR' = marketParam === 'KR' || marketParam === 'US'
    ? marketParam
    : (contextMarket || 'US');

  const [market, setMarketState] = useState<'US' | 'KR'>(initialMarket);
  const [summary, setSummary] = useState<PortfolioRiskSummary | null>(null);
  const [meta, setMeta] = useState<DataSourceMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<DisplayFailure | null>(null);

  const load = useCallback(async (nextMarket: 'US' | 'KR') => {
    setLoading(true);
    setFailure(null);
    try {
      const response = await fetch(`/api/portfolio/risk?market=${nextMarket}`);
      const body = await response.json() as ApiSuccess<PortfolioRiskSummary> | ApiFailure;
      if (!response.ok) {
        setSummary(null);
        setMeta(null);
        setFailure(toDisplayFailure(body, '포트폴리오 리스크를 불러오지 못했습니다.'));
        return;
      }
      const result = body as ApiSuccess<PortfolioRiskSummary>;
      setSummary(result.data);
      setMeta(result.meta);
    } catch (err: unknown) {
      setSummary(null);
      setMeta(null);
      setFailure(toDisplayFailure(err, '포트폴리오 리스크를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMarketChange = (next: 'US' | 'KR') => {
    setMarketState(next);
    setContextMarket(next);
    router.replace(`/portfolio?market=${next}`, { scroll: false });
    load(next);
  };

  useEffect(() => {
    load(initialMarket);
  }, [load, initialMarket]);

  // 장 시간 중 3분 자동 갱신
  useEffect(() => {
    if (loading || failure) return;
    const interval = setInterval(() => load(market), 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load, market, loading, failure]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Portfolio Risk</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">포트폴리오 리스크</h1>
          <p className="mt-3 text-sm text-slate-400">
            총 노출, 현금 비중, 오픈 리스크, 섹터 집중도와 개별 포지션 상태를 한 화면에서 점검합니다.
          </p>
        </div>
        <DataSourceBadge meta={meta} />
      </div>

      <div className="flex gap-2">
        {(['US', 'KR'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => handleMarketChange(item)}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
              market === item ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : 'border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            {item === 'US' ? '미국' : '한국'}
          </button>
        ))}
      </div>

      {loading ? (
        <AsyncStatePanel
          state="loading"
          title="포트폴리오 현황을 불러오는 중입니다"
          message="총 노출, 현금 비중, 오픈 리스크를 계산하고 있습니다."
          delayedTitle="포트폴리오 데이터를 불러오지 못하고 있습니다"
          delayedMessage="데이터 소스가 지연 중입니다. 다시 시도하거나 매매 계획 화면에서 새 계획을 먼저 작성할 수 있습니다."
          onRetry={() => load(market)}
          primaryAction={{ label: '새 매매 계획 작성', href: '/plan', variant: 'outline' }}
        >
          <PortfolioSkeleton />
        </AsyncStatePanel>
      ) : failure ? (
        <div className="space-y-3">
          <SystemFailurePanel
            title="포트폴리오 리스크를 불러오지 못했습니다"
            failure={failure}
            nextAction="신규 진입 판단을 중단하고 데이터 상태를 확인한 뒤 다시 불러오세요."
            onRetry={() => load(market)}
          />
          <Link href="/plan" className="inline-flex rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 outline-none hover:border-slate-500 focus-visible:ring-2 focus-visible:ring-emerald-300">
            새 매매 계획 작성
          </Link>
        </div>
      ) : summary ? (
        <>
          <SystemEvidencePanel
            ariaLabel="포트폴리오 데이터 신뢰도"
            title="포트폴리오 데이터 신뢰도"
            meta={meta}
            nextAction="기준시각과 대체 데이터 여부를 확인한 뒤 위험한도 판정과 함께 사용하세요."
          />

          <PortfolioRiskEvidence summary={summary} />

          <PortfolioCommandCenter summary={summary} market={market} />

          <AllocationGuidance />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric label="총 자산" value={money(summary.totalEquity, market)} helper="계좌 평가 기준" emphasis />
            <Metric label="현금" value={`${money(summary.cash, market)} (${summary.cashPct}%)`} helper="방어 여력" />
            <Metric label="오픈 리스크" value={`${money(summary.totalOpenRisk, market)} (${summary.openRiskPct}%)`} helper="손절 도달 시 예상 손실" alert={summary.openRiskPct >= 8} />
            <Metric
              label="보유 포지션"
              value={`${summary.activePositions}/${summary.maxPositions}`}
              helper={market === 'US' && (summary.scoutPositions ?? 0) > 0 ? `정찰병 ${summary.scoutPositions}개 제외` : '공식 / 권장 최대'}
              alert={summary.activePositions > summary.maxPositions}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="rounded-lg border border-slate-800 bg-slate-950/55 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">Exposure Map</p>
                  <h2 className="mt-1 text-lg font-bold text-white">섹터 노출도</h2>
                </div>
                <p className="text-xs text-slate-500">같은 섹터 과집중은 신규 진입보다 먼저 줄입니다.</p>
              </div>
              <div className="mt-5 space-y-4">
                {summary.sectorExposure.length === 0 ? (
                  <p className="text-sm text-slate-400">현재 노출된 섹터가 없습니다.</p>
                ) : summary.sectorExposure.map((row) => (
                  <div key={row.sector}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-slate-200">{row.sector} ({row.count})</span>
                      <span className="shrink-0 font-mono text-slate-400">{money(row.exposure, market)} | {row.exposurePct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded bg-slate-800">
                      <div
                        className={`${row.exposurePct >= 35 ? 'bg-amber-400' : 'bg-emerald-500'} h-full`}
                        style={{ width: `${Math.min(row.exposurePct, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-950/55 p-5">
              <p className="text-xs font-bold uppercase text-slate-500">Risk Budget</p>
              <h2 className="mt-1 text-lg font-bold text-white">리스크 예산</h2>
              <div className="mt-5 space-y-3">
                <BudgetRow label="Portfolio Heat" value={`${summary.portfolioHeatPct ?? summary.openRiskPct}%`} />
                <BudgetRow label="남은 예산" value={money(summary.riskBudgetRemaining ?? 0, market)} />
                <BudgetRow label="투입 금액" value={money(summary.investedCapital, market)} />
              </div>
              <p className="mt-4 rounded-lg border border-slate-800 bg-slate-900/45 p-3 text-sm leading-6 text-slate-300">
                신규 매수는 남은 예산이 회복되고, 보유 종목 수가 권장 범위 안으로 들어온 뒤 검토합니다.
              </p>
            </section>
          </div>

          <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Open Positions</p>
                <h2 className="mt-1 text-lg font-bold text-white">활성 포지션</h2>
              </div>
              <p className="hidden text-xs text-slate-400 sm:block">실시간 손익, 오픈 리스크, 실행 이력을 함께 점검합니다.</p>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {summary.positions && summary.positions.length > 0 ? summary.positions.map((position) => (
                <div key={position.ticker} className="rounded-lg border border-slate-800 bg-slate-900/45 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-lg font-bold text-white">{position.ticker}</p>
                      <p className="mt-1 text-xs text-slate-500">{position.name || position.industry || position.sector || '종목명 확인 중'}</p>
                    </div>
                    <div className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200">
                      {position.isScout ? '정찰병' : actionLabel(position.latestAction)}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <PositionMetric label="노출 금액" value={money(position.exposure, market)} />
                    <PositionMetric label="보유 수량" value={position.netShares.toLocaleString()} />
                    <PositionMetric label="평균 단가" value={position.avgEntryPrice === null ? '-' : money(position.avgEntryPrice, market)} />
                    <PositionMetric label="현재가" value={position.currentPrice === null ? '-' : money(position.currentPrice, market)} />
                    <PositionMetric
                      label="평가손익"
                      value={signedMoney(position.unrealizedPnL, market)}
                      accent={typeof position.unrealizedPnL === 'number' && position.unrealizedPnL >= 0 ? 'text-emerald-300' : 'text-rose-300'}
                    />
                    <PositionMetric
                      label="평가 R"
                      value={typeof position.unrealizedR === 'number' ? `${position.unrealizedR.toFixed(2)}R` : '-'}
                      accent={typeof position.unrealizedR === 'number' && position.unrealizedR >= 0 ? 'text-emerald-300' : 'text-rose-300'}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                      피라미딩 {position.pyramidCount}회
                    </span>
                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
                      부분 매도 {position.partialExitCount}회
                    </span>
                    <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-100">
                      오픈 리스크 {money(position.openRisk, market)}{typeof position.openRiskPct === 'number' ? ` (${position.openRiskPct}%)` : ''}
                    </span>
                    <Link
                      href={`/history?market=${market}&ticker=${position.ticker}`}
                      className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-200 transition-colors hover:bg-violet-500/20"
                    >
                      복기 작성 →
                    </Link>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-slate-400">현재 활성 포지션이 없습니다.</p>
              )}
            </div>
          </section>
        </>
      ) : null}

      <FlowCtaButton 
        nextPath="/history" 
        label="매매 일기 작성하기" 
        subLabel="Step 6: Review"
        variant="indigo"
      />
    </div>
  );
}

function PortfolioCommandCenter({ summary, market }: { summary: PortfolioRiskSummary; market: 'US' | 'KR' }) {
  const status = riskStatus(summary);
  const StatusIcon = status.icon;
  const actions = priorityActions(summary);
  const warnings = summary.warnings.map(warningText);

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-5">
      <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <div className={`rounded-lg border p-4 ${status.tone}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-current/25 bg-black/15">
              <StatusIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase opacity-75">오늘의 상태</p>
              <p className="text-lg font-bold text-white">{status.label}</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6">{status.guidance}</p>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <Clipboard className="h-4 w-4 text-emerald-300" />
            <h2 className="text-base font-bold text-white">우선 지침</h2>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {actions.map((item, index) => (
              <div key={`${item.severity}-${item.title}-${index}`} className="rounded-lg border border-slate-800 bg-slate-900/45 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded px-2 py-1 text-[11px] font-bold ${
                    item.severity === 'BLOCK' ? 'bg-rose-500/15 text-rose-200' : item.severity === 'REDUCE' ? 'bg-amber-500/15 text-amber-200' : 'bg-sky-500/15 text-sky-200'
                  }`}>
                    {severityLabel(item.severity)}
                  </span>
                  <span className="font-mono text-xs text-slate-600">0{index + 1}</span>
                </div>
                <p className="mt-3 text-sm font-bold text-white">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/35 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              <h2 className="text-base font-bold text-white">경고 큐</h2>
            </div>
            <span className="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-slate-300">{warnings.length}</span>
          </div>
          <div className="mt-3 space-y-2">
            {warnings.length === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>현재 즉시 조치가 필요한 경고는 없습니다.</span>
              </div>
            ) : warnings.slice(0, 5).map((warning) => (
              <div key={warning} className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm leading-6 text-amber-100">
                {warning}
              </div>
            ))}
            {warnings.length > 5 && <p className="text-xs text-slate-500">외 {warnings.length - 5}개 경고가 더 있습니다.</p>}
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 border-t border-slate-800 pt-4 text-sm text-slate-400 sm:grid-cols-3">
        <QuickRule label="공식 포지션 수" value={`${summary.activePositions}/${summary.maxPositions}`} detail={summary.scoutPositions ? `$100 미만 정찰병 ${summary.scoutPositions}개 제외` : '권장 최대 초과 시 신규 진입 보류'} />
        <QuickRule label="현금 비중" value={`${summary.cashPct}%`} detail="방어 여력과 추가 매수 여지를 같이 판단" />
        <QuickRule label="기준 시장" value={market === 'KR' ? '한국' : '미국'} detail="시장별 계좌 규모 제한을 별도로 적용" />
      </div>
    </section>
  );
}

function PortfolioRiskEvidence({ summary }: { summary: PortfolioRiskSummary }) {
  const hasBlockAction = summary.actions?.some((item) => item.severity === 'BLOCK') ?? false;
  const hasReduceAction = summary.actions?.some((item) => item.severity === 'REDUCE') ?? false;
  const isBlocked = summary.riskGate?.status === 'BLOCK' || hasBlockAction;
  const isReduced = summary.riskGate?.status === 'REDUCE' || hasReduceAction;
  const state: EvidenceState = isBlocked
    ? 'blocked'
    : isReduced
      ? 'limited'
      : summary.riskGate?.status === 'PASS'
        ? 'ready'
        : 'waiting';
  const reasons = Array.from(new Set([
    ...(summary.riskGate?.reasons || []).map((reason) => reason.message),
    ...(summary.actions || [])
      .filter((item) => item.severity === 'BLOCK' || item.severity === 'REDUCE')
      .map((item) => item.detail || item.title),
  ].filter(Boolean)));
  const statusLabel = summary.riskGate?.status === 'BLOCK'
    ? '차단'
    : summary.riskGate?.status === 'REDUCE'
      ? '축소'
      : summary.riskGate?.status === 'PASS'
        ? '통과'
        : hasBlockAction
          ? '차단'
          : hasReduceAction
            ? '축소'
            : '미측정';
  const nextAction = isBlocked
    ? '신규 진입을 중단하고 차단 근거를 해소하세요.'
    : isReduced
      ? '신규 후보의 수량을 줄이고 기존 오픈 리스크부터 낮추세요.'
      : state === 'ready'
        ? '현재 위험한도를 유지하며 손절선과 섹터 노출을 계속 점검하세요.'
        : '위험한도 판정 근거가 제공될 때까지 신규 진입 판단을 보류하세요.';

  return (
    <SystemEvidencePanel
      ariaLabel="포트폴리오 위험한도 판정"
      title="포트폴리오 위험한도 판정"
      state={state}
      showStandardMeta={false}
      items={[
        { label: '위험한도 상태', value: statusLabel, detail: 'API riskGate 및 운영 조치 기준' },
        { label: '판정 근거', value: reasons.length > 0 ? reasons.join(' · ') : '미측정', detail: reasons.length > 0 ? `${reasons.length}건` : 'API가 판정 사유를 제공하지 않았습니다.' },
        { label: '포지션 한도', value: `${summary.activePositions}/${summary.maxPositions}`, detail: '현재 활성 / 권장 최대' },
        { label: '오픈 리스크', value: `${summary.openRiskPct}%`, detail: '손절 도달 시 예상 손실 비율' },
        { label: '미측정 포지션', value: typeof summary.unknownRiskPositions === 'number' ? `${summary.unknownRiskPositions}개` : '미측정', detail: '오픈 리스크 계산 불가 포지션' },
      ]}
      nextAction={nextAction}
    />
  );
}

function QuickRule({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/25 p-3">
      <div>
        <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
        <p className="mt-1 text-sm text-slate-300">{detail}</p>
      </div>
      <p className="shrink-0 font-mono text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function Metric({ label, value, helper, emphasis = false, alert = false }: { label: string; value: string; helper: string; emphasis?: boolean; alert?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 transition-colors ${
      alert ? 'border-rose-500/30 bg-rose-500/10' : emphasis ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/50'
    }`}>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-2 break-words font-mono text-xl font-bold text-white">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function PortfolioSkeleton() {
  return (
    <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-3">
      {['총 자산', '오픈 리스크', '보유 포지션'].map((label) => (
        <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <div className="mt-3 h-5 w-24 animate-pulse rounded bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

function PositionMetric({ label, value, accent = 'text-white' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 font-mono text-sm font-bold ${accent}`}>{value}</p>
    </div>
  );
}

function BudgetRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="font-mono text-sm font-bold text-white">{value}</span>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center p-12 text-slate-400">
          <LoadingSpinner />
          <span className="ml-3 text-sm font-medium">포트폴리오 로드 중...</span>
        </div>
      }
    >
      <PortfolioContent />
    </Suspense>
  );
}
