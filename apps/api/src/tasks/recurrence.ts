import rrulePkg from 'rrule';

const { RRule } = rrulePkg;

export function isValidRrule(value: string | null | undefined): boolean {
  if (!value) return true;
  try {
    RRule.fromString(value);
    return true;
  } catch {
    return false;
  }
}
