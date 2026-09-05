'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Lock,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import AsyncStatePanel from '@/components/ui/AsyncStatePanel';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import StrategyColumnHeader from '@/components/strategy/StrategyColumnHeader';
import {
  StrategyCapitalInput,
  StrategyMoneyInput,
  StrategyRiskPause,
  StrategySettingsHeader,
} from '@/components/strategy/StrategyMoneyInputs';
import type { DataSourceMeta } from '@/types';
import {
  GOLD_PRODUCT_CODES,
  type GoldBaseCurrency,
  type GoldDataQualityStatus,
  type GoldHistoryResponse,
  type GoldProductAnalysisView,
  type GoldProductCode,
  type GoldSettingsView,
  type GoldSnapshotsResponse,
  type GoldStrategyResponse,
} from '@/lib/gold/api-contract';
import {
  DEFAULT_GOLD_SETTINGS,
  isGoldHistoryResponse,
  isGoldSettingsView,
  isGoldSnapshotsResponse,
  isGoldStrategyResponse,
  requestGoldApi,
} from '@/components/gold/gold-api-client';

const LightweightChart = dynamic(() => import('@/components/analysis/LightweightChart'), {
  ssr: false,
  loading: () => <div className="h-[360px] animate-pulse rounded-lg bg-slate-900" />,
});

const PRODUCT_LABEL: Record<GoldProductCode, string> = {
  GLD: 'GLD · SPDR Gold Shares',
  '411060': '411060 · ACE KRX금현물',
  '132030': '132030 · KODEX 골드선물(H)',
};

const QUALITY_TONE: Record<GoldDataQualityStatus, string> = {
  VALID: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  DEGRADED: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  BLOCKED: 'border-rose-500/30 bg-rose-500/10 text-rose-100',
};

const DECISION_TONE: Record<GoldStrategyResponse['decision']['code'], string> = {
  BLOCKED: 'border-rose-500/35 bg-rose-500/10',
  CORE_REVIEW: 'border-amber-500/35 bg-amber-500/10',
  CORE_ACCUMULATE: 'border-amber-400/35 bg-amber-400/10',
  WAIT: 'border-slate-700 bg-slate-950/55',
  TACTICAL_ENTRY: 'border-emerald-500/35 bg-emerald-500/10',
  PAUSED: 'border-rose-500/35 bg-rose-500/10',
};

type Histories = Partial<Record<GoldProductCode, GoldHistoryResponse>>;

