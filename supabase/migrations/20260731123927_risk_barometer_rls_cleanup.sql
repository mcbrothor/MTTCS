-- service_role bypasses RLS by design. Explicit service-role policies are
-- unnecessary and avoid the deprecated auth.role() helper.
do $$
begin
  execute 'drop policy if exists "Service role manages risk barometer observations" on public.risk_barometer_indicator_observations';
  execute 'drop policy if exists "Service role manages risk barometer snapshots" on public.risk_barometer_snapshots';
end
$$;
