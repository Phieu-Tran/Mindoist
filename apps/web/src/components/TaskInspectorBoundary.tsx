import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { TaskInspectorProps } from './TaskDetail';
import { Skeleton } from './ui/skeleton';

const LazyTaskInspector = lazy(() => import('./TaskDetail').then(module => ({
  default: module.TaskInspector,
})));

export function TaskInspectorBoundary(props: TaskInspectorProps) {
  const { t } = useTranslation('tasks');
  return (
    <Suspense fallback={(
      <div className="flex min-h-48 flex-1 flex-col gap-3 p-4" role="status" aria-label={t('detail.loading')}>
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )}>
      <LazyTaskInspector {...props} />
    </Suspense>
  );
}
