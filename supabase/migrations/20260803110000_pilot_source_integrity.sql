-- Conditional-90 pilot source integrity.
--
-- The pilot ledger is prospective and append-only, but the canonical trade
-- rows that it references were historically mutable.  These guards bind the
-- authorization to the actual fills and freeze the canonical source after an
-- independently VERIFIED outcome has been recorded.

create or replace function public.validate_pilot_execution_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trade_row public.trades%rowtype;
  planned_shares numeric;
  planned_stop_risk numeric;
  latest_score_evaluated_at timestamptz;
  latest_score integer;
  latest_score_status text;
begin
  select * into trade_row
  from public.trades as trade
  where trade.id = new.trade_id
  for share;

  planned_shares := coalesce(trade_row.total_shares, trade_row.position_size);
  if trade_row.entry_price is null or trade_row.entry_price <= 0
    or trade_row.stoploss_price is null or trade_row.stoploss_price <= 0
    or planned_shares is null or planned_shares <= 0
    or trade_row.direction not in ('LONG', 'SHORT')
    or (trade_row.direction = 'LONG' and trade_row.stoploss_price >= trade_row.entry_price)
    or (trade_row.direction = 'SHORT' and trade_row.stoploss_price <= trade_row.entry_price) then
    raise exception using
      errcode = '23514',
      message = 'MTN_PILOT_EXECUTION_RISK_INCOMPLETE';
  end if;

  planned_stop_risk := abs(trade_row.entry_price - trade_row.stoploss_price) * planned_shares;
  if trade_row.planned_risk is null
    or planned_stop_risk > trade_row.planned_risk + 0.000001 then
    raise exception using
      errcode = '23514',
      message = 'MTN_PILOT_PLAN_RISK_UNDERSTATED';
  end if;

  if new.risk_policy_hash is distinct from public.assurance_stable_jsonb_hash(new.risk_policy_snapshot)
    or not new.risk_policy_snapshot @> '{
      "riskUnit":{"basis":"ACCOUNT_EQUITY","oneRPercent":1}
    }'::jsonb then
    raise exception using
      errcode = '23514',
      message = 'MTN_PILOT_RISK_POLICY_SNAPSHOT_INVALID';
  end if;

  select snapshot.awarded_score, snapshot.status, snapshot.evaluated_at
    into latest_score, latest_score_status, latest_score_evaluated_at
  from public.assurance_score_snapshots as snapshot
  order by snapshot.evaluated_at desc, snapshot.created_at desc, snapshot.id desc
  limit 1;
  if latest_score is null or latest_score < 85
    or latest_score_status not in ('SMALL_PILOT_REVIEW', 'ELIGIBLE_FOR_HUMAN_REVIEW')
    or latest_score_evaluated_at > new.linked_at
    or latest_score_evaluated_at < new.linked_at - interval '24 hours' then
    raise exception using
      errcode = '23514',
      message = 'MTN_PILOT_ASSURANCE_SNAPSHOT_STALE';
  end if;

  return new;
end;
$$;

drop trigger if exists recommendation_pilot_execution_authorization_validate
  on public.recommendation_pilot_links;
create trigger recommendation_pilot_execution_authorization_validate
  before insert on public.recommendation_pilot_links
  for each row execute function public.validate_pilot_execution_authorization();

create or replace function public.guard_pilot_trade_execution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pilot_link public.recommendation_pilot_links%rowtype;
  trade_row public.trades%rowtype;
  target_trade_id uuid;
  entry_shares numeric := 0;
  entry_value numeric := 0;
  planned_shares numeric;
  weighted_entry numeric;
  per_share_risk numeric;
  executed_risk numeric;
  authorized_risk numeric;
