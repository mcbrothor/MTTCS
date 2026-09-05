# MTN 리뉴얼 검토 근거

검토일: 2026-09-05 KST · [리뉴얼 계획서](/Users/mantori/vibecoding/MTN/docs/MTN_RENEWAL_PLAN_2026-09-05.md)

## 1. 검토 범위와 한계

로컬 소스·문서·테스트·배포 설정을 제품/UX, 데이터/분석, 운영/보안으로 나눠 읽었다. 기존 품질 검사를 실행하고 두 순수 함수의 계산 문제를 합성 데이터로 재현했다. 운영 HTTP는 인증하지 않은 조회만 수행했고 Chrome에서 운영 로그인 화면을 확인했다. 로그인 이후 사용자 화면의 자동 검증은 테스트 전용 서버·모킹 응답으로 수행했다.

운영 DB의 추천 성과·누락률·실제 계좌·worker 원장·백업 저장소는 조회하지 않았다. 인증이 필요한 운영 상태 GET 중에는 증거를 저장하는 경로도 있어 실호출 범위를 제한했다. 운영 provider의 최신 응답, 실제 복원 가능성, 모든 화면의 시각적 완성도나 사용자 업무 시간을 검증한 보고서는 아니다. 이번 변경 산출물은 계획/근거 문서이며 구현·운영 변경은 하지 않았다.

심각도는 리뉴얼 작업 순서에 사용하는 분류다. 정적 위험을 실제 사고로 간주하지 않는다. 기능 존재와 운영 환경에서의 효과도 구분한다.

검증 종료 후 다른 작업의 `navigation.ts`, `tests/navigation.test.mjs`, `app/strategies/kr-closing-bet`, `components/closing-bet`, `lib/closing-bet`, 종가베팅 migration 변경이 나타났다. 메뉴·페이지와 데이터 타입만 제한적으로 확인했으며 기존 검사 결과에 포함하지 않는다. 이번 문서 작업에서 수정하거나 커밋에 포함하지 않았다. 아래 소스 행 번호도 검토 기준 커밋을 기준으로 하므로 후속 변경에 따라 이동할 수 있다.

## 2. 기준선과 직접 실행 결과

| 항목 | 확인 결과 |
|---|---|
| 로컬 Git HEAD | `1b29470a0464b6b17d024f3faf37d7b443ec934c`, 검토 시작 시 clean |
| 운영 `/api/release` | HTTP 200, `gitSha=32fb7341ce4037a5455032535e53cb7a4e35d43b`, 2026-09-05 15:37 KST 관측 |
| 로컬/운영 차이 | 로컬의 최신 tooltip 변경 1개가 운영 SHA 이후에 있음. 차이는 확인했지만 의도한 배포 보류인지 미확인 |
| 런타임 | 기본 셸 Node 20.11.0. 프로젝트 engines `>=22.13.0 <25`. 검증에는 설치된 `/opt/homebrew/opt/node@24/bin/node` 24.18.0 사용 |
| 소스 규모 | `git ls-files` 기준 page.tsx 33개, API route.ts 108개, 단위 테스트 파일 175개, E2E spec 37개, Supabase migration 89개 |
| 주요 소스 줄 수 | app/components/lib/scripts의 추적된 ts/tsx/mjs/css 합계 95,130줄. 전체 저장소 줄 수가 아님 |
| `npm run lint` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0, `tsc --noEmit --incremental false` |
| `npm test` | PASS, `All 175 test files passed.`. 테스트 케이스 175개라는 의미가 아님 |
| `npm run check:api-auth` | PASS. 인증 guard 소스 패턴의 정적 검사 |
| `node scripts/release/verify-release.mjs` | PASS, clean/releaseEligible=true, 선언된 HTTP 작업 37개. live.checked=false이며 전체 운영 job 검증이 아님 |
| 격리 production build | PASS, `NEXT_DIST_DIR=.next-verify npm run build`, Next 16.2.10. 빌드가 추가한 tsconfig include 2개는 검증 후 원복 |
| 선택 E2E | PASS, Chromium 32개, 1.3분. a11y 17개 + full-workflow 9개 + strategy-navigation 6개 |

