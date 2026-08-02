-- Free-tier scheduler for jobs that must run more than once per day.
-- Vercel Hobby remains responsible only for once-daily jobs in vercel.json.
-- Required Vault secrets (created by an operator, never committed):
--   mtn_app_base_url = https://<production-host>
--   mtn_cron_secret = the same value as the Vercel CRON_SECRET

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create extension if not exists supabase_vault with schema vault;

create schema if not exists mtn_internal;
revoke all on schema mtn_internal from public, anon, authenticated;

create or replace function mtn_internal.invoke_cron(path text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_base_url text;
  cron_secret text;
  request_id bigint;
begin
  if path is null
    or path not like '/api/cron/%'
    or path like '%://%'
    or path like '%' || chr(10) || '%'
    or path like '%' || chr(13) || '%'
  then
    raise exception 'Only relative /api/cron/* paths are allowed.';
  end if;

  select decrypted_secret
  into app_base_url
  from vault.decrypted_secrets
  where name = 'mtn_app_base_url'
  order by updated_at desc
  limit 1;

  select decrypted_secret
  into cron_secret
  from vault.decrypted_secrets
  where name = 'mtn_cron_secret'
  order by updated_at desc
  limit 1;

  if app_base_url is null or cron_secret is null then
    raise exception 'Vault secrets mtn_app_base_url and mtn_cron_secret are required.';
  end if;
  if app_base_url !~ '^https://[A-Za-z0-9.-]+(?::[0-9]+)?$' then
    raise exception 'mtn_app_base_url must be an HTTPS origin without a path.';
  end if;

  select net.http_get(
    url := rtrim(app_base_url, '/') || path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cron_secret,
      'User-Agent', 'mtn-supabase-cron/1.0'
    ),
    timeout_milliseconds := 55000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function mtn_internal.invoke_cron(text) from public, anon, authenticated;

-- Re-applying the migration must not create duplicate schedules.
select cron.unschedule(jobid)
from cron.job
where jobname in (
  'mtn-market-intelligence-feeds',
  'mtn-market-intelligence-indicators',
  'mtn-cron-history-prune'
);

-- Official RSS feeds are polled every 30 minutes to protect the free runtime.
-- The later control-plane migration adds a 45-minute freshness SLA.
select cron.schedule(
  'mtn-market-intelligence-feeds',
  '*/30 * * * *',
  $cron$select mtn_internal.invoke_cron('/api/cron/market-intelligence?mode=feeds');$cron$
);

-- BLS releases are normally at 08:30 ET. Both UTC windows cover daylight and
-- standard time; three retries keep the unregistered API within its daily quota.
select cron.schedule(
  'mtn-market-intelligence-indicators',
  '35,45,55 12,13 * * *',
  $cron$select mtn_internal.invoke_cron('/api/cron/market-intelligence?mode=indicators');$cron$
);

-- pg_cron does not prune run history automatically. Bound it on the 500 MB
-- Supabase Free database instead of allowing scheduler metadata to grow forever.
select cron.schedule(
  'mtn-cron-history-prune',
  '17 02 * * *',
  $cron$delete from cron.job_run_details where end_time < now() - interval '30 days';$cron$
);

comment on function mtn_internal.invoke_cron(text) is
  'Invokes protected MTN cron routes from Supabase Cron using encrypted Vault secrets.';
