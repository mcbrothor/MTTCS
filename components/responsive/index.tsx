import type { ReactNode } from 'react';

interface ViewProps {
  children: ReactNode;
}

/**
 * CSS-only hide/show — SSR/hydration safe (양쪽 항상 렌더됨).
 * 무거운 컴포넌트엔 useIsMobile()로 조건부 렌더 사용.
 */
export function DesktopOnly({ children }: ViewProps) {
  return <div className="hidden md:block">{children}</div>;
}

export function MobileOnly({ children }: ViewProps) {
  return <div className="block md:hidden">{children}</div>;
}
