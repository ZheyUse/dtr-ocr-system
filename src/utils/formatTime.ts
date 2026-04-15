const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isValidTime = (value: string | null): boolean => {
  if (!value) {
    return false;
  }
  return TIME_24H_REGEX.test(value.trim());
};

export const parseTimeToMinutes = (value: string | null): number | null => {
  if (!isValidTime(value)) {
    return null;
  }

  const [hourPart, minutePart] = (value as string).split(':');
  const hours = Number(hourPart);
  const minutes = Number(minutePart);

  return hours * 60 + minutes;
};

export const minutesToHHMM = (minutes: number): string => {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const restMinutes = safeMinutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(restMinutes).padStart(2, '0')}`;
};

export const decimalHoursToHHMM = (hours: number): string => {
  const totalMinutes = Math.round(Math.max(0, hours) * 60);
  return minutesToHHMM(totalMinutes);
};

export const formatTimeOrDash = (timeValue: string | null): string => {
  return timeValue && isValidTime(timeValue) ? timeValue : '-';
};
