'use client';
import { useEffect,useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import type { SecuritySearchResult } from '@/types';

export default function GlobalSecuritySearch(){
 const router=useRouter(); const [q,setQ]=useState(''); const [rows,setRows]=useState<SecuritySearchResult[]>([]); const [open,setOpen]=useState(false); const ref=useRef<HTMLInputElement>(null);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();ref.current?.focus();setOpen(true)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[]);
 useEffect(()=>{if(!q.trim())return;const id=setTimeout(()=>fetch(`/api/security-search?q=${encodeURIComponent(q)}`).then(r=>r.json()).then(p=>setRows(p.data||[])).catch(()=>setRows([])),180);return()=>clearTimeout(id)},[q]);
 const go=(x:SecuritySearchResult)=>{setOpen(false);setQ('');router.push(`/stock/${encodeURIComponent(x.ticker)}?exchange=${x.exchange}`)};
 return <div className="relative w-full max-w-sm"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--text-tertiary)]"/><input ref={ref} value={q} onFocus={()=>setOpen(true)} onChange={e=>setQ(e.target.value)} placeholder="종목 검색  ⌘K" className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-400/50"/>{open&&Boolean(q.trim())&&rows.length>0&&<div className="absolute left-0 right-0 top-11 z-[100] overflow-hidden rounded-xl border border-[var(--border)] bg-slate-950 shadow-2xl">{rows.map(x=><button key={`${x.market}:${x.ticker}`} onClick={()=>go(x)} className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-emerald-500/10"><span><b className="text-emerald-300">{x.ticker}</b><span className="ml-2 text-xs text-slate-300">{x.name}</span></span><span className="text-[10px] text-slate-500">{x.exchange}</span></button>)}</div>}</div>;
}
