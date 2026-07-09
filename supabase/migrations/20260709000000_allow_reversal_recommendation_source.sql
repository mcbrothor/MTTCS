-- Allow the reversal scanner to participate in daily recommendations.

alter table public.daily_screener_candidates
  drop constraint if exists daily_screener_candidates_source_check;

alter table public.daily_screener_candidates
  add constraint daily_screener_candidates_source_check
  check (source in ('minervini', 'canslim', 'leader', 'momentum', 'qullamaggie', 'reversal'));

alter table public.recommendation_picks
  drop constraint if exists recommendation_picks_source_check;

alter table public.recommendation_picks
  add constraint recommendation_picks_source_check
  check (source in ('minervini', 'canslim', 'leader', 'momentum', 'qullamaggie', 'reversal', 'mixed'));
