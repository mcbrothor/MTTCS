-- Separate published recommendation candidates from positions eligible for performance evaluation.
-- Historical picks remain ACTIVE so existing performance tracking continues without interruption.

alter table public.recommendation_picks
  add column if not exists action_state text not null default 'ACTIVE',
  add column if not exists activated_at timestamptz,
  add column if not exists activation_source text,
  add column if not exists activation_metadata jsonb not null default '{}'::jsonb;

-- The add-column default backfills historical rows as ACTIVE. New inserts that bypass
-- the persistence classifier must fail closed as WATCHLIST.
alter table public.recommendation_picks
  alter column action_state set default 'WATCHLIST';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recommendation_picks_action_state_check'
      and conrelid = 'public.recommendation_picks'::regclass
  ) then
    alter table public.recommendation_picks
      add constraint recommendation_picks_action_state_check
      check (action_state in ('ACTIVE', 'WATCHLIST'));
  end if;
end $$;

create index if not exists recommendation_picks_active_created_idx
  on public.recommendation_picks (created_at desc, id)
  where action_state = 'ACTIVE';

comment on column public.recommendation_picks.action_state is
  'ACTIVE picks are eligible for performance evaluation; historical rows were backfilled ACTIVE and unclassified new rows default WATCHLIST.';
comment on column public.recommendation_picks.activated_at is
  'Initial or later activation timestamp. Historical ACTIVE rows may be null.';
comment on column public.recommendation_picks.activation_source is
  'Rule or workflow that activated the pick; current recommendations require ALLOCATION_AND_CHART_GATE.';
comment on column public.recommendation_picks.activation_metadata is
  'Immutable-at-insert evidence used for the initial ACTIVE/WATCHLIST decision.';
