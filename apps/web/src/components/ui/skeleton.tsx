import type { HTMLAttributes } from 'react';
import { getKitOverrides } from './kit';
import { Skeleton as LegacySkeleton } from './legacy/skeleton';

export function Skeleton(props: HTMLAttributes<HTMLDivElement>) {
  const Impl = getKitOverrides().Skeleton ?? LegacySkeleton;
  return <Impl {...props} />;
}
