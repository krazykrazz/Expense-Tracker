/**
 * MortgageInsightsPanel Component
 * 
 * Main container for all mortgage insights, organizing them into sections:
 * - Current Status (rate, daily interest, payment info)
 * - Payoff Projections (current vs minimum comparison)
 * - What-If Scenarios (extra payment calculator)
 * - Payment History (tracking payment changes over time)
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { useState, useEffect, useCallback } from 'react';
import './MortgageInsightsPanel.css';
import CurrentStatusInsights from './CurrentStatusInsights';
import PayoffProjectionInsights from './PayoffProjectionInsights';
import ScenarioAnalysisInsights from './ScenarioAnalysisInsights';
import PaymentTrackingHistory from './PaymentTrackingHistory';
import { 
  getMortgageInsights, 
  getMortgagePayments,
  createMortgagePayment,
  updateMortgagePayment,
  deleteMortgagePayment,
  calculateScenario,
  updateMortgageRate
} from '../services/mortgageInsightsApi';
import { createLogger } from '../utils/logger';

const logger = createLogger('MortgageInsightsPanel');

/**
 * Section collapse state management
 */
const SECTION_KEYS = {
  CURRENT_STATUS: 'currentStatus',
  PROJECTIONS: 'projections',
  SCENARIOS: 'scenarios',
  PAYMENT_HISTORY: 'paymentHistory'
};

const MortgageInsightsPanel = ({ mortgageId, mortgageData }) => {
  // Data states
  const [insights, setInsights] = useState(null);
  const [payments, setPayments] = useState([]);
  
  // Loading states - Requirement 6.4
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);
  
  // Error state
  const [error, setError] = useState(null);
  
  // Section collapse states - Requirement 6.2
  const [collapsedSections, setCollapsedSections] = useState({
    [SECTION_KEYS.CURRENT_STATUS]: false,
    [SECTION_KEYS.PROJECTIONS]: false,
    [SECTION_KEYS.SCENARIOS]: false,
    [SECTION_KEYS.PAYMENT_HISTORY]: true // Start collapsed
  });

  /**
   * Fetch mortgage insights data
   */
  const fetchInsights = useCallback(async () => {
    if (!mortgageId) return;
    
    setLoadingInsights(true);
    setError(null);
    
    try {
      const data = await getMortgageInsights(mortgageId);
      setInsights(data);
    } catch (err) {
      logger.error('Error fetching mortgage insights:', err);
      setError(err.message || 'Failed to load mortgage insights');
    } finally {
      setLoadingInsights(false);
    }
  }, [mortgageId]);

  /**
   * Fetch payment history
   */
  const fetchPayments = useCallback(async () => {
    if (!mortgageId) return;
    
    setLoadingPayments(true);
    
    try {
      const data = await getMortgagePayments(mortgageId);
      setPayments(data || []);
    } catch (err) {
      logger.error('Error fetching payment history:', err);
      // Don't set error for payments - it's not critical
    } finally {
      setLoadingPayments(false);
    }
  }, [mortgageId]);

  /**
   * Initial data fetch
   */
  useEffect(() => {
    fetchInsights();
    fetchPayments();
  }, [fetchInsights, fetchPayments]);

  /**
   * Handle adding/editing payment from CurrentStatusInsights
   */
  const handleEditPayment = useCallback(async (paymentData) => {
    try {
      await createMortgagePayment(mortgageId, paymentData);
      // Refresh both insights and payments
      await Promise.all([fetchInsights(), fetchPayments()]);
    } catch (err) {
      logger.error('Error creating payment:', err);
      throw err;
    }
  }, [mortgageId, fetchInsights, fetchPayments]);

  /**
   * Handle updating interest rate (for variable rate mortgages)
   */
  const handleEditRate = useCallback(async (newRate) => {
    try {
      await updateMortgageRate(mortgageId, newRate);
      // Refresh insights to show updated rate
      await fetchInsights();
    } catch (err) {
      logger.error('Error updating rate:', err);
      throw err;
    }
  }, [mortgageId, fetchInsights]);

  /**
   * Handle adding payment from PaymentTrackingHistory
   */
  const handleAddPayment = useCallback(async (paymentData) => {
    try {
      await createMortgagePayment(mortgageId, paymentData);
      await Promise.all([fetchInsights(), fetchPayments()]);
    } catch (err) {
      logger.error('Error adding payment:', err);
      throw err;
    }
  }, [mortgageId, fetchInsights, fetchPayments]);

  /**
   * Handle updating payment
   */
  const handleUpdatePayment = useCallback(async (paymentId, paymentData) => {
    try {
      await updateMortgagePayment(mortgageId, paymentId, paymentData);
      await Promise.all([fetchInsights(), fetchPayments()]);
    } catch (err) {
      logger.error('Error updating payment:', err);
      throw err;
    }
  }, [mortgageId, fetchInsights, fetchPayments]);

  /**
   * Handle deleting payment
   */
  const handleDeletePayment = useCallback(async (paymentId) => {
    try {
      await deleteMortgagePayment(mortgageId, paymentId);
      await Promise.all([fetchInsights(), fetchPayments()]);
    } catch (err) {
      logger.error('Error deleting payment:', err);
      throw err;
    }
  }, [mortgageId, fetchInsights, fetchPayments]);

  /**
   * Handle scenario calculation
   */
  const handleCalculateScenario = useCallback(async (extraPayment) => {
    try {
      return await calculateScenario(mortgageId, extraPayment);
    } catch (err) {
      logger.error('Error calculating scenario:', err);
      throw err;
    }
  }, [mortgageId]);

  /**
   * Toggle section collapse state
   */
  const toggleSection = (sectionKey) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  // Check if we have sufficient data for insights - Requirement 6.5
  const hasBalanceData = insights?.dataStatus?.hasBalanceData;
  const hasPaymentData = insights?.dataStatus?.hasPaymentData;
  const isLoading = loadingInsights;

  // Handle missing mortgage data
  if (!mortgageId) {
    return (
      <div className="mortgage-insights-panel">
        <div className="insights-panel-error">
          <span className="error-icon">⚠️</span>
          <p>No mortgage selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mortgage-insights-panel">
      <div className="insights-panel-header">
        <h3>
          <span className="insights-icon">📊</span>
          Mortgage Insights
        </h3>
        {isLoading && <span className="loading-indicator">Loading...</span>}
      </div>

      {/* Error Display */}
      {error && (
        <div className="insights-panel-error">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
          <button 
            className="retry-button"
            onClick={() => { fetchInsights(); fetchPayments(); }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Insufficient Data Message - Requirement 6.5 */}
      {!isLoading && !error && !hasBalanceData && (
        <div className="insights-insufficient-data">
          <span className="info-icon">💡</span>
          <div className="info-content">
            <strong>Add Balance Data to See Insights</strong>
            <p>
              To view mortgage insights including interest calculations and payoff projections, 
              add at least one balance entry with the current balance and interest rate.
            </p>
          </div>
        </div>
      )}

      {/* Insights Sections - Requirement 6.2 */}
      <div className="insights-sections">
        {/* Current Status Section - Requirement 6.1 */}
        <div className={`insights-section-wrapper ${collapsedSections[SECTION_KEYS.CURRENT_STATUS] ? 'collapsed' : ''}`}>
          <button 
            className="section-toggle"
            onClick={() => toggleSection(SECTION_KEYS.CURRENT_STATUS)}
            aria-expanded={!collapsedSections[SECTION_KEYS.CURRENT_STATUS]}
          >
            <span className="section-icon">📈</span>
            <span className="section-title">Current Status</span>
            <span className="toggle-icon">{collapsedSections[SECTION_KEYS.CURRENT_STATUS] ? '▶' : '▼'}</span>
          </button>
          {!collapsedSections[SECTION_KEYS.CURRENT_STATUS] && (
            <div className="section-content">
              <CurrentStatusInsights 
                insights={insights}
                onEditPayment={handleEditPayment}
                onEditRate={handleEditRate}
                loading={isLoading}
              />
            </div>
          )}
        </div>

        {/* Payoff Projections Section - Requirement 6.1 */}
        <div className={`insights-section-wrapper ${collapsedSections[SECTION_KEYS.PROJECTIONS] ? 'collapsed' : ''}`}>
          <button 
            className="section-toggle"
            onClick={() => toggleSection(SECTION_KEYS.PROJECTIONS)}
            aria-expanded={!collapsedSections[SECTION_KEYS.PROJECTIONS]}
          >
            <span className="section-icon">📅</span>
            <span className="section-title">Payoff Projections</span>
            <span className="toggle-icon">{collapsedSections[SECTION_KEYS.PROJECTIONS] ? '▶' : '▼'}</span>
          </button>
          {!collapsedSections[SECTION_KEYS.PROJECTIONS] && (
            <div className="section-content">
              <PayoffProjectionInsights 
                projections={insights?.projections}
                loading={isLoading}
              />
            </div>
          )}
        </div>

        {/* What-If Scenarios Section - Requirement 6.1 */}
        <div className={`insights-section-wrapper ${collapsedSections[SECTION_KEYS.SCENARIOS] ? 'collapsed' : ''}`}>
          <button 
            className="section-toggle"
            onClick={() => toggleSection(SECTION_KEYS.SCENARIOS)}
            aria-expanded={!collapsedSections[SECTION_KEYS.SCENARIOS]}
          >
            <span className="section-icon">🔮</span>
            <span className="section-title">What-If Scenarios</span>
            <span className="toggle-icon">{collapsedSections[SECTION_KEYS.SCENARIOS] ? '▶' : '▼'}</span>
          </button>
          {!collapsedSections[SECTION_KEYS.SCENARIOS] && (
            <div className="section-content">
              <ScenarioAnalysisInsights 
                currentScenario={insights?.projections?.currentScenario}
                onCalculateScenario={handleCalculateScenario}
                loading={isLoading}
              />
            </div>
          )}
        </div>

        {/* Payment History Section - Requirement 6.1 */}
        <div className={`insights-section-wrapper ${collapsedSections[SECTION_KEYS.PAYMENT_HISTORY] ? 'collapsed' : ''}`}>
          <button 
            className="section-toggle"
            onClick={() => toggleSection(SECTION_KEYS.PAYMENT_HISTORY)}
            aria-expanded={!collapsedSections[SECTION_KEYS.PAYMENT_HISTORY]}
          >
            <span className="section-icon">📝</span>
            <span className="section-title">Payment History</span>
            {payments.length > 0 && (
              <span className="section-badge">{payments.length}</span>
            )}
            <span className="toggle-icon">{collapsedSections[SECTION_KEYS.PAYMENT_HISTORY] ? '▶' : '▼'}</span>
          </button>
          {!collapsedSections[SECTION_KEYS.PAYMENT_HISTORY] && (
            <div className="section-content">
              <PaymentTrackingHistory 
                payments={payments}
                onAddPayment={handleAddPayment}
                onUpdatePayment={handleUpdatePayment}
                onDeletePayment={handleDeletePayment}
                loading={loadingPayments}
              />
            </div>
          )}
        </div>
      </div>

      {/* Last Updated Info */}
      {insights?.dataStatus?.lastUpdated && (
        <div className="insights-last-updated">
          Last updated: {new Date(insights.dataStatus.lastUpdated).toLocaleDateString()}
        </div>
      )}
    </div>
  );
};

export default MortgageInsightsPanel;