begin
  target_trade_id := case when tg_op = 'DELETE' then old.trade_id else new.trade_id end;

  -- Serialize both RPC and direct service-role mutations on the trade row.  Do
  -- not lock the immutable link row: the outcome validator locks link -> trade,
  -- so doing trade -> link here would create a deadlock cycle.
  select * into trade_row
  from public.trades as trade
  where trade.id = target_trade_id
  for update;

  select * into pilot_link
  from public.recommendation_pilot_links as link
  where link.trade_id = target_trade_id;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if exists (
    select 1
    from public.recommendation_pilot_outcomes as outcome
    where outcome.pilot_link_id = pilot_link.id
      and outcome.evidence_status = 'VERIFIED'
  ) then
    raise exception using
      errcode = '55000',
      message = 'MTN_VERIFIED_PILOT_SOURCE_IMMUTABLE';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.trade_id is distinct from target_trade_id then
    raise exception using
      errcode = '23514',
      message = 'MTN_PILOT_EXECUTION_TRADE_IMMUTABLE';
  end if;
  if new.side = 'ENTRY' and new.executed_at < pilot_link.linked_at then
    raise exception using
      errcode = '23514',
      message = 'MTN_PILOT_ENTRY_PREDATES_LINK';
  end if;

  select
    coalesce(sum(execution.shares) filter (where execution.side = 'ENTRY'), 0),
    coalesce(sum(execution.price * execution.shares) filter (where execution.side = 'ENTRY'), 0)
    into entry_shares, entry_value
  from public.trade_executions as execution
  where execution.trade_id = target_trade_id
    and (tg_op <> 'UPDATE' or execution.id <> old.id);

  if new.side = 'ENTRY' then
    entry_shares := entry_shares + new.shares;
    entry_value := entry_value + new.price * new.shares;
  end if;
  if entry_shares <= 0 then
    return new;
  end if;

  planned_shares := coalesce(trade_row.total_shares, trade_row.position_size);
  if planned_shares is null or planned_shares <= 0
    or entry_shares > planned_shares + 0.000001 then
    raise exception using
      errcode = '23514',
      message = 'MTN_PILOT_PLAN_SHARES_EXCEEDED';
  end if;

  weighted_entry := entry_value / entry_shares;
  per_share_risk := case
    when trade_row.direction = 'LONG' then weighted_entry - trade_row.stoploss_price
    when trade_row.direction = 'SHORT' then trade_row.stoploss_price - weighted_entry
    else null
  end;
  if trade_row.total_equity is null or trade_row.total_equity <= 0
    or trade_row.stoploss_price is null or trade_row.stoploss_price <= 0
    or per_share_risk is null or per_share_risk <= 0 then
    raise exception using
      errcode = '23514',
      message = 'MTN_PILOT_EXECUTION_RISK_INCOMPLETE';
  end if;

  executed_risk := per_share_risk * entry_shares;
  authorized_risk := trade_row.total_equity * (pilot_link.authorized_risk_r / 100);
  if executed_risk > authorized_risk + 0.000001 then
    raise exception using
      errcode = '23514',
      message = 'MTN_PILOT_EXECUTION_RISK_EXCEEDED';
  end if;

  return new;
end;
$$;

drop trigger if exists pilot_trade_execution_guard on public.trade_executions;
create trigger pilot_trade_execution_guard
  before insert or update or delete on public.trade_executions
  for each row execute function public.guard_pilot_trade_execution();

create or replace function public.validate_pilot_outcome_source_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.execution_snapshot_hash is distinct from public.assurance_stable_jsonb_hash(new.execution_snapshot) then
    raise exception using
      errcode = '23514',
      message = 'MTN_PILOT_EXECUTION_SNAPSHOT_HASH_MISMATCH';
  end if;
  return new;
end;
$$;

drop trigger if exists recommendation_pilot_outcome_source_snapshot_validate
  on public.recommendation_pilot_outcomes;
create trigger recommendation_pilot_outcome_source_snapshot_validate
  before insert on public.recommendation_pilot_outcomes
  for each row execute function public.validate_pilot_outcome_source_snapshot();

