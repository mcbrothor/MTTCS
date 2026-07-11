alter table public.trades
  add column if not exists version bigint not null default 0,
  add column if not exists idempotency_key text,
  add column if not exists entry_snapshot_locked_at timestamptz,
  add column if not exists current_plan_snapshot jsonb;

update public.trades
set current_plan_snapshot = entry_snapshot
where current_plan_snapshot is null and entry_snapshot is not null;

alter table public.portfolio_settings
  add column if not exists version bigint not null default 0;

alter table public.trade_executions
  add column if not exists idempotency_key text,
  add column if not exists request_hash text;

alter table public.beauty_contest_sessions
  add column if not exists idempotency_key text;

create unique index if not exists trades_user_idempotency_idx
  on public.trades (user_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists trade_executions_trade_idempotency_idx
  on public.trade_executions (trade_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists contest_sessions_idempotency_idx
  on public.beauty_contest_sessions (idempotency_key)
  where idempotency_key is not null;

create table if not exists public.trade_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  revision_no integer not null check (revision_no > 0),
  changed_at timestamptz not null default now(),
  actor_id uuid not null,
  reason text not null check (length(btrim(reason)) between 3 and 1000),
  before_snapshot jsonb,
  after_snapshot jsonb not null,
  change_set jsonb not null default '{}'::jsonb,
  unique (trade_id, revision_no)
);

create index if not exists trade_plan_revisions_trade_revision_idx
  on public.trade_plan_revisions (trade_id, revision_no desc);

create table if not exists public.trade_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  ticker text not null,
  market text not null check (market in ('US', 'KR')),
  direction text not null check (direction in ('LONG', 'SHORT')),
  mode text not null check (mode in ('SYSTEM_ANALYSIS', 'MANUAL')),
  input_snapshot jsonb not null,
  result_snapshot jsonb not null,
  policy_version text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_by_trade_id uuid unique references public.trades(id) on delete set null,
  check (expires_at > created_at)
);

create index if not exists trade_analysis_runs_owner_created_idx
  on public.trade_analysis_runs (owner_id, created_at desc);

alter table public.trade_plan_revisions enable row level security;
alter table public.trade_analysis_runs enable row level security;

revoke all on table public.trade_plan_revisions from public, anon, authenticated;
revoke all on table public.trade_analysis_runs from public, anon, authenticated;
grant select, insert on table public.trade_plan_revisions to service_role;
grant select, insert, update on table public.trade_analysis_runs to service_role;

