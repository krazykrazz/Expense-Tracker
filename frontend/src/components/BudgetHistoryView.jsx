import { useState, useEffect } from 'react';
import { getBudgetHistory } from '../services/budgetApi';
import { formatAmount, getMonthNameShort } from '../utils/formatters';
import { createLogger } from '../utils/logger';
import './BudgetHistoryView.css';

const logger = createLogger('BudgetHistoryView');

/**
 * BudgetHistoryView Component
 * Historical budget performance analysis
 * 
 * @param {number} year - Current year
 * @param {number} month - Current month (1-12)
 * @param {Function} onClose - Callback to close the view
 */
const BudgetHistoryView = ({ year, month, onClose }) => {
  const [historyData, setHistoryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [periodMonths, setPeriodMonths] = useState(6);

  useEffect(() => {
    fetchHistoryData();
  }, [year, month, periodMonths]);

  const fetchHistoryData = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getBudgetHistory(year, month, periodMonths);
      setHistoryData(data);
    } catch (err) {
      setError(err.message || 'Failed to load budget history');
      logger.error('Error fetching budget history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = (months) => {
    setPeriodMonths(months);
  };

  const handleExportCSV = () => {
    if (!historyData || !historyData.categories) {
      return;
    }

    // Build CSV content
    const headers = ['Category', 'Month', 'Year', 'Budgeted', 'Spent', 'Variance', 'Met Budget'];
    const rows = [];

    Object.entries(historyData.categories).forEach(([category, categoryData]) => {
      categoryData.history.forEach((monthData) => {
        const variance = monthData.budgeted - monthData.spent;
        rows.push([
          category,
          monthData.month,
          monthData.year,
          monthData.budgeted.toFixed(2),
          monthData.spent.toFixed(2),
          variance.toFixed(2),
          monthData.met ? 'Yes' : 'No'
        ]);
      });
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `budget-history-${year}-${month}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatPercentage = (value) => {
    return `${value.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="budget-history-modal">
        <div className="budget-history-content">
          <div className="loading-message">Loading budget history...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="budget-history-modal">
        <div className="budget-history-content">
          <div className="modal-header">
            <h2>Budget History</h2>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          <div className="error-message">Error: {error}</div>
        </div>
      </div>
    );
  }

  // Check if we have any history data
  const hasData = historyData && historyData.categories && Object.keys(historyData.categories).length > 0;

  return (
    <div className="budget-history-modal" onClick={onClose}>
      <div className="budget-history-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📊 Budget History</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Period Selector */}
        <div className="period-selector">
          <label>Time Period:</label>
          <div className="period-buttons">
            <button
              className={`period-btn ${periodMonths === 3 ? 'active' : ''}`}
              onClick={() => handlePeriodChange(3)}
            >
              3 Months
            </button>
            <button
              className={`period-btn ${periodMonths === 6 ? 'active' : ''}`}
              onClick={() => handlePeriodChange(6)}
            >
              6 Months
            </button>
            <button
              className={`period-btn ${periodMonths === 12 ? 'active' : ''}`}
              onClick={() => handlePeriodChange(12)}
            >
              12 Months
            </button>
          </div>
        </div>

        {!hasData ? (
          <div className="empty-state">
            <p>No budget history available for the selected period.</p>
            <p className="empty-state-hint">Set up budgets and track expenses to see historical data.</p>
          </div>
        ) : (
          <>
            {/* Export Button */}
            <div className="export-section">
              <button className="export-btn" onClick={handleExportCSV}>
                📥 Export to CSV
              </button>
            </div>

            {/* Historical Performance Table */}
            <div className="history-table-container">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Success Rate</th>
                    <th>Avg Budgeted</th>
                    <th>Avg Spent</th>
                    <th>Avg Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(historyData.categories).map(([category, categoryData]) => {
                    const avgBudgeted = categoryData.averageBudgeted || 0;
                    const avgSpent = categoryData.averageSpent || 0;
                    const avgVariance = avgBudgeted - avgSpent;
                    const successRate = categoryData.successRate || 0;

                    return (
                      <tr key={category}>
                        <td className="category-cell">
                          <strong>{category}</strong>
                        </td>
                        <td className="success-rate-cell">
                          <span className={`success-rate ${successRate >= 80 ? 'good' : successRate >= 50 ? 'moderate' : 'poor'}`}>
                            {formatPercentage(successRate)}
                          </span>
                        </td>
                        <td className="amount-cell">{formatCurrency(avgBudgeted)}</td>
                        <td className="amount-cell">{formatCurrency(avgSpent)}</td>
                        <td className={`amount-cell ${avgVariance >= 0 ? 'positive' : 'negative'}`}>
                          {formatCurrency(avgVariance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Detailed Monthly Breakdown */}
            <div className="monthly-breakdown">
              <h3>Monthly Details</h3>
              {Object.entries(historyData.categories).map(([category, categoryData]) => (
                <div key={category} className="category-section">
                  <h4 className="category-title">{category}</h4>
                  <div className="monthly-table-container">
                    <table className="monthly-table">
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Budgeted</th>
                          <th>Spent</th>
                          <th>Variance</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryData.history.map((monthData, index) => {
                          const variance = monthData.budgeted - monthData.spent;
                          const monthLabel = `${getMonthNameShort(monthData.month)} ${monthData.year}`;

                          return (
                            <tr key={index}>
                              <td>{monthLabel}</td>
                              <td className="amount-cell">
                                {monthData.budgeted > 0 ? formatCurrency(monthData.budgeted) : 'No budget'}
                              </td>
                              <td className="amount-cell">{formatCurrency(monthData.spent)}</td>
                              <td className={`amount-cell ${variance >= 0 ? 'positive' : 'negative'}`}>
                                {monthData.budgeted > 0 ? formatCurrency(variance) : '-'}
                              </td>
                              <td className="status-cell">
                                {monthData.budgeted > 0 ? (
                                  <span className={`status-badge ${monthData.met ? 'met' : 'exceeded'}`}>
                                    {monthData.met ? '✓ Met' : '✗ Exceeded'}
                                  </span>
                                ) : (
                                  <span className="status-badge no-budget">No budget</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BudgetHistoryView;
