'use client';

import { Activity, ArrowUpRight, CalendarDays, ExternalLink, Info, Star, TrendingUp, Waves, X, CheckCircle2, XCircle, BarChart3, AlertTriangle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import type { ScannerResult } from '@/types';
import Button from '@/components/ui/Button';
import { getVolumeSignalTier, type VolumeSignalTier } from '@/lib/scanner-recommendation';
import HistoricalScoreChart from '@/components/analysis/HistoricalScoreChart';
import AnalysisChartContainer from '@/components/analysis/AnalysisChartContainer';
import GlossaryTooltip from '@/components/ui/GlossaryTooltip';

interface VcpDrilldownModalProps {
  result: ScannerResult | null;
  onClose: () => void;
  onAddToWatchlist: (item: ScannerResult) => Promise<void>;
  isSavingWatchlist: boolean;
}

const GRADE_THEMES = {
  strong: { border: 'border-emerald-500/50', bg: 'bg-emerald-500/10', text: 'text-emerald-300', accent: 'bg-emerald-500' },
  forming: { border: 'border-blue-500/50', bg: 'bg-blue-500/10', text: 'text-blue-300', accent: 'bg-blue-500' },
  weak: { border: 'border-amber-500/50', bg: 'bg-amber-500/10', text: 'text-amber-300', accent: 'bg-amber-500' },
  none: { border: 'border-slate-700', bg: 'bg-slate-800/50', text: 'text-slate-400', accent: 'bg-slate-600' },
};

function pct(value: number | null | undefined) {
  return typeof value === 'number' ? `${value > 0 ? '+' : ''}${value}%` : '-';
}

function valueOrDash(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString() : '-';
}

function translateBaseType(result: ScannerResult) {
  if (result.baseType === 'High_Tight_Flag') return '하이 타이트 플래그';
  if (result.baseType === 'Standard_VCP') return '표준 VCP';
  if (result.momentumBranch === 'EXTENDED') return '확장 모멘텀';
  return '-';
}

function translateGrade(grade: ScannerResult['vcpGrade']) {
  if (grade === 'strong') return '강한 형성';
  if (grade === 'forming') return '형성 중';
  if (grade === 'weak') return '약함';
  return '없음';
}

function translateVolumeTier(tier: VolumeSignalTier) {
  if (tier === 'Strong') return '강함';
  if (tier === 'Watch') return '관찰';
  if (tier === 'Weak') return '약함';
  return '불명';
}

function translateMomentumBranch(branch: ScannerResult['momentumBranch']) {
  if (branch === 'EXTENDED') return '확장 모멘텀';
  if (branch === 'STANDARD') return '표준 추세';
  return '-';
}

function translateRsLine(result: ScannerResult) {
  if (result.rsLineNewHigh) return '신고가';
  if (result.rsLineNearHigh) return '신고가 근접';
  return '-';
}

function translateStopPlan(item: string) {
  if (item.startsWith('Initial stop:')) return item.replace('Initial stop:', '초기 손절:').replace('max(base low', '베이스 저점과').replace('7% cap', '7% 손실 제한 중 높은 값').replace(') =', ') =');
  if (item.includes('move stop to breakeven')) return '+5% 도달 시 손절선을 본전으로 올립니다.';
  if (item.includes('trail with MA10')) return '+10% 도달 시 10일선 또는 최근 10일 저가 기준으로 추적 손절합니다.';
  return item;
}

function translateDetail(detail: string) {
  if (detail.startsWith('Momentum branch:')) {
    const branch = detail.includes('EXTENDED') ? '확장 모멘텀' : '표준 추세';
    const eightWeek = detail.match(/8-week return ([^,%]+)%/)?.[1] ?? 'n/a';
    const ma50 = detail.match(/MA50 distance ([^,%]+)%/)?.[1] ?? 'n/a';
    const low52 = detail.match(/52-week low advance ([^,%]+)%/)?.[1] ?? 'n/a';
    return `모멘텀 분기: ${branch} (8주 수익률 ${eightWeek}%, 50일선 이격 ${ma50}%, 52주 저점 대비 상승률 ${low52}%).`;
  }

  if (detail.startsWith('High Tight Flag check:')) {
    const baseDays = detail.match(/base (\d+)d/)?.[1] ?? 'n/a';
    const drawdown = detail.match(/drawdown ([^,%]+)%/)?.[1] ?? 'n/a';
    const volume = detail.match(/right-side volume ([^x]+)x/)?.[1] ?? 'n/a';
    const tightness = detail.match(/tightness ([^\.]+)/)?.[1] ?? 'n/a';
    return `하이 타이트 플래그 점검: 베이스 ${baseDays}거래일, 낙폭 ${drawdown}%, 우측 거래량은 50일 평균의 ${volume}배, 타이트니스 ${tightness}.`;
  }

  if (detail.startsWith('HTF context RS rating:')) {
    const rs = detail.match(/rating: ([^\.]+)/)?.[1] ?? 'n/a';
    return `HTF 참고 RS: ${rs}. Recommended 등급에는 RS 90+가 필요하지만, 거래량 건조화도 반드시 필요합니다.`;
  }

  if (detail.includes('High Tight Flag passed')) return '하이 타이트 플래그 통과: 얕은 베이스와 필수 우측 거래량 건조화가 확인됐습니다.';
  if (detail.includes('Extended momentum was detected')) return '확장 모멘텀이 감지됐지만 베이스 기간, 낙폭, 거래량 건조화 중 일부가 부족해 하이 타이트 플래그는 통과하지 못했습니다.';
  if (detail.startsWith('VCP composite score:')) return detail.replace('VCP composite score:', 'VCP 종합 점수:');
  return detail;
}

export default function VcpDrilldownModal({
  result,
  onClose,
  onAddToWatchlist,
  isSavingWatchlist,
}: VcpDrilldownModalProps) {
  if (!result) return null;

  const theme = GRADE_THEMES[result.vcpGrade || 'none'];
  const volumeTier = getVolumeSignalTier(result);
  const metrics = [
    { label: '수축 구조', score: result.contractionScore, icon: <Waves className="h-4 w-4" /> },
    { label: '거래량 건조화', score: result.volumeDryUpScore, icon: <Activity className="h-4 w-4" /> },
    { label: '볼린저 수축', score: result.bbSqueezeScore, icon: <TrendingUp className="h-4 w-4" /> },
    { label: '포켓 피벗', score: result.pocketPivotScore, icon: <ArrowUpRight className="h-4 w-4" /> },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-3xl overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 p-6">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-2xl font-black tracking-tight text-white">{result.ticker}</h3>
                <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${theme.border} ${theme.bg} ${theme.text}`}>
                  {translateBaseType(result) !== '-' ? translateBaseType(result) : `VCP ${translateGrade(result.vcpGrade)}`}
                </span>
                <span className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-bold text-slate-300">
                  <GlossaryTooltip termKey="RS">상대강도 {result.rsRating ?? result.benchmarkRelativeScore ?? '-'}</GlossaryTooltip>
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-400">{result.name} · {result.exchange}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label="닫기"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="max-h-[70vh] space-y-8 overflow-y-auto p-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatItem label="VCP 점수" value={`${result.vcpScore ?? 0}`} highlight />
              <StatItem label="피벗 이격" value={pct(result.distanceToPivotPct)} />
              <StatItem label="패턴 유형" value={translateBaseType(result)} />
              <StatItem label="거래량 신호" value={translateVolumeTier(volumeTier)} />
            </div>

            {/* SEPA Trend Template Checklist */}
            <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-5 shadow-inner">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-black text-white uppercase tracking-wider">
                  <TrendingUp className="h-4 w-4 text-rose-500" />
                  <GlossaryTooltip termKey="SEPA">SEPA Trend Template</GlossaryTooltip>
                </div>
                <div className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${result.sepaEvidence?.summary.failed === 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                  {result.sepaEvidence?.summary.failed === 0 ? 'ALL CRITERIA PASSED' : `${result.sepaEvidence?.summary.failed || 0} CRITERIA FAILED`}
                </div>
              </div>
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {result.sepaCriteria?.map((criterion, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs border-b border-slate-800/50 pb-2">
                    <span className="text-slate-400 font-medium">{criterion.description}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-500">{criterion.actual}</span>
                      {criterion.status === 'pass' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : criterion.status === 'fail' ? (
                        <XCircle className="h-4 w-4 text-rose-500" />
                      ) : (
                        <Info className="h-4 w-4 text-slate-600" />
                      )}
                    </div>
                  </div>
                )) || <p className="text-xs text-slate-600 italic">SEPA 기준 데이터가 없습니다.</p>}
              </div>
            </section>

            {/* Fundamental Analysis Section */}
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-black text-white uppercase tracking-wider">
                <BarChart3 className="h-4 w-4 text-amber-500" />
                <span>Fundamental Analysis (DART/EDGAR Integrated)</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {result.fundamentals ? (
                  <>
                    <FundamentalCard label="분기 순이익 성장(EPS)" value={pct(result.fundamentals.epsGrowthPct)} status={result.fundamentals.epsGrowthPct && result.fundamentals.epsGrowthPct >= 25 ? 'strong' : 'neutral'} termKey="EPS" />
                    <FundamentalCard label="분기 매출 성장" value={pct(result.fundamentals.revenueGrowthPct)} status={result.fundamentals.revenueGrowthPct && result.fundamentals.revenueGrowthPct >= 20 ? 'strong' : 'neutral'} termKey="REVENUE" />
                    <FundamentalCard label="자기자본이익률(ROE)" value={pct(result.fundamentals.roePct)} status={result.fundamentals.roePct && result.fundamentals.roePct >= 17 ? 'strong' : 'neutral'} termKey="ROE" />
                    <FundamentalCard label="부채비율" value={pct(result.fundamentals.debtToEquityPct)} status="neutral" />
                    <FundamentalCard 
                      label="기관 보유" 
                      value={result.fundamentals.institutionalOwnershipPct != null ? `${result.fundamentals.institutionalOwnershipPct.toFixed(1)}%` : 'N/A'} 
                      status={(result.fundamentals.institutionalOwnershipPct ?? 0) > 30 ? 'strong' : 'neutral'} 
                    />
                    <FundamentalCard label="업종/섹터" value={result.fundamentals.sector || '-'} status="neutral" />
                  </>
                ) : (
                  <div className="col-span-full rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-center">
                    <p className="text-xs text-amber-200/70">
                      펀더멘털 정보를 가져오지 못했습니다. (DART/EDGAR 연동 확인 필요)
                    </p>
                  </div>
                )}
              </div>
              {result.fundamentals?.source && (
                <p className="mt-3 text-[10px] text-slate-500 italic text-right">Source: {result.fundamentals.source}</p>
              )}
            </section>

            {/* RS 히스토리 차트 (Phase 3.5) */}
            <HistoricalScoreChart ticker={result.ticker} market={result.exchange === 'KRX' ? 'KR' : 'US'} />

            {/* 데이터 품질 경고 (v2.1 추가) */}
            {(result.dataWarnings?.length > 0 || (result as ScannerResult & {rsDataQuality?: string}).rsDataQuality === 'PARTIAL') && (
              <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span>데이터 품질 경고 및 참고</span>
                </div>
                <ul className="space-y-1.5 text-xs text-amber-200/60">
                  {(result as ScannerResult & {rsDataQuality?: string}).rsDataQuality === 'PARTIAL' && (
                    <li>• 상장 1년 미만 또는 거래 이력 부족으로 RS(상대강도)가 부정확할 수 있습니다.</li>
                  )}
                  {result.dataWarnings?.map((warning: string, i: number) => (
                    <li key={i}>• {warning}</li>
                  ))}
                  {!result.fundamentals && (
                    <li>• 재무 데이터가 누락되었습니다. 실적 발표 시즌에는 데이터 지연이 발생할 수 있습니다.</li>
                  )}
                </ul>
              </section>
            )}

            {/* Key Technical Information */}
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InfoTile label="RS 순위" value={result.rsRank && result.rsUniverseSize ? `${result.rsRank}/${result.rsUniverseSize}` : '-'} />
              <InfoTile label="가중 모멘텀" value={pct(result.weightedMomentumScore)} />
              <InfoTile label="RS 라인" value={translateRsLine(result)} />
              <InfoTile label="테니스 공 반등" value={`${result.tennisBallCount ?? 0}회 (${result.tennisBallScore ?? 0}점)`} termKey="TENNIS_BALL" />
              <InfoTile label="8주 수익률" value={pct(result.eightWeekReturnPct)} />
              <InfoTile label="50일선 이격" value={pct(result.distanceFromMa50Pct)} />
              <InfoTile label="52주 저점 대비" value={pct(result.low52WeekAdvancePct)} />
              <InfoTile label="모멘텀 분기" value={translateMomentumBranch(result.momentumBranch)} />
            </section>

            {/* High Tight Flag details if applicable */}
            {result.highTightFlag && (
              <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-300">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <span>하이 타이트 플래그</span>
                </div>
                <div className="grid gap-3 text-xs sm:grid-cols-3">
                  <InfoTile label="통과 여부" value={result.highTightFlag.passed ? '통과' : '미통과'} />
                  <InfoTile label="베이스 기간" value={`${result.highTightFlag.baseDays}거래일`} />
                  <InfoTile label="최대 낙폭" value={pct(result.highTightFlag.maxDrawdownPct)} />
                  <InfoTile label="우측 거래량" value={result.highTightFlag.rightSideVolumeRatio === null ? '-' : `50일 평균의 ${result.highTightFlag.rightSideVolumeRatio}배`} />
                  <InfoTile label="타이트니스" value={`${result.highTightFlag.tightnessScore}/100`} />
                  <InfoTile
                    label="손절 기준"
                    value={
                      result.highTightFlag.stopReliability === 'RELIABLE'
                        ? valueOrDash(result.highTightFlag.stopPrice)
                        : 'Base 미형성'
                    }
                  />
                </div>
                {result.highTightFlag.stopPlan.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-xs text-slate-400">
                    {result.highTightFlag.stopPlan.map((item) => <li key={item}>- {translateStopPlan(item)}</li>)}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-amber-300">Base 미형성으로 손절 기준선 산출 보류</p>
                )}
              </section>
            )}

            {/* VCP Technical Metrics */}
            <section className="space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">기술 점수</h4>
              <div className="grid gap-5">
                {metrics.map((metric) => (
                  <div key={metric.label} className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <div className="flex items-center gap-2 text-slate-300">
                        {metric.icon}
                        <GlossaryTooltip termKey={metric.label === '포켓 피벗' ? 'POCKET_PIVOT' : metric.label === '수축 구조' ? 'VCP' : ''}>
                          <span>{metric.label}</span>
                        </GlossaryTooltip>
                      </div>
                      <span className={theme.text}>{metric.score ?? 0} / 100</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${metric.score ?? 0}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className={`h-full ${theme.accent}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Analysis Logs */}
            <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-300">
                <Activity className="h-4 w-4 text-emerald-400" />
                <span>분석 로그</span>
              </div>
              <ul className="grid gap-2 text-sm leading-relaxed text-slate-400">
                {result.vcpDetails?.map((detail, index) => (
                  <li key={`${detail}-${index}`} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-700" />
                    {translateDetail(detail)}
                  </li>
                )) || <li className="italic text-slate-600">분석 세부 내역이 없습니다.</li>}
              </ul>
            </section>

            {/* 하이브리드 분석 차트 (TradingView / Naver / Lightweight) */}
            <section className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-inner">
              <div className="border-b border-slate-800 px-5 py-3 bg-slate-900/60 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-black text-white uppercase tracking-wider">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <span>Hybrid Technical Analysis</span>
                </div>
              </div>
              <div className="h-[500px]">
                <AnalysisChartContainer 
                  ticker={result.ticker} 
                  exchange={result.exchange}
                  pivotPrice={result.pivotPrice}
                  stopLossPrice={result.highTightFlag?.stopPrice || null}
                />
              </div>
            </section>

            {/* Metadata Section */}
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>진입 참고값</span>
                </div>
                <p className="text-sm leading-6 text-slate-300">
                  권장 진입 {valueOrDash(result.recommendedEntry)} · 피벗 {valueOrDash(result.pivotPrice)} · 현재가 {valueOrDash(result.currentPrice)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span>데이터 정보</span>
                </div>
                <div className="space-y-1 text-xs text-slate-500">
                  <p>분석 시각: {result.analyzedAt ? new Date(result.analyzedAt).toLocaleString('ko-KR') : '-'}</p>
                  <p>가격 출처: {result.priceSource || '-'}</p>
                  <p>RS 품질: {(result as ScannerResult & {rsDataQuality?: string}).rsDataQuality === 'FULL' ? '정상 (1년+)' : (result as ScannerResult & {rsDataQuality?: string}).rsDataQuality === 'PARTIAL' ? '부분 (신규주)' : '확인불가'}</p>
                  <p className="flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    RS는 공식 IBD/MarketSmith 등급이 아니라 MTN 내부 Proxy입니다.
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* Action Footer */}
          <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-900/80 p-6 sm:flex-row">
            <Link
              href={(() => {
                // 스캐너 → 계획서 데이터 자동 연결
                // 왜: 스캐너에서 확인한 피벗가·RS·VCP점수를 계획서에 매번 다시 입력하는 비효율을 제거
                const params = new URLSearchParams({
                  ticker: result.ticker,
                  exchange: result.exchange,
                });
                if (result.pivotPrice) params.set('pivot', String(result.pivotPrice));
                if (result.recommendedEntry) params.set('entry', String(result.recommendedEntry));
                if (result.rsRating) params.set('rs', String(result.rsRating));
                if (result.vcpScore) params.set('vcpScore', String(result.vcpScore));
                if (result.vcpGrade) params.set('vcpGrade', result.vcpGrade);
                if (result.rsLineNewHigh) params.set('rsNewHigh', '1');
                if (result.distanceToPivotPct) params.set('pivotDist', String(result.distanceToPivotPct));
                return `/plan?${params.toString()}`;
              })()}
              className="flex-1"
            >
              <Button className="w-full gap-2 py-6 text-base font-bold">
                <ExternalLink className="h-5 w-5" />
                계획 만들기
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => onAddToWatchlist(result)}
              disabled={isSavingWatchlist}
              className="gap-2 py-6 text-base font-bold sm:w-auto sm:px-8"
            >
              <Star className={`h-5 w-5 ${isSavingWatchlist ? 'animate-pulse' : ''}`} />
              {isSavingWatchlist ? '저장 중...' : '관심종목 추가'}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function StatItem({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 truncate font-mono text-lg font-black ${highlight ? 'text-emerald-400' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}

function InfoTile({ label, value, termKey }: { label: string; value: string; termKey?: string }) {
  const content = (
    <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3 w-full">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-200">{value}</p>
    </div>
  );

  if (termKey) {
    return <GlossaryTooltip termKey={termKey}>{content}</GlossaryTooltip>;
  }
  return content;
}

function FundamentalCard({ label, value, status, termKey }: { label: string; value: string; status: 'strong' | 'neutral'; termKey?: string }) {
  const content = (
    <div className={`rounded-lg border p-3 flex flex-col gap-1 w-full ${status === 'strong' ? 'border-emerald-500/30 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'border-slate-800 bg-slate-950/40'}`}>
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{label}</span>
      <span className={`font-mono text-sm font-black ${status === 'strong' ? 'text-emerald-400' : 'text-slate-200'}`}>{value}</span>
    </div>
  );

  if (termKey) {
    return <GlossaryTooltip termKey={termKey}>{content}</GlossaryTooltip>;
  }
  return content;
}
