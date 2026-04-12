import axios from 'axios';
import { getKisToken } from './kis-auth';
import type { OHLCData } from '@/types';

interface KisDailyPriceRow {
  xymd?: string;
  open: string;
  high: string;
  low: string;
  clos: string;
  tvol: string;
}

export async function getOverseasDailyPrice(ticker: string, exchange: string = 'NAS'): Promise<OHLCData[]> {
  const token = await getKisToken();
  const KIS_APP_KEY = process.env.KIS_APP_KEY!;
  const KIS_APP_SECRET = process.env.KIS_APP_SECRET!;
  const KIS_BASE_URL = process.env.KIS_BASE_URL || 'https://openapi.koreainvestment.com:9443';
  
  const isVirtual = KIS_BASE_URL.includes('openapivts');
  const tr_id = isVirtual ? 'VHJFS76240000' : 'HHDFS76240000';

  const response = await axios.get(`${KIS_BASE_URL}/uapi/overseas-price/v1/quotations/dailyprice`, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'authorization': `Bearer ${token}`,
      'appkey': KIS_APP_KEY,
      'appsecret': KIS_APP_SECRET,
      'tr_id': tr_id,
      'custtype': 'P',
    },
    params: {
      EXCD: exchange,
      SYMB: ticker,
      GUBN: '0', 
      BYMD: '',
      MODP: '1', 
    }
  });

  if (response.data.rt_cd !== '0') {
    throw new Error(response.data.msg1 || 'KIS API 해외주식 시세 조회 에러');
  }

  const output2 = response.data.output2 || [];
  
  const ohlcData: OHLCData[] = output2
    .filter((d: KisDailyPriceRow) => d.xymd)
    .map((item: KisDailyPriceRow) => ({
      date: item.xymd,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.clos),
      volume: parseFloat(item.tvol),
    }))
    .reverse(); 

  return ohlcData;
}
