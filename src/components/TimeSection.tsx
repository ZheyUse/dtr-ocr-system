import React from 'react';
import { TimeEntry } from '../types/dtr.types';
import { formatTimeOrDash } from '../utils/formatTime';

type EditableEntryField = 'amIn' | 'amOut' | 'pmIn' | 'pmOut' | 'remarks';

interface TimeSectionProps {
  entries: TimeEntry[];
  isEditable?: boolean;
  onEntryFieldChange?: (index: number, field: EditableEntryField, value: string) => void;
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

export const TimeSection: React.FC<TimeSectionProps> = ({
  entries,
  isEditable = false,
  onEntryFieldChange,
}) => {
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
            {entries.map((entry, index) => (
              <tr key={`${entry.date}-${entry.dayOfWeek}`} className={getRowClass(entry)}>
                <td>{entry.date}</td>
                <td>{entry.dayOfWeek || '-'}</td>

                <td>
                  {isEditable && onEntryFieldChange ? (
                    <input
                      className="table-time-input"
                      type="time"
                      value={entry.amIn ?? ''}
                      onChange={(event) => onEntryFieldChange(index, 'amIn', event.target.value)}
                    />
                  ) : (
                    formatTimeOrDash(entry.amIn)
                  )}
                </td>

                <td>
                  {isEditable && onEntryFieldChange ? (
                    <input
                      className="table-time-input"
                      type="time"
                      value={entry.amOut ?? ''}
                      onChange={(event) => onEntryFieldChange(index, 'amOut', event.target.value)}
                    />
                  ) : (
                    formatTimeOrDash(entry.amOut)
                  )}
                </td>

                <td>
                  {isEditable && onEntryFieldChange ? (
                    <input
                      className="table-time-input"
                      type="time"
                      value={entry.pmIn ?? ''}
                      onChange={(event) => onEntryFieldChange(index, 'pmIn', event.target.value)}
                    />
                  ) : (
                    formatTimeOrDash(entry.pmIn)
                  )}
                </td>

                <td>
                  {isEditable && onEntryFieldChange ? (
                    <input
                      className="table-time-input"
                      type="time"
                      value={entry.pmOut ?? ''}
                      onChange={(event) => onEntryFieldChange(index, 'pmOut', event.target.value)}
                    />
                  ) : (
                    formatTimeOrDash(entry.pmOut)
                  )}
                </td>

                <td>{entry.totalHours.toFixed(2)}</td>

                <td>
                  {isEditable && onEntryFieldChange ? (
                    <input
                      className="table-remarks-input"
                      type="text"
                      value={entry.remarks ?? ''}
                      placeholder="Remarks"
                      onChange={(event) => onEntryFieldChange(index, 'remarks', event.target.value)}
                    />
                  ) : (
                    entry.remarks || '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
