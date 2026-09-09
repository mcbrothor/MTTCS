import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260909090000_qullamaggie_evidence_snapshots.sql',
);
const immutablePrivilegesPath = path.join(
  process.cwd(),
  'supabase/migrations/20260909091500_qullamaggie_evidence_immutable_privileges.sql',
);

test('Qullamaggie evidence migration keeps snapshots private and insert-only', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /create table if not exists public\.qullamaggie_evidence_snapshots/i);
  assert.match(sql, /bars_hash text not null check \(bars_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.qullamaggie_evidence_snapshots from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert, delete on table public\.qullamaggie_evidence_snapshots to service_role/i);
  assert.doesNotMatch(sql, /grant all on table public\.qullamaggie_evidence_snapshots/i);

  const immutablePrivilegesSql = await readFile(immutablePrivilegesPath, 'utf8');
  assert.match(
    immutablePrivilegesSql,
    /revoke all on table public\.qullamaggie_evidence_snapshots from service_role/i,
  );
  assert.match(
    immutablePrivilegesSql,
    /grant select, insert, delete on table public\.qullamaggie_evidence_snapshots to service_role/i,
  );
  assert.doesNotMatch(immutablePrivilegesSql, /grant update/i);
});
