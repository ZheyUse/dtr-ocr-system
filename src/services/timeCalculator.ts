import { GeneralStats, DTRRecord, TimeEntry } from '../types/dtr.types';
import { getForecastEndDate } from '../utils/forecastCalc';
import { parseTimeToMinutes } from '../utils/formatTime';

const roundHours = (value: number): number => {
  return Math.round(value * 100) / 100;
};

export const computeHours = (
  timeIn: string | null,
  timeOut: string | null
): number => {
  const start = parseTimeToMinutes(timeIn);
  const end = parseTimeToMinutes(timeOut);

  if (start === null || end === null || end <= start) {
    return 0;
  }

  return (end - start) / 60;
};

export const computeEntryTotalHours = (entry: TimeEntry): number => {
  const morningHours = computeHours(entry.amIn, entry.amOut);
  const afternoonHours = computeHours(entry.pmIn, entry.pmOut);

  return roundHours(morningHours + afternoonHours);
};

export const normalizeEntry = (entry: TimeEntry): TimeEntry => {
  const totalHours = computeEntryTotalHours(entry);

  return {
    ...entry,
    totalHours,
    undertime: entry.undertime ?? 0,
    remarks: entry.remarks ?? '',
  };
};

export const calculateRecordTotals = (
  entries: TimeEntry[]
): Pick<DTRRecord, 'totalDaysPresent' | 'totalHoursRendered'> => {
  const normalizedEntries = entries.map(normalizeEntry);

  const totalDaysPresent = normalizedEntries.filter((entry) => {
    return entry.totalHours > 0 || entry.remarks.toLowerCase() === 'present';
  }).length;

  const totalHoursRendered = roundHours(
    normalizedEntries.reduce((sum, entry) => sum + entry.totalHours, 0)
  );

  return {
    totalDaysPresent,
    totalHoursRendered,
  };
};

export const mergeRecords = (records: DTRRecord[]): DTRRecord => {
  if (records.length === 0) {
    throw new Error('No DTR records to merge.');
  }

  const [baseRecord, ...restRecords] = records;
  const allEntries = [...baseRecord.entries, ...restRecords.flatMap((record) => record.entries)]
    .map(normalizeEntry)
    .sort((a, b) => a.date.localeCompare(b.date));

  const { totalDaysPresent, totalHoursRendered } = calculateRecordTotals(allEntries);

  return {
    ...baseRecord,
    entries: allEntries,
    totalDaysPresent,
    totalHoursRendered,
  };
};

export const calculateGeneralStats = (
  hoursRendered: number,
  hoursRequired: number,
  dailyTarget: number
): GeneralStats => {
  const safeRequired = Math.max(0, hoursRequired);
  const safeRendered = Math.max(0, hoursRendered);
  const safeDailyTarget = dailyTarget > 0 ? dailyTarget : 8;

  const hoursRemaining = Math.max(0, roundHours(safeRequired - safeRendered));
  const forecast = getForecastEndDate(hoursRemaining, safeDailyTarget);

  return {
    hoursRendered: safeRendered,
    hoursRequired: safeRequired,
    hoursRemaining,
    daysRequired: forecast.daysNeeded,
    forecastEndDate: forecast.date,
    dailyTarget: safeDailyTarget,
  };
};
