import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const directory = new URL('../supabase/migrations/', import.meta.url);
const effectiveFunctions = new Map();
for (const file of readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
  const sql = readFileSync(new URL(file, directory), 'utf8');
  const definitions = sql.matchAll(
    /create or replace function mtn_internal\.(invoke_cron|collect_cron_http_responses)\s*\([\s\S]*?\bas\s+\$\$[\s\S]*?\$\$\s*;/gi,
  );
  for (const definition of definitions) {
    effectiveFunctions.set(definition[1].toLowerCase(), { file, sql: definition[0] });
  }
}

// Inspect the final installed definitions, so a later migration cannot silently
// undo the transport budget while the original migration's test still passes.
const invoke = effectiveFunctions.get('invoke_cron');
const collect = effectiveFunctions.get('collect_cron_http_responses');
assert.ok(invoke && collect, 'both scheduler functions must exist');
const transport = invoke.sql.match(/then\s+(\d+)\s+else\s+(\d+)\s+end/i);
const collector = collect.sql.match(/then\s+interval '(\d+) seconds'\s+else\s+interval '(\d+) seconds'\s+end/i);
assert.ok(transport, `missing transport policy in ${invoke.file}`);
assert.ok(collector, `missing response collection policy in ${collect.file}`);
const route = readFileSync(new URL('../app/api/cron/recommendation-performance/route.ts', import.meta.url), 'utf8');
const routeSeconds = Number(route.match(/export const maxDuration = (\d+)/)?.[1]);
assert.ok(Number(transport[2]) > routeSeconds * 1000, 'pg_net must outlive the recommendation route');
assert.equal(Number(transport[1]), 240000, 'preserve the closing-bet request budget');
assert.equal(Number(transport[2]), 280000, 'preserve the previously established general budget');
assert.equal(Number(collector[1]), 300, 'preserve closing-bet late response collection');
assert.ok(Number(collector[2]) * 1000 > Number(transport[2]), 'collector must not time out an active request');
assert.match(invoke.sql, /p_path like '\/api\/cron\/closing-bet\?%'/);
assert.match(collect.sql, /run\.path like '\/api\/cron\/closing-bet\?%'/);

const manifest = JSON.parse(readFileSync(new URL('../infra/release/production-scheduler-manifest.json', import.meta.url), 'utf8'));
for (const definition of [invoke, collect]) {
  assert.ok(manifest.requiredMigrations.includes(`supabase/migrations/${definition.file}`), 'release must require the active timeout policy');
}

console.log('Effective scheduler timeout budget contract tests passed');
