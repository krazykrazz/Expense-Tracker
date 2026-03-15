/**
 * ActivityInsightsView Component
 * Displays activity analytics: entry velocity, entity breakdown,
 * recent changes, and day-of-week activity patterns.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { useState, useEffect } from 'react';
import './ActivityInsightsView.css';
import { getActivityInsights } from '../../services/analyticsApi';
import { formatDateTime } from '../../utils/formatters';

const ActivityInsightsView = ({ year, month }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, [year, month]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getActivityInsights(year, month);
      setData(result);
    } catch (err) {
      setError('Unable to load activity insights. Please try again.');
      console.error('Error fetching activity insights:', err);
    } finally {
      setLoading(false);
    }
  };

  const isEmpty = (d) => {
    if (!d) return true;
    const noVelocity = !d.entryVelocity || (d.entryVelocity.currentMonth === 0 && d.entryVelocity.previousMonth === 0);
    const noBreakdown = !d.entityBreakdown || d.entityBreakdown.length === 0;
    const noChanges = !d.recentChanges || d.recentChanges.length === 0;
    const noPatterns = !d.dayOfWeekPatterns || d.dayOfWeekPatterns.length === 0;
    return noVelocity && noBreakdown && noChanges && noPatterns;
  };

  if (loading) {
    return (
      <div className="activity-insights-loading">
        <div className="activity-insights-spinner"></div>
        <p>Loading activity insights...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="activity-insights-error">
        <p>{error}</p>
        <button onClick={fetchData} className="activity-insights-retry-btn">
          Retry
        </button>
      </div>
    );
  }

  if (isEmpty(data)) {
    return (
      <div className="activity-insights-empty">
        <p>No activity data available yet.</p>
        <p className="activity-insights-empty-hint">
          Activity tracking data will appear as you interact with the app.
        </p>
      </div>
    );
  }

  const { entryVelocity, entityBreakdown, recentChanges, dayOfWeekPatterns } = data;
  const maxDayCount = dayOfWeekPatterns && dayOfWeekPatterns.length > 0
    ? Math.max(...dayOfWeekPatterns.map(d => d.count))
    : 0;

  return (
    <div className="activity-insights-view">
      {/* Entry Velocity */}
      {entryVelocity && (
        <div className="activity-insights-velocity">
          <h3 className="activity-insights-section-title">Entry Velocity</h3>
          <div className="activity-insights-velocity-content">
            <div className="activity-insights-velocity-stat">
              <span className="activity-insights-velocity-label">This Month</span>
              <span className="activity-insights-velocity-value">{entryVelocity.currentMonth}</span>
            </div>
            <div className="activity-insights-velocity-stat">
              <span className="activity-insights-velocity-label">Last Month</span>
              <span className="activity-insights-velocity-value">{entryVelocity.previousMonth}</span>
            </div>
            <div className="activity-insights-velocity-stat">
              <span className="activity-insights-velocity-label">Difference</span>
              <span className={`activity-insights-velocity-value ${entryVelocity.difference > 0 ? 'positive' : entryVelocity.difference < 0 ? 'negative' : ''}`}>
                {entryVelocity.difference > 0 ? '+' : ''}{entryVelocity.difference}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Entity Type Breakdown */}
      {entityBreakdown && entityBreakdown.length > 0 && (
        <div className="activity-insights-breakdown">
          <h3 className="activity-insights-section-title">Activity by Type</h3>
          <div className="activity-insights-breakdown-list">
            {entityBreakdown.map((item) => (
              <div key={item.entityType} className="activity-insights-breakdown-item">
                <span className="activity-insights-breakdown-type">{item.entityType}</span>
                <span className="activity-insights-breakdown-count">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Day-of-Week Patterns */}
      {dayOfWeekPatterns && dayOfWeekPatterns.length > 0 && (
        <div className="activity-insights-dow">
          <h3 className="activity-insights-section-title">Day-of-Week Activity</h3>
          <div className="activity-insights-dow-list">
            {dayOfWeekPatterns.map((item) => (
              <div key={item.day} className="activity-insights-dow-item">
                <span className="activity-insights-dow-day">{item.day}</span>
                <div className="activity-insights-dow-bar-container">
                  <div
                    className="activity-insights-dow-bar"
                    style={{ width: maxDayCount > 0 ? `${(item.count / maxDayCount) * 100}%` : '0%' }}
                  />
                </div>
                <span className="activity-insights-dow-count">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Changes */}
      {recentChanges && recentChanges.length > 0 && (
        <div className="activity-insights-recent">
          <h3 className="activity-insights-section-title">Recent Changes</h3>
          <div className="activity-insights-recent-list">
            {recentChanges.map((change) => (
              <div key={change.id} className="activity-insights-recent-item">
                <div className="activity-insights-recent-header">
                  <span className="activity-insights-recent-type">{change.entityType}</span>
                  <span className="activity-insights-recent-time">{formatDateTime(change.timestamp)}</span>
                </div>
                <div className="activity-insights-recent-action">{change.userAction}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityInsightsView;
