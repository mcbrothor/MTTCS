import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClosingEvaluation, ClosingMode, ClosingSnapshot } from './types';

export class ClosingRepository {
  constructor(readonly client: SupabaseClient) {}

  async caches<T>(keys: string[]): Promise<Map<string, T>> {
    if (!keys.length) return new Map();
    const { data, error } = await this.client.from('closing_bet_cache').select('key,payload')
      .in('key', keys).gt('expires_at', new Date().toISOString());
    if (error) throw new Error(`종가베팅 캐시 일괄 조회 실패: ${error.code}`);
    return new Map((data || []).map((row) => [row.key, row.payload as T]));
  }

  async cache<T>(key: string): Promise<{ payload: T; observedAt: string } | null> {
    const { data, error } = await this.client.from('closing_bet_cache').select('payload,observed_at')
      .eq('key', key).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (error) throw new Error(`종가베팅 캐시 조회 실패: ${error.code}`);
    return data ? { payload: data.payload as T, observedAt: data.observed_at } : null;
  }

  async putCache(key: string, payload: unknown, ttlHours = 24) {
    const { error } = await this.client.from('closing_bet_cache').upsert({
      key, payload, observed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlHours * 3_600_000).toISOString(),
    });
    if (error) throw new Error(`종가베팅 캐시 저장 실패: ${error.code}`);
  }

  async save(snapshot: ClosingSnapshot): Promise<ClosingSnapshot> {
    const row = { id: snapshot.id, trade_date: snapshot.tradeDate, market: snapshot.market,
      mode: snapshot.mode, phase: snapshot.phase, model_version: snapshot.modelVersion,
      as_of: snapshot.asOf, payload: snapshot };
    const result = snapshot.phase === 'WATCH'
      ? await this.client.from('closing_bet_snapshots').upsert(row, { onConflict: 'trade_date,market,mode,phase,model_version' })
      : await this.client.from('closing_bet_snapshots').insert(row);
    if (result.error?.code === '23505' && snapshot.phase === 'FINAL') {
      const { data, error } = await this.client.from('closing_bet_snapshots').select('payload')
        .eq('trade_date', snapshot.tradeDate).eq('market', snapshot.market).eq('mode', snapshot.mode)
        .eq('phase', snapshot.phase).eq('model_version', snapshot.modelVersion).single();
      if (error) throw new Error(`기존 종가베팅 발행 조회 실패: ${error.code}`);
      return data.payload as ClosingSnapshot;
    }
    if (result.error) throw new Error(`종가베팅 발행 저장 실패: ${result.error.code}`);
    return snapshot;
  }

  async list(date?: string, mode?: ClosingMode): Promise<ClosingSnapshot[]> {
    let query = this.client.from('closing_bet_snapshots').select('payload').order('trade_date', { ascending: false })
      .order('as_of', { ascending: false }).order('created_at', { ascending: false }).limit(120);
    if (date) query = query.eq('trade_date', date);
    if (mode) query = query.eq('mode', mode);
    const { data, error } = await query;
    if (error) throw new Error(`종가베팅 추천 조회 실패: ${error.code}`);
    return (data || []).map((row) => row.payload as ClosingSnapshot);
  }

  async saveEvaluations(rows: ClosingEvaluation[]) {
    if (!rows.length) return;
    const { error } = await this.client.from('closing_bet_evaluations').upsert(rows.map((payload) => ({
      snapshot_id: payload.snapshotId, ticker: payload.ticker, payload, updated_at: new Date().toISOString(),
    })), { onConflict: 'snapshot_id,ticker' });
    if (error) throw new Error(`종가베팅 성과 저장 실패: ${error.code}`);
  }

  async evaluations(ids: string[]): Promise<ClosingEvaluation[]> {
    if (!ids.length) return [];
    const { data, error } = await this.client.from('closing_bet_evaluations').select('payload').in('snapshot_id', ids);
    if (error) throw new Error(`종가베팅 성과 조회 실패: ${error.code}`);
    return (data || []).map((row) => row.payload as ClosingEvaluation);
  }

  async withLock<T>(key: string, run: () => Promise<T>): Promise<T | null> {
    const token = randomUUID();
    const { data, error } = await this.client.rpc('claim_closing_bet_lock', { p_key: key, p_token: token });
    if (error) throw new Error(`종가베팅 실행 잠금 실패: ${error.code}`);
    if (!data) return null;
    try { return await run(); }
    finally {
      const release = await this.client.from('closing_bet_locks').delete().eq('key', key).eq('token', token);
      if (release.error) console.error('[Closing bet] Lock release failed:', release.error.code);
    }
  }
}
