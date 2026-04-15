import { GeneralStats, DTRRecord, TimeEntry } from '../types/dtr.types';
import { getForecastEndDate } from '../utils/forecastCalc';
import { parseTimeToMinutes } from '../utils/formatTime';

const roundHours = (value: number): number => {
  return Math.round(value * 100) / 100;
};

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' });

const dateRegex = /^(\d{4})-(\d{2})-(\d{2})$/;

const getDateSortValue = (date: string): number => {
  const match = date.trim().match(dateRegex);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return Date.UTC(year, month - 1, day);
};

const getMonthLabelFromDate = (date: string): string => {
  const sortValue = getDateSortValue(date);
  if (!Number.isFinite(sortValue) || sortValue === Number.MAX_SAFE_INTEGER) {
    return '';
  }

  return monthFormatter.format(new Date(sortValue)).toUpperCase();
};

const hasMeaningfulText = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== '-';
};

const isMissingTime = (value: string | null): boolean => {
  return value === null || value.trim() === '' || value.trim() === '-';
};

const getEntryCompleteness = (entry: TimeEntry): number => {
  let score = 0;

  if (!isMissingTime(entry.amIn)) score += 1;
  if (!isMissingTime(entry.amOut)) score += 1;
  if (!isMissingTime(entry.pmIn)) score += 1;
  if (!isMissingTime(entry.pmOut)) score += 1;
  if (hasMeaningfulText(entry.remarks)) score += 0.5;

  return score;
};

const toCleanTime = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === '-') {
    return null;
  }

  return trimmed;
};

export const getDayOfWeekFromIsoDate = (date: string): string => {
  const sortValue = getDateSortValue(date);
  if (!Number.isFinite(sortValue) || sortValue === Number.MAX_SAFE_INTEGER) {
    return '';
  }

  return weekdayFormatter.format(new Date(sortValue));
};

const computeIntervalHours = (
  startMinutes: number | null,
  endMinutes: number | null
): number => {
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return 0;
  }

  return (endMinutes - startMinutes) / 60;
};

const adjustPmSessionMinutes = (entry: TimeEntry): { pmIn: number | null; pmOut: number | null } => {
  const amOut = parseTimeToMinutes(entry.amOut);
  let pmIn = parseTimeToMinutes(entry.pmIn);
  let pmOut = parseTimeToMinutes(entry.pmOut);

  // If PM In appears earlier than AM Out (e.g., "01:15"), treat it as 13:15.
  if (pmIn !== null && amOut !== null && pmIn < amOut && pmIn + 12 * 60 <= 23 * 60 + 59) {
    pmIn += 12 * 60;
  }

  // If PM In is a small morning-like hour and AM Out is missing, infer afternoon.
  if (pmIn !== null && amOut === null && pmIn <= 7 * 60 + 59 && pmIn + 12 * 60 <= 23 * 60 + 59) {
    pmIn += 12 * 60;
  }

  // If PM Out is not after PM In, attempt a 12-hour roll-forward (e.g., 05:29 -> 17:29).
  if (pmOut !== null && pmIn !== null && pmOut <= pmIn && pmOut + 12 * 60 <= 23 * 60 + 59) {
    pmOut += 12 * 60;
  }

  // If PM In is already in afternoon but PM Out still looks morning, infer afternoon for PM Out.
  if (
    pmOut !== null &&
    pmIn !== null &&
    pmIn >= 12 * 60 &&
    pmOut < 12 * 60 &&
    pmOut + 12 * 60 <= 23 * 60 + 59
  ) {
    pmOut += 12 * 60;
  }

  return { pmIn, pmOut };
};

export const computeHours = (
  timeIn: string | null,
  timeOut: string | null
): number => {
  const start = parseTimeToMinutes(timeIn);
  const end = parseTimeToMinutes(timeOut);

  return computeIntervalHours(start, end);
};

export const computeEntryTotalHours = (entry: TimeEntry): number => {
  const amIn = parseTimeToMinutes(entry.amIn);
  const amOut = parseTimeToMinutes(entry.amOut);
  const { pmIn, pmOut } = adjustPmSessionMinutes(entry);

  const morningHours = computeIntervalHours(amIn, amOut);
  const afternoonHours = computeIntervalHours(pmIn, pmOut);

  return roundHours(morningHours + afternoonHours);
};

