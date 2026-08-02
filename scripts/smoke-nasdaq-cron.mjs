import path from 'node:path';
import { createJiti } from 'jiti';

if (!globalThis.WebSocket) globalThis.WebSocket = class NasdaqCronSmokeWebSocket {};
if (!process.env.CRON_SECRET) throw new Error('CRON_SECRET is required.');
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const route = jiti('../app/api/cron/nasdaq-strategy/route.ts');
const dryRun = process.env.DRY_RUN !== 'false';
const response = await route.GET(new Request(
  `http://localhost/api/cron/nasdaq-strategy?dryRun=${dryRun}`,
  { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } },
));
const payload = await response.json();
console.log(JSON.stringify({
  httpStatus: response.status,
  dryRun: payload.data?.dryRun ?? null,
  persisted: payload.data?.persisted ?? null,
  decision: payload.data?.strategy?.decision ?? null,
  quality: payload.data?.strategy?.quality ?? null,
  tacticalProduct: payload.data?.strategy?.settings?.tacticalProduct ?? null,
  inputHash: payload.data?.inputHash ?? null,
  message: payload.message ?? null,
}, null, 2));
if (
  !response.ok
  || payload.data?.dryRun !== dryRun
  || payload.data?.persisted !== !dryRun
) {
  process.exitCode = 1;
}
