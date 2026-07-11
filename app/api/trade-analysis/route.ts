import { NextResponse } from 'next/server';
import { getRequestSession } from '@/lib/auth/session';
import { evaluateRiskGate } from '@/lib/finance/core/risk-gate';
import { getDefaultRiskPolicy } from '@/lib/finance/core/risk-policy';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ message: 'Authentication required.', code: 'AUTH_REQUIRED' }, { status: 401 });
  const body = await request.json();
  const ticker = String(body.ticker || '').trim().toUpperCase();
  const market = body.market === 'KR' ? 'KR' : body.market === 'US' ? 'US' : null;
  const direction = body.direction === 'SHORT' ? 'SHORT' : body.direction === 'LONG' ? 'LONG' : null;
  const totalEquity = Number(body.total_equity);
  const entryPrice = Number(body.entry_price);
  const stoplossPrice = Number(body.stoploss_price);
  const shares = Number(body.total_shares);
  if (!ticker || !market || !direction || ![totalEquity, entryPrice, stoplossPrice, shares].every((value) => Number.isFinite(value) && value > 0)) {
    return NextResponse.json({ message: 'Valid ticker, market, direction, equity, entry, stop and shares are required.', code: 'INVALID_ANALYSIS_INPUT' }, { status: 400 });
  }
  const stopValid = direction === 'LONG' ? stoplossPrice < entryPrice : stoplossPrice > entryPrice;
  const candidateRisk = Math.abs(entryPrice - stoplossPrice) * shares;
  const policy = getDefaultRiskPolicy(market);
  const riskGate = evaluateRiskGate({ policy, totalEquity, candidateRisk, stopQuality: stopValid ? 'VALID' : 'INVALID' });
  const result = { candidate_risk: candidateRisk, risk_percent: candidateRisk / totalEquity, risk_gate: riskGate, risk_policy: policy };
  const now = Date.now();
  const { data, error } = await getSupabaseAdmin().from('trade_analysis_runs').insert({
    owner_id: session.systemId, ticker, market, direction, mode: body.mode === 'MANUAL' ? 'MANUAL' : 'SYSTEM_ANALYSIS',
    input_snapshot: { total_equity: totalEquity, entry_price: entryPrice, stoploss_price: stoplossPrice, total_shares: shares },
    result_snapshot: result, policy_version: 'mtn-risk-policy-v1', expires_at: new Date(now + 15 * 60_000).toISOString(),
  }).select('id, expires_at').single();
  if (error) return NextResponse.json({ message: 'Trade analysis could not be persisted.', code: 'ANALYSIS_SAVE_FAILED' }, { status: 500 });
  return NextResponse.json({ data: { analysis_ref: data.id, expires_at: data.expires_at, ...result } });
}
