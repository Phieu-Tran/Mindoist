import type { HTMLAttributes } from 'react';
import { Skeleton as HeroSkeleton } from '@heroui/react';

/** HeroUI skeleton (pulse animation set by --skeleton-animation in heroui.css). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <HeroSkeleton className={className} {...props} />;
}
