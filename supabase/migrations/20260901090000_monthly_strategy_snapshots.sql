create table if not exists public.monthly_strategy_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  market text not null check (market in ('KR', 'US')),
  signal_at date not null,
  effective_at date,
  model_version text not null check (char_length(model_version) between 1 and 120),
  model_status text not null default 'RESEARCH_ONLY'
    check (model_status in ('RESEARCH_ONLY', 'SHADOW', 'APPROVED', 'RETIRED')),
  signal_status text not null check (signal_status in ('FINAL', 'PROVISIONAL', 'BLOCKED')),
  provider text not null,
  quality text not null check (quality in ('FULL', 'BLOCKED')),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  observed_at date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, market, signal_at, model_version, input_hash)
);

create index if not exists monthly_strategy_snapshots_owner_latest_idx
  on public.monthly_strategy_snapshots (owner_id, market, signal_at desc, created_at desc);

alter table public.monthly_strategy_snapshots enable row level security;
revoke all on table public.monthly_strategy_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.monthly_strategy_snapshots to service_role;

drop policy if exists "Service role manages monthly strategy snapshots"
  on public.monthly_strategy_snapshots;
create policy "Service role manages monthly strategy snapshots"
  on public.monthly_strategy_snapshots
  for all
  to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is not null
     and not exists (select 1 from pg_trigger where tgname = 'trg_monthly_strategy_snapshots_updated_at') then
    create trigger trg_monthly_strategy_snapshots_updated_at
      before update on public.monthly_strategy_snapshots
      for each row execute function public.update_updated_at_column();
  end if;
end $$;

insert into public.model_versions (model_key, version, status, parameters)
values
  ('kospi-monthly', 'kospi-monthly-v3-2026.09-v1', 'RESEARCH_ONLY', '{"breadth":"cluster-balanced-ma120","entry_top_n":3,"keep_top_n":5,"execution":"next-session-close","leverage":false}'::jsonb),
  ('us-monthly', 'us-monthly-v8-2026.09-v1', 'RESEARCH_ONLY', '{"breadth":"11-sector-ma120","entry_top_n":3,"keep_top_n":5,"execution":"next-session-close","leverage":false}'::jsonb)
on conflict (model_key, version) do update
set
  status = case
    when public.model_versions.status in ('APPROVED', 'RETIRED') then public.model_versions.status
    else excluded.status
  end,
  parameters = excluded.parameters;
