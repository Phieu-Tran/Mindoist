import { getKit } from './kit';
import type { DatePickerProps, DateRangePickerProps, TimePickerProps } from './legacy/date-picker';

export function DatePicker(props: DatePickerProps) {
  const Impl = getKit().DatePicker;
  return <Impl {...props} />;
}

export function DateRangePicker(props: DateRangePickerProps) {
  const Impl = getKit().DateRangePicker;
  return <Impl {...props} />;
}

export function TimePicker(props: TimePickerProps) {
  const Impl = getKit().TimePicker;
  return <Impl {...props} />;
}

export type { DatePickerProps, DateRangePickerProps, TimePickerProps };
