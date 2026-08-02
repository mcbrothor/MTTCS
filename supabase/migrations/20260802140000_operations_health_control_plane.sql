-- Durable, service-role-only evidence used by the external free-tier deadman.

create table if not exists public.operations_component_heartbeats (
  component text primary key check (component ~ '^[a-z0-9_-]+$'),
  worker_id text not null,
  status text not null check (status in ('STARTING', 'IDLE', 'RUNNING', 'ERROR', 'STOPPING')),
  current_job_id uuid,
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists operations_component_heartbeats_observed_idx
  on public.operations_component_heartbeats (observed_at desc);

create table if not exists public.operations_backup_runs (
  id bigint generated always as identity primary key,
  storage_provider text not null check (storage_provider in ('GITHUB_ARTIFACT', 'R2', 'LOCAL')),
  object_key text not null,
  status text not null check (status in ('SUCCESS', 'FAILED')),
  encrypted boolean not null default true check (encrypted),
  bytes bigint check (bytes is null or bytes > 0),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  completed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists operations_backup_runs_completed_idx
  on public.operations_backup_runs (completed_at desc);

alter table public.operations_component_heartbeats enable row level security;
alter table public.operations_backup_runs enable row level security;

revoke all on table public.operations_component_heartbeats from public, anon, authenticated;
revoke all on table public.operations_backup_runs from public, anon, authenticated;
revoke all on sequence public.operations_backup_runs_id_seq from public, anon, authenticated;

grant select, insert, update, delete on table public.operations_component_heartbeats to service_role;
grant select, insert on table public.operations_backup_runs to service_role;
grant usage, select on sequence public.operations_backup_runs_id_seq to service_role;

drop policy if exists "Service role manages operations component heartbeats"
  on public.operations_component_heartbeats;
create policy "Service role manages operations component heartbeats"
  on public.operations_component_heartbeats
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role writes operations backup runs"
  on public.operations_backup_runs;
create policy "Service role writes operations backup runs"
  on public.operations_backup_runs
  for all
  to service_role
  using (true)
  with check (true);

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
) values (
  'operations_backup_runs',
  'public.operations_backup_runs',
  'completed_at',
  365,
  180,
  90,
  30,
  'Encrypted backup and restore-drill evidence; object contents remain off database.',
  now()
)
on conflict (policy_name) do update
set normal_days = excluded.normal_days,
    watch_days = excluded.watch_days,
    warning_days = excluded.warning_days,
    blocked_days = excluded.blocked_days,
    notes = excluded.notes,
    updated_at = excluded.updated_at;

comment on table public.operations_component_heartbeats is
  'Latest remote heartbeat for each required local MTN worker component.';
comment on table public.operations_backup_runs is
  'Ciphertext-only backup completion evidence consumed by the external operations health endpoint.';
