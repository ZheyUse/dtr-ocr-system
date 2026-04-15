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
}
