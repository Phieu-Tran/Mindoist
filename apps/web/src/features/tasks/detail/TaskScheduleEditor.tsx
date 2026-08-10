import { CalendarClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DateRangePicker, TimePicker } from '@/components/ui/date-picker';

interface Props {
  deadlineDate: string;
  deadlineTime: string;
  onDeadlineDateChange: (value: string) => void;
  onDeadlineTimeChange: (value: string) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
}

// One calendar, one spot: picking a single date sets the deadline; adding a
// second (via the "+ From" tab inside the same popup) turns it into a
// start->deadline span. DateRangePicker already owns that whole flow in
// compact mode - this just wires it into the deadline row instead of
// running two separate date pickers side by side.
export function TaskScheduleEditor({
  deadlineDate,
  deadlineTime,
  onDeadlineDateChange,
  onDeadlineTimeChange,
  startDate,
  onStartDateChange,
}: Props) {
  const { t } = useTranslation('tasks');

  return (
    <section
      aria-label={t('detail.completionTime')}
      data-property-registry="deadline"
      className="rounded-control bg-muted/25 px-2 py-1.5"
    >
      {/* flex-wrap, not a fixed-column grid: a start->deadline span reads as
          "dd/mm/yyyy -> dd/mm/yyyy", wider than a single date, and a rigid
          grid column let it overflow into (and get visually covered by) the
          time field next to it instead of just taking a second line. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <div className="flex shrink-0 items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-[11px] font-medium text-muted-foreground">
            {startDate ? t('detail.timeline') : t('detail.dueDay')}
          </span>
        </div>
        <DateRangePicker
          startValue={startDate}
          dueValue={deadlineDate}
          onStartChange={onStartDateChange}
          onDueChange={onDeadlineDateChange}
          startLabel={t('detail.startDate')}
          dueLabel={t('detail.deadline')}
          startTestId="detail-start-date-v2"
          dueTestId="detail-deadline-v2"
          compact
        />
        <TimePicker
          value={deadlineTime}
          onChange={onDeadlineTimeChange}
          placeholder={t('detail.deadlineTime')}
          ariaLabel={t('detail.deadlineTime')}
          testId="detail-deadline-time-v2"
          className="shrink-0"
          align="right"
        />
      </div>
    </section>
  );
}
