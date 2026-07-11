-- Restrict privileged retention maintenance to service-role callers and make
-- destructive execution explicit. The legacy zero-argument function remains
-- in place temporarily for rollback compatibility, but is no longer callable
-- through the Data API roles.

revoke all on function public.maintain_stock_metrics_retention()
  from public, anon, authenticated, service_role;

create or replace function public.maintain_stock_metrics_retention_v2(
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_retention_limit date := (current_date - interval '12 months')::date;
  v_aggregation_limit date := (current_date - interval '3 months')::date;
  v_weekly_groups bigint := 0;
  v_daily_rows bigint := 0;
  v_expired_rows bigint := 0;
begin
  -- Serialize this maintenance task even when cron and a manual invocation overlap.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('public.maintain_stock_metrics_retention_v2')
  );

  select count(*)
    into v_weekly_groups
  from (
    select metrics.ticker, metrics.market, pg_catalog.date_trunc('week', metrics.calc_date)::date
    from public.stock_metrics as metrics
    where metrics.calc_date < v_aggregation_limit
      and metrics.calc_date >= v_retention_limit
    group by metrics.ticker, metrics.market, pg_catalog.date_trunc('week', metrics.calc_date)::date
  ) as weekly_groups;

  select count(*)
    into v_daily_rows
  from public.stock_metrics as metrics
  where metrics.calc_date < v_aggregation_limit
    and metrics.calc_date >= v_retention_limit
    and pg_catalog.date_part('dow', metrics.calc_date) <> 1;

  select count(*)
    into v_expired_rows
  from public.stock_metrics as metrics
  where metrics.calc_date < v_retention_limit;

  if not p_dry_run then
    insert into public.stock_metrics (
      ticker,
      market,
      calc_date,
      rs_rating,
      ibd_proxy_score,
      mansfield_rs_score,
      data_quality,
      price_source
    )
    select
      metrics.ticker,
      metrics.market,
      pg_catalog.date_trunc('week', metrics.calc_date)::date,
      pg_catalog.avg(metrics.rs_rating)::integer,
      pg_catalog.avg(metrics.ibd_proxy_score),
      pg_catalog.avg(metrics.mansfield_rs_score),
      'PARTIAL',
      'AGGREGATED'
    from public.stock_metrics as metrics
    where metrics.calc_date < v_aggregation_limit
      and metrics.calc_date >= v_retention_limit
    group by metrics.ticker, metrics.market, pg_catalog.date_trunc('week', metrics.calc_date)::date
    on conflict (ticker, market, calc_date) do update
    set
      rs_rating = excluded.rs_rating,
      ibd_proxy_score = excluded.ibd_proxy_score,
      mansfield_rs_score = excluded.mansfield_rs_score,
      data_quality = 'PARTIAL',
      price_source = 'AGGREGATED',
      updated_at = pg_catalog.now();

    delete from public.stock_metrics as metrics
    where metrics.calc_date < v_aggregation_limit
      and metrics.calc_date >= v_retention_limit
      and pg_catalog.date_part('dow', metrics.calc_date) <> 1;

    delete from public.stock_metrics as metrics
    where metrics.calc_date < v_retention_limit;
  end if;

  return pg_catalog.jsonb_build_object(
    'dry_run', p_dry_run,
    'aggregation_limit', v_aggregation_limit,
    'retention_limit', v_retention_limit,
    'weekly_groups', v_weekly_groups,
    'weekly_rows_upserted', case when p_dry_run then 0 else v_weekly_groups end,
    'daily_rows', v_daily_rows,
    'daily_rows_deleted', case when p_dry_run then 0 else v_daily_rows end,
    'expired_rows', v_expired_rows,
    'expired_rows_deleted', case when p_dry_run then 0 else v_expired_rows end
  );
end;
$$;

revoke all on function public.maintain_stock_metrics_retention_v2(boolean)
  from public, anon, authenticated;
grant execute on function public.maintain_stock_metrics_retention_v2(boolean)
  to service_role;

comment on function public.maintain_stock_metrics_retention_v2(boolean) is
  'Reports or applies stock_metrics weekly aggregation and retention; destructive execution requires p_dry_run=false and service_role.';
