-- Security Advisor remediation:
-- - protect KIS token cache with service-role-only RLS
-- - replace broad always-true service policies with explicit service_role checks
-- - pin mutable function search_path when the trigger helper exists

alter table if exists public.api_token_cache enable row level security;

revoke all on table public.api_token_cache from anon;
revoke all on table public.api_token_cache from authenticated;

drop policy if exists "Service role full access" on public.api_token_cache;
create policy "Service role full access" on public.api_token_cache
  for all to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'trades',
    'watchlist',
    'trade_executions',
    'beauty_contest_sessions',
    'contest_candidates',
    'contest_reviews',
    'trade_stop_events',
    'trade_exit_rules',
    'portfolio_settings',
    'security_profiles'
  ]
  loop
    if to_regclass(format('public.%I', tbl)) is not null then
      execute format('alter table public.%I enable row level security', tbl);
      execute format('drop policy if exists "Service role full access" on public.%I', tbl);
      execute format(
        'create policy "Service role full access" on public.%I for all to service_role using (auth.role() = %L) with check (auth.role() = %L)',
        tbl,
        'service_role',
        'service_role'
      );
    end if;
  end loop;
end
$$;

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is not null then
    alter function public.update_updated_at_column() set search_path = public, pg_temp;
  end if;
end
$$;
