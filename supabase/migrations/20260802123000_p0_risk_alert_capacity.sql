-- P0 production safety: atomic position limits, durable alert delivery, and
-- free-tier database capacity/retention gates. This migration never executes
-- destructive retention; cleanup defaults to DRY_RUN and requires confirmation.

-- ---------------------------------------------------------------------------
-- 1. Serialize new trade plans and re-check risk from authoritative DB inputs.
-- ---------------------------------------------------------------------------

create table if not exists public.trade_plan_risk_reservations (
  trade_id uuid primary key references public.trades(id) on delete cascade,
  user_id uuid not null,
  market text not null check (market in ('US', 'KR')),
  ticker text not null check (length(btrim(ticker)) > 0),
  candidate_sector text,
  candidate_sector_source text not null
    check (candidate_sector_source in ('SECURITY_PROFILE', 'YAHOO', 'WORST_CASE')),
  candidate_exposure numeric not null check (candidate_exposure > 0),
  candidate_risk numeric not null check (candidate_risk > 0),
  risk_equity numeric not null check (risk_equity > 0),
  created_at timestamptz not null default now()
);

create index if not exists trade_plan_risk_reservations_account_market_idx
  on public.trade_plan_risk_reservations (user_id, market, trade_id);
create index if not exists trade_plan_risk_reservations_sector_idx
  on public.trade_plan_risk_reservations (user_id, market, candidate_sector);

alter table public.trade_plan_risk_reservations enable row level security;
revoke all on table public.trade_plan_risk_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.trade_plan_risk_reservations to service_role;

drop policy if exists "Service role manages trade plan risk reservations"
  on public.trade_plan_risk_reservations;
create policy "Service role manages trade plan risk reservations"
  on public.trade_plan_risk_reservations
  for all
  to service_role
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

-- The application reads and mutates trades through authenticated server API
-- routes backed by service_role. Keep owner-scoped direct reads for backwards
-- compatibility, but remove every authenticated direct-write path: otherwise a
-- caller could insert a plan without the lock or change reserved economics.
drop policy if exists "Users can manage their own trades" on public.trades;
drop policy if exists "Users can read their own trades" on public.trades;
revoke insert, update, delete on table public.trades from anon, authenticated;
grant select on table public.trades to authenticated;
grant select, insert, update, delete on table public.trades to service_role;

