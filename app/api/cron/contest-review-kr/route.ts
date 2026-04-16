import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { runContestReviewBatch, validateCronRequest } from '@/lib/contest-cron';

export async function GET(request: Request) {
  if (!validateCronRequest(request)) return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);
  try {
    const result = await runContestReviewBatch('KR');
    return apiSuccess(result, { source: 'Vercel Cron', provider: 'MTN', delay: 'EOD' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'KR contest review batch failed.'), 'API_ERROR', 500);
  }
}
