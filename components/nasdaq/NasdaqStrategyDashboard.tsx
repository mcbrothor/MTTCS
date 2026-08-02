'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import {
  AlertTriangle,
  Activity,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import type { DataSourceMeta } from '@/types';
import {
  StrategyCapitalInput,
  StrategyMoneyInput,
  StrategyRiskPause,
  StrategySettingsHeader,
} from '@/components/strategy/StrategyMoneyInputs';
import type { NasdaqStrategyResponse } from '@/lib/nasdaq/service';
import type {
  NasdaqCurrency,
  NasdaqPriceBar,
  NasdaqProductCode,
  NasdaqTacticalProduct,
} from '@/lib/nasdaq/types';
import { DEFAULT_NASDAQ_SETTINGS } from '@/lib/nasdaq/policy';

const LightweightChart = dynamic(() => import('@/components/analysis/LightweightChart'), {
  ssr: false,
  loading: () => <div className="h-[360px] animate-pulse rounded-xl bg-slate-900" />,
});

interface Envelope<T> {
  data: T;
  meta: DataSourceMeta;
}

interface SettingsView {
  tacticalProduct: NasdaqTacticalProduct;
  baseCurrency: NasdaqCurrency;
  manualAccountValue: number | null;
  externalNasdaqValue: number;
  tqqqOptIn: boolean;
  riskPaused: boolean;
  updatedAt: string | null;
}

interface HistoryDataset {
  product: NasdaqProductCode;
  bars: NasdaqPriceBar[];
  provider: string;
  fallbackUsed: boolean;
  warnings: string[];
}

interface SnapshotView {
  items: {
    id: string;
    strategyDate: string;
    tacticalProduct: NasdaqTacticalProduct;
    decision: string;
    totalCapitalTargetPct: number;
    totalEffectiveTargetPct: number;
    dataQuality: string;
    inputHash: string;
  }[];
}

const DEFAULT_SETTINGS: SettingsView = {
  tacticalProduct: DEFAULT_NASDAQ_SETTINGS.tacticalProduct,
  baseCurrency: DEFAULT_NASDAQ_SETTINGS.baseCurrency,
  manualAccountValue: null,
  externalNasdaqValue: 0,
  tqqqOptIn: false,
  riskPaused: false,
  updatedAt: null,
};

const DECISION_LABEL: Record<string, string> = {
  DATA_BLOCKED: '데이터 확인 필요',
  RISK_PAUSED: '위험 투입 중지',
  DELEVERAGE: '레버리지 축소',
  TRIM_EXPOSURE: '노출 한도 복귀',
  TQQQ_READY: 'TQQQ 조건 충족',
  QLD_READY: 'QLD 조건 충족',
  QQQ_ACCUMULATE: 'QQQ 코어 분할',
  QQQ_HOLD: 'QQQ 코어 유지',
  DEFENSIVE: '방어·현금 대기',
};

const DECISION_TONE: Record<string, string> = {
  DATA_BLOCKED: 'border-rose-500/40 bg-rose-500/10',
  RISK_PAUSED: 'border-rose-500/40 bg-rose-500/10',
  DELEVERAGE: 'border-orange-500/40 bg-orange-500/10',
  TRIM_EXPOSURE: 'border-orange-500/40 bg-orange-500/10',
  TQQQ_READY: 'border-fuchsia-500/40 bg-fuchsia-500/10',
  QLD_READY: 'border-emerald-500/40 bg-emerald-500/10',
  QQQ_ACCUMULATE: 'border-sky-500/40 bg-sky-500/10',
  QQQ_HOLD: 'border-slate-700 bg-slate-950/70',
  DEFENSIVE: 'border-amber-500/40 bg-amber-500/10',
};

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });
  const payload = await response.json().catch(() => null) as
    | Envelope<T>
    | { message?: string }
    | null;
  if (!response.ok || !payload || !('data' in payload)) {
    throw new Error(payload && 'message' in payload && payload.message
      ? payload.message
      : `요청에 실패했습니다. (${response.status})`);
  }
  return payload;
}

