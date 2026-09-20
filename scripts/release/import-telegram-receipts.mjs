import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import pg from 'pg';

const args = process.argv.slice(2);
if (args.some((arg) => !['--apply', '--dry-run'].includes(arg))) throw new Error('Only --apply or --dry-run is supported.');
const apply = args.includes('--apply') && !args.includes('--dry-run') && process.env.DRY_RUN !== 'true';
const file = process.env.MTN_TELEGRAM_RECEIPT_PATH || path.join(homedir(), 'Library/Application Support/MTN/telegram-delivery-receipts.jsonl');
const rows = (await readFile(file, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
  .filter((row) => row.status === 'SENT' && row.publication_id && row.telegram_message_id);
if (!apply) console.log(JSON.stringify({ dryRun: true, validReceipts: rows.length }));
else {
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
  try {
    await db.query('begin');
    let imported = 0;
    for (const row of rows) {
      const result = await db.query(`insert into public.recommendation_telegram_deliveries
        (delivery_key,publication_id,chat_id_hash,chunk_index,content_sha256,status,owner_id,lease_until,telegram_message_id,updated_at)
        select $1,$2,$3,$4,$5,'SENT','00000000-0000-0000-0000-000000000000',$7,$6,$7
        where exists (select 1 from public.recommendation_publications where id=$2)
        on conflict (delivery_key) do nothing`,
      [row.key, row.publication_id, row.chat_id_hash, row.chunk_index, row.content_sha256, row.telegram_message_id, row.sent_at]);
      imported += result.rowCount;
    }
    await db.query('commit');
    console.log(JSON.stringify({ imported, examined: rows.length }));
  } catch (error) { await db.query('rollback'); throw error; }
  finally { await db.end(); }
}
