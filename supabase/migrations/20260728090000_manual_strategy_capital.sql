alter table public.gold_strategy_settings
  add column if not exists manual_account_value numeric(24, 4);

alter table public.gold_strategy_settings
  drop constraint if exists gold_strategy_settings_manual_account_value_check;

alter table public.gold_strategy_settings
  add constraint gold_strategy_settings_manual_account_value_check
  check (manual_account_value is null or manual_account_value > 0);

comment on column public.gold_strategy_settings.manual_account_value is
  'Optional user-entered principal used only for strategy sizing; null falls back to the integrated portfolio value.';

alter table public.nasdaq_strategy_settings
  add column if not exists manual_account_value numeric(24, 4);

alter table public.nasdaq_strategy_settings
  drop constraint if exists nasdaq_strategy_settings_manual_account_value_check;

alter table public.nasdaq_strategy_settings
  add constraint nasdaq_strategy_settings_manual_account_value_check
  check (manual_account_value is null or manual_account_value > 0);

comment on column public.nasdaq_strategy_settings.manual_account_value is
  'Optional user-entered principal used only for strategy sizing; null falls back to the integrated portfolio value.';
