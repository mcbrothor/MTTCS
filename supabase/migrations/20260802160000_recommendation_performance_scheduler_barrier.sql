-- Forward-only scheduler timeout repair and 4/4 recommendation-performance barrier.
-- Budget: Vercel route 270s, pg_net 280s, durable response collector 290s.

create table if not exists public.recommendation_performance_batches (
  batch_date date not null,
  market text not null check (market in ('US', 'KR')),
  shard_count smallint not null default 4 check (shard_count = 4),
  barrier_status text not null default 'WAITING'
    check (barrier_status in ('WAITING', 'DEGRADED', 'READY', 'FINALIZING', 'SUCCESS', 'FAILED')),
  finalization_status text not null default 'PENDING'
    check (finalization_status in ('PENDING', 'CLAIMED', 'SUCCESS', 'FAILED')),
  finalization_claim_token uuid,
  finalization_claimed_at timestamptz,
  finalization_attempt_count integer not null default 0 check (finalization_attempt_count >= 0),
  finalization_completed_at timestamptz,
  finalization_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (batch_date, market)
);

create table if not exists public.recommendation_performance_batch_shards (
  batch_date date not null,
  market text not null check (market in ('US', 'KR')),
  shard_count smallint not null default 4 check (shard_count = 4),
  shard smallint not null check (shard between 0 and 3),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'RUNNING', 'SUCCESS', 'DEGRADED', 'FAILED')),
  claim_token uuid,
  claimed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  completed_at timestamptz,
  last_error text,
  run_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (batch_date, market, shard),
  foreign key (batch_date, market)
    references public.recommendation_performance_batches(batch_date, market)
    on delete restrict
);

create index if not exists recommendation_performance_batch_shards_retry_idx
  on public.recommendation_performance_batch_shards (batch_date desc, market, status, claimed_at);

alter table public.recommendation_performance_batches enable row level security;
alter table public.recommendation_performance_batch_shards enable row level security;

revoke all on table public.recommendation_performance_batches from public, anon, authenticated;
revoke all on table public.recommendation_performance_batch_shards from public, anon, authenticated;
grant select on table public.recommendation_performance_batches to service_role;
grant select on table public.recommendation_performance_batch_shards to service_role;

drop policy if exists "Service role reads recommendation performance batches"
  on public.recommendation_performance_batches;
create policy "Service role reads recommendation performance batches"
  on public.recommendation_performance_batches
  for select to service_role using (true);

drop policy if exists "Service role reads recommendation performance batch shards"
  on public.recommendation_performance_batch_shards;
create policy "Service role reads recommendation performance batch shards"
  on public.recommendation_performance_batch_shards
  for select to service_role using (true);

