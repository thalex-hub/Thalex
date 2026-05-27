import { format } from 'date-fns';

/**
 * Fixed Vietnamese holidays (Day-Month)
 */
const FIXED_HOLIDAYS = [
  '01-01', // New Year
  '30-04', // Liberation Day
  '01-05', // Labor Day
  '02-09', // National Day
];

/**
 * Checks if a given date is a Vietnamese holiday.
 * Note: Lunar holidays are not included here as they vary yearly.
 */
export function isHoliday(date: Date): boolean {
  const dayMonth = format(date, 'dd-MM');
  return FIXED_HOLIDAYS.includes(dayMonth);
}
