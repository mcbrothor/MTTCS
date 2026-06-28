-- Local analysis job queue and user-facing summaries.
-- Heavy evidence stays in Local Postgres; Supabase keeps queue state and UI summaries.

create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in (
    'FINANCIAL_AUDIT',
    'THESIS_CHECK',
    'COMMITTEE_REVIEW',
    'NEWS_PULSE',
    'RECOMMENDATION_BACKTEST'
  )),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  priority integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  result_summary jsonb,
  error_message text,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  run_after timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  idempotency_key text,
  local_evidence_ref jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (job_type, idempotency_key)
);

create index if not exists analysis_jobs_claim_idx
  on public.analysis_jobs (status, run_after, priority desc, created_at)
  where status in ('queued', 'running');

create index if not exists analysis_jobs_type_status_idx
  on public.analysis_jobs (job_type, status, created_at desc);

create table if not exists public.financial_audit_summaries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.analysis_jobs(id) on delete cascade,
  ticker text not null,
  market text check (market in ('US', 'KR')),
  status text not null check (status in ('PASS', 'WARN', 'FAIL')),
  severity text not null check (severity in ('INFO', 'WARN', 'CRITICAL')),
  summary text not null,
  finding_count integer not null default 0 check (finding_count >= 0),
  source_count integer not null default 0 check (source_count >= 0),
  max_variance_pct numeric,
  local_evidence_ref jsonb not null default '{}'::jsonb,
  audited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financial_audit_summaries_ticker_idx
  on public.financial_audit_summaries (ticker, audited_at desc);

create table if not exists public.investment_theses (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  market text check (market in ('US', 'KR')),
  title text not null,
  thesis text not null,
  status text not null default 'ACTIVE' check (status in ('DRAFT', 'ACTIVE', 'WATCH', 'BROKEN', 'CLOSED')),
  health text not null default 'UNKNOWN' check (health in ('HEALTHY', 'WATCH', 'BROKEN', 'UNKNOWN')),
  linked_trade_id uuid references public.trades(id) on delete set null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists investment_theses_ticker_status_idx
  on public.investment_theses (ticker, status, created_at desc);

create table if not exists public.thesis_assumptions (
  id uuid primary key default gen_random_uuid(),
  thesis_id uuid not null references public.investment_theses(id) on delete cascade,
  assumption_type text not null check (assumption_type in ('GROWTH', 'MARGIN', 'MOAT', 'CATALYST', 'RISK', 'TECHNICAL', 'MACRO', 'OTHER')),
  description text not null,
  invalidation_condition text,
  status text not null default 'OPEN' check (status in ('OPEN', 'CONFIRMED', 'WEAKENED', 'BROKEN', 'CLOSED')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists thesis_assumptions_thesis_idx
  on public.thesis_assumptions (thesis_id, status);

create table if not exists public.thesis_check_events (
  id uuid primary key default gen_random_uuid(),
  thesis_id uuid not null references public.investment_theses(id) on delete cascade,
  job_id uuid references public.analysis_jobs(id) on delete set null,
  event_type text not null check (event_type in ('SCHEDULED_CHECK', 'FILING', 'NEWS', 'PRICE_ACTION', 'MANUAL_REVIEW', 'COMMITTEE_REVIEW')),
  impact text not null check (impact in ('STRENGTHENS', 'NEUTRAL', 'WEAKENS', 'BREAKS', 'UNKNOWN')),
  summary text not null,
  evidence jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists thesis_check_events_thesis_idx
  on public.thesis_check_events (thesis_id, checked_at desc);

create table if not exists public.committee_reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.analysis_jobs(id) on delete set null,
  ticker text not null,
  market text check (market in ('US', 'KR')),
  consensus text not null check (consensus in ('STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL', 'SKIP', 'WATCH')),
  confidence numeric not null check (confidence between 0 and 1),
  summary text not null,
  agent_votes jsonb not null default '{}'::jsonb,
  local_evidence_ref jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists committee_reviews_ticker_idx
  on public.committee_reviews (ticker, reviewed_at desc);

create or replace function public.claim_analysis_job(
  p_worker_id text,
  p_job_types text[] default null,
  p_stale_after_seconds integer default 900
)
returns setof public.analysis_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  select id into v_job_id
  from public.analysis_jobs
  where status in ('queued', 'running')
    and attempts < max_attempts
    and run_after <= now()
    and (p_job_types is null or job_type = any(p_job_types))
    and (
      status = 'queued'
      or (
        status = 'running'
        and locked_at < now() - make_interval(secs => p_stale_after_seconds)
      )
    )
  order by priority desc, created_at asc
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  return query
  update public.analysis_jobs
  set status = 'running',
      attempts = attempts + 1,
      locked_by = p_worker_id,
      locked_at = now(),
      updated_at = now(),
      error_message = null
  where id = v_job_id
  returning *;
end;
$$;

alter table public.analysis_jobs enable row level security;
alter table public.financial_audit_summaries enable row level security;
alter table public.investment_theses enable row level security;
alter table public.thesis_assumptions enable row level security;
alter table public.thesis_check_events enable row level security;
alter table public.committee_reviews enable row level security;

revoke all on table public.analysis_jobs from anon, authenticated;
revoke all on table public.financial_audit_summaries from anon, authenticated;
revoke all on table public.investment_theses from anon, authenticated;
revoke all on table public.thesis_assumptions from anon, authenticated;
revoke all on table public.thesis_check_events from anon, authenticated;
revoke all on table public.committee_reviews from anon, authenticated;
revoke all on function public.claim_analysis_job(text, text[], integer) from public, anon, authenticated;

grant all on table public.analysis_jobs to service_role;
grant all on table public.financial_audit_summaries to service_role;
grant all on table public.investment_theses to service_role;
grant all on table public.thesis_assumptions to service_role;
grant all on table public.thesis_check_events to service_role;
grant all on table public.committee_reviews to service_role;
grant execute on function public.claim_analysis_job(text, text[], integer) to service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'analysis_jobs',
    'financial_audit_summaries',
    'investment_theses',
    'thesis_assumptions',
    'thesis_check_events',
    'committee_reviews'
  ]
  loop
    if not exists (
      select 1 from pg_policies
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
