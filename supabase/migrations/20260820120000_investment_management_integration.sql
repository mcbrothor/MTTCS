-- VMware 투자관리의 계산 로직을 MTN 네이티브 스냅샷과 투자 아이디어 흐름으로 통합한다.

alter table public.watchlist
  add column if not exists thesis text,
  add column if not exists catalysts text[] not null default '{}'::text[],
  add column if not exists invalidation text,
  add column if not exists review_at timestamptz,
  add column if not exists idea_status text not null default 'DRAFT',
  add column if not exists source_refs jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'watchlist_idea_status_check') then
    alter table public.watchlist add constraint watchlist_idea_status_check
      check (idea_status in ('DRAFT', 'WATCHING', 'READY', 'INVALIDATED', 'ARCHIVED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'watchlist_source_refs_array_check') then
    alter table public.watchlist add constraint watchlist_source_refs_array_check
      check (jsonb_typeof(source_refs) = 'array');
  end if;
end $$;

create index if not exists watchlist_user_idea_review_idx
  on public.watchlist (user_id, idea_status, review_at)
  where idea_status not in ('INVALIDATED', 'ARCHIVED');

create table if not exists public.market_breadth_snapshots (
  id uuid primary key default gen_random_uuid(),
  market text not null check (market in ('KR', 'US')),
  universe text not null,
  as_of date not null,
  model_version text not null,
  provider text not null,
  quality text not null check (quality in ('FULL', 'DEGRADED', 'STALE', 'BLOCKED')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market, universe, as_of, model_version)
);

create table if not exists public.investor_flow_oscillator_snapshots (
  id uuid primary key default gen_random_uuid(),
  market text not null default 'KR' check (market = 'KR'),
  universe text not null,
  as_of date not null,
  model_version text not null,
  provider text not null,
  quality text not null check (quality in ('FULL', 'DEGRADED', 'STALE', 'BLOCKED')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market, universe, as_of, model_version)
);

create table if not exists public.asset_allocation_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  strategy text not null check (strategy = 'HAA'),
  as_of date not null,
  model_version text not null,
  provider text not null,
  quality text not null check (quality in ('FULL', 'DEGRADED', 'STALE', 'BLOCKED')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, strategy, as_of, model_version)
);

create table if not exists public.turnover_intensity_snapshots (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  exchange text not null,
  as_of date not null,
  model_version text not null,
  provider text not null,
  quality text not null check (quality in ('FULL', 'DEGRADED', 'STALE', 'BLOCKED')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ticker, exchange, as_of, model_version)
);

create table if not exists public.market_sentiment_inputs (
  trade_date date primary key,
  index_close numeric,
  put_call numeric,
  vkospi numeric,
  bond_10y numeric,
  bond_5y numeric,
  provider text not null,
  observed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_sentiment_snapshots (
  id uuid primary key default gen_random_uuid(),
  market text not null default 'KR' check (market = 'KR'),
  as_of date not null,
  model_version text not null,
  provider text not null,
  quality text not null check (quality in ('FULL', 'DEGRADED', 'STALE', 'BLOCKED')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market, as_of, model_version)
);

alter table public.market_breadth_snapshots enable row level security;
alter table public.investor_flow_oscillator_snapshots enable row level security;
alter table public.asset_allocation_snapshots enable row level security;
alter table public.turnover_intensity_snapshots enable row level security;
alter table public.market_sentiment_inputs enable row level security;
alter table public.market_sentiment_snapshots enable row level security;

revoke all on table public.market_breadth_snapshots from anon, authenticated;
revoke all on table public.investor_flow_oscillator_snapshots from anon, authenticated;
revoke all on table public.asset_allocation_snapshots from anon, authenticated;
revoke all on table public.turnover_intensity_snapshots from anon, authenticated;
revoke all on table public.market_sentiment_inputs from anon, authenticated;
revoke all on table public.market_sentiment_snapshots from anon, authenticated;

grant select, insert, update, delete on table public.market_breadth_snapshots to service_role;
grant select, insert, update, delete on table public.investor_flow_oscillator_snapshots to service_role;
grant select, insert, update, delete on table public.asset_allocation_snapshots to service_role;
grant select, insert, update, delete on table public.turnover_intensity_snapshots to service_role;
grant select, insert, update, delete on table public.market_sentiment_inputs to service_role;
grant select, insert, update, delete on table public.market_sentiment_snapshots to service_role;

create policy "Service role manages market breadth" on public.market_breadth_snapshots for all to service_role using (true) with check (true);
create policy "Service role manages investor flow oscillator" on public.investor_flow_oscillator_snapshots for all to service_role using (true) with check (true);
create policy "Service role manages asset allocation" on public.asset_allocation_snapshots for all to service_role using (true) with check (true);
create policy "Service role manages turnover intensity" on public.turnover_intensity_snapshots for all to service_role using (true) with check (true);
create policy "Service role manages market sentiment inputs" on public.market_sentiment_inputs for all to service_role using (true) with check (true);
create policy "Service role manages market sentiment" on public.market_sentiment_snapshots for all to service_role using (true) with check (true);

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is not null then
    create trigger trg_market_breadth_snapshots_updated_at before update on public.market_breadth_snapshots
      for each row execute function public.update_updated_at_column();
    create trigger trg_investor_flow_oscillator_snapshots_updated_at before update on public.investor_flow_oscillator_snapshots
      for each row execute function public.update_updated_at_column();
    create trigger trg_asset_allocation_snapshots_updated_at before update on public.asset_allocation_snapshots
      for each row execute function public.update_updated_at_column();
    create trigger trg_turnover_intensity_snapshots_updated_at before update on public.turnover_intensity_snapshots
      for each row execute function public.update_updated_at_column();
    create trigger trg_market_sentiment_inputs_updated_at before update on public.market_sentiment_inputs
      for each row execute function public.update_updated_at_column();
    create trigger trg_market_sentiment_snapshots_updated_at before update on public.market_sentiment_snapshots
      for each row execute function public.update_updated_at_column();
  end if;
end $$;
