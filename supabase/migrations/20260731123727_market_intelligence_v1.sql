-- Point-in-time official news and macro event ledger.
-- Access is server-only because MTN uses its own signed session rather than Supabase Auth.

create table if not exists public.market_intelligence_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  source_tier text not null default 'PRIMARY'
    check (source_tier in ('PRIMARY', 'SECONDARY')),
  market text not null check (market in ('GLOBAL', 'US', 'KR')),
  event_type text not null
    check (event_type in ('MACRO_RELEASE', 'CENTRAL_BANK', 'REGULATORY', 'FILING', 'EARNINGS', 'NEWS')),
  severity text not null check (severity in ('INFO', 'WATCH', 'RISK')),
  direction text not null default 'UNKNOWN'
    check (direction in ('RISK_ON', 'NEUTRAL', 'RISK_OFF', 'UNKNOWN')),
  title text not null check (char_length(title) between 1 and 500),
  summary text,
  source_url text,
  published_at timestamptz not null,
  observed_at timestamptz not null,
  symbols text[] not null default '{}'::text[],
  topics text[] not null default '{}'::text[],
  content_hash text not null,
  is_revision boolean not null default false,
  raw_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_payload) = 'object'),
  analysis jsonb not null default '{}'::jsonb check (jsonb_typeof(analysis) = 'object'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id, content_hash)
);

create or replace function public.mark_market_intelligence_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.is_revision := exists (
    select 1
    from public.market_intelligence_events existing
    where existing.source = new.source
      and existing.external_id = new.external_id
  );
  return new;
end;
$$;

drop trigger if exists market_intelligence_revision_before_insert on public.market_intelligence_events;
create trigger market_intelligence_revision_before_insert
before insert on public.market_intelligence_events
for each row execute function public.mark_market_intelligence_revision();

revoke all on function public.mark_market_intelligence_revision() from public, anon, authenticated;

create table if not exists public.market_intelligence_source_health (
  source text primary key,
  mode text not null check (mode in ('feeds', 'indicators', 'all')),
  status text not null check (status in ('SUCCESS', 'FAILED')),
  event_count integer not null default 0 check (event_count >= 0),
  last_attempt_at timestamptz not null,
  last_success_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create or replace function public.preserve_market_intelligence_last_success()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.last_success_at is null then
    new.last_success_at := old.last_success_at;
  end if;
  return new;
end;
$$;

drop trigger if exists market_intelligence_health_before_update on public.market_intelligence_source_health;
create trigger market_intelligence_health_before_update
before update on public.market_intelligence_source_health
for each row execute function public.preserve_market_intelligence_last_success();

revoke all on function public.preserve_market_intelligence_last_success() from public, anon, authenticated;

create index if not exists market_intelligence_events_time_idx
  on public.market_intelligence_events (published_at desc);
create index if not exists market_intelligence_events_market_time_idx
  on public.market_intelligence_events (market, published_at desc);
create index if not exists market_intelligence_events_risk_idx
  on public.market_intelligence_events (severity, published_at desc)
  where severity in ('WATCH', 'RISK');
create index if not exists market_intelligence_events_symbols_idx
  on public.market_intelligence_events using gin (symbols);
create index if not exists market_intelligence_events_topics_idx
  on public.market_intelligence_events using gin (topics);

alter table public.market_intelligence_events enable row level security;
alter table public.market_intelligence_source_health enable row level security;
revoke all on table public.market_intelligence_events from public, anon, authenticated;
revoke all on table public.market_intelligence_source_health from public, anon, authenticated;
grant select, insert, update, delete on table public.market_intelligence_events to service_role;
grant select, insert, update, delete on table public.market_intelligence_source_health to service_role;

drop policy if exists "Service role manages market intelligence events" on public.market_intelligence_events;
create policy "Service role manages market intelligence events"
  on public.market_intelligence_events
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role manages market intelligence source health" on public.market_intelligence_source_health;
create policy "Service role manages market intelligence source health"
  on public.market_intelligence_source_health
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.market_intelligence_events is
  'Point-in-time official-source event ledger. Browser access is intentionally denied.';
comment on table public.market_intelligence_source_health is
  'Current per-source ingestion health used by decision readiness. Browser access is intentionally denied.';

insert into public.model_versions (model_key, version, status, parameters)
values (
  'market-intelligence',
  'market-intelligence-rules-2026.07-v1',
  'RESEARCH_ONLY',
  '{"methodology":"source-and-keyword-risk-only","automatic_trading":false,"requires_review":true}'::jsonb
)
on conflict (model_key, version) do nothing;
