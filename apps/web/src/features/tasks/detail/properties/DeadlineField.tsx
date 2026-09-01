import { TaskScheduleEditor } from '@/features/tasks/detail/TaskScheduleEditor';
import { usePropertyMutation } from './use-property-mutation';
import type { PropertySave } from './types';

interface Props {
  taskId: string;
  deadlineDate: string;
  deadlineTime: string;
  deadlineTimeZone?: string | null;
  startDate: string;
  save: PropertySave;
  onDeadlineDateChange: (value: string) => void;
  onDeadlineTimeChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
}

export function DeadlineField(props: Props) {
  const { commit, error } = usePropertyMutation(props.taskId, props.save);
  const deadline = (date: string, time: string) => date ? {
    date,
    ...(time ? { time, timeZone: props.deadlineTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } : {}),
  } : null;
  return (
    <div title={error ?? undefined}>
      <TaskScheduleEditor
        deadlineDate={props.deadlineDate}
        deadlineTime={props.deadlineTime}
        onDeadlineDateChange={(value) => {
          props.onDeadlineDateChange(value);
          void commit({ deadline: deadline(value, props.deadlineTime) });
        }}
        onDeadlineTimeChange={(value) => {
          props.onDeadlineTimeChange(value);
          if (props.deadlineDate) void commit({ deadline: deadline(props.deadlineDate, value) });
        }}
        startDate={props.startDate}
        onStartDateChange={(value) => {
          props.onStartDateChange(value);
          void commit({ startDate: value || null });
        }}
      />
    </div>
  );
}
