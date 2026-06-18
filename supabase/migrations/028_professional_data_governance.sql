create table if not exists public.data_pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  pipeline text not null,
  provider text not null,
  market text,
  status text not null check (status in ('SUCCESS', 'DEGRADED', 'FAILED')),
  observed_at timestamptz,
  fetched_at timestamptz not null default now(),
  completed_at timestamptz,
  fallback_used boolean not null default false,
  fallback_reason text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists data_pipeline_runs_latest_idx
  on public.data_pipeline_runs (pipeline, market, created_at desc);

create table if not exists public.model_versions (
  id uuid primary key default gen_random_uuid(),
  model_key text not null,
  version text not null,
  status text not null default 'RESEARCH_ONLY'
    check (status in ('DRAFT', 'RESEARCH_ONLY', 'SHADOW', 'APPROVED', 'RETIRED')),
  parameters jsonb not null default '{}'::jsonb,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (model_key, version)
);

create table if not exists public.validation_datasets (
  id uuid primary key default gen_random_uuid(),
  dataset_key text not null,
  version text not null,
  point_in_time boolean not null default false,
  licensed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (dataset_key, version)
);

create table if not exists public.validation_runs (
  id uuid primary key default gen_random_uuid(),
  model_version_id uuid not null references public.model_versions(id),
  dataset_id uuid not null references public.validation_datasets(id),
  status text not null check (status in ('QUEUED', 'RUNNING', 'PASSED', 'FAILED')),
  assumptions jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.validation_metrics (
  run_id uuid not null references public.validation_runs(id) on delete cascade,
  metric text not null,
  value numeric,
  segment text not null default 'ALL',
  metadata jsonb not null default '{}'::jsonb,
  primary key (run_id, metric, segment)
);

create table if not exists public.portfolio_cash_flows (
  id uuid primary key default gen_random_uuid(),
  market text not null check (market in ('US', 'KR')),
  currency text not null check (currency in ('USD', 'KRW')),
  flow_type text not null check (flow_type in ('DEPOSIT', 'WITHDRAWAL', 'FEE', 'TAX')),
  amount numeric not null check (amount > 0),
  occurred_at timestamptz not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.data_pipeline_runs enable row level security;
alter table public.model_versions enable row level security;
alter table public.validation_datasets enable row level security;
alter table public.validation_runs enable row level security;
alter table public.validation_metrics enable row level security;
alter table public.portfolio_cash_flows enable row level security;

grant select on table public.data_pipeline_runs to authenticated;
grant select on table public.model_versions to authenticated;
grant select on table public.validation_datasets to authenticated;
grant select on table public.validation_runs to authenticated;
grant select on table public.validation_metrics to authenticated;
grant select on table public.portfolio_cash_flows to authenticated;
grant all on table public.data_pipeline_runs, public.model_versions, public.validation_datasets,
  public.validation_runs, public.validation_metrics, public.portfolio_cash_flows to service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array['data_pipeline_runs','model_versions','validation_datasets','validation_runs','validation_metrics','portfolio_cash_flows']
  loop
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('create policy "Authenticated read %1$s" on public.%1$I for select to authenticated using (auth.role() = ''authenticated'')', table_name);
    execute format('create policy "Service role full access %1$s" on public.%1$I for all to service_role using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')', table_name);
  end loop;
end $$;

insert into public.model_versions (model_key, version, status, parameters)
values
  ('macro-us', 'macro-2026.06-v2', 'RESEARCH_ONLY', '{"yield_curve":"DGS10-DGS2","hy_oas_unit":"bps"}'),
  ('macro-kr', 'macro-2026.06-v2', 'RESEARCH_ONLY', '{"market":"KR"}'),
  ('sepa', 'sepa-2026.06-v1', 'RESEARCH_ONLY', '{}'),
  ('vcp', 'vcp-2026.06-v1', 'RESEARCH_ONLY', '{}'),
  ('canslim', 'canslim-2026.06-v1', 'RESEARCH_ONLY', '{}'),
  ('leader', 'leader-2026.06-v1', 'RESEARCH_ONLY', '{}'),
  ('qullamaggie', 'qullamaggie-2026.06-v1', 'RESEARCH_ONLY', '{}'),
  ('surge', 'surge-2026.06-v1', 'RESEARCH_ONLY', '{}')
on conflict (model_key, version) do nothing;
