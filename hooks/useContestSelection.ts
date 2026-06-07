'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CONTEST_SELECTIONS_MAP_KEY,
  CONTEST_SELECTIONS_SOURCE_MAP_KEY,
  CONTEST_SELECTION_STORAGE_KEY,
  CONTEST_SOURCE_STORAGE_KEY,
  DEFAULT_CONTEST_SOURCE,
  MAX_CONTEST_CANDIDATES,
  type ContestScreenerSource,
  sourceUniverseKey,
} from '@/lib/contest-sources';
import type { ScannerUniverse } from '@/types';

const LATEST_SCAN_UNIVERSE_STORAGE_KEY = 'mtn:scanner:latest-scan-universe:v1';
const MAX_SELECTION = MAX_CONTEST_CANDIDATES;

interface UseContestSelectionOptions {
  source?: ContestScreenerSource;
}

function activeUniverseOf(targetUniverse?: string) {
  return targetUniverse || window.localStorage.getItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY) || 'NASDAQ100';
}

function readJsonMap(key: string) {
  const raw = window.localStorage.getItem(key);
  return raw ? JSON.parse(raw) as Record<string, unknown> : {};
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function useContestSelection(targetUniverse?: string, options: UseContestSelectionOptions = {}) {
  const source = options.source || DEFAULT_CONTEST_SOURCE;
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSelection = useCallback((universe?: string) => {
    try {
      const activeUniverse = universe || activeUniverseOf(targetUniverse);
      const sourceMap = readJsonMap(CONTEST_SELECTIONS_SOURCE_MAP_KEY);
      const sourceSelection = objectRecord(sourceMap[sourceUniverseKey(source, activeUniverse as ScannerUniverse)]);
      if (sourceSelection && Array.isArray(sourceSelection.tickers)) {
        return new Set((sourceSelection.tickers as string[]).slice(0, MAX_SELECTION));
      }

      if (source === DEFAULT_CONTEST_SOURCE) {
        const legacyMap = readJsonMap(CONTEST_SELECTIONS_MAP_KEY);
        const legacySelection = objectRecord(legacyMap[activeUniverse]);
        if (legacySelection && Array.isArray(legacySelection.tickers)) {
          return new Set((legacySelection.tickers as string[]).slice(0, MAX_SELECTION));
        }
      }

      const raw = window.localStorage.getItem(CONTEST_SELECTION_STORAGE_KEY);
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw);
      const parsedSource = parsed.source || DEFAULT_CONTEST_SOURCE;
      const tickers = Array.isArray(parsed) ? parsed : (parsed.tickers || []);
      const storedUniverse = parsed.universe || window.localStorage.getItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY);
      if (parsedSource === source && storedUniverse === activeUniverse && Array.isArray(tickers)) {
        return new Set(tickers.slice(0, MAX_SELECTION));
      }
      return new Set<string>();
    } catch {
      return new Set<string>();
    }
  }, [source, targetUniverse]);

  useEffect(() => {
    setSelectedTickers(loadSelection());
  }, [loadSelection]);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (
        event.key === CONTEST_SELECTIONS_SOURCE_MAP_KEY
        || event.key === CONTEST_SELECTIONS_MAP_KEY
        || event.key === CONTEST_SELECTION_STORAGE_KEY
      ) {
        setSelectedTickers(loadSelection());
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [loadSelection]);

  const persistSelection = useCallback((activeUniverse: string, tickers: string[]) => {
    const savedAt = new Date().toISOString();
    const selection = { source, universe: activeUniverse, tickers, savedAt };

    const sourceMap = readJsonMap(CONTEST_SELECTIONS_SOURCE_MAP_KEY);
    sourceMap[sourceUniverseKey(source, activeUniverse as ScannerUniverse)] = selection;
    window.localStorage.setItem(CONTEST_SELECTIONS_SOURCE_MAP_KEY, JSON.stringify(sourceMap));
    window.localStorage.setItem(CONTEST_SELECTION_STORAGE_KEY, JSON.stringify(selection));
    window.localStorage.setItem(CONTEST_SOURCE_STORAGE_KEY, source);

    if (source === DEFAULT_CONTEST_SOURCE) {
      window.localStorage.setItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY, activeUniverse);
      const legacyMap = readJsonMap(CONTEST_SELECTIONS_MAP_KEY);
      legacyMap[activeUniverse] = { universe: activeUniverse, tickers, savedAt };
      window.localStorage.setItem(CONTEST_SELECTIONS_MAP_KEY, JSON.stringify(legacyMap));
    }

    window.dispatchEvent(new CustomEvent('mtn:selection:sync', {
      detail: { source, universe: activeUniverse, tickers },
    }));
  }, [source]);

  const toggleSelection = useCallback((ticker: string, universeOverride?: string) => {
    const activeUniverse = universeOverride || activeUniverseOf(targetUniverse);

    setSelectedTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) {
        next.delete(ticker);
      } else {
        if (next.size >= MAX_SELECTION) {
          if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
          setLimitMessage(`콘테스트 후보는 최대 ${MAX_SELECTION}개까지 선택할 수 있습니다.`);
          limitTimerRef.current = setTimeout(() => setLimitMessage(null), 3000);
          return prev;
        }
        next.add(ticker);
      }

      persistSelection(activeUniverse, Array.from(next));
      return next;
    });
  }, [persistSelection, targetUniverse]);

  useEffect(() => {
    const handleCustomSync = (event: CustomEvent<{ source?: ContestScreenerSource; universe: string; tickers: string[] }>) => {
      const activeUniverse = activeUniverseOf(targetUniverse);
      if (
        event.detail
        && (event.detail.source || DEFAULT_CONTEST_SOURCE) === source
        && event.detail.universe === activeUniverse
        && Array.isArray(event.detail.tickers)
      ) {
        setSelectedTickers(new Set(event.detail.tickers));
      }
    };
    window.addEventListener('mtn:selection:sync', handleCustomSync as EventListener);
    return () => window.removeEventListener('mtn:selection:sync', handleCustomSync as EventListener);
  }, [source, targetUniverse]);

  const clearSelection = useCallback((universeOverride?: string) => {
    const activeUniverse = universeOverride || activeUniverseOf(targetUniverse);
    persistSelection(activeUniverse, []);
    setSelectedTickers(new Set());
  }, [persistSelection, targetUniverse]);

  useEffect(() => {
    return () => {
      if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
    };
  }, []);

  return {
    selectedTickers,
    toggleSelection,
    clearSelection,
    MAX_SELECTION,
    limitMessage,
  };
}
