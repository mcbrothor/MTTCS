import type { DataSourceMeta } from '@/types';

function formatAsOf(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function DataSourceBadge({ meta }: { meta: Partial<DataSourceMeta> | null | undefined }) {
  if (!meta) return null;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs leading-5 text-slate-300">
      <span className="font-semibold text-slate-100">{meta.provider || 'Unknown provider'}</span>
      <span className="mx-2 text-slate-600">|</span>
      <span>{meta.delay || 'UNKNOWN'}</span>
      {meta.asOf && (
        <>
          <span className="mx-2 text-slate-600">|</span>
          <span>{formatAsOf(meta.asOf)}</span>
        </>
      )}
      {meta.fallbackUsed && <span className="ml-2 text-amber-300">fallback</span>}
    </div>
  );
}
