'use client';
import { useEffect, useState } from 'react';
function fmt(t:string,n?:string){return n && n!==t?`${n}(${t})`:t;}
export default function Page(){
  const [s,setS]=useState<{ signal?:{ buyTickers:string[]; sellTickers:string[]; holdTickers:string[]; watchTickers:string[]; cashSlots:number; rsRank:{ticker:string;name:string;rs:number}[] }; candidates?:{ticker:string;name:string;isNewHigh:boolean}[] }|null>(null);
  useEffect(()=>{fetch('/api/strategies/us-52w').then(r=>r.json()).then(j=>setS(j.data)).catch(()=>{});},[]);
  const map = new Map<string,string>();
  s?.candidates?.forEach((c: {ticker:string;name:string})=>map.set(c.ticker,c.name));
  s?.signal?.rsRank?.forEach((r: {ticker:string;name:string})=>{ if(!map.has(r.ticker)) map.set(r.ticker,r.name); });
  const f=(t:string)=>fmt(t, map.get(t));
  return <div className="p-6 space-y-4"><h1 className="text-xl font-bold">US 52주 신고가 (ETF 50)</h1><p className="text-sm text-slate-400">RS Top20 ∩ 52주 신고가 당일 진입 → 4×25% MA10 · WATCH -1/-3/-5%</p>{!s?<p className="text-sm">로딩 중</p>:<div className="rounded-xl border border-slate-800 p-4 text-sm"><p>매수: {s.signal?.buyTickers.map(f).join(', ')||'없음'} · 매도: {s.signal?.sellTickers.map(f).join(', ')||'없음'} · 보유: {s.signal?.holdTickers.map(f).join(', ')||'없음'} · WATCH: {s.signal?.watchTickers.map(f).join(', ')||'없음'} · 현금: {s.signal?.cashSlots}/4</p><p className="mt-2 text-xs">RS Top20: {s.signal?.rsRank.map(r=>`${fmt(r.ticker,r.name)}(${r.rs.toFixed(1)})`).join(' · ')}</p><pre className="mt-2 text-[10px] bg-slate-900 p-2 rounded overflow-auto">{JSON.stringify(s,null,2)}</pre></div>}</div>;
}
