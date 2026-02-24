/**
 * AnalyticsHubModal Component
 * Main container for unified analytics views including Spending Patterns,
 * Predictions, Seasonal Analysis, Anomaly Alerts, and Merchant Analytics.
 * Requirements: 7.1, 7.5, 7.6
 */

import { useState, useEffect } from 'react';
import './AnalyticsHubModal.css';
import { checkDataSufficiency } from '../services/analyticsApi';
import SpendingPatternsView from './SpendingPatternsView';
import PredictionsView from './PredictionsView';
import SeasonalAnalysisView from './SeasonalAnalysisView';
import AnomalyAlertsView from './AnomalyAlertsView';
import MerchantAnalyticsModal from './MerchantAnalyticsModal';
import DataSufficiencyMessage from './DataSufficiencyMessage';

const TABS = [
  { id: 'patterns', label: 'Spending Patterns', icon: '📊' },
  { id: 'predictions', label: 'Predictions', icon: '🔮' },
  { id: 'seasonal', label: 'Seasonal', icon: '📅' },
  { id: 'anomalies', label: 'Anomalies', icon: '⚠️' },
  { id: 'merchants', label: 'Merchants', icon: '🏪' }
];

const AnalyticsHubModal = ({
  isOpen,
  onClose,
  initialTab = 'patterns',
  currentYear,
  currentMonth,
  monthlyIncome,
  budgetAlerts,
  onViewExpenses
}) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [dataSufficiency, setDataSufficiency] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch data sufficiency when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchDataSufficiency();
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const fetchDataSufficiency = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await checkDataSufficiency();
      setDataSufficiency(data);
    } catch (err) {
      setError('Unable to check data availability. Please try again.');
      console.error('Error checking data sufficiency:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setActiveTab('patterns');
    setError(null);
    onClose();
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
  };

  const isFeatureAvailable = (feature) => {
    if (!dataSufficiency?.availableFeatures) return false;
    return dataSufficiency.availableFeatures[feature];
  };

  const renderTabContent = () => {
    // Show loading state
    if (loading) {
      return (
        <div className="analytics-hub-loading">
          <div className="analytics-hub-spinner"></div>
          <p>Loading analytics...</p>
        </div>
      );
    }

    // Show error state
    if (error) {
      return (
        <div className="analytics-hub-error">
          <p>{error}</p>
          <button onClick={fetchDataSufficiency} className="analytics-hub-retry-btn">
            Retry
          </button>
        </div>
      );
    }

    // Render active tab content
    switch (activeTab) {
      case 'patterns':
        return isFeatureAvailable('recurringPatterns') || isFeatureAvailable('dayOfWeekAnalysis') ? (
          <SpendingPatternsView
            dataSufficiency={dataSufficiency}
          />
        ) : (
          <DataSufficiencyMessage
            dataSufficiency={dataSufficiency}
            feature="patterns"
          />
        );

      case 'predictions':
        return isFeatureAvailable('predictions') ? (
          <PredictionsView
            year={currentYear}
            month={currentMonth}
            monthlyIncome={monthlyIncome}
            budgetAlerts={budgetAlerts}
          />
        ) : (
          <DataSufficiencyMessage
            dataSufficiency={dataSufficiency}
            feature="predictions"
          />
        );

      case 'seasonal':
        return isFeatureAvailable('seasonalAnalysis') ? (
          <SeasonalAnalysisView />
        ) : (
          <DataSufficiencyMessage
            dataSufficiency={dataSufficiency}
            feature="seasonal"
          />
        );

      case 'anomalies':
        return isFeatureAvailable('anomalyDetection') ? (
          <AnomalyAlertsView />
        ) : (
          <DataSufficiencyMessage
            dataSufficiency={dataSufficiency}
            feature="anomalies"
          />
        );

      case 'merchants':
        // Merchant Analytics is always available (uses existing data)
        return (
          <div className="analytics-hub-merchant-wrapper">
            <MerchantAnalyticsModal
              isOpen={true}
              onClose={() => setActiveTab('patterns')}
              onViewExpenses={onViewExpenses}
              embedded={true}
            />
          </div>
        );

      default:
        return null;
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="analytics-hub-container" onClick={(e) => e.stopPropagation()}>
        <div className="analytics-hub-header">
          <h2>Analytics Hub</h2>
          <button className="analytics-hub-close" onClick={handleClose}>✕</button>
        </div>

        {/* Data Quality Indicator */}
        {dataSufficiency && !loading && (
          <div className="analytics-hub-quality-bar">
            <span className="analytics-hub-quality-label">Data Quality:</span>
            <div className="analytics-hub-quality-meter">
              <div 
                className="analytics-hub-quality-fill"
                style={{ width: `${dataSufficiency.dataQualityScore || 0}%` }}
              />
            </div>
            <span className="analytics-hub-quality-value">
              {dataSufficiency.dataQualityScore || 0}%
            </span>
            <span className="analytics-hub-months-info">
              ({dataSufficiency.monthsOfData || 0} months of data)
            </span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="analytics-hub-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`analytics-hub-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              <span className="analytics-hub-tab-icon">{tab.icon}</span>
              <span className="analytics-hub-tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="analytics-hub-content">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsHubModal;
