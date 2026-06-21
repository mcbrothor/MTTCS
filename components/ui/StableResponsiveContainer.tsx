'use client';

import type { ComponentProps } from 'react';
import { ResponsiveContainer } from 'recharts';

type ResponsiveContainerProps = Omit<ComponentProps<typeof ResponsiveContainer>, 'initialDimension'> & {
  initialWidth?: number;
  initialHeight?: number;
};

export default function StableResponsiveContainer({
  initialWidth = 320,
  initialHeight = 180,
  minWidth = 0,
  minHeight = 0,
  ...props
}: ResponsiveContainerProps) {
  return (
    <ResponsiveContainer
      {...props}
      minWidth={minWidth}
      minHeight={minHeight}
      initialDimension={{ width: initialWidth, height: initialHeight }}
    />
  );
}
