-- PostgreSQL foreign-key checks probe the referencing column once per deleted
-- manifest. Keep retention bounded by indexing that reverse lookup explicitly.

create index if not exists recommendation_performance_evidence_manifest_id_idx
  on public.recommendation_performance (evidence_manifest_id)
  where evidence_manifest_id is not null;
