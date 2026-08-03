-- Close Supabase default-privilege inheritance around the conditional assurance ledger.
-- Append-only triggers already reject mutation; this also removes the underlying
-- UPDATE/DELETE grants so the application role itself is least-privileged.

revoke all on table public.recommendation_longitudinal_evaluations from service_role;
revoke all on table public.recommendation_decision_events from service_role;
revoke all on table public.recommendation_pilot_links from service_role;
revoke all on table public.recommendation_broker_evidence_reviews from service_role;
revoke all on table public.recommendation_pilot_outcomes from service_role;
revoke all on table public.assurance_control_evidence from service_role;
revoke all on table public.assurance_score_snapshots from service_role;

grant select, insert on table public.recommendation_longitudinal_evaluations to service_role;
grant select, insert on table public.recommendation_decision_events to service_role;
grant select, insert on table public.recommendation_pilot_links to service_role;
grant select, insert on table public.recommendation_broker_evidence_reviews to service_role;
grant select, insert on table public.recommendation_pilot_outcomes to service_role;
grant select, insert on table public.assurance_control_evidence to service_role;
grant select, insert on table public.assurance_score_snapshots to service_role;

drop policy if exists "Service role appends longitudinal recommendation evidence"
  on public.recommendation_longitudinal_evaluations;
drop policy if exists "Service role appends recommendation decisions"
  on public.recommendation_decision_events;
drop policy if exists "Service role appends recommendation pilot links"
  on public.recommendation_pilot_links;
drop policy if exists "Service role appends recommendation broker evidence reviews"
  on public.recommendation_broker_evidence_reviews;
drop policy if exists "Service role appends recommendation pilot outcomes"
  on public.recommendation_pilot_outcomes;
drop policy if exists "Service role appends assurance control evidence"
  on public.assurance_control_evidence;
drop policy if exists "Service role appends assurance score snapshots"
  on public.assurance_score_snapshots;

create policy "Service role reads longitudinal recommendation evidence"
  on public.recommendation_longitudinal_evaluations for select to service_role using (true);
create policy "Service role appends longitudinal recommendation evidence"
  on public.recommendation_longitudinal_evaluations for insert to service_role with check (true);
create policy "Service role reads recommendation decisions"
  on public.recommendation_decision_events for select to service_role using (true);
create policy "Service role appends recommendation decisions"
  on public.recommendation_decision_events for insert to service_role with check (true);
create policy "Service role reads recommendation pilot links"
  on public.recommendation_pilot_links for select to service_role using (true);
create policy "Service role appends recommendation pilot links"
  on public.recommendation_pilot_links for insert to service_role with check (true);
create policy "Service role reads recommendation broker evidence reviews"
  on public.recommendation_broker_evidence_reviews for select to service_role using (true);
create policy "Service role appends recommendation broker evidence reviews"
  on public.recommendation_broker_evidence_reviews for insert to service_role with check (true);
create policy "Service role reads recommendation pilot outcomes"
  on public.recommendation_pilot_outcomes for select to service_role using (true);
create policy "Service role appends recommendation pilot outcomes"
  on public.recommendation_pilot_outcomes for insert to service_role with check (true);
create policy "Service role reads assurance control evidence"
  on public.assurance_control_evidence for select to service_role using (true);
create policy "Service role appends assurance control evidence"
  on public.assurance_control_evidence for insert to service_role with check (true);
create policy "Service role reads assurance score snapshots"
  on public.assurance_score_snapshots for select to service_role using (true);
create policy "Service role appends assurance score snapshots"
  on public.assurance_score_snapshots for insert to service_role with check (true);

revoke all on function public.assurance_canonical_jsonb(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.assurance_jsonb_object_key_count(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.assurance_stable_jsonb_hash(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.guard_pilot_trade_execution() from public, anon, authenticated, service_role;
revoke all on function public.guard_pilot_trade_source_fields() from public, anon, authenticated, service_role;
revoke all on function public.guard_verified_pilot_model_performance() from public, anon, authenticated, service_role;
revoke all on function public.guard_verified_pilot_performance() from public, anon, authenticated, service_role;
revoke all on function public.prevent_recommendation_evidence_mutation() from public, anon, authenticated, service_role;
revoke all on function public.validate_assurance_control_evidence_append() from public, anon, authenticated, service_role;
revoke all on function public.validate_assurance_score_snapshot_append() from public, anon, authenticated, service_role;
revoke all on function public.validate_pilot_execution_authorization() from public, anon, authenticated, service_role;
revoke all on function public.validate_pilot_outcome_source_snapshot() from public, anon, authenticated, service_role;
revoke all on function public.validate_recommendation_broker_evidence_review() from public, anon, authenticated, service_role;
revoke all on function public.validate_recommendation_decision_event() from public, anon, authenticated, service_role;
revoke all on function public.validate_recommendation_longitudinal_evaluation_append() from public, anon, authenticated, service_role;
revoke all on function public.validate_recommendation_pilot_link() from public, anon, authenticated, service_role;
revoke all on function public.validate_recommendation_pilot_outcome() from public, anon, authenticated, service_role;
revoke all on function public.validate_recommendation_publication_assurance_contract() from public, anon, authenticated, service_role;
