-- Restrict broad RLS policies that were previously created without a TO clause.
-- Without TO service_role, Supabase anon/authenticated roles can match USING (true).

DROP POLICY IF EXISTS "Service role full access" ON public.trades;
CREATE POLICY "Service role full access" ON public.trades
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.watchlist;
CREATE POLICY "Service role full access" ON public.watchlist
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.trade_executions;
CREATE POLICY "Service role full access" ON public.trade_executions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.beauty_contest_sessions;
CREATE POLICY "Service role full access" ON public.beauty_contest_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.contest_candidates;
CREATE POLICY "Service role full access" ON public.contest_candidates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.contest_reviews;
CREATE POLICY "Service role full access" ON public.contest_reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.trade_stop_events;
CREATE POLICY "Service role full access" ON public.trade_stop_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.trade_exit_rules;
CREATE POLICY "Service role full access" ON public.trade_exit_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.portfolio_settings;
CREATE POLICY "Service role full access" ON public.portfolio_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.security_profiles;
CREATE POLICY "Service role full access" ON public.security_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
