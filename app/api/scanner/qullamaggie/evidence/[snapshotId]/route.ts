import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { apiError, apiSuccess } from '@/lib/api/response';
import { getQullamaggieEvidenceSnapshot } from '@/lib/scanner/qullamaggie-evidence-store';

export async function GET(
  request: Request,
  props: { params: Promise<{ snapshotId: string }> }
) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;

  try {
    const params = await props.params;
    const { snapshotId } = params;

    if (!snapshotId || typeof snapshotId !== 'string') {
      return apiError('올바른 snapshotId가 필요합니다.', 'INVALID_INPUT', 400);
    }

    const snapshot = getQullamaggieEvidenceSnapshot(snapshotId);

    if (!snapshot) {
      return apiError('해당 쿨라매기 증거 스냅샷을 찾을 수 없습니다.', 'NOT_FOUND', 404);
    }

    return apiSuccess({ snapshot }, {
      source: 'qullamaggie_evidence_store',
      provider: snapshot.provenance.provider,
      observedAt: snapshot.provenance.calculatedAt,
    });
  } catch (error: unknown) {
    console.error('[Qullamaggie Evidence API Error]', error);
    return apiError('증거 스냅샷 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  }
}
