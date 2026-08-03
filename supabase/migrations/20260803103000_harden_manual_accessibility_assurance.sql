-- Fail closed for the 90-point manual accessibility gate.
-- A PASS must come from the independent reviewer endpoint and carry a complete,
-- release-scoped report for the exact four core application routes.

alter table public.assurance_control_evidence
  drop constraint if exists assurance_manual_accessibility_payload_check;

alter table public.assurance_control_evidence
  add constraint assurance_manual_accessibility_payload_check check (
    control_key <> 'ACCESSIBILITY_MANUAL'
    or status <> 'PASS'
    or (
      source_kind = 'MANUAL_REVIEW'
      and release_sha is not null
      and payload ->> 'schema_version' = 'mtn-a11y-manual-review-v1'
      and payload ->> 'policy_version' = 'mtn-conditional-90-policy-2026.08-v1'
      and payload ->> 'result' = 'PASS'
      and payload ->> 'artifact_kind' = 'ACCESSIBILITY_REVIEW_REPORT'
      and coalesce(payload ->> 'artifact_hash', '') ~ '^[a-f0-9]{64}$'
      and source_record_id = payload ->> 'artifact_hash'
      and coalesce(payload ->> 'reviewer_subject_hash', '') ~ '^[a-f0-9]{64}$'
      and payload ->> 'reviewer_authentication' = 'INDEPENDENT_ASSURANCE_CREDENTIAL'
      and jsonb_typeof(payload -> 'assistive_technology') = 'object'
      and char_length(btrim(coalesce(payload #>> '{assistive_technology,name}', ''))) between 2 and 80
      and char_length(btrim(coalesce(payload #>> '{assistive_technology,version}', ''))) between 1 and 40
      and char_length(btrim(coalesce(payload #>> '{assistive_technology,platform}', ''))) between 2 and 80
      and jsonb_typeof(payload -> 'routes_reviewed') = 'array'
      and jsonb_array_length(payload -> 'routes_reviewed') = 4
      and payload -> 'routes_reviewed' @> '["/"]'::jsonb
      and payload -> 'routes_reviewed' @> '["/portfolio"]'::jsonb
      and payload -> 'routes_reviewed' @> '["/recommendations?view=metrics"]'::jsonb
      and payload -> 'routes_reviewed' @> '["/scanner"]'::jsonb
      and jsonb_typeof(payload -> 'checks') = 'object'
      and public.assurance_jsonb_object_key_count(payload -> 'checks') = 6
      and (payload -> 'checks') ?& array['screenReader','keyboardOnly','focusOrder','colorIndependence','zoom200','mobile360']
      and payload @> '{"checks":{"screenReader":true,"keyboardOnly":true,"focusOrder":true,"colorIndependence":true,"zoom200":true,"mobile360":true}}'::jsonb
      and char_length(btrim(coalesce(payload ->> 'reviewer_attestation', ''))) between 40 and 4000
      and char_length(btrim(coalesce(payload ->> 'notes', ''))) between 20 and 4000
    )
  );

comment on constraint assurance_manual_accessibility_payload_check
  on public.assurance_control_evidence is
  'Manual accessibility PASS requires an independent reviewer credential, exact core routes, structured assistive-technology details, and a hashed review artifact.';
