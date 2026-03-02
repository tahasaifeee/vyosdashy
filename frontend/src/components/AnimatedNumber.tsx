'use client';

import { useCountUp } from '@/hooks/useCountUp';

interface AnimatedNumberProps {
  value: number;
  format?: (val: number) => string;
  duration?: number;
}

export function AnimatedNumber({ value, format = (v) => Math.round(v).toString(), duration = 1000 }: AnimatedNumberProps) {
  const count = useCountUp(value, duration);
  return <>{format(count)}</>;
}