E2E 명령은 `E2E_PORT=3106 E2E_WORKERS=2 PLAYWRIGHT_HTML_OPEN=never npx playwright test tests/e2e/a11y.spec.ts tests/e2e/strategy-navigation.spec.ts tests/e2e/full-workflow.spec.ts --reporter=line`이다. `.env.test`의 테스트 계정과 로컬 DB 주소, 모킹 응답을 사용했다. 정상·방어적 흐름과 4개 핵심 화면의 axe/키보드/확대/모바일 검증을 포함한다. 전체 37개 spec 또는 모든 실제 데이터 경로를 실행한 것은 아니다.

최초 E2E 실행은 샌드박스 포트 권한 `EPERM`, 최초 빌드는 Google Fonts DNS `ENOTFOUND`로 막혔다. 권한이 허용된 재실행에서 둘 다 통과했다. 소스 컴파일 결함으로 분류하지 않는다. 빌드의 외부 폰트 의존성은 재현 가능한 빌드 환경 설계 때 검토한다.

E2E 로그에 `supabaseServer` 기술 부채 경고와 모킹 환경의 pipeline-health 저장 실패가 있었다. 테스트 PASS가 실제 DB 저장 성공을 뜻하지 않음을 보여준다. `full-workflow`는 독립된 시나리오 검사이며, 단일 거래가 모든 단계를 통과해 실제 DB에 유지되는 통합 검증과 다르다.

| 실제 HTTP 조회 | 관측 | 해석 |
|---|---|---|
| 운영 `/` | 307 | 미인증 로그인 redirect |
| 운영 `/api/auth/session` | 200, authenticated=false | 미인증 세션 응답 정상 |
| 운영 `/api/scanner/leader` | 401 | 선택 private route의 미인증 차단 |
| 운영 `/api/cron/monthly-strategies` | 401 | 선택 cron route의 미인증 차단, 작업 실행 안 됨 |
| 로컬 3000 `/api/release` | 500 | 기존 로컬 서버 오류, 원인 미확인 |
| 로컬 3000 `/api/auth/session` | 500 | 기존 로컬 서버 오류, 원인 미확인 |

검토 세션의 임시 로그는 `/tmp/mtn-renewal-lint.log`, `typecheck.log`, `unit.log`, `e2e.log`, `build.log`에 같은 `mtn-renewal-` 접두어로 남겼다. 임시 파일 보존을 보장하지 않으므로 결과와 재실행 조건은 이 문서에 기록했다.

## 3. 확인한 문제와 우선순위

