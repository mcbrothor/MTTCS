import { apiError } from '../api/response.ts';
import { getRequestSession, type ServerSession } from './session.ts';

export type AuthenticatedRouteHandler<TContext = unknown> = (
  request: Request,
  context: TContext,
  session: ServerSession,
) => Response | Promise<Response>;

export function withAdminSession<TContext = unknown>(
  handler: AuthenticatedRouteHandler<TContext>,
) {
  return async (request: Request, context: TContext) => {
    const session = await getRequestSession(request);
    if (!session) {
      return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
    }
    return handler(request, context, session);
  };
}

export async function rejectUnauthenticatedRequest(request: Request) {
  const session = await getRequestSession(request);
  return session ? null : apiError('Authentication required.', 'AUTH_REQUIRED', 401);
}

export function publicRoute<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => TResult,
) {
  return handler;
}
