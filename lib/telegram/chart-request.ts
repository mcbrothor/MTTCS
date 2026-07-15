export interface TelegramChartRequest {
  ticker: string;
  exchange: string | null;
}

export interface TelegramRecommendationChartOption {
  ticker: string;
  exchange: string;
  name: string | null;
  rank: number;
  category: string;
  runDate: string;
  eligible: boolean;
}

interface RecommendationPublicationRow {
  run_date: string;
  category: string;
  recommendation_picks?: Array<{
    ticker: string;
    exchange: string | null;
    name: string | null;
    rank: number;
    candidate_snapshot?: { chart_gate?: { eligible?: boolean } } | null;
  }> | null;
}

function normalizeExchange(value: string | null | undefined) {
  const upper = value?.trim().toUpperCase() || '';
  if (upper === 'NASDAQ' || upper === 'NAS') return 'NAS';
  if (upper === 'NYSE' || upper === 'NYS') return 'NYS';
  if (upper === 'KOSPI' || upper === 'KS') return 'KOSPI';
  if (upper === 'KOSDAQ' || upper === 'KQ') return 'KOSDAQ';
  return null;
}

export function parseTelegramChartCommand(text: string): TelegramChartRequest | null {
  const body = text.replace(/^\/chart(?:@[A-Za-z0-9_]+)?/i, '').trim();
  if (!body) return null;
  const parts = body.split(/[\s/]+/).map((part) => part.trim()).filter(Boolean);
  const ticker = parts[0]?.toUpperCase() || '';
  if (!(/^\d{6}$/.test(ticker) || /^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker))) return null;
  return { ticker, exchange: normalizeExchange(parts[1]) };
}

export function buildTelegramChartCallback(option: Pick<TelegramRecommendationChartOption, 'ticker' | 'exchange'>) {
  return `chart|${option.ticker}|${option.exchange}`;
}

export function parseTelegramChartCallback(value: string): TelegramChartRequest | null {
  const [command, rawTicker, rawExchange] = value.split('|');
  if (command !== 'chart' || !rawTicker) return null;
  const ticker = rawTicker.toUpperCase();
  const exchange = normalizeExchange(rawExchange);
  if (!exchange || !(/^\d{6}$/.test(ticker) || /^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker))) return null;
  return { ticker, exchange };
}

export function flattenLatestRecommendationCharts(publications: RecommendationPublicationRow[]) {
  const categoryOrder = ['NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150'];
  const latestDateByCategory = publications.reduce((dates, publication) => {
    const current = dates.get(publication.category);
    if (!current || publication.run_date > current) dates.set(publication.category, publication.run_date);
    return dates;
  }, new Map<string, string>());
  return publications
    .filter((publication) => publication.run_date === latestDateByCategory.get(publication.category))
    .flatMap((publication) => (publication.recommendation_picks || []).map((pick): TelegramRecommendationChartOption | null => {
      const exchange = normalizeExchange(pick.exchange);
      if (!exchange) return null;
      return {
        ticker: pick.ticker,
        exchange,
        name: pick.name,
        rank: pick.rank,
        category: publication.category,
        runDate: publication.run_date,
        eligible: pick.candidate_snapshot?.chart_gate?.eligible === true,
      };
    }))
    .filter((option): option is TelegramRecommendationChartOption => option !== null)
    .sort((left, right) => {
      const categoryDiff = categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category);
      return categoryDiff || left.rank - right.rank;
    });
}

export function selectTelegramChartMenuOptions(options: TelegramRecommendationChartOption[], limit = 12) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = `${option.ticker}:${option.exchange}`;
    if (!option.eligible || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, Math.max(1, Math.min(20, limit)));
}
