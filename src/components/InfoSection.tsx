import React from 'react';
import { DTRRecord } from '../types/dtr.types';

interface InfoSectionProps {
  record: DTRRecord;
}

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value">{value || '-'}</span>
    </div>
  );
};

export const InfoSection: React.FC<InfoSectionProps> = ({ record }) => {
  return (
    <section className="card info-section">
      <h2>Record Details</h2>
      <InfoRow label="Employee Name" value={record.employeeName} />
      <InfoRow label="Position" value={record.position} />
      <InfoRow label="Department" value={record.department} />
      <InfoRow label="Month / Period" value={record.month} />
      <InfoRow label="Salary Grade" value={record.salaryGrade} />
      <InfoRow label="Step Increment" value={record.stepIncrement} />
      <InfoRow label="Total Days Present" value={String(record.totalDaysPresent)} />
      <InfoRow label="Total Hours Rendered" value={`${record.totalHoursRendered} hrs`} />
    </section>
  );
};
