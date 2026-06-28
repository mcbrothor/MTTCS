-- Local-only MTN analysis warehouse.
-- Apply with:
--   psql "$LOCAL_POSTGRES_URL" -f local-postgres/migrations/001_local_analysis_infra.sql

create extension if not exists pgcrypto;

create table if not exists local_raw_prices (
  id uuid primary key default gen_random_uuid(),
  market text not null check (market in ('US', 'KR')),
  ticker text not null,
  exchange text,
  trade_date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  volume numeric,
  provider text not null,
  quality_status text not null default 'FULL'
    check (quality_status in ('FULL', 'FALLBACK', 'UNADJUSTED', 'ANOMALY', 'MISSING')),
  raw_payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  unique (market, ticker, trade_date, provider)
);

create index if not exists local_raw_prices_ticker_date_idx
  on local_raw_prices (market, ticker, trade_date desc);

create table if not exists financial_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  market text check (market in ('US', 'KR')),
  source text not null,
  statement_period text,
  currency text,
  metrics jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  source_as_of timestamptz,
  observed_at timestamptz not null default now()
);

create index if not exists financial_source_snapshots_ticker_idx
  on financial_source_snapshots (ticker, source, observed_at desc);

create table if not exists financial_audit_findings (
  id uuid primary key default gen_random_uuid(),
  supabase_job_id uuid,
  ticker text not null,
  market text check (market in ('US', 'KR')),
  status text not null check (status in ('PASS', 'WARN', 'FAIL')),
  severity text not null check (severity in ('INFO', 'WARN', 'CRITICAL')),
  summary text not null,
  findings jsonb not null default '[]'::jsonb,
  payload_hash text not null,
  audited_at timestamptz not null default now()
);

create index if not exists financial_audit_findings_job_idx
  on financial_audit_findings (supabase_job_id);

create index if not exists financial_audit_findings_ticker_idx
  on financial_audit_findings (ticker, audited_at desc);

create table if not exists filing_events (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  market text check (market in ('US', 'KR')),
  source text not null,
  filing_id text,
  filing_type text,
  filed_at timestamptz,
  source_url text,
  summary text,
  extracted_metrics jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists filing_events_ticker_idx
  on filing_events (ticker, filed_at desc);

create table if not exists news_events (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  market text check (market in ('US', 'KR')),
  source text not null,
  headline text not null,
  source_url text,
  published_at timestamptz,
  impact_label text check (impact_label in ('STRENGTHENS', 'NEUTRAL', 'WEAKENS', 'BREAKS', 'UNKNOWN')),
  summary text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists news_events_ticker_idx
  on news_events (ticker, published_at desc);

create table if not exists research_evidence (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  market text check (market in ('US', 'KR')),
  evidence_type text not null check (evidence_type in ('FILING', 'NEWS', 'PRICE', 'FUNDAMENTAL', 'LLM', 'MANUAL')),
  source text not null,
  source_ref text,
  claim text not null,
  extracted_value jsonb,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  linked_entity_type text,
  linked_entity_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists research_evidence_ticker_idx
  on research_evidence (ticker, created_at desc);

create table if not exists llm_runs (
  id uuid primary key default gen_random_uuid(),
  supabase_job_id uuid,
  provider text not null,
  model text not null,
  prompt_version text,
  input_hash text not null,
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  status text not null check (status in ('SUCCESS', 'FAILED', 'SKIPPED')),
  token_usage jsonb not null default '{}'::jsonb,
  cost_usd numeric,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists llm_runs_job_idx
  on llm_runs (supabase_job_id, started_at desc);

create table if not exists committee_agent_outputs (
  id uuid primary key default gen_random_uuid(),
  supabase_job_id uuid,
  ticker text not null,
  market text check (market in ('US', 'KR')),
  agent_role text not null,
  recommendation text,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  rationale text,
  evidence jsonb not null default '{}'::jsonb,
  llm_run_id uuid references llm_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists committee_agent_outputs_job_idx
  on committee_agent_outputs (supabase_job_id, agent_role);

create table if not exists backtest_runs (
  id uuid primary key default gen_random_uuid(),
  supabase_job_id uuid,
  strategy_key text not null,
  dataset_key text,
  status text not null check (status in ('RUNNING', 'PASSED', 'FAILED')),
  metrics jsonb not null default '{}'::jsonb,
  assumptions jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists worker_job_logs (
  id uuid primary key default gen_random_uuid(),
  supabase_job_id uuid,
  worker_id text not null,
  level text not null check (level in ('DEBUG', 'INFO', 'WARN', 'ERROR')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists worker_job_logs_job_idx
  on worker_job_logs (supabase_job_id, created_at);

create table if not exists worker_heartbeats (
  worker_id text primary key,
  status text not null check (status in ('STARTING', 'IDLE', 'RUNNING', 'ERROR', 'STOPPING')),
  last_seen_at timestamptz not null default now(),
  current_job_id uuid,
  metadata jsonb not null default '{}'::jsonb
);
