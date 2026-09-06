import rrulePkg from 'rrule';

const { RRule } = rrulePkg;

export function isValidRrule(value: string | null | undefined): boolean {
  if (!value) return true;
  try {
    const { freq, interval } = RRule.fromString(value).options;
    return freq <= RRule.HOURLY && interval > 0;
  } catch {
    return false;
  }
}
