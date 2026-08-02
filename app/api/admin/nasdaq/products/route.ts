import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import { validateNasdaqProductMetadata } from '@/lib/nasdaq/admin-metadata';
import {
  listNasdaqProductMetadata,
  upsertNasdaqProductMetadata,
} from '@/lib/nasdaq/repository';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
  try {
    const rows = await listNasdaqProductMetadata({ client: getSupabaseAdmin() });
    return apiSuccess(rows, {
      source: 'nasdaq_product_metadata',
      provider: 'Supabase / operator approved',
      delay: 'UNKNOWN',
      observedAt: rows.map((row) => row.updatedAt).sort().at(-1),
    });
  } catch (error) {
    return apiError(getErrorMessage(error), 'NASDAQ_METADATA_READ_FAILED', 500);
  }
}

export async function PUT(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
  try {
    const metadata = validateNasdaqProductMetadata(await request.json());
    const saved = await upsertNasdaqProductMetadata({
      client: getSupabaseAdmin(),
      metadata,
    });
    return apiSuccess(saved, {
      source: saved.sourceUrl,
      provider: 'Operator approved',
      delay: 'UNKNOWN',
      observedAt: saved.approvedAt,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    const invalid = error instanceof SyntaxError || /이어야|화이트리스트|지정할 수/.test(message);
    return apiError(
      message,
      invalid ? 'INVALID_INPUT' : 'NASDAQ_METADATA_WRITE_FAILED',
      invalid ? 400 : 500,
    );
  }
}
