'use client';

import { memo } from 'react';
import { Info, ShieldAlert, TrendingUp } from 'lucide-react';
import { Area, AreaChart, Line, LineChart, ReferenceLine, Tooltip, YAxis } from 'recharts';
import StableResponsiveContainer from '@/components/ui/StableResponsiveContainer';
import Card from '@/components/ui/Card';
import HelpButton from '@/components/ui/HelpButton';
import StatusBadge from '@/components/master-filter/StatusBadge';
import { useMarket } from '@/contexts/MarketContext';
import { formatDelay, formatTimestamp } from '@/lib/format';
import { ADVANCE_DECLINE_RATIO_BANDS, getAverageDailyRangeGuidance } from '@/lib/master-filter/adr-presentation';
import { normalizeSectorReturn } from '@/lib/master-filter/sector-rows';
import { friendlyMetricDescription, friendlyMetricLabel, friendlyMetricStatus } from '@/lib/market-display';
import type { MasterFilterMetricDetail, MasterFilterMetrics, MarketState } from '@/types';

const METRIC_HELP: Record<string, { alias?: string; icon?: string; tooltip: string; formula?: string; accordion?: string }> = {
  '추세': {
    alias: '지수 평균선 위치',
    tooltip: '시장이 중장기 이동평균선 위에 있는지 확인합니다. 쉽게 말해 시장이 위로 가는 힘을 유지하는지 보는 항목입니다.',
    accordion: '정의: 50일선 > 150일선 > 200일선 순서일 때 추세 배열 완성. 지수가 200일선 위에 있을 때만 공격적 진입 허용.',
  },
  '시장 폭': {
    alias: '시장 폭',
    tooltip: '전체 종목 중 200일 이동평균선 위에 있는 비율. 시장 전반의 건강도를 나타냅니다.',
    accordion: '50% 이상이면 과반 종목이 상승 추세. 30% 이하면 약세장 경계.',
  },
  'FTD': {
    alias: '강한 반등 확인 여부',
    tooltip: '최근 하락 후 랠리 4일째 이후 +1.5% 이상 거래량 급증 상승이 있었는지. 바닥 반전 신호입니다.',
    accordion: '큰 하락 뒤에 거래량을 동반한 강한 상승일이 나타났는지 확인합니다. 아직 없으면 본격 반등이 아닐 수 있습니다.',
  },
  '분산일': {
    alias: '분산일',
    tooltip: '최근 25거래일 기준 기관이 대량 매도한 날의 수. 5개 이상이면 시장 약화 신호.',
    accordion: '지수가 전일 대비 -0.2% 이상 하락하고 거래량이 전일보다 늘어난 날입니다. 이런 날이 많아지면 위험 신호로 봅니다.',
  },
  '변동성': {
    alias: '시장 불안도',
    tooltip: 'S&P 500 옵션의 내재변동성으로 계산되는 "공포 지수". 낮을수록 시장이 안정적입니다.',
    accordion: 'VIX 15 이하: 낮은 변동성, 진입 유리. 20 이상: 위험 증가. 30 이상: 패닉 구간.',
  },
  'ADR': {
    alias: '20일 평균 하루 변동폭',
    tooltip: '최근 20거래일 동안 하루의 고가와 저가가 평균적으로 얼마나 벌어졌는지 보여줍니다. 높을수록 가격 흔들림이 큽니다.',
    formula: '평균(고가 - 저가) ÷ 평균((고가 + 저가) ÷ 2) × 100',
    accordion: '하루 중 가격이 크게 흔들리는 시장에서는 같은 종목을 사더라도 손절선에 빨리 닿을 수 있어 수량을 줄이는 편이 안전합니다.',
  },
};

function getMetricHelp(label: string) {
  return Object.entries(METRIC_HELP).find(([key]) => label?.includes(key))?.[1];
}

interface MetricCardProps {
  detail: MasterFilterMetricDetail;
  chartData?: { date: string; close: number }[];
  movingAverageData?: NonNullable<MasterFilterMetrics['movingAverageHistory']>;
  compact?: boolean;
}

