This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## MTN RS Metrics Batch

After the `stock_metrics` and `macro_trend` tables are migrated, run the RS metrics batch to populate standard-universe RS data.

```bash
# Runs US S&P 500 and KR KOSPI100+KOSDAQ150 chunks, then finalizes rankings.
npm run rs:metrics
```

Useful options:

```bash
npm run rs:metrics:dry
npm run rs:metrics -- --market=US --chunk-size=50
npm run rs:metrics -- --market=KR --calc-date=2026-04-19
npm run rs:metrics -- --base-url=http://localhost:3000 --market=US
```

Required environment:

- `MTN_BASE_URL`: target app URL. Defaults to `https://mttcs.vercel.app`.
- `CRON_SECRET` or `MTN_CRON_SECRET`: sent as `Authorization: Bearer ...` when configured.

## MTN Decision Model

MTN Rule Engine output is a preliminary quantitative screen. It ranks and scores candidates so the user can focus review time, but it is not a sufficient condition for a final investment plan.

The external LLM/IB committee review is the decision-influencing second layer. It must independently evaluate fundamentals, event risk, accounting quality, moat, theme concentration, and execution feasibility before confirming, upgrading, downgrading, or reranking MTN candidates. Final investment planning should combine MTN's first-pass signal, the external LLM's detailed review, and the user's own judgment.

MTN is a setup screener, not an order execution management system. Execution timing, order routing, and final risk acceptance remain the user's responsibility.

## 보안 가이드: 환경 변수 키 로테이션 (Key Rotation)

`.env.local` 파일에는 민감한 API 키와 데이터베이스 접속 정보가 포함되어 있습니다. 주기적으로 키 로테이션을 수행해야 합니다.

**키 로테이션 수행 절차:**
1. **Supabase Key 로테이션:** Supabase 프로젝트 대시보드 (Settings > API)에서 `NEXT_PUBLIC_SUPABASE_ANON_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`를 새로 발급받아 환경 변수를 업데이트합니다.
2. **OpenAI / AI 로테이션:** OpenAI 대시보드에서 기존 API 키를 삭제하고 신규 키를 발급받아 `OPENAI_API_KEY`를 업데이트합니다.
3. **증권사(KIS) 토큰 로테이션:** KIS Developers 포털에서 App Key와 Secret을 주기적으로 갱신하고, 배치 스크립트를 통해 새로운 액세스 토큰을 발급받아야 합니다. (`KIS_APP_KEY`, `KIS_APP_SECRET`, `KIS_VIRTUAL_APP_KEY`, `KIS_VIRTUAL_APP_SECRET`)
4. **Vercel 재배포:** Vercel 환경 변수 설정에 변경된 키를 반영하고 프로덕션 파이프라인을 재배포합니다.
5. 로컬 `.env.local` 갱신 후 동작을 점검합니다 (`npm run dev`).
