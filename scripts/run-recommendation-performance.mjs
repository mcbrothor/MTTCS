import { createClient } from '@supabase/supabase-js';
import { createJiti } from 'jiti';
import path from 'node:path';

const marketArg = process.argv.find((value) => value.startsWith('--market='))?.split('=')[1]?.toUpperCase() || 'US';
const shard = Number(process.argv.find((value) => value.startsWith('--shard='))?.split('=')[1] || 0);
const shards = Number(process.argv.find((value) => value.startsWith('--shards='))?.split('=')[1] || 1);
const allShards = process.argv.includes('--all-shards');
if (marketArg !== 'US' && marketArg !== 'KR') throw new Error('--market must be US or KR.');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const { runRecommendationPerformanceBatch } = jiti('../lib/recommendations/jobs.ts');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
if (allShards) {
  const results = [];
  for (let current = 0; current < shards; current += 1) {
    results.push(await runRecommendationPerformanceBatch({ client, market: marketArg, shard: current, shards }));
  }
  console.log(JSON.stringify({ market: marketArg, shards, results }, null, 2));
} else {
  const result = await runRecommendationPerformanceBatch({ client, market: marketArg, shard, shards });
  console.log(JSON.stringify(result, null, 2));
}
