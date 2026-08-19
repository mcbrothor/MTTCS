-- KOSPI 지수와 KOSPI200 옵션 Put/Call을 장 마감 후 자동 수집한다.

insert into public.cron_job_definitions (
  job_name, path, schedule, slot_minutes, expected_delay_seconds, enabled, updated_at
)
values (
  'mtn-market-sentiment-kr',
  '/api/cron/market-sentiment',
  '12 07 * * 1-5',
  1,
  352800,
  true,
  now()
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
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'mtn-market-sentiment-kr'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'mtn-market-sentiment-kr',
  '12 07 * * 1-5',
  $$select mtn_internal.invoke_cron('mtn-market-sentiment-kr', '/api/cron/market-sentiment', 1);$$
);
