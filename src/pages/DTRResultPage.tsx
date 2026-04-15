import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { InfoSection } from '../components/InfoSection';
import { TimeSection } from '../components/TimeSection';
import { GeneralSection } from '../components/GeneralSection';
import { useDTR } from '../hooks/useDTR';

export const DTRResultPage: React.FC = () => {
  const navigate = useNavigate();
  const { record, mergedFileCount } = useDTR();

  if (!record) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="result-page app-shell">
      <header className="result-header card">
        <div>
          <h1>{record.employeeName || 'DTR Result'}</h1>
          <p>{record.month || 'No month provided'}</p>
        </div>

        <div className="result-header-actions">
          {mergedFileCount > 1 && <span className="merge-badge">{mergedFileCount} files merged</span>}
          <button type="button" className="ghost-btn" onClick={() => navigate('/')}>
            Back to Upload
          </button>
        </div>
      </header>

      <main className="result-grid">
        <InfoSection record={record} />
        <TimeSection entries={record.entries} />
        <GeneralSection hoursRendered={record.totalHoursRendered} />
      </main>
    </div>
  );
};
