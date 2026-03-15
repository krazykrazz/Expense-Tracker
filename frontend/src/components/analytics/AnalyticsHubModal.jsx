/**
 * AnalyticsHubModal Component
 * Main container for unified analytics views: Monthly Summary,
 * Merchants, Activity Insights, and Trends.
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { useState, useEffect } from 'react';
import './AnalyticsHubModal.css';
import MonthlySummaryView from './MonthlySummaryView';
import MerchantAnalyticsModal from './MerchantAnalyticsModal';
import ActivityInsightsView from './ActivityInsightsView';
import TrendsView from './TrendsView';

const TABS = [
  { id: 'monthly-summary', label: 'Monthly Summary', icon: '📋' },
  { id: 'merchants', label: 'Merchants', icon: '🏪' },
  { id: 'activity', label: 'Activity Insights', icon: '📈' },
  { id: 'trends', label: 'Trends', icon: '📊' }
];

const AnalyticsHubModal = ({
  isOpen,
  onClose,
  initialTab = 'monthly-summary',
  currentYear,
  currentMonth,
  monthlyIncome,
  budgetAlerts,
  onViewExpenses
}) => {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const handleClose = () => {
    setActiveTab('monthly-summary');
    onClose();
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'monthly-summary':
        return (
          <MonthlySummaryView
            year={currentYear}
            month={currentMonth}
          />
        );

      case 'merchants':
        return (
          <div className="analytics-hub-merchant-wrapper">
            <MerchantAnalyticsModal
              isOpen={true}
              onClose={() => setActiveTab('monthly-summary')}
              onViewExpenses={onViewExpenses}
              embedded={true}
            />
          </div>
        );

      case 'activity':
        return (
          <ActivityInsightsView
            year={currentYear}
            month={currentMonth}
          />
        );

      case 'trends':
        return (
          <TrendsView
            year={currentYear}
            month={currentMonth}
          />
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