interface MetricDisplayItem {
  detail: MasterFilterMetricDetail | undefined;
  chartData?: { date: string; close: number }[];
  movingAverageData?: NonNullable<MasterFilterMetrics['movingAverageHistory']>;
}

function statusClass(status: MasterFilterMetricDetail['status']) {
  if (status === 'PASS') return 'border-emerald-500/40 bg-emerald-500/5 text-emerald-300';
  if (status === 'WARNING') return 'border-amber-500/40 bg-amber-500/5 text-amber-300';
  return 'border-rose-500/40 bg-rose-500/5 text-rose-300';
}

function statusToState(status: MasterFilterMetricDetail['status']): MarketState {
  if (status === 'PASS') return 'GREEN';
  if (status === 'WARNING') return 'YELLOW';
  return 'RED';
}

const MetricCard = memo(function MetricCard({ detail, chartData, movingAverageData, compact = false }: MetricCardProps) {
  const tone = statusClass(detail.status);
  const help = getMetricHelp(detail.label);
  const friendlyLabel = friendlyMetricLabel(detail.label);
  const originalLabel = friendlyLabel === detail.label ? null : detail.label;
  const friendlyDescription = friendlyMetricDescription(detail.label, detail.description);
  return (
    <Card className={`border-2 ${tone} ${compact ? 'min-h-[190px]' : 'min-h-[260px]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {help?.alias ?? friendlyLabel}
            </p>
            {help && (
              <HelpButton
                label={help.alias ?? friendlyLabel}
                tooltip={help.tooltip}
                formula={help.formula}
                accordion={help.accordion ? <span>{help.accordion}</span> : undefined}
              />
            )}
          </div>
          <p className="mt-2 font-mono text-2xl font-black text-white">
            {detail.value}
            {detail.unit && <span className="ml-1 text-xs text-slate-500">{detail.unit}</span>}
          </p>
          <p className="mt-1 text-xs text-slate-500">기준: {detail.threshold}</p>
        </div>
        <StatusBadge state={statusToState(detail.status)} label={friendlyMetricStatus(detail.status)} size="sm" />
      </div>

      {typeof detail.score === 'number' && typeof detail.weight === 'number' && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>항목 점수</span>
            <span>{detail.score}/{detail.weight}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-lg bg-slate-800">
            <div className="h-full bg-emerald-500" style={{ width: `${Math.min((detail.score / detail.weight) * 100, 100)}%` }} />
          </div>
        </div>
      )}

      {movingAverageData && !compact && (
        <div className="mt-4 h-24">
          <StableResponsiveContainer width="100%" height="100%" initialHeight={96}>
            <LineChart data={movingAverageData}>
              <Line type="monotone" dataKey="ma50" name="50일선" stroke="#10b981" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="ma200" name="200일선" stroke="#38bdf8" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              {!isNaN(Number(detail.threshold)) && (
                <ReferenceLine
                  y={Number(detail.threshold)}
                  stroke="#f59e0b"
                  strokeDasharray="4 2"
                  label={{ value: '기준선', fill: '#f59e0b', fontSize: 10 }}
                />
              )}
              <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                labelStyle={{ color: '#94a3b8', fontSize: 11 }}
              />
            </LineChart>
          </StableResponsiveContainer>
          <div className="mt-1 flex gap-3 text-[10px] text-slate-500">
            <span className="text-emerald-300">50일선</span>
            <span className="text-sky-300">200일선</span>
          </div>
        </div>
      )}

      {chartData && !movingAverageData && !compact && (
        <div className="mt-4 h-24">
          <StableResponsiveContainer width="100%" height="100%" initialHeight={96}>
            <AreaChart data={chartData}>
              <Area type="monotone" dataKey="close" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
              {!isNaN(Number(detail.threshold)) && (
                <ReferenceLine
                  y={Number(detail.threshold)}
                  stroke="#f59e0b"
                  strokeDasharray="4 2"
                  label={{ value: '기준선', fill: '#f59e0b', fontSize: 10 }}
                />
              )}
              <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
            </AreaChart>
          </StableResponsiveContainer>
        </div>
      )}

      <div className="mt-4 border-t border-slate-800 pt-3">
        <div className="flex items-start gap-2 text-xs leading-5 text-slate-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
          <span>{friendlyDescription}</span>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-slate-600">{detail.source}</p>
        {originalLabel && (
          <details className="mt-2 text-[10px] text-slate-600">
            <summary className="cursor-pointer">계산명 보기</summary>
            <p className="mt-1 font-mono uppercase tracking-wide">{originalLabel}</p>
          </details>
        )}
      </div>
    </Card>
  );
});

function sectorReturnTone(value: unknown) {
  const normalized = normalizeSectorReturn(value);
  if (normalized === null) return 'text-slate-500';
  return normalized >= 0 ? 'text-emerald-300' : 'text-rose-300';
}

function sectorReturnText(value: unknown) {
  const normalized = normalizeSectorReturn(value);
  if (normalized === null) return '—';
  return `${normalized > 0 ? '+' : ''}${normalized.toFixed(2)}%`;
}

type SectorTableRow = NonNullable<MasterFilterMetrics['sectorRows']>[number];

function sectorMovingAverageTitle(row: SectorTableRow, period: 5 | 20) {
  const price = normalizeSectorReturn(row.price);
  const average = normalizeSectorReturn(period === 5 ? row.ma5 : row.ma20);
  if (price === null || average === null) return `${period}일 이동평균 데이터 확인 필요`;
  return `현재가 ${price.toFixed(2)} / ${period}일선 ${average.toFixed(2)}`;
}

function MovingAverageBadge({ row, period }: { row: SectorTableRow; period: 5 | 20 }) {
  const above = period === 5 ? row.aboveMa5 : row.aboveMa20;
  const label = typeof above === 'boolean' ? `${period}일선 ${above ? '위' : '아래'}` : `${period}일선 —`;
  const tone = typeof above !== 'boolean'
    ? 'border-slate-700 bg-slate-900 text-slate-500'
    : above
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : 'border-rose-500/30 bg-rose-500/10 text-rose-300';

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${tone}`}
      title={sectorMovingAverageTitle(row, period)}
    >
      {label}
    </span>
  );
}

function SectorTable({ rows }: { rows: NonNullable<MasterFilterMetrics['sectorRows']> }) {
  if (rows.length === 0) return null;

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <div className="mb-3 flex items-center gap-2 text-slate-300">
        <TrendingUp className="h-4 w-4 text-emerald-300" />
        <p className="text-sm font-bold">강한 업종 흐름 <span className="font-normal text-slate-500">(당일 기준)</span></p>
      </div>
      <div className="md:hidden space-y-2">
        {rows.map((row) => (
          <div key={row.symbol} className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-500">#{row.rank}</span>
                  <p className="text-xs font-bold text-white">{row.name}</p>
                </div>
                <p className="mt-1 truncate text-[11px] text-slate-300" title={row.tickerName}>
                  {row.tickerName || row.name}
                </p>
                <p className="font-mono text-[10px] text-slate-500">{row.symbol}</p>
              </div>
              <span className={`shrink-0 text-[10px] ${row.riskOn ? 'text-emerald-400' : 'text-slate-500'}`}>
                {row.riskOn ? '공격 업종' : '방어/중립'}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-800 pt-2 text-right font-mono">
              <div>
                <p className="text-[9px] text-slate-500">당일</p>
                <p className={`text-xs font-bold ${sectorReturnTone(row.return1)}`}>{sectorReturnText(row.return1)}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-500">주간(5일)</p>
                <p className={`text-xs font-bold ${sectorReturnTone(row.return5)}`}>{sectorReturnText(row.return5)}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-500">20일</p>
                <p className={`text-xs font-bold ${sectorReturnTone(row.return20)}`}>{sectorReturnText(row.return20)}</p>
              </div>
            </div>
            <div className="mt-2 flex justify-end gap-1.5">
              <MovingAverageBadge row={row} period={5} />
              <MovingAverageBadge row={row} period={20} />
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left text-sm text-slate-300">
          <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3">당일 순위</th>
              <th className="py-2 pr-3">섹터</th>
              <th className="py-2 pr-3">실제 종목명</th>
              <th className="py-2 pr-3">티커</th>
              <th className="py-2 pr-3 text-right">당일 수익률</th>
              <th className="py-2 pr-3 text-right">주간 수익률</th>
              <th className="py-2 pr-3 text-right">20일 수익률</th>
              <th className="py-2 pr-3">이동평균선</th>
              <th className="py-2 pr-3">성격</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol} className="border-b border-slate-900">
                <td className="py-2 pr-3 font-mono text-slate-400">{row.rank}</td>
                <td className="py-2 pr-3 font-semibold text-white">{row.name}</td>
                <td className="max-w-[260px] py-2 pr-3 text-xs text-slate-300" title={row.tickerName}>
                  {row.tickerName || row.name}
                </td>
                <td className="py-2 pr-3 font-mono">{row.symbol}</td>
                <td className={`py-2 pr-3 text-right font-mono ${sectorReturnTone(row.return1)}`}>
                  {sectorReturnText(row.return1)}
                </td>
                <td className={`py-2 pr-3 text-right font-mono ${sectorReturnTone(row.return5)}`}>
                  {sectorReturnText(row.return5)}
                </td>
                <td className={`py-2 pr-3 text-right font-mono ${sectorReturnTone(row.return20)}`}>
                  {sectorReturnText(row.return20)}
                </td>
                <td className="py-2 pr-3">
                  <div className="flex gap-1">
                    <MovingAverageBadge row={row} period={5} />
                    <MovingAverageBadge row={row} period={20} />
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <span className={`rounded-lg border px-2 py-1 text-xs ${row.riskOn ? 'border-emerald-500/30 text-emerald-300' : 'border-slate-700 text-slate-400'}`}>
                    {row.riskOn ? '공격 업종' : '방어/중립'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DistributionTable({ details }: { details: NonNullable<MasterFilterMetrics['distributionDetails']> }) {
  if (!details || details.length === 0) return null;

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-300">
          <ShieldAlert className="h-4 w-4 text-rose-400" />
          <p className="text-sm font-bold">분산일 상세 내역</p>
        </div>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">최근 25거래일 기준</span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3">날짜</th>
              <th className="py-2 pr-3 text-right">종가</th>
              <th className="py-2 pr-3 text-right">등락률</th>
              <th className="py-2 pr-3 text-right">거래량</th>
            </tr>
          </thead>
          <tbody>
            {details.slice().reverse().map((row, idx) => (
              <tr key={idx} className="border-b border-slate-900 last:border-0 hover:bg-slate-900/50">
                <td className="py-2 pr-3 font-mono text-slate-400">
                  {new Date(row.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                </td>
                <td className="py-2 pr-3 text-right font-mono">{row.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-2 pr-3 text-right font-mono text-rose-400">{row.pctChange}%</td>
                <td className="py-2 pr-3 text-right font-mono text-slate-300">{row.volume.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DataQualityPanel({
  metrics,
  market,
}: {
  metrics: MasterFilterMetrics;
  market: string;
}) {
  const rows = [
    metrics.trend,
    metrics.breadth,
    metrics.volatility,
    metrics.ftd,
    metrics.distribution,
    metrics.newHighLow,
    metrics.sectorRotation,
    metrics.adr,
  ].filter((row): row is MasterFilterMetricDetail => Boolean(row));

  return (
    <section className="rounded-xl border border-sky-500/25 bg-slate-950/55 p-4 shadow-[var(--panel-shadow)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-300">
            {market === 'KR' ? 'KOSPI 200' : 'SPY'} 기준 내부 건강도
          </p>
          <h2 className="mt-1 text-lg font-black text-white">데이터 확인 필요</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
            현재 지표는 투자 판단용으로 채점되지 않았습니다. 0점은 시장 약세가 아니라 API/인증/데이터 소스 미수신 상태를 의미합니다.
          </p>
        </div>
        <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-left md:text-right">
          <p className="text-[10px] font-semibold uppercase text-sky-300">종합 점수</p>
          <p className="font-mono text-xl font-black text-white">확인 필요</p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900/70 text-[10px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-3 py-2">항목</th>
              <th className="px-3 py-2">상태</th>
              <th className="hidden px-3 py-2 md:table-cell">확인할 내용</th>
              <th className="px-3 py-2 text-right">출처</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-slate-800/80">
                <td className="px-3 py-2 font-semibold text-slate-200">{friendlyMetricLabel(row.label)}</td>
                <td className="px-3 py-2">
                  <span className="rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-200">
                    확인 필요
                  </span>
                </td>
                <td className="hidden px-3 py-2 text-slate-400 md:table-cell">{row.description}</td>
                <td className="px-3 py-2 text-right font-mono text-[10px] text-slate-500">{row.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-slate-300 md:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <p className="font-semibold text-sky-200">1. 인증/세션</p>
          <p className="mt-1 text-slate-400">API 인증이 정상이어야 실시간 채점이 시작됩니다.</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <p className="font-semibold text-sky-200">2. 기준 시각</p>
          <p className="mt-1 text-slate-400">as-of와 지연 상태를 확인한 뒤 당일 판단에 사용합니다.</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <p className="font-semibold text-sky-200">3. 재채점</p>
          <p className="mt-1 text-slate-400">데이터 정상화 후 종합 점수, 강한 반등 확인 여부, 시장 폭, 강한 업종을 다시 평가합니다.</p>
        </div>
      </div>
    </section>
  );
}

function AdrEducationPanel({ detail }: { detail: MasterFilterMetricDetail }) {
  const guidance = getAverageDailyRangeGuidance(detail.status);

  return (
    <section className="rounded-lg border border-amber-500/25 bg-slate-950/50 p-4" aria-labelledby="adr-guide-title">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div>
          <h3 id="adr-guide-title" className="text-sm font-bold text-slate-200">하루 변동폭 바로 읽기</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            현재 값 <strong className="text-white">{detail.value}{detail.unit}</strong>은 <strong className="text-amber-200">{guidance.label}</strong>입니다. {guidance.action}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
          <p className="text-xs font-bold text-sky-200">현재 화면: 20일 평균 하루 변동폭</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            지수의 <strong className="text-slate-200">하루 가격 변동폭</strong>을 20일 평균으로 계산합니다. 기준은 <span className="font-mono text-slate-300">{detail.threshold}</span>이며 시장별로 다릅니다.
          </p>
        </div>
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
          <p className="text-xs font-bold text-violet-200">별도 참고: 상승/하락 종목 비율</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            <strong className="text-slate-200">상승 종목 수 ÷ 하락 종목 수 × 100</strong>으로 시장 참여 폭을 봅니다. 아래 75·120 기준은 이 등락비율에만 적용되며 현재 카드 값에는 적용하지 않습니다.
          </p>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
        <div className="grid grid-cols-2 bg-slate-900/70 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <span>상승/하락 종목 비율</span>
          <span>일반적 해석</span>
        </div>
        {ADVANCE_DECLINE_RATIO_BANDS.map((band) => (
          <div key={band.range} className="grid grid-cols-2 border-t border-slate-800 px-3 py-2 text-xs">
            <span className="font-mono font-bold text-slate-300">{band.range}</span>
            <span className="text-slate-400">{band.meaning}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        등락비율은 숫자 자체보다 방향 전환이 중요합니다. 75 이하에서 상승 전환, 120 이상에서 하락 전환, 지수와 반대로 움직이는 다이버전스를 함께 확인하세요. 한 번의 값만으로 매수·매도를 결정하지 않습니다.
      </p>
    </section>
  );
}

export default function MetricsGrid() {
  const { data, isLoading } = useMarket();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((item) => (
          <Card key={item} className="h-64 animate-pulse border-slate-700/50 bg-slate-800/30">
            <div />
          </Card>
        ))}
      </div>
    );
  }

  const { metrics } = data;
  const isUnscored = data.state === 'GREY';
  const scoredMetricsList: MetricDisplayItem[] = [
    { detail: metrics.trend, movingAverageData: metrics.movingAverageHistory && metrics.movingAverageHistory.length > 1 ? metrics.movingAverageHistory : undefined },
    { detail: metrics.breadth, chartData: metrics.mainHistory && metrics.mainHistory.length > 1 ? metrics.mainHistory : undefined },
    { detail: metrics.volatility, chartData: metrics.vixHistory && metrics.vixHistory.length > 1 ? metrics.vixHistory : undefined },
    { detail: metrics.ftd },
    { detail: metrics.distribution },
    { detail: metrics.newHighLow },
    { detail: metrics.sectorRotation }
  ];
  const supplementalMetricsList: MetricDisplayItem[] = [
    { detail: metrics.adr },
  ].filter((item) => Boolean(item.detail));
  const displayMetricsList = [...scoredMetricsList, ...supplementalMetricsList];

  if (isUnscored) {
    return <DataQualityPanel metrics={metrics} market={data.market} />;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              {data.market === 'KR' ? 'KOSPI 200' : 'SPY'} 기준 내부 건강도
            </p>
            <h2 className="mt-1 text-xl font-bold text-white">종합 점수</h2>
            <p className="mt-1 font-mono text-[10px] text-slate-500">
              {formatDelay(metrics.meta)} · {metrics.meta.provider} · {formatTimestamp(metrics.meta.asOf)}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-3xl font-black text-white">{metrics.p3Score ?? 0}/100</p>
            <p className="text-[10px] font-bold uppercase text-slate-500">지금 새로 사도 되는지</p>
          </div>
        </div>

        <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">
          {scoredMetricsList.map(({ detail }) => detail ? (
            <div key={detail.label}>
              <div className="mb-1 flex justify-between text-[10px] text-slate-500">
                <span>{friendlyMetricLabel(detail.label)}</span>
                <span className={detail.status === 'PASS' ? 'text-emerald-400' : detail.status === 'WARNING' ? 'text-amber-400' : 'text-rose-400'}>
                  {detail.score ?? 0}/{detail.weight ?? 0}점
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    detail.status === 'PASS' ? 'bg-emerald-500' : detail.status === 'WARNING' ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${detail.weight ? Math.min(((detail.score ?? 0) / detail.weight) * 100, 100) : 0}%` }}
                />
              </div>
            </div>
          ) : null)}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
        {displayMetricsList.map(({ detail, chartData, movingAverageData }, idx) => detail ? (
          <MetricCard 
            key={detail.label} 
            detail={detail} 
            chartData={chartData} 
            movingAverageData={movingAverageData}
            compact={idx >= 3} 
          />
        ) : null)}
      </div>

      {metrics.adr && <AdrEducationPanel detail={metrics.adr} />}

      <SectorTable rows={metrics.sectorRows || []} />
      <DistributionTable details={metrics.distributionDetails || []} />

      <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
        <div className="mb-3 flex items-center gap-2 text-slate-300">
          <TrendingUp className="h-4 w-4 text-emerald-300" />
          <p className="text-sm font-bold">이 신호를 어떻게 볼까</p>
        </div>
        <div className="grid gap-3 text-sm leading-6 text-slate-400 md:grid-cols-3">
          <p><strong className="text-emerald-300">진입 가능</strong>: 후보 종목을 검토하되 매수 지점 근처 거래량과 손절선을 확인합니다.</p>
          <p><strong className="text-amber-300">신규 매수 보류</strong>: 기존 포지션만 유지합니다. 시장 내부 건강도가 회복될 때까지 기다립니다.</p>
          <p><strong className="text-rose-300">신규 매수 금지</strong>: 현금 비중과 기존 포지션 방어를 우선합니다.</p>
        </div>
      </section>
    </div>
  );
}
