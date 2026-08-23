'use client';
import { useEffect, useState } from 'react';
export default function Page(){
  const [s,setS]=useState<Record<string, unknown> | null>(null);
  useEffect(()=>{fetch('/api/strategies/us-52w').then(r=>r.json()).then(j=>setS(j.data)).catch(()=>{});},[]);
  return <div className="p-6 space-y-4"><h1 className="text-xl font-bold">US 52주 신고가 (ETF 50)</h1><p className="text-sm text-slate-400">RS Top20 ∩ 52주 신고가 당일 진입 → 4×25% MA10 · WATCH -1/-3/-5%</p><pre className="text-xs bg-slate-900 p-3 rounded overflow-auto">{s?JSON.stringify(s,null,2):'로딩 중'}</pre></div>;
}
