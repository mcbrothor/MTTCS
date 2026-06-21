'use client';
import { useEffect, useMemo, useState } from 'react';
import type { SavedScreen, ScannerResult, ScannerUniverse } from '@/types';
import type { FilterKey, SortKey } from '@/hooks/scanner';
import { readPreviousScannerSnapshot } from '@/hooks/scanner/storage';
import { diffScannerSnapshots } from '@/lib/scanner/saved-screens';

export default function SavedScreensPanel({ universe, filterKey, sortKey, customFilters, results, onApply }:{ universe: ScannerUniverse; filterKey: FilterKey; sortKey: SortKey; customFilters:{rsMin:number;vcpMin:number;distMax:number}; results: ScannerResult[]; onApply:(s:SavedScreen)=>void }) {
  const [items,setItems]=useState<SavedScreen[]>([]); const [name,setName]=useState(''); const [previous,setPrevious]=useState<ScannerResult[]>([]); const [message,setMessage]=useState('');
  const load=()=>fetch('/api/saved-screens').then(r=>r.json()).then(p=>setItems(p.data||[])).catch(()=>setItems([]));
  useEffect(()=>{ load(); readPreviousScannerSnapshot(universe).then(s=>setPrevious(s?.results||[])); },[universe]);
  const diff=useMemo(()=>diffScannerSnapshots(previous,results),[previous,results]);
  const save=async()=>{ if(!name.trim())return; const r=await fetch('/api/saved-screens',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,universe,filterKey,sortKey,filters:{filterKey,...customFilters}})}); setMessage(r.ok?'화면을 저장했습니다.':'저장하지 못했습니다.'); if(r.ok){setName('');load();} };
  return <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
    <div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-[var(--text-primary)]">저장 화면</strong><input value={name} onChange={e=>setName(e.target.value)} placeholder="예: 나스닥 RS90" className="min-w-40 rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2 text-xs"/><button onClick={save} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950">현재 조건 저장</button>{items.map(x=><button key={x.id} onClick={()=>onApply(x)} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs">{x.name}</button>)}</div>
    <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="text-[var(--text-tertiary)]">이전 스캔 대비</span><span className="text-emerald-300">신규 {diff.entered.length}</span><span className="text-sky-300">승급 {diff.upgraded.length}</span><span className="text-amber-300">강등 {diff.downgraded.length}</span><span className="text-rose-300">이탈 {diff.exited.length}</span>{!previous.length&&<span className="text-[var(--text-tertiary)]">다음 스캔부터 비교됩니다.</span>}</div>{message&&<p className="mt-2 text-xs text-emerald-200">{message}</p>}
  </section>;
}
