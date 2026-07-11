# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ft-03-market-analysis.spec.ts >> FT-03: 시장 분석 >> 매크로 분석 (/macro) >> 페이지 로딩 + 자산 테이블
- Location: tests/e2e/smoke/ft-03-market-analysis.spec.ts:48:9

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "매크로"
Received string:    "MTNLiveMantori's Trading NavigatorS&P500----KISNASDAQ----KISKOSPI----KISKOSDAQ----KISUSD/KRW----Yahoo오늘시장 분석종목 발굴콘테스트관심종목매매 계획포트폴리오성과 복기사용 가이드링크 허브관리분석 큐로그아웃01시장 분석오늘의 결론시장 밖 위험 점검MTN메뉴오늘의 결론시장 밖 위험 점검오늘시장발굴포트복기STEP 01 · 시장 분석 / 시장 밖 위험 점검시장 밖 위험 점검금리, 달러, 신용 시장, 시장 불안도처럼 큰 자금 흐름을 보고 권장 투자 비중을 조절합니다.오늘의 결론동기화 중시장 데이터 확인 중지금 새로 사도 되는지와 시장 밖 위험을 함께 확인하고 있습니다.종합 점수확인 중새 매수 비중보류오늘 시장 브리핑애매한 흐름미국 시장: 시장 내부 건강도가 좋으면 종목 발굴을 진행할 수 있습니다. 다만 시장 밖 위험이 조심 구간이거나 애매하면 투자 비중과 추가 매수 속도를 낮춰야 합니다.한국 시장: 한국 시장은 지수 추세, 원/달러, 외국인 수급, 반도체·2차전지 등 리더십의 폭을 함께 확인해 공격성을 조절합니다.이 화면은 권장 투자 비중 조절용입니다. 신규 진입 가능 여부는 반드시 오늘의 결론에서 먼저 확인하세요. 시장 내부 건강도가 좋지 않으면 시장 밖 위험 점수와 관계없이 새 매수는 보류합니다.시장 밖 위험 데이터 확인 중requestAnimationFrame(function(){$RT=performance.now()});self.__next_r=\"RDZzUtap7gYajJed_qEB-\"$RB=[];$RV=function(a){$RT=performance.now();for(var b=0;b<a.length;b+=2){var c=a[b],e=a[b+1];null!==e.parentNode&&e.parentNode.removeChild(e);var f=c.parentNode;if(f){var g=c.previousSibling,h=0;do{if(c&&8===c.nodeType){var d=c.data;if(\"/$\"===d||\"/&\"===d)if(0===h)break;else h--;else\"$\"!==d&&\"$?\"!==d&&\"$~\"!==d&&\"$!\"!==d&&\"&\"!==d||h++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;e.firstChild;)f.insertBefore(e.firstChild,c);g.data=\"$\";g._reactRetry&&requestAnimationFrame(g._reactRetry)}}a.length=0};
$RC=function(a,b){if(b=document.getElementById(b))(a=document.getElementById(a))?(a.previousSibling.data=\"$~\",$RB.push(a,b),2===$RB.length&&(\"number\"!==typeof $RT?requestAnimationFrame($RV.bind(null,$RB)):(a=performance.now(),setTimeout($RV.bind(null,$RB),2300>a&&2E3<a?2300-a:$RT+300-a)))):b.parentNode.removeChild(b)};$RC(\"B:0\",\"S:0\")(self.__next_f=self.__next_f||[]).push([0])self.__next_f.push([1,\"9:I[\\\"(app-pages-browser)/./node_modules/next/dist/next-devtools/userspace/app/segment-explorer-node.js\\\",[\\\"app-pages-internals\\\",\\\"static/chunks/app-pages-internals.js\\\"],\\\"SegmentViewNode\\\"]\\nb:\\\"$Sreact.fragment\\\"\\n1a:I[\\\"(app-pages-browser)/./components/layout/AppShell.tsx\\\",[\\\"app/layout\\\",\\\"static/chunks/app/layout.js\\\"],\\\"default\\\"]\\n1c:I[\\\"(app-pages-browser)/./node_modules/next/dist/client/components/layout-router.js\\\",[\\\"app-pages-internals\\\",\\\"static/chunks/app-pages-internals.js\\\"],\\\"\\\"]\\n1d:I[\\\"(app-pages-browser)/./app/error.tsx\\\",[\\\"app/error\\\",\\\"static/chunks/app/error.js\\\"],\\\"default\\\"]\\n20:I[\\\"(app-pages-browser)/./node_modules/next/dist/client/components/render-from-template-context.js\\\",[\\\"app-pages-internals\\\",\\\"static/chunks/app-pages-internals.js\\\"],\\\"\\\"]\\n38:I[\\\"(app-pages-browser)/./node_modules/next/dist/client/components/client-page.js\\\",[\\\"app-pages-internals\\\",\\\"static/chunks/app-pages-internals.js\\\"],\\\"ClientPageRoot\\\"]\\n39:I[\\\"(app-pages-browser)/./app/macro/page.tsx\\\",[\\\"app/macro/page\\\",\\\"static/chunks/app/macro/page.js\\\"],\\\"default\\\"]\\n3f:I[\\\"(app-pages-browser)/./node_modules/next/dist/lib/framework/boundary-components.js\\\",[\\\"app-pages-internals\\\",\\\"static/chunks/app-pages-internals.js\\\"],\\\"OutletBoundary\\\"]\\n41:\\\"$Sreact.suspense\\\"\\n4f:I[\\\"(app-pages-browser)/./node_modules/next/dist/lib/framework/boundary-components.js\\\",[\\\"app-pages-internals\\\",\\\"static/chunks/app-pages-internals.js\\\"],\\\"ViewportBoundary\\\"]\\n59:I[\\\"(app-pages-browser)/./node_modules/next/dist/lib/framework/boundary-components.js\\\",[\\\"app-pages-internals\\\",\\\"static/chunks/app-pages-internals.js\\\"],\\\"MetadataBoundary\\\"]\\n60:I[\\\"(app-pages-browser)/./app/global-error.tsx\\\",[\\\"app/global-error\\\",\\\"static/chunks/app/global-error.js\\\"],\\\"default\\\"]\\n6d:I[\\\"(app-pages-browser)/./node_modules/next/dist/lib/metadata/generate/icon-mark.js\\\",[\\\"app-pages-internals\\\",\\\"static/chunks/app-pages-internals.js\\\"],\\\"IconMark\\\"]\\n:HL[\\\"/_next/static/media/bb3ef058b751a6ad-s.p.woff2?v=1783691636217\\\",\\\"font\\\",{\\\"crossOrigin\\\":\\\"\\\",\\\"type\\\":\\\"font/woff2\\\"}]\\n:HL[\\\"/_next/static/media/e4af272ccee01ff0-s.p.woff2?v=1783691636217\\\",\\\"font\\\",{\\\"crossOrigin\\\":\\\"\\\",\\\"type\\\":\\\"font/woff2\\\"}]\\n:HL[\\\"/_next/static/css/app/layout.css?v=1783691636217\\\",\\\"style\\\"]\\n1:D\\\"$6\\\"\\n1:D\\\"$2\\\"\\n1:D\\\"$7\\\"\\n1:null\\nd:D\\\"$15\\\"\\nd:D\\\"$e\\\"\\nd:D\\\"$17\\\"\\n22:D\\\"$24\\\"\\n22:D\\\"$23\\\"\\n22:D\\\"$26\\\"\\n22:D\\\"$25\\\"\\n22:D\\\"$27\\\"\\n22:[[\\\"$\\\",\\\"title\\\",null,{\\\"children\\\":\\\"404: This page could not be found.\\\"},\\\"$25\\\",\\\"$28\\\",1],[\\\"$\\\",\\\"div\\\",null,{\\\"style\\\":{\\\"fontFamily\\\":\\\"system-ui,\\\\\\\"Segoe UI\\\\\\\",Roboto,Helvetica,Arial,sans-serif,\\\\\\\"Apple Color Emoji\\\\\\\",\\\\\\\"Segoe UI Emoji\\\\\\\"\\\",\\\"height\\\":\\\"100vh\\\",\\\"textAlign\\\":\\\"center\\\",\\\"display\\\":\\\"flex\\\",\\\"flexDirection\\\":\\\"column\\\",\\\"alignItems\\\":\\\"center\\\",\\\"justifyContent\\\":\\\"center\\\"},\\\"children\\\":[\\\"$\\\",\\\"div\\\",null,{\\\"children\\\":[[\\\"$\\\",\\\"style\\\",null,{\\\"dangerouslySetInnerHTML\\\":{\\\"__html\\\":\\\"body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}\\\"}},\\\"$25\\\",\\\"$2b\\\",1],[\\\"$\\\",\\\"h1\\\",null,{\\\"className\\\":\\\"next-error-h1\\\",\\\"style\\\":{\\\"display\\\":\\\"inline-block\\\",\\\"margin\\\":\\\"0 20px 0 0\\\",\\\"padding\\\":\\\"0 23px 0 0\\\",\\\"fontSize\\\":24,\\\"fontWeight\\\":500,\\\"verticalAlign\\\":\\\"top\\\",\\\"lineHeight\\\":\\\"49px\\\"},\\\"children\\\":404},\\\"$25\\\",\\\"$2c\\\",1],[\\\"$\\\",\\\"div\\\",null,{\\\"style\\\":{\\\"display\\\":\\\"inline-block\\\"},\\\"children\\\":[\\\"$\\\",\\\"h2\\\",null,{\\\"style\\\":{\\\"fontSize\\\":14,\\\"fontWeight\\\":400,\\\"lineHeight\\\":\\\"49px\\\",\\\"margin\\\":0},\\\"children\\\":\\\"This page could not be found.\\\"},\\\"$25\\\",\\\"$2e\\\",1]},\\\"$25\\\",\\\"$2d\\\",1]]},\\\"$25\\\",\\\"$2a\\\",1]},\\\"$25\\\",\\\"$29\\\",1]]\\nd:[\\\"$\\\",\\\"html\\\",null,{\\\"lang\\\":\\\"ko\\\",\\\"className\\\":\\\"__variable_f367f3 __variable_3c557b h-full antialiased dark\\\",\\\"children\\\":[\\\"$\\\",\\\"body\\\",null,{\\\"className\\\":\\\"flex min-h-full flex-col font-sans\\\",\\\"children\\\":[\\\"$\\\",\\\"$L1a\\\",null,{\\\"children\\\":[\\\"$\\\",\\\"$L1c\\\",null,{\\\"parallelRouterKey\\\":\\\"children\\\",\\\"error\\\":\\\"$1d\\\",\\\"errorStyles\\\":[\\\"$\\\",\\\"$L9\\\",null,{\\\"type\\\":\\\"error\\\",\\\"pagePath\\\":\\\"error.tsx\\\",\\\"children\\\":[]},null,\\\"$1e\\\",0],\\\"errorScripts\\\":[],\\\"template\\\":[\\\"$\\\",\\\"$L20\\\",null,{},null,\\\"$1f\\\",1],\\\"templateStyles\\\":\\\"$undefined\\\",\\\"templateScripts\\\":\\\"$undefined\\\",\\\"notFound\\\":[\\\"$\\\",\\\"$L9\\\",\\\"c-not-found\\\",{\\\"type\\\":\\\"not-found\\\",\\\"pagePath\\\":\\\"__next_builtin__not-found.js\\\",\\\"children\\\":[\\\"$22\\\",[]]},null,\\\"$21\\\",0],\\\"forbidden\\\":\\\"$undefined\\\",\\\"unautho\"])self.__next_f.push([1,\"rized\\\":\\\"$undefined\\\",\\\"segmentViewBoundaries\\\":[[\\\"$\\\",\\\"$L9\\\",null,{\\\"type\\\":\\\"boundary:not-found\\\",\\\"pagePath\\\":\\\"__next_builtin__not-found.js@boundary\\\"},null,\\\"$2f\\\",1],\\\"$undefined\\\",[\\\"$\\\",\\\"$L9\\\",null,{\\\"type\\\":\\\"boundary:error\\\",\\\"pagePath\\\":\\\"error.tsx@boundary\\\"},null,\\\"$30\\\",1],[\\\"$\\\",\\\"$L9\\\",null,{\\\"type\\\":\\\"boundary:global-error\\\",\\\"pagePath\\\":\\\"global-error.tsx\\\"},null,\\\"$31\\\",1]]},null,\\\"$1b\\\",1]},\\\"$e\\\",\\\"$19\\\",1]},\\\"$e\\\",\\\"$18\\\",1]},\\\"$e\\\",\\\"$16\\\",1]\\n3a:D\\\"$3c\\\"\\n3a:D\\\"$3b\\\"\\n3a:D\\\"$3e\\\"\\n3a:[\\\"$\\\",\\\"$L3f\\\",null,{\\\"children\\\":[\\\"$\\\",\\\"$41\\\",null,{\\\"name\\\":\\\"Next.MetadataOutlet\\\",\\\"children\\\":\\\"$@42\\\"},\\\"$3b\\\",\\\"$40\\\",1]},\\\"$3b\\\",\\\"$3d\\\",1]\\n45:D\\\"$48\\\"\\n45:D\\\"$46\\\"\\n45:D\\\"$49\\\"\\n45:null\\n4a:D\\\"$4c\\\"\\n4a:D\\\"$4b\\\"\\n4a:D\\\"$4e\\\"\\n50:D\\\"$52\\\"\\n50:D\\\"$51\\\"\\n4a:[\\\"$\\\",\\\"$L4f\\\",null,{\\\"children\\\":\\\"$L50\\\"},\\\"$4b\\\",\\\"$4d\\\",1]\\n53:D\\\"$55\\\"\\n53:D\\\"$54\\\"\\n53:D\\\"$57\\\"\\n5b:D\\\"$5d\\\"\\n5b:D\\\"$5c\\\"\\n53:[\\\"$\\\",\\\"div\\\",null,{\\\"hidden\\\":true,\\\"children\\\":[\\\"$\\\",\\\"$L59\\\",null,{\\\"children\\\":[\\\"$\\\",\\\"$41\\\",null,{\\\"name\\\":\\\"Next.Metadata\\\",\\\"children\\\":\\\"$L5b\\\"},\\\"$54\\\",\\\"$5a\\\",1]},\\\"$54\\\",\\\"$58\\\",1]},\\\"$54\\\",\\\"$56\\\",1]\\n5f:[]\\n\"])self.__next_f.push([1,\"0:{\\\"P\\\":\\\"$1\\\",\\\"c\\\":[\\\"\\\",\\\"macro\\\"],\\\"q\\\":\\\"\\\",\\\"i\\\":true,\\\"f\\\":[[[\\\"\\\",{\\\"children\\\":[\\\"macro\\\",{\\\"children\\\":[\\\"__PAGE__\\\",{}]}]},\\\"$undefined\\\",\\\"$undefined\\\",16],[[\\\"$\\\",\\\"$L9\\\",\\\"layout\\\",{\\\"type\\\":\\\"layout\\\",\\\"pagePath\\\":\\\"layout.tsx\\\",\\\"children\\\":[\\\"$\\\",\\\"$b\\\",\\\"c\\\",{\\\"children\\\":[[[\\\"$\\\",\\\"link\\\",\\\"0\\\",{\\\"rel\\\":\\\"stylesheet\\\",\\\"href\\\":\\\"/_next/static/css/app/layout.css?v=1783691636217\\\",\\\"precedence\\\":\\\"next_static/css/app/layout.css\\\",\\\"crossOrigin\\\":\\\"$undefined\\\",\\\"nonce\\\":\\\"$undefined\\\"},null,\\\"$c\\\",0]],\\\"$d\\\"]},null,\\\"$a\\\",1]},null,\\\"$8\\\",0],{\\\"children\\\":[[\\\"$\\\",\\\"$b\\\",\\\"c\\\",{\\\"children\\\":[null,[\\\"$\\\",\\\"$L1c\\\",null,{\\\"parallelRouterKey\\\":\\\"children\\\",\\\"error\\\":\\\"$undefined\\\",\\\"errorStyles\\\":\\\"$undefined\\\",\\\"errorScripts\\\":\\\"$undefined\\\",\\\"template\\\":[\\\"$\\\",\\\"$L20\\\",null,{},null,\\\"$34\\\",1],\\\"templateStyles\\\":\\\"$undefined\\\",\\\"templateScripts\\\":\\\"$undefined\\\",\\\"notFound\\\":\\\"$undefined\\\",\\\"forbidden\\\":\\\"$undefined\\\",\\\"unauthorized\\\":\\\"$undefined\\\",\\\"segmentViewBoundaries\\\":[\\\"$undefined\\\",\\\"$undefined\\\",\\\"$undefined\\\",\\\"$undefined\\\"]},null,\\\"$33\\\",1]]},null,\\\"$32\\\",0],{\\\"children\\\":[[\\\"$\\\",\\\"$b\\\",\\\"c\\\",{\\\"children\\\":[[\\\"$\\\",\\\"$L9\\\",\\\"c-page\\\",{\\\"type\\\":\\\"page\\\",\\\"pagePath\\\":\\\"macro/page.tsx\\\",\\\"children\\\":[\\\"$\\\",\\\"$L38\\\",null,{\\\"Component\\\":\\\"$39\\\",\\\"serverProvidedParams\\\":{\\\"searchParams\\\":{},\\\"params\\\":{},\\\"promises\\\":null}},null,\\\"$37\\\",1]},null,\\\"$36\\\",1],null,\\\"$3a\\\"]},null,\\\"$35\\\",0],{},null,false,null]},null,false,\\\"$@43\\\"]},null,false,null],[\\\"$\\\",\\\"$b\\\",\\\"h\\\",{\\\"children\\\":[\\\"$45\\\",\\\"$4a\\\",\\\"$53\\\",[\\\"$\\\",\\\"meta\\\",null,{\\\"name\\\":\\\"next-size-adjust\\\",\\\"content\\\":\\\"\\\"},null,\\\"$5e\\\",1]]},null,\\\"$44\\\",0],false]],\\\"m\\\":\\\"$W5f\\\",\\\"G\\\":[\\\"$60\\\",[\\\"$\\\",\\\"$L9\\\",\\\"ge-svn\\\",{\\\"type\\\":\\\"global-error\\\",\\\"pagePath\\\":\\\"global-error.tsx\\\",\\\"children\\\":[]},null,\\\"$61\\\",0]],\\\"S\\\":false,\\\"h\\\":null,\\\"s\\\":\\\"$undefined\\\",\\\"l\\\":\\\"$undefined\\\",\\\"p\\\":\\\"$undefined\\\",\\\"d\\\":\\\"$undefined\\\",\\\"b\\\":\\\"development\\\"}\\n\"])self.__next_f.push([1,\"62:[]\\n43:D\\\"$63\\\"\\n43:\\\"$W62\\\"\\n50:D\\\"$64\\\"\\n50:[[\\\"$\\\",\\\"meta\\\",\\\"0\\\",{\\\"charSet\\\":\\\"utf-8\\\"},\\\"$3b\\\",\\\"$65\\\",0],[\\\"$\\\",\\\"meta\\\",\\\"1\\\",{\\\"name\\\":\\\"viewport\\\",\\\"content\\\":\\\"width=device-width, initial-scale=1\\\"},\\\"$3b\\\",\\\"$66\\\",0]]\\n42:D\\\"$67\\\"\\n42:null\\n5b:D\\\"$68\\\"\\n5b:[[\\\"$\\\",\\\"title\\\",\\\"0\\\",{\\\"children\\\":\\\"MTN - Mantori's Trading Navigator\\\"},\\\"$3b\\\",\\\"$69\\\",0],[\\\"$\\\",\\\"meta\\\",\\\"1\\\",{\\\"name\\\":\\\"description\\\",\\\"content\\\":\\\"SEPA, VCP pivot entries, pattern invalidation risk, and disciplined trade tracking workflow.\\\"},\\\"$3b\\\",\\\"$6a\\\",0],[\\\"$\\\",\\\"link\\\",\\\"2\\\",{\\\"rel\\\":\\\"icon\\\",\\\"href\\\":\\\"/favicon.ico?603d046c9a6fdfbb\\\",\\\"type\\\":\\\"image/x-icon\\\",\\\"sizes\\\":\\\"16x16\\\"},\\\"$3b\\\",\\\"$6b\\\",0],[\\\"$\\\",\\\"$L6d\\\",\\\"3\\\",{},\\\"$3b\\\",\\\"$6c\\\",0]]\\n\"])"
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - navigation [ref=e4]:
        - generic [ref=e5]:
          - generic [ref=e6]:
            - generic [ref=e7]:
              - link "MTN Live Mantori's Trading Navigator" [ref=e8] [cursor=pointer]:
                - /url: /
                - img [ref=e10]
                - generic [ref=e12]:
                  - generic [ref=e13]:
                    - generic [ref=e14]: MTN
                    - generic [ref=e15]: Live
                  - paragraph [ref=e17]: Mantori's Trading Navigator
              - generic [ref=e18]:
                - img
                - textbox "종목 검색 ⌘K" [ref=e19]:
                  - /placeholder: 종목 검색  ⌘K
            - generic [ref=e21]:
              - generic [ref=e22]:
                - generic [ref=e23]: S&P500
                - generic [ref=e24]: "--"
                - generic [ref=e25]:
                  - generic [ref=e26]: "--"
                  - generic [ref=e27]: KIS
              - generic [ref=e28]:
                - generic [ref=e29]: NASDAQ
                - generic [ref=e30]: "--"
                - generic [ref=e31]:
                  - generic [ref=e32]: "--"
                  - generic [ref=e33]: KIS
              - generic [ref=e34]:
                - generic [ref=e35]: KOSPI
                - generic [ref=e36]: "--"
                - generic [ref=e37]:
                  - generic [ref=e38]: "--"
                  - generic [ref=e39]: KIS
              - generic [ref=e40]:
                - generic [ref=e41]: KOSDAQ
                - generic [ref=e42]: "--"
                - generic [ref=e43]:
                  - generic [ref=e44]: "--"
                  - generic [ref=e45]: KIS
              - generic [ref=e46]:
                - generic [ref=e47]: USD/KRW
                - generic [ref=e48]: "--"
                - generic [ref=e49]:
                  - generic [ref=e50]: "--"
                  - generic [ref=e51]: Yahoo
          - generic [ref=e52]:
            - generic [ref=e53]:
              - link "오늘" [ref=e54] [cursor=pointer]:
                - /url: /
              - link "시장 분석" [ref=e55] [cursor=pointer]:
                - /url: /master-filter
              - link "종목 발굴" [ref=e56] [cursor=pointer]:
                - /url: /scanner
              - link "콘테스트" [ref=e57] [cursor=pointer]:
                - /url: /contest
              - link "관심종목" [ref=e58] [cursor=pointer]:
                - /url: /watchlist
              - link "매매 계획" [ref=e59] [cursor=pointer]:
                - /url: /plan
              - link "포트폴리오" [ref=e60] [cursor=pointer]:
                - /url: /portfolio
              - link "성과 복기" [ref=e61] [cursor=pointer]:
                - /url: /history
            - generic [ref=e62]:
              - link "사용 가이드" [ref=e63] [cursor=pointer]:
                - /url: /guide
              - link "링크 허브" [ref=e64] [cursor=pointer]:
                - /url: /links
              - link "관리" [ref=e65] [cursor=pointer]:
                - /url: /admin
              - link "분석 큐" [ref=e66] [cursor=pointer]:
                - /url: /admin/local-analysis
              - button "로그아웃" [ref=e68]
      - generic [ref=e70]:
        - generic [ref=e71]:
          - generic [ref=e72]: "01"
          - text: 시장 분석
        - generic [ref=e73]:
          - link "오늘의 결론" [ref=e74] [cursor=pointer]:
            - /url: /master-filter
          - link "시장 밖 위험 점검" [ref=e75] [cursor=pointer]:
            - /url: /macro
    - main [ref=e76]:
      - generic [ref=e77]:
        - generic [ref=e78]:
          - paragraph [ref=e79]: STEP 01 · 시장 분석 / 시장 밖 위험 점검
          - heading "시장 밖 위험 점검" [level=1] [ref=e80]
          - paragraph [ref=e81]: 금리, 달러, 신용 시장, 시장 불안도처럼 큰 자금 흐름을 보고 권장 투자 비중을 조절합니다.
        - generic [ref=e82]:
          - generic [ref=e83]:
            - generic [ref=e84]: 오늘의 결론
            - generic [ref=e85]: 동기화 중
          - generic [ref=e86]:
            - generic [ref=e87]:
              - paragraph [ref=e88]: 시장 데이터 확인 중
              - paragraph [ref=e89]: 지금 새로 사도 되는지와 시장 밖 위험을 함께 확인하고 있습니다.
            - generic [ref=e90]:
              - generic [ref=e91]:
                - paragraph [ref=e92]: 종합 점수
                - paragraph [ref=e93]: 확인 중
              - generic [ref=e94]:
                - paragraph [ref=e95]: 새 매수 비중
                - paragraph [ref=e96]: 보류
        - generic [ref=e98]:
          - img [ref=e100]
          - generic [ref=e103]:
            - generic [ref=e104]:
              - generic [ref=e105]: 오늘 시장 브리핑
              - generic [ref=e106]: 애매한 흐름
            - paragraph [ref=e107]:
              - strong [ref=e108]: "미국 시장:"
              - text: 시장 내부 건강도가 좋으면 종목 발굴을 진행할 수 있습니다. 다만 시장 밖 위험이 조심 구간이거나 애매하면 투자 비중과 추가 매수 속도를 낮춰야 합니다.
            - paragraph [ref=e109]:
              - strong [ref=e110]: "한국 시장:"
              - text: 한국 시장은 지수 추세, 원/달러, 외국인 수급, 반도체·2차전지 등 리더십의 폭을 함께 확인해 공격성을 조절합니다.
        - generic [ref=e111]:
          - img [ref=e112]
          - paragraph [ref=e114]:
            - strong [ref=e115]: 이 화면은 권장 투자 비중 조절용입니다.
            - text: 신규 진입 가능 여부는 반드시
            - link "오늘의 결론" [ref=e116] [cursor=pointer]:
              - /url: /master-filter
            - text: 에서 먼저 확인하세요. 시장 내부 건강도가 좋지 않으면 시장 밖 위험 점수와 관계없이 새 매수는 보류합니다.
        - paragraph [ref=e120]: 시장 밖 위험 데이터 확인 중
  - button "Open Next.js Dev Tools" [ref=e126] [cursor=pointer]:
    - img [ref=e127]
  - alert [ref=e130]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { smokeLogin, waitForContentLoad } from './helpers/auth';
  3  | 
  4  | /**
  5  |  * FT-03: 시장 분석 (/master-filter, /macro)
  6  |  */
  7  | test.describe('FT-03: 시장 분석', () => {
  8  |   test.beforeEach(async ({ page }) => {
  9  |     await smokeLogin(page);
  10 |   });
  11 | 
  12 |   test.describe('마스터 필터 (/master-filter)', () => {
  13 |     test('핵심 UI 요소 렌더링', async ({ page }) => {
  14 |       await page.goto('/master-filter');
  15 |       await waitForContentLoad(page);
  16 | 
  17 |       // STEP 01 라벨
  18 |       await expect(page.locator('text=STEP 01').first()).toBeVisible();
  19 |       await expect(page.locator('text=오늘의 결론').first()).toBeVisible();
  20 |     });
  21 | 
  22 |     test('US/KR 토글 동작', async ({ page }) => {
  23 |       await page.goto('/master-filter');
  24 |       await waitForContentLoad(page);
  25 | 
  26 |       const usBtn = page.locator('button:has-text("US 미국")');
  27 |       const krBtn = page.locator('button:has-text("KR 한국")');
  28 | 
  29 |       await krBtn.click();
  30 |       await waitForContentLoad(page);
  31 | 
  32 |       await usBtn.click();
  33 |       await waitForContentLoad(page);
  34 |     });
  35 | 
  36 |     test('지표 그리드 렌더링', async ({ page }) => {
  37 |       await page.goto('/master-filter');
  38 |       await waitForContentLoad(page, 45_000);
  39 | 
  40 |       // MetricsGrid가 로딩 후 지표 카드를 표시해야 함
  41 |       // 실제 API 응답 대기 필요
  42 |       const gridArea = page.locator('[class*="grid"]').first();
  43 |       await expect(gridArea).toBeVisible({ timeout: 30_000 });
  44 |     });
  45 |   });
  46 | 
  47 |   test.describe('매크로 분석 (/macro)', () => {
  48 |     test('페이지 로딩 + 자산 테이블', async ({ page }) => {
  49 |       await page.goto('/macro');
  50 |       await waitForContentLoad(page, 45_000);
  51 | 
  52 |       // 매크로 페이지 식별
  53 |       const body = await page.textContent('body');
> 54 |       expect(body).toContain('매크로');
     |                    ^ Error: expect(received).toContain(expected) // indexOf
  55 |     });
  56 | 
  57 |     test('매크로 레짐 카드 렌더링', async ({ page }) => {
  58 |       await page.goto('/macro');
  59 |       await waitForContentLoad(page, 45_000);
  60 | 
  61 |       // RegimeHeroCard 또는 매크로 점수 표시
  62 |       const macroContent = page.locator('text=/매크로|Macro|레짐|Regime/i').first();
  63 |       await expect(macroContent).toBeVisible({ timeout: 30_000 });
  64 |     });
  65 | 
  66 |     test('자산별 가격 데이터 표시', async ({ page }) => {
  67 |       await page.goto('/macro');
  68 |       await waitForContentLoad(page, 45_000);
  69 | 
  70 |       // 주요 자산 심볼 존재 확인 (SPY, QQQ 등)
  71 |       const symbols = ['SPY', 'QQQ'];
  72 |       for (const sym of symbols) {
  73 |         const symLocator = page.locator(`text=${sym}`).first();
  74 |         const isVisible = await symLocator.isVisible().catch(() => false);
  75 |         if (isVisible) {
  76 |           expect(isVisible).toBeTruthy();
  77 |           break; // 하나라도 보이면 데이터 로딩 확인
  78 |         }
  79 |       }
  80 |     });
  81 |   });
  82 | });
  83 | 
```