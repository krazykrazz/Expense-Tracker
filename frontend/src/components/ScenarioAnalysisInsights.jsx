/**
 * ScenarioAnalysisInsights Component
 * 
 * Provides what-if scenario analysis for extra mortgage payments.
 * Features:
 * - Input field for custom extra payment amount
 * - Preset buttons for common amounts ($100, $250, $500, $1000)
 * - Display scenario results: new payoff date, months saved, interest saved
 * - Comparison table: current vs scenario outcomes
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { useState, useCallback } from 'react';
import './ScenarioAnalysisInsights.css';
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

// Preset extra payment amounts - Requirement 5.6
const PRESET_AMOUNTS = [100, 250, 500, 1000];

const ScenarioAnalysisInsights = ({ 
  currentScenario,
  onCalculateScenario,
  loading = false 
}) => {
  const [customAmount, setCustomAmount] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [scenarioResult, setScenarioResult] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Handle preset button click - Requirement 5.6
   */
  const handlePresetClick = useCallback(async (amount) => {
    setSelectedPreset(amount);
    setCustomAmount(amount.toString());
    setError(null);
    
    if (!onCalculateScenario) return;
    
    setCalculating(true);
    try {
      const result = await onCalculateScenario(amount);
      setScenarioResult(result);
    } catch (err) {
      setError(err.message || 'Failed to calculate scenario');
      setScenarioResult(null);
    } finally {
      setCalculating(false);
    }
  }, [onCalculateScenario]);

  /**
   * Handle custom amount input change
   */
  const handleCustomAmountChange = (e) => {
    const value = e.target.value;
    setCustomAmount(value);
    setSelectedPreset(null);
    // Clear previous results when input changes
    if (scenarioResult) {
      setScenarioResult(null);
    }
    setError(null);
  };

  /**
   * Handle calculate button click for custom amount - Requirement 5.1
   */
  const handleCalculate = useCallback(async () => {
    const amount = parseFloat(customAmount);
    
    if (!customAmount || isNaN(amount) || amount <= 0) {
      setError('Please enter a positive amount');
      return;
    }
    
    if (!onCalculateScenario) return;
    
    setCalculating(true);
    setError(null);
    
    try {
      const result = await onCalculateScenario(amount);
      setScenarioResult(result);
    } catch (err) {
      setError(err.message || 'Failed to calculate scenario');
      setScenarioResult(null);
    } finally {
      setCalculating(false);
    }
  }, [customAmount, onCalculateScenario]);

  /**
   * Handle Enter key press in input
   */
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleCalculate();
    }
  };

  /**
   * Clear scenario results
   */
  const handleClear = () => {
    setCustomAmount('');
    setSelectedPreset(null);
    setScenarioResult(null);
    setError(null);
  };

  // Check if we have valid current scenario data
  const hasCurrentData = currentScenario && !currentScenario.isUnderpayment;

  // Handle missing current scenario data
  if (!currentScenario) {
    return (
      <div className="scenario-analysis-insights">
        <h4>What-If Scenarios</h4>
        <div className="scenario-no-data">
          <span className="no-data-icon">🔮</span>
          <p>Scenario analysis unavailable</p>
          <p className="no-data-hint">Add balance and payment data to explore scenarios</p>
        </div>
      </div>
    );
  }

  return (
    <div className="scenario-analysis-insights">
      <h4>What-If Scenarios</h4>
      <p className="scenario-description">
        See how extra monthly payments could accelerate your mortgage payoff and save on interest.
      </p>

      {/* Preset Buttons - Requirement 5.6 */}
      <div className="scenario-presets">
        <span className="presets-label">Quick scenarios:</span>
        <div className="preset-buttons">
          {PRESET_AMOUNTS.map((amount) => (
            <button
              key={amount}
              className={`preset-button ${selectedPreset === amount ? 'selected' : ''}`}
              onClick={() => handlePresetClick(amount)}
              disabled={calculating || loading || !hasCurrentData}
            >
              +${amount}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Amount Input - Requirement 5.1 */}
      <div className="scenario-custom-input">
        <div className="custom-input-group">
          <label htmlFor="extra-payment-input">Custom extra payment:</label>
          <div className="input-with-button">
            <span className="input-prefix">$</span>
            <input
              id="extra-payment-input"
              type="number"
              value={customAmount}
              onChange={handleCustomAmountChange}
              onKeyPress={handleKeyPress}
              placeholder="Enter amount"
              min="0"
              step="1"
              disabled={calculating || loading || !hasCurrentData}
              className={error ? 'input-error' : ''}
            />
            <button
              className="calculate-button"
              onClick={handleCalculate}
              disabled={calculating || loading || !customAmount || !hasCurrentData}
            >
              {calculating ? 'Calculating...' : 'Calculate'}
            </button>
          </div>
        </div>
        {error && <div className="scenario-error">{error}</div>}
      </div>

      {/* Underpayment Warning */}
      {currentScenario.isUnderpayment && (
        <div className="scenario-underpayment-notice">
          <span className="notice-icon">⚠️</span>
          <p>Scenario analysis is not available when your current payment is below the minimum required.</p>
        </div>
      )}

      {/* Scenario Results - Requirements 5.2, 5.3, 5.4, 5.5 */}
      {scenarioResult && !calculating && (
        <div className="scenario-results">
          <div className="results-header">
            <span className="results-icon">✨</span>
            <span className="results-title">
              With +{formatCurrency(scenarioResult.extraPayment)} Extra/Month
            </span>
            <button 
              className="clear-results-button"
              onClick={handleClear}
              title="Clear results"
            >
              ✕
            </button>
          </div>

          {/* Savings Summary - Requirements 5.3, 5.4 */}
          <div className="savings-summary">
            <div className="savings-card time-saved">
              <span className="savings-icon">⏱️</span>
              <div className="savings-content">
                <span className="savings-value">{formatDuration(scenarioResult.monthsSaved)}</span>
                <span className="savings-label">Time Saved</span>
              </div>
            </div>
            <div className="savings-card interest-saved">
              <span className="savings-icon">💰</span>
              <div className="savings-content">
                <span className="savings-value">{formatCurrency(scenarioResult.interestSaved)}</span>
                <span className="savings-label">Interest Saved</span>
              </div>
            </div>
          </div>

          {/* Comparison Table - Requirement 5.5 */}
          <div className="scenario-comparison-table">
            <table>
              <thead>
                <tr>
                  <th className="metric-column">Metric</th>
                  <th className="current-column">Current</th>
                  <th className="scenario-column">With Extra</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="metric-name">Monthly Payment</td>
                  <td className="metric-value">{formatCurrency(currentScenario.paymentAmount)}</td>
                  <td className="metric-value scenario">{formatCurrency(scenarioResult.newPayment)}</td>
                </tr>
                <tr>
                  <td className="metric-name">Payoff Date</td>
                  <td className="metric-value">{formatPayoffDate(currentScenario.payoffDate)}</td>
                  <td className="metric-value scenario highlight">{formatPayoffDate(scenarioResult.newPayoffDate)}</td>
                </tr>
                <tr>
                  <td className="metric-name">Total Interest</td>
                  <td className="metric-value interest">{formatCurrency(scenarioResult.originalTotalInterest)}</td>
                  <td className="metric-value scenario interest highlight">{formatCurrency(scenarioResult.newTotalInterest)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Motivational Message */}
          <div className="scenario-motivation">
            <p>
              By adding just <strong>{formatCurrency(scenarioResult.extraPayment)}</strong> to your monthly payment, 
              you could pay off your mortgage <strong>{formatDuration(scenarioResult.monthsSaved)}</strong> sooner 
              and save <strong>{formatCurrency(scenarioResult.interestSaved)}</strong> in interest!
            </p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {calculating && (
        <div className="scenario-loading">
          <div className="loading-spinner"></div>
          <span>Calculating scenario...</span>
        </div>
      )}

      {/* No Results Yet */}
      {!scenarioResult && !calculating && hasCurrentData && (
        <div className="scenario-prompt">
          <span className="prompt-icon">💡</span>
          <p>Select a preset amount or enter a custom value to see how extra payments could benefit you.</p>
        </div>
      )}
    </div>
  );
};

export default ScenarioAnalysisInsights;