| ID | 수준 | 발견·사용자 영향 | 근거 |
|---|---|---|---|
| F01 | 함수 실행 재현 | 동일 후보 집합의 순서/중복만으로 일일 후보 순위가 변함. 검토할 종목의 우선순위가 입력 배열에 의존 | [집계](/Users/mantori/vibecoding/MTN/lib/daily-screeners/index.ts:757), [worker 사용](/Users/mantori/vibecoding/MTN/scripts/local-llm-worker.mjs:949) |
| F02 | 함수 실행 재현·연구 코드 | 월간 백테스트가 목표 재조정 없이 매일 최초 비중을 적용. 보유 전략과 다른 자산 경로를 생성 | [백테스트](/Users/mantori/vibecoding/MTN/lib/strategy/monthly/backtest.ts:30) |
| F03 | 정적 사실·운영 영향 미측정 | KR 벤치마크 KIS ETF 성공 경로는 DERIVED/FALLBACK. OFFICIAL에 필요한 FULL을 충족하지 못함. 이 경로의 관측치로는 공식 표본을 쌓을 수 없음 | [ETF 경로](/Users/mantori/vibecoding/MTN/lib/recommendations/prices.ts:91), [등급](/Users/mantori/vibecoding/MTN/lib/recommendations/evidence-performance.ts:77), [공식 표본](/Users/mantori/vibecoding/MTN/lib/recommendations/evidence-repository.ts:269) |
| F04 | 정적 사실 | KR 계획 완료 후 `/portfolio`로 연결하지만 포트폴리오는 US 초기 상태. 화면 간 시장 맥락이 유지되지 않음 | [완료 링크](/Users/mantori/vibecoding/MTN/app/plan/page.tsx:464), [포트폴리오](/Users/mantori/vibecoding/MTN/app/portfolio/page.tsx:117) |
| F05 | 정적 위험 | 공통 MarketProvider의 US 초기 상태와 계획의 별도 시장 상태가 분리. KR 계획에 US 경고가 표시될 가능성. 실제 화면 재현 미수행 | [공통 시장](/Users/mantori/vibecoding/MTN/contexts/MarketContext.tsx:135), [계획](/Users/mantori/vibecoding/MTN/app/plan/page.tsx:38), [경고](/Users/mantori/vibecoding/MTN/components/master-filter/NavigatorWarningSystem.tsx:9) |
| F06 | 정적 사실 | AsyncStatePanel이 지연 문구 존재만으로 로딩 시작부터 경고·재시도를 표시. 시간 경과 검사 없음 | [조건](/Users/mantori/vibecoding/MTN/components/ui/AsyncStatePanel.tsx:43), [호출](/Users/mantori/vibecoding/MTN/app/portfolio/page.tsx:189) |
| F07 | 정적 사실 | FreshnessBadge는 isStale만 평가, Stock360 이벤트 오류는 빈 배열로 합침. 데이터 없음과 조회 실패를 구분하기 어려움 | [배지](/Users/mantori/vibecoding/MTN/components/ui/FreshnessBadge.tsx:3), [이벤트](/Users/mantori/vibecoding/MTN/app/stock/[ticker]/page.tsx:51) |
| F08 | 정적 사실 | 종목 검색→Stock360 이후 관심등록·계획 CTA 부재. 검색 오류/빈 결과·키보드 선택·응답 순서 보호 부족 | [검색](/Users/mantori/vibecoding/MTN/components/layout/GlobalSecuritySearch.tsx:8), [상세](/Users/mantori/vibecoding/MTN/app/stock/[ticker]/page.tsx:173) |
| F09 | 정적 사실 | 모바일 서브탭은 query를 전달하지 않음. 공통 매칭도 전체 query 문자열 일치라 view와 추가 필터 조합에 취약 | [모바일](/Users/mantori/vibecoding/MTN/components/layout/NavbarMobile.tsx:153), [매칭](/Users/mantori/vibecoding/MTN/components/layout/navigation.ts:218) |
| F10 | 정적 사실 | 일부 현재가 공급자는 숫자만 반환해 출처·관측시간·폴백 이유가 계약에서 소실 | [가격 공급](/Users/mantori/vibecoding/MTN/lib/finance/core/live-price-providers.ts:5), [기존 공통 메타](/Users/mantori/vibecoding/MTN/lib/data/freshness.ts:26) |
| F11 | 정적 사실 | 일일 스캐너가 API route를 역으로 import하며 수집·집계·AI 프롬프트·표현을 함께 담당 | [route 의존](/Users/mantori/vibecoding/MTN/lib/daily-screeners/index.ts:485) |
| F12 | 정적 사실·타 백업 미확인 | Local Postgres 백업 스크립트는 같은 Mac의 gzip 파일을 생성. 해당 경로에서 암호화·오프사이트·복원 검증을 찾지 못함 | [백업](/Users/mantori/vibecoding/MTN/scripts/backup-local-postgres.sh:11), [증거 분리](/Users/mantori/vibecoding/MTN/docs/OPERATOR_CHECKLIST.md:326) |
| F13 | 정적 위험·미재현 | lease 갱신 실패 후 작업 계속, 완료/실패 UPDATE는 job.id만 조건. 이전 실행의 늦은 완료가 새 소유자 상태에 영향 가능 | [갱신](/Users/mantori/vibecoding/MTN/scripts/local-analysis-worker.mjs:78), [완료 조건](/Users/mantori/vibecoding/MTN/scripts/lib/local-analysis-worker-utils.mjs:638) |
| F14 | 정적 위험·미재현 | 로컬 증거 INSERT 후 클라우드 요약 저장. job별 UNIQUE가 없어 부분 실패 재시도 시 중복 증거 가능 | [저장](/Users/mantori/vibecoding/MTN/scripts/lib/local-analysis-worker-utils.mjs:434), [스키마](/Users/mantori/vibecoding/MTN/local-postgres/migrations/001_local_analysis_infra.sql:45) |
| F15 | 정적 사실 | 구형 supabaseServer는 service role 누락 시 anon fallback. 같은 호출의 권한 의미가 설정에 따라 바뀜 | [서버 클라이언트](/Users/mantori/vibecoding/MTN/lib/supabase/server.ts:74) |
| F16 | 정적 사실 | 릴리스 문서는 HTTP 작업 35개, 현재 매니페스트·preflight는 37개. launchd/GitHub/Cloudflare 작업은 별도 존재 | [문서](/Users/mantori/vibecoding/MTN/docs/RELEASE_PREFLIGHT.md:10), [매니페스트](/Users/mantori/vibecoding/MTN/infra/release/production-scheduler-manifest.json:12) |

