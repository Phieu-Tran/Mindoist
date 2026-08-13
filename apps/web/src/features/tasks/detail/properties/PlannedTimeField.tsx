import { TaskPlannedTimeEditor } from '@/features/tasks/detail/TaskPlannedTimeEditor';

interface Props { taskId: string; defaultDate: string; onChanged?: () => void }

export function PlannedTimeField({ taskId, defaultDate, onChanged }: Props) {
  return <TaskPlannedTimeEditor taskId={taskId} defaultDate={defaultDate} onChanged={onChanged} />;
}