export const normalizeEntry = (entry: TimeEntry): TimeEntry => {
  const totalHours = computeEntryTotalHours(entry);
  const derivedDay = getDayOfWeekFromIsoDate(entry.date);

  return {
    ...entry,
    dayOfWeek: derivedDay || entry.dayOfWeek,
    amIn: toCleanTime(entry.amIn),
    amOut: toCleanTime(entry.amOut),
    pmIn: toCleanTime(entry.pmIn),
    pmOut: toCleanTime(entry.pmOut),
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

export const sortEntriesByDate = (entries: TimeEntry[]): TimeEntry[] => {
  return [...entries].sort((a, b) => {
    const left = getDateSortValue(a.date);
    const right = getDateSortValue(b.date);

    if (left !== right) {
      return left - right;
    }

    return a.date.localeCompare(b.date);
  });
};

export const collapseEntriesByDate = (entries: TimeEntry[]): TimeEntry[] => {
  const groupedByDate = new Map<string, TimeEntry[]>();

  entries.forEach((entry) => {
    const normalized = normalizeEntry(entry);
    const key = normalized.date;
    const current = groupedByDate.get(key) ?? [];
    current.push(normalized);
    groupedByDate.set(key, current);
  });

  const collapsed = Array.from(groupedByDate.entries()).map(([date, grouped]) => {
    if (grouped.length === 1) {
      return normalizeEntry(grouped[0]);
    }

    const sortedByCompleteness = [...grouped].sort(
      (left, right) => getEntryCompleteness(right) - getEntryCompleteness(left)
    );
    const base = { ...sortedByCompleteness[0] };

    for (const entry of sortedByCompleteness.slice(1)) {
      if (isMissingTime(base.amIn) && !isMissingTime(entry.amIn)) base.amIn = entry.amIn;
      if (isMissingTime(base.amOut) && !isMissingTime(entry.amOut)) base.amOut = entry.amOut;
      if (isMissingTime(base.pmIn) && !isMissingTime(entry.pmIn)) base.pmIn = entry.pmIn;
      if (isMissingTime(base.pmOut) && !isMissingTime(entry.pmOut)) base.pmOut = entry.pmOut;
      if (!hasMeaningfulText(base.remarks) && hasMeaningfulText(entry.remarks)) base.remarks = entry.remarks;
      base.undertime = Math.max(base.undertime ?? 0, entry.undertime ?? 0);
    }

    return normalizeEntry({ ...base, date });
  });

  return sortEntriesByDate(collapsed);
};

export const deriveMonthPeriodFromEntries = (entries: TimeEntry[]): string => {
  if (!entries.length) {
    return '';
  }

  const sorted = sortEntriesByDate(entries);
  const firstMonth = getMonthLabelFromDate(sorted[0].date);
  const lastMonth = getMonthLabelFromDate(sorted[sorted.length - 1].date);

  if (!firstMonth && !lastMonth) {
    return '';
  }

  if (!lastMonth || firstMonth === lastMonth) {
    return firstMonth || lastMonth;
  }

  return `${firstMonth} - ${lastMonth}`;
};

export const mergeRecords = (records: DTRRecord[]): DTRRecord => {
  if (records.length === 0) {
    throw new Error('No DTR records to merge.');
  }

  const [baseRecord, ...restRecords] = records;
  const allEntries = collapseEntriesByDate(
    [...baseRecord.entries, ...restRecords.flatMap((record) => record.entries)]
  );

  const { totalDaysPresent, totalHoursRendered } = calculateRecordTotals(allEntries);
  const month = deriveMonthPeriodFromEntries(allEntries) || baseRecord.month;

  return {
    ...baseRecord,
    month,
    entries: allEntries,
    totalDaysPresent,
    totalHoursRendered,
  };
};

export const recomputeRecord = (record: DTRRecord): DTRRecord => {
  const entries = collapseEntriesByDate(record.entries);
  const totals = calculateRecordTotals(entries);
  const month = deriveMonthPeriodFromEntries(entries) || record.month;

  return {
    ...record,
    month,
    entries,
    totalDaysPresent: totals.totalDaysPresent,
    totalHoursRendered: totals.totalHoursRendered,
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
