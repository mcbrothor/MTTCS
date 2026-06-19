-- Daily recommendation publications, market data, performance, and diagnostics.

create table if not exists public.recommendation_publications (
  id uuid primary key default gen_random_uuid(),
  screener_run_id uuid not null references public.daily_screener_runs(id) on delete cascade,
  run_date date not null,
  market text not null check (market in ('US', 'KR')),
  version integer not null check (version > 0),
  is_official boolean not null default false,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'SHADOW', 'FAILED')),
  generated_at timestamptz not null,
  first_tradable_date date,
  entry_status text not null default 'WAITING' check (entry_status in ('WAITING', 'READY', 'ERROR')),
  engine_version text not null,
  prompt_version text,
  llm_provider text,
  llm_model text,
  market_context jsonb not null default '{}'::jsonb,
  telegram_status text not null default 'PENDING' check (telegram_status in ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  telegram_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_date, market, version)
);

create unique index if not exists recommendation_publications_official_uniq
  on public.recommendation_publications (run_date, market)
  where is_official = true;

create index if not exists recommendation_publications_market_date_idx
  on public.recommendation_publications (market, run_date desc, id);

create table if not exists public.recommendation_picks (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.recommendation_publications(id) on delete cascade,
  rank integer not null check (rank between 1 and 10),
  ticker text not null,
  exchange text not null,
  name text,
  universe text not null check (universe in ('NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150')),
  source text not null check (source in ('minervini', 'canslim', 'leader', 'momentum', 'qullamaggie', 'mixed')),
  score numeric not null,
  grade text not null,
  confidence numeric not null check (confidence between 0 and 1),
  reason text not null,
  risk text,
  sector text,
  benchmark_symbol text not null,
  signal_price numeric,
  signal_price_as_of date,
  candidate_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (publication_id, rank),
  unique (publication_id, ticker)
);

create index if not exists recommendation_picks_publication_rank_idx
  on public.recommendation_picks (publication_id, rank);

create index if not exists recommendation_picks_ticker_idx
  on public.recommendation_picks (ticker, publication_id);

create table if not exists public.recommendation_market_prices (
  id uuid primary key default gen_random_uuid(),
  market text not null check (market in ('US', 'KR')),
  instrument text not null,
  instrument_type text not null check (instrument_type in ('SECURITY', 'BENCHMARK')),
  trade_date date not null,
  open numeric not null check (open > 0),
  high numeric not null check (high > 0),
  low numeric not null check (low > 0),
  close numeric not null check (close > 0),
  volume numeric,
  provider text not null,
  adjustment_type text not null default 'PROVIDER_ADJUSTED'
    check (adjustment_type in ('PROVIDER_ADJUSTED', 'RAW', 'DERIVED')),
  adjustment_factor numeric,
  quality_status text not null default 'FULL'
    check (quality_status in ('FULL', 'FALLBACK', 'UNADJUSTED', 'ANOMALY', 'MISSING')),
  observed_at timestamptz not null default now(),
  unique (market, instrument, trade_date)
);

create index if not exists recommendation_market_prices_instrument_date_idx
  on public.recommendation_market_prices (market, instrument, trade_date desc);

create table if not exists public.recommendation_performance (
  id uuid primary key default gen_random_uuid(),
  pick_id uuid not null references public.recommendation_picks(id) on delete cascade,
  horizon text not null check (horizon in ('LIVE', 'D5', 'D20', 'D60')),
  status text not null default 'PENDING' check (status in ('PENDING', 'MATURED', 'EXCLUDED', 'ERROR')),
  session_count integer not null default 0 check (session_count >= 0),
  entry_date date,
  entry_price numeric,
  evaluation_date date,
  evaluation_price numeric,
  benchmark_entry_price numeric,
  benchmark_evaluation_price numeric,
  return_pct numeric,
  benchmark_return_pct numeric,
  excess_return_pct numeric,
  mfe_pct numeric,
  mae_pct numeric,
  granularity text not null default 'DAILY' check (granularity = 'DAILY'),
  quality_status text not null default 'MISSING'
    check (quality_status in ('FULL', 'FALLBACK', 'UNADJUSTED', 'ANOMALY', 'MISSING')),
  error_message text,
  calculated_at timestamptz not null default now(),
  unique (pick_id, horizon)
);

create index if not exists recommendation_performance_horizon_status_idx
  on public.recommendation_performance (horizon, status, evaluation_date desc);

create table if not exists public.recommendation_diagnostic_findings (
  id uuid primary key default gen_random_uuid(),
  analysis_batch_id uuid not null,
  analyzer_version text not null,
  market text not null check (market in ('US', 'KR')),
  horizon text not null check (horizon in ('LIVE', 'D5', 'D20', 'D60')),
  publication_id uuid references public.recommendation_publications(id) on delete cascade,
  pick_id uuid references public.recommendation_picks(id) on delete cascade,
  scope_type text not null check (scope_type in ('PICK', 'COHORT', 'SEGMENT')),
  scope_key text not null,
  cause_code text not null check (cause_code in ('MARKET_REGIME', 'SELECTION', 'ENTRY_TIMING', 'SIGNAL_SOURCE', 'CONCENTRATION', 'DATA_QUALITY')),
  finding_status text not null check (finding_status in ('HYPOTHESIS', 'CONFIRMED')),
  severity text not null check (severity in ('INFO', 'WARN', 'CRITICAL')),
  confidence numeric not null check (confidence between 0 and 1),
  sample_size integer not null default 1 check (sample_size > 0),
  summary_ko text not null,
  evidence jsonb not null default '{}'::jsonb,
  affected_pick_ids uuid[] not null default '{}',
  analyzed_at timestamptz not null default now()
);

create index if not exists recommendation_findings_market_horizon_idx
  on public.recommendation_diagnostic_findings (market, horizon, analyzed_at desc);

alter table public.recommendation_publications enable row level security;
alter table public.recommendation_picks enable row level security;
alter table public.recommendation_market_prices enable row level security;
alter table public.recommendation_performance enable row level security;
alter table public.recommendation_diagnostic_findings enable row level security;

revoke all on table public.recommendation_publications from anon, authenticated;
revoke all on table public.recommendation_picks from anon, authenticated;
revoke all on table public.recommendation_market_prices from anon, authenticated;
revoke all on table public.recommendation_performance from anon, authenticated;
revoke all on table public.recommendation_diagnostic_findings from anon, authenticated;

grant all on table public.recommendation_publications to service_role;
grant all on table public.recommendation_picks to service_role;
grant all on table public.recommendation_market_prices to service_role;
grant all on table public.recommendation_performance to service_role;
grant all on table public.recommendation_diagnostic_findings to service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'recommendation_publications',
    'recommendation_picks',
    'recommendation_market_prices',
    'recommendation_performance',
    'recommendation_diagnostic_findings'
  ]
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = format('Service role full access %s', table_name)
    ) then
      execute format(
        'create policy "Service role full access %1$s" on public.%1$I for all to service_role using ((select auth.role()) = ''service_role'') with check ((select auth.role()) = ''service_role'')',
        table_name
      );
    end if;
  end loop;
end $$;
