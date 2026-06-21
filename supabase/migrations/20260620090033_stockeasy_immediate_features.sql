-- Immediate StockEasy-inspired capabilities for MTN.
-- All access remains behind authenticated MTN server routes. The browser never
-- receives direct table grants because MTN uses its own signed session cookie.

create table if not exists public.saved_screens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  market text not null check (market in ('KR', 'US')),
  universe text not null,
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  sort_key text not null default 'recommendation',
  sort_direction text not null default 'desc' check (sort_direction in ('asc', 'desc')),
  engine_version text not null default 'scanner-v1',
  alert_on_enter boolean not null default false,
  alert_on_exit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists saved_screens_user_name_uidx
  on public.saved_screens (user_id, name);
create index if not exists saved_screens_user_updated_idx
  on public.saved_screens (user_id, updated_at desc);

alter table public.watchlist
  add column if not exists group_name text not null default '기본',
  add column if not exists sort_order integer not null default 0;

create index if not exists watchlist_user_group_order_idx
  on public.watchlist (user_id, group_name, sort_order, priority desc);

create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  scope text not null check (scope in ('SYMBOL', 'WATCHLIST_GROUP', 'SAVED_SCREEN', 'PORTFOLIO')),
  scope_id text not null,
  event_type text not null check (event_type in (
    'PIVOT_NEAR', 'STOP_NEAR', 'HIGH52_NEAR', 'BREAKOUT', 'PRICE_MOVE',
    'FILING', 'EARNINGS', 'SCREEN_ENTER', 'SCREEN_EXIT'
  )),
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  channels text[] not null default array['IN_APP']::text[],
  cooldown_minutes integer not null default 1440 check (cooldown_minutes between 1 and 43200),
  enabled boolean not null default true,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (channels <@ array['IN_APP', 'TELEGRAM']::text[] and cardinality(channels) > 0)
);

create index if not exists alert_rules_user_enabled_idx
  on public.alert_rules (user_id, enabled, event_type);
create index if not exists alert_rules_scope_idx
  on public.alert_rules (scope, scope_id) where enabled = true;

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  rule_id uuid references public.alert_rules(id) on delete set null,
  event_key text not null,
  event_type text not null,
  title text not null,
  message text not null,
  ticker text,
  exchange text,
  severity text not null default 'INFO' check (severity in ('INFO', 'WATCH', 'RISK')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists alert_events_user_key_uidx
  on public.alert_events (user_id, event_key);
create index if not exists alert_events_user_unread_idx
  on public.alert_events (user_id, occurred_at desc) where read_at is null;

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  market text not null check (market in ('KR', 'US')),
  ticker text not null,
  event_type text not null check (event_type in ('FILING', 'EARNINGS')),
  title text not null,
  summary text,
  source_url text,
  occurred_at timestamptz not null,
  observed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists security_events_ticker_time_idx
  on public.security_events (market, ticker, occurred_at desc);
create index if not exists security_events_recent_idx
  on public.security_events (occurred_at desc);

alter table public.saved_screens enable row level security;
alter table public.alert_rules enable row level security;
alter table public.alert_events enable row level security;
alter table public.security_events enable row level security;

revoke all on table public.saved_screens from anon, authenticated;
revoke all on table public.alert_rules from anon, authenticated;
revoke all on table public.alert_events from anon, authenticated;
revoke all on table public.security_events from anon, authenticated;

grant select, insert, update, delete on table public.saved_screens to service_role;
grant select, insert, update, delete on table public.alert_rules to service_role;
grant select, insert, update, delete on table public.alert_events to service_role;
grant select, insert, update, delete on table public.security_events to service_role;

drop policy if exists "Service role manages saved screens" on public.saved_screens;
create policy "Service role manages saved screens" on public.saved_screens
  for all to service_role using (true) with check (true);

drop policy if exists "Service role manages alert rules" on public.alert_rules;
create policy "Service role manages alert rules" on public.alert_rules
  for all to service_role using (true) with check (true);

drop policy if exists "Service role manages alert events" on public.alert_events;
create policy "Service role manages alert events" on public.alert_events
  for all to service_role using (true) with check (true);

drop policy if exists "Service role manages security events" on public.security_events;
create policy "Service role manages security events" on public.security_events
  for all to service_role using (true) with check (true);

do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is not null then
    drop trigger if exists trg_saved_screens_updated_at on public.saved_screens;
    create trigger trg_saved_screens_updated_at before update on public.saved_screens
      for each row execute function public.update_updated_at_column();

    drop trigger if exists trg_alert_rules_updated_at on public.alert_rules;
    create trigger trg_alert_rules_updated_at before update on public.alert_rules
      for each row execute function public.update_updated_at_column();

    drop trigger if exists trg_security_events_updated_at on public.security_events;
    create trigger trg_security_events_updated_at before update on public.security_events
      for each row execute function public.update_updated_at_column();
  end if;
end $$;