function percent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function number(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(value);
}

function money(value: number, currency: NasdaqCurrency) {
  return new Intl.NumberFormat(currency === 'KRW' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

export default function NasdaqStrategyDashboard() {
  const [strategy, setStrategy] = useState<NasdaqStrategyResponse | null>(null);
  const [settings, setSettings] = useState<SettingsView>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<SettingsView>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<Partial<Record<NasdaqProductCode, HistoryDataset>>>({});
  const [snapshots, setSnapshots] = useState<SnapshotView>({ items: [] });
  const [chartProduct, setChartProduct] = useState<NasdaqProductCode>('QQQ');
  const [meta, setMeta] = useState<DataSourceMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStrategy = useCallback(async (active: SettingsView) => {
    const query = new URLSearchParams({
      tacticalProduct: active.tacticalProduct,
      baseCurrency: active.baseCurrency,
    });
    const strategyEnvelope = await request<NasdaqStrategyResponse>(
      `/api/nasdaq/strategy?${query.toString()}`,
    );
    setStrategy(strategyEnvelope.data);
    setMeta(strategyEnvelope.meta);
    // Decision briefing is the primary response. Do not keep it in a loading
    // state while supplemental charts and snapshots continue in parallel.
    setLoading(false);
    const results = await Promise.allSettled([
      ...(['QQQ', 'QLD', 'TQQQ'] as const).map(async (product) => [
        product,
        await request<HistoryDataset>(
          `/api/nasdaq/history?product=${product}&range=1y&series=execution`,
        ),
      ] as const),
      request<SnapshotView>('/api/nasdaq/snapshots?limit=12'),
    ]);
    const nextHistory: Partial<Record<NasdaqProductCode, HistoryDataset>> = {};
    for (const result of results.slice(0, 3)) {
      if (result.status === 'fulfilled') {
        const [product, envelope] = result.value as readonly [
          NasdaqProductCode,
          Envelope<HistoryDataset>,
        ];
        nextHistory[product] = envelope.data;
      }
    }
    setHistory(nextHistory);
    const snapshotResult = results[3];
    setSnapshots(
      snapshotResult?.status === 'fulfilled'
        ? (snapshotResult.value as Envelope<SnapshotView>).data
        : { items: [] },
    );
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const envelope = await request<SettingsView>('/api/nasdaq/settings');
      setSettings(envelope.data);
      setDraft(envelope.data);
      setChartProduct(envelope.data.tacticalProduct);
      await loadStrategy(envelope.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '나스닥 전략을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [loadStrategy]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const envelope = await request<SettingsView>('/api/nasdaq/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tacticalProduct: draft.tacticalProduct,
          baseCurrency: draft.baseCurrency,
          manualAccountValue: draft.manualAccountValue,
          externalNasdaqValue: draft.externalNasdaqValue,
          tqqqOptIn: draft.tqqqOptIn,
          riskPaused: draft.riskPaused,
        }),
      });
      setSettings(envelope.data);
      setDraft(envelope.data);
      setChartProduct(envelope.data.tacticalProduct);
      await loadStrategy(envelope.data);
      setNotice('전략 설정을 저장하고 신호를 다시 계산했습니다.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '설정을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const chartBars = useMemo(
    () => history[chartProduct]?.bars.map((bar) => ({
      time: bar.date,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    })) ?? [],
    [chartProduct, history],
  );
  const decision = strategy?.decision ?? 'DATA_BLOCKED';
  const settingsDirty = JSON.stringify({ ...draft, updatedAt: null })
    !== JSON.stringify({ ...settings, updatedAt: null });

  return (
    <div
      data-testid="nasdaq-strategy-dashboard"
      className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 lg:px-8"
    >
      <section
        data-testid="nasdaq-decision-briefing"
        className={`rounded-2xl border p-4 shadow-2xl shadow-black/20 sm:p-6 ${DECISION_TONE[decision]}`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] text-slate-300">
                오늘의 의사결정
              </span>
              <span className="rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold text-violet-200">
                RESEARCH ONLY
              </span>
              {strategy && (
                <span className="text-[11px] text-slate-400">
                  {strategy.settings.tacticalProduct} 선택 · {strategy.quality.status}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              {strategy
                ? DECISION_LABEL[decision]
                : loading
                  ? '나스닥 전략을 계산하는 중입니다'
                  : '나스닥 전략을 확인할 수 없습니다'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              {error
                ? error
                : strategy?.actions.now ?? 'QQQ 조정주가와 선택 ETF 자체 OHLC를 확인하고 있습니다.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            다시 계산
          </button>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {[
            ['지금 할 일', strategy?.actions.now ?? '데이터 확인 중', 'text-emerald-300'],
            ['하지 말 일', strategy?.actions.avoid ?? '확인 전 신규 진입 금지', 'text-rose-300'],
            ['다음 전환 조건', strategy?.actions.nextCondition ?? '완전한 데이터 필요', 'text-sky-300'],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-xl border border-white/8 bg-black/20 p-3">
              <p className={`text-[11px] font-bold ${tone}`}>{label}</p>
              <p className="mt-1 text-sm leading-5 text-slate-100">{value}</p>
            </div>
          ))}
        </div>

        {strategy && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="전략 계산 원금" value={money(strategy.capitalBasis.accountValue, settings.baseCurrency)} />
            <Metric label="원금 기준" value={strategy.capitalBasis.source === 'MANUAL' ? '직접 입력' : '통합 포트폴리오'} />
            <Metric label="목표 자본 비중" value={percent(strategy.allocation.totalCapitalTargetPct)} />
            <Metric label="목표 유효 노출" value={percent(strategy.allocation.totalEffectiveTargetPct)} />
            <Metric label="현재 투입 자본" value={money(strategy.allocation.existingCapitalValue, settings.baseCurrency)} />
            <Metric label="현재 유효 노출액" value={money(strategy.allocation.existingEffectiveExposureValue, settings.baseCurrency)} />
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
          <span>모델 {strategy?.modelVersion ?? 'nasdaq-core-leverage-2026.07-v1'}</span>
          <span>가격 기준 {strategy?.quality.asOf ?? '--'}</span>
          <span>계산 기준 {meta?.asOf ?? '--'}</span>
        </div>
      </section>

      {notice && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      )}

      {strategy && (
        <>
          <section className="flex flex-col gap-4">
            <div className="order-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-violet-300" />
                <h2 className="text-lg font-bold text-white">위험 게이트</h2>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Gate label="월말 10개월 추세" pass={strategy.regime?.monthlyTrend.signal === 'ON' && Boolean(strategy.regime?.monthlyTrend.isEffective)} detail={`${strategy.regime?.monthlyTrend.signal ?? 'UNKNOWN'} · 다음 거래일 적용`} />
                <Gate label="QQQ 200일선 2일 확인" pass={Boolean(strategy.regime?.aboveMa200TwoCloses)} detail={`QQQ ${number(strategy.regime?.close)} / MA200 ${number(strategy.regime?.ma200)}`} />
                <Gate label="레버리지 변동성" pass={(strategy.regime?.realizedVolatility20Pct ?? Infinity) < 30} detail={`RV20 ${number(strategy.regime?.realizedVolatility20Pct)}% · 30% 이상 차단`} />
                <Gate label="TQQQ 고급 게이트" pass={Boolean(strategy.regime?.goldenCross && strategy.regime?.breakout20 && (strategy.regime?.realizedVolatility20Pct ?? Infinity) <= 18)} detail="50일선>200일선 · 20일 돌파 · RV20≤18%" />
              </div>
              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/8 p-3 text-xs leading-5 text-amber-100">
                {strategy.dailyResetWarning}
              </div>
            </div>

            <form onSubmit={save} className="order-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-5">
              <StrategySettingsHeader
                description="저장 후 선택 상품의 자체 가격으로 전략을 다시 계산합니다. QLD와 TQQQ는 동시에 선택·운용하지 않습니다."
                saving={saving}
                disabled={saving || !settingsDirty}
                saveLabel="설정 저장·재계산"
              />
              <div className="mt-4">
                <StrategyCapitalInput
                  idPrefix="nasdaq"
                  currency={draft.baseCurrency}
                  value={draft.manualAccountValue}
                  description="입력 원금으로 QQQ 10%·레버리지 전술 한도와 분할 금액을 계산합니다. 비우거나 0이면 통합 포트폴리오 기준입니다."
                  onCurrencyChange={(baseCurrency) => setDraft((current) => ({
                    ...current,
                    baseCurrency,
                  }))}
                  onValueChange={(manualAccountValue) => setDraft((current) => ({
                    ...current,
                    manualAccountValue,
                  }))}
                />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-300">
                  전술 상품
                  <select
                    value={draft.tacticalProduct}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      tacticalProduct: event.target.value as NasdaqTacticalProduct,
                      tqqqOptIn: event.target.value === 'TQQQ' ? current.tqqqOptIn : false,
                    }))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  >
                    <option value="QLD">QLD · 일일 2배</option>
                    <option value="TQQQ">TQQQ · 일일 3배</option>
                  </select>
                </label>
                <StrategyMoneyInput
                  id="nasdaq-external-value"
                  label="외부 나스닥 보유 평가액"
                  currency={draft.baseCurrency}
                  value={draft.externalNasdaqValue}
                  onChange={(externalNasdaqValue) => setDraft((current) => ({
                    ...current,
                    externalNasdaqValue,
                  }))}
                />
              </div>
              {draft.tacticalProduct === 'TQQQ' && (
                <label className="mt-3 flex gap-2 rounded-lg border border-fuchsia-500/25 bg-fuchsia-500/8 p-3 text-xs leading-5 text-fuchsia-100">
                  <input
                    type="checkbox"
                    checked={draft.tqqqOptIn}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      tqqqOptIn: event.target.checked,
                    }))}
                    className="mt-1"
                  />
                  일일 3배 목표의 복리·변동성 손실과 급락 위험을 이해했으며, 최대 자본 3.33%·거래 위험 0.25% 제한에 동의합니다.
                </label>
              )}
              <StrategyRiskPause
                checked={draft.riskPaused}
                description="위험 일시중지 — 활성화하면 신규 위험 투입 금액을 0으로 차단합니다."
                onChange={(riskPaused) => setDraft((current) => ({
                  ...current,
                  riskPaused,
                }))}
              />
            </form>
          </section>

          <NasdaqEntryTimingGuide strategy={strategy} />
          <NasdaqExecutionPlan strategy={strategy} />

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">상품 자체 실행 차트</h2>
                <p className="mt-1 text-xs text-slate-400">국면은 QQQ 조정주가, 진입·ATR·손절은 선택한 ETF 자체 OHLC를 사용합니다.</p>
              </div>
              <div className="flex gap-2">
                {(['QQQ', 'QLD', 'TQQQ'] as const).map((product) => (
                  <button
                    key={product}
                    type="button"
                    onClick={() => setChartProduct(product)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                      chartProduct === product
                        ? 'border-violet-400/40 bg-violet-500/15 text-violet-100'
                        : 'border-slate-700 text-slate-400'
                    }`}
                  >
                    {product}
                  </button>
                ))}
              </div>
            </div>
            {chartBars.length > 0 ? (
              <div className="mt-4">
                <LightweightChart
                  data={chartBars}
                  stopLossPrice={
                    strategy.position?.product === chartProduct
                      ? strategy.position.stopPrice
                      : null
                  }
                  targetPrice={null}
                  height={380}
                />
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-8 text-center text-sm text-slate-400">
                {chartProduct} 가격 차트를 불러오지 못했습니다.
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <Metric label="선택 종가" value={number(strategy.execution?.close)} />
              <Metric label="MA20" value={number(strategy.execution?.ma20)} />
              <Metric label="MA50" value={number(strategy.execution?.ma50)} />
              <Metric label="MA200" value={number(strategy.execution?.ma200)} />
              <Metric label="ATR14" value={number(strategy.execution?.atr14)} />
              <Metric label="2ATR 손절" value={number(strategy.position?.stopPrice)} />
              <Metric label="제안 수량" value={strategy.position ? `${strategy.position.units}주` : '--'} />
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            {Object.values(strategy.products).map((product) => {
              const metadata = strategy.productMetadata.find((row) => row.product === product.code);
              return (
                <article key={product.code} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-bold text-violet-300">{product.leverage}× DAILY</p>
                      <h3 className="mt-1 text-xl font-black text-white">{product.code}</h3>
                      <p className="text-xs text-slate-400">{product.name}</p>
                    </div>
                    <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-300">
                      순비용 {number(metadata?.netExpenseRatioPct)}%
                    </span>
                  </div>
                  <p className="mt-4 text-xs leading-5 text-slate-300">
                    자본 {product.leverage === 1 ? '10% 코어' : product.leverage === 2 ? '최대 5%' : '최대 3.33%'} ·
                    유효 노출 {product.leverage === 1 ? '10%' : '최대 10%'}
                  </p>
                  {metadata && (
                    <a
                      href={metadata.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-xs text-sky-300"
                    >
                      비용 원문 · 재검토 {metadata.reviewAfter}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </article>
              );
            })}
          </section>

          <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-sky-300" />
                <h2 className="text-lg font-bold text-white">공개 연구 벤치마크</h2>
              </div>
              <p className="mt-1 text-xs text-slate-400">특정 투자자의 복제·보증이 아니라 공개 연구 원칙을 규칙으로 검증합니다.</p>
              <div className="mt-4 space-y-3">
                {strategy.researchBenchmarks.map((item) => (
                  <a
                    key={item.label}
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-xl border border-slate-800 bg-slate-950/50 p-3 hover:border-sky-500/30"
                  >
                    <span className="flex items-center gap-1 text-sm font-bold text-slate-100">
                      {item.label}<ExternalLink className="h-3 w-3" />
                    </span>
                    <span className="mt-1 block text-xs text-slate-400">{item.use}</span>
                  </a>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="text-lg font-bold text-white">최근 신호 이력</h2>
              <div className="mt-4 space-y-2">
                {snapshots.items.length === 0 ? (
                  <p className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-400">
                    첫 cron 스냅샷 실행 후 이력이 표시됩니다.
                  </p>
                ) : snapshots.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs">
                    <div>
                      <span className="font-bold text-slate-100">{item.strategyDate}</span>
                      <span className="ml-2 text-slate-400">{item.tacticalProduct}</span>
                    </div>
                    <span className="text-slate-300">{DECISION_LABEL[item.decision] ?? item.decision}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section
            data-testid="nasdaq-backtest"
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">실제 ETF 조정주가 검증</h2>
                <p className="mt-1 text-xs text-slate-400">
                  합성 2배·3배 수익률을 만들지 않고 QQQ·QLD·TQQQ 실제 조정주가를 사용했습니다.
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-300">
                {strategy.backtest.status} · 비용 {strategy.backtest.transactionCostPct}%
              </span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="border-b border-slate-800 text-slate-500">
                  <tr>
                    <th className="px-3 py-2">전략</th>
                    <th className="px-3 py-2">CAGR</th>
                    <th className="px-3 py-2">변동성</th>
                    <th className="px-3 py-2">최대낙폭</th>
                    <th className="px-3 py-2">Sharpe</th>
                    <th className="px-3 py-2">평균 유효노출</th>
                  </tr>
                </thead>
                <tbody>
                  {strategy.backtest.strategies.map((row) => (
                    <tr key={row.mode} className="border-b border-slate-900 text-slate-300">
                      <td className="px-3 py-2 font-semibold text-slate-100">{row.label}</td>
                      <td className="px-3 py-2">{number(row.cagrPct)}%</td>
                      <td className="px-3 py-2">{number(row.annualVolatilityPct)}%</td>
                      <td className="px-3 py-2 text-rose-300">{number(row.maxDrawdownPct)}%</td>
                      <td className="px-3 py-2">{number(row.sharpe)}</td>
                      <td className="px-3 py-2">{number(row.averageEffectiveExposurePct)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 space-y-1 text-[11px] text-slate-500">
              {strategy.backtest.assumptions.map((assumption) => <p key={assumption}>· {assumption}</p>)}
              <p>· 과거 성과는 미래 수익을 보장하지 않으며 QLD·TQQQ 상시 보유의 80%대 낙폭이 확인됩니다.</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs leading-5 text-slate-400">
            <div className="flex items-start gap-2">
              {strategy.quality.status === 'VALID'
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                : strategy.quality.status === 'DEGRADED'
                  ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />}
              <div>
                <p className="font-bold text-slate-200">데이터 품질 {strategy.quality.status}</p>
                <p>{strategy.quality.reasons.join(' ') || 'QQQ 조정주가와 선택 ETF 실행 가격이 검증되었습니다.'}</p>
                <p className="mt-1">자동 주문·매수 버튼은 연결하지 않았습니다. 레버리지 ETF는 원금 전액 손실 가능성이 있으며 연구 신호가 수익을 보장하지 않습니다.</p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function NasdaqEntryTimingGuide({ strategy }: { strategy: NasdaqStrategyResponse }) {
  const trendOn = strategy.regime?.monthlyTrend.signal === 'ON'
    && Boolean(strategy.regime?.monthlyTrend.isEffective);
  const signalUsable = strategy.quality.status === 'VALID' && !strategy.settings.riskPaused;
  const coreReady = signalUsable && trendOn && Boolean(strategy.regime?.aboveMa200TwoCloses);
  const tacticalReady = strategy.decision === 'QLD_READY' || strategy.decision === 'TQQQ_READY';
  const reduceReady = strategy.decision === 'DELEVERAGE' || strategy.decision === 'TRIM_EXPOSURE';
  const selected = strategy.settings.tacticalProduct;
  const tacticalCondition = selected === 'TQQQ'
    ? `골든크로스 ${strategy.regime?.goldenCross ? '충족' : '미충족'} · 20일 돌파 ${strategy.regime?.breakout20 ? '충족' : '미충족'} · RV20 ${number(strategy.regime?.realizedVolatility20Pct)}%/18% 이하`
    : `월말 추세 ${trendOn ? 'ON' : 'OFF'} · QQQ 200일선 2일 ${strategy.regime?.aboveMa200TwoCloses ? '충족' : '미충족'} · RV20 ${number(strategy.regime?.realizedVolatility20Pct)}%/30% 미만`;

  return (
    <section
      data-testid="nasdaq-entry-guide"
      className="rounded-2xl border border-sky-400/25 bg-sky-500/5 p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">Entry Timing</p>
          <h2 className="mt-1 text-xl font-bold text-white">언제 진입하나요?</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            장중 움직임을 예측하지 않고 종가로 조건을 확인합니다. 확인 후 실행표에서 <strong className="text-emerald-300">READY인 단계만</strong> 다음 거래 가능 시점에 분할합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-lg border px-3 py-2 text-xs font-bold ${
            tacticalReady
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
              : reduceReady
                ? 'border-rose-400/30 bg-rose-500/10 text-rose-200'
                : 'border-amber-400/30 bg-amber-500/10 text-amber-200'
          }`}>
            현재: {DECISION_LABEL[strategy.decision] ?? strategy.decision}
          </span>
          <Link
            href="/guide#nasdaq-strategy"
            className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/15"
          >
            <BookOpen className="h-4 w-4" />
            나스닥100 메뉴 설명서
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <NasdaqEntryRule
          step="1"
          title="QQQ 코어 10%"
          ready={coreReady}
          action={coreReady ? 'QQQ 부족액을 40% → 30% → 30%로 분할' : '10개월 추세 ON과 QQQ 200일선 2일 회복을 대기'}
          condition={`월말 추세 ${trendOn ? 'ON' : 'OFF'} · 200일선 2일 ${strategy.regime?.aboveMa200TwoCloses ? '충족' : '미충족'} · 데이터 ${strategy.quality.status}`}
        />
        <NasdaqEntryRule
          step="2"
          title={`${selected} 전술`}
          ready={tacticalReady}
          action={tacticalReady ? `${selected} 계획 금액을 50%씩 2회 분할` : `${selected}의 모든 진입 게이트가 함께 충족될 때까지 대기`}
          condition={tacticalCondition}
        />
        <NasdaqEntryRule
          step="3"
          title="축소·매도"
          ready={reduceReady}
          action={reduceReady ? '축소 필요액을 50% → 30% → 20%로 실행' : '현재 강제 축소 신호 없음'}
          condition="10개월 추세 OFF, QQQ 200일선 재이탈, 2ATR 추적 손절 또는 유효 노출 30% 초과 시 축소합니다."
        />
      </div>

      <p className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/8 p-3 text-xs leading-5 text-rose-100">
        RISK_PAUSED·DATA_BLOCKED이거나 실행표가 WAIT이면 신규 매수를 하지 않습니다. QLD와 TQQQ는 동시에 운용하지 않으며 TQQQ는 별도 위험 확인을 켜야 합니다.
      </p>
    </section>
  );
}

function NasdaqEntryRule({
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
    <article className={`rounded-xl border p-4 ${
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

function NasdaqExecutionPlan({ strategy }: { strategy: NasdaqStrategyResponse }) {
  const plan = strategy.executionPlan;
  return (
    <section
      data-testid="nasdaq-execution-plan"
      className="rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/8 to-transparent p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">Principal-based Action Plan</p>
          <h2 className="mt-1 text-lg font-bold text-white">원금 기준 분할 매수·매도 실행표</h2>
          <p className="mt-1 text-xs text-slate-400">
            {money(strategy.capitalBasis.accountValue, strategy.settings.baseCurrency)} 기준 · 자동 주문은 실행하지 않습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 font-bold text-emerald-200">
            매수 계획 {money(plan.buyAmount, strategy.settings.baseCurrency)}
          </span>
          <span className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 font-bold text-rose-200">
            축소 계획 {money(plan.sellAmount, strategy.settings.baseCurrency)}
          </span>
        </div>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <NasdaqExecutionSteps
          title="QQQ·전술 분할 매수"
          empty="현재 추가 매수 필요액이 없습니다."
          steps={plan.buySteps}
          currency={strategy.settings.baseCurrency}
        />
        <NasdaqExecutionSteps
          title="분할 매도·디레버리징"
          empty="현재 목표 초과 또는 디레버리징 필요액이 없습니다."
          steps={plan.sellSteps}
          currency={strategy.settings.baseCurrency}
        />
      </div>
    </section>
  );
}

function NasdaqExecutionSteps({
  title,
  empty,
  steps,
  currency,
}: {
  title: string;
  empty: string;
  steps: NasdaqStrategyResponse['executionPlan']['buySteps'];
  currency: NasdaqCurrency;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 p-4">
      <h3 className="text-sm font-bold text-white">{title}</h3>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
      <p className="text-[10px] font-semibold text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-white">{value}</p>
    </div>
  );
}

function Gate({ label, pass, detail }: { label: string; pass: boolean; detail: string }) {
  return (
    <div className={`rounded-xl border p-3 ${pass ? 'border-emerald-500/25 bg-emerald-500/8' : 'border-amber-500/25 bg-amber-500/8'}`}>
      <div className="flex items-center gap-2">
        {pass
          ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          : <AlertTriangle className="h-4 w-4 text-amber-400" />}
        <p className="text-sm font-bold text-slate-100">{label}</p>
      </div>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </div>
  );
}
