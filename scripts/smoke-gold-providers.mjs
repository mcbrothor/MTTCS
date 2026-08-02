import path from 'node:path';
import { createJiti } from 'jiti';

if (!globalThis.WebSocket) {
  // Supabase initializes its realtime transport when the KIS token cache is
  // imported. The smoke test never opens a socket.
  globalThis.WebSocket = class GoldSmokeWebSocket {};
}

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const { getYahooDailyPrice } = jiti('../lib/finance/providers/yahoo-api.ts');
const { getMarketDailyPrice } = jiti('../lib/finance/providers/kis-api.ts');
const { getDfii10, getBroadDollarIndex } = jiti('../lib/data/fred.ts');

async function capture(run) {
  try {
    const data = await run();
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const [yahoo, kis, fred] = await Promise.all([
  capture(async () => {
    const rows = await getYahooDailyPrice('GLD', { range: '1y' });
    return { rows: rows.length, asOf: rows.at(-1)?.date ?? null };
  }),
  capture(async () => {
    const rows = await getMarketDailyPrice('411060', 'KOSPI', 200);
    return { rows: rows.length, asOf: rows.at(-1)?.date ?? null };
  }),
  capture(async () => {
    const [realYield, broadDollar] = await Promise.all([
      getDfii10(260),
      getBroadDollarIndex(260),
    ]);
    return {
      configured: Boolean(process.env.FRED_API_KEY),
      mode: process.env.FRED_API_KEY ? 'JSON_API' : 'OFFICIAL_CSV_FALLBACK',
      dfii10Rows: realYield.length,
      dfii10AsOf: realYield.at(-1)?.date ?? null,
      dtwexbgsRows: broadDollar.length,
      dtwexbgsAsOf: broadDollar.at(-1)?.date ?? null,
    };
  }),
]);

const summary = {
  yahoo: yahoo.ok
    ? { ok: yahoo.data.rows >= 200, ...yahoo.data }
    : yahoo,
  kis: kis.ok
    ? { ok: kis.data.rows >= 200, ...kis.data }
    : kis,
  fred: fred.ok
    ? {
      ok:
        fred.data.dfii10Rows >= 20
        && fred.data.dtwexbgsRows >= 20,
      ...fred.data,
    }
    : fred,
};

console.log(JSON.stringify(summary, null, 2));
if (!summary.yahoo.ok || !summary.kis.ok || !summary.fred.ok) {
  process.exitCode = 1;
}
