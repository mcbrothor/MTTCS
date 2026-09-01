import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const tooltipPath = 'components/strategy/StrategyColumnHeader.tsx';
assert.equal(existsSync(tooltipPath), true, '전략 표 공통 열제목 툴팁이 있어야 한다');

const tooltip = readFileSync(tooltipPath, 'utf8');
assert.match(tooltip, /Tooltip\.Trigger asChild/, '열제목 전체가 툴팁 트리거여야 한다');
assert.match(tooltip, /<button/, '키보드 포커스가 가능한 버튼을 사용해야 한다');
assert.match(tooltip, /aria-label=.*산출 기준/, '보조기술에 산출 기준임을 알려야 한다');
assert.match(tooltip, /Tooltip\.Content/, '상세 산출 기준을 표시해야 한다');
assert.match(tooltip, /help\.formula/, '설명과 산식을 함께 표시할 수 있어야 한다');

const shell = readFileSync('components/strategy/StrategyShell.tsx', 'utf8');
assert.match(shell, /StrategyColumnHeader/, '공통 랭킹 표가 열제목 툴팁을 사용해야 한다');
assert.match(shell, /rankColumnHelp/, '전략마다 다른 열 산출 기준을 받을 수 있어야 한다');
assert.match(shell, /rankRsUnit/, '전략마다 RS 단위를 지정할 수 있어야 한다');
assert.match(shell, /formatRs\(row\.rs, rankRsUnit\)/, '지정한 RS 단위로 값을 표시해야 한다');

const kospi52w = readFileSync('app/strategies/kospi-52w/page.tsx', 'utf8');
assert.match(kospi52w, /ETF 126일 수익률 − KOSPI 126일 수익률/, 'KOSPI RS 산식을 설명해야 한다');
assert.match(kospi52w, /직전 252거래일의 일중 고가/, 'KOSPI 신고가 판정 기준을 설명해야 한다');

const us52w = readFileSync('app/strategies/us-52w/page.tsx', 'utf8');
assert.match(us52w, /ETF 126일 수익률 − SPY 126일 수익률/, '미국 RS 산식을 설명해야 한다');
assert.match(us52w, /조회 구간 최고가/, '고점 거리의 실제 조회 기준을 설명해야 한다');

const monthly = readFileSync('components/strategy/MonthlyStrategyPage.tsx', 'utf8');
assert.match(monthly, /rankRsUnit="%"/, '월간 상대모멘텀은 퍼센트 단위를 사용해야 한다');
assert.match(monthly, /ETF\/벤치마크 상대가격/, '월간 RS의 상대가격 비율 산식을 설명해야 한다');
assert.match(monthly, /3M 상대모멘텀 백분위/, '월간 복합 순위의 구성요소를 설명해야 한다');

const gold = readFileSync('components/gold/GoldStrategyDashboard.tsx', 'utf8');
assert.match(gold, /StrategyColumnHeader/, '금 전략 백테스트 열제목에 도움말을 제공해야 한다');
assert.match(gold, /무위험수익률/, '금 전략 샤프 산식의 무위험수익률 차감을 설명해야 한다');

const nasdaq = readFileSync('components/nasdaq/NasdaqStrategyDashboard.tsx', 'utf8');
assert.match(nasdaq, /StrategyColumnHeader/, '나스닥 전략 백테스트 열제목에 도움말을 제공해야 한다');
assert.match(nasdaq, /QQQ 비중 \+ 2×QLD 비중 \+ 3×TQQQ 비중/, '평균 유효노출의 레버리지 환산 기준을 설명해야 한다');

console.log('strategy column help tests passed');
