import axios from 'axios';
import type { SupabaseClient } from '@supabase/supabase-js';
import { kisAppKey, kisAppSecret, kisBaseUrl } from '@/lib/env';
import { getKisToken } from '@/lib/finance/providers/kis-auth';
import { waitForKisRequestSlot } from '@/lib/finance/providers/kis-rate-limit';

export interface KrSecurityProfileInput {
  ticker: string;
  exchange: string;
  name: string;
}

export interface KrSecurityProfile extends KrSecurityProfileInput {
  sector: string | null;
}

type ProfileRequest = (ticker: string) => Promise<{ sector: string | null }>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function defaultProfileRequest(ticker: string) {
  await waitForKisRequestSlot('rest');
  const token = await getKisToken();
  const response = await axios.get(`${kisBaseUrl()}/uapi/domestic-stock/v1/quotations/inquire-price`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: kisAppKey(),
      appsecret: kisAppSecret(),
      tr_id: 'FHKST01010100',
      custtype: 'P',
    },
    params: {
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: ticker,
    },
    timeout: 12_000,
  });
  if (response.data?.rt_cd !== '0') throw new Error(response.data?.msg1 || 'KIS security profile request failed.');
  const sector = String(response.data?.output?.bstp_kor_isnm || '').trim();
  return { sector: sector || null };
}

export async function collectKrSecurityProfiles(input: {
  items: KrSecurityProfileInput[];
  request?: ProfileRequest;
  concurrency?: number;
  intervalMs?: number;
}) {
  const request = input.request || defaultProfileRequest;
  const profiles: KrSecurityProfile[] = [];
  const errors = new Map<string, string>();
  let index = 0;
  let nextStartAt = 0;
  const reserve = async () => {
    const wait = Math.max(0, nextStartAt - Date.now());
    nextStartAt = Math.max(nextStartAt, Date.now()) + (input.intervalMs ?? 250);
    if (wait > 0) await sleep(wait);
  };
  const worker = async () => {
    while (index < input.items.length) {
      const item = input.items[index++];
      await reserve();
      try {
        const result = await request(item.ticker);
        profiles.push({ ...item, sector: result.sector });
      } catch (error) {
        errors.set(item.ticker, error instanceof Error ? error.message : String(error));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(input.concurrency ?? 2, input.items.length) }, worker));
  return { profiles, errors };
}

export async function upsertKrSecurityProfiles(client: SupabaseClient, profiles: KrSecurityProfile[]) {
  if (profiles.length === 0) return 0;
  const { error } = await client.from('security_profiles').upsert(profiles.map((profile) => ({
    ticker: profile.ticker,
    exchange: profile.exchange,
    name: profile.name,
    sector: profile.sector,
    industry: profile.sector,
    market: 'KR',
    updated_at: new Date().toISOString(),
  })), { onConflict: 'ticker' });
  if (error) throw error;
  return profiles.length;
}