function money(value: number, currency: GoldBaseCurrency) {
  return new Intl.NumberFormat(currency === 'KRW' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

function price(value: number | null, currency: 'KRW' | 'USD') {
  if (value === null) return '--';
  return new Intl.NumberFormat(currency === 'KRW' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

function number(value: number | null, maximumFractionDigits = 2) {
  if (value === null) return '--';
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits }).format(value);
}

function dateTime(value: string | null) {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function inputNumber(value: string) {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function safeExternalUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function GoldStrategyDashboard() {
  const [strategy, setStrategy] = useState<GoldStrategyResponse | null>(null);
  const [settings, setSettings] = useState<GoldSettingsView>(DEFAULT_GOLD_SETTINGS);
  const [draft, setDraft] = useState<GoldSettingsView>(DEFAULT_GOLD_SETTINGS);
  const [histories, setHistories] = useState<Histories>({});
  const [snapshots, setSnapshots] = useState<GoldSnapshotsResponse>({ items: [] });
  const [meta, setMeta] = useState<DataSourceMeta | null>(null);
  const [chartProduct, setChartProduct] = useState<GoldProductCode>('132030');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supplementalError, setSupplementalError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadStrategy = useCallback(async (activeSettings: GoldSettingsView) => {
    const strategyQuery = new URLSearchParams({
      coreProduct: activeSettings.coreProduct,
      tacticalProduct: activeSettings.tacticalProduct,
      baseCurrency: activeSettings.baseCurrency,
    });
    const strategyEnvelope = await requestGoldApi(
      `/api/gold/strategy?${strategyQuery.toString()}`,
      isGoldStrategyResponse,
    );

    setStrategy(strategyEnvelope?.data ?? null);
    setMeta(strategyEnvelope?.meta ?? null);
    if (!strategyEnvelope) {
      setHistories({});
      setSnapshots({ items: [] });
      return;
    }

    const products = Array.from(new Set([
      activeSettings.coreProduct,
      activeSettings.tacticalProduct,
    ]));
    const [historyResult, snapshotsResult] = await Promise.allSettled([
      Promise.all(products.map(async (product) => ({
        product,
        envelope: await requestGoldApi(
          `/api/gold/history?product=${encodeURIComponent(product)}&range=1y`,
          isGoldHistoryResponse,
        ),
      }))),
      requestGoldApi('/api/gold/snapshots', isGoldSnapshotsResponse),
    ]);

    const notices: string[] = [];
    if (historyResult.status === 'fulfilled') {
      const nextHistories: Histories = {};
      for (const result of historyResult.value) {
        if (result.envelope) nextHistories[result.product] = result.envelope.data;
      }
      setHistories(nextHistories);
    } else {
      setHistories({});
      notices.push('가격 차트를 불러오지 못했습니다.');
    }

    if (snapshotsResult.status === 'fulfilled') {
      setSnapshots(snapshotsResult.value?.data ?? { items: [] });
    } else {
      setSnapshots({ items: [] });
      notices.push('신호 이력을 불러오지 못했습니다.');
    }
    setSupplementalError(notices.length > 0 ? notices.join(' ') : null);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSupplementalError(null);
    setSaveMessage(null);
    setSaveError(null);
    try {
      const settingsEnvelope = await requestGoldApi('/api/gold/settings', isGoldSettingsView);
      const activeSettings = settingsEnvelope?.data ?? DEFAULT_GOLD_SETTINGS;
      setSettings(activeSettings);
      setDraft(activeSettings);
      setChartProduct(activeSettings.tacticalProduct);
      await loadStrategy(activeSettings);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '금 전략 데이터를 불러오지 못했습니다.');
      setStrategy(null);
    } finally {
      setLoading(false);
    }
  }, [loadStrategy]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      const editableSettings = {
        coreProduct: draft.coreProduct,
        tacticalProduct: draft.tacticalProduct,
        baseCurrency: draft.baseCurrency,
        manualAccountValue: draft.manualAccountValue,
        externalGoldValue: draft.externalGoldValue,
        physicalGoldValue: draft.physicalGoldValue,
        executionLevels: draft.executionLevels,
        riskPaused: draft.riskPaused,
      };
      const savedEnvelope = await requestGoldApi('/api/gold/settings', isGoldSettingsView, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editableSettings),
      });
      if (!savedEnvelope) throw new Error('저장된 설정을 확인할 수 없습니다.');
      setSettings(savedEnvelope.data);
      setDraft(savedEnvelope.data);
      setChartProduct(savedEnvelope.data.tacticalProduct);
      await loadStrategy(savedEnvelope.data);
      setSaveMessage('설정을 저장하고 전략을 다시 계산했습니다.');
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : '금 전략 설정을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const chartHistory = histories[chartProduct];
  const chartData = useMemo(() => (
    chartHistory?.bars.map((bar) => ({
      time: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    })) ?? []
  ), [chartHistory]);
  const chartAnalysis = strategy?.products.core.product.code === chartProduct
    ? strategy.products.core
    : strategy?.products.tactical.product.code === chartProduct
      ? strategy.products.tactical
      : null;
  const stale = Boolean(
    strategy && (strategy.quality.status !== 'VALID' || meta?.isStale),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12" data-testid="gold-strategy-dashboard">
      {!loading && !error && strategy ? (
        <DecisionBriefing
          strategy={strategy}
          meta={meta}
          stale={stale}
          onReload={() => void reload()}
        />
      ) : (
        <GoldPageHeader meta={meta} loading={loading} onReload={() => void reload()} />
      )}

      {loading ? (
        <AsyncStatePanel
          state="loading"
          title="금 전략 데이터를 불러오는 중입니다"
          message="설정, 상품별 가격, 매크로 점수와 최근 신호를 검증하고 있습니다."
        />
      ) : error ? (
        <AsyncStatePanel
          state="error"
          title="금 투자 전략을 불러오지 못했습니다"
          message={error}
          onRetry={() => void reload()}
        />
      ) : !strategy ? (
        <AsyncStatePanel
          state="empty"
          title="아직 계산된 금 전략이 없습니다"
          message="가격·매크로 데이터가 준비된 뒤 다시 계산하세요. 데이터가 불완전하면 전술 비중은 자동으로 차단됩니다."
          onRetry={() => void reload()}
        />
      ) : (
        <>
          {supplementalError && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              {supplementalError}
            </div>
          )}
          <SettingsPanel
            draft={draft}
            savedSettings={settings}
            saving={saving}
            saveMessage={saveMessage}
            saveError={saveError}
            onDraftChange={setDraft}
            onSubmit={saveSettings}
          />

          <GoldEntryTimingGuide strategy={strategy} />
          <AllocationPanel strategy={strategy} />
          <ExecutionPlanPanel strategy={strategy} />

          <section className="grid gap-4 xl:grid-cols-2">
            <ProductAnalysisCard title="장기 코어 상품" analysis={strategy.products.core} />
            <ProductAnalysisCard title="전술 상품" analysis={strategy.products.tactical} />
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Product OHLC</p>
                <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">상품별 가격 차트</h2>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  XAU/USD 값을 환산하지 않고 선택한 상품의 가격만 표시합니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([strategy.products.core.product.code, strategy.products.tactical.product.code])).map((product) => (
                  <button
                    key={product}
                    type="button"
                    onClick={() => setChartProduct(product)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                      chartProduct === product
                        ? 'border-amber-400/40 bg-amber-500/10 text-amber-100'
                        : 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {PRODUCT_LABEL[product]}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5">
              {chartData.length > 0 ? (
                <LightweightChart
                  data={chartData}
                  pivotPrice={chartAnalysis?.executionLevels.resistance}
                  stopLossPrice={chartProduct === strategy.products.tactical.product.code
                    ? strategy.tacticalPlan.initialStop
                    : null}
                  targetPrice={chartAnalysis?.executionLevels.target}
                  pivotLabel="Resistance"
                  height={360}
                />
              ) : (
                <AsyncStatePanel
                  state="empty"
                  title="표시할 가격 이력이 없습니다"
                  message={`${PRODUCT_LABEL[chartProduct]}의 OHLC 데이터가 준비되지 않았습니다.`}
                />
              )}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <MacroPanel strategy={strategy} />
            <CorePlanPanel strategy={strategy} />
          </section>

          <TacticalPlanPanel strategy={strategy} />

          <BacktestPanel strategy={strategy} />

          <details className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-5">
            <summary className="cursor-pointer list-none text-sm font-bold text-rose-100">
              고급 하락 돌파 시나리오 · 실행 불가
            </summary>
            <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
              <InfoCell label="조건" value={strategy.advancedShort.condition} />
              <InfoCell label="손절" value={strategy.advancedShort.stop} />
              <InfoCell label="목표" value={strategy.advancedShort.targets.join(' → ')} />
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-rose-200">
              <Lock className="h-4 w-4" />
              레버리지와 공매도 주문은 v1에서 지원하지 않습니다. 표시 위험 한도는 {strategy.advancedShort.riskPct}%입니다.
            </p>
          </details>

          <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <QualityPanel strategy={strategy} meta={meta} />
            <SnapshotPanel snapshots={snapshots} />
          </section>

          <ReferenceScenario strategy={strategy} />
        </>
      )}
    </div>
  );
}

function GoldPageHeader({
  meta,
  loading,
  onReload,
}: {
  meta: DataSourceMeta | null;
  loading: boolean;
  onReload: () => void;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Gold Strategy</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--text-primary)]">금 투자 전략</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
          상품별 가격만 사용해 코어 4%와 전술 최대 6%를 분리 관리합니다. 이 화면은 연구 신호이며 주문을 실행하지 않습니다.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200">
          RESEARCH_ONLY
        </span>
        <DataSourceBadge meta={meta} />
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />
          새로고침
        </button>
      </div>
    </header>
  );
}

