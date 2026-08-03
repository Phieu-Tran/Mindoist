import { CalendarClock } from 'lucide-react';
import { DatePicker, TimePicker } from '@/components/ui/date-picker';

interface Props {
  deadlineDate: string;
  deadlineTime: string;
  onDeadlineDateChange: (value: string) => void;
  onDeadlineTimeChange: (value: string) => void;
}

export function TaskScheduleEditor({
  deadlineDate,
  deadlineTime,
  onDeadlineDateChange,
  onDeadlineTimeChange,
}: Props) {
  return (
    <section
      aria-label="Schedule"
      data-property-registry="deadline"
      className="rounded-control bg-muted/25 px-2 py-1.5"
    >
      <div className="grid grid-cols-[1rem_3.5rem_minmax(0,1fr)_5.5rem] items-center gap-2">
        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-[11px] font-medium text-muted-foreground">Deadline</span>
        <DatePicker
          value={deadlineDate}
          onChange={onDeadlineDateChange}
          placeholder="Add date"
          testId="detail-deadline-v2"
          className="h-7 min-w-0 w-full"
        />
        <TimePicker
          value={deadlineTime}
          onChange={onDeadlineTimeChange}
          placeholder="Time"
          ariaLabel="Deadline time"
          testId="detail-deadline-time-v2"
          className="h-7 w-full"
        />
      </div>
    </section>
  );
}
