'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ArrowDown, ArrowUp, Activity, Shield, TrendingUp, Droplets } from 'lucide-react';

interface MacroData {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChangePercent: number;
  fiftyDayAverage: number;
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
        <span className={`flex items-center text-xs font-bold ${isUp ? 'text-red-400' : 'text-blue-400'}`}>
          {isUp ? <ArrowUp className="w-3 h-3 " /> : <ArrowDown className="w-3 h-3 " />}
          {Math.abs(quote.regularMarketChangePercent).toFixed(2)}%
        </span>
      </div>
      <div className="flex items-center justify-between w-full">
        <span className="font-mono text-sm text-white font-semibold">
          {quote.regularMarketPrice < 10 ? quote.regularMarketPrice.toFixed(3) : quote.regularMarketPrice.toFixed(2)}
        </span>
        <span 
          className={`text-[10px] px-1.5 py-0.5 rounded cursor-help ${isAbove50 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}
          title={`50일선: ${quote.fiftyDayAverage.toFixed(2)} (현재가가 50일선 ${isAbove50 ? '위' : '아래'}에 있음)`}
        >
          {isAbove50 ? '50MA ▲' : '50MA ▼'}
        </span>
      </div>
      <p className={`text-[10px] text-center mt-1 leading-snug break-keep ${isAbove50 ? 'text-red-300' : 'text-blue-300'}`}>
        {isAbove50 ? MACRO_INFO[fallbackTicker]?.descUp : MACRO_INFO[fallbackTicker]?.descDown}
      </p>
    </div>
  );
}

function RatioDisplay({ 
  label, topQuote, bottomQuote, descUp, descDown 
}: { 
  label: string; topQuote?: MacroData; bottomQuote?: MacroData; descUp: string; descDown: string; 
}) {
  if (!topQuote || !bottomQuote) return null;
  
  // 등락률 차이 (상대 강도)
  const diff = topQuote.regularMarketChangePercent - bottomQuote.regularMarketChangePercent;
  const isUp = diff > 0;

  return (
    <div className={`p-4 rounded-lg border ${isUp ? 'border-red-500/30 bg-red-500/10' : 'border-blue-500/30 bg-blue-500/10'}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className={`text-sm font-bold ${isUp ? 'text-red-400' : 'text-blue-400'}`}>{label}</h4>
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${isUp ? 'bg-red-500/20 text-red-300' : 'bg-blue-500/20 text-blue-300'}`}>
          Outperformance: {isUp ? '+' : ''}{diff.toFixed(2)}%p
        </span>
      </div>
      <p className={`text-xs leading-5 ${isUp ? 'text-red-200' : 'text-blue-200'}`}>
        <strong className="mr-1">{isUp ? '🔴 상승:' : '🔵 하락:'}</strong>
        {isUp ? descUp : descDown}
      </p>
    </div>
  );
}



function MarketOverview({ data }: { data: Record<string, MacroData> }) {
  const spy = data['SPY'];
  const hyg = data['HYG'];
  const ief = data['IEF'];

  if (!spy) return null;

  const isSpyUp = spy.regularMarketPrice > spy.fiftyDayAverage;
  const isHygIefUp = hyg && ief ? hyg.regularMarketChangePercent > ief.regularMarketChangePercent : false;

  let statusText = '중립 혼조세 (Neutral)';
  let statusColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  let desc = '시장의 방향성이 뚜렷하지 않습니다. 자금이 안전 자산과 위험 자산 사이에서 줄다리기 중이며, 개별 종목의 실적 및 모멘텀에 집중해야 합니다. 브레이크아웃 신호에 신중하게 접근하고 리스크 한도를 보수적으로 유지하세요.';

  if (isSpyUp && isHygIefUp) {
    statusText = '리스크 온 🚀 (Risk-ON)';
    statusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    desc = 'S&P 500이 50일선 위에 위치하며, 글로벌 유동성이 하이일드 채권 등 위험 자산으로 유입되고 있습니다. 강세장 패턴(VCP 등)의 돌파 성공 확률이 높으므로 긍정적인 추세 추종 전략을 전개하기 좋은 환경입니다.';
  } else if (!isSpyUp && !isHygIefUp) {
    statusText = '리스크 오프 ⚠️ (Risk-OFF)';
    statusColor = 'text-red-400 bg-red-500/10 border-red-500/30';
    desc = 'S&P 500이 추세를 이탈했으며, 하이일드에서 채권(안전 자산)으로 자금이 도피 중입니다. 시장의 투심이 얼어붙고 돌파 실패가 잦아지는 하락장 도입부일 수 있습니다. 신규 진입을 멈추고 현금 비중 확대와 손절 대응에 집중하세요.';
  }

  return (
    <div className={`mb-8 p-5 rounded-xl border ${statusColor}`}>
      <h3 className="flex items-center gap-2 text-lg font-bold">
        현재 시장 종합 판정: <span>{statusText}</span>
      </h3>
      <p className="mt-2 text-sm leading-6 opacity-90 font-medium">
        {desc}
      </p>
      <p className="mt-3 text-xs leading-5 opacity-70 border-t border-current pt-3 mx-[-2px]">
        * 본 요약은 S&P 500의 50일 이평선(추세) 및 HYG/IEF(신용 채권 스프레드)를 결합하여 추산된 동적 매크로 견해입니다. 
        아래의 핵심 지표 카드들의 화살표와 50MA 여부(위/아래)를 살펴보며 시장 자금의 세부 이동을 파악하십시오.
      </p>
    </div>
  );
}

export default function MacroDashboardPage() {
  const [data, setData] = useState<Record<string, MacroData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMacro() {
      try {
        const res = await axios.get('/api/macro');
        setData(res.data.data);
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

  if (error) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-red-400">
        <p className="text-xl font-bold">오류가 발생했습니다</p>
        <p className="mt-2 text-red-300/70">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-12">
      <div className="mb-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-purple-400">Macro Insight</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white mb-6">매크로 분석</h1>
        <MarketOverview data={data} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        
        {/* 1. 위험 및 유동성 */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-5 h-5 text-red-400" />
            <h2 className="text-lg font-bold text-white">위험 및 유동성 (Risk & Liquidity)</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <ValueDisplay quote={data['^VIX'] || data['UVXY']} fallbackTicker="^VIX" />
            <ValueDisplay quote={data['UUP']} fallbackTicker="UUP" />
            <ValueDisplay quote={data['KRE']} fallbackTicker="KRE" />
          </div>
        </Card>

        {/* 2. 채권 시장 */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">채권 시장과 위험 선호도</h2>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <ValueDisplay quote={data['SHY']} fallbackTicker="SHY" />
            <ValueDisplay quote={data['TLT']} fallbackTicker="TLT" />
            <ValueDisplay quote={data['HYG']} fallbackTicker="HYG" />
            <ValueDisplay quote={data['IEF']} fallbackTicker="IEF" />
          </div>
        </Card>

        {/* 3. 주식 지수 */}
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">주식 지수 및 시장 강도 (Equity Breadth)</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <ValueDisplay quote={data['QQQ']} fallbackTicker="QQQ" />
            <ValueDisplay quote={data['SPY']} fallbackTicker="SPY" />
            <ValueDisplay quote={data['DIA']} fallbackTicker="DIA" />
            <ValueDisplay quote={data['IWM']} fallbackTicker="IWM" />
            <ValueDisplay quote={data['RSP']} fallbackTicker="RSP" />
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <RatioDisplay 
              label="QQQ / SPY (기술주 쏠림)"
              topQuote={data['QQQ']} bottomQuote={data['SPY']}
              descUp="빅테크 주도의 기술주 쏠림 장세"
              descDown="가치주나 방어주로 자금 이동 중"
            />
            <RatioDisplay 
              label="IWM / SPY (중소형 순환매)"
              topQuote={data['IWM']} bottomQuote={data['SPY']}
              descUp="경제 전반에 온기가 퍼지는 건강한 상승장"
              descDown="대형주에만 자금이 숨어드는 불안장세"
            />
            <RatioDisplay 
              label="RSP / SPY (시장 건전성)"
              topQuote={data['RSP']} bottomQuote={data['SPY']}
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
            <ValueDisplay quote={data['GLD']} fallbackTicker="GLD" />
            <ValueDisplay quote={data['CPER']} fallbackTicker="CPER" />
            <ValueDisplay quote={data['USO']} fallbackTicker="USO" />
            <ValueDisplay quote={data['UNG']} fallbackTicker="UNG" />
            <ValueDisplay quote={data['BTC-USD']} fallbackTicker="BTC-USD" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <RatioDisplay 
              label="CPER / GLD (구리 vs 금)"
              topQuote={data['CPER']} bottomQuote={data['GLD']}
              descUp="경기 확장 뷰 우세, 국채 금리 상승, 주식 호황"
              descDown="경기 침체 뷰 우세, 국채 금리 하락, 안전자산 선호"
            />
            <RatioDisplay 
              label="HYG / IEF (위험채권 vs 안전채권)"
              topQuote={data['HYG']} bottomQuote={data['IEF']}
              descUp="리스크 온(Risk-ON) : 주식 시장 긍정적 시그널"
              descDown="리스크 오프(Risk-OFF) : 신용 경색 및 증시 하락 경고"
            />
          </div>
        </Card>

      </div>
    </div>
  );
}
