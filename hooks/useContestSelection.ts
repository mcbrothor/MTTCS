'use client';

import { useState, useEffect, useCallback } from 'react';

const CONTEST_SELECTION_STORAGE_KEY = 'mtn:contest:selected:v1';
const MAX_SELECTION = 10;

/**
 * 전역 콘테스트 후보 선택 상태를 관리하는 훅입니다.
 * 미너비니 스캐너와 오닐 스캐너간에 선택 목록을 동기화합니다.
 */
export function useContestSelection() {
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());

  // 스토리지에서 읽기
  const loadSelection = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(CONTEST_SELECTION_STORAGE_KEY);
      if (!raw) return new Set<string>();
      
      const parsed = JSON.parse(raw);
      // 포맷 호환성: { tickers: string[] } 또는 string[]
      const tickers = Array.isArray(parsed) ? parsed : (parsed.tickers || []);
      
      if (Array.isArray(tickers)) {
        return new Set(tickers.slice(0, MAX_SELECTION));
      }
      return new Set<string>();
    } catch {
      return new Set<string>();
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    setSelectedTickers(loadSelection());
  }, [loadSelection]);

  // 다른 탭/페이지에서의 변경 감지
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CONTEST_SELECTION_STORAGE_KEY) {
        setSelectedTickers(loadSelection());
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [loadSelection]);

  const toggleSelection = useCallback((ticker: string) => {
    setSelectedTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) {
        next.delete(ticker);
      } else {
        if (next.size >= MAX_SELECTION) {
          alert(`콘테스트 후보는 최대 ${MAX_SELECTION}개까지 선택할 수 있습니다.`);
          return prev;
        }
        next.add(ticker);
      }
      
      // 스토리지 저장 (포맷 단순화: string[])
      window.localStorage.setItem(CONTEST_SELECTION_STORAGE_KEY, JSON.stringify(Array.from(next)));
      
      // 같은 창 내의 다른 컴포넌트에게 알림 (커스텀 이벤트)
      window.dispatchEvent(new CustomEvent('mtn:selection:sync', { detail: Array.from(next) }));
      
      return next;
    });
  }, []);

  // 커스텀 이벤트 감지 (같은 탭 내 동기화)
  useEffect(() => {
    const handleCustomSync = (e: CustomEvent<string[]>) => {
      if (e.detail && Array.isArray(e.detail)) {
        setSelectedTickers(new Set(e.detail));
      }
    };
    window.addEventListener('mtn:selection:sync', handleCustomSync as EventListener);
    return () => window.removeEventListener('mtn:selection:sync', handleCustomSync as EventListener);
  }, []);

  const clearSelection = useCallback(() => {
    const next = new Set<string>();
    window.localStorage.setItem(CONTEST_SELECTION_STORAGE_KEY, JSON.stringify([]));
    window.dispatchEvent(new CustomEvent('mtn:selection:sync', { detail: [] }));
    setSelectedTickers(next);
  }, []);

  return {
    selectedTickers,
    toggleSelection,
    clearSelection,
    MAX_SELECTION
  };
}
