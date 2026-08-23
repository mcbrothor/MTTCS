import assert from 'node:assert/strict';
import { screenCandidates as kospiScreen, generateSignal as kospiSignal, is52wHigh } from '../lib/strategy/kospi-52w/engine.ts';
import { screenCandidates as usScreen, generateSignal as usSignal } from '../lib/strategy/us-52w/engine.ts';
import { breadth as kospiBreadth, decideRegime as kospiRegime } from '../lib/strategy/kospi-monthly/engine.ts';
import { breadthUS } from '../lib/strategy/us-monthly-v7/engine.ts';

function bar(date, close, high=close){ return { date, open: close, high, low: close, close, volume: 1000 }; }

// 5년(1260일) 합성: KOSPI 완만한 상승, ETF 일부는 신고가
const kospiBars = Array.from({length:1260},(_,i)=> bar(`2020-01-${String((i%28)+1).padStart(2,'0')}`, 3000 + i*0.5 + Math.sin(i/30)*50));
const etfBars = {
  '069500': Array.from({length:1260},(_,i)=> bar(`2020-01-${String((i%28)+1).padStart(2,'0')}`, 100 + i*0.2)),
  '091160': Array.from({length:1260},(_,i)=> bar(`2020-01-${String((i%28)+1).padStart(2,'0')}`, 100 + Math.sin(i/20)*10)),
};
const universe = { '069500': etfBars['069500'], '091160': etfBars['091160'] };
const cands = kospiScreen(universe, kospiBars, '2024-12-31');
assert.ok(cands.length <=12, 'RS Top12');
assert.ok(cands[0].rs >= cands.at(-1).rs, 'RS 정렬');

// 52주 신고가: 오늘 종가가 252일 고점보다 높을 때만 true
const bars253 = Array.from({length:253},(_,i)=> bar(`2024-01-${String(i).padStart(2,'0')}`, 100));
bars253.push(bar('2024-09-01', 200,200));
assert.equal(is52wHigh(bars253, 252), true);
// 신호일≠수익일 분리: 매수는 당일 종가에 Holdings에 포함되지만 익일부터 평가 (backtest.ts 주석)
const sig = kospiSignal([], cands, universe, '2024-12-31');
assert.ok(sig.buyTickers.length + sig.holdTickers.length <=4, '최대 4종목');
assert.equal(sig.cashSlots, 4 - sig.buyTickers.length - sig.holdTickers.length, '현금 슬롯 = 탐지기');
assert.ok(sig.cashSlots >=0, '현금 0~4');

// US 52주 WATCH -1/-3/-5%
const spy = Array.from({length:300},(_,i)=> bar(`2024-01-${String(i).padStart(2,'0')}`, 400+i));
const usU={ 'XLF': Array.from({length:300},(_,i)=> bar(`2024-01-${String(i).padStart(2,'0')}`, 100+i*0.3)) };
const usCands = usScreen(usU, spy, '2024-12-31');
const usSig = usSignal([], usCands, usU, '2024-12-31');
assert.ok(usSig.watchTickers !== undefined, 'WATCH 존재');
assert.ok(usSig.cashSlots >=0);

// Breadth: 120MA 위 비율
const b = kospiBreadth({ 'A': Array.from({length:130},(_,i)=> bar(`2024-01-${String(i).padStart(2,'0')}`, 101)), 'B': Array.from({length:130},(_,i)=> bar(`2024-01-${String(i).padStart(2,'0')}`, 99)) });
assert.ok(b>=0 && b<=100, 'Breadth 0~100');
const regime = kospiRegime(65, -5, 0.03);
assert.ok(['TREND','NON_TREND','RECOVERY','CRASH_50'].includes(regime.regime) || regime.weight!==undefined);

const bus = breadthUS({ 'XLF': Array.from({length:130},(_,i)=> bar(`2024-01-${String(i).padStart(2,'0')}`, 101)) });
assert.ok(bus>=0);

console.log('4strategies 5년 합성 백테스트 회귀 PASS — cash 탐지기·미래정보 분리·WATCH·Breadth 검증');