function allocationDecision(strategy: GoldStrategyResponse) {
  const difference = strategy.allocation.differenceAmount;
  const allocationStatus = difference > 0
    ? `목표까지 ${money(difference, strategy.settings.baseCurrency)} 부족`
    : difference < 0
      ? `목표보다 ${money(Math.abs(difference), strategy.settings.baseCurrency)} 초과`
      : '현재 금 노출이 목표에 도달';
  return `${allocationStatus}. ${strategy.decision.coreAction}`;
}

function avoidDecision(strategy: GoldStrategyResponse) {
  if (strategy.decision.code === 'BLOCKED' || strategy.decision.code === 'PAUSED') {
    return '데이터 또는 위험 일시중지가 해제되기 전에는 신규 금 매수를 시작하지 마세요.';
  }
  if (strategy.tacticalPlan.allowed) {
    return '금 전체 10% 초과, 손절 없는 진입, 레버리지 사용은 금지합니다.';
  }
  return '전술 신규 매수와 추격 매수를 시작하지 마세요. 레버리지는 계속 사용하지 않습니다.';
}

function nextDecisionCondition(strategy: GoldStrategyResponse) {
  if (strategy.quality.status !== 'VALID') {
    return '데이터 품질이 VALID로 회복된 뒤 전략을 다시 계산합니다.';
  }
  const product = strategy.products.tactical.product.code;
  const currency = strategy.products.tactical.product.currency;
  if (strategy.tacticalPlan.allowed) {
    return `${product} 진입 기준 ${price(strategy.tacticalPlan.entryPrice, currency)}와 2ATR 손절 ${price(strategy.tacticalPlan.initialStop, currency)}를 확인합니다.`;
  }
  const breakoutPrice =
    strategy.products.tactical.executionLevels.resistance
    ?? strategy.tacticalPlan.entryPrice;
  const breakout = breakoutPrice === null
    ? '20일 최고가 돌파'
    : `${product} 종가 ${price(breakoutPrice, currency)} 상향 돌파`;
  return `${breakout}와 매크로 점수 +1 이상을 함께 확인합니다. 월말 추세 ON이면 전술 전체 한도를 재평가합니다.`;
}

function DecisionBriefing({
  strategy,
  meta,
  stale,
  onReload,
}: {
  strategy: GoldStrategyResponse;
  meta: DataSourceMeta | null;
  stale: boolean;
  onReload: () => void;
}) {
  const macroScore = strategy.macro.score === null
    ? '--'
    : `${strategy.macro.score > 0 ? '+' : ''}${strategy.macro.score}`;
  return (
    <section
      data-testid="gold-decision-briefing"
      className={`overflow-hidden rounded-xl border ${DECISION_TONE[strategy.decision.code]}`}
    >
      <div className="border-b border-white/10 bg-gradient-to-r from-amber-500/10 via-transparent to-slate-950/30 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
                오늘의 의사결정 브리핑
              </p>
              <span className="text-xs text-slate-500">· {dateTime(strategy.asOf)} 기준</span>
            </div>
            <h1 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">금 투자 전략</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-amber-400/35 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-bold text-amber-200">
              RESEARCH_ONLY
            </span>
            <QualityBadge status={strategy.quality.status} />
            <DataSourceBadge meta={meta} />
            <button
              type="button"
              onClick={onReload}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:border-white/20 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
              새로고침
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.45fr)]">
        <div>
          <p className="text-xs font-semibold text-slate-400">현재 판단</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold leading-tight text-white sm:text-3xl">{strategy.decision.label}</h2>
            <span className="rounded-md border border-white/15 px-2 py-1 font-mono text-[10px] text-slate-300">
              {strategy.decision.code}
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{strategy.decision.summary}</p>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <DecisionStep
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="지금 할 일"
              value={allocationDecision(strategy)}
              tone="positive"
            />
            <DecisionStep
              icon={<ShieldAlert className="h-4 w-4" />}
              label="하지 말 일"
              value={avoidDecision(strategy)}
              tone="negative"
            />
            <DecisionStep
              icon={<RefreshCw className="h-4 w-4" />}
              label="다음 전환 조건"
              value={nextDecisionCondition(strategy)}
              tone="neutral"
            />
          </div>
        </div>

        <aside className="rounded-lg border border-white/10 bg-black/15 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">결정에 필요한 숫자</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <BriefingMetric
              label="전략 계산 원금"
              value={money(strategy.allocation.accountValue, strategy.settings.baseCurrency)}
              helper={strategy.allocation.accountValueSource === 'MANUAL' ? '직접 입력 원금' : '통합 포트폴리오'}
            />
            <BriefingMetric
              label="목표 금액"
              value={money(strategy.allocation.totalTargetAmount, strategy.settings.baseCurrency)}
              helper={`현재 목표 ${number(strategy.allocation.totalTargetPct)}%`}
            />
            <BriefingMetric
              label="현재 금 노출"
              value={`${number(strategy.allocation.currentExposurePct)}%`}
              helper={`최대 ${strategy.policy.maxGoldPct}%`}
            />
            <BriefingMetric
              label="현재 목표"
              value={`${number(strategy.allocation.totalTargetPct)}%`}
              helper={`코어 ${number(strategy.allocation.coreTargetPct)}%`}
            />
            <BriefingMetric
              label="전술 허용"
              value={`${number(strategy.allocation.tacticalTargetPct)}%`}
              helper={strategy.tacticalPlan.allowed ? '진입 가능' : '진입 대기'}
            />
            <BriefingMetric
              label="매크로 점수"
              value={macroScore}
              helper={strategy.macro.complete ? '완전한 점수' : '전술 차단'}
            />
          </div>
          <p className="mt-3 rounded-md bg-white/5 px-3 py-2 text-xs leading-5 text-slate-400">
            {strategy.products.core.product.code} 코어 · {strategy.products.tactical.product.code} 전술 · 레버리지 OFF
          </p>
        </aside>
      </div>

      {stale && (
        <div
          data-testid="gold-stale-warning"
          className={`mx-5 mb-5 rounded-lg border p-4 text-sm sm:mx-6 sm:mb-6 ${QUALITY_TONE[strategy.quality.status]}`}
        >
          <p className="font-bold">데이터 품질 {strategy.quality.status} · 신규 전술 진입 차단</p>
          <p className="mt-1 opacity-80">
            {strategy.quality.reasons.join(' ') || meta?.staleReason || '최신 데이터를 확인한 뒤 전략을 다시 계산하세요.'}
          </p>
        </div>
      )}
    </section>
  );
}

