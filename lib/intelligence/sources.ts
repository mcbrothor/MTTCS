import { XMLParser } from 'fast-xml-parser';
import {
  buildIndicatorAnalysis,
  buildSourceAnalysis,
  classifyHeadline,
  compactText,
  dedupeEvents,
  normalizePublishedAt,
  stableHash,
} from './model.ts';
import type {
  IntelligenceEvent,
  IntelligenceEventType,
  IntelligenceMarket,
  IntelligenceSeverity,
} from './types.ts';

const MAX_SOURCE_BYTES = 2_000_000;
const SOURCE_TIMEOUT_MS = 12_000;

export interface OfficialFeedDefinition {
  key: string;
  name: string;
  url: string;
  market: IntelligenceMarket;
  eventType: IntelligenceEventType;
  defaultSeverity: IntelligenceSeverity;
  topics: string[];
  whyItMatters: string;
  requiresSecUserAgent?: boolean;
}

export const OFFICIAL_FEEDS: OfficialFeedDefinition[] = [
  {
    key: 'FED_MONETARY',
    name: 'Federal Reserve Monetary Policy',
    url: 'https://www.federalreserve.gov/feeds/press_monetary.xml',
    market: 'US',
    eventType: 'CENTRAL_BANK',
    defaultSeverity: 'WATCH',
    topics: ['MONETARY_POLICY', 'RATES'],
    whyItMatters: '연준 정책 발표는 할인율, 달러, 성장주 밸류에이션과 글로벌 위험선호에 직접 영향을 줄 수 있습니다.',
  },
  {
    key: 'BOK_MONETARY',
    name: 'Bank of Korea Monetary Policy',
    url: 'https://www.bok.or.kr/portal/bbs/P0000559/news.rss?menuNo=200690',
    market: 'KR',
    eventType: 'CENTRAL_BANK',
    defaultSeverity: 'INFO',
    topics: ['MONETARY_POLICY', 'RATES', 'FX'],
    whyItMatters: '한국은행 정책 발표는 원화, 국내 금리, 유동성 및 한국 주식의 허용 위험에 영향을 줄 수 있습니다.',
  },
  {
    key: 'SEC_TRADING_SUSPENSIONS',
    name: 'SEC Trading Suspensions',
    url: 'https://www.sec.gov/enforcement-litigation/trading-suspensions/rss',
    market: 'US',
    eventType: 'REGULATORY',
    defaultSeverity: 'RISK',
    topics: ['REGULATORY', 'TRADING_SUSPENSION'],
    whyItMatters: '거래정지는 유동성 상실과 가격 공백 위험을 만들 수 있어 보유·관심 종목 연관 여부를 즉시 확인해야 합니다.',
    requiresSecUserAgent: true,
  },
];

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined ? [] : [value];
}

function nodeText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return '';
  const row = value as Record<string, unknown>;
  return nodeText(row['#text'] ?? row.__cdata ?? row.href ?? '');
}

export function parseOfficialRss(
  xml: string,
  source: OfficialFeedDefinition,
  observedAt = new Date().toISOString(),
): IntelligenceEvent[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
    processEntities: true,
  });
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const rss = parsed.rss as { channel?: { item?: unknown | unknown[] } } | undefined;
  const items = asArray(rss?.channel?.item).slice(0, 30);

  return dedupeEvents(items.flatMap((raw): IntelligenceEvent[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const title = compactText(nodeText(item.title), 240);
    if (!title) return [];
    const summary = compactText(nodeText(item.description), 700) || null;
    const sourceUrl = compactText(nodeText(item.link), 1000) || null;
    const guid = compactText(nodeText(item.guid), 1000);
    const rawPublishedAt = nodeText(item.pubDate);
    const parsedPublishedAt = new Date(rawPublishedAt);
    const hasSourceTimestamp = rawPublishedAt !== '' && !Number.isNaN(parsedPublishedAt.getTime());
    const publishedAt = normalizePublishedAt(rawPublishedAt, observedAt);
    const timestampQuality = hasSourceTimestamp ? 'SOURCE_PUBLISHED_AT' : 'OBSERVED_AT_FALLBACK';
    const severity = classifyHeadline(title, source.defaultSeverity);
    const externalId = guid || sourceUrl || stableHash(source.key, title, summary).slice(0, 40);

    return [{
      source: source.key,
      externalId,
      sourceTier: 'PRIMARY',
      market: source.market,
      eventType: source.eventType,
      severity,
      direction: 'UNKNOWN',
      title,
      summary,
      sourceUrl,
      publishedAt,
      observedAt,
      symbols: [],
      topics: source.topics,
      contentHash: stableHash(source.key, title, summary, sourceUrl, hasSourceTimestamp ? publishedAt : ''),
      payload: {
        feed: source.name,
        category: compactText(nodeText(item.category), 120) || null,
        timestampQuality,
      },
      analysis: buildSourceAnalysis({ whyItMatters: source.whyItMatters, severity }),
    }];
  }));
}

