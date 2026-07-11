export const DEFAULT_TECHNICAL_CHART_MODEL = 'qwen3:14b';
export const DEFAULT_TECHNICAL_CHART_FALLBACKS = ['qwen3:8b', 'qwen2.5:7b'];

function normalizeModelId(value) {
  return String(value || '').trim().toLowerCase();
}

export function parseModelFallbacks(value) {
  if (Array.isArray(value)) return value.map(normalizeModelId).filter(Boolean);
  return String(value || '')
    .split(',')
    .map(normalizeModelId)
    .filter(Boolean);
}

export function selectTechnicalChartModel({ installedModels, preferredModel, fallbackModels }) {
  const installed = new Set((installedModels || []).map(normalizeModelId));
  const candidates = [
    normalizeModelId(preferredModel || DEFAULT_TECHNICAL_CHART_MODEL),
    ...parseModelFallbacks(fallbackModels?.length ? fallbackModels : DEFAULT_TECHNICAL_CHART_FALLBACKS),
  ];
  const model = candidates.find((candidate) => installed.has(candidate)) || null;
  if (!model) return null;
  return {
    model,
    tier: model === 'qwen3:14b' ? 'PRIMARY' : model === 'qwen3:8b' ? 'FAST_FALLBACK' : 'COMPATIBILITY_FALLBACK',
    disableThinking: model.startsWith('qwen3:'),
  };
}

export async function discoverTechnicalChartModel({ baseUrl, preferredModel, fallbackModels, request }) {
  const root = String(baseUrl || '').replace(/\/v1\/?$/, '').replace(/\/$/, '');
  const response = await request(`${root}/v1/models`);
  const payload = response?.data || response;
  const installedModels = Array.isArray(payload?.data) ? payload.data.map((item) => item?.id) : [];
  return selectTechnicalChartModel({ installedModels, preferredModel, fallbackModels });
}