function DecisionStep({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'neutral';
}) {
  const toneClass = tone === 'positive'
    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
    : tone === 'negative'
      ? 'border-rose-500/25 bg-rose-500/10 text-rose-200'
      : 'border-sky-500/25 bg-sky-500/10 text-sky-200';
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="flex items-center gap-2 text-xs font-bold">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-300">{value}</p>
    </div>
  );
}

function BriefingMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-3">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold text-white">{value}</p>
      <p className="mt-1 text-[10px] text-slate-500">{helper}</p>
    </div>
  );
}

function SettingsPanel({
  draft,
  savedSettings,
  saving,
  saveMessage,
  saveError,
  onDraftChange,
  onSubmit,
}: {
  draft: GoldSettingsView;
  savedSettings: GoldSettingsView;
  saving: boolean;
  saveMessage: string | null;
  saveError: string | null;
  onDraftChange: (settings: GoldSettingsView) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [levelProduct, setLevelProduct] = useState<GoldProductCode>(draft.tacticalProduct);
  const level = draft.executionLevels[levelProduct] ?? {
    support: null,
    resistance: null,
    target: null,
    updatedAt: null,
  };
  const dirty = JSON.stringify({
    ...draft,
    updatedAt: null,
  }) !== JSON.stringify({
    ...savedSettings,
    updatedAt: null,
  });

  const updateLevel = (key: 'support' | 'resistance' | 'target', value: string) => {
    const nextValue = value.trim() ? inputNumber(value) : null;
    onDraftChange({
      ...draft,
      executionLevels: {
        ...draft.executionLevels,
        [levelProduct]: {
          ...level,
          [key]: nextValue,
        },
      },
    });
  };

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-5">
      <StrategySettingsHeader
        description="저장 후 선택 상품의 자체 가격으로 전략을 다시 계산합니다."
        saving={saving}
        disabled={saving || !dirty}
        saveLabel="설정 저장"
      />

      <div className="mt-5">
        <StrategyCapitalInput
          idPrefix="gold"
          currency={draft.baseCurrency}
          value={draft.manualAccountValue}
          description="입력한 원금을 기준으로 코어 4%·전술 최대 6%와 각 분할 금액을 계산합니다. 비우거나 0을 입력하면 통합 포트폴리오 자산으로 복귀합니다."
          onCurrencyChange={(baseCurrency) => onDraftChange({ ...draft, baseCurrency })}
          onValueChange={(manualAccountValue) => onDraftChange({ ...draft, manualAccountValue })}
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SelectField
          id="gold-core-product"
          label="코어 상품"
          value={draft.coreProduct}
          onChange={(value) => onDraftChange({ ...draft, coreProduct: value as GoldProductCode })}
          options={GOLD_PRODUCT_CODES.map((code) => ({ value: code, label: PRODUCT_LABEL[code] }))}
        />
        <SelectField
          id="gold-tactical-product"
          label="전술 상품"
          value={draft.tacticalProduct}
          onChange={(value) => onDraftChange({ ...draft, tacticalProduct: value as GoldProductCode })}
          options={GOLD_PRODUCT_CODES.map((code) => ({ value: code, label: PRODUCT_LABEL[code] }))}
        />
        <StrategyMoneyInput
          id="gold-external-value"
          label="외부 금융 금 평가액"
          currency={draft.baseCurrency}
          value={draft.externalGoldValue}
          onChange={(externalGoldValue) => onDraftChange({ ...draft, externalGoldValue })}
        />
        <StrategyMoneyInput
          id="gold-physical-value"
          label="실물 금 평가액"
          currency={draft.baseCurrency}
          value={draft.physicalGoldValue}
          onChange={(physicalGoldValue) => onDraftChange({ ...draft, physicalGoldValue })}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        외부·실물 금 평가액은 선택한 기준 통화({draft.baseCurrency})로 입력합니다.
      </p>

      <details className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--text-primary)]">
          상품별 실행 레벨 · {PRODUCT_LABEL[levelProduct]}
        </summary>
        <div className="mt-4 flex flex-wrap gap-2">
          {GOLD_PRODUCT_CODES.map((product) => (
            <button
              key={product}
              type="button"
              onClick={() => setLevelProduct(product)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                levelProduct === product
                  ? 'border-amber-400/40 bg-amber-500/10 text-amber-100'
                  : 'border-[var(--border)] text-[var(--text-secondary)]'
              }`}
            >
              {product}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <NullableNumberField id="gold-support" label="지지" value={level.support} onChange={(value) => updateLevel('support', value)} />
          <NullableNumberField id="gold-resistance" label="저항/진입" value={level.resistance} onChange={(value) => updateLevel('resistance', value)} />
          <NullableNumberField id="gold-target" label="목표" value={level.target} onChange={(value) => updateLevel('target', value)} />
        </div>
        <p className="mt-3 text-xs text-slate-500">다른 상품이나 XAU/USD의 가격을 자동 환산하지 않습니다.</p>
      </details>

      <StrategyRiskPause
        checked={draft.riskPaused}
        description="위험 일시중지 — 활성화하면 신규 위험 투입 금액을 0으로 차단합니다."
        onChange={(riskPaused) => onDraftChange({ ...draft, riskPaused })}
      />
      {saveMessage && <p className="mt-3 text-sm font-semibold text-emerald-300">{saveMessage}</p>}
      {saveError && <p className="mt-3 text-sm font-semibold text-rose-300">저장 실패: {saveError}</p>}
    </form>
  );
}

function AllocationPanel({ strategy }: { strategy: GoldStrategyResponse }) {
  const allocation = strategy.allocation;
  const differenceLabel = allocation.differenceAmount > 0 ? '목표까지 부족' : allocation.differenceAmount < 0 ? '목표 초과' : '목표 도달';
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Unified Exposure</p>
          <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">통합 금 노출</h2>
        </div>
        <span className="text-xs text-[var(--text-secondary)]">현재 {number(allocation.currentExposurePct)}% / 최대 10%</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="전략 계산 원금"
          value={money(allocation.accountValue, strategy.settings.baseCurrency)}
          helper={allocation.accountValueSource === 'MANUAL'
            ? `직접 입력 · 통합 자산 ${money(allocation.portfolioAccountValue, strategy.settings.baseCurrency)}`
            : '통합 포트폴리오 자산 기준'}
          emphasis={allocation.accountValueSource === 'MANUAL'}
        />
        <Metric label="기존 금 보유" value={money(allocation.totalExistingGoldValue, strategy.settings.baseCurrency)} helper={`계좌 ${money(allocation.existingPortfolioGoldValue, strategy.settings.baseCurrency)} 포함`} />
        <Metric label="금 목표 금액" value={money(allocation.totalTargetAmount, strategy.settings.baseCurrency)} helper={`코어 ${money(allocation.coreTargetAmount, strategy.settings.baseCurrency)} · 전술 ${money(allocation.tacticalTargetAmount, strategy.settings.baseCurrency)}`} />
        <Metric
          label={differenceLabel}
          value={money(Math.abs(allocation.differenceAmount), strategy.settings.baseCurrency)}
          helper={`상태 ${allocation.status}`}
          alert={allocation.status === 'OVER'}
        />
      </div>
    </section>
  );
}

function GoldEntryTimingGuide({ strategy }: { strategy: GoldStrategyResponse }) {
  const technical = strategy.products.tactical.technical;
  const signalUsable = strategy.quality.status === 'VALID' && !strategy.settings.riskPaused;
  const coreReady = signalUsable && strategy.corePlan.tranches.some((tranche) => tranche.ready);
  const quickEntryReady = signalUsable
    && technical.fastBreakout
    && strategy.macro.complete
    && (strategy.macro.score ?? -3) >= 1;
  const trendEntryReady = signalUsable
    && technical.monthEndTrend === 'ON'
    && strategy.macro.complete
    && (strategy.macro.score ?? -3) >= 0;
  const tacticalStatus = strategy.tacticalPlan.allowed
    ? '전술 진입 가능'
    : strategy.settings.riskPaused
      ? '위험 일시중지'
      : strategy.quality.status !== 'VALID'
        ? '데이터 확인 필요'
        : '전술 진입 대기';

  return (
    <section
      data-testid="gold-entry-guide"
      className="rounded-xl border border-sky-400/25 bg-sky-500/5 p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">Entry Timing</p>
          <h2 className="mt-1 text-xl font-bold text-white">언제 진입하나요?</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            예측해서 먼저 사지 않고, 아래 조건이 종가로 확인된 뒤 실행표에서 <strong className="text-emerald-300">READY인 단계만</strong> 다음 거래 가능 시점에 검토합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-lg border px-3 py-2 text-xs font-bold ${
            strategy.tacticalPlan.allowed
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
              : 'border-amber-400/30 bg-amber-500/10 text-amber-200'
          }`}>
            현재: {tacticalStatus}
          </span>
          <Link
            href="/guide#gold-strategy"
            className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/15"
          >
            <BookOpen className="h-4 w-4" />
            금 메뉴 설명서
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <EntryRuleCard
          step="1"
          title="코어 4% 분할"
          ready={coreReady}
          action={coreReady ? '코어 실행표의 1차 금액부터 검토' : '가격 데이터와 위험 일시중지 상태 확인'}
          condition="코어는 장기 보유 목적입니다. 한 번에 채우지 않고 3회 분할하며 전술 신호와 구분합니다."
        />
        <EntryRuleCard
          step="2"
          title="빠른 전술 재진입"
          ready={quickEntryReady}
          action={quickEntryReady ? '전술 한도의 절반만 1차 진입' : '20일 최고가 돌파와 매크로 +1 이상을 함께 대기'}
          condition={`${strategy.settings.tacticalProduct} 20일 돌파 ${technical.fastBreakout ? '충족' : '미충족'} · 매크로 ${strategy.macro.score === null ? '누락' : strategy.macro.score >= 0 ? `+${strategy.macro.score}` : strategy.macro.score}`}
        />
        <EntryRuleCard
          step="3"
          title="월말 추세 본진입"
          ready={trendEntryReady}
          action={trendEntryReady ? `허용 전술 비중 ${number(strategy.allocation.tacticalTargetPct)}%까지 분할` : '6개월 월말 추세 ON과 완전한 매크로 점수를 대기'}
          condition={`월말 추세 ${technical.monthEndTrend} · 매크로 완전성 ${strategy.macro.complete ? '완전' : '불완전'} · 데이터 ${strategy.quality.status}`}
        />
      </div>

      <p className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/8 p-3 text-xs leading-5 text-rose-100">
        PAUSED·BLOCKED·DEGRADED이거나 실행표가 WAIT이면 신규 전술 매수는 하지 않습니다. 손절가는 선택 상품 자체 가격의 2ATR 기준이며 XAU/USD 참고값을 국내 ETF에 환산하지 않습니다.
      </p>
    </section>
  );
}

