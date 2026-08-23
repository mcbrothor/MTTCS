import assert from 'node:assert/strict';
import { generateSignal, is52wHigh, screenCandidates } from '../lib/strategy/kospi-52w/engine.ts';

function bar(date, close, high = close) { return { date, open: close, high, low: close, close, volume: 1000 }; }
const kospi = Array.from({ length: 300 }, (_, i) => bar(`2025-01-${String((i % 28)+1).padStart(2,'0')}`, 3000 + i));
const etfHigh = Array.from({ length: 300 }, (_, i) => bar(`2025-01-${String((i % 28)+1).padStart(2,'0')}`, 100 + i, 100 + i + 1));
const etfFlat = Array.from({ length: 300 }, (_, i) => bar(`2025-01-${String((i % 28)+1).padStart(2,'0')}`, 100));

// 252고가 돌파는 당일 종가가 직전 252 고점보다 높을 때만
const bars = Array.from({ length: 253 }, (_, i) => bar(`2025-01-${String(i).padStart(2,'0')}`, 100));
bars.push(bar('2025-09-01', 200, 200)); // 신고가
assert.equal(is52wHigh(bars, 252), true);
// 미래정보 분리: 신호일 종가에 매수해도 수익은 익일부터 — generateSignal은 당일 보유에 포함하지만 backtest는 익일부터 평가 (문서화)
const universe = { '069500': bars };
const kospiBars = Array.from({ length: 300 }, (_, i) => bar(`2025-01-${String(i).padStart(2,'0')}`, 3000));
const cands = screenCandidates(universe, kospiBars, '2025-09-01');
assert.ok(cands.length <= 12);
// 현금 탐지기: 후보 없으면 cashSlots 4
const sigEmpty = generateSignal([], [], {}, '2025-09-01');
assert.equal(sigEmpty.cashSlots, 4);
console.log('kospi52w engine tests passed');
