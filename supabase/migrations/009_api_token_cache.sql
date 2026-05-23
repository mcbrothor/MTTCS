create table if not exists public.api_token_cache (
  provider text primary key,
  access_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.api_token_cache enable row level security;

revoke all on public.api_token_cache from anon;
revoke all on public.api_token_cache from authenticated;

drop policy if exists "Service role full access" on public.api_token_cache;
create policy "Service role full access" on public.api_token_cache
  for all to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create index if not exists idx_api_token_cache_expires_at
  on public.api_token_cache (expires_at);
