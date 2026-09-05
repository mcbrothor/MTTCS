import { createJiti } from 'jiti';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const jiti = createJiti(import.meta.url, { alias: { '@': process.cwd() } });
const { runClosingBet, evaluateClosingBet } = await jiti.import('../lib/closing-bet/service.ts');
const { sendClosingSnapshot, formatClosingTelegram } = await jiti.import('../lib/closing-bet/telegram.ts');
const { ClosingRepository } = await jiti.import('../lib/closing-bet/repository.ts');
const { getSupabaseAdmin } = await jiti.import('../lib/supabase/server.ts');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.join('=') || true];
}));
const allowed = ['date', 'market', 'mode', 'write', 'send', 'evaluate', 'collect-baselines', 'action'];
for (const key of args.keys()) if (!allowed.includes(key)) throw new Error(`Unknown option: ${key}`);
const date = args.get('date');
if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('--date=YYYY-MM-DD required');
const mode = args.get('mode') || 'REPLAY';
if (!['LIVE', 'REPLAY'].includes(mode)) throw new Error('Invalid mode');
const markets = args.has('market') ? [args.get('market')] : ['KOSPI200', 'KOSDAQ150'];
if (markets.some((market) => !['KOSPI200', 'KOSDAQ150'].includes(market))) throw new Error('Invalid market');
const dryRun = !args.has('write') || process.env.DRY_RUN === 'true';
if (args.has('send') && dryRun) throw new Error('--send requires --write and DRY_RUN must not be true');
const action = args.get('action') || 'run';
if (!['run', 'send', 'evaluate'].includes(action)) throw new Error('Invalid action');
const repo = new ClosingRepository(getSupabaseAdmin());
const stamp = new Date().toISOString().replaceAll(':', '-');
const output = path.resolve('tmp/closing-bet', `${date}-${stamp}`);
await mkdir(output, { recursive: true });
let failed = false;
for (const market of markets) {
  try {
    const existing = action !== 'run' ? (await repo.list(date, mode)).find((row) => row.market === market && row.phase === 'FINAL') : null;
    const run = action === 'run' ? await runClosingBet({ market, date, mode, dryRun, collectBaselines: args.has('collect-baselines'), progress: (message) => console.log(message) }) : null;
    const snapshot = existing || run?.snapshot;
    if (!snapshot) { failed = true; console.log({ market, status: 'NO_SNAPSHOT', reason: run?.reason ?? '다른 실행의 잠금 또는 발행 데이터 없음' }); continue; }
    const evaluations = args.has('evaluate') || action === 'evaluate' ? await evaluateClosingBet(snapshot, dryRun) : await repo.evaluations([snapshot.id]);
    const report = { snapshot, evaluations, dryRun };
    await writeFile(path.join(output, `${market}.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    const text = formatClosingTelegram(snapshot, evaluations);
    await writeFile(path.join(output, `${market}.txt`), text, { flag: 'wx' });
    const delivery = args.has('send') || action === 'send' ? await sendClosingSnapshot(repo, snapshot, evaluations, dryRun) : null;
    if (delivery?.failed) failed = true;
    console.log(JSON.stringify({ market, date, mode, status: snapshot.status, coverage: snapshot.coverage, picks: snapshot.picks.map((row) => ({ ticker: row.ticker, name: row.name, score: row.score })), reviewCandidates: snapshot.reviewCandidates.map((row) => ({ ticker: row.ticker, name: row.name, score: row.score, status: row.status })), delivery, output }));
  } catch (error) { failed = true; console.error(`${market}: ${error instanceof Error ? error.message : 'Closing bet failed'}`); }
}
if (failed) process.exitCode = 1;
