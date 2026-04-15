import { DTRRecord, TimeEntry } from '../types/dtr.types';
import {
  calculateRecordTotals,
  collapseEntriesByDate,
  deriveMonthPeriodFromEntries,
  getDayOfWeekFromIsoDate,
  normalizeEntry,
} from './timeCalculator';

const EMPTY_RECORD: DTRRecord = {
  employeeName: '',
  position: '',
  department: '',
  month: '',
  salaryGrade: '',
  stepIncrement: '',
  entries: [],
  totalDaysPresent: 0,
  totalHoursRendered: 0,
};

const sanitizeTime = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') {
    return null;
  }

  const match = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return null;
  }

  const hours = match[1].padStart(2, '0');
  const minutes = match[2];

  return `${hours}:${minutes}`;
};

const normalizeDate = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() + 1 !== month ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const sanitizeEntry = (entry: unknown): TimeEntry | null => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const source = entry as Record<string, unknown>;
  const date = normalizeDate(source.date);

  if (!date) {
    return null;
  }

  const dayOfWeek = getDayOfWeekFromIsoDate(date);

  const numericTotalHours =
    typeof source.totalHours === 'number' && Number.isFinite(source.totalHours)
      ? source.totalHours
      : 0;

  const numericUndertime =
    typeof source.undertime === 'number' && Number.isFinite(source.undertime)
      ? source.undertime
      : 0;

  return normalizeEntry({
    date,
    dayOfWeek,
    amIn: sanitizeTime(source.amIn),
    amOut: sanitizeTime(source.amOut),
    pmIn: sanitizeTime(source.pmIn),
    pmOut: sanitizeTime(source.pmOut),
    totalHours: numericTotalHours,
    undertime: numericUndertime,
    remarks: typeof source.remarks === 'string' ? source.remarks.trim() : '',
  });
};

const stripCodeFences = (rawText: string): string => {
  return rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
};

const extractJsonObject = (text: string): string => {
  const cleaned = stripCodeFences(text);
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('INVALID_RESPONSE');
  }

  return cleaned.slice(firstBrace, lastBrace + 1);
};

export const parseGeminiDTR = (rawText: string): DTRRecord => {
  const jsonPayload = extractJsonObject(rawText);
  const parsed = JSON.parse(jsonPayload) as Partial<DTRRecord>;

  const entries = Array.isArray(parsed.entries)
    ? parsed.entries.map(sanitizeEntry).filter((entry): entry is TimeEntry => Boolean(entry))
    : [];

  const sortedEntries = collapseEntriesByDate(entries);
  const totals = calculateRecordTotals(sortedEntries);
  const derivedMonthPeriod = deriveMonthPeriodFromEntries(sortedEntries);

  return {
    ...EMPTY_RECORD,
    employeeName: parsed.employeeName?.toString().trim() ?? '',
    position: parsed.position?.toString().trim() ?? '',
    department: parsed.department?.toString().trim() ?? '',
    month: derivedMonthPeriod || parsed.month?.toString().trim() || '',
    salaryGrade: parsed.salaryGrade?.toString().trim() ?? '',
    stepIncrement: parsed.stepIncrement?.toString().trim() ?? '',
    entries: sortedEntries,
    totalDaysPresent: totals.totalDaysPresent,
    totalHoursRendered: totals.totalHoursRendered,
  };
};
