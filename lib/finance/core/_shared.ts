export const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