F01·F12·실행 환경 기준선은 첫 착수 항목이다. F04~F10은 첫 사용자 흐름 전환 전에 해결한다. F13~F14는 worker 실행권 전환 전에 실패 주입으로 재현·검증한다. F02·F03은 연구·성과 계약을 확정하는 선행 항목이다. F03의 실제 KR 표본 부족이나 운영 승격 실패는 DB에서 확인하지 않았으므로 단정하지 않는다.

추가 정적 점검 사항은 펀더멘털 캐시 upsert 반환 error 미검사 및 예외 묵살([fundamental-fetcher](/Users/mantori/vibecoding/MTN/lib/finance/market/fundamental-fetcher.ts:87)), 스캐너의 일부 종목 실패가 coverage에 전달되는지 여부([daily-screeners](/Users/mantori/vibecoding/MTN/lib/daily-screeners/index.ts:511)), 링크 내부 button 구조([FlowCtaButton](/Users/mantori/vibecoding/MTN/components/ui/FlowCtaButton.tsx:81))다.

## 4. 계산 문제의 재현 입력

### F01: 후보 순서·중복

실행 함수: `ruleBasedDailyCategoryTop10`. 기존 함수를 Node+jiti에서 합성 입력으로 실행했다. 네트워크/DB 접근과 결과 저장은 하지 않았다.

공통 필드: `exchange='NAS'`, `grade='Review'`, `price=100`, `priceAsOf='2026-09-04'`, `reason='synthetic review probe'`, `metrics={}`, `raw={}`, `name=ticker`. KR 유니버스는 `exchange='KOSPI'`로 설정했다.

| 후보 | source | score | universe |
|---|---|---:|---|
| AAA #1 | minervini | 80 | NASDAQ100 |
| AAA #2 | canslim | 20 | NASDAQ100 |
| AAA #3 | leader | 30 | NASDAQ100 |
| BBB | minervini | 96 | NASDAQ100 |

각 카테고리의 최소 후보 수를 맞추기 위해 NASDAQ100/SP500/KOSPI200/KOSDAQ150마다 `ticker=F0..F9`, `source=minervini`, `score=5..14`인 filler 10개씩 추가했다.

| 입력 배열 | 실제 NASDAQ100 1·2위 |
|---|---|
| AAA #1, #2, #3, BBB, fillers | AAA, BBB |
| AAA #3, #2, #1, BBB, fillers | BBB, AAA |
| AAA #3, #2, #1, #1, BBB, fillers | AAA, BBB |

원인은 `aggregate = max(기존 aggregate, 현재 점수) + source 수 보너스`를 행마다 누적하는 데 있다. 현재 소스 집합의 최종 보너스를 한 번 계산하고 동일 후보의 중복 의미·tie-break를 명시하는 방향으로 개선해야 한다. 이것은 정책 변경이므로 기존 발표 추천을 다시 기록하지 않고 새 버전으로 비교한다.

### F02: 거래 없는 월간 백테스트

실행 함수: `runMonthlyCloseBacktest`.

```json
{
  "calendar": ["2026-08-03", "2026-08-04", "2026-08-05"],
  "barsByTicker": {
    "A": [{"date":"2026-08-03","close":100},{"date":"2026-08-04","close":200},{"date":"2026-08-05","close":100}],
    "B": [{"date":"2026-08-03","close":100},{"date":"2026-08-04","close":100},{"date":"2026-08-05","close":100}]
  },
  "targets": [],
  "initialWeights": {"A": 0.5, "B": 0.5},
  "transactionCostRate": 0
}
```

예상 고정 보유 자산 경로는 `1 → 1.5 → 1`이다. 실제 함수는 `1 → 1.5 → 1.125`, turnover와 cost는 모두 0, weights는 모든 날짜에서 0.5/0.5를 반환했다. 가격 변화에 따른 비중 드리프트를 반영하지 않아 재조정 없는 보유와 다른 결과다.

이 함수의 현재 호출은 테스트 밖에서 찾지 못했다. 금/나스닥의 별도 백테스트나 모든 운영 전략 수익률이 틀렸다는 근거로 확대하지 않는다. 연구 결과를 운영 판단으로 연결하기 전 회계 계약을 검증할 근거다.

