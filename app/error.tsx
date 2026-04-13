'use client';

/**
 * 페이지 레벨 Error Boundary
 * - 렌더링 에러 발생 시 전체 앱 크래시 대신 복구 안내를 표시합니다.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8">
        <p className="text-lg font-bold text-red-200">오류가 발생했습니다</p>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
          {error.message || '예기치 않은 오류가 발생했습니다.'}
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-slate-600">Digest: {error.digest}</p>
        )}
      </div>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg border border-slate-600 bg-slate-800 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
      >
        다시 시도
      </button>
    </div>
  );
}
