-- Durable, immutable chart evidence for Qullamaggie scanner decisions.

create table if not exists public.qullamaggie_evidence_snapshots (
  snapshot_id text primary key check (snapshot_id ~ '^qev_[A-Z0-9._-]+_[0-9]{8}_[a-f0-9]{24}$'),
  ticker text not null check (ticker = upper(ticker) and char_length(ticker) between 1 and 32),
  exchange text not null check (char_length(exchange) between 1 and 24),
  as_of_bar_date date not null,
  bars_hash text not null check (bars_hash ~ '^[a-f0-9]{64}$'),
  engine_version text not null,
  schema_version text not null check (schema_version = '1'),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint qullamaggie_evidence_snapshot_identity_check check (
    payload ->> 'snapshotId' = snapshot_id
    and payload #>> '{symbol,ticker}' = ticker
    and payload #>> '{symbol,exchange}' = exchange
    and payload #>> '{provenance,barsHash}' = bars_hash
    and payload #>> '{provenance,engineVersion}' = engine_version
  )
);

create index if not exists qullamaggie_evidence_latest_idx
  on public.qullamaggie_evidence_snapshots (ticker, exchange, as_of_bar_date desc, created_at desc);

alter table public.qullamaggie_evidence_snapshots enable row level security;
revoke all on table public.qullamaggie_evidence_snapshots from public, anon, authenticated;
grant select, insert, delete on table public.qullamaggie_evidence_snapshots to service_role;

insert into public.data_retention_policies (
  policy_name,
  target_table,
  timestamp_column,
  normal_days,
  watch_days,
  warning_days,
  blocked_days,
  notes,
  updated_at
)
values (
  'qullamaggie_evidence_snapshots',
  'public.qullamaggie_evidence_snapshots',
  'created_at',
  30,
  14,
  7,
  3,
  'Reproducible OHLCV and structured chart evidence; deterministic IDs deduplicate identical scans.',
  now()
)
on conflict (policy_name) do update
set target_table = excluded.target_table,
    timestamp_column = excluded.timestamp_column,
    normal_days = excluded.normal_days,
    watch_days = excluded.watch_days,
    warning_days = excluded.warning_days,
    blocked_days = excluded.blocked_days,
    notes = excluded.notes,
    updated_at = excluded.updated_at;