## 5. 보존할 자산과 과장하지 말아야 할 부분

| 자산 | 확인 근거와 의미 |
|---|---|
| 자본·리스크 검증 | [계획](/Users/mantori/vibecoding/MTN/app/plan/page.tsx:76), [risk-gate](/Users/mantori/vibecoding/MTN/lib/finance/core/risk-gate.ts): 검증 자본·리스크 제한을 무시하는 UX 단순화를 피한다. |
| 추천 성과 증거 | [계산](/Users/mantori/vibecoding/MTN/lib/recommendations/evidence-performance.ts:10), [평가](/Users/mantori/vibecoding/MTN/lib/recommendations/evidence-repository.ts:205): D5/D20/D60, 비용, hash, 공식/폴백, cohort 통계와 승격 조건이 이미 있다. |
| 근거 기반 AI | [시장 코멘트](/Users/mantori/vibecoding/MTN/lib/ai/grounded-market-insight.ts:101): 허용 근거 키와 숫자 주장 제한이 있다. AI 재설계에서 유지한다. |
| 원천 상태 관리 | [intelligence health](/Users/mantori/vibecoding/MTN/lib/intelligence/health.ts:6): 시장별 필수 출처·SLA·BLOCKED가 있다. 다른 도메인으로 계약을 확장한다. |
| 월간 스냅샷 | [저장 gate](/Users/mantori/vibecoding/MTN/lib/strategy/monthly/run.ts:65): FINAL/FULL·버전·hash를 보존한다. |
| 작업 큐·중복 제어 | [큐 migration](/Users/mantori/vibecoding/MTN/supabase/migrations/20260628000000_local_analysis_queue.sql:137): SKIP LOCKED와 stale 재획득·횟수 제한이 있다. 완료 소유권까지 일관되게 적용한다. |
| Supabase 백업 | [workflow](/Users/mantori/vibecoding/MTN/.github/workflows/db-backup.yml:7), [스크립트](/Users/mantori/vibecoding/MTN/scripts/backup-supabase-encrypted.sh:108): 하루 2회·일관 스냅샷·암호화·행수/복원 검증·외부 artifact·선택 R2가 구현돼 있다. 실제 최근 성공은 미조회. |
| CI·접근성 | [workflow](/Users/mantori/vibecoding/MTN/.github/workflows/e2e-tests.yml:50): 인증·preflight·정적 검사·unit·build·E2E·assurance가 있다. |

KOSPI200/KOSDAQ150 스캐너 유니버스는 시가총액 상위 보통주 집합이며 화면 label이 그 의미를 설명한다([유니버스](/Users/mantori/vibecoding/MTN/lib/finance/market/scanner-universes.ts:359)). 공식 지수 구성과 다른 데이터 의미를 계약으로 명시해야 하지만, 단순 오표기로 단정하지 않는다.

금/나스닥에는 정적 VERIFIED 백테스트 결과와 별도 실행기가 있고 정책 상태는 RESEARCH_ONLY다([금 검증](/Users/mantori/vibecoding/MTN/lib/gold/backtest-verification.ts:8), [정책](/Users/mantori/vibecoding/MTN/lib/gold/policy.ts:8)). 입력 데이터·실행 hash 연결을 개선하되 검증 체계가 전혀 없다고 평가하지 않는다.

## 6. 리뉴얼 첫 단계에서 추가 측정할 항목

1. 실제 주 사용 기기·계좌·시장별 일과와 반복 작업 시간, 현재 메뉴의 이용 빈도
2. 로컬 500 원인, 운영 배포 차이의 의도, 웹·worker·DB·scheduler 실제 버전
3. 최근 시장별 작업 완료/누락률, provider coverage·데이터 지연·KR 공식 성과 표본
4. Local Postgres의 다른 백업 존재 여부, 백업 키 보관, 복원 후 근거 ID/참조 일치
5. 단일 실제 거래의 생성→체결 기록→부분 청산→복기, KR 통화·시장 유지, 실제 DB 계약
6. 고정 기기/네트워크에서 production build 성능, 주요 화면 시각 검토, 검색·종목 상세 접근성
7. worker lease 탈취·재시작·부분 저장 실패·중복 발송 방지의 실패 주입 검증

이 항목은 계획의 정확도와 운영 전환 조건을 확정하기 위한 후속 측정이다. 이번 검토에서 확인한 것으로 보고하지 않는다.