function sourceHeaders(source: OfficialFeedDefinition) {
  return {
    accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
    'user-agent': source.requiresSecUserAgent
      ? process.env.SEC_USER_AGENT || 'MTN/4.0 contact@mtn.local'
      : 'MTN/4.0 market-intelligence',
  };
}

export async function fetchOfficialFeed(source: OfficialFeedDefinition) {
  const observedAt = new Date().toISOString();
  const response = await fetch(source.url, {
    headers: sourceHeaders(source),
    cache: 'no-store',
    signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${source.key} responded ${response.status}`);
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_SOURCE_BYTES) throw new Error(`${source.key} payload is too large`);
  const xml = await response.text();
  if (Buffer.byteLength(xml, 'utf8') > MAX_SOURCE_BYTES) throw new Error(`${source.key} payload is too large`);
  return parseOfficialRss(xml, source, observedAt);
}

interface BlsDatum {
  year: string;
  period: string;
  periodName?: string;
  value: string;
  latest?: string;
}

interface BlsSeries {
  seriesID: string;
  data?: BlsDatum[];
}

interface BlsResponse {
  status?: string;
  message?: string[];
  Results?: { series?: BlsSeries[] };
}

interface BlsDefinition {
  id: string;
  label: string;
  topic: string;
  releaseName: 'Consumer Price Index' | 'Employment Situation';
  decimals: number;
  describe: (latest: number, previous: number) => {
    change: number;
    changeLabel: string;
    severity: IntelligenceSeverity;
    whyItMatters: string;
  };
}

function percentChange(latest: number, previous: number) {
  return previous === 0 ? 0 : ((latest - previous) / Math.abs(previous)) * 100;
}

const BLS_SERIES: BlsDefinition[] = [
  {
    id: 'CUSR0000SA0',
    label: '미국 소비자물가지수(CPI)',
    topic: 'INFLATION',
    releaseName: 'Consumer Price Index',
    decimals: 3,
    describe: (latest, previous) => {
      const change = percentChange(latest, previous);
      return {
        change,
        changeLabel: `전월 대비 ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
        severity: Math.abs(change) >= 0.4 ? 'RISK' : Math.abs(change) >= 0.25 ? 'WATCH' : 'INFO',
        whyItMatters: 'CPI의 월간 변화는 금리 기대와 주식 밸류에이션에 영향을 주지만, 시장 예상치와 기저효과를 함께 확인해야 합니다.',
      };
    },
  },
  {
    id: 'CUSR0000SA0L1E',
    label: '미국 근원 소비자물가지수',
    topic: 'CORE_INFLATION',
    releaseName: 'Consumer Price Index',
    decimals: 3,
    describe: (latest, previous) => {
      const change = percentChange(latest, previous);
      return {
        change,
        changeLabel: `전월 대비 ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
        severity: Math.abs(change) >= 0.35 ? 'RISK' : Math.abs(change) >= 0.2 ? 'WATCH' : 'INFO',
        whyItMatters: '근원 CPI는 지속적인 인플레이션 압력과 정책금리 경로를 판단하는 핵심 입력입니다.',
      };
    },
  },
  {
    id: 'LNS14000000',
    label: '미국 실업률',
    topic: 'LABOR',
    releaseName: 'Employment Situation',
    decimals: 1,
    describe: (latest, previous) => {
      const change = Number((latest - previous).toFixed(6));
      return {
        change,
        changeLabel: `전월 대비 ${change >= 0 ? '+' : ''}${change.toFixed(1)}%p`,
        severity: Math.abs(change) >= 0.3 ? 'RISK' : Math.abs(change) >= 0.2 ? 'WATCH' : 'INFO',
        whyItMatters: '실업률 변화는 경기와 통화정책 양쪽에 영향을 주므로 한 방향의 호재·악재로 단정하면 안 됩니다.',
      };
    },
  },
  {
    id: 'CES0000000001',
    label: '미국 비농업 고용',
    topic: 'LABOR',
    releaseName: 'Employment Situation',
    decimals: 0,
    describe: (latest, previous) => {
      const change = Number((latest - previous).toFixed(6));
      return {
        change,
        changeLabel: `전월 대비 ${change >= 0 ? '+' : ''}${change.toFixed(0)}천 명`,
        severity: change < 0 || Math.abs(change) >= 300 ? 'RISK' : Math.abs(change) >= 200 ? 'WATCH' : 'INFO',
        whyItMatters: '비농업 고용 변화는 경기 강도와 금리 기대를 동시에 바꾸므로 컨센서스 대비 차이를 별도로 확인해야 합니다.',
      };
    },
  },
];

function periodTimestamp(year: string, period: string) {
  const month = Number(period.replace(/^M/, ''));
  if (!/^\d{4}$/.test(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return new Date(Date.UTC(Number(year), month, 0, 23, 59, 59)).toISOString();
}

interface BlsScheduledRelease {
  name: BlsDefinition['releaseName'];
  releaseAt: string;
  expectedPeriod: string;
}

function easternLocalToUtc(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const localAsUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(localAsUtc))
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
  const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return new Date(localAsUtc - (representedAsUtc - localAsUtc));
}

function previousMonthPeriod(releaseAt: Date) {
  const eastern = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(releaseAt);
  const year = Number(eastern.find((part) => part.type === 'year')?.value);
  const month = Number(eastern.find((part) => part.type === 'month')?.value);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${previous.getUTCFullYear()}-M${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function parseBlsReleaseCalendar(ics: string): BlsScheduledRelease[] {
  const unfolded = ics.replace(/\r?\n[ \t]/g, '');
  return [...unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].flatMap((match) => {
    const block = match[1];
    const summary = block.match(/(?:^|\r?\n)SUMMARY:([^\r\n]+)/)?.[1]?.trim();
    if (summary !== 'Consumer Price Index' && summary !== 'Employment Situation') return [];
    const local = block.match(/(?:^|\r?\n)DTSTART(?:;TZID=(?:US-Eastern|America\/New_York))?:(\d{8}T\d{6})/)?.[1];
    const releaseAt = local ? easternLocalToUtc(local) : null;
    if (!releaseAt || Number.isNaN(releaseAt.getTime())) return [];
    return [{
      name: summary as BlsDefinition['releaseName'],
      releaseAt: releaseAt.toISOString(),
      expectedPeriod: previousMonthPeriod(releaseAt),
    }];
  }).sort((left, right) => left.releaseAt.localeCompare(right.releaseAt));
}

export function applyBlsReleaseCalendar(
  events: IntelligenceEvent[],
  releases: BlsScheduledRelease[],
  now = new Date(),
) {
  const definitions = new Map(BLS_SERIES.map((definition) => [definition.id, definition]));
  const releaseByName = new Map<BlsDefinition['releaseName'], BlsScheduledRelease>();
  for (const release of releases) {
    if (new Date(release.releaseAt).getTime() <= now.getTime()) releaseByName.set(release.name, release);
  }

  return events.map((event) => {
    const seriesId = String(event.payload.seriesId || '');
    const definition = definitions.get(seriesId);
    const release = definition ? releaseByName.get(definition.releaseName) : undefined;
    if (!definition || !release) throw new Error(`BLS release calendar is missing for ${seriesId || 'unknown series'}`);
    if (event.payload.period !== release.expectedPeriod) {
      throw new Error(`BLS ${seriesId} is stale: expected ${release.expectedPeriod}, received ${String(event.payload.period)}`);
    }
    return {
      ...event,
      publishedAt: release.releaseAt,
      contentHash: stableHash(event.contentHash, release.releaseAt, release.expectedPeriod),
      payload: {
        ...event.payload,
        officialReleaseAt: release.releaseAt,
        expectedPeriod: release.expectedPeriod,
        timestampQuality: 'OFFICIAL_RELEASE_CALENDAR',
      },
    };
  });
}

export function normalizeBlsResponse(payload: BlsResponse, observedAt = new Date().toISOString()) {
  if (payload.status !== 'REQUEST_SUCCEEDED') {
    throw new Error(`BLS request failed: ${(payload.message || []).join('; ') || payload.status || 'unknown status'}`);
  }
  const definitions = new Map(BLS_SERIES.map((definition) => [definition.id, definition]));
  const events: IntelligenceEvent[] = [];

  for (const series of payload.Results?.series || []) {
    const definition = definitions.get(series.seriesID);
    if (!definition) continue;
    const rows = (series.data || [])
      .filter((row) => /^M(0[1-9]|1[0-2])$/.test(row.period) && Number.isFinite(Number(row.value)))
      .sort((left, right) => `${right.year}${right.period}`.localeCompare(`${left.year}${left.period}`));
    if (rows.length < 2) continue;
    const latest = rows[0];
    const previous = rows[1];
    const latestValue = Number(latest.value);
    const previousValue = Number(previous.value);
    const comparison = definition.describe(latestValue, previousValue);
    const observationPeriodEnd = periodTimestamp(latest.year, latest.period);
    const title = `${definition.label} ${latestValue.toFixed(definition.decimals)} · ${comparison.changeLabel}`;
    const sourceUrl = `https://data.bls.gov/timeseries/${series.seriesID}`;

    events.push({
      source: 'BLS',
      externalId: `${series.seriesID}:${latest.year}:${latest.period}`,
      sourceTier: 'PRIMARY',
      market: 'US',
      eventType: 'MACRO_RELEASE',
      severity: comparison.severity,
      direction: 'UNKNOWN',
      title,
      summary: `${latest.periodName || latest.period} ${latest.year} 관측치입니다. ${comparison.changeLabel}.`,
      sourceUrl,
      publishedAt: observedAt,
      observedAt,
      symbols: [],
      topics: ['MACRO', definition.topic],
      contentHash: stableHash(
        series.seriesID,
        latest.year,
        latest.period,
        latest.value,
        previous.year,
        previous.period,
        previous.value,
        comparison.change,
      ),
      payload: {
        seriesId: series.seriesID,
        period: `${latest.year}-${latest.period}`,
        value: latestValue,
        previousValue,
        sequentialChange: comparison.change,
        unit: series.seriesID === 'CES0000000001' ? 'thousands' : series.seriesID === 'LNS14000000' ? 'percent' : 'index',
        observationPeriodEnd,
        timestampQuality: 'FIRST_OBSERVED_AT',
      },
      analysis: buildIndicatorAnalysis({
        whyItMatters: comparison.whyItMatters,
        severity: comparison.severity,
      }),
    });
  }

  return dedupeEvents(events);
}

export async function fetchBlsIndicators() {
  const now = new Date();
  const observedAt = now.toISOString();
  const [response, calendarResponse] = await Promise.all([
    fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'MTN/4.0 market-intelligence',
    },
    body: JSON.stringify({
      seriesid: BLS_SERIES.map((series) => series.id),
      startyear: String(now.getUTCFullYear() - 1),
      endyear: String(now.getUTCFullYear()),
      ...(process.env.BLS_API_KEY ? { registrationkey: process.env.BLS_API_KEY } : {}),
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    }),
    fetch('https://www.bls.gov/schedule/news_release/bls.ics', {
      headers: {
        accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5',
        'user-agent': process.env.SEC_USER_AGENT || 'MTN/4.0 contact@mtn.local',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    }),
  ]);
  if (!response.ok) throw new Error(`BLS responded ${response.status}`);
  if (!calendarResponse.ok) throw new Error(`BLS calendar responded ${calendarResponse.status}`);
  const events = normalizeBlsResponse(await response.json() as BlsResponse, observedAt);
  return applyBlsReleaseCalendar(events, parseBlsReleaseCalendar(await calendarResponse.text()), now);
}
