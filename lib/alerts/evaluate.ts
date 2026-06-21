export interface PriceAlertRule { event_type:string; params:Record<string,unknown>; scope_id:string; }
export function evaluatePriceAlert(rule:PriceAlertRule,current:number,previous:number|null){
 const target=Number(rule.params.targetPrice); const threshold=Number(rule.params.thresholdPct ?? 5);
 if(rule.event_type==='PIVOT_NEAR'||rule.event_type==='STOP_NEAR'||rule.event_type==='HIGH52_NEAR'){
  if(!Number.isFinite(target)||target<=0)return null; const distance=((current-target)/target)*100;
  if(Math.abs(distance)>threshold)return null; return {severity:rule.event_type==='STOP_NEAR'?'RISK' as const:'WATCH' as const,message:`현재가 ${current.toLocaleString()} · 기준가 ${target.toLocaleString()} · 거리 ${distance.toFixed(2)}%`};
 }
 if(rule.event_type==='BREAKOUT'){if(!Number.isFinite(target)||current<target||previous===null||previous>=target)return null;return {severity:'WATCH' as const,message:`${current.toLocaleString()}에서 기준가 ${target.toLocaleString()} 돌파`};}
 if(rule.event_type==='PRICE_MOVE'&&previous){const move=((current-previous)/previous)*100;if(Math.abs(move)<threshold)return null;return {severity:Math.abs(move)>=10?'RISK' as const:'WATCH' as const,message:`직전 종가 대비 ${move.toFixed(2)}% 변동`};}
 return null;
}
