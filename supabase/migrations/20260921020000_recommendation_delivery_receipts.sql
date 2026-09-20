create table public.recommendation_telegram_deliveries (
  delivery_key text primary key,
  publication_id uuid not null references public.recommendation_publications(id),
  chat_id_hash text not null,
  chunk_index integer not null check (chunk_index >= 0),
  content_sha256 text not null,
  status text not null check (status in ('CLAIMED', 'SENT', 'FAILED', 'UNCERTAIN')),
  owner_id uuid not null,
  lease_until timestamptz not null,
  telegram_message_id bigint,
  error_message text,
  updated_at timestamptz not null default now(),
  unique(publication_id, chat_id_hash, chunk_index)
);
alter table public.recommendation_telegram_deliveries enable row level security;
revoke all on public.recommendation_telegram_deliveries from public, anon, authenticated;
grant select, insert, update on public.recommendation_telegram_deliveries to service_role;
create policy service_delivery_receipts on public.recommendation_telegram_deliveries for all to service_role using (true) with check (true);

alter table public.recommendation_publications drop constraint recommendation_publications_telegram_status_check;
alter table public.recommendation_publications add constraint recommendation_publications_telegram_status_check
  check (telegram_status in ('PENDING', 'SENT', 'FAILED', 'SKIPPED', 'UNCERTAIN', 'EXPIRED'));

create function public.claim_recommendation_telegram_chunk(
  p_key text, p_publication_id uuid, p_chat_hash text, p_chunk integer,
  p_content_hash text, p_owner uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare receipt public.recommendation_telegram_deliveries;
begin
  insert into public.recommendation_telegram_deliveries
    (delivery_key, publication_id, chat_id_hash, chunk_index, content_sha256, status, owner_id, lease_until)
  values (p_key, p_publication_id, p_chat_hash, p_chunk, p_content_hash, 'CLAIMED', p_owner, now() + interval '2 minutes')
  on conflict (delivery_key) do nothing;
  select * into receipt from public.recommendation_telegram_deliveries where delivery_key=p_key for update;
  if receipt.content_sha256 <> p_content_hash then
    raise exception 'Delivery content changed for an existing chunk';
  end if;
  -- A crashed sender may have reached Telegram. Lease expiration is NOT permission to resend.
  if receipt.status='CLAIMED' and receipt.lease_until <= now() then
    update public.recommendation_telegram_deliveries set status='UNCERTAIN', updated_at=now()
    where delivery_key=p_key returning * into receipt;
  elsif receipt.status='FAILED' then
    update public.recommendation_telegram_deliveries set status='CLAIMED', owner_id=p_owner,
      lease_until=now()+interval '2 minutes', updated_at=now(), error_message=null
    where delivery_key=p_key returning * into receipt;
  end if;
  return to_jsonb(receipt);
end;
$$;
revoke all on function public.claim_recommendation_telegram_chunk(text, uuid, text, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_recommendation_telegram_chunk(text, uuid, text, integer, text, uuid) to service_role;

create index recommendation_telegram_retry_idx on public.recommendation_publications(run_date desc, category)
  where telegram_status in ('PENDING', 'FAILED');
