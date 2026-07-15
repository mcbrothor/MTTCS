# MTN 자동 차트 분석 벤치마크

기준일: 2026-07-15

## 목표 제품

1차 목표는 TrendSpider의 자동 기술분석 경험이다. 룰 엔진이 좌표와 가격을 결정하고 AI는 근거를 설명하는 MTN의 안전 구조는 유지한다. 확률이나 목표 수익률은 실제 성과 데이터로 보정되기 전까지 표시하지 않는다.

## 비교 결과

| 제품 | 강점 | MTN 적용 원칙 |
| --- | --- | --- |
| TrendSpider | 현재 유효한 패턴만 표시, 자동 지지·저항과 추세선, 다중 시간대 분석, 차트 기반 AI 질의 | 1차 UX 및 분석 계약 목표 |
| Tickeron | 패턴 신뢰도, 진입·청산·목표가, 과거 성과 기반 확률 | 성과 표본이 쌓인 뒤 보정 확률만 도입 |
| Trading Central Technical Insight | 기술·기본 분석 통합, 변동성 손절, 형성 중 이벤트, 백테스트 근거 | 위험 관리와 후보 선행 경보 기준 |
| LuxAlgo Price Action Concepts | 여러 종목과 시간대를 압축해 비교하는 스크리너 | 추천 후보 비교 화면의 장기 목표 |

## 이번 고도화

- 배포 환경에 `Noto Sans KR`을 포함하고 `resvg`에 직접 주입한다. 시스템 폰트가 없어도 제목, 가격 레벨, 분석 설명이 렌더링된다.
- 글꼴 파일이 없으면 이미지 생성을 실패시킨다. 텍스트가 없는 PNG를 정상 결과로 전송하지 않는다.
- 최근 80거래일 안의 유효 패턴만 표시하고, 낮은 신뢰도의 초기 후보와 무효화 패턴을 제외한다.
- 일봉과 주봉을 독립 계산해 `상승 정합`, `부분 정합`, `하락 충돌`, `판단 보류`로 구분한다.
- 일봉 추세 30점, 주봉 추세 15점, 베이스 15점, 거래량 15점, 손절 구조 15점, 보상비 10점으로 컨플루언스 점수를 공개한다.
- 핵심 저항, 핵심 지지, 무효화 가격을 차트에 번호로 연결한다.
- 기본 진입, 눌림·재시험 대안, 실패·가설 폐기의 세 시나리오를 동시에 제공한다.
- 추천 종목 정렬에도 컨플루언스 점수를 반영한다.

## 다음 목표

1. 추천 이후 20·40·60거래일 성과와 최대 유리·불리 움직임을 저장해 패턴별 확률을 보정한다.
2. 자동 추세선과 Fibonacci 구간을 추가하되 현재 가격과 관련된 최신 구조만 표시한다.
3. 일봉·주봉·월봉 조건을 조합한 알림과 재검증 워크플로를 추가한다.
4. 차트 분석과 펀더멘털, 섹터 상대강도, 시장 국면을 하나의 통합 컨플루언스 계약으로 결합한다.
5. 각 패턴 탐지기의 정밀도, 재현율, 기대 R, 실패율을 월별로 공개한다.

## 공식 자료

- [TrendSpider Automated Chart Pattern Recognition](https://help.trendspider.com/kb/automated-technical-analysis/automated-chart-pattern-recognition)
- [TrendSpider Technical, Fundamental & Alternative Charting](https://trendspider.com/product/analyze-and-chart-any-market-asset/)
- [TrendSpider Sidekick Prompting Guide](https://help.trendspider.com/kb/sidekick-ai/sidekick-prompting-guide-1)
- [Tickeron AI Tools](https://tickeron.com/)
- [Trading Central Technical Insight Product Brief](https://global.tradingcentral.com/marketing/BrandResources/recognia.webflow/documents/RecogniaTechnicalInsightProductBrief_March2015.pdf)
- [LuxAlgo Price Action Concepts Screener](https://docs.luxalgo.com/docs/algos/screeners/pac/introduction)
