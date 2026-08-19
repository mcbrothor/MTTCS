-- KOSPI200 + KOSDAQ150 수급을 KIS 제한 안에서 40종목씩 수집한다.

insert into public.cron_job_definitions (
  job_name, path, schedule, slot_minutes, expected_delay_seconds, enabled, updated_at
)
values
  ('mtn-investor-flow-kr-0', '/api/cron/investor-flow?cursor=0&size=40', '20 07 * * 1-5', 1, 352800, true, now()),
  ('mtn-investor-flow-kr-1', '/api/cron/investor-flow?cursor=40&size=40', '22 07 * * 1-5', 1, 352800, true, now()),
  ('mtn-investor-flow-kr-2', '/api/cron/investor-flow?cursor=80&size=40', '24 07 * * 1-5', 1, 352800, true, now()),
  ('mtn-investor-flow-kr-3', '/api/cron/investor-flow?cursor=120&size=40', '26 07 * * 1-5', 1, 352800, true, now()),
  ('mtn-investor-flow-kr-4', '/api/cron/investor-flow?cursor=160&size=40', '28 07 * * 1-5', 1, 352800, true, now()),
  ('mtn-investor-flow-kr-5', '/api/cron/investor-flow?cursor=200&size=40', '30 07 * * 1-5', 1, 352800, true, now()),
  ('mtn-investor-flow-kr-6', '/api/cron/investor-flow?cursor=240&size=40', '32 07 * * 1-5', 1, 352800, true, now()),
  ('mtn-investor-flow-kr-7', '/api/cron/investor-flow?cursor=280&size=40', '34 07 * * 1-5', 1, 352800, true, now()),
  ('mtn-investor-flow-kr-8', '/api/cron/investor-flow?cursor=320&size=40', '36 07 * * 1-5', 1, 352800, true, now())
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
    select jobid from cron.job where jobname like 'mtn-investor-flow-kr-%'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

do $$
declare
  definition record;
begin
  for definition in
    select job_name, path, schedule, slot_minutes
    from public.cron_job_definitions
    where enabled and job_name like 'mtn-investor-flow-kr-%'
    order by job_name
  loop
    perform cron.schedule(
      definition.job_name,
      definition.schedule,
      format('select mtn_internal.invoke_cron(%L, %L, %s);', definition.job_name, definition.path, definition.slot_minutes)
    );
  end loop;
end;
$$;