create or replace function public.mutate_trade_execution_v2(
  p_operation text,
  p_trade_id uuid,
  p_owner_id uuid,
  p_expected_trade_version bigint,
  p_execution jsonb default null,
  p_execution_id uuid default null,
  p_idempotency_key text default null,
  p_request_hash text default null,
  p_trade_patch jsonb default '{}'::jsonb,
  p_portfolio_patch jsonb default null,
  p_expected_portfolio_version bigint default null,
  p_performance_patch jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trade public.trades%rowtype;
  v_existing public.trade_executions%rowtype;
  v_execution_id uuid;
  v_portfolio public.portfolio_settings%rowtype;
begin
  if p_operation not in ('CREATE', 'UPDATE', 'DELETE') then
    raise exception using errcode = '22023', message = 'MTN_INVALID_EXECUTION_OPERATION';
  end if;

  if p_operation = 'CREATE' then
    if nullif(btrim(p_idempotency_key), '') is null or nullif(btrim(p_request_hash), '') is null then
      raise exception using errcode = '22023', message = 'MTN_IDEMPOTENCY_REQUIRED';
    end if;
    select * into v_existing
    from public.trade_executions
    where trade_id = p_trade_id and idempotency_key = p_idempotency_key;
    if found then
      if v_existing.request_hash is distinct from p_request_hash then
        raise exception using errcode = 'P0001', message = 'MTN_IDEMPOTENCY_CONFLICT';
      end if;
      select * into v_trade from public.trades where id = p_trade_id;
      return jsonb_build_object(
        'execution_id', v_existing.id,
        'trade_version', v_trade.version,
        'idempotent_replay', true
      );
    end if;
  end if;

  select * into v_trade
  from public.trades
  where id = p_trade_id and user_id = p_owner_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'MTN_TRADE_NOT_FOUND';
  end if;
  if v_trade.version <> p_expected_trade_version then
    raise exception using errcode = '40001', message = 'MTN_VERSION_CONFLICT';
  end if;

  if p_portfolio_patch is not null then
    select * into v_portfolio
    from public.portfolio_settings
    where market = p_portfolio_patch->>'market'
    for update;
    if found and p_expected_portfolio_version is not null
       and v_portfolio.version <> p_expected_portfolio_version then
      raise exception using errcode = '40001', message = 'MTN_PORTFOLIO_VERSION_CONFLICT';
    end if;
  end if;

  if p_operation = 'CREATE' then
    insert into public.trade_executions (
      trade_id, side, executed_at, price, shares, fees, leg_label, note,
      idempotency_key, request_hash
    ) values (
      p_trade_id,
      p_execution->>'side',
      coalesce((p_execution->>'executed_at')::timestamptz, now()),
      (p_execution->>'price')::numeric,
      (p_execution->>'shares')::numeric,
      coalesce((p_execution->>'fees')::numeric, 0),
      coalesce(p_execution->>'leg_label', 'MANUAL'),
      nullif(p_execution->>'note', ''),
      p_idempotency_key,
      p_request_hash
    ) returning id into v_execution_id;
  elsif p_operation = 'UPDATE' then
    update public.trade_executions
    set side = coalesce(p_execution->>'side', side),
        executed_at = coalesce((p_execution->>'executed_at')::timestamptz, executed_at),
        price = coalesce((p_execution->>'price')::numeric, price),
        shares = coalesce((p_execution->>'shares')::numeric, shares),
        fees = coalesce((p_execution->>'fees')::numeric, fees),
        leg_label = coalesce(p_execution->>'leg_label', leg_label),
        note = case when p_execution ? 'note' then nullif(p_execution->>'note', '') else note end,
        updated_at = now()
    where id = p_execution_id and trade_id = p_trade_id
    returning id into v_execution_id;
  else
    delete from public.trade_executions
    where id = p_execution_id and trade_id = p_trade_id
    returning id into v_execution_id;
  end if;

  if v_execution_id is null then
    raise exception using errcode = 'P0002', message = 'MTN_EXECUTION_NOT_FOUND';
  end if;

  update public.trades
  set status = coalesce(p_trade_patch->>'status', status),
      result_amount = case when p_trade_patch ? 'result_amount' then (p_trade_patch->>'result_amount')::numeric else result_amount end,
      exit_price = case when p_trade_patch ? 'exit_price' then (p_trade_patch->>'exit_price')::numeric else exit_price end,
      entry_snapshot_locked_at = case
        when p_operation = 'CREATE' and p_execution->>'side' = 'ENTRY'
          then coalesce(entry_snapshot_locked_at, now())
        else entry_snapshot_locked_at
      end,
      version = version + 1,
      updated_at = now()
  where id = p_trade_id;

  if p_portfolio_patch is not null then
    insert into public.portfolio_settings (market, total_equity, cash, version, updated_at)
    values (
      p_portfolio_patch->>'market',
      (p_portfolio_patch->>'total_equity')::numeric,
      (p_portfolio_patch->>'cash')::numeric,
      1,
      now()
    )
    on conflict (market) do update
      set total_equity = excluded.total_equity,
          cash = excluded.cash,
          version = public.portfolio_settings.version + 1,
          updated_at = now();
  end if;

  if p_performance_patch is not null then
    insert into public.trade_performance_records (
      trade_id, market, ticker, completed_at, entry_value, exit_value, fees,
      realized_pnl, r_multiple, return_pct, pyramid_compliant,
      stop_raise_compliant, performance_snapshot, updated_at
    ) values (
      p_trade_id,
      p_performance_patch->>'market',
      p_performance_patch->>'ticker',
      (p_performance_patch->>'completed_at')::timestamptz,
      coalesce((p_performance_patch->>'entry_value')::numeric, 0),
      coalesce((p_performance_patch->>'exit_value')::numeric, 0),
      coalesce((p_performance_patch->>'fees')::numeric, 0),
      coalesce((p_performance_patch->>'realized_pnl')::numeric, 0),
      (p_performance_patch->>'r_multiple')::numeric,
      (p_performance_patch->>'return_pct')::numeric,
      (p_performance_patch->>'pyramid_compliant')::boolean,
      (p_performance_patch->>'stop_raise_compliant')::boolean,
      coalesce(p_performance_patch->'performance_snapshot', '{}'::jsonb),
      now()
    )
    on conflict (trade_id) do update set
      market = excluded.market,
      ticker = excluded.ticker,
      completed_at = excluded.completed_at,
      entry_value = excluded.entry_value,
      exit_value = excluded.exit_value,
      fees = excluded.fees,
      realized_pnl = excluded.realized_pnl,
      r_multiple = excluded.r_multiple,
      return_pct = excluded.return_pct,
      pyramid_compliant = excluded.pyramid_compliant,
      stop_raise_compliant = excluded.stop_raise_compliant,
      performance_snapshot = excluded.performance_snapshot,
      updated_at = now();
  end if;

  return jsonb_build_object(
    'execution_id', v_execution_id,
    'trade_version', v_trade.version + 1,
    'idempotent_replay', false
  );
end;
$$;

revoke execute on function public.mutate_trade_execution_v2(
  text, uuid, uuid, bigint, jsonb, uuid, text, text, jsonb, jsonb, bigint, jsonb
) from public, anon, authenticated;
grant execute on function public.mutate_trade_execution_v2(
  text, uuid, uuid, bigint, jsonb, uuid, text, text, jsonb, jsonb, bigint, jsonb
) to service_role;

create or replace function public.amend_trade_plan_v2(
  p_trade_id uuid,
  p_owner_id uuid,
  p_expected_version bigint,
  p_reason text,
  p_patch jsonb,
  p_after_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trade public.trades%rowtype;
  v_revision integer;
begin
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'MTN_AMENDMENT_REASON_REQUIRED';
  end if;
  select * into v_trade from public.trades
  where id = p_trade_id and user_id = p_owner_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'MTN_TRADE_NOT_FOUND'; end if;
  if v_trade.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'MTN_VERSION_CONFLICT';
  end if;
  select coalesce(max(revision_no), 0) + 1 into v_revision
  from public.trade_plan_revisions where trade_id = p_trade_id;

  insert into public.trade_plan_revisions (
    trade_id, revision_no, actor_id, reason, before_snapshot, after_snapshot, change_set
  ) values (
    p_trade_id, v_revision, p_owner_id, btrim(p_reason),
    coalesce(v_trade.current_plan_snapshot, v_trade.entry_snapshot), p_after_snapshot, p_patch
  );

  update public.trades set
    entry_price = case when p_patch ? 'entry_price' then (p_patch->>'entry_price')::numeric else entry_price end,
    stoploss_price = case when p_patch ? 'stoploss_price' then (p_patch->>'stoploss_price')::numeric else stoploss_price end,
    total_shares = case when p_patch ? 'total_shares' then (p_patch->>'total_shares')::numeric else total_shares end,
    position_size = case when p_patch ? 'total_shares' then (p_patch->>'total_shares')::numeric else position_size end,
    entry_targets = case when p_patch ? 'entry_targets' then p_patch->'entry_targets' else entry_targets end,
    trailing_stops = case when p_patch ? 'trailing_stops' then p_patch->'trailing_stops' else trailing_stops end,
    plan_note = case when p_patch ? 'plan_note' then p_patch->>'plan_note' else plan_note end,
    invalidation_note = case when p_patch ? 'invalidation_note' then p_patch->>'invalidation_note' else invalidation_note end,
    current_plan_snapshot = p_after_snapshot,
    version = version + 1,
    updated_at = now()
  where id = p_trade_id;

  return jsonb_build_object('revision_no', v_revision, 'trade_version', v_trade.version + 1);
end;
$$;

revoke execute on function public.amend_trade_plan_v2(uuid, uuid, bigint, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.amend_trade_plan_v2(uuid, uuid, bigint, text, jsonb, jsonb)
  to service_role;
