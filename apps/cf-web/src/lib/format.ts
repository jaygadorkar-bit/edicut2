import { format } from 'date-fns';

export function formatDate(date: Date | string | number | undefined | null) {
  if (!date) {
    return '';
  }

  const value = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(value.getTime())) {
    return '';
  }

  return format(value, 'MMM d, yyyy');
}
