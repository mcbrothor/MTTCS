create table if not exists public.api_token_cache (
  provider text primary key,
  access_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.api_token_cache disable row level security;

create index if not exists idx_api_token_cache_expires_at
  on public.api_token_cache (expires_at);
