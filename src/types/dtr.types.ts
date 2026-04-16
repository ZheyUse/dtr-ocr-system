export interface TimeEntry {
  date: string;
  dayOfWeek: string;
  amIn: string | null;
  amOut: string | null;
  pmIn: string | null;
  pmOut: string | null;
  totalHours: number;
  undertime: number;
  remarks: string;
}

export type ProcessingMode = 'local' | 'free' | 'legacy';

export interface DTRRecord {
  employeeName: string;
  position: string;
  department: string;
  month: string;
  salaryGrade: string;
  stepIncrement: string;
  entries: TimeEntry[];
  totalDaysPresent: number;
  totalHoursRendered: number;
}

export interface ExtractionModelUsed {
  fileName: string;
  modelName: string;
  apiVersion: string;
  usedFallback: boolean;
  provider?: 'gemini' | 'openrouter' | 'local-ocr';
}

export interface ExtractionSummary {
  mode: ProcessingMode;
  primaryModelLabel: string;
  usedFallback: boolean;
  perFile: ExtractionModelUsed[];
}

export interface GeneralStats {
  hoursRendered: number;
  hoursRequired: number;
  hoursRemaining: number;
  daysRequired: number;
  forecastEndDate: string;
  dailyTarget: number;
}

export interface DTRProcessingResult {
  mergedRecord: DTRRecord;
  mergedFiles: number;
  extractionSummary: ExtractionSummary;
}

export const LOCAL_OCR_NOT_AVAILABLE_ERROR = 'LOCAL_OCR_NOT_AVAILABLE';
export const ALL_MODELS_FAILED_ERROR = 'ALL_MODELS_FAILED';
export const OPENROUTER_CONNECTIVITY_ERROR = 'OPENROUTER_CONNECTIVITY_ERROR';
