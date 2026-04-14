export function formatIsoDateForDisplay(value, fallback = '') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value || fallback;
  }

  const [year, month, day] = value.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return value || fallback;
  }

  return date.toLocaleDateString();
}