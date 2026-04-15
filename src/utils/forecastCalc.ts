const formatLongDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
};

export function getForecastEndDate(
  hoursRemaining: number,
  dailyHours: number = 8,
  startDate: Date = new Date()
): { date: string; daysNeeded: number } {
  const safeDailyHours = dailyHours > 0 ? dailyHours : 8;
  const safeHoursRemaining = Math.max(0, hoursRemaining);
  const daysNeeded = Math.ceil(safeHoursRemaining / safeDailyHours);

  if (daysNeeded === 0) {
    return {
      date: formatLongDate(startDate),
      daysNeeded: 0,
    };
  }

  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1);

  let completedWorkingDays = 0;

  while (completedWorkingDays < daysNeeded) {
    if (cursor.getDay() !== 0) {
      completedWorkingDays += 1;
      if (completedWorkingDays === daysNeeded) {
        break;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    date: formatLongDate(cursor),
    daysNeeded,
  };
}
