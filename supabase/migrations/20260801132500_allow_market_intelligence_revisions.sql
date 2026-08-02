-- The original StockEasy table allowed only one row per source event.
-- Market Intelligence keeps corrected releases as immutable revisions, so the
-- content hash must participate in the uniqueness boundary.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'market_intelligence_events_source_external_id_key'
      and conrelid = 'public.market_intelligence_events'::regclass
      and contype = 'u'
  ) then
    alter table public.market_intelligence_events
      drop constraint market_intelligence_events_source_external_id_key;
  end if;
end;
$$;

comment on constraint market_intelligence_events_source_external_id_content_hash_key
  on public.market_intelligence_events is
  'Deduplicates identical observations while preserving corrected source revisions.';
