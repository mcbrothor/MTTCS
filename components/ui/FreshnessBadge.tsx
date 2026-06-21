import type { DataSourceMeta } from '@/types';
export default function FreshnessBadge({meta}:{meta:DataSourceMeta}){
 const tone=meta.isStale?'border-amber-400/30 text-amber-200':'border-emerald-400/30 text-emerald-200';
 return <span title={meta.staleReason||meta.warnings.join('\n')} className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{meta.isStale?'지연/확인 필요':'신뢰 가능'} · {meta.provider} · {new Date(meta.asOf).toLocaleString('ko-KR')}</span>;
}
