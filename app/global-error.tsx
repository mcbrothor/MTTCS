'use client';

/**
 * 전역 Error Boundary
 * - root layout 자체에서 에러가 발생했을 때의 최후 방어선입니다.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body className="flex min-h-screen items-center justify-center bg-slate-950 font-sans text-white">
        <div className="flex flex-col items-center gap-6 p-8 text-center">
          <h1 className="text-2xl font-bold text-red-300">시스템 오류</h1>
          <p className="max-w-md text-sm leading-6 text-slate-400">
            {error.message || '예기치 않은 시스템 오류가 발생했습니다. 페이지를 새로고침해 주세요.'}
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-slate-600 bg-slate-800 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
          >
            새로고침
          </button>
        </div>
      </body>
    </html>
  );
}
