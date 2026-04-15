import React from 'react';
import { TimeEntry } from '../types/dtr.types';
import { formatTimeOrDash } from '../utils/formatTime';

interface TimeSectionProps {
  entries: TimeEntry[];
}

const todayIso = new Date().toISOString().slice(0, 10);

const getRowClass = (entry: TimeEntry): string => {
  const remarks = entry.remarks.toLowerCase();

  if (entry.date === todayIso) {
    return 'today-row';
  }

  if (remarks.includes('absent')) {
    return 'absent-row';
  }

  if (remarks.includes('holiday') || remarks.includes('rest')) {
    return 'rest-row';
  }

  return '';
};

export const TimeSection: React.FC<TimeSectionProps> = ({ entries }) => {
  return (
    <section className="card time-section">
      <h2>Daily Time Entries</h2>
      <div className="time-table-wrapper">
        <table className="time-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Day</th>
              <th>AM In</th>
              <th>AM Out</th>
              <th>PM In</th>
              <th>PM Out</th>
              <th>Hours</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={`${entry.date}-${entry.dayOfWeek}`} className={getRowClass(entry)}>
                <td>{entry.date}</td>
                <td>{entry.dayOfWeek || '-'}</td>
                <td>{formatTimeOrDash(entry.amIn)}</td>
                <td>{formatTimeOrDash(entry.amOut)}</td>
                <td>{formatTimeOrDash(entry.pmIn)}</td>
                <td>{formatTimeOrDash(entry.pmOut)}</td>
                <td>{entry.totalHours.toFixed(2)}</td>
                <td>{entry.remarks || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
