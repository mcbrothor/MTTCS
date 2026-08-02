import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const gitSha = process.env.MTN_RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA || '';
  if (!/^[a-f0-9]{40}$/i.test(gitSha)) {
    return NextResponse.json(
      {
        ok: false,
        code: 'RELEASE_SHA_UNAVAILABLE',
        message: 'This deployment does not expose a reproducible Git commit SHA.',
      },
      {
        status: 503,
        headers: { 'cache-control': 'no-store' },
      },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      gitSha: gitSha.toLowerCase(),
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
