import type { Direction } from '../../../types/index.ts';

export function directionMultiplier(direction: Direction): 1 | -1 {
  if (direction === 'LONG') return 1;
  if (direction === 'SHORT') return -1;
  throw new TypeError(`Unsupported trade direction: ${String(direction)}`);
}

export function calculateDirectionalPnL(
  direction: Direction,
  entryPrice: number,
  exitPrice: number,
  shares: number
) {
  return directionMultiplier(direction) * (exitPrice - entryPrice) * shares;
}

export function calculateEntrySlippagePct(
  direction: Direction,
  plannedEntryPrice: number,
  actualEntryPrice: number
) {
  return directionMultiplier(direction) * ((actualEntryPrice - plannedEntryPrice) / plannedEntryPrice) * 100;
}
