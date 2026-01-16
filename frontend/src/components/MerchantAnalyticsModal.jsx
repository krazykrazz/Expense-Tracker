import { useState, useEffect } from 'react';
import './MerchantAnalyticsModal.css';
import { getTopMerchants, getPeriodDisplayName, getSortByDisplayName } from '../services/merchantAnalyticsApi';
import { formatCurrency } from '../utils/formatters';
import MerchantDetailView from './MerchantDetailView';

const MerchantAnalyticsModal = ({ isOpen, onClose, onViewExpenses }) => {
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedMerchant, setSelectedMerchant] = useState(null);
  
  // Filter and sort state
  const [period, setPeriod] = useState('year');
  const [sortBy, setSortBy] = useState('total');
  const [includeFixedExpenses, setIncludeFixedExpenses] = useState(false);

  // Fetch merchants when modal opens or filters change
  useEffect(() => {
    if (isOpen) {
      fetchMerchants();
    }
  }, [isOpen, period, sortBy, includeFixedExpenses]);

  const fetchMerchants = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getTopMerchants(period, sortBy, includeFixedExpenses);
      setMerchants(data || []);
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to load merchant analytics. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error fetching merchants:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMerchantClick = (merchant) => {
    setSelectedMerchant(merchant);
  };

  const handleBackToList = () => {
    setSelectedMerchant(null);
    // Refresh the list when coming back from detail view
    fetchMerchants();
  };

  const handleViewExpenses = (merchantName) => {
    // Close the modal and trigger the expense view
    if (onViewExpenses) {
      onViewExpenses(merchantName);
    }
    handleClose();
  };

  const handleClose = () => {
    // Reset all state
    setSelectedMerchant(null);
    setError(null);
    setPeriod('year');
    setSortBy('total');
    setIncludeFixedExpenses(false);
    
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  // If a merchant is selected, show the detail view instead
  if (selectedMerchant) {
    return (
      <MerchantDetailView
        merchantName={selectedMerchant.name}
        period={period}
        includeFixedExpenses={includeFixedExpenses}
        isOpen={true}
        onClose={handleBackToList}
        onViewExpenses={handleViewExpenses}
      />
    );
  }

  return (
    <div className="merchant-analytics-modal-overlay" onClick={handleClose}>
      <div className="merchant-analytics-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="merchant-analytics-modal-header">
          <h2>Merchant Analytics</h2>
          <button className="merchant-analytics-modal-close" onClick={handleClose}>✕</button>
        </div>

        {error && (
          <div className="merchant-analytics-modal-error">
            <div>{error}</div>
            {merchants.length === 0 && !loading && (
              <button 
                className="merchant-analytics-error-retry-button" 
                onClick={fetchMerchants}
              >
                Retry
              </button>
            )}
          </div>
        )}

        <div className="merchant-analytics-modal-content">
          {loading && merchants.length === 0 ? (
            <div className="merchant-analytics-modal-loading">Loading merchant analytics...</div>
          ) : (
            <>
              {/* Filter Controls */}
              <div className="merchant-analytics-filters">
                <div className="merchant-analytics-filter-group">
                  <label>Time Period:</label>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    disabled={loading}
                    className="merchant-analytics-filter-select"
                  >
                    <option value="all">All Time</option>
                    <option value="year">This Year</option>
                    <option value="previousYear">Previous Year</option>
                    <option value="month">This Month</option>
                    <option value="3months">Last 3 Months</option>
                  </select>
                </div>

                <div className="merchant-analytics-filter-group">
                  <label>Sort By:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    disabled={loading}
                    className="merchant-analytics-filter-select"
                  >
                    <option value="total">Total Spend</option>
                    <option value="visits">Visit Count</option>
                    <option value="average">Average Spend</option>
                  </select>
                </div>

                <div className="merchant-analytics-filter-group">
                  <label className="merchant-analytics-checkbox-label">
                    <input
                      type="checkbox"
                      checked={includeFixedExpenses}
                      onChange={(e) => setIncludeFixedExpenses(e.target.checked)}
                      disabled={loading}
                      className="merchant-analytics-checkbox"
                    />
                    Include Fixed Expenses
                  </label>
                </div>
              </div>

              {/* Current Filter Display */}
              <div className="merchant-analytics-current-filters">
                Showing merchants for <strong>{getPeriodDisplayName(period)}</strong> sorted by <strong>{getSortByDisplayName(sortBy)}</strong>
                {includeFixedExpenses && <span className="merchant-analytics-fixed-indicator"> (including fixed expenses)</span>}
              </div>

              {/* Merchants List */}
              <div className="merchant-analytics-list">
                {merchants.length === 0 ? (
                  <div className="merchant-analytics-empty">
                    {loading ? 'Loading...' : 'No merchant data found for the selected period.'}
                  </div>
                ) : (
                  merchants.map((merchant, index) => (
                    <div 
                      key={merchant.name} 
                      className="merchant-analytics-item"
                      onClick={() => handleMerchantClick(merchant)}
                    >
                      <div className="merchant-analytics-item-main">
                        <div className="merchant-analytics-item-rank">
                          #{index + 1}
                        </div>
                        <div className="merchant-analytics-item-info">
                          <div className="merchant-analytics-item-name">
                            {merchant.name}
                            <span className="merchant-analytics-item-category">
                              {merchant.primaryCategory}
                            </span>
                          </div>
                          <div className="merchant-analytics-item-stats">
                            <span className="merchant-analytics-stat">
                              <strong>{formatCurrency(merchant.totalSpend)}</strong>
                              <span className="merchant-analytics-stat-label">Total</span>
                            </span>
                            <span className="merchant-analytics-stat">
                              <strong>{merchant.visitCount}</strong>
                              <span className="merchant-analytics-stat-label">Visits</span>
                            </span>
                            <span className="merchant-analytics-stat">
                              <strong>{formatCurrency(merchant.averageSpend)}</strong>
                              <span className="merchant-analytics-stat-label">Average</span>
                            </span>
                            <span className="merchant-analytics-stat">
                              <strong>{merchant.percentOfTotal.toFixed(1)}%</strong>
                              <span className="merchant-analytics-stat-label">of Total</span>
                            </span>
                          </div>
                        </div>
                        <div className="merchant-analytics-item-arrow">
                          →
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MerchantAnalyticsModal;