-- Keep immutable recommendation evidence bounded on the free-tier database.
-- Historical incomplete rows remain valid until an explicitly confirmed
-- maintenance run removes only superseded, unreferenced snapshots.

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'recommendation_evidence_manifests_ready_only'
      and conrelid = 'public.recommendation_evidence_manifests'::pg_catalog.regclass
  ) then
    alter table public.recommendation_evidence_manifests
      add constraint recommendation_evidence_manifests_ready_only
      check (evidence_status = 'READY') not valid;
  end if;
end $$;

create or replace function public.prevent_recommendation_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and tg_table_schema = 'public'
    and tg_table_name = 'recommendation_evidence_manifests'
    and pg_catalog.current_setting('mtn.recommendation_evidence_retention', true) = 'APPLY_RETENTION'
    and old.evidence_status = 'INCOMPLETE'
    and not exists (
      select 1
      from public.recommendation_performance as performance
      where performance.evidence_manifest_id = old.id
    )
  then
    return old;
  end if;

  raise exception 'Recommendation evidence rows are immutable; append a new snapshot instead.'
    using errcode = '55000';
end;
$$;

create or replace function mtn_internal.apply_recommendation_evidence_retention(
  p_dry_run boolean default true,
  p_confirmation text default null
)
returns table (
  candidate_rows bigint,
  deleted_rows bigint,
  dry_run boolean
)
language plpgsql
security definer
set search_path = ''
as $$
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
    pg_catalog.hashtext('mtn_internal.apply_recommendation_evidence_retention')
  );

  select pg_catalog.count(*)
  into candidate_rows
  from public.recommendation_evidence_manifests as manifest
  where manifest.evidence_status = 'INCOMPLETE'
    and manifest.created_at < pg_catalog.clock_timestamp() - interval '24 hours'
    and not exists (
      select 1
      from public.recommendation_performance as performance
      where performance.evidence_manifest_id = manifest.id
    );

  deleted_rows := 0;
  dry_run := p_dry_run;
  if not p_dry_run and candidate_rows > 0 then
    perform pg_catalog.set_config('mtn.recommendation_evidence_retention', 'APPLY_RETENTION', true);
    delete from public.recommendation_evidence_manifests as manifest
    where manifest.evidence_status = 'INCOMPLETE'
      and manifest.created_at < pg_catalog.clock_timestamp() - interval '24 hours'
      and not exists (
        select 1
        from public.recommendation_performance as performance
        where performance.evidence_manifest_id = manifest.id
      );
    get diagnostics deleted_rows = row_count;
  end if;

  return next;
end;
$$;

revoke all on function mtn_internal.apply_recommendation_evidence_retention(boolean, text)
  from public, anon, authenticated;
grant execute on function mtn_internal.apply_recommendation_evidence_retention(boolean, text)
  to service_role;

drop trigger if exists trg_mtn_noncritical_capacity_gate
  on public.recommendation_evidence_manifests;
create trigger trg_mtn_noncritical_capacity_gate
  before insert or update on public.recommendation_evidence_manifests
  for each statement execute function mtn_internal.enforce_noncritical_capacity_gate();

comment on function mtn_internal.apply_recommendation_evidence_retention(boolean, text) is
  'Reports superseded incomplete manifests by default; deletion requires APPLY_RETENTION and preserves every referenced or READY manifest.';
