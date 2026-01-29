/**
 * PayoffProjectionInsights Component
 * 
 * Displays payoff projection comparison between current payment and minimum payment scenarios.
 * Shows payoff date, total months, total interest for each scenario.
 * Highlights time saved and interest saved when current > minimum.
 * Displays warning banner when current < minimum (underpayment).
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import './PayoffProjectionInsights.css';
import { formatCurrency, formatLocalDate } from '../utils/formatters';

/**
 * Format months into years and months display
 * @param {number} totalMonths - Total number of months
 * @returns {string} Formatted string (e.g., "5 years, 3 months")
 */
const formatDuration = (totalMonths) => {
  if (totalMonths === null || totalMonths === undefined) return 'N/A';
  
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  
  if (years === 0) {
    return `${months} month${months !== 1 ? 's' : ''}`;
  }
  if (months === 0) {
    return `${years} year${years !== 1 ? 's' : ''}`;
  }
  return `${years} year${years !== 1 ? 's' : ''}, ${months} month${months !== 1 ? 's' : ''}`;
};

/**
 * Format payoff date for display
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {string} Formatted date or 'N/A'
 */
const formatPayoffDate = (dateString) => {
  if (!dateString) return 'N/A';
  return formatLocalDate(dateString);
};

const PayoffProjectionInsights = ({ 
  projections,
  loading = false 
}) => {
  // Handle missing projections data
  if (!projections) {
    return (
      <div className="payoff-projection-insights">
        <h4>Payoff Projections</h4>
        <div className="projections-no-data">
          <span className="no-data-icon">📅</span>
          <p>Projections unavailable</p>
          <p className="no-data-hint">Add balance and rate data to see payoff projections</p>
        </div>
      </div>
    );
  }

  const { currentScenario, minimumScenario, comparison, isUnderpayment } = projections;

  // Check if current scenario is an underpayment (can't project payoff)
  const currentIsUnderpayment = currentScenario?.isUnderpayment;
  const minimumIsUnderpayment = minimumScenario?.isUnderpayment;

  return (
    <div className="payoff-projection-insights">
      <h4>Payoff Projections</h4>
      
      {/* Underpayment Warning Banner - Requirement 4.6 */}
      {isUnderpayment && (
        <div className="underpayment-warning">
          <span className="warning-icon">⚠️</span>
          <div className="warning-content">
            <strong>Underpayment Warning</strong>
            <p>Your current payment is below the minimum required. The mortgage will not be paid off on schedule.</p>
          </div>
        </div>
      )}

      {/* Comparison Table - Requirements 4.1, 4.2, 4.3, 4.4 */}
      <div className="projections-table-container">
        <table className="projections-table">
          <thead>
            <tr>
              <th className="metric-column">Metric</th>
              <th className="scenario-column current">
                <span className="scenario-label">Your Payment</span>
                <span className="scenario-amount">{formatCurrency(currentScenario?.paymentAmount || 0)}/mo</span>
              </th>
              <th className="scenario-column minimum">
                <span className="scenario-label">Minimum Payment</span>
                <span className="scenario-amount">{formatCurrency(minimumScenario?.paymentAmount || 0)}/mo</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Payoff Date Row - Requirement 4.1 */}
            <tr>
              <td className="metric-name">Payoff Date</td>
              <td className={`metric-value current ${currentIsUnderpayment ? 'underpayment' : ''}`}>
                {currentIsUnderpayment ? (
                  <span className="underpayment-text">Never</span>
                ) : (
                  formatPayoffDate(currentScenario?.payoffDate)
                )}
              </td>
              <td className={`metric-value minimum ${minimumIsUnderpayment ? 'underpayment' : ''}`}>
                {minimumIsUnderpayment ? (
                  <span className="underpayment-text">Never</span>
                ) : (
                  formatPayoffDate(minimumScenario?.payoffDate)
                )}
              </td>
            </tr>

            {/* Total Months Row - Requirement 4.2 */}
            <tr>
              <td className="metric-name">Time to Payoff</td>
              <td className={`metric-value current ${currentIsUnderpayment ? 'underpayment' : ''}`}>
                {currentIsUnderpayment ? (
                  <span className="underpayment-text">∞</span>
                ) : (
                  formatDuration(currentScenario?.totalMonths)
                )}
              </td>
              <td className={`metric-value minimum ${minimumIsUnderpayment ? 'underpayment' : ''}`}>
                {minimumIsUnderpayment ? (
                  <span className="underpayment-text">∞</span>
                ) : (
                  formatDuration(minimumScenario?.totalMonths)
                )}
              </td>
            </tr>

            {/* Total Interest Row - Requirement 4.4 */}
            <tr>
              <td className="metric-name">Total Interest</td>
              <td className={`metric-value current ${currentIsUnderpayment ? 'underpayment' : ''}`}>
                {currentIsUnderpayment ? (
                  <span className="underpayment-text">N/A</span>
                ) : (
                  <span className="interest-amount">{formatCurrency(currentScenario?.totalInterest || 0)}</span>
                )}
              </td>
              <td className={`metric-value minimum ${minimumIsUnderpayment ? 'underpayment' : ''}`}>
                {minimumIsUnderpayment ? (
                  <span className="underpayment-text">N/A</span>
                ) : (
                  <span className="interest-amount">{formatCurrency(minimumScenario?.totalInterest || 0)}</span>
                )}
              </td>
            </tr>

            {/* Total Paid Row */}
            <tr>
              <td className="metric-name">Total Paid</td>
              <td className={`metric-value current ${currentIsUnderpayment ? 'underpayment' : ''}`}>
                {currentIsUnderpayment ? (
                  <span className="underpayment-text">N/A</span>
                ) : (
                  <span className="total-paid">{formatCurrency(currentScenario?.totalPaid || 0)}</span>
                )}
              </td>
              <td className={`metric-value minimum ${minimumIsUnderpayment ? 'underpayment' : ''}`}>
                {minimumIsUnderpayment ? (
                  <span className="underpayment-text">N/A</span>
                ) : (
                  <span className="total-paid">{formatCurrency(minimumScenario?.totalPaid || 0)}</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Savings Highlight - Requirement 4.5 */}
      {!isUnderpayment && !currentIsUnderpayment && comparison && comparison.monthsSaved > 0 && (
        <div className="savings-highlight">
          <div className="savings-header">
            <span className="savings-icon">🎉</span>
            <span className="savings-title">You're Saving!</span>
          </div>
          <div className="savings-details">
            <div className="savings-item">
              <span className="savings-label">Time Saved</span>
              <span className="savings-value positive">{formatDuration(comparison.monthsSaved)}</span>
            </div>
            <div className="savings-item">
              <span className="savings-label">Interest Saved</span>
              <span className="savings-value positive">{formatCurrency(comparison.interestSaved)}</span>
            </div>
          </div>
          <p className="savings-message">
            By paying {formatCurrency((currentScenario?.paymentAmount || 0) - (minimumScenario?.paymentAmount || 0))} extra per month, 
            you'll pay off your mortgage {formatDuration(comparison.monthsSaved)} sooner!
          </p>
        </div>
      )}

      {/* No Savings Message (when current equals minimum) */}
      {!isUnderpayment && !currentIsUnderpayment && comparison && comparison.monthsSaved === 0 && (
        <div className="no-savings-message">
          <span className="info-icon">💡</span>
          <p>You're paying the minimum amount. Consider adding extra payments to save on interest and pay off sooner.</p>
        </div>
      )}
    </div>
  );
};

export default PayoffProjectionInsights;
