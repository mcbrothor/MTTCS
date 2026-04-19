-- DART corporate codes mapping for Top 350 KR stocks (KOSPI 200, KOSDAQ 150).
-- Managed by /api/admin/dart/sync and used by DART API provider.

create table if not exists public.dart_corp_codes (
  id uuid primary key default gen_random_uuid(),
  corp_code text not null unique,       -- 8-digit DART identifier
  corp_name text not null,              -- Corporate name
  stock_code text unique,               -- 6-digit KRX ticker
  modify_date text,                     -- Last modified date from DART
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast lookup by stock code (ticker)
create index if not exists idx_dart_corp_codes_stock_code 
  on public.dart_corp_codes (stock_code);

alter table public.dart_corp_codes enable row level security;

-- Read access for authenticated users
drop policy if exists "Authenticated read dart corp codes" on public.dart_corp_codes;
create policy "Authenticated read dart corp codes" on public.dart_corp_codes
  for select to authenticated
  using (auth.role() = 'authenticated');

-- Full access for service role (Admin sync)
drop policy if exists "Service role full access" on public.dart_corp_codes;
create policy "Service role full access" on public.dart_corp_codes
  for all to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Trigger for auto-updating updated_at
do $$
begin
  if to_regprocedure('public.update_updated_at_column()') is not null then
    drop trigger if exists trg_dart_corp_codes_updated_at on public.dart_corp_codes;
    create trigger trg_dart_corp_codes_updated_at
      before update on public.dart_corp_codes
      for each row execute function public.update_updated_at_column();
  end if;
end
$$;