function EntryRuleCard({
  step,
  title,
  ready,
  action,
  condition,
}: {
  step: string;
  title: string;
  ready: boolean;
  action: string;
  condition: string;
}) {
  return (
    <article className={`rounded-lg border p-4 ${
      ready
        ? 'border-emerald-400/30 bg-emerald-500/8'
        : 'border-slate-700 bg-slate-950/45'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-white">{step}. {title}</p>
        <span className={`rounded px-2 py-1 text-[10px] font-bold ${
          ready ? 'bg-emerald-500/15 text-emerald-200' : 'bg-slate-800 text-slate-400'
        }`}>
          {ready ? 'READY' : 'WAIT'}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-200">{action}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{condition}</p>
    </article>
  );
}

function ExecutionPlanPanel({ strategy }: { strategy: GoldStrategyResponse }) {
  const { executionPlan } = strategy;
  return (
    <section
      data-testid="gold-execution-plan"
      className="rounded-xl border border-amber-400/25 bg-gradient-to-br from-amber-500/8 to-transparent p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">Principal-based Action Plan</p>
          <h2 className="mt-1 text-lg font-bold text-white">원금 기준 분할 매수·매도 실행표</h2>
          <p className="mt-1 text-xs text-slate-400">
            {money(strategy.allocation.accountValue, strategy.settings.baseCurrency)} 기준 · 주문은 자동 실행되지 않습니다.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-md border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 font-bold text-emerald-200">
            매수 계획 {money(executionPlan.buyAmount, strategy.settings.baseCurrency)}
          </span>
          <span className="rounded-md border border-rose-400/25 bg-rose-500/10 px-3 py-2 font-bold text-rose-200">
            축소 계획 {money(executionPlan.sellAmount, strategy.settings.baseCurrency)}
          </span>
        </div>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <ExecutionStepList
          title="분할 매수"
          empty="현재 추가 매수 필요액이 없습니다."
          steps={executionPlan.buySteps}
          currency={strategy.settings.baseCurrency}
        />
        <ExecutionStepList
          title="분할 매도·축소"
          empty="현재 목표 초과분이 없어 강제 매도 계획이 없습니다."
          steps={executionPlan.sellSteps}
          currency={strategy.settings.baseCurrency}
        />
      </div>
    </section>
  );
}

function ExecutionStepList({
  title,
  empty,
  steps,
  currency,
}: {
  title: string;
  empty: string;
  steps: GoldStrategyResponse['executionPlan']['buySteps'];
  currency: GoldBaseCurrency;
}) {
  return (
    <div className="rounded-lg border border-white/8 bg-black/15 p-4">
      <h3 className="text-sm font-bold text-slate-100">{title}</h3>
      {steps.length === 0 ? (
        <p className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-400">{empty}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {steps.map((step) => (
            <div key={`${step.action}-${step.sleeve}-${step.product}-${step.sequence}`} className="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-white">
                  {step.sequence}차 · {step.product} · {money(step.amount, currency)}
                </p>
                <span className={`rounded px-2 py-1 text-[10px] font-bold ${
                  step.status === 'READY'
                    ? 'bg-emerald-500/15 text-emerald-200'
                    : 'bg-amber-500/15 text-amber-200'
                }`}>
                  {step.status === 'READY' ? '조건 충족' : '조건 대기'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                약 {number(step.units, 0)}주 · 계획의 {number(step.percentOfPlan)}%
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-300">{step.condition}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductAnalysisCard({ title, analysis }: { title: string; analysis: GoldProductAnalysisView }) {
  const currency = analysis.product.currency;
  const technical = analysis.technical;
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{title}</p>
          <h3 className="mt-1 text-lg font-bold text-[var(--text-primary)]">{analysis.product.name}</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{analysis.product.roleHint}</p>
        </div>
        <QualityBadge status={analysis.quality.status} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniMetric label="종가" value={price(technical.close, currency)} />
        <MiniMetric label="ATR 14" value={technical.atrPct === null ? '--' : `${number(technical.atrPct)}%`} />
        <MiniMetric label="월말 추세" value={technical.monthEndTrend} />
        <MiniMetric label="20일 돌파" value={technical.fastBreakout ? '돌파' : '미돌파'} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <LabelValue label="MA20" value={price(technical.ma20, currency)} />
        <LabelValue label="MA50" value={price(technical.ma50, currency)} />
        <LabelValue label="MA100" value={price(technical.ma100, currency)} />
        <LabelValue label="MA200" value={price(technical.ma200, currency)} />
        <LabelValue label="이전 20일 최고" value={price(technical.previous20DayHigh, currency)} />
        <LabelValue label="6개월 월말 평균" value={price(technical.sixMonthEndAverage, currency)} />
      </div>
      <div className="mt-4 border-t border-[var(--border)] pt-3 text-xs text-slate-400">
        <p>{analysis.provider}{analysis.fallbackUsed ? ' · fallback' : ''} · {dateTime(technical.asOf)}</p>
        {analysis.executionLevelsRequired && (
          <p className="mt-2 font-semibold text-amber-300">상품별 지지·저항 입력 필요</p>
        )}
      </div>
    </article>
  );
}

function MacroPanel({ strategy }: { strategy: GoldStrategyResponse }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Weekly Macro Score</p>
          <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">매크로 점수</h2>
        </div>
        <div className="text-right">
          <p className="font-mono text-3xl font-bold text-amber-200">{strategy.macro.score === null ? '--' : `${strategy.macro.score > 0 ? '+' : ''}${strategy.macro.score}`}</p>
          <p className={`text-xs font-semibold ${strategy.macro.complete ? 'text-emerald-300' : 'text-rose-300'}`}>
            {strategy.macro.complete ? '완전한 점수' : '불완전 · 전술 차단'}
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {strategy.macro.components.map((component) => (
          <div key={component.key} className="rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-200">{component.label}</p>
              <span className={`rounded-md px-2 py-1 font-mono text-xs font-bold ${
                component.score === 1 ? 'bg-emerald-500/15 text-emerald-200' : component.score === -1 ? 'bg-rose-500/15 text-rose-200' : 'bg-slate-800 text-slate-300'
              }`}>
                {component.score === null ? '누락' : component.score > 0 ? '+1' : component.score}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              값 {number(component.value)} {component.unit} · 변화 {number(component.change)} {component.changeUnit} · {dateTime(component.asOf)}
            </p>
            <p className="mt-1 text-xs text-slate-500">{component.interpretation}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-400">{strategy.macro.reason}</p>
    </section>
  );
}

function CorePlanPanel({ strategy }: { strategy: GoldStrategyResponse }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Core 4%</p>
          <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">코어 3회 분할</h2>
        </div>
        <span className="font-mono text-sm font-bold text-amber-200">{money(strategy.corePlan.targetAmount, strategy.settings.baseCurrency)}</span>
      </div>
      <div className="mt-4 space-y-3">
        {strategy.corePlan.tranches.map((tranche) => (
          <div key={tranche.sequence} className="flex gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${
              tranche.ready ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-400'
            }`}>
              {tranche.sequence}
            </span>
            <div className="min-w-0">
              <p className="font-mono text-sm font-bold text-slate-100">{money(tranche.amount, strategy.settings.baseCurrency)}</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">{tranche.condition}</p>
            </div>
          </div>
        ))}
      </div>
      {strategy.corePlan.reviewRequired && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          <p className="font-bold">코어 비중 재검토 필요</p>
          <p className="mt-1">{strategy.corePlan.reviewReasons.join(' ')}</p>
        </div>
      )}
    </section>
  );
}

