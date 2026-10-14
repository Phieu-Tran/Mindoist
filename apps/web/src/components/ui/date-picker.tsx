import { getKitOverrides } from './kit';
import {
  DatePicker as LegacyDatePicker,
  DateRangePicker as LegacyDateRangePicker,
  TimePicker as LegacyTimePicker,
  type DatePickerProps,
  type DateRangePickerProps,
  type TimePickerProps,
} from './legacy/date-picker';

export function DatePicker(props: DatePickerProps) {
  const Impl = getKitOverrides().DatePicker ?? LegacyDatePicker;
  return <Impl {...props} />;
}

export function DateRangePicker(props: DateRangePickerProps) {
  const Impl = getKitOverrides().DateRangePicker ?? LegacyDateRangePicker;
  return <Impl {...props} />;
}

export function TimePicker(props: TimePickerProps) {
  const Impl = getKitOverrides().TimePicker ?? LegacyTimePicker;
  return <Impl {...props} />;
}

export type { DatePickerProps, DateRangePickerProps, TimePickerProps };
