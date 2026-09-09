-- Remove Supabase default table grants so evidence payloads cannot be updated in place.

revoke all on table public.qullamaggie_evidence_snapshots from service_role;
grant select, insert, delete on table public.qullamaggie_evidence_snapshots to service_role;