create policy "Users can read their own trades"
  on public.trades
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Existing valid PLANNED rows receive a DB-owned reservation. Any malformed
-- legacy row is deliberately omitted; the RPC count check below then fails
-- closed until that plan is cancelled or repaired.
insert into public.trade_plan_risk_reservations (
  trade_id,
  user_id,
  market,
  ticker,
  candidate_sector,
  candidate_sector_source,
  candidate_exposure,
  candidate_risk,
  risk_equity
)
select
  trade.id,
  trade.user_id,
  trade.market,
  trade.ticker,
  coalesce(
    nullif(btrim(profile.sector), ''),
    nullif(btrim(trade.plan_answers#>>'{serverRiskContext,candidateSector}'), '')
  ),
  case
    when nullif(btrim(profile.sector), '') is not null then 'SECURITY_PROFILE'
    when trade.plan_answers#>>'{serverRiskContext,candidateSectorSource}' = 'YAHOO'
      and nullif(btrim(trade.plan_answers#>>'{serverRiskContext,candidateSector}'), '') is not null
      then 'YAHOO'
    else 'WORST_CASE'
  end,
  trade.entry_price * coalesce(trade.total_shares, trade.position_size),
  greatest(
    trade.planned_risk,
    pg_catalog.abs(trade.entry_price - trade.stoploss_price)
      * coalesce(trade.total_shares, trade.position_size)
  ),
  least(trade.total_equity, settings.total_equity)
from public.trades as trade
join public.portfolio_settings as settings
  on settings.market = trade.market
left join public.security_profiles as profile
  on pg_catalog.upper(profile.ticker) = pg_catalog.upper(trade.ticker)
where trade.status = 'PLANNED'
  and trade.user_id is not null
  and trade.market in ('US', 'KR')
  and trade.entry_price > 0
  and trade.stoploss_price > 0
  and coalesce(trade.total_shares, trade.position_size) > 0
  and trade.planned_risk > 0
  and trade.total_equity > 0
  and settings.total_equity > 0
on conflict (trade_id) do nothing;

comment on table public.trade_plan_risk_reservations is
  'DB-owned economics and sector provenance used to serialize PLANNED portfolio risk.';

create or replace function public.create_trade_plan_with_position_limit(
  p_user_id uuid,
  p_market text,
  p_max_positions integer,
  p_candidate_sector text,
  p_candidate_sector_source text,
  p_max_single_trade_risk_pct numeric,
  p_max_portfolio_heat_pct numeric,
  p_max_sector_risk_pct numeric,
  p_trade jsonb
)
returns setof public.trades
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_invalid integer;
  v_active_open_risk numeric;
  v_candidate_exposure numeric;
  v_candidate_risk numeric;
  v_candidate_sector text;
  v_current_positions integer;
  v_existing_sector_risk numeric;
  v_inserted public.trades%rowtype;
  v_payload public.trades%rowtype;
  v_planned_count integer;
  v_planned_open_risk numeric;
  v_profile_market text;
  v_profile_sector text;
  v_reservation_count integer;
  v_risk_equity numeric;
  v_settings_equity numeric;
  v_snapshot_sector text;
  v_snapshot_sector_source text;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'MTN_SERVICE_ROLE_REQUIRED';
  end if;
  if p_user_id is null or p_market not in ('US', 'KR') then
    raise exception using errcode = '22023', message = 'MTN_INVALID_POSITION_CONTEXT';
  end if;
  if p_max_positions is null or p_max_positions < 1 or p_max_positions > 100 then
    raise exception using errcode = '22023', message = 'MTN_INVALID_POSITION_LIMIT';
  end if;
  if jsonb_typeof(p_trade) <> 'object' then
    raise exception using errcode = '22023', message = 'MTN_INVALID_TRADE_PAYLOAD';
  end if;
  if p_max_single_trade_risk_pct is null
    or p_max_single_trade_risk_pct <= 0
    or p_max_single_trade_risk_pct > 0.02
    or p_max_portfolio_heat_pct is null
    or p_max_portfolio_heat_pct <= 0
    or p_max_portfolio_heat_pct > (case when p_market = 'KR' then 0.05 else 0.06 end)
    or p_max_sector_risk_pct is null
    or p_max_sector_risk_pct <= 0
    or p_max_sector_risk_pct > 0.03
  then
    raise exception using errcode = '22023', message = 'MTN_INVALID_RISK_POLICY_CEILING';
  end if;

  select *
    into v_payload
  from pg_catalog.jsonb_populate_record(null::public.trades, p_trade);

  if v_payload.user_id is distinct from p_user_id
    or v_payload.market is distinct from p_market
    or v_payload.status is distinct from 'PLANNED'
    or v_payload.plan_answers#>>'{serverRiskContext,lossWindowMode}' is distinct from 'ROLLING_24H_7D'
  then
    raise exception using errcode = '22023', message = 'MTN_UNVERIFIED_TRADE_PLAN';
  end if;
  if pg_catalog.jsonb_typeof(v_payload.risk_policy_snapshot) is distinct from 'object'
    or pg_catalog.jsonb_typeof(v_payload.risk_policy_snapshot->'maxSingleTradeRiskPct') is distinct from 'number'
    or pg_catalog.jsonb_typeof(v_payload.risk_policy_snapshot->'maxPortfolioHeatPct') is distinct from 'number'
    or pg_catalog.jsonb_typeof(v_payload.risk_policy_snapshot->'maxSectorRiskPct') is distinct from 'number'
    or pg_catalog.jsonb_typeof(v_payload.risk_policy_snapshot->'maxPositions') is distinct from 'number'
  then
    raise exception using errcode = '22023', message = 'MTN_RISK_POLICY_SNAPSHOT_MISMATCH';
  end if;
  if v_payload.risk_policy_snapshot->>'market' is distinct from p_market
    or (v_payload.risk_policy_snapshot->>'maxSingleTradeRiskPct')::numeric
      is distinct from p_max_single_trade_risk_pct
    or (v_payload.risk_policy_snapshot->>'maxPortfolioHeatPct')::numeric
      is distinct from p_max_portfolio_heat_pct
    or (v_payload.risk_policy_snapshot->>'maxSectorRiskPct')::numeric
      is distinct from p_max_sector_risk_pct
    or (v_payload.risk_policy_snapshot->>'maxPositions')::integer
      is distinct from p_max_positions
  then
    raise exception using errcode = '22023', message = 'MTN_RISK_POLICY_SNAPSHOT_MISMATCH';
  end if;
  if v_payload.ticker is null
    or btrim(v_payload.ticker) = ''
    or (p_market = 'KR' and btrim(v_payload.ticker) !~ '^[0-9]{6}$')
    or (p_market = 'US' and btrim(v_payload.ticker) ~ '^[0-9]{6}$')
  then
    raise exception using errcode = '22023', message = 'MTN_INVALID_TRADE_MARKET';
  end if;
  if v_payload.entry_price is null
    or v_payload.entry_price <= 0
    or v_payload.stoploss_price is null
    or v_payload.stoploss_price <= 0
    or coalesce(v_payload.total_shares, v_payload.position_size) is null
    or coalesce(v_payload.total_shares, v_payload.position_size) <= 0
    or (v_payload.total_shares is not null and v_payload.position_size is not null
      and v_payload.total_shares is distinct from v_payload.position_size)
    or v_payload.planned_risk is null
    or v_payload.planned_risk <= 0
    or v_payload.direction is null
    or (v_payload.direction = 'LONG' and v_payload.stoploss_price >= v_payload.entry_price)
    or (v_payload.direction = 'SHORT' and v_payload.stoploss_price <= v_payload.entry_price)
    or v_payload.direction not in ('LONG', 'SHORT')
  then
    raise exception using errcode = '22023', message = 'MTN_INVALID_CANDIDATE_ECONOMICS';
  end if;

  v_candidate_exposure := v_payload.entry_price * coalesce(v_payload.total_shares, v_payload.position_size);
  v_candidate_risk := greatest(
    v_payload.planned_risk,
    pg_catalog.abs(v_payload.entry_price - v_payload.stoploss_price)
      * coalesce(v_payload.total_shares, v_payload.position_size)
  );

  -- Lock before reading any mutable portfolio state. The row locks use the
  -- same trade-before-settings order as the execution mutation RPC, so fills,
  -- cancellations, stop amendments, and capital changes cannot race this
  -- transaction's aggregate checks.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_user_id::text),
    pg_catalog.hashtext(p_market)
  );
  perform 1
  from public.trades as trade
  where trade.user_id = p_user_id
    and trade.market = p_market
    and trade.status in ('PLANNED', 'ACTIVE')
  for share;
  perform 1
  from public.trade_plan_risk_reservations as reservation
  where reservation.user_id = p_user_id
    and reservation.market = p_market
  for share;
  perform 1
  from public.security_profiles as profile
  where exists (
    select 1
    from public.trades as trade
    where trade.user_id = p_user_id
      and trade.market = p_market
      and trade.status in ('PLANNED', 'ACTIVE')
      and pg_catalog.upper(trade.ticker) = pg_catalog.upper(profile.ticker)
  )
  for share;

  select profile.market, nullif(btrim(profile.sector), '')
    into v_profile_market, v_profile_sector
  from public.security_profiles as profile
  where pg_catalog.upper(profile.ticker) = pg_catalog.upper(v_payload.ticker)
  limit 1
  for share;

  if v_profile_market is not null and v_profile_market is distinct from p_market then
    raise exception using errcode = '22023', message = 'MTN_SECURITY_PROFILE_MARKET_MISMATCH';
  end if;
  if p_candidate_sector_source is null
    or p_candidate_sector_source not in ('SECURITY_PROFILE', 'YAHOO', 'WORST_CASE')
  then
    raise exception using errcode = '22023', message = 'MTN_INVALID_CANDIDATE_SECTOR_SOURCE';
  end if;

  v_candidate_sector := coalesce(v_profile_sector, nullif(btrim(p_candidate_sector), ''));
  if v_profile_sector is not null and (
      p_candidate_sector_source <> 'SECURITY_PROFILE'
      or nullif(btrim(p_candidate_sector), '') is distinct from v_profile_sector
    )
  then
    raise exception using errcode = '22023', message = 'MTN_CANDIDATE_SECTOR_MISMATCH';
  end if;
  if v_profile_sector is null and (
      p_candidate_sector_source = 'SECURITY_PROFILE'
      or (p_candidate_sector_source = 'YAHOO' and nullif(btrim(p_candidate_sector), '') is null)
      or (p_candidate_sector_source = 'WORST_CASE' and nullif(btrim(p_candidate_sector), '') is not null)
    )
  then
    raise exception using errcode = '22023', message = 'MTN_INVALID_CANDIDATE_SECTOR_PROVENANCE';
  end if;

  v_snapshot_sector := nullif(btrim(v_payload.plan_answers#>>'{serverRiskContext,candidateSector}'), '');
  v_snapshot_sector_source := v_payload.plan_answers#>>'{serverRiskContext,candidateSectorSource}';
  if v_snapshot_sector is distinct from nullif(btrim(p_candidate_sector), '')
    or v_snapshot_sector_source is distinct from p_candidate_sector_source
  then
    raise exception using errcode = '22023', message = 'MTN_CANDIDATE_SECTOR_SNAPSHOT_MISMATCH';
  end if;

  select settings.total_equity
    into v_settings_equity
  from public.portfolio_settings as settings
  where settings.market = p_market
  for share;
  if v_settings_equity is null or v_settings_equity <= 0
    or v_payload.total_equity is null or v_payload.total_equity <= 0
  then
    raise exception using errcode = 'P0001', message = 'MTN_CAPITAL_CONTEXT_INCOMPLETE';
  end if;
  v_risk_equity := least(v_settings_equity, v_payload.total_equity);

  select count(*)::integer
    into v_current_positions
  from public.trades as trade
  where trade.user_id = p_user_id
    and trade.market = p_market
    and trade.status in ('PLANNED', 'ACTIVE');

  if v_current_positions >= p_max_positions then
    raise exception using
      errcode = 'P0001',
      message = 'MTN_POSITION_LIMIT_REACHED',
      detail = pg_catalog.format('%s/%s positions already reserved', v_current_positions, p_max_positions);
  end if;

  select
    count(*)::integer,
    count(reservation.trade_id)::integer,
    coalesce(sum(reservation.candidate_risk), 0)
    into v_planned_count, v_reservation_count, v_planned_open_risk
  from public.trades as trade
  left join public.trade_plan_risk_reservations as reservation
    on reservation.trade_id = trade.id
      and reservation.user_id = p_user_id
      and reservation.market = p_market
  where trade.user_id = p_user_id
    and trade.market = p_market
    and trade.status = 'PLANNED';

  if v_planned_count <> v_reservation_count then
    raise exception using errcode = 'P0001', message = 'MTN_PLANNED_RISK_CONTEXT_INCOMPLETE';
  end if;

  with execution_rollup as (
    select
      trade.id as trade_id,
      sum(case when execution.side = 'ENTRY' then execution.shares else -execution.shares end) as net_shares,
      sum(case when execution.side = 'ENTRY' then execution.shares else 0 end) as entry_shares,
      sum(case when execution.side = 'ENTRY' then execution.price * execution.shares else 0 end) as entry_value
    from public.trades as trade
    left join public.trade_executions as execution on execution.trade_id = trade.id
    where trade.user_id = p_user_id
      and trade.market = p_market
      and trade.status = 'ACTIVE'
    group by trade.id
  )
  select
    count(*) filter (
      where rollup.entry_shares is null
        or rollup.entry_shares <= 0
        or rollup.net_shares is null
        or rollup.net_shares <= 0
        or trade.stoploss_price is null
        or trade.stoploss_price <= 0
        or trade.direction not in ('LONG', 'SHORT')
    )::integer,
    coalesce(sum(
      case
        when rollup.entry_shares > 0 and rollup.net_shares > 0 and trade.stoploss_price > 0
          then greatest(
            case when trade.direction = 'LONG'
              then rollup.entry_value / rollup.entry_shares - trade.stoploss_price
              else trade.stoploss_price - rollup.entry_value / rollup.entry_shares
            end,
            0
          ) * rollup.net_shares
        else 0
      end
    ), 0)
    into v_active_invalid, v_active_open_risk
  from public.trades as trade
  left join execution_rollup as rollup on rollup.trade_id = trade.id
  where trade.user_id = p_user_id
    and trade.market = p_market
    and trade.status = 'ACTIVE';

  if v_active_invalid > 0 then
    raise exception using errcode = 'P0001', message = 'MTN_ACTIVE_RISK_CONTEXT_INCOMPLETE';
  end if;
  if v_candidate_risk > v_risk_equity * p_max_single_trade_risk_pct then
    raise exception using errcode = 'P0001', message = 'MTN_SINGLE_TRADE_RISK_LIMIT_REACHED';
  end if;
  if v_active_open_risk + v_planned_open_risk + v_candidate_risk
      > v_risk_equity * p_max_portfolio_heat_pct
  then
    raise exception using errcode = 'P0001', message = 'MTN_PORTFOLIO_HEAT_LIMIT_REACHED';
  end if;

  with execution_rollup as (
    select
      trade.id as trade_id,
      sum(case when execution.side = 'ENTRY' then execution.shares else -execution.shares end) as net_shares,
      sum(case when execution.side = 'ENTRY' then execution.shares else 0 end) as entry_shares,
      sum(case when execution.side = 'ENTRY' then execution.price * execution.shares else 0 end) as entry_value
    from public.trades as trade
    left join public.trade_executions as execution on execution.trade_id = trade.id
    where trade.user_id = p_user_id
      and trade.market = p_market
      and trade.status = 'ACTIVE'
    group by trade.id
  ), position_risks as (
    select
      coalesce(
        pg_catalog.lower(nullif(btrim(profile.sector), '')),
        pg_catalog.lower(nullif(btrim(reservation.candidate_sector), '')),
        '__mtn_unknown__'
      ) as sector_key,
      greatest(
        case when trade.direction = 'LONG'
          then rollup.entry_value / rollup.entry_shares - trade.stoploss_price
          else trade.stoploss_price - rollup.entry_value / rollup.entry_shares
        end,
        0
      ) * rollup.net_shares as open_risk
    from public.trades as trade
    join execution_rollup as rollup on rollup.trade_id = trade.id
    left join public.security_profiles as profile
      on pg_catalog.upper(profile.ticker) = pg_catalog.upper(trade.ticker)
    left join public.trade_plan_risk_reservations as reservation
      on reservation.trade_id = trade.id
    where trade.user_id = p_user_id
      and trade.market = p_market
      and trade.status = 'ACTIVE'

    union all

    select
      coalesce(pg_catalog.lower(nullif(btrim(reservation.candidate_sector), '')), '__mtn_unknown__'),
      reservation.candidate_risk
    from public.trades as trade
    join public.trade_plan_risk_reservations as reservation on reservation.trade_id = trade.id
    where trade.user_id = p_user_id
      and trade.market = p_market
      and trade.status = 'PLANNED'
  ), sector_totals as (
    select sector_key, sum(open_risk) as open_risk
    from position_risks
    group by sector_key
  )
  select
    case
      when v_candidate_sector is null then
        coalesce(max(open_risk) filter (where sector_key <> '__mtn_unknown__'), 0)
          + coalesce(max(open_risk) filter (where sector_key = '__mtn_unknown__'), 0)
      else
        coalesce(max(open_risk) filter (
          where sector_key = pg_catalog.lower(v_candidate_sector)
        ), 0)
          + coalesce(max(open_risk) filter (where sector_key = '__mtn_unknown__'), 0)
    end
    into v_existing_sector_risk
  from sector_totals;

  if v_existing_sector_risk + v_candidate_risk > v_risk_equity * p_max_sector_risk_pct then
    raise exception using errcode = 'P0001', message = 'MTN_SECTOR_RISK_LIMIT_REACHED';
  end if;

  insert into public.trades (
    user_id,
    ticker,
    market,
    direction,
    plan_mode,
    status,
    chk_sepa,
    chk_market,
    chk_risk,
    chk_entry,
    chk_stoploss,
    chk_exit,
    chk_psychology,
    sepa_evidence,
    vcp_analysis,
    total_equity,
    planned_risk,
    risk_percent,
    atr_value,
    entry_price,
    stoploss_price,
    position_size,
    total_shares,
    entry_targets,
    trailing_stops,
    risk_strategy,
    requested_risk_strategy,
    risk_gate,
    risk_policy_snapshot,
    chart_plan,
    plan_answers,
    strategy_template_id,
    setup_tags,
    mistake_tags,
    plan_note,
    invalidation_note,
    review_note,
    review_action,
    entry_snapshot,
    current_plan_snapshot,
    updated_at
  ) values (
    p_user_id,
    v_payload.ticker,
    p_market,
    v_payload.direction,
    v_payload.plan_mode,
    'PLANNED',
    v_payload.chk_sepa,
    v_payload.chk_market,
    v_payload.chk_risk,
    v_payload.chk_entry,
    v_payload.chk_stoploss,
    v_payload.chk_exit,
    v_payload.chk_psychology,
    v_payload.sepa_evidence,
    v_payload.vcp_analysis,
    v_risk_equity,
    v_candidate_risk,
    pg_catalog.round(v_candidate_risk / v_risk_equity, 6),
    v_payload.atr_value,
    v_payload.entry_price,
    v_payload.stoploss_price,
    v_payload.position_size,
    v_payload.total_shares,
    v_payload.entry_targets,
    v_payload.trailing_stops,
    v_payload.risk_strategy,
    v_payload.requested_risk_strategy,
    v_payload.risk_gate,
    v_payload.risk_policy_snapshot,
    v_payload.chart_plan,
    v_payload.plan_answers,
    v_payload.strategy_template_id,
    coalesce(v_payload.setup_tags, '{}'::text[]),
    coalesce(v_payload.mistake_tags, '{}'::text[]),
    v_payload.plan_note,
    v_payload.invalidation_note,
    v_payload.review_note,
    v_payload.review_action,
    v_payload.entry_snapshot,
    v_payload.current_plan_snapshot,
    coalesce(v_payload.updated_at, pg_catalog.clock_timestamp())
  )
  returning * into v_inserted;

  insert into public.trade_plan_risk_reservations (
    trade_id,
    user_id,
    market,
    ticker,
    candidate_sector,
    candidate_sector_source,
    candidate_exposure,
    candidate_risk,
    risk_equity
  ) values (
    v_inserted.id,
    p_user_id,
    p_market,
    v_payload.ticker,
    v_candidate_sector,
    p_candidate_sector_source,
    v_candidate_exposure,
    v_candidate_risk,
    v_risk_equity
  );

  return next v_inserted;
end;
$$;

revoke all on function public.create_trade_plan_with_position_limit(
  uuid, text, integer, text, text, numeric, numeric, numeric, jsonb
)
  from public, anon, authenticated;
grant execute on function public.create_trade_plan_with_position_limit(
  uuid, text, integer, text, text, numeric, numeric, numeric, jsonb
)
  to service_role;

comment on function public.create_trade_plan_with_position_limit(
  uuid, text, integer, text, text, numeric, numeric, numeric, jsonb
) is
  'Under one account/market lock, derives candidate/active risk, verifies DB-owned planned reservations against hard policy ceilings, and inserts one plan.';

-- ---------------------------------------------------------------------------
-- 2. Durable alert creation, delivery, retry, and acknowledgement state.
-- ---------------------------------------------------------------------------

alter table public.alert_events
  add column if not exists delivery_status text,
  add column if not exists delivery_attempts integer not null default 0,
  add column if not exists last_delivery_attempt_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_error text,
  add column if not exists delivery_batch_key uuid,
  add column if not exists updated_at timestamptz not null default now();

-- Legacy events were already in-app records and must never be unexpectedly
-- replayed to Telegram after this migration.
update public.alert_events
set delivery_status = 'SKIPPED'
where delivery_status is null;

alter table public.alert_events
  alter column delivery_status set default 'PENDING',
  alter column delivery_status set not null,
  drop constraint if exists alert_events_delivery_status_check,
  add constraint alert_events_delivery_status_check
    check (delivery_status in ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED'));

create index if not exists alert_events_delivery_pending_idx
  on public.alert_events (delivery_status, occurred_at, id)
  where delivery_status in ('PENDING', 'SENDING', 'FAILED');
create index if not exists alert_events_delivery_batch_idx
  on public.alert_events (delivery_batch_key, id)
  where delivery_batch_key is not null;

comment on column public.alert_events.read_at is
  'Durable user acknowledgement timestamp set by the authenticated alert-events API.';
comment on column public.alert_events.delivery_status is
  'Aggregate Telegram delivery state; IN_APP-only and legacy events use SKIPPED.';

create table if not exists public.alert_delivery_receipts (
  batch_key uuid not null,
  recipient_key text not null,
  event_ids uuid[] not null check (cardinality(event_ids) > 0),
  message_hash text not null,
  status text not null check (status in ('SENDING', 'SENT', 'FAILED')),
  attempts integer not null default 1 check (attempts > 0),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (batch_key, recipient_key)
);

create index if not exists alert_delivery_receipts_status_updated_idx
  on public.alert_delivery_receipts (status, updated_at);

alter table public.alert_delivery_receipts enable row level security;
revoke all on table public.alert_delivery_receipts from public, anon, authenticated;
grant select, insert, update, delete on table public.alert_delivery_receipts to service_role;

drop policy if exists "Service role manages alert delivery receipts" on public.alert_delivery_receipts;
create policy "Service role manages alert delivery receipts"
  on public.alert_delivery_receipts
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.claim_alert_delivery_batch(
  p_limit integer default 100
)
returns table (
  id uuid,
  title text,
  message text,
  event_type text,
  ticker text,
  severity text,
  delivery_batch_key uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_key uuid;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'MTN_SERVICE_ROLE_REQUIRED';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception using errcode = '22023', message = 'MTN_INVALID_ALERT_BATCH_LIMIT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('public.claim_alert_delivery_batch')
  );

  -- Keep a live batch intact. A crashed SENDING batch becomes retryable after
  -- ten minutes and retains the same key, so recipient receipts stay idempotent.
  if exists (
    select 1
    from public.alert_events as event
    where event.delivery_status = 'SENDING'
      and event.last_delivery_attempt_at >= pg_catalog.clock_timestamp() - interval '10 minutes'
  ) then
    return;
  end if;

  select event.delivery_batch_key
    into v_batch_key
  from public.alert_events as event
  where event.delivery_batch_key is not null
    and (
      event.delivery_status = 'FAILED'
      or (
        event.delivery_status = 'SENDING'
        and event.last_delivery_attempt_at < pg_catalog.clock_timestamp() - interval '10 minutes'
      )
    )
  order by event.occurred_at, event.id
  limit 1;

  if v_batch_key is null then
    v_batch_key := gen_random_uuid();
    update public.alert_events as event
    set delivery_status = 'SENDING',
        delivery_attempts = event.delivery_attempts + 1,
        last_delivery_attempt_at = pg_catalog.clock_timestamp(),
        delivery_error = null,
        delivery_batch_key = v_batch_key,
        updated_at = pg_catalog.clock_timestamp()
    where event.id in (
      select pending.id
      from public.alert_events as pending
      where pending.delivery_status = 'PENDING'
      order by pending.occurred_at, pending.id
      limit p_limit
      for update skip locked
    );
  else
    update public.alert_events as event
    set delivery_status = 'SENDING',
        delivery_attempts = event.delivery_attempts + 1,
        last_delivery_attempt_at = pg_catalog.clock_timestamp(),
        delivery_error = null,
        updated_at = pg_catalog.clock_timestamp()
    where event.delivery_batch_key = v_batch_key
      and (
        event.delivery_status = 'FAILED'
        or (
          event.delivery_status = 'SENDING'
          and event.last_delivery_attempt_at < pg_catalog.clock_timestamp() - interval '10 minutes'
        )
      );
  end if;

  return query
  select
    event.id,
    event.title,
    event.message,
    event.event_type,
    event.ticker,
    event.severity,
    event.delivery_batch_key
  from public.alert_events as event
  where event.delivery_batch_key = v_batch_key
    and event.delivery_status = 'SENDING'
  order by event.occurred_at, event.id;
end;
$$;

create or replace function public.claim_alert_delivery_receipt(
  p_batch_key uuid,
  p_recipient_key text,
  p_event_ids uuid[],
  p_message_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.alert_delivery_receipts%rowtype;
  v_updated integer := 0;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'MTN_SERVICE_ROLE_REQUIRED';
  end if;
  if p_batch_key is null
    or nullif(btrim(p_recipient_key), '') is null
    or cardinality(p_event_ids) < 1
    or nullif(btrim(p_message_hash), '') is null
  then
    raise exception using errcode = '22023', message = 'MTN_INVALID_ALERT_RECEIPT';
  end if;

  insert into public.alert_delivery_receipts (
    batch_key,
    recipient_key,
    event_ids,
    message_hash,
    status
  ) values (
    p_batch_key,
    p_recipient_key,
    p_event_ids,
    p_message_hash,
    'SENDING'
  )
  on conflict (batch_key, recipient_key) do nothing;

  if found then
    return true;
  end if;

  select *
    into v_receipt
  from public.alert_delivery_receipts as receipt
  where receipt.batch_key = p_batch_key
    and receipt.recipient_key = p_recipient_key
  for update;

  if v_receipt.message_hash is distinct from p_message_hash
    or v_receipt.event_ids is distinct from p_event_ids
  then
    raise exception using errcode = 'P0001', message = 'MTN_ALERT_RECEIPT_CONFLICT';
  end if;
  if v_receipt.status = 'SENT' then
    return false;
  end if;

  update public.alert_delivery_receipts as receipt
  set status = 'SENDING',
      attempts = receipt.attempts + 1,
      last_error = null,
      updated_at = pg_catalog.clock_timestamp()
  where receipt.batch_key = p_batch_key
    and receipt.recipient_key = p_recipient_key
    and (
      receipt.status = 'FAILED'
      or (
        receipt.status = 'SENDING'
        and receipt.updated_at < pg_catalog.clock_timestamp() - interval '10 minutes'
      )
    );
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.claim_alert_delivery_batch(integer)
  from public, anon, authenticated;
revoke all on function public.claim_alert_delivery_receipt(uuid, text, uuid[], text)
  from public, anon, authenticated;
grant execute on function public.claim_alert_delivery_batch(integer) to service_role;
grant execute on function public.claim_alert_delivery_receipt(uuid, text, uuid[], text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. 250/350/400 MB capacity gates and explicit, dry-run retention policy.
-- ---------------------------------------------------------------------------

create schema if not exists mtn_internal;
revoke all on schema mtn_internal from public, anon, authenticated;
grant usage on schema mtn_internal to service_role;

create table if not exists public.database_capacity_snapshots (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  database_bytes bigint not null check (database_bytes >= 0),
  database_mb numeric(12, 2) not null check (database_mb >= 0),
  capacity_level text not null
    check (capacity_level in ('NORMAL', 'WATCH_250', 'WARNING_350', 'BLOCK_NONCRITICAL')),
  threshold_mb integer not null check (threshold_mb in (250, 350, 400)),
  details jsonb not null default '{}'::jsonb
);

create index if not exists database_capacity_snapshots_captured_idx
  on public.database_capacity_snapshots (captured_at desc);
alter table public.database_capacity_snapshots enable row level security;
revoke all on table public.database_capacity_snapshots from public, anon, authenticated;
revoke all on sequence public.database_capacity_snapshots_id_seq from public, anon, authenticated;
grant select, insert on table public.database_capacity_snapshots to service_role;
grant usage, select on sequence public.database_capacity_snapshots_id_seq to service_role;

drop policy if exists "Service role manages database capacity snapshots" on public.database_capacity_snapshots;
create policy "Service role manages database capacity snapshots"
  on public.database_capacity_snapshots
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.data_retention_policies (
  policy_name text primary key check (policy_name ~ '^[a-z0-9_]+$'),
  target_table text not null check (target_table ~ '^public\.[a-z0-9_]+$'),
  timestamp_column text not null check (timestamp_column ~ '^[a-z0-9_]+$'),
  normal_days integer not null check (normal_days > 0),
  watch_days integer not null check (watch_days > 0 and watch_days <= normal_days),
  warning_days integer not null check (warning_days > 0 and warning_days <= watch_days),
  blocked_days integer not null check (blocked_days > 0 and blocked_days <= warning_days),
  enabled boolean not null default true,
  notes text,
  updated_at timestamptz not null default now(),
  unique (target_table)
);

alter table public.data_retention_policies enable row level security;
revoke all on table public.data_retention_policies from public, anon, authenticated;
grant select on table public.data_retention_policies to service_role;

drop policy if exists "Service role reads data retention policies" on public.data_retention_policies;
create policy "Service role reads data retention policies"
  on public.data_retention_policies
  for select
  to service_role
  using (true);

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
values
  ('daily_screener_candidates', 'public.daily_screener_candidates', 'created_at', 90, 60, 30, 14, 'High-volume reproducible screener rows.', now()),
  ('alert_events', 'public.alert_events', 'occurred_at', 365, 180, 90, 30, 'User-facing alerts retain a longer acknowledgement history.', now()),
  ('alert_delivery_receipts', 'public.alert_delivery_receipts', 'updated_at', 90, 60, 30, 14, 'Transport idempotency receipts after event delivery.', now()),
  ('cron_http_runs', 'public.cron_http_runs', 'requested_at', 90, 60, 30, 14, 'Scheduler diagnostics.', now()),
  ('database_capacity_snapshots', 'public.database_capacity_snapshots', 'captured_at', 180, 90, 60, 30, 'Small daily storage trend series.', now()),
  ('recommendation_market_prices', 'public.recommendation_market_prices', 'trade_date', 730, 365, 180, 90, 'Reproducible price observations; keep longer than raw screen candidates.', now()),
  ('kr_investor_flow_daily', 'public.kr_investor_flow_daily', 'trade_date', 730, 365, 180, 90, 'Re-fetchable provider observations.', now())
on conflict (policy_name) do update
set target_table = excluded.target_table,
    timestamp_column = excluded.timestamp_column,
    normal_days = excluded.normal_days,
    watch_days = excluded.watch_days,
    warning_days = excluded.warning_days,
    blocked_days = excluded.blocked_days,
    notes = excluded.notes,
    updated_at = excluded.updated_at;

create or replace function mtn_internal.database_capacity_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bytes bigint := pg_catalog.pg_database_size(pg_catalog.current_database());
  v_mb numeric;
  v_level text;
  v_threshold integer;
begin
  v_mb := pg_catalog.round(v_bytes::numeric / 1048576, 2);
  if v_mb >= 400 then
    v_level := 'BLOCK_NONCRITICAL';
    v_threshold := 400;
  elsif v_mb >= 350 then
    v_level := 'WARNING_350';
    v_threshold := 350;
  elsif v_mb >= 250 then
    v_level := 'WATCH_250';
    v_threshold := 250;
  else
    v_level := 'NORMAL';
    v_threshold := 250;
  end if;

  return pg_catalog.jsonb_build_object(
    'database_bytes', v_bytes,
    'database_mb', v_mb,
    'capacity_level', v_level,
    'threshold_mb', v_threshold,
    'next_threshold_mb', case
      when v_mb < 250 then 250
      when v_mb < 350 then 350
      when v_mb < 400 then 400
      else null
    end,
    'noncritical_writes_allowed', v_mb < 400,
    'measured_at', pg_catalog.clock_timestamp()
  );
end;
$$;

create or replace function mtn_internal.capture_database_capacity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status jsonb := mtn_internal.database_capacity_status();
begin
  insert into public.database_capacity_snapshots (
    database_bytes,
    database_mb,
    capacity_level,
    threshold_mb,
    details
  ) values (
    (v_status->>'database_bytes')::bigint,
    (v_status->>'database_mb')::numeric,
    v_status->>'capacity_level',
    (v_status->>'threshold_mb')::integer,
    v_status
  );
  return v_status;
end;
$$;

create or replace function mtn_internal.enforce_noncritical_capacity_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status jsonb := mtn_internal.database_capacity_status();
  v_mb numeric := (v_status->>'database_mb')::numeric;
begin
  if v_mb >= 400 then
    raise exception using
      errcode = 'P0001',
      message = 'MTN_NONCRITICAL_WRITE_BLOCKED',
      detail = pg_catalog.format('%s is blocked at %s MB (400 MB gate).', tg_table_name, v_mb),
      hint = 'Run retention in DRY_RUN, review candidates, then explicitly confirm cleanup.';
  elsif v_mb >= 350 then
    raise warning 'MTN database capacity WARNING_350: % MB before write to %.', v_mb, tg_table_name;
  elsif v_mb >= 250 then
    raise notice 'MTN database capacity WATCH_250: % MB before write to %.', v_mb, tg_table_name;
  end if;
  return null;
end;
$$;

create or replace function mtn_internal.apply_retention_policies(
  p_dry_run boolean default true,
  p_confirmation text default null
)
returns table (
  policy_name text,
  target_table text,
  capacity_level text,
  retention_days integer,
  cutoff timestamptz,
  candidate_rows bigint,
  deleted_rows bigint,
  dry_run boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status jsonb := mtn_internal.database_capacity_status();
  v_policy record;
  v_schema text;
  v_table text;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'MTN_SERVICE_ROLE_REQUIRED';
  end if;
  if not p_dry_run and p_confirmation is distinct from 'APPLY_RETENTION' then
    raise exception using
      errcode = '22023',
      message = 'MTN_RETENTION_CONFIRMATION_REQUIRED',
      hint = 'Pass p_confirmation = APPLY_RETENTION only after reviewing DRY_RUN output.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('mtn_internal.apply_retention_policies')
  );

  for v_policy in
    select policy.*
    from public.data_retention_policies as policy
    where policy.enabled
    order by policy.policy_name
  loop
    v_schema := pg_catalog.split_part(v_policy.target_table, '.', 1);
    v_table := pg_catalog.split_part(v_policy.target_table, '.', 2);
    if pg_catalog.to_regclass(v_policy.target_table) is null then
      continue;
    end if;
    if not exists (
      select 1
      from pg_catalog.pg_attribute as attribute
      where attribute.attrelid = pg_catalog.to_regclass(v_policy.target_table)
        and attribute.attname = v_policy.timestamp_column
        and attribute.attnum > 0
        and not attribute.attisdropped
    ) then
      raise exception 'Retention column %.% does not exist.', v_policy.target_table, v_policy.timestamp_column;
    end if;

    policy_name := v_policy.policy_name;
    target_table := v_policy.target_table;
    capacity_level := v_status->>'capacity_level';
    retention_days := case capacity_level
      when 'BLOCK_NONCRITICAL' then v_policy.blocked_days
      when 'WARNING_350' then v_policy.warning_days
      when 'WATCH_250' then v_policy.watch_days
      else v_policy.normal_days
    end;
    cutoff := pg_catalog.clock_timestamp() - pg_catalog.make_interval(days => retention_days);
    dry_run := p_dry_run;
    deleted_rows := 0;

    execute pg_catalog.format(
      'select count(*) from %I.%I where %I < $1',
      v_schema,
      v_table,
      v_policy.timestamp_column
    )
    into candidate_rows
    using cutoff;

    if not p_dry_run and candidate_rows > 0 then
      execute pg_catalog.format(
        'delete from %I.%I where %I < $1',
        v_schema,
        v_table,
        v_policy.timestamp_column
      )
      using cutoff;
      get diagnostics deleted_rows = row_count;
    end if;

    return next;
  end loop;
end;
$$;

revoke all on function mtn_internal.database_capacity_status() from public, anon, authenticated;
revoke all on function mtn_internal.capture_database_capacity() from public, anon, authenticated;
revoke all on function mtn_internal.apply_retention_policies(boolean, text) from public, anon, authenticated;
grant execute on function mtn_internal.database_capacity_status() to service_role;
grant execute on function mtn_internal.capture_database_capacity() to service_role;
grant execute on function mtn_internal.apply_retention_policies(boolean, text) to service_role;

comment on function mtn_internal.apply_retention_policies(boolean, text) is
  'Lists retention candidates by default; deletion requires p_dry_run=false plus APPLY_RETENTION confirmation.';

-- Block only reproducible/noncritical heavy datasets at 400 MB. Core trades,
-- executions, performance, settings, and alert creation remain writable.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'daily_screener_candidates',
    'stock_metrics',
    'kr_investor_flow_daily',
    'recommendation_market_prices',
    'market_intelligence_events'
  ]
  loop
    if pg_catalog.to_regclass('public.' || v_table) is not null then
      execute pg_catalog.format(
        'drop trigger if exists trg_mtn_noncritical_capacity_gate on public.%I',
        v_table
      );
      execute pg_catalog.format(
        'create trigger trg_mtn_noncritical_capacity_gate before insert or update on public.%I for each statement execute function mtn_internal.enforce_noncritical_capacity_gate()',
        v_table
      );
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Register the alert path in the existing free Supabase scheduler.
-- ---------------------------------------------------------------------------

insert into public.cron_job_definitions (
  job_name,
  path,
  schedule,
  slot_minutes,
  expected_delay_seconds,
  enabled,
  updated_at
)
values (
  'mtn-check-alerts',
  '/api/cron/check-alerts',
  '*/30 * * * *',
  30,
  2700,
  true,
  pg_catalog.clock_timestamp()
)
on conflict (job_name) do update
set path = excluded.path,
    schedule = excluded.schedule,
    slot_minutes = excluded.slot_minutes,
    expected_delay_seconds = excluded.expected_delay_seconds,
    enabled = excluded.enabled,
    updated_at = excluded.updated_at;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname in ('mtn-check-alerts', 'mtn-database-capacity-monitor')
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'mtn-check-alerts',
  '*/30 * * * *',
  $cron$
    select mtn_internal.invoke_cron(
      'mtn-check-alerts',
      '/api/cron/check-alerts',
      30
    );
  $cron$
);

select cron.schedule(
  'mtn-database-capacity-monitor',
  '13 03 * * *',
  $cron$select mtn_internal.capture_database_capacity();$cron$
);

-- Deliberately no call to apply_retention_policies(false, ...). Operators first
-- inspect: select * from mtn_internal.apply_retention_policies(); -- DRY_RUN