function TacticalPlanPanel({ strategy }: { strategy: GoldStrategyResponse }) {
  const plan = strategy.tacticalPlan;
  const currency = strategy.products.tactical.product.currency;
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Tactical Plan</p>
          <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">전술 진입과 2ATR 리스크</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{PRODUCT_LABEL[strategy.settings.tacticalProduct]} · 레버리지 OFF</p>
        </div>
        <span className={`rounded-md border px-3 py-1.5 text-xs font-bold ${
          plan.allowed ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200' : 'border-rose-400/35 bg-rose-500/10 text-rose-200'
        }`}>
          {plan.allowed ? '전술 진입 허용' : '전술 진입 대기'}
        </span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="진입 기준" value={price(plan.entryPrice, currency)} helper="선택 상품 종가 기준" />
        <Metric label="초기 2ATR 손절" value={price(plan.initialStop, currency)} helper={plan.stopDistancePct === null ? '--' : `손절폭 ${number(plan.stopDistancePct)}%`} alert={!plan.allowed} />
        <Metric label="2ATR 추적 손절" value={price(plan.trailingStop, currency)} helper={`목표 ${price(plan.targetPrice, currency)}`} />
        <Metric label="제안 거래금액" value={money(plan.suggestedAmount, strategy.settings.baseCurrency)} helper={`${number(plan.suggestedUnits, 4)}주 · 위험 ${money(plan.riskBudgetAmount, strategy.settings.baseCurrency)}`} emphasis />
      </div>
      <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-4 text-xs text-slate-400">
        <p><strong className="text-slate-200">제한 요인</strong> · {plan.limitingFactor}</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {plan.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      </div>
    </section>
  );
}

