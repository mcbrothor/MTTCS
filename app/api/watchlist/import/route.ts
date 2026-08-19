import { withAdminSession } from '@/lib/auth/api';
import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { parseInvestmentIdeaRows } from '@/lib/watchlist/import';
import { getSupabaseAdmin } from '@/lib/supabase/server';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const POST = withAdminSession(async (request: Request, _context, session) => {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return apiError('CSV 또는 XLSX 파일이 필요합니다.', 'MISSING_FILE', 400);
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.csv') && !lowerName.endsWith('.xlsx')) return apiError('CSV와 XLSX만 가져올 수 있습니다.', 'UNSUPPORTED_FILE', 400);
    if (file.size > MAX_FILE_BYTES) return apiError('파일은 5MB 이하여야 합니다.', 'FILE_TOO_LARGE', 413);
    const rows = parseInvestmentIdeaRows({ buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name });
    if (rows.length === 0) return apiError('가져올 투자 아이디어가 없습니다.', 'EMPTY_IMPORT', 400);
    if (rows.length > 1000) return apiError('한 번에 최대 1,000개 아이디어를 가져올 수 있습니다.', 'IMPORT_TOO_LARGE', 413);
    const now = new Date().toISOString();
    const payload = rows.map((row) => ({ ...row, user_id: session.systemId, group_name: '가져온 투자 아이디어', priority: 0, updated_at: now }));
    const { data, error } = await getSupabaseAdmin().from('watchlist').upsert(payload, { onConflict: 'ticker' }).select();
    if (error) throw error;
    return apiSuccess({ imported: data?.length || 0, items: data || [] }, { provider: 'User file', source: file.name, asOf: now });
  } catch (error) {
    return apiError(getErrorMessage(error, '투자 아이디어 가져오기에 실패했습니다.'), 'WATCHLIST_IMPORT_FAILED', 500);
  }
});
