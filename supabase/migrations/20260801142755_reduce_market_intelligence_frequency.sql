-- Reduce official-feed polling from five minutes to thirty minutes. A
-- forty-five-minute SLA allows one delayed run without presenting stale data as
-- current, while materially reducing free-tier function and provider traffic.

do $$
declare
  updated_count integer;
begin
  update public.cron_job_definitions
  set schedule = '*/30 * * * *',
      slot_minutes = 30,
      expected_delay_seconds = 2700,
      updated_at = clock_timestamp()
  where job_name = 'mtn-market-intelligence-feeds'
    and path = '/api/cron/market-intelligence?mode=feeds';

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected exactly one market-intelligence feed definition, updated %.', updated_count;
  end if;
end;
$$;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'mtn-market-intelligence-feeds'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'mtn-market-intelligence-feeds',
  '*/30 * * * *',
  $cron$
    select mtn_internal.invoke_cron(
      'mtn-market-intelligence-feeds',
      '/api/cron/market-intelligence?mode=feeds',
      30
    );
  $cron$
);
