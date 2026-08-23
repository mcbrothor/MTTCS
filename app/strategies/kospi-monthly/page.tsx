'use client';
import { useEffect, useState } from 'react';
export default function Page(){
  const [s,setS]=useState<any>(null);
  useEffect(()=>{fetch('/api/strategies/kospi-monthly').then(r=>r.json()).then(j=>setS(j.data)).catch(()=>{});},[]);
  return <div className="p-6 space-y-4"><h1 className="text-xl font-bold">KOSPI 월말 V2.3</h1><p className="text-sm text-slate-400">Breadth 5단계 → RS Top3/완충 Top5 → 역추세 -12/-18/-24%</p><pre className="text-xs bg-slate-900 p-3 rounded overflow-auto">{s?JSON.stringify(s,null,2):'로딩 중'}</pre></div>;
}