create or replace function mtn_internal.refresh_recommendation_performance_barrier(
  p_batch_date date,
  p_market text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  successful_shards integer;
  degraded_shards integer[];
  missing_shards integer[];
  current_finalization_status text;
  resolved_barrier_status text;
begin
  select
    count(*) filter (where shard_run.status = 'SUCCESS')::integer,
    coalesce(
      array_agg(expected.shard order by expected.shard)
        filter (where shard_run.status in ('DEGRADED', 'FAILED')),
      '{}'::integer[]
    ),
    coalesce(
      array_agg(expected.shard order by expected.shard)
        filter (where shard_run.status is null or shard_run.status in ('PENDING', 'RUNNING')),
      '{}'::integer[]
    )
  into successful_shards, degraded_shards, missing_shards
  from generate_series(0, 3) as expected(shard)
  left join public.recommendation_performance_batch_shards as shard_run
    on shard_run.batch_date = p_batch_date
   and shard_run.market = p_market
   and shard_run.shard = expected.shard;

  select batch.finalization_status
  into current_finalization_status
  from public.recommendation_performance_batches as batch
  where batch.batch_date = p_batch_date
    and batch.market = p_market;

  resolved_barrier_status := case
    when current_finalization_status = 'SUCCESS' then 'SUCCESS'
    when current_finalization_status = 'CLAIMED' then 'FINALIZING'
    when cardinality(degraded_shards) > 0 then 'DEGRADED'
    when successful_shards = 4 then 'READY'
    else 'WAITING'
  end;

  update public.recommendation_performance_batches as batch
  set barrier_status = resolved_barrier_status,
      updated_at = clock_timestamp()
  where batch.batch_date = p_batch_date
    and batch.market = p_market;

  return jsonb_build_object(
    'barrier_status', resolved_barrier_status,
    'successful_shards', successful_shards,
    'required_shards', 4,
    'degraded_shards', to_jsonb(degraded_shards),
    'missing_shards', to_jsonb(missing_shards),
    'finalization_status', current_finalization_status
  );
end;
$$;

create or replace function public.claim_recommendation_performance_shard(
  p_batch_date date,
  p_market text,
  p_shard integer,
  p_shards integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_shard public.recommendation_performance_batch_shards%rowtype;
  next_claim_token uuid;
  barrier jsonb;
begin
  if p_batch_date is null then
    raise exception 'batch_date is required.';
  end if;
  if p_market not in ('US', 'KR') then
    raise exception 'market must be US or KR.';
  end if;
  if p_shards <> 4 then
    raise exception 'Recommendation performance requires exactly four shards.';
  end if;
  if p_shard < 0 or p_shard >= 4 then
    raise exception 'shard must be between 0 and 3.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(format('mtn:recommendation-performance:shard:%s:%s:%s', p_batch_date, p_market, p_shard), 0)
  );

  insert into public.recommendation_performance_batches (batch_date, market, shard_count)
  values (p_batch_date, p_market, 4)
  on conflict (batch_date, market) do nothing;

  insert into public.recommendation_performance_batch_shards (
    batch_date, market, shard_count, shard, status
  )
  values (p_batch_date, p_market, 4, p_shard, 'PENDING')
  on conflict (batch_date, market, shard) do nothing;

  select shard_run.*
  into current_shard
  from public.recommendation_performance_batch_shards as shard_run
  where shard_run.batch_date = p_batch_date
    and shard_run.market = p_market
    and shard_run.shard = p_shard
  for update;

  barrier := mtn_internal.refresh_recommendation_performance_barrier(p_batch_date, p_market);

  if current_shard.status = 'SUCCESS' then
    return barrier || jsonb_build_object(
      'claimed', false,
      'claim_status', 'ALREADY_SUCCESS',
      'claim_token', null,
      'shard_status', current_shard.status,
      'attempt_count', current_shard.attempt_count
    );
  end if;

  if current_shard.status = 'RUNNING'
    and current_shard.claimed_at >= clock_timestamp() - interval '10 minutes'
  then
    return barrier || jsonb_build_object(
      'claimed', false,
      'claim_status', 'BUSY',
      'claim_token', null,
      'shard_status', current_shard.status,
      'attempt_count', current_shard.attempt_count
    );
  end if;

  next_claim_token := gen_random_uuid();
  update public.recommendation_performance_batch_shards as shard_run
  set status = 'RUNNING',
      claim_token = next_claim_token,
      claimed_at = clock_timestamp(),
      attempt_count = shard_run.attempt_count + 1,
      completed_at = null,
      last_error = null,
      updated_at = clock_timestamp()
  where shard_run.batch_date = p_batch_date
    and shard_run.market = p_market
    and shard_run.shard = p_shard
  returning shard_run.* into current_shard;

  return barrier || jsonb_build_object(
    'claimed', true,
    'claim_status', 'CLAIMED',
    'claim_token', next_claim_token,
    'shard_status', current_shard.status,
    'attempt_count', current_shard.attempt_count
  );
end;
$$;

create or replace function public.complete_recommendation_performance_shard(
  p_batch_date date,
  p_market text,
  p_shard integer,
  p_claim_token uuid,
  p_status text,
  p_metadata jsonb default '{}'::jsonb,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
  barrier jsonb;
begin
  if p_status not in ('SUCCESS', 'DEGRADED', 'FAILED') then
    raise exception 'Shard completion status must be SUCCESS, DEGRADED, or FAILED.';
  end if;
  if p_claim_token is null then
    raise exception 'A shard claim token is required.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(format('mtn:recommendation-performance:shard:%s:%s:%s', p_batch_date, p_market, p_shard), 0)
  );

  update public.recommendation_performance_batch_shards as shard_run
  set status = p_status,
      claim_token = null,
      completed_at = clock_timestamp(),
      last_error = left(p_error_message, 2000),
      run_metadata = coalesce(p_metadata, '{}'::jsonb),
      updated_at = clock_timestamp()
  where shard_run.batch_date = p_batch_date
    and shard_run.market = p_market
    and shard_run.shard = p_shard
    and shard_run.status = 'RUNNING'
    and shard_run.claim_token = p_claim_token;
  get diagnostics updated_count = row_count;

  if updated_count <> 1 then
    raise exception 'Shard completion rejected because the claim token is stale or missing.';
  end if;

  barrier := mtn_internal.refresh_recommendation_performance_barrier(p_batch_date, p_market);
  return barrier || jsonb_build_object('completed', true, 'shard_status', p_status);
end;
$$;

create or replace function public.claim_recommendation_performance_finalization(
  p_batch_date date,
  p_market text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_run public.recommendation_performance_batches%rowtype;
  barrier jsonb;
  next_claim_token uuid;
begin
  if p_batch_date is null then
    raise exception 'batch_date is required.';
  end if;
  if p_market not in ('US', 'KR') then
    raise exception 'market must be US or KR.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(format('mtn:recommendation-performance:finalization:%s:%s', p_batch_date, p_market), 0)
  );

  insert into public.recommendation_performance_batches (batch_date, market, shard_count)
  values (p_batch_date, p_market, 4)
  on conflict (batch_date, market) do nothing;

  barrier := mtn_internal.refresh_recommendation_performance_barrier(p_batch_date, p_market);
  select batch.*
  into batch_run
  from public.recommendation_performance_batches as batch
  where batch.batch_date = p_batch_date
    and batch.market = p_market
  for update;

  if batch_run.finalization_status = 'SUCCESS' then
    return barrier || jsonb_build_object(
      'claimed', false,
      'claim_status', 'ALREADY_SUCCESS',
      'claim_token', null
    );
  end if;

  if coalesce((barrier ->> 'successful_shards')::integer, 0) <> 4 then
    return barrier || jsonb_build_object(
      'claimed', false,
      'claim_status', case
        when barrier ->> 'barrier_status' = 'DEGRADED' then 'BARRIER_DEGRADED'
        else 'BARRIER_WAITING'
      end,
      'claim_token', null
    );
  end if;

  if batch_run.finalization_status = 'CLAIMED'
    and batch_run.finalization_claimed_at >= clock_timestamp() - interval '10 minutes'
  then
    return barrier || jsonb_build_object(
      'claimed', false,
      'claim_status', 'BUSY',
      'claim_token', null
    );
  end if;

  next_claim_token := gen_random_uuid();
  update public.recommendation_performance_batches as batch
  set barrier_status = 'FINALIZING',
      finalization_status = 'CLAIMED',
      finalization_claim_token = next_claim_token,
      finalization_claimed_at = clock_timestamp(),
      finalization_attempt_count = batch.finalization_attempt_count + 1,
      finalization_error = null,
      updated_at = clock_timestamp()
  where batch.batch_date = p_batch_date
    and batch.market = p_market;

  return barrier || jsonb_build_object(
    'barrier_status', 'READY',
    'claimed', true,
    'claim_status', 'CLAIMED',
    'claim_token', next_claim_token
  );
end;
$$;

create or replace function public.complete_recommendation_performance_finalization(
  p_batch_date date,
  p_market text,
  p_claim_token uuid,
  p_success boolean,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if p_claim_token is null then
    raise exception 'A finalization claim token is required.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(format('mtn:recommendation-performance:finalization:%s:%s', p_batch_date, p_market), 0)
  );

  update public.recommendation_performance_batches as batch
  set barrier_status = case when p_success then 'SUCCESS' else 'FAILED' end,
      finalization_status = case when p_success then 'SUCCESS' else 'FAILED' end,
      finalization_claim_token = null,
      finalization_completed_at = clock_timestamp(),
      finalization_error = case when p_success then null else left(p_error_message, 2000) end,
      updated_at = clock_timestamp()
  where batch.batch_date = p_batch_date
    and batch.market = p_market
    and batch.finalization_status = 'CLAIMED'
    and batch.finalization_claim_token = p_claim_token;
  get diagnostics updated_count = row_count;

  if updated_count <> 1 then
    raise exception 'Finalization completion rejected because the claim token is stale or missing.';
  end if;

  return jsonb_build_object(
    'completed', true,
    'finalization_status', case when p_success then 'SUCCESS' else 'FAILED' end,
    'retryable', not p_success
  );
end;
$$;

revoke all on function mtn_internal.refresh_recommendation_performance_barrier(date, text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_recommendation_performance_shard(date, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.complete_recommendation_performance_shard(date, text, integer, uuid, text, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.claim_recommendation_performance_finalization(date, text)
  from public, anon, authenticated;
revoke all on function public.complete_recommendation_performance_finalization(date, text, uuid, boolean, text)
  from public, anon, authenticated;

grant execute on function public.claim_recommendation_performance_shard(date, text, integer, integer)
  to service_role;
grant execute on function public.complete_recommendation_performance_shard(date, text, integer, uuid, text, jsonb, text)
  to service_role;
grant execute on function public.claim_recommendation_performance_finalization(date, text)
  to service_role;
grant execute on function public.complete_recommendation_performance_finalization(date, text, uuid, boolean, text)
  to service_role;

-- Replace the previous 55-second pg_net budget. The route is capped at 270s,
-- leaving 10s for transport and another 10s before the collector declares loss.
create or replace function mtn_internal.invoke_cron(
  p_job_name text,
  p_path text,
  p_slot_minutes integer default 1
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_base_url text;
  cron_secret text;
  queued_request_id bigint;
  run_id bigint;
  slot_started_at timestamptz;
begin
  if p_job_name is null or p_job_name !~ '^mtn-[a-z0-9-]+$' then
    raise exception 'A valid MTN cron job name is required.';
  end if;
  if p_path is null
    or p_path not like '/api/cron/%'
    or p_path like '%://%'
    or p_path like '%' || chr(10) || '%'
    or p_path like '%' || chr(13) || '%'
  then
    raise exception 'Only relative /api/cron/* paths are allowed.';
  end if;
  if p_slot_minutes is null or p_slot_minutes < 1 or p_slot_minutes > 1440 then
    raise exception 'slot_minutes must be between 1 and 1440.';
  end if;

  slot_started_at := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / (p_slot_minutes * 60))
      * (p_slot_minutes * 60)
  );

  insert into public.cron_http_runs (
    job_name, slot_started_at, path, status, requested_at
  )
  values (p_job_name, slot_started_at, p_path, 'CLAIMED', clock_timestamp())
  on conflict on constraint cron_http_runs_job_name_slot_started_at_key do nothing
  returning id into run_id;

  if run_id is null then
    return null;
  end if;

  begin
    select decrypted_secret
    into app_base_url
    from vault.decrypted_secrets
    where name = 'mtn_app_base_url'
    limit 1;

    select decrypted_secret
    into cron_secret
    from vault.decrypted_secrets
    where name = 'mtn_cron_secret'
    limit 1;

    if app_base_url is null or cron_secret is null then
      raise exception 'Vault secrets mtn_app_base_url and mtn_cron_secret are required.';
    end if;
    if app_base_url !~ '^https://[A-Za-z0-9.-]+(?::[0-9]+)?$' then
      raise exception 'mtn_app_base_url must be an HTTPS origin without a path.';
    end if;

    select net.http_get(
      url := rtrim(app_base_url, '/') || p_path,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || cron_secret,
        'User-Agent', 'mtn-supabase-cron/3.0'
      ),
      timeout_milliseconds := 280000
    )
    into queued_request_id;

    update public.cron_http_runs
    set request_id = queued_request_id,
        status = 'QUEUED'
    where id = run_id;

    return queued_request_id;
  exception
    when others then
      update public.cron_http_runs
      set status = 'FAILED',
          error_message = left(sqlstate || ': ' || sqlerrm, 2000),
          completed_at = clock_timestamp()
      where id = run_id;
      return null;
  end;
end;
$$;

create or replace function mtn_internal.collect_cron_http_responses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_count integer := 0;
  timed_out_count integer := 0;
begin
  update public.cron_http_runs as run
  set status = case
        when response.timed_out then 'TIMED_OUT'
        when response.error_msg is not null then 'FAILED'
        when response.status_code between 200 and 299 then 'SUCCESS'
        else 'FAILED'
      end,
      http_status = response.status_code,
      error_message = case
        when response.timed_out then coalesce(response.error_msg, 'pg_net request timed out')
        when response.error_msg is not null then left(response.error_msg, 2000)
        when response.status_code between 200 and 299 then null
        else 'HTTP ' || coalesce(response.status_code::text, 'unknown')
      end,
      response_excerpt = left(coalesce(response.content, ''), 2000),
      completed_at = response.created
  from net._http_response as response
  where run.request_id = response.id
    and run.status in ('QUEUED', 'TIMED_OUT');
  get diagnostics completed_count = row_count;

  update public.cron_http_runs as run
  set status = 'TIMED_OUT',
      error_message = 'No pg_net response was received within 290 seconds.',
      completed_at = clock_timestamp()
  where run.status in ('CLAIMED', 'QUEUED')
    and run.requested_at < clock_timestamp() - interval '290 seconds'
    and not exists (
      select 1
      from net._http_response as response
      where response.id = run.request_id
    );
  get diagnostics timed_out_count = row_count;

  return completed_count + timed_out_count;
end;
$$;

revoke all on function mtn_internal.invoke_cron(text, text, integer)
  from public, anon, authenticated;
revoke all on function mtn_internal.collect_cron_http_responses()
  from public, anon, authenticated;

create or replace function mtn_internal.retry_recommendation_performance_batches()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  utc_now timestamp := clock_timestamp() at time zone 'UTC';
  batch_run record;
  shard_index integer;
  shard_status text;
  shard_claimed_at timestamptz;
  successful_shards integer;
  queued_request_id bigint;
  queued_count integer := 0;
  retry_path text;
  retry_job_name text;
begin
  -- Seed a batch even if every original HTTP delivery failed before reaching Vercel.
  if utc_now::time >= time '06:50' then
    insert into public.recommendation_performance_batches (batch_date, market, shard_count)
    values (utc_now::date, 'US', 4)
    on conflict (batch_date, market) do nothing;
  end if;
  if utc_now::time >= time '08:30' then
    insert into public.recommendation_performance_batches (batch_date, market, shard_count)
    values (utc_now::date, 'KR', 4)
    on conflict (batch_date, market) do nothing;
  end if;

  for batch_run in
    select batch.batch_date,
           batch.market,
           batch.finalization_status,
           batch.finalization_claimed_at
    from public.recommendation_performance_batches as batch
    where batch.batch_date between utc_now::date - 2 and utc_now::date
      and batch.finalization_status <> 'SUCCESS'
    order by batch.batch_date, batch.market
  loop
    select count(*)::integer
    into successful_shards
    from public.recommendation_performance_batch_shards as shard_run
    where shard_run.batch_date = batch_run.batch_date
      and shard_run.market = batch_run.market
      and shard_run.status = 'SUCCESS';

    if successful_shards = 4 then
      if batch_run.finalization_status <> 'CLAIMED'
        or batch_run.finalization_claimed_at < clock_timestamp() - interval '10 minutes'
      then
        shard_index := 0;
        retry_job_name := format(
          'mtn-recommendation-performance-retry-%s-%s-%s',
          lower(batch_run.market),
          shard_index,
          to_char(batch_run.batch_date, 'YYYYMMDD')
        );
        retry_path := format(
          '/api/cron/recommendation-performance?market=%s&shard=%s&shards=4&batchDate=%s',
          batch_run.market,
          shard_index,
          batch_run.batch_date
        );
        queued_request_id := mtn_internal.invoke_cron(retry_job_name, retry_path, 15);
        if queued_request_id is not null then queued_count := queued_count + 1; end if;
      end if;
      continue;
    end if;

    for shard_index in 0..3 loop
      select shard_run.status, shard_run.claimed_at
      into shard_status, shard_claimed_at
      from public.recommendation_performance_batch_shards as shard_run
      where shard_run.batch_date = batch_run.batch_date
        and shard_run.market = batch_run.market
        and shard_run.shard = shard_index;

      if found and shard_status = 'SUCCESS' then
        continue;
      end if;
      if found and shard_status = 'RUNNING'
        and shard_claimed_at >= clock_timestamp() - interval '10 minutes'
      then
        continue;
      end if;

      retry_job_name := format(
        'mtn-recommendation-performance-retry-%s-%s-%s',
        lower(batch_run.market),
        shard_index,
        to_char(batch_run.batch_date, 'YYYYMMDD')
      );
      retry_path := format(
        '/api/cron/recommendation-performance?market=%s&shard=%s&shards=4&batchDate=%s',
        batch_run.market,
        shard_index,
        batch_run.batch_date
      );
      queued_request_id := mtn_internal.invoke_cron(retry_job_name, retry_path, 15);
      if queued_request_id is not null then queued_count := queued_count + 1; end if;
    end loop;
  end loop;

  return queued_count;
end;
$$;

revoke all on function mtn_internal.retry_recommendation_performance_batches()
  from public, anon, authenticated, service_role;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'mtn-recommendation-performance-retry-sweep'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'mtn-recommendation-performance-retry-sweep',
  '*/15 * * * *',
  $cron$select mtn_internal.retry_recommendation_performance_batches();$cron$
);

comment on table public.recommendation_performance_batches is
  'UTC recommendation-performance batch barrier and single finalization claim state.';
comment on table public.recommendation_performance_batch_shards is
  'Durable per-shard claim, retry, and completion state for fixed 4-shard performance batches.';
comment on function public.claim_recommendation_performance_finalization(date, text) is
  'Atomically claims finalization only after all four shards for the UTC market batch are successful.';
comment on function mtn_internal.retry_recommendation_performance_batches() is
  'Retries only missing, degraded, failed, or stale shards using the original HTTP route and batch date.';
