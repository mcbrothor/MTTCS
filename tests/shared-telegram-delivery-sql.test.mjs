import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { resolveTestPostgresBin } from '../scripts/lib/test-postgres-bin.mjs';

const bin = resolveTestPostgresBin();
const directory = mkdtempSync(join(tmpdir(), 'mtn-delivery-test-'));
const dataDir = join(directory, 'data');
const port = 15000 + (process.pid % 30000);
const clients = [];
let started = false;
try {
  execFileSync(join(bin, 'initdb'), ['-D', dataDir, '-A', 'trust', '--no-locale', '-U', 'postgres'], { stdio: 'pipe' });
  execFileSync(join(bin, 'pg_ctl'), ['-D', dataDir, '-l', join(directory, 'postgres.log'), '-o', `-F -p ${port} -k ${directory} -c listen_addresses=''`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  for (let index = 0; index < 2; index++) {
    const client = new pg.Client({ host: directory, port, user: 'postgres', database: 'postgres' });
    await client.connect();
    clients.push(client);
  }
  const [first, second] = clients;
  await first.query(`
    create role anon; create role authenticated; create role service_role;
    create table public.recommendation_publications (
      id uuid primary key, run_date date, category text,
      telegram_status text constraint recommendation_publications_telegram_status_check check (telegram_status in ('PENDING', 'SENT', 'FAILED', 'SKIPPED'))
    );
    insert into public.recommendation_publications values ('00000000-0000-4000-8000-000000000001', current_date, 'KOSPI200', 'PENDING');
  `);
  await first.query(readFileSync(new URL('../supabase/migrations/20260921020000_recommendation_delivery_receipts.sql', import.meta.url), 'utf8'));
  const publicationId = '00000000-0000-4000-8000-000000000001';
  const owner1 = '00000000-0000-4000-8000-000000000002';
  const owner2 = '00000000-0000-4000-8000-000000000003';
  const claim = async (client, owner, hash = 'original-content') => (await client.query(
    'select public.claim_recommendation_telegram_chunk($1, $2, $3, $4, $5, $6) as receipt',
    ['delivery-key', publicationId, 'chat-hash', 0, hash, owner],
  )).rows[0].receipt;
  const raced = await Promise.all([claim(first, owner1), claim(second, owner2)]);
  assert.equal(raced[0].status, 'CLAIMED');
  assert.equal(raced[0].owner_id, raced[1].owner_id, 'concurrent claims must converge to one owner');
  assert.equal((await first.query('select count(*) from public.recommendation_telegram_deliveries')).rows[0].count, '1');

  await first.query("update public.recommendation_telegram_deliveries set status='FAILED'");
  assert.equal((await claim(second, owner2)).owner_id, owner2, 'definite FAILED delivery can transfer to a new owner');
  await first.query("update public.recommendation_telegram_deliveries set lease_until=now()-interval '1 second'");
  assert.equal((await claim(first, owner1)).status, 'UNCERTAIN', 'expired lease cannot grant permission to resend');
  assert.equal((await claim(first, owner1)).owner_id, owner2, 'uncertain receipt retains original owner');
  await first.query("update public.recommendation_telegram_deliveries set status='SENT', telegram_message_id=123");
  const sent = await claim(first, owner1);
  assert.equal(sent.status, 'SENT');
  assert.equal(sent.telegram_message_id, 123);
  await assert.rejects(claim(first, owner1, 'changed-content'), /content changed/, 'same chunk cannot silently overwrite a different report');

  for (const role of ['anon', 'authenticated']) {
    await first.query(`set role ${role}`);
    await assert.rejects(claim(first, owner1), /permission denied/);
    await assert.rejects(first.query('select * from public.recommendation_telegram_deliveries'), /permission denied/);
    await first.query('reset role');
  }
  await first.query('set role service_role');
  assert.equal((await claim(first, owner1)).status, 'SENT');
  assert.equal((await first.query('select count(*) from public.recommendation_telegram_deliveries')).rows[0].count, '1');
  await first.query('reset role');
  await first.query("update public.recommendation_publications set telegram_status='UNCERTAIN'");
  await first.query("update public.recommendation_publications set telegram_status='EXPIRED'");
  console.log('Shared Telegram receipt PostgreSQL concurrency and permissions tests passed');
} finally {
  await Promise.all(clients.map((client) => client.end()));
  if (started) execFileSync(join(bin, 'pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe' });
  rmSync(directory, { recursive: true, force: true });
}
