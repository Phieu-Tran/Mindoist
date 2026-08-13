import type { TimeBlock } from '@mindoist/shared/types';
import type { DeadlineProjection, ExternalEventProjection } from '../projection';

interface TaskCalendarIdentity {
  taskId: string;
  title: string;
  completed: boolean;
  priority: number | null;
  identityColor: string;
  colorName: string | null;
}

export type CalendarItem =
  | (TaskCalendarIdentity & {
      kind: 'block'; id: string; start: Date; end: Date; timeZone: string;
      editable: true; allDay: boolean; conflict: boolean; block: TimeBlock;
    })
  | (TaskCalendarIdentity & {
      kind: 'deadline'; id: string; date: string; time: string | null;
      timeZone: string | null; allDay: boolean; editable: true; deadline: DeadlineProjection;
    })
  | (TaskCalendarIdentity & {
      kind: 'range'; id: string; startDate: string; endDate: string;
    })
  | {
      kind: 'external'; id: string; provider: string; start: Date; end: Date;
      allDay: boolean; title: string; event?: ExternalEventProjection;
    };

export interface PositionedBlock {
  item: Extract<CalendarItem, { kind: 'block' | 'external' }>;
  column: number;
  columnCount: number;
  top: number;
  height: number;
}