create or replace function public.guard_pilot_trade_source_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_pilot_id uuid;
begin
  select link.id into linked_pilot_id
  from public.recommendation_pilot_links as link
  where link.trade_id = old.id
  for share;
  if linked_pilot_id is null then
    return new;
  end if;

  if old.ticker is distinct from new.ticker
    or old.direction is distinct from new.direction
    or old.total_equity is distinct from new.total_equity
    or old.planned_risk is distinct from new.planned_risk
    or old.risk_percent is distinct from new.risk_percent
    or old.entry_price is distinct from new.entry_price
    or old.stoploss_price is distinct from new.stoploss_price
    or old.position_size is distinct from new.position_size
    or old.total_shares is distinct from new.total_shares
    or old.entry_snapshot is distinct from new.entry_snapshot
    or old.current_plan_snapshot is distinct from new.current_plan_snapshot then
    raise exception using
      errcode = '55000',
      message = 'MTN_PILOT_AUTHORIZED_PLAN_IMMUTABLE';
  end if;

  if exists (
    select 1 from public.recommendation_pilot_outcomes as outcome
    where outcome.pilot_link_id = linked_pilot_id
      and outcome.evidence_status = 'VERIFIED'
  ) and (
    old.status is distinct from new.status
    or old.result_amount is distinct from new.result_amount
    or old.exit_price is distinct from new.exit_price
  ) then
    raise exception using
      errcode = '55000',
      message = 'MTN_VERIFIED_PILOT_SOURCE_IMMUTABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists pilot_trade_source_fields_guard on public.trades;
create trigger pilot_trade_source_fields_guard
  before update on public.trades
  for each row execute function public.guard_pilot_trade_source_fields();

create or replace function public.guard_verified_pilot_performance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.trades as trade
  where trade.id = old.trade_id
  for update;
  if exists (
    select 1
    from public.recommendation_pilot_outcomes as outcome
    where outcome.performance_record_id = old.id
      and outcome.evidence_status = 'VERIFIED'
  ) then
    raise exception using
      errcode = '55000',
      message = 'MTN_VERIFIED_PILOT_SOURCE_IMMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists verified_pilot_performance_guard on public.trade_performance_records;
create trigger verified_pilot_performance_guard
  before update or delete on public.trade_performance_records
  for each row execute function public.guard_verified_pilot_performance();

create or replace function public.guard_verified_pilot_model_performance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.horizon <> 'D5' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  perform 1
  from public.trades as trade
  join public.recommendation_pilot_links as link on link.trade_id = trade.id
  where link.pick_id = old.pick_id
  order by trade.id
  for update of trade;
  if exists (
    select 1
    from public.recommendation_pilot_links as link
    join public.recommendation_pilot_outcomes as outcome
      on outcome.pilot_link_id = link.id
    where link.pick_id = old.pick_id
      and outcome.evidence_status = 'VERIFIED'
  ) then
    raise exception using
      errcode = '55000',
      message = 'MTN_VERIFIED_PILOT_SOURCE_IMMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists verified_pilot_model_performance_guard
  on public.recommendation_performance;
create trigger verified_pilot_model_performance_guard
  before update or delete on public.recommendation_performance
  for each row execute function public.guard_verified_pilot_model_performance();

revoke all on function public.validate_pilot_execution_authorization() from public, anon, authenticated;
revoke all on function public.guard_pilot_trade_execution() from public, anon, authenticated;
revoke all on function public.validate_pilot_outcome_source_snapshot() from public, anon, authenticated;
revoke all on function public.guard_pilot_trade_source_fields() from public, anon, authenticated;
revoke all on function public.guard_verified_pilot_performance() from public, anon, authenticated;
revoke all on function public.guard_verified_pilot_model_performance() from public, anon, authenticated;

comment on function public.guard_pilot_trade_execution() is
  'Fail-closed pilot guard: binds actual fills to the prospective 0.5R authorization and freezes VERIFIED source evidence.';
