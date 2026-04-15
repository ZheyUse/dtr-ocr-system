import React, { useMemo, useState } from 'react';
import { calculateGeneralStats } from '../services/timeCalculator';

interface GeneralSectionProps {
  hoursRendered: number;
}

export const GeneralSection: React.FC<GeneralSectionProps> = ({ hoursRendered }) => {
  const [hoursRequired, setHoursRequired] = useState<number>(Math.max(160, Math.ceil(hoursRendered)));
  const [dailyTarget, setDailyTarget] = useState<number>(8);

  const stats = useMemo(() => {
    return calculateGeneralStats(hoursRendered, hoursRequired, dailyTarget);
  }, [hoursRendered, hoursRequired, dailyTarget]);

  const progressPercent = useMemo(() => {
    if (stats.hoursRequired <= 0) {
      return 0;
    }

    return Math.min(100, (stats.hoursRendered / stats.hoursRequired) * 100);
  }, [stats.hoursRendered, stats.hoursRequired]);

  return (
    <section className="card general-section">
      <h2>General Stats</h2>

      <div className="stat-row">
        <span>Hours Rendered</span>
        <strong>{stats.hoursRendered.toFixed(2)}</strong>
      </div>

      <label className="field-label" htmlFor="hoursRequired">
        Hours Required
      </label>
      <input
        id="hoursRequired"
        className="field-input"
        type="number"
        min={0}
        value={hoursRequired}
        onChange={(event) => setHoursRequired(Number(event.target.value))}
      />

      <div className="stat-row">
        <span>Hours Remaining</span>
        <strong>{stats.hoursRemaining.toFixed(2)}</strong>
      </div>

      <label className="field-label" htmlFor="dailyTarget">
        Daily Target (hours)
      </label>
      <input
        id="dailyTarget"
        className="field-input"
        type="number"
        min={1}
        value={dailyTarget}
        onChange={(event) => setDailyTarget(Number(event.target.value))}
      />

      <div className="stat-row">
        <span>Days Needed</span>
        <strong>{stats.daysRequired}</strong>
      </div>

      <div className="stat-row">
        <span>Forecast End Date</span>
        <strong>{stats.forecastEndDate}</strong>
      </div>

      <div className="progress-wrap" aria-label="Rendering progress">
        <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
      </div>
      <p className="progress-label">{progressPercent.toFixed(1)}% complete</p>
    </section>
  );
};
