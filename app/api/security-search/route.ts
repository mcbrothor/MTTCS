import { NextResponse } from 'next/server';
import { getScannerUniverse } from '@/lib/finance/market/scanner-universes';
import type { ScannerUniverse, SecuritySearchResult } from '@/types';

const universes: ScannerUniverse[] = ['NASDAQ100','SP500','KOSPI200','KOSDAQ150'];
let cache: { at:number; rows:SecuritySearchResult[] } | null = null;

async function rows() {
  if (cache && Date.now()-cache.at < 3_600_000) return cache.rows;
  const settled = await Promise.allSettled(universes.map(getScannerUniverse));
  const map = new Map<string,SecuritySearchResult>();
  for (const result of settled) if(result.status==='fulfilled') for(const item of result.value.items){
    const market = item.exchange==='KOSPI'||item.exchange==='KOSDAQ'?'KR':'US';
    map.set(`${market}:${item.ticker}`,{ticker:item.ticker,name:item.name,exchange:item.exchange,market});
  }
  cache={at:Date.now(),rows:[...map.values()]}; return cache.rows;
}

export async function GET(request:Request){
  const q=new URL(request.url).searchParams.get('q')?.trim().toLowerCase()||'';
  if(!q)return NextResponse.json({data:[]});
  const found=(await rows()).filter(x=>x.ticker.toLowerCase().includes(q)||x.name.toLowerCase().includes(q)).sort((a,b)=>Number(!a.ticker.toLowerCase().startsWith(q))-Number(!b.ticker.toLowerCase().startsWith(q))).slice(0,10);
  return NextResponse.json({data:found});
}
