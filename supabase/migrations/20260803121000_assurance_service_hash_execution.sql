-- Check constraints executed by PostgREST's service_role call these immutable
-- hashing helpers. Grant only those helpers; trigger/validator functions remain
-- non-callable by every API role.

grant execute on function public.assurance_canonical_jsonb(jsonb) to service_role;
grant execute on function public.assurance_jsonb_object_key_count(jsonb) to service_role;
grant execute on function public.assurance_stable_jsonb_hash(jsonb) to service_role;

