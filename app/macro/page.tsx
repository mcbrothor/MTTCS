'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ArrowDown, ArrowUp, Activity, Shield, TrendingUp, TrendingDown, Droplets, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import type { MacroRegime, MacroScoreBreakdown } from '@/types';
import { useMarket } from '@/contexts/MarketContext';

interface MacroHistoryPoint {
  date: string;
  macroScore: number;
  regime: MacroRegime;
}

function MacroSparkline({ history, currentScore }: { history: MacroHistoryPoint[]; currentScore: number }) {
  if (history.length < 2) return null;

  const first = history[0].macroScore;
  const last = history.at(-1)!.macroScore;
  const delta = last - first;
  const isImproving = delta > 0;

  return (
    <div className="w-full mt-4 border-t border-slate-700/50 pt-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Macro Score 30일 추세</span>
        <span className={`flex items-center gap-1 text-xs font-bold ${isImproving ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
          {isImproving ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : null}
          {isImproving ? '+' : ''}{delta}pt ({first} → {currentScore})
        </span>
      </div>
      <div className="h-16">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <defs>
              <linearGradient id="macroSparkGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <ReferenceLine y={70} stroke="#10b981" strokeDasharray="3 2" strokeOpacity={0.4} />
            <ReferenceLine y={45} stroke="#f59e0b" strokeDasharray="3 2" strokeOpacity={0.4} />
            <Area
              type="monotone"
              dataKey="macroScore"
              stroke="#a855f7"
              strokeWidth={1.5}
              fill="url(#macroSparkGrad)"
              isAnimationActive={false}
              dot={false}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', fontSize: 10 }}
              formatter={(value) => [`Macro: ${value ?? '-'}`, ''] as [string, string]}
              labelFormatter={(label) => String(label ?? '')}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 text-[9px] text-slate-600 mt-0.5 justify-center">
        <span className="text-emerald-600">── Risk-ON ≥70</span>
        <span className="text-amber-600">── Neutral ≥45</span>
      </div>
    </div>
  );
}

interface MacroData {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChangePercent: number;
  fiftyDayAverage: number;
}

interface MacroApiResponse {
  data: Record<string, MacroData>;
  score: number;
  regime: MacroRegime;
  breakdown: MacroScoreBreakdown[];
  spyAbove50ma: boolean;
  hygIefDiff: number;
  vixLevel: number;
}

const MACRO_INFO: Record<string, { name: string; descUp: string; descDown: string }> = {
  'UVXY': { name: 'VIX (공포 지수)', descUp: '시장 공포 극대화, 투매 가능성', descDown: '투자 심리 안정평온' },
  '^VIX': { name: 'VIX (공포 지수)', descUp: '시장 공포 극대화, 투매 가능성', descDown: '투자 심리 안정평온' },
  'UUP': { name: '달러 인덱스', descUp: '안전 자산 도피, 위험 자산 악재', descDown: '유동성 팽창, 위험 자산 선호' },
  'KRE': { name: '지역 은행', descUp: '은행 시스템 안정, 대출 활성화', descDown: '신용 경색, 은행 건전성 우려' },
  'SHY': { name: '단기 국채 (현금성)', descUp: '극단적 Risk-OFF, 현금 확보', descDown: '위험 자산(주식) 이동 중' },
  'TLT': { name: '장기 국채', descUp: '침체 우려, 금리 인하 기대', descDown: '고금리 장기화/인플레 우려' },
  'HYG': { name: '하이일드 채권', descUp: '낙관론 팽배, Risk-ON', descDown: '신용 경색 우려, 증시 하락 전조' },
  'IEF': { name: '중기 국채', descUp: '안전 자산 선호', descDown: '금리 상승/인플레 우려' },
  'QQQ': { name: '나스닥 100', descUp: '기술주/성장주 강세', descDown: '밸류 부담, 차익 실현' },
  'SPY': { name: 'S&P 500', descUp: '미 경제 탄탄, 대형주 안정적', descDown: '거시 경제 둔화 우려' },
  'DIA': { name: '다우 존스', descUp: '가치주/방어주로 피난', descDown: '전통 실물 경기 둔화' },
  'IWM': { name: '러셀 2000', descUp: '중소형주 순환매 (진정한 온기)', descDown: '내수/중소기업 자금조달 악화' },
  'RSP': { name: 'S&P 500 (동일가중)', descUp: '소수 쏠림 아닌 고른 상승장', descDown: '대부분 종목 하락장' },
  'GLD': { name: '금', descUp: '시스템 위기 방어, 실질금리 하락', descDown: '달러 강세, 위험 자산 선호 극대화' },
  'CPER': { name: '구리 (닥터 코퍼)', descUp: '글로벌 제조업 확장 신호', descDown: '제조업 둔화, 경기 침체 우려' },
  'USO': { name: '원유', descUp: '인플레 압력 가중, 금리 인하 방해', descDown: '물가 안정, 증시 호재 (폭락 시 침체)' },
  'UNG': { name: '천연가스', descUp: '기상이변 또는 지정학 공급망 리스크', descDown: '온화한 날씨, 재고 과잉' },
  'BTC-USD': { name: '비트코인', descUp: '글로벌 초과 유동성, 투기장 강세', descDown: '유동성 수축, 강한 리스크 오프' },
};

function ValueDisplay({ quote, fallbackTicker }: { quote?: MacroData; fallbackTicker: string }) {
  if (!quote) return <span className="text-slate-500 text-xs text-center block">데이터 없음 ({fallbackTicker})</span>;

  const isUp = quote.regularMarketChangePercent > 0;
  const isAbove50 = quote.regularMarketPrice > quote.fiftyDayAverage;

  return (
    <div className="flex flex-col items-center gap-1.5 p-2 rounded bg-slate-900/50 border border-slate-800">
      <div className="flex items-center justify-between w-full">
        <span className="font-mono text-xs text-slate-400">{quote.symbol === '^VIX' ? 'VIX' : quote.symbol}</span>
        <span className={`flex items-center text-xs font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
          {isUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          {Math.abs(quote.regularMarketChangePercent).toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center justify-between w-full">
        <span className="font-mono text-sm text-white font-semibold">
          {quote.regularMarketPrice < 10 ? quote.regularMarketPrice.toFixed(3) : quote.regularMarketPrice.toFixed(2)}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded cursor-help ${isAbove50 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}
          title={`50일선: ${quote.fiftyDayAverage.toFixed(2)} (현재가가 50일선 ${isAbove50 ? '위' : '아래'}에 있음)`}
        >
          {isAbove50 ? '50MA ▲' : '50MA ▼'}
        </span>
      </div>
      <p className={`text-[10px] text-center mt-1 leading-snug break-keep ${isAbove50 ? 'text-emerald-300' : 'text-rose-300'}`}>
        {isAbove50 ? MACRO_INFO[fallbackTicker]?.descUp : MACRO_INFO[fallbackTicker]?.descDown}
      </p>
    </div>
  );
}

function RatioDisplay({
  label, topQuote, bottomQuote, descUp, descDown,
}: {
  label: string; topQuote?: MacroData; bottomQuote?: MacroData; descUp: string; descDown: string;
}) {
  if (!topQuote || !bottomQuote) return null;

  const diff = topQuote.regularMarketChangePercent - bottomQuote.regularMarketChangePercent;
  const isUp = diff > 0;

  return (
    <div className={`p-4 rounded-lg border ${isUp ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-rose-500/30 bg-rose-500/10'}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className={`text-sm font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>{label}</h4>
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${isUp ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
          Outperformance: {isUp ? '+' : ''}{diff.toFixed(2)}%p
        </span>
      </div>
      <p className={`text-xs leading-5 ${isUp ? 'text-emerald-200' : 'text-rose-200'}`}>
        <strong className="mr-1">{isUp ? '🟢 상승:' : '🔴 하락:'}</strong>
        {isUp ? descUp : descDown}
      </p>
    </div>
  );
}

const REGIME_CONFIG = {
  RISK_ON: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    accent: 'bg-emerald-500/30',
    icon: <CheckCircle2 className="h-10 w-10 text-emerald-400" />,
    title: '리스크 온 (Risk-ON)',
    subtitle: '위험 자산 선호',
    desc: 'S&P 500이 50일선 위에 위치하며, 글로벌 유동성이 하이일드 채권 등 위험 자산으로 유입되고 있습니다. 강세장 패턴(VCP 등)의 돌파 성공 확률이 높으므로 긍정적인 추세 추종 전략을 전개하기 좋은 환경입니다.',
  },
  RISK_OFF: {
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    accent: 'bg-rose-500/30',
    icon: <ShieldAlert className="h-10 w-10 text-rose-400" />,
    title: '리스크 오프 (Risk-OFF)',
    subtitle: '안전 자산 도피',
    desc: 'S&P 500이 추세를 이탈했으며, 하이일드에서 채권(안전 자산)으로 자금이 도피 중입니다. 시장의 투심이 얼어붙고 돌파 실패가 잦아지는 하락장 도입부일 수 있습니다. 신규 진입을 멈추고 현금 비중 확대와 손절 대응에 집중하세요.',
  },
  NEUTRAL: {
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    accent: 'bg-amber-500/30',
    icon: <AlertTriangle className="h-10 w-10 text-amber-400" />,
    title: '중립 혼조세 (Neutral)',
    subtitle: '방향성 불명확',
    desc: '시장의 방향성이 뚜렷하지 않습니다. 자금이 안전 자산과 위험 자산 사이에서 줄다리기 중이며, 개별 종목의 실적 및 모멘텀에 집중해야 합니다. 브레이크아웃 신호에 신중하게 접근하고 리스크 한도를 보수적으로 유지하세요.',
  },
} as const;

function MacroScoreCard({ score, regime, breakdown, history }: { score: number; regime: MacroRegime; breakdown: MacroScoreBreakdown[]; history: MacroHistoryPoint[] }) {
  const cfg = REGIME_CONFIG[regime];

  return (
    <div className={`relative overflow-hidden rounded-xl border p-6 shadow-2xl backdrop-blur-md transition-all duration-700 ${cfg.bg} ${cfg.border}`}>
      <div className={`absolute -left-12 -top-12 h-32 w-32 rounded-full opacity-20 blur-3xl ${cfg.accent}`} />

      <div className="relative z-10 flex flex-col items-center gap-4 text-center mb-6">
        <div className="rounded-full border border-slate-700/50 bg-slate-900/50 p-3 shadow-inner">{cfg.icon}</div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{cfg.subtitle}</p>
          <h2 className={`mt-1 text-2xl font-black tracking-tight ${cfg.color}`}>{cfg.title}</h2>
        </div>
      </div>

      {/* 점수 바 */}
      <div className="relative z-10 mb-4">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span className="font-bold">매크로 점수</span>
          <span className={`font-mono font-black text-lg ${cfg.color}`}>{score}/100</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              regime === 'RISK_ON' ? 'bg-emerald-500' : regime === 'RISK_OFF' ? 'bg-rose-500' : 'bg-amber-500'
            }`}
            style={{ width: `${score}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
          <span>Risk-OFF &lt;45</span>
          <span>Neutral 45–69</span>
          <span>Risk-ON ≥70</span>
        </div>
      </div>

      {/* 컴포넌트 점수 breakdown */}
      <div className="relative z-10 space-y-2">
        {breakdown.map((b) => (
          <div key={b.label}>
            <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
              <span>{b.label}</span>
              <span className={b.score >= b.weight * 0.7 ? 'text-emerald-400' : b.score >= b.weight * 0.4 ? 'text-amber-400' : 'text-rose-400'}>
                {b.score}/{b.weight} · {b.description}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full ${b.score >= b.weight * 0.7 ? 'bg-emerald-500' : b.score >= b.weight * 0.4 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${Math.min((b.score / b.weight) * 100, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="relative z-10 mt-4 text-xs leading-5 text-slate-400 border-t border-slate-700/50 pt-3">
        {cfg.desc}
      </p>
      <p className="relative z-10 mt-2 text-[10px] leading-4 text-slate-600">
        * SPY 추세·HYG/IEF 크레딧·VIX·달러금리·구리/금·시장폭 6개 컴포넌트 가중합산. 임계: ≥70 Risk-ON · 45~69 Neutral · &lt;45 Risk-OFF
      </p>

      {history.length >= 2 && (
        <div className="relative z-10">
          <MacroSparkline history={history} currentScore={score} />
        </div>
      )}
    </div>
  );
}

export default function MacroDashboardPage() {
  const [apiData, setApiData] = useState<MacroApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MacroHistoryPoint[]>([]);
  const { conflictWarning, data: mfData } = useMarket();

  useEffect(() => {
    async function fetchMacro() {
      try {
        const [macroRes] = await Promise.all([
          axios.get<MacroApiResponse>('/api/macro'),
          fetch('/api/macro/history?days=30')
            .then((r) => r.json())
            .then((j: { data?: MacroHistoryPoint[] }) => { if (Array.isArray(j.data)) setHistory(j.data); })
            .catch(() => {}),
        ]);
        setApiData(macroRes.data);
      } catch (err: unknown) {
        setError(axios.isAxiosError(err) ? err.response?.data?.message || err.message : '데이터를 가져오는 데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    }
    fetchMacro();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-slate-400">글로벌 자금 흐름을 분석 중입니다...</p>
      </div>
    );
  }

  if (error || !apiData) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-rose-400">
        <p className="text-xl font-bold">오류가 발생했습니다</p>
        <p className="mt-2 text-rose-300/70">{error}</p>
      </div>
    );
  }

  const { data } = apiData;
  const updatedAt = mfData?.metrics.updatedAt || mfData?.metrics.meta.asOf;

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12">
      <section className="panel-grid p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">매크로 분석</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
              첨부 HTML의 상단 정보 구조를 기준으로 점수와 리스크 상태를 먼저 읽도록 정리했습니다. 기존 MTN의 세부 자산군 분석과 경고 로직은 그대로 유지합니다.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[430px]">
            <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Regime</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-[var(--text-primary)]">{apiData.regime}</p>
            </div>
            <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Score</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-[var(--text-primary)]">{apiData.score}/100</p>
            </div>
            <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">MF Sync</p>
              <p className="mt-2 font-mono text-sm font-semibold text-[var(--text-primary)]">
                {updatedAt ? new Date(updatedAt).toLocaleString('ko-KR') : '--'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mb-4">
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white mb-6">매크로 분석</h1>

        {/* 크로스 시그널 충돌 배너 */}
        {conflictWarning && mfData && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <span className="font-bold">신호 충돌 경고 · MF:{mfData.state}</span>
              <span className="ml-2 font-normal">{conflictWarning}</span>
            </div>
          </div>
        )}

        <MacroScoreCard score={apiData.score} regime={apiData.regime} breakdown={apiData.breakdown} history={history} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">

        {/* 1. 위험 및 유동성 */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-5 h-5 text-rose-400" />
            <h2 className="text-lg font-bold text-white">위험 및 유동성 (Risk & Liquidity)</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <ValueDisplay quote={data['^VIX'] as MacroData | undefined ?? data['UVXY'] as MacroData | undefined} fallbackTicker="^VIX" />
            <ValueDisplay quote={data['UUP'] as MacroData | undefined} fallbackTicker="UUP" />
            <ValueDisplay quote={data['KRE'] as MacroData | undefined} fallbackTicker="KRE" />
          </div>
        </Card>

        {/* 2. 채권 시장 */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">채권 시장과 위험 선호도</h2>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <ValueDisplay quote={data['SHY'] as MacroData | undefined} fallbackTicker="SHY" />
            <ValueDisplay quote={data['TLT'] as MacroData | undefined} fallbackTicker="TLT" />
            <ValueDisplay quote={data['HYG'] as MacroData | undefined} fallbackTicker="HYG" />
            <ValueDisplay quote={data['IEF'] as MacroData | undefined} fallbackTicker="IEF" />
          </div>
        </Card>

        {/* 3. 주식 지수 */}
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">주식 지수 및 시장 강도 (Equity Breadth)</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <ValueDisplay quote={data['QQQ'] as MacroData | undefined} fallbackTicker="QQQ" />
            <ValueDisplay quote={data['SPY'] as MacroData | undefined} fallbackTicker="SPY" />
            <ValueDisplay quote={data['DIA'] as MacroData | undefined} fallbackTicker="DIA" />
            <ValueDisplay quote={data['IWM'] as MacroData | undefined} fallbackTicker="IWM" />
            <ValueDisplay quote={data['RSP'] as MacroData | undefined} fallbackTicker="RSP" />
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <RatioDisplay
              label="QQQ / SPY (기술주 쏠림)"
              topQuote={data['QQQ'] as MacroData | undefined}
              bottomQuote={data['SPY'] as MacroData | undefined}
              descUp="빅테크 주도의 기술주 쏠림 장세"
              descDown="가치주나 방어주로 자금 이동 중"
            />
            <RatioDisplay
              label="IWM / SPY (중소형 순환매)"
              topQuote={data['IWM'] as MacroData | undefined}
              bottomQuote={data['SPY'] as MacroData | undefined}
              descUp="경제 전반에 온기가 퍼지는 건강한 상승장"
              descDown="대형주에만 자금이 숨어드는 불안장세"
            />
            <RatioDisplay
              label="RSP / SPY (시장 건전성)"
              topQuote={data['RSP'] as MacroData | undefined}
              bottomQuote={data['SPY'] as MacroData | undefined}
              descUp="소외받는 종목 없이 전체가 고루 오르는 장세"
              descDown="소수 시총 상위 기업만 오르는 '착시 상승'"
            />
          </div>
        </Card>

        {/* 4. 원자재 및 암호화폐 */}
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <Droplets className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white">원자재 및 비트코인 (Commodities & Crypto)</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <ValueDisplay quote={data['GLD'] as MacroData | undefined} fallbackTicker="GLD" />
            <ValueDisplay quote={data['CPER'] as MacroData | undefined} fallbackTicker="CPER" />
            <ValueDisplay quote={data['USO'] as MacroData | undefined} fallbackTicker="USO" />
            <ValueDisplay quote={data['UNG'] as MacroData | undefined} fallbackTicker="UNG" />
            <ValueDisplay quote={data['BTC-USD'] as MacroData | undefined} fallbackTicker="BTC-USD" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <RatioDisplay
              label="CPER / GLD (구리 vs 금)"
              topQuote={data['CPER'] as MacroData | undefined}
              bottomQuote={data['GLD'] as MacroData | undefined}
              descUp="경기 확장 뷰 우세, 국채 금리 상승, 주식 호황"
              descDown="경기 침체 뷰 우세, 국채 금리 하락, 안전자산 선호"
            />
            <RatioDisplay
              label="HYG / IEF (위험채권 vs 안전채권)"
              topQuote={data['HYG'] as MacroData | undefined}
              bottomQuote={data['IEF'] as MacroData | undefined}
              descUp="리스크 온(Risk-ON) : 주식 시장 긍정적 시그널"
              descDown="리스크 오프(Risk-OFF) : 신용 경색 및 증시 하락 경고"
            />
          </div>
        </Card>

      </div>
    </div>
  );
}
