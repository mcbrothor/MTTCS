'use client';
import { useEffect, useState } from 'react';
export default function Page(){
  const [s,setS]=useState<any>(null);
  useEffect(()=>{fetch('/api/strategies/us-monthly-v7').then(r=>r.json()).then(j=>setS(j.data)).catch(()=>{});},[]);
  return <div className="p-6 space-y-4"><h1 className="text-xl font-bold">US 월간 V7</h1><p className="text-sm text-slate-400">Breadth 30/40/60/80 + NASDAQ 독주 + 금속 Overlay</p><pre className="text-xs bg-slate-900 p-3 rounded overflow-auto">{s?JSON.stringify(s,null,2):'로딩 중'}</pre></div>;
}
