-- Add 52-week MDD (Maximum Drawdown) column to stock_metrics.
-- Computed via rolling-peak method on closing prices over the last 252 trading days.

alter table public.stock_metrics
  add column if not exists mdd_52w_pct numeric(8, 2);
