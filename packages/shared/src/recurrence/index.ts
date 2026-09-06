import rrulePkg from 'rrule';
const { RRule } = rrulePkg;

export { buildRrule, rruleToPreset } from './utils.js';
export type { RecurrencePreset } from './utils.js';

/**
 * Compute the next occurrence after `after` from an RRULE string.
 * Pure — no `new Date()` internal. Returns null if no more occurrences.
 *
 * @param rruleStr  RFC 5545 RRULE string (e.g. "FREQ=DAILY")
 * @param after     The reference date to find the next occurrence after
 * @param dtstart   The original DTSTART of the recurrence series
 */
export function nextOccurrence(
  rruleStr: string,
  after: Date,
  dtstart: Date,
): Date | null {
  let rule: InstanceType<typeof RRule>;
  try {
    rule = RRule.fromString(`DTSTART:${toICalDate(dtstart)}\nRRULE:${rruleStr}`);
  } catch {
    return null;
  }

  // after is the current due_date — we want the NEXT one strictly after it
  const next = rule.after(after, false);
  return next && next < addYears(after, 10) ? next : null;
}

function toICalDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function addYears(d: Date, n: number): Date {
  const r = new Date(d);
  r.setFullYear(r.getFullYear() + n);
  return r;
}