create table public.closing_bet_snapshots (
  id text primary key,
  trade_date date not null,
  market text not null check (market in ('KOSPI200', 'KOSDAQ150')),
  mode text not null check (mode in ('LIVE', 'REPLAY')),
  phase text not null check (phase in ('WATCH', 'FINAL')),
  model_version text not null,
  as_of timestamptz not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (trade_date, market, mode, phase, model_version)
);
create index closing_bet_snapshots_latest on public.closing_bet_snapshots (trade_date desc, mode, market);

create table public.closing_bet_cache (
  key text primary key,
  payload jsonb not null,
  observed_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index closing_bet_cache_expiry on public.closing_bet_cache (expires_at);

create table public.closing_bet_deliveries (
  snapshot_id text not null references public.closing_bet_snapshots(id),
  chat_hash text not null,
  kind text not null,
  chunk integer not null check (chunk >= 0),
  status text not null check (status in ('CLAIMED', 'SENT', 'FAILED', 'UNCERTAIN')),
  message_id bigint,
  error text,
  updated_at timestamptz not null default now(),
  primary key (snapshot_id, chat_hash, kind, chunk)
);

create table public.closing_bet_evaluations (
  snapshot_id text not null references public.closing_bet_snapshots(id),
  ticker text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (snapshot_id, ticker)
);

create table public.closing_bet_locks (
  key text primary key,
  token uuid not null,
  expires_at timestamptz not null
);

create or replace function public.claim_closing_bet_lock(p_key text, p_token uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare acquired boolean;
begin
  insert into public.closing_bet_locks as l(key, token, expires_at)
  values (p_key, p_token, now() + interval '15 minutes')
  on conflict (key) do update set token = excluded.token, expires_at = excluded.expires_at
  where l.expires_at < now()
  returning true into acquired;
  return coalesce(acquired, false);
end;
$$;

alter table public.closing_bet_snapshots enable row level security;
alter table public.closing_bet_cache enable row level security;
alter table public.closing_bet_deliveries enable row level security;
alter table public.closing_bet_evaluations enable row level security;
alter table public.closing_bet_locks enable row level security;
revoke all on public.closing_bet_snapshots, public.closing_bet_cache, public.closing_bet_deliveries,
  public.closing_bet_evaluations, public.closing_bet_locks from anon, authenticated;
grant all on public.closing_bet_snapshots, public.closing_bet_cache, public.closing_bet_deliveries,
  public.closing_bet_evaluations, public.closing_bet_locks to service_role;
revoke all on function public.claim_closing_bet_lock(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_closing_bet_lock(text, uuid) to service_role;
