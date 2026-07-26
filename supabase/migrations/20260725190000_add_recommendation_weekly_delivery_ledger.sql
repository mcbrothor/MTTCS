-- Prevent duplicate weekly Telegram reports after partial delivery or cron retries.

create table if not exists public.recommendation_weekly_deliveries (
  report_key text not null,
  recipient_key text not null,
  message_hash text not null,
  status text not null check (status in ('SENDING', 'SENT', 'FAILED')),
  attempts integer not null default 1 check (attempts > 0),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (report_key, recipient_key)
);

alter table public.recommendation_weekly_deliveries enable row level security;
revoke all on table public.recommendation_weekly_deliveries from anon, authenticated;
grant all on table public.recommendation_weekly_deliveries to service_role;

create or replace function public.claim_recommendation_weekly_delivery(
  p_report_key text,
  p_recipient_key text,
  p_message_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed boolean := false;
  claimed_count integer := 0;
begin
  insert into public.recommendation_weekly_deliveries (
    report_key,
    recipient_key,
    message_hash,
    status
  )
  values (
    p_report_key,
    p_recipient_key,
    p_message_hash,
    'SENDING'
  )
  on conflict (report_key, recipient_key) do nothing;

  if found then
    return true;
  end if;

  update public.recommendation_weekly_deliveries
  set
    message_hash = p_message_hash,
    status = 'SENDING',
    attempts = attempts + 1,
    last_error = null,
    updated_at = now()
  where report_key = p_report_key
    and recipient_key = p_recipient_key
    and status = 'FAILED';

  get diagnostics claimed_count = row_count;
  claimed := claimed_count > 0;
  return claimed;
end;
$$;

revoke all on function public.claim_recommendation_weekly_delivery(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_recommendation_weekly_delivery(text, text, text) to service_role;
