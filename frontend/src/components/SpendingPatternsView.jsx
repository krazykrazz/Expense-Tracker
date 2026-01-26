/**
 * SpendingPatternsView Component
 * Displays recurring spending patterns and day-of-week analysis.
 * Requirements: 1.2, 4.1, 4.2, 4.3
 */

import { useState, useEffect } from 'react';
import './SpendingPatternsView.css';
import { getRecurringPatterns, getDayOfWeekPatterns } from '../services/analyticsApi';
import { formatCurrency, formatLocalDate } from '../utils/formatters';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SpendingPatternsView = ({ dataSufficiency, onPatternClick }) => {
  const [patterns, setPatterns] = useState([]);
  const [dayOfWeek, setDayOfWeek] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState('recurring');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [patternsData, dayOfWeekData] = await Promise.all([
        getRecurringPatterns().catch(() => []),
        getDayOfWeekPatterns().catch(() => null)
      ]);
      setPatterns(patternsData || []);
      setDayOfWeek(dayOfWeekData);
    } catch (err) {
      setError('Unable to load spending patterns. Please try again.');
      console.error('Error fetching patterns:', err);
    } finally {
      setLoading(false);
    }
  };

  const getFrequencyLabel = (frequency) => {
    switch (frequency) {
      case 'weekly': return 'Weekly';
      case 'bi-weekly': return 'Bi-weekly';
      case 'monthly': return 'Monthly';
      default: return frequency;
    }
  };

  const getConfidenceClass = (confidence) => {
    if (confidence >= 80) return 'high';
    if (confidence >= 50) return 'medium';
    return 'low';
  };

  const handlePatternClick = (pattern) => {
    if (onPatternClick) {
      onPatternClick(pattern);
    }
  };

  if (loading) {
    return (
      <div className="spending-patterns-loading">
        <div className="spending-patterns-spinner"></div>
        <p>Analyzing spending patterns...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="spending-patterns-error">
        <p>{error}</p>
        <button onClick={fetchData} className="spending-patterns-retry-btn">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="spending-patterns-view">
      {/* Section Toggle */}
      <div className="spending-patterns-toggle">
        <button
          className={`spending-patterns-toggle-btn ${activeSection === 'recurring' ? 'active' : ''}`}
          onClick={() => setActiveSection('recurring')}
        >
          Recurring Patterns
        </button>
        <button
          className={`spending-patterns-toggle-btn ${activeSection === 'dayofweek' ? 'active' : ''}`}
          onClick={() => setActiveSection('dayofweek')}
        >
          Day of Week
        </button>
      </div>

      {/* Recurring Patterns Section */}
      {activeSection === 'recurring' && (
        <div className="spending-patterns-section">
          <h3 className="spending-patterns-section-title">
            Recurring Expenses
            <span className="spending-patterns-count">({patterns.length} found)</span>
          </h3>

          {patterns.length === 0 ? (
            <div className="spending-patterns-empty">
              <p>No recurring patterns detected yet.</p>
              <p className="spending-patterns-empty-hint">
                Patterns are identified when you have at least 3 similar expenses at regular intervals.
              </p>
            </div>
          ) : (
            <div className="spending-patterns-list">
              {patterns.map((pattern, index) => (
                <div
                  key={`${pattern.merchantName}-${index}`}
                  className="spending-pattern-card"
                  onClick={() => handlePatternClick(pattern)}
                >
                  <div className="spending-pattern-header">
                    <div className="spending-pattern-merchant">
                      {pattern.merchantName}
                    </div>
                    <div className={`spending-pattern-confidence ${getConfidenceClass(pattern.confidence)}`}>
                      {pattern.confidence}% confidence
                    </div>
                  </div>

                  <div className="spending-pattern-details">
                    <div className="spending-pattern-detail">
                      <span className="spending-pattern-label">Category</span>
                      <span className="spending-pattern-value">{pattern.category}</span>
                    </div>
                    <div className="spending-pattern-detail">
                      <span className="spending-pattern-label">Frequency</span>
                      <span className="spending-pattern-value spending-pattern-frequency">
                        {getFrequencyLabel(pattern.frequency)}
                      </span>
                    </div>
                    <div className="spending-pattern-detail">
                      <span className="spending-pattern-label">Average Amount</span>
                      <span className="spending-pattern-value spending-pattern-amount">
                        ${formatCurrency(pattern.averageAmount)}
                      </span>
                    </div>
                    <div className="spending-pattern-detail">
                      <span className="spending-pattern-label">Variance</span>
                      <span className="spending-pattern-value">
                        ${formatCurrency(pattern.amountVariance?.min || 0)} - ${formatCurrency(pattern.amountVariance?.max || 0)}
                      </span>
                    </div>
                  </div>

                  <div className="spending-pattern-footer">
                    <div className="spending-pattern-occurrence">
                      <span className="spending-pattern-label">Last:</span>
                      <span>{formatLocalDate(pattern.lastOccurrence)}</span>
                    </div>
                    <div className="spending-pattern-next">
                      <span className="spending-pattern-label">Next Expected:</span>
                      <span className="spending-pattern-next-date">
                        {formatLocalDate(pattern.nextExpected)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Day of Week Section */}
      {activeSection === 'dayofweek' && (
        <div className="spending-patterns-section">
          <h3 className="spending-patterns-section-title">
            Spending by Day of Week
          </h3>

          {!dayOfWeek ? (
            <div className="spending-patterns-empty">
              <p>Day-of-week analysis not available.</p>
              <p className="spending-patterns-empty-hint">
                More expense data is needed to analyze spending patterns by day.
              </p>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="day-of-week-summary">
                <div className="day-of-week-stat">
                  <span className="day-of-week-stat-label">Weekly Average</span>
                  <span className="day-of-week-stat-value">
                    ${formatCurrency(dayOfWeek.weeklyAverage)}
                  </span>
                </div>
                <div className="day-of-week-stat highlight-high">
                  <span className="day-of-week-stat-label">Highest Spending</span>
                  <span className="day-of-week-stat-value">
                    {dayOfWeek.highestSpendingDay}
                  </span>
                </div>
                <div className="day-of-week-stat highlight-low">
                  <span className="day-of-week-stat-label">Lowest Spending</span>
                  <span className="day-of-week-stat-value">
                    {dayOfWeek.lowestSpendingDay}
                  </span>
                </div>
              </div>

              {/* Day Cards */}
              <div className="day-of-week-grid">
                {dayOfWeek.days?.map((day) => (
                  <div
                    key={day.dayIndex}
                    className={`day-of-week-card ${day.isHighSpendingDay ? 'high-spending' : ''}`}
                  >
                    <div className="day-of-week-header">
                      <span className="day-of-week-name">{day.dayName}</span>
                      {day.isHighSpendingDay && (
                        <span className="day-of-week-badge">High</span>
                      )}
                    </div>

                    <div className="day-of-week-amount">
                      ${formatCurrency(day.averageSpend)}
                      <span className="day-of-week-avg-label">avg</span>
                    </div>

                    <div className="day-of-week-bar-container">
                      <div
                        className="day-of-week-bar"
                        style={{ width: `${Math.min(day.percentOfWeeklyTotal * 7, 100)}%` }}
                      />
                    </div>

                    <div className="day-of-week-meta">
                      <span>{day.transactionCount} transactions</span>
                      <span>{day.percentOfWeeklyTotal.toFixed(1)}% of weekly</span>
                    </div>

                    {day.topCategories && day.topCategories.length > 0 && (
                      <div className="day-of-week-categories">
                        <span className="day-of-week-categories-label">Top Categories:</span>
                        <div className="day-of-week-categories-list">
                          {day.topCategories.slice(0, 3).map((cat, idx) => (
                            <span key={idx} className="day-of-week-category">
                              {cat.category}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SpendingPatternsView;
