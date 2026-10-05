import { describe, expect, it } from 'vitest';
import {
  dateAndTime,
  dayAndTime,
  dayGroup,
  dayHeading,
  expiresLabel,
  fullDate,
  dueLabel,
  duration,
  fileSize,
  relativeTime,
  timestamp,
  updatedLabel,
} from '@/lib/format';

// Friday 2 October 2026, 12:00 local time.
const now = new Date(2026, 9, 2, 12, 0).getTime();
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

describe('relativeTime', () => {
  it('reads like people speak', () => {
    expect(relativeTime(now - 20_000, now)).toBe('Just now');
    expect(relativeTime(now - 12 * 60_000, now)).toBe('12 min ago');
    expect(relativeTime(at(2, 9), now)).toBe('3 h ago');
    expect(relativeTime(at(1, 18), now)).toBe('Yesterday');
  });

  it('uses the weekday within a week, then the date', () => {
    expect(relativeTime(new Date(2026, 8, 29, 10).getTime(), now)).toBe('Tuesday');
    expect(relativeTime(new Date(2026, 7, 12, 10).getTime(), now)).toBe('12 Aug');
  });

  it('shows the time for anything in the future', () => {
    expect(relativeTime(at(2, 15, 30), now)).toBe('15:30');
  });
});

describe('dayGroup', () => {
  it('groups lists by day', () => {
    expect(dayGroup(at(2, 8), now)).toBe('Today');
    expect(dayGroup(at(1, 8), now)).toBe('Yesterday');
    expect(dayGroup(new Date(2026, 8, 29).getTime(), now)).toBe('Earlier this week');
    expect(dayGroup(new Date(2026, 8, 1).getTime(), now)).toBe('Earlier');
  });
});

describe('durations and timestamps', () => {
  it('formats durations', () => {
    expect(duration(42 * 60)).toBe('42 min');
    expect(duration(38)).toBe('38 sec');
    expect(duration(61 * 60)).toBe('1 h 1 min');
    expect(duration(120 * 60)).toBe('2 h');
  });

  it('formats player timestamps', () => {
    expect(timestamp(0)).toBe('0:00');
    expect(timestamp(760)).toBe('12:40');
    expect(timestamp(3723)).toBe('1:02:03');
    expect(timestamp(-5)).toBe('0:00');
  });

  it('formats file sizes', () => {
    expect(fileSize(84)).toBe('84 KB');
    expect(fileSize(1800)).toBe('1.8 MB');
    expect(fileSize(2000)).toBe('2 MB');
  });
});

describe('due dates and times', () => {
  it('labels due dates', () => {
    expect(dueLabel(at(2, 18), now)).toBe('Due today');
    expect(dueLabel(at(3), now)).toBe('Due tomorrow');
    expect(dueLabel(at(5), now)).toBe('Due Monday');
    expect(dueLabel(at(1), now)).toBe('Overdue');
  });

  it('says when something happened', () => {
    expect(dayAndTime(at(2, 10), now)).toBe('Today at 10:00');
    expect(dayAndTime(at(1, 14, 30), now)).toBe('Yesterday at 14:30');
  });

  it('lower-cases relative phrases after "Updated"', () => {
    expect(updatedLabel(at(2, 10), now)).toBe('Updated 2 h ago');
    expect(updatedLabel(at(1, 10), now)).toBe('Updated yesterday');
  });
});

describe('fullDate and dateAndTime', () => {
  it('names the day, month and year', () => {
    expect(fullDate(at(2, 9))).toBe('2 Oct 2026');
    expect(dateAndTime(at(2, 14, 32))).toBe('2 Oct 2026 at 14:32');
  });
});

describe('dayHeading', () => {
  it('says today and yesterday, then the weekday and date (same year)', () => {
    expect(dayHeading(at(2, 8), now)).toBe('Today');
    expect(dayHeading(at(1, 23), now)).toBe('Yesterday');
    expect(dayHeading(new Date(2026, 6, 14, 10).getTime(), now)).toBe('Tuesday 14 Jul');
  });

  it('adds the year for another year', () => {
    expect(dayHeading(new Date(2025, 7, 12, 10).getTime(), now)).toBe('12 Aug 2025');
  });
});

describe('expiresLabel', () => {
  it('counts the days left', () => {
    expect(expiresLabel(at(2, 18), now)).toBe('Expires today');
    expect(expiresLabel(at(3, 9), now)).toBe('Expires tomorrow');
    expect(expiresLabel(at(9, 12), now)).toBe('Expires in 7 days');
  });

  it('says when it has passed', () => {
    expect(expiresLabel(at(2, 11), now)).toBe('Expired');
  });
});
