declare module 'framer-motion' {
  import type { ComponentType, HTMLAttributes, ReactNode } from 'react';

  type MotionProps = HTMLAttributes<HTMLElement> & {
    children?: ReactNode;
    initial?: unknown;
    animate?: unknown;
    exit?: unknown;
    transition?: unknown;
    whileHover?: unknown;
    layout?: boolean | string;
  };

  export const motion: {
    div: ComponentType<MotionProps>;
  };

  export const AnimatePresence: ComponentType<{ children?: ReactNode; mode?: string }>;
}
