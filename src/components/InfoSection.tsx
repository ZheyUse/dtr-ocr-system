import React from 'react';
import { DTRRecord } from '../types/dtr.types';

type EditableRecordField = 'employeeName' | 'position' | 'department' | 'salaryGrade' | 'stepIncrement';

interface InfoSectionProps {
  record: DTRRecord;
  isEditable?: boolean;
  onRecordFieldChange?: (field: EditableRecordField, value: string) => void;
}

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value">{value || '-'}</span>
    </div>
  );
};

const EditableInfoRow: React.FC<{
  label: string;
  field: EditableRecordField;
  value: string;
  onChange: (field: EditableRecordField, value: string) => void;
}> = ({ label, field, value, onChange }) => {
  return (
    <label className="info-row info-row-editable">
      <span className="info-label">{label}</span>
      <input
        className="field-input info-inline-input"
        type="text"
        value={value}
        onChange={(event) => onChange(field, event.target.value)}
      />
    </label>
  );
};

export const InfoSection: React.FC<InfoSectionProps> = ({ record, isEditable = false, onRecordFieldChange }) => {
  return (
    <section className="card info-section">
      <h2>Record Details</h2>

      {isEditable && onRecordFieldChange ? (
        <EditableInfoRow
          label="Employee Name"
          field="employeeName"
          value={record.employeeName}
          onChange={onRecordFieldChange}
        />
      ) : (
        <InfoRow label="Employee Name" value={record.employeeName} />
      )}

      {isEditable && onRecordFieldChange ? (
        <EditableInfoRow
          label="Position"
          field="position"
          value={record.position}
          onChange={onRecordFieldChange}
        />
      ) : (
        <InfoRow label="Position" value={record.position} />
      )}

      {isEditable && onRecordFieldChange ? (
        <EditableInfoRow
          label="Department"
          field="department"
          value={record.department}
          onChange={onRecordFieldChange}
        />
      ) : (
        <InfoRow label="Department" value={record.department} />
      )}

      <InfoRow label="Month / Period" value={record.month} />

      {isEditable && onRecordFieldChange ? (
        <EditableInfoRow
          label="Salary Grade"
          field="salaryGrade"
          value={record.salaryGrade}
          onChange={onRecordFieldChange}
        />
      ) : (
        <InfoRow label="Salary Grade" value={record.salaryGrade} />
      )}

      {isEditable && onRecordFieldChange ? (
        <EditableInfoRow
          label="Step Increment"
          field="stepIncrement"
          value={record.stepIncrement}
          onChange={onRecordFieldChange}
        />
      ) : (
        <InfoRow label="Step Increment" value={record.stepIncrement} />
      )}

      <InfoRow label="Total Days Present" value={String(record.totalDaysPresent)} />
      <InfoRow label="Total Hours Rendered" value={`${record.totalHoursRendered} hrs`} />
    </section>
  );
};