function BacktestPanel({ strategy }: { strategy: GoldStrategyResponse }) {
  const backtest = strategy.backtest;
  return (
    <section
      className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-5"
      data-testid="gold-backtest"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Historical Verification</p>
          <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">과거 검증 결과</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {backtest.product} {backtest.startDate}~{backtest.endDate} · {number(backtest.observations, 0)}거래일
          </p>
        </div>
        <span className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-200">
          {backtest.status}
        </span>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead className="border-b border-[var(--border)] text-[var(--text-tertiary)]">
            <tr>
              <th className="px-3 py-2 font-semibold">전략</th>
              <th className="px-3 py-2 font-semibold"><StrategyColumnHeader label="연복리" help={{ description: '백테스트 시작 자산이 종료 자산까지 매년 같은 비율로 복리 성장했다고 환산한 수익률입니다.', formula: '(종료자산 ÷ 시작자산)^(1/경과연수) − 1' }} /></th>
              <th className="px-3 py-2 font-semibold"><StrategyColumnHeader label="연 변동성" help={{ description: '일별 전략 수익률의 흔들림을 252거래일 기준으로 연율화한 값입니다.', formula: '일별 수익률 표준편차 × √252' }} /></th>
              <th className="px-3 py-2 font-semibold"><StrategyColumnHeader label="최대 낙폭" help={{ description: '누적 자산이 과거 최고점에서 이후 저점까지 가장 크게 하락한 폭입니다.', formula: 'min(현재 누적자산 ÷ 이전 최고 누적자산 − 1)' }} /></th>
              <th className="px-3 py-2 font-semibold"><StrategyColumnHeader label="샤프" help={{ description: '무위험수익률을 차감한 일별 초과수익을 변동성으로 나누어 252거래일 기준으로 연율화합니다.', formula: '(평균 일수익률 − 일 무위험수익률) ÷ 일 변동성 × √252' }} /></th>
              <th className="px-3 py-2 font-semibold"><StrategyColumnHeader label="평균 노출" help={{ description: '백테스트 기간 중 전체 자본에서 선택된 금 상품에 실제로 투자된 비중의 일평균입니다.', formula: 'Σ(일별 금 투자비중) ÷ 거래일 수' }} /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {backtest.strategies.map((row) => (
              <tr key={row.mode} className={row.mode === 'CORE_TACTICAL' ? 'bg-amber-500/5 text-amber-100' : 'text-slate-300'}>
                <td className="px-3 py-3 font-semibold">{row.label}</td>
                <td className="px-3 py-3 font-mono">{number(row.cagrPct)}%</td>
                <td className="px-3 py-3 font-mono">{number(row.annualVolatilityPct)}%</td>
                <td className="px-3 py-3 font-mono">{number(row.maxDrawdownPct)}%</td>
                <td className="px-3 py-3 font-mono">{number(row.sharpe, 3)}</td>
                <td className="px-3 py-3 font-mono">{number(row.averageExposurePct)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-400">
        {backtest.assumptions.join(' · ')}. 이 결과는 미래 성과를 보장하지 않습니다.
      </p>
    </section>
  );
}

function QualityPanel({ strategy, meta }: { strategy: GoldStrategyResponse; meta: DataSourceMeta | null }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Governance & Sources</p>
          <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">데이터 품질과 모델</h2>
        </div>
        <QualityBadge status={strategy.quality.status} />
      </div>
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <LabelValue label="모델" value={strategy.modelVersion} />
        <LabelValue label="릴리스" value={strategy.releaseStatus} />
        <LabelValue label="전략 기준" value={dateTime(strategy.asOf)} />
        <LabelValue label="가격 기준" value={dateTime(strategy.quality.priceAsOf)} />
        <LabelValue label="가격 봉" value={`${strategy.quality.priceBars}개`} />
        <LabelValue label="WGC 기준월" value={strategy.quality.wgcPeriod ?? '--'} />
      </div>
      {strategy.quality.reasons.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 pl-4 text-xs text-amber-200">
          {strategy.quality.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
      {meta?.warnings && meta.warnings.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-slate-400">
          {meta.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
      <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
        {strategy.sources.map((source) => {
          const href = safeExternalUrl(source.url);
          return (
            <div key={`${source.label}-${source.provider}`} className="flex items-center justify-between gap-3 text-xs">
              <div>
                <p className="font-semibold text-slate-200">{source.label}</p>
                <p className="mt-0.5 text-slate-500">{source.provider} · {dateTime(source.asOf)}</p>
              </div>
              {href && (
                <a href={href} target="_blank" rel="noreferrer" className="text-sky-300 hover:text-sky-200" aria-label={`${source.label} 출처 열기`}>
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SnapshotPanel({ snapshots }: { snapshots: GoldSnapshotsResponse }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Signal History</p>
      <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">최근 전략 스냅샷</h2>
      {snapshots.items.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-700 p-5 text-center text-sm text-slate-400">
          아직 저장된 전략 스냅샷이 없습니다.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {snapshots.items.slice(0, 6).map((snapshot) => (
            <div key={snapshot.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-3">
              <div>
                <p className="text-sm font-semibold text-slate-200">{snapshot.strategyDate} · {snapshot.decision.label}</p>
                <p className="mt-1 text-xs text-slate-500">{snapshot.coreProduct}/{snapshot.tacticalProduct} · macro {snapshot.macroScore ?? '--'}</p>
              </div>
              <QualityBadge status={snapshot.dataQuality} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ReferenceScenario({ strategy }: { strategy: GoldStrategyResponse }) {
  const reference = strategy.referenceScenario;
  return (
    <section className="rounded-lg border border-slate-700 bg-slate-950/65 p-5" data-testid="gold-reference-scenario">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Dated Reference Only</p>
          <h2 className="mt-1 text-lg font-bold text-slate-200">XAU/USD 과거 참고 시나리오</h2>
        </div>
        <span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-200">
          만료/비활성 · 활성 신호 아님
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">{reference.note}</p>
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-5">
        <InfoCell label="기준일" value={reference.asOf} />
        <InfoCell label="만료 기준" value={dateTime(reference.expiresAt)} />
        <InfoCell label="지지" value={`$${reference.support.join('~$')}`} />
        <InfoCell label="저항" value={`$${reference.resistance.join('~$')}`} />
        <InfoCell label="상방 시나리오" value={`$${number(reference.upsideScenario, 0)}`} />
      </div>
      <p className="mt-4 text-xs font-semibold text-amber-300">
        이 XAU/USD 레벨을 GLD·국내 ETF 가격으로 환산하거나 현재 주문 조건에 사용하지 않습니다.
      </p>
    </section>
  );
}

function Metric({ label, value, helper, alert = false, emphasis = false }: {
  label: string;
  value: string;
  helper: string;
  alert?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${
      alert
        ? 'border-rose-500/30 bg-rose-500/10'
        : emphasis
          ? 'border-amber-400/30 bg-amber-500/10'
          : 'border-[var(--border)] bg-[var(--surface-strong)]'
    }`}>
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p className="mt-2 break-words font-mono text-lg font-bold text-[var(--text-primary)]">{value}</p>
      <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">{helper}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-soft)] p-3">
      <p className="text-[10px] text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 font-mono text-sm font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function QualityBadge({ status }: { status: GoldDataQualityStatus }) {
  const Icon = status === 'VALID' ? CheckCircle2 : status === 'DEGRADED' ? AlertTriangle : ShieldAlert;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold ${QUALITY_TONE[status]}`}>
      <Icon className="h-3.5 w-3.5" />
      {status}
    </span>
  );
}

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="truncate font-mono text-slate-300" title={value}>{value}</span>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-black/10 p-3">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-300">{value}</p>
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-400">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-amber-400/60"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function NullableNumberField({ id, label, value, onChange }: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-400">{label}</span>
      <input
        id={id}
        type="number"
        min="0"
        step="any"
        value={value ?? ''}
        placeholder="상품별 입력 필요"
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-amber-400/60"
      />
    </label>
  );
}
