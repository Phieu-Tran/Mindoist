import { describe, it, expect } from 'vitest';
import { parseQuickAdd } from './parser.js';

// Fixed "now" — 2026-07-18 08:00 UTC+7 (Saturday)
const NOW = new Date('2026-07-18T01:00:00Z'); // 08:00+07

const en = (input: string) => parseQuickAdd(input, { locale: 'en', now: NOW });
const vi = (input: string) => parseQuickAdd(input, { locale: 'vi', now: NOW });

// ── EN tests ────────────────────────────────────────────────────────────────

describe('parseQuickAdd — EN', () => {
  it('parses "tomorrow 9am"', () => {
    const r = en('buy milk tomorrow 9am');
    expect(r.title).toBe('buy milk');
    expect(r.deadline?.date).toBe('2026-07-19');
    expect(r.deadline?.time).toBe('09:00');
  });

  it('parses "today"', () => {
    const r = en('review PR today');
    expect(r.title).toBe('review PR');
    expect(r.deadline?.date).toBe('2026-07-18');
  });

  it('parses "next monday"', () => {
    const r = en('team standup next monday');
    expect(r.title).toBe('team standup');
    expect(r.deadline?.date).toBe('2026-07-20');
  });

  it('parses "jul 25"', () => {
    const r = en('submit report jul 25');
    expect(r.title).toBe('submit report');
    expect(r.deadline?.date).toBe('2026-07-25');
  });

  it('parses "jul 25 at 2pm"', () => {
    const r = en('meeting jul 25 at 2pm');
    expect(r.title).toBe('meeting');
    expect(r.deadline?.date).toBe('2026-07-25');
    expect(r.deadline?.time).toBe('14:00');
  });

  it('parses priority p1', () => {
    const r = en('fix critical bug p1');
    expect(r.title).toBe('fix critical bug');
    expect(r.priority).toBe(1);
  });

  it('parses priority p3 with date', () => {
    const r = en('deploy release tomorrow p3');
    expect(r.title).toBe('deploy release');
    expect(r.deadline?.date).toBe('2026-07-19');
    expect(r.priority).toBe(3);
  });

  it('parses "next friday 3pm"', () => {
    const r = en('demo next friday 3pm');
    expect(r.title).toBe('demo');
    expect(r.deadline?.date).toBe('2026-07-24');
    expect(r.deadline?.time).toBe('15:00');
  });

  it('returns only title when no date/time', () => {
    const r = en('buy groceries');
    expect(r.title).toBe('buy groceries');
    expect(r.deadline?.date).toBeUndefined();
    expect(r.deadline?.time).toBeUndefined();
    expect(r.priority).toBeUndefined();
  });

  it('handles "in 2 days"', () => {
    const r = en('follow up in 2 days');
    expect(r.title).toBe('follow up');
    expect(r.deadline?.date).toBe('2026-07-20');
  });
});

// ── VI tests ────────────────────────────────────────────────────────────────

describe('parseQuickAdd — VI', () => {
  it('parses "ngày mai 9 giờ"', () => {
    const r = vi('mua sữa ngày mai 9 giờ');
    expect(r.title).toBe('mua sữa');
    expect(r.deadline?.date).toBe('2026-07-19');
    expect(r.deadline?.time).toBe('09:00');
  });

  it('parses "thứ 6"', () => {
    const r = vi('họp nhóm thứ 6');
    expect(r.title).toBe('họp nhóm');
    // 2026-07-18 is Saturday, so next Friday = 2026-07-24
    expect(r.deadline?.date).toBe('2026-07-24');
  });

  it('parses "tuần sau"', () => {
    const r = vi('nộp bài tuần sau');
    expect(r.title).toBe('nộp bài');
    expect(r.deadline?.date).toBe('2026-07-25');
  });

  it('parses "25/07"', () => {
    const r = vi('deadline 25/07');
    expect(r.title).toBe('deadline');
    expect(r.deadline?.date).toBe('2026-07-25');
  });

  it('parses "14:30"', () => {
    const r = vi('cuộc gọi 14:30');
    expect(r.title).toBe('cuộc gọi');
    expect(r.deadline?.time).toBe('14:30');
  });

  it('parses priority p2', () => {
    const r = vi('làm slides p2');
    expect(r.title).toBe('làm slides');
    expect(r.priority).toBe(2);
  });

  it('parses "hôm nay"', () => {
    const r = vi('xong report hôm nay');
    expect(r.title).toBe('xong report');
    expect(r.deadline?.date).toBe('2026-07-18');
  });

  it('parses "ngày kia"', () => {
    const r = vi('gặp khách ngày kia');
    expect(r.title).toBe('gặp khách');
    expect(r.deadline?.date).toBe('2026-07-20');
  });

  it('parses "thứ 2"', () => {
    const r = vi('standup thứ 2');
    expect(r.title).toBe('standup');
    // Saturday 18th → next Monday = 20th
    expect(r.deadline?.date).toBe('2026-07-20');
  });

  it('parses "9h30"', () => {
    const r = vi('meeting 9h30');
    expect(r.title).toBe('meeting');
    expect(r.deadline?.time).toBe('09:30');
  });

  it('returns only title when no date/time', () => {
    const r = vi('mua hoa quả');
    expect(r.title).toBe('mua hoa quả');
    expect(r.deadline?.date).toBeUndefined();
    expect(r.deadline?.time).toBeUndefined();
    expect(r.priority).toBeUndefined();
  });

  it('parses "chủ nhật"', () => {
    const r = vi('gia đình chủ nhật');
    expect(r.title).toBe('gia đình');
    // Saturday 18th → next Sunday = 2026-07-19
    expect(r.deadline?.date).toBe('2026-07-19');
  });

  it('parses priority p4 with date and time', () => {
    const r = vi('đi dentist 25/07 10 giờ p4');
    expect(r.title).toBe('đi dentist');
    expect(r.deadline?.date).toBe('2026-07-25');
    expect(r.deadline?.time).toBe('10:00');
    expect(r.priority).toBe(4);
  });
});

