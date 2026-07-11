alter function public.maintain_stock_metrics_retention()
  set search_path = '';

revoke execute on function public.update_updated_at_column()
  from public, anon, authenticated;
