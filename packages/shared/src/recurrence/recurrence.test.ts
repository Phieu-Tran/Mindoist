import { describe, it, expect } from 'vitest';
import { nextOccurrence } from './index.js';

const DTSTART = new Date('2026-07-18T00:00:00Z'); // Saturday

describe('nextOccurrence', () => {
  it('DAILY moves forward one day', () => {
    const next = nextOccurrence('FREQ=DAILY', new Date('2026-07-18T00:00:00Z'), DTSTART);
    expect(next).toEqual(new Date('2026-07-19T00:00:00Z'));
  });

  it('WEEKLY BYDAY=MO,WE,FR skips Tue/Thu/Sat/Sun', () => {
    const next = nextOccurrence('FREQ=WEEKLY;BYDAY=MO,WE,FR', new Date('2026-07-18T00:00:00Z'), DTSTART);
    expect(next).toEqual(new Date('2026-07-20T00:00:00Z')); // Mon
  });

  it('WEEKLY BYDAY=MO,WE,FR from Wed goes to Fri', () => {
    const next = nextOccurrence('FREQ=WEEKLY;BYDAY=MO,WE,FR', new Date('2026-07-22T00:00:00Z'), DTSTART);
    expect(next).toEqual(new Date('2026-07-24T00:00:00Z')); // Fri
  });

  it('MONTHLY BYMONTHDAY=31 skips months without 31st', () => {
    // DTSTART = 2026-07-31 (Friday) -> next is 2026-08-31 (Mon), then 2026-10-31 (Sat) (Sep has no 31st)
    const dtstart = new Date('2026-07-31T00:00:00Z');
    const next = nextOccurrence('FREQ=MONTHLY;BYMONTHDAY=31', new Date('2026-07-31T00:00:00Z'), dtstart);
    expect(next).toEqual(new Date('2026-08-31T00:00:00Z'));
  });

  it('WEEKLY INTERVAL=2 skips every other week', () => {
    const next = nextOccurrence('FREQ=WEEKLY;INTERVAL=2', new Date('2026-07-18T00:00:00Z'), DTSTART);
    expect(next).toEqual(new Date('2026-08-01T00:00:00Z')); // 2 weeks later
  });

  it('COUNT exhausted returns null', () => {
    const next = nextOccurrence('FREQ=DAILY;COUNT=1', new Date('2026-07-18T00:00:00Z'), DTSTART);
    expect(next).toBeNull();
  });

  it('UNTIL exhausted returns null', () => {
    // DTSTART = 2026-07-18, UNTIL = 2026-07-18 00:00:00 (only 1 occurrence)
    const next = nextOccurrence(
      'FREQ=DAILY;UNTIL=20260718T000000Z',
      new Date('2026-07-18T00:00:00Z'),
      DTSTART,
    );
    expect(next).toBeNull();
  });

  it('UNTIL before 2nd occurrence returns null', () => {
    // DTSTART = 2026-07-18, UNTIL = 2026-07-18 00:00:00 (before 2nd occurrence)
    const next = nextOccurrence(
      'FREQ=DAILY;UNTIL=20260718T000000Z',
      new Date('2026-07-18T00:00:00Z'),
      DTSTART,
    );
    expect(next).toBeNull();
  });

  it('returns null when after is far past UNTIL', () => {
    const after = new Date('2030-01-01T00:00:00Z');
    const next = nextOccurrence('FREQ=DAILY;UNTIL=20260719T000000Z', after, DTSTART);
    expect(next).toBeNull();
  });

  it('WEEKLY from Saturday goes to next Monday (BYDAY=MO,WE,FR)', () => {
    const next = nextOccurrence('FREQ=WEEKLY;BYDAY=MO,WE,FR', new Date('2026-07-18T00:00:00Z'), DTSTART);
    expect(next).toEqual(new Date('2026-07-20T00:00:00Z')); // Monday
  });

  it('MONTHLY BYMONTHDAY=31 from Aug 31 goes to Oct 31 (skips Sep)', () => {
    const dtstart = new Date('2026-07-31T00:00:00Z');
    const next = nextOccurrence('FREQ=MONTHLY;BYMONTHDAY=31', new Date('2026-08-31T00:00:00Z'), dtstart);
    expect(next).toEqual(new Date('2026-10-31T00:00:00Z'));
  });

  it('INTERVAL=2 with WEEKLY advances by 2 weeks', () => {
    const next = nextOccurrence('FREQ=WEEKLY;INTERVAL=2', new Date('2026-07-18T00:00:00Z'), DTSTART);
    expect(next).toEqual(new Date('2026-08-01T00:00:00Z'));
  });

  it('DAILY with COUNT=3 returns null after 3 occurrences', () => {
    // 1st: 2026-07-18, 2nd: 2026-07-19, 3rd: 2026-07-20 -> after 3rd, null
    const next1 = nextOccurrence('FREQ=DAILY;COUNT=3', new Date('2026-07-18T00:00:00Z'), DTSTART);
    expect(next1).toEqual(new Date('2026-07-19T00:00:00Z'));

    const next2 = nextOccurrence('FREQ=DAILY;COUNT=3', new Date('2026-07-19T00:00:00Z'), DTSTART);
    expect(next2).toEqual(new Date('2026-07-20T00:00:00Z'));

    const next3 = nextOccurrence('FREQ=DAILY;COUNT=3', new Date('2026-07-20T00:00:00Z'), DTSTART);
    expect(next3).toBeNull();
  });

  it('DAILY with UNTIL after 2 occurrences returns null', () => {
    // UNTIL = 2026-07-19 -> occurrences: 18, 19 (2 total)
    const next1 = nextOccurrence('FREQ=DAILY;UNTIL=20260719T000000Z', new Date('2026-07-18T00:00:00Z'), DTSTART);
    expect(next1).toEqual(new Date('2026-07-19T00:00:00Z'));

    const next2 = nextOccurrence('FREQ=DAILY;UNTIL=20260719T000000Z', new Date('2026-07-19T00:00:00Z'), DTSTART);
    expect(next2).toBeNull();
  });
});