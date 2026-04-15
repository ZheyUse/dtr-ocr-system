import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { DTRRecord } from '../types/dtr.types';

const sanitizeFileName = (value: string): string => {
  const safe = value.replace(/[^a-zA-Z0-9-_ ]+/g, ' ').trim().replace(/\s+/g, '_');
  return safe || 'dtr_report';
};

const getBaseReportName = (record: DTRRecord): string => {
  const namePart = sanitizeFileName(record.employeeName || 'employee');
  const monthPart = sanitizeFileName(record.month || 'period');
  return `DTR_${namePart}_${monthPart}`;
};

export const exportRecordAsExcel = (record: DTRRecord): void => {
  const workbook = XLSX.utils.book_new();

  const detailsSheetData = [
    ['Employee Name', record.employeeName],
    ['Position', record.position],
    ['Department', record.department],
    ['Month / Period', record.month],
    ['Salary Grade', record.salaryGrade],
    ['Step Increment', record.stepIncrement],
    ['Total Days Present', record.totalDaysPresent],
    ['Total Hours Rendered', record.totalHoursRendered],
  ];

  const detailsSheet = XLSX.utils.aoa_to_sheet(detailsSheetData);
  XLSX.utils.book_append_sheet(workbook, detailsSheet, 'Record Details');

  const entriesRows = record.entries.map((entry) => ({
    Date: entry.date,
    Day: entry.dayOfWeek,
    'AM In': entry.amIn ?? '-',
    'AM Out': entry.amOut ?? '-',
    'PM In': entry.pmIn ?? '-',
    'PM Out': entry.pmOut ?? '-',
    Hours: entry.totalHours.toFixed(2),
    Remarks: entry.remarks || '-',
  }));

  const entriesSheet = XLSX.utils.json_to_sheet(entriesRows);
  XLSX.utils.book_append_sheet(workbook, entriesSheet, 'Time Entries');

  XLSX.writeFile(workbook, `${getBaseReportName(record)}.xlsx`);
};

export const exportRecordAsPdf = (record: DTRRecord): void => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFontSize(16);
  doc.text('Daily Time Record (DTR) Report', 40, 36);

  doc.setFontSize(10);
  doc.text(`Employee: ${record.employeeName || '-'}`, 40, 56);
  doc.text(`Position: ${record.position || '-'}`, 40, 70);
  doc.text(`Department: ${record.department || '-'}`, 40, 84);
  doc.text(`Month / Period: ${record.month || '-'}`, 40, 98);
  doc.text(`Total Days Present: ${record.totalDaysPresent}`, 420, 56);
  doc.text(`Total Hours Rendered: ${record.totalHoursRendered.toFixed(2)}`, 420, 70);

  const tableBody = record.entries.map((entry) => [
    entry.date,
    entry.dayOfWeek || '-',
    entry.amIn || '-',
    entry.amOut || '-',
    entry.pmIn || '-',
    entry.pmOut || '-',
    entry.totalHours.toFixed(2),
    entry.remarks || '-',
  ]);

  autoTable(doc, {
    head: [['Date', 'Day', 'AM In', 'AM Out', 'PM In', 'PM Out', 'Hours', 'Remarks']],
    body: tableBody,
    startY: 116,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [26, 53, 96] },
  });

  doc.save(`${getBaseReportName(record)}.pdf`);
};
