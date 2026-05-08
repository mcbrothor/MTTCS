'use client';

import { useEffect, useState } from 'react';

type Viewport = 'mobile' | 'desktop';

const MOBILE_BREAKPOINT = 768;

export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>('desktop');

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const update = (e: MediaQueryListEvent | MediaQueryList) => {
      setViewport(e.matches ? 'mobile' : 'desktop');
    };
    update(mq);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return viewport;
}

export function useIsMobile(): boolean {
  return useViewport() === 'mobile';
}
