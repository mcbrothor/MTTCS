-- 월말 확정 신호를 장 마감 후 반복 계산한다. 같은 입력은 input_hash로 멱등 저장된다.

insert into public.cron_job_definitions (
  job_name, path, schedule, slot_minutes, expected_delay_seconds, enabled, updated_at
)
values
  (
    'mtn-monthly-strategy-kr',
    '/api/cron/monthly-strategies?market=KR',
    '20 07 * * 1-5',
    1,
    352800,
    true,
    now()
  ),
  (
    'mtn-monthly-strategy-us',
    '/api/cron/monthly-strategies?market=US',
    '20 21 * * 1-5',
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
    select jobid
    from cron.job
    where jobname in ('mtn-monthly-strategy-kr', 'mtn-monthly-strategy-us')
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'mtn-monthly-strategy-kr',
  '20 07 * * 1-5',
  $$select mtn_internal.invoke_cron('mtn-monthly-strategy-kr', '/api/cron/monthly-strategies?market=KR', 1);$$
);

select cron.schedule(
  'mtn-monthly-strategy-us',
  '20 21 * * 1-5',
  $$select mtn_internal.invoke_cron('mtn-monthly-strategy-us', '/api/cron/monthly-strategies?market=US', 1);$$
);