// ── Duration + Project tests ──────────────────────────────────────────────

describe('parseQuickAdd — duration', () => {
  it('parses "1h30m" in English', () => {
    const r = en('gym workout 1h30m tomorrow');
    expect(r.title).toBe('gym workout');
    expect(r.estimateMin).toBe(90);
    expect(r.deadline?.date).toBe('2026-07-19');
  });

  it('parses "30m" in English', () => {
    const r = en('read book 30m');
    expect(r.title).toBe('read book');
    expect(r.estimateMin).toBe(30);
  });

  it('parses "2h" in English', () => {
    const r = en('deep work 2h p1');
    expect(r.title).toBe('deep work');
    expect(r.estimateMin).toBe(120);
    expect(r.priority).toBe(1);
  });

  it('parses "90p" in Vietnamese', () => {
    const r = vi('họp team 90p');
    expect(r.title).toBe('họp team');
    expect(r.estimateMin).toBe(90);
  });
});

describe('parseQuickAdd — project', () => {
  it('extracts #project from EN input', () => {
    const r = en('deploy feature #work tomorrow');
    expect(r.title).toBe('deploy feature');
    expect(r.projectId).toBe('work');
    expect(r.deadline?.date).toBe('2026-07-19');
  });

  it('extracts #project from VI input', () => {
    const r = vi('deploy feature #personal ngày mai');
    expect(r.title).toBe('deploy feature');
    expect(r.projectId).toBe('personal');
  });
});

describe('parseQuickAdd — reminder (B2.21)', () => {
  it('parses "remind me 15m before" in English', () => {
    const r = en('call dentist remind me 15m before tomorrow 9am');
    expect(r.title).toBe('call dentist');
    expect(r.reminderOffsetMin).toBe(15);
    expect(r.deadline?.date).toBe('2026-07-19');
    expect(r.deadline?.time).toBe('09:00');
  });

  it('parses "remind 1h before" in English (no "me")', () => {
    const r = en('team sync remind 1h before');
    expect(r.title).toBe('team sync');
    expect(r.reminderOffsetMin).toBe(60);
  });

  it('does not confuse the reminder offset with the task duration', () => {
    const r = en('workshop 2h remind me 30m before tomorrow');
    expect(r.estimateMin).toBe(120);
    expect(r.reminderOffsetMin).toBe(30);
  });

  it('parses "nhắc trước N phút" in Vietnamese', () => {
    const r = vi('gọi nha sĩ nhắc trước 15 phút mai');
    expect(r.title).toBe('gọi nha sĩ');
    expect(r.reminderOffsetMin).toBe(15);
  });

  it('parses "nhắc trước N giờ" in Vietnamese', () => {
    const r = vi('họp team nhắc trước 1 giờ');
    expect(r.title).toBe('họp team');
    expect(r.reminderOffsetMin).toBe(60);
  });

  it('is undefined when no reminder phrase is present', () => {
    const r = en('buy milk tomorrow');
    expect(r.reminderOffsetMin).toBeUndefined();
  });
});
