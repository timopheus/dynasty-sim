/**
 * Proleptic Gregorian calendar. Time in the simulation is an integer day
 * number; day 0 is 1 January 1700 and earlier dates are negative.
 * Conversions follow Howard Hinnant's civil-from-days algorithms.
 */
export const START_YEAR = 1700;

export interface Ymd {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(days: number): Ymd {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

const EPOCH = daysFromCivil(START_YEAR, 1, 1);

export function fromYmd(year: number, month: number, day: number): number {
  return daysFromCivil(year, month, day) - EPOCH;
}

export function toYmd(day: number): Ymd {
  return civilFromDays(day + EPOCH);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function formatDate(day: number): string {
  const { year, month, day: d } = toYmd(day);
  return `${d} ${MONTHS[month - 1]} ${year}`;
}

/** Full years between two day numbers. */
export function ageYears(birthDay: number, day: number): number {
  const b = toYmd(birthDay);
  const t = toYmd(day);
  const beforeBirthday = t.month < b.month || (t.month === b.month && t.day < b.day);
  return t.year - b.year - (beforeBirthday ? 1 : 0);
}
