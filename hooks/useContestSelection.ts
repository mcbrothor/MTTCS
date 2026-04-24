'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const CONTEST_SELECTION_STORAGE_KEY = 'mtn:contest:selected:v1';
const CONTEST_SELECTIONS_MAP_KEY = 'mtn:contest:selections:v2';
const LATEST_SCAN_UNIVERSE_STORAGE_KEY = 'mtn:scanner:latest-scan-universe:v1';
const MAX_SELECTION = 10;

/**
 * 전역 콘테스트 후보 선택 상태를 관리하는 훅입니다.
 * 미너비니 스캐너와 오닐 스캐너간에 선택 목록을 동기화합니다.
 */
export function useContestSelection(targetUniverse?: string) {
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 스토리지에서 특정 유니버스의 선택 목록 읽기
  const loadSelection = useCallback((universe?: string) => {
    try {
      const activeUniverse = universe || targetUniverse || window.localStorage.getItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY) || 'NASDAQ100';
      const mapRaw = window.localStorage.getItem(CONTEST_SELECTIONS_MAP_KEY);
      
      if (mapRaw) {
        const map = JSON.parse(mapRaw);
        const selection = map[activeUniverse];
        if (selection && Array.isArray(selection.tickers)) {
          return new Set(selection.tickers as string[]);
        }
      }

      // 하위 호환성: 기존 mtn:contest:selected:v1에서 시도
      const raw = window.localStorage.getItem(CONTEST_SELECTION_STORAGE_KEY);
      if (!raw) return new Set<string>();
      
      const parsed = JSON.parse(raw);
      const tickers = Array.isArray(parsed) ? parsed : (parsed.tickers || []);
      const storedUniverse = parsed.universe || window.localStorage.getItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY);
      
      // 만약 기존 저장 데이터의 유니버스가 현재 찾는 것과 같다면 사용
      if (storedUniverse === activeUniverse && Array.isArray(tickers)) {
        return new Set(tickers.slice(0, MAX_SELECTION));
      }

      return new Set<string>();
    } catch {
      return new Set<string>();
    }
  }, [targetUniverse]);

  // 초기 로드
  useEffect(() => {
    setSelectedTickers(loadSelection());
  }, [loadSelection]);

  // 다른 탭/페이지에서의 변경 감지
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CONTEST_SELECTIONS_MAP_KEY) {
        setSelectedTickers(loadSelection());
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [loadSelection]);

  const toggleSelection = useCallback((ticker: string, universeOverride?: string) => {
    const activeUniverse = universeOverride || targetUniverse || window.localStorage.getItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY) || 'NASDAQ100';
    
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
      
      const tickers = Array.from(next);
      const savedAt = new Date().toISOString();

      // 1. 유니버스 맵 업데이트
      const mapRaw = window.localStorage.getItem(CONTEST_SELECTIONS_MAP_KEY);
      const map = mapRaw ? JSON.parse(mapRaw) : {};
      map[activeUniverse] = { universe: activeUniverse, tickers, savedAt };
      window.localStorage.setItem(CONTEST_SELECTIONS_MAP_KEY, JSON.stringify(map));

      // 2. 하위 호환성용 단일 저장소 업데이트 (마지막 선택 주체)
      window.localStorage.setItem(CONTEST_SELECTION_STORAGE_KEY, JSON.stringify(map[activeUniverse]));
      
      // 3. 동기화 이벤트 발생
      window.dispatchEvent(new CustomEvent('mtn:selection:sync', { 
        detail: { universe: activeUniverse, tickers } 
      }));
      
      return next;
    });
  }, [targetUniverse]);

  // 커스텀 이벤트 감지 (같은 탭 내 동기화)
  useEffect(() => {
    const handleCustomSync = (e: CustomEvent<{ universe: string; tickers: string[] }>) => {
      const activeUniverse = targetUniverse || window.localStorage.getItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY) || 'NASDAQ100';
      if (e.detail && e.detail.universe === activeUniverse && Array.isArray(e.detail.tickers)) {
        setSelectedTickers(new Set(e.detail.tickers));
      }
    };
    window.addEventListener('mtn:selection:sync', handleCustomSync as EventListener);
    return () => window.removeEventListener('mtn:selection:sync', handleCustomSync as EventListener);
  }, [targetUniverse]);

  const clearSelection = useCallback((universeOverride?: string) => {
    const activeUniverse = universeOverride || targetUniverse || window.localStorage.getItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY) || 'NASDAQ100';
    
    const mapRaw = window.localStorage.getItem(CONTEST_SELECTIONS_MAP_KEY);
    const map = mapRaw ? JSON.parse(mapRaw) : {};
    map[activeUniverse] = { universe: activeUniverse, tickers: [], savedAt: new Date().toISOString() };
    
    window.localStorage.setItem(CONTEST_SELECTIONS_MAP_KEY, JSON.stringify(map));
    window.localStorage.setItem(CONTEST_SELECTION_STORAGE_KEY, JSON.stringify(map[activeUniverse]));
    
    window.dispatchEvent(new CustomEvent('mtn:selection:sync', { 
      detail: { universe: activeUniverse, tickers: [] } 
    }));
    
    setSelectedTickers(new Set());
  }, [targetUniverse]);

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
