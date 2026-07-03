-- Recommendation publications are now split into four output categories.
-- Existing market-level rows remain as legacy rows with category = null.

alter table public.recommendation_publications
  add column if not exists category text;

alter table public.recommendation_diagnostic_findings
  add column if not exists category text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recommendation_publications_category_check'
      and conrelid = 'public.recommendation_publications'::regclass
  ) then
    alter table public.recommendation_publications
      add constraint recommendation_publications_category_check
      check (category is null or category in ('NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'recommendation_findings_category_check'
      and conrelid = 'public.recommendation_diagnostic_findings'::regclass
  ) then
    alter table public.recommendation_diagnostic_findings
      add constraint recommendation_findings_category_check
      check (category is null or category in ('NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150'));
  end if;
end $$;

alter table public.recommendation_publications
  drop constraint if exists recommendation_publications_run_date_market_version_key;

drop index if exists public.recommendation_publications_official_uniq;

create unique index if not exists recommendation_publications_legacy_market_version_uniq
  on public.recommendation_publications (run_date, market, version)
  where category is null;

create unique index if not exists recommendation_publications_category_version_uniq
  on public.recommendation_publications (run_date, category, version)
  where category is not null;

create unique index if not exists recommendation_publications_legacy_official_uniq
  on public.recommendation_publications (run_date, market)
  where is_official = true and category is null;

create unique index if not exists recommendation_publications_category_official_uniq
  on public.recommendation_publications (run_date, category)
  where is_official = true and category is not null;

create index if not exists recommendation_publications_category_date_idx
  on public.recommendation_publications (category, run_date desc, id)
  where category is not null;

create index if not exists recommendation_findings_category_horizon_idx
  on public.recommendation_diagnostic_findings (category, horizon, analyzed_at desc)
  where category is not null;
