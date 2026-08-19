-- Run bounded, reproducible retention before the 400 MiB write gate is reached.
-- Automatic deletion is intentionally narrower than the operator-only generic
-- retention function and requires a recent, fully verified encrypted backup.

create or replace function mtn_internal.automatic_capacity_retention_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity jsonb := mtn_internal.database_capacity_status();
  v_database_mb numeric := (v_capacity->>'database_mb')::numeric;
  v_growth_mb_per_day numeric := 0;
  v_projected_7d_mb numeric;
  v_backup public.operations_backup_runs%rowtype;
  v_backup_valid boolean := false;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'MTN_SERVICE_ROLE_REQUIRED';
  end if;

  select coalesce(
    pg_catalog.regr_slope(
      snapshot.database_mb::double precision,
      extract(epoch from snapshot.captured_at) / 86400.0
    ),
    0
  )::numeric
  into v_growth_mb_per_day
  from public.database_capacity_snapshots as snapshot
  where snapshot.captured_at >= pg_catalog.clock_timestamp() - interval '7 days';

  v_growth_mb_per_day := greatest(v_growth_mb_per_day, 0);
  v_projected_7d_mb := v_database_mb + (v_growth_mb_per_day * 7);

  select backup.*
  into v_backup
  from public.operations_backup_runs as backup
  order by backup.completed_at desc nulls last
  limit 1;

  if found then
    v_backup_valid := v_backup.status = 'SUCCESS'
      and v_backup.encrypted
      and coalesce(v_backup.checksum_sha256, '') <> ''
      and v_backup.completed_at >= pg_catalog.clock_timestamp() - interval '24 hours'
      and coalesce((v_backup.metadata->>'restore_drill')::boolean, false)
      and coalesce((v_backup.metadata->>'row_count_reconciliation')::boolean, false)
      and coalesce((v_backup.metadata->>'critical_query_smoke')::boolean, false)
      and coalesce((v_backup.metadata->>'offsite_verified')::boolean, false);
  end if;

  return v_capacity || pg_catalog.jsonb_build_object(
    'growth_mb_per_day', pg_catalog.round(v_growth_mb_per_day, 2),
    'projected_7d_mb', pg_catalog.round(v_projected_7d_mb, 2),
    'auto_retention_required',
      v_database_mb >= 350 or (v_database_mb >= 330 and v_projected_7d_mb >= 380),
    'compaction_required', v_database_mb >= 380,
    'backup_valid', v_backup_valid,
    'backup_run_id', case when found then pg_catalog.to_jsonb(v_backup.id) else null end,
    'backup_completed_at', case when found then pg_catalog.to_jsonb(v_backup.completed_at) else null end
  );
end;
$$;

create or replace function mtn_internal.apply_automatic_capacity_retention(
  p_dry_run boolean default true,
  p_confirmation text default null
)
returns table (
  policy_name text,
  target_table text,
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
  v_status jsonb := mtn_internal.automatic_capacity_retention_status();
  v_policy record;
  v_schema text;
  v_table text;
  v_batch_limit constant integer := 10000;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'MTN_SERVICE_ROLE_REQUIRED';
  end if;

  if not p_dry_run then
    if p_confirmation is distinct from 'AUTO_CAPACITY_RETENTION' then
      raise exception using
        errcode = '22023',
        message = 'MTN_AUTOMATIC_RETENTION_CONFIRMATION_REQUIRED';
    end if;
    if not coalesce((v_status->>'auto_retention_required')::boolean, false) then
      raise exception using
        errcode = '55000',
        message = 'MTN_AUTOMATIC_RETENTION_NOT_REQUIRED';
    end if;
    if not coalesce((v_status->>'backup_valid')::boolean, false) then
      raise exception using
        errcode = '55000',
        message = 'MTN_VERIFIED_BACKUP_REQUIRED';
    end if;
    if not pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtext('mtn:database-maintenance')
    ) then
      raise exception using errcode = '55P03', message = 'MTN_DATABASE_MAINTENANCE_BUSY';
    end if;
    perform pg_catalog.set_config('lock_timeout', '5s', true);
    perform pg_catalog.set_config('statement_timeout', '60s', true);
  end if;

  for v_policy in
    select policy.*
    from public.data_retention_policies as policy
    where policy.enabled
      and policy.policy_name = any(array[
        'cron_http_runs',
        'daily_screener_candidates',
        'recommendation_market_prices'
      ])
    order by policy.policy_name
  loop
    v_schema := pg_catalog.split_part(v_policy.target_table, '.', 1);
    v_table := pg_catalog.split_part(v_policy.target_table, '.', 2);
    policy_name := v_policy.policy_name;
    target_table := v_policy.target_table;
    retention_days := case v_status->>'capacity_level'
      when 'BLOCK_NONCRITICAL' then v_policy.blocked_days
      else v_policy.warning_days
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
        'with candidates as (
           select ctid from %I.%I
           where %I < $1
           order by %I
           limit 10000
         )
         delete from %I.%I as target
         using candidates
         where target.ctid = candidates.ctid',
        v_schema,
        v_table,
        v_policy.timestamp_column,
        v_policy.timestamp_column,
        v_schema,
        v_table
      )
      using cutoff;
      get diagnostics deleted_rows = row_count;
    end if;

    return next;
  end loop;

  policy_name := 'recommendation_evidence_manifests';
  target_table := 'public.recommendation_evidence_manifests';
  retention_days := 1;
  cutoff := pg_catalog.clock_timestamp() - interval '24 hours';
  dry_run := p_dry_run;
  deleted_rows := 0;

  select pg_catalog.count(*)
  into candidate_rows
  from public.recommendation_evidence_manifests as manifest
  where manifest.evidence_status = 'INCOMPLETE'
    and manifest.created_at < cutoff
    and not exists (
      select 1
      from public.recommendation_performance as performance
      where performance.evidence_manifest_id = manifest.id
    );

  if not p_dry_run and candidate_rows > 0 then
    perform pg_catalog.set_config('mtn.recommendation_evidence_retention', 'APPLY_RETENTION', true);
    with candidates as (
      select manifest.id
      from public.recommendation_evidence_manifests as manifest
      where manifest.evidence_status = 'INCOMPLETE'
        and manifest.created_at < cutoff
        and not exists (
          select 1
          from public.recommendation_performance as performance
          where performance.evidence_manifest_id = manifest.id
        )
      order by manifest.created_at
      limit 10000
    )
    delete from public.recommendation_evidence_manifests as manifest
    using candidates
    where manifest.id = candidates.id;
    get diagnostics deleted_rows = row_count;
  end if;

  return next;
end;
$$;

revoke all on function mtn_internal.automatic_capacity_retention_status()
  from public, anon, authenticated;
revoke all on function mtn_internal.apply_automatic_capacity_retention(boolean, text)
  from public, anon, authenticated;
grant execute on function mtn_internal.automatic_capacity_retention_status()
  to service_role;
grant execute on function mtn_internal.apply_automatic_capacity_retention(boolean, text)
  to service_role;

comment on function mtn_internal.automatic_capacity_retention_status() is
  'Returns live capacity trend and verified-backup gates for bounded automatic retention.';
comment on function mtn_internal.apply_automatic_capacity_retention(boolean, text) is
  'Deletes at most 10,000 old rows per allowlisted reproducible table when live capacity and backup gates pass.';

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname = 'mtn-database-capacity-monitor'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'mtn-database-capacity-monitor',
  '13 * * * *',
  $cron$select mtn_internal.capture_database_capacity();$cron$
);
