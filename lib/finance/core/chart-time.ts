export function normalizeChartDate(value: string) {
  const date = String(value || '').trim();
  const compact = date.replaceAll('-', '');
  if (/^\d{8}$/.test(compact)) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }
  return date;
}

export function toCompactChartDate(value: string) {
  return normalizeChartDate(value).replaceAll('-', '');
}

export function isIsoChartDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
