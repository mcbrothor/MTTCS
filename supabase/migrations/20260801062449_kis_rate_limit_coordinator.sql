create table if not exists public.provider_rate_limit_slots (
  limiter_key text primary key,
  next_allowed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint provider_rate_limit_slots_key_length
    check (char_length(limiter_key) between 1 and 128)
);

alter table public.provider_rate_limit_slots enable row level security;

revoke all on table public.provider_rate_limit_slots from public, anon, authenticated;
grant select, insert, update on table public.provider_rate_limit_slots to service_role;

create or replace function public.reserve_provider_rate_limit_slot(
  p_limiter_key text,
  p_interval_ms integer
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_interval interval;
  v_reserved_at timestamptz;
begin
  if p_limiter_key is null or char_length(p_limiter_key) not between 1 and 128 then
    raise exception 'limiter key must contain 1 to 128 characters'
      using errcode = '22023';
  end if;

  if p_interval_ms is null or p_interval_ms < 0 or p_interval_ms > 60000 then
    raise exception 'interval must be between 0 and 60000 milliseconds'
      using errcode = '22023';
  end if;

  v_interval := make_interval(secs => p_interval_ms::double precision / 1000.0);

  insert into public.provider_rate_limit_slots (
    limiter_key,
    next_allowed_at,
    updated_at
  )
  values (
    p_limiter_key,
    v_now + v_interval,
    v_now
  )
  on conflict (limiter_key) do update
    set next_allowed_at = greatest(
          public.provider_rate_limit_slots.next_allowed_at,
          v_now
        ) + v_interval,
        updated_at = v_now
  returning next_allowed_at - v_interval into v_reserved_at;

  return v_reserved_at;
end;
$$;

revoke all on function public.reserve_provider_rate_limit_slot(text, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_provider_rate_limit_slot(text, integer)
  to service_role;

comment on table public.provider_rate_limit_slots is
  'Provider-account request slots shared by all server instances.';
comment on function public.reserve_provider_rate_limit_slot(text, integer) is
  'Atomically reserves the next provider request start time for a hashed limiter key.';
