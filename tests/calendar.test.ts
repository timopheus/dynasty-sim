import { describe, expect, it } from 'vitest';
import { ageYears, formatDate, fromYmd, isLeapYear, toYmd } from '../src/core/calendar';

describe('calendar', () => {
  it('starts on 1 January 1700', () => {
    expect(fromYmd(1700, 1, 1)).toBe(0);
    expect(formatDate(0)).toBe('1 January 1700');
  });

  it('treats 1700 as a common year', () => {
    expect(formatDate(59)).toBe('1 March 1700');
    expect(fromYmd(1701, 1, 1)).toBe(365);
  });

  it('follows Gregorian leap rules', () => {
    expect(isLeapYear(1700)).toBe(false);
    expect(isLeapYear(1704)).toBe(true);
    expect(isLeapYear(1800)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(toYmd(fromYmd(1704, 2, 29))).toEqual({ year: 1704, month: 2, day: 29 });
    expect(fromYmd(1705, 1, 1) - fromYmd(1704, 1, 1)).toBe(366);
    expect(fromYmd(1801, 1, 1) - fromYmd(1800, 1, 1)).toBe(365);
  });

  it('handles days before 1700', () => {
    expect(formatDate(-1)).toBe('31 December 1699');
    expect(toYmd(fromYmd(1650, 6, 15))).toEqual({ year: 1650, month: 6, day: 15 });
  });

  it('round-trips every day over a wide range', () => {
    let prev = toYmd(-50001);
    for (let day = -50000; day <= 120000; day++) {
      const ymd = toYmd(day);
      expect(fromYmd(ymd.year, ymd.month, ymd.day)).toBe(day);
      const nextDayInMonth = ymd.year === prev.year && ymd.month === prev.month && ymd.day === prev.day + 1;
      if (!nextDayInMonth) expect(ymd.day).toBe(1);
      prev = ymd;
    }
  });

  it('counts full years of age', () => {
    const birth = fromYmd(1680, 5, 10);
    expect(ageYears(birth, fromYmd(1700, 5, 9))).toBe(19);
    expect(ageYears(birth, fromYmd(1700, 5, 10))).toBe(20);
  });
});
