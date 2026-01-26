/**
 * DataSufficiencyMessage Component
 * Displays informative message when insufficient data exists for analytics features.
 * Requirements: 1.3, 6.2
 */

import './DataSufficiencyMessage.css';

const FEATURE_INFO = {
  patterns: {
    name: 'Recurring Patterns',
    description: 'Identify regular spending habits and predict upcoming expenses',
    requiredMonths: 3,
    icon: '📊'
  },
  predictions: {
    name: 'Spending Predictions',
    description: 'Forecast end-of-month spending based on current trajectory',
    requiredMonths: 1,
    icon: '🔮'
  },
  seasonal: {
    name: 'Seasonal Analysis',
    description: 'Compare spending across months and quarters to identify trends',
    requiredMonths: 6,
    icon: '📅'
  },
  anomalies: {
    name: 'Anomaly Detection',
    description: 'Identify unusual spending that deviates from your normal patterns',
    requiredMonths: 3,
    icon: '⚠️'
  },
  dayOfWeek: {
    name: 'Day-of-Week Analysis',
    description: 'Understand which days you tend to spend more',
    requiredMonths: 1,
    icon: '📆'
  }
};

const DataSufficiencyMessage = ({ dataSufficiency, feature }) => {
  if (!dataSufficiency) {
    return (
      <div className="data-sufficiency-message">
        <div className="data-sufficiency-icon">📊</div>
        <h3>Loading Data Information...</h3>
      </div>
    );
  }

  const featureInfo = FEATURE_INFO[feature] || {
    name: 'This Feature',
    description: 'Analytics feature',
    requiredMonths: 3,
    icon: '📊'
  };

  const monthsNeeded = featureInfo.requiredMonths - dataSufficiency.monthsOfData;
  const hasEnoughData = dataSufficiency.monthsOfData >= featureInfo.requiredMonths;

  return (
    <div className="data-sufficiency-message">
      <div className="data-sufficiency-header">
        <span className="data-sufficiency-icon">{featureInfo.icon}</span>
        <h3>{featureInfo.name}</h3>
      </div>

      <p className="data-sufficiency-description">
        {featureInfo.description}
      </p>

      {!hasEnoughData && (
        <div className="data-sufficiency-status">
          <div className="data-sufficiency-progress">
            <div className="data-sufficiency-progress-header">
              <span>Data Progress</span>
              <span>{dataSufficiency.monthsOfData} / {featureInfo.requiredMonths} months</span>
            </div>
            <div className="data-sufficiency-progress-bar">
              <div
                className="data-sufficiency-progress-fill"
                style={{
                  width: `${Math.min((dataSufficiency.monthsOfData / featureInfo.requiredMonths) * 100, 100)}%`
                }}
              />
            </div>
          </div>

          <div className="data-sufficiency-needed">
            <span className="data-sufficiency-needed-icon">⏳</span>
            <span>
              {monthsNeeded > 0
                ? `${monthsNeeded} more month${monthsNeeded > 1 ? 's' : ''} of data needed`
                : 'Almost there!'}
            </span>
          </div>
        </div>
      )}

      {dataSufficiency.missingDataMessage && (
        <div className="data-sufficiency-tip">
          <span className="data-sufficiency-tip-icon">💡</span>
          <span>{dataSufficiency.missingDataMessage}</span>
        </div>
      )}

      {/* Available Features Section */}
      <div className="data-sufficiency-features">
        <h4>Feature Availability</h4>
        <div className="data-sufficiency-feature-list">
          {Object.entries(FEATURE_INFO).map(([key, info]) => {
            const isAvailable = dataSufficiency.availableFeatures?.[
              key === 'patterns' ? 'recurringPatterns' :
              key === 'dayOfWeek' ? 'dayOfWeekAnalysis' :
              key === 'anomalies' ? 'anomalyDetection' :
              key === 'seasonal' ? 'seasonalAnalysis' :
              key
            ];
            
            return (
              <div
                key={key}
                className={`data-sufficiency-feature ${isAvailable ? 'available' : 'unavailable'}`}
              >
                <span className="data-sufficiency-feature-icon">{info.icon}</span>
                <span className="data-sufficiency-feature-name">{info.name}</span>
                <span className="data-sufficiency-feature-status">
                  {isAvailable ? '✓' : `${info.requiredMonths}+ months`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Data Quality Info */}
      {dataSufficiency.dataQualityScore !== undefined && (
        <div className="data-sufficiency-quality">
          <div className="data-sufficiency-quality-header">
            <span>Data Quality Score</span>
            <span className="data-sufficiency-quality-value">
              {dataSufficiency.dataQualityScore}%
            </span>
          </div>
          <div className="data-sufficiency-quality-bar">
            <div
              className="data-sufficiency-quality-fill"
              style={{ width: `${dataSufficiency.dataQualityScore}%` }}
            />
          </div>
          <p className="data-sufficiency-quality-hint">
            Higher quality data leads to more accurate predictions and pattern detection.
          </p>
        </div>
      )}

      {/* Date Range Info */}
      {(dataSufficiency.oldestExpenseDate || dataSufficiency.newestExpenseDate) && (
        <div className="data-sufficiency-dates">
          <div className="data-sufficiency-date">
            <span className="data-sufficiency-date-label">First Expense:</span>
            <span className="data-sufficiency-date-value">
              {dataSufficiency.oldestExpenseDate || 'N/A'}
            </span>
          </div>
          <div className="data-sufficiency-date">
            <span className="data-sufficiency-date-label">Latest Expense:</span>
            <span className="data-sufficiency-date-value">
              {dataSufficiency.newestExpenseDate || 'N/A'}
            </span>
          </div>
        </div>
      )}

      {/* Call to Action */}
      <div className="data-sufficiency-cta">
        <p>
          Keep tracking your expenses to unlock more powerful analytics features!
        </p>
      </div>
    </div>
  );
};

export default DataSufficiencyMessage;
