/**
 * MonthlySummaryView Component
 * Displays a monthly spending "report card" with top categories,
 * top merchants, month-over-month comparison, and budget summary.
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */

import { useState, useEffect } from 'react';
import './MonthlySummaryView.css';
import { getMonthlySummary } from '../../services/analyticsApi';
import { formatCurrency, getMonthNameLong } from '../../utils/formatters';

const MonthlySummaryView = ({ year, month }) => {
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
      const result = await getMonthlySummary(year, month);
      setData(result);
    } catch (err) {
      setError('Unable to load monthly summary. Please try again.');
      console.error('Error fetching monthly summary:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="monthly-summary-loading">
        <div className="monthly-summary-spinner"></div>
        <p>Loading monthly summary...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="monthly-summary-error">
        <p>{error}</p>
        <button onClick={fetchData} className="monthly-summary-retry-btn">
          Retry
        </button>
      </div>
    );
  }

  if (!data || (data.totalSpending === 0 && (!data.topCategories || data.topCategories.length === 0))) {
    return (
      <div className="monthly-summary-empty">
        <p>No spending data available for {getMonthNameLong(month)} {year}.</p>
        <p className="monthly-summary-empty-hint">
          Start adding expenses to see your monthly report card.
        </p>
      </div>
    );
  }

  const { totalSpending, topCategories, topMerchants, monthOverMonth, budgetSummary } = data;

  return (
    <div className="monthly-summary-view">
      {/* Total Spending */}
      <div className="monthly-summary-total-card">
        <div className="monthly-summary-total-label">
          Total Spending — {getMonthNameLong(month)} {year}
        </div>
        <div className="monthly-summary-total-amount">
          {formatCurrency(totalSpending)}
        </div>
      </div>

      {/* Month-over-Month Comparison */}
      {monthOverMonth && (
        <div className="monthly-summary-mom">
          <h3 className="monthly-summary-section-title">Month-over-Month</h3>
          <div className="monthly-summary-mom-content">
            <div className="monthly-summary-mom-stat">
              <span className="monthly-summary-mom-label">Previous Month</span>
              <span className="monthly-summary-mom-value">
                {formatCurrency(monthOverMonth.previousTotal)}
              </span>
            </div>
            <div className="monthly-summary-mom-stat">
              <span className="monthly-summary-mom-label">Difference</span>
              <span className={`monthly-summary-mom-value ${monthOverMonth.difference > 0 ? 'increase' : monthOverMonth.difference < 0 ? 'decrease' : ''}`}>
                {monthOverMonth.difference > 0 ? '+' : ''}{formatCurrency(monthOverMonth.difference)}
              </span>
            </div>
            <div className="monthly-summary-mom-stat">
              <span className="monthly-summary-mom-label">Change</span>
              <span className={`monthly-summary-mom-value ${monthOverMonth.percentageChange > 0 ? 'increase' : monthOverMonth.percentageChange < 0 ? 'decrease' : ''}`}>
                {monthOverMonth.percentageChange > 0 ? '+' : ''}{monthOverMonth.percentageChange.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="monthly-summary-lists">
        {/* Top Categories */}
        {topCategories && topCategories.length > 0 && (
          <div className="monthly-summary-section">
            <h3 className="monthly-summary-section-title">Top Categories</h3>
            <div className="monthly-summary-ranked-list">
              {topCategories.map((item, index) => (
                <div key={item.category} className="monthly-summary-ranked-item">
                  <span className="monthly-summary-rank">{index + 1}</span>
                  <span className="monthly-summary-item-name">{item.category}</span>
                  <span className="monthly-summary-item-amount">{formatCurrency(item.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Merchants */}
        {topMerchants && topMerchants.length > 0 && (
          <div className="monthly-summary-section">
            <h3 className="monthly-summary-section-title">Top Merchants</h3>
            <div className="monthly-summary-ranked-list">
              {topMerchants.map((item, index) => (
                <div key={item.merchant} className="monthly-summary-ranked-item">
                  <span className="monthly-summary-rank">{index + 1}</span>
                  <span className="monthly-summary-item-name">{item.merchant}</span>
                  <span className="monthly-summary-item-amount">{formatCurrency(item.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Budget Summary */}
      {budgetSummary && (
        <div className="monthly-summary-budget">
          <h3 className="monthly-summary-section-title">Budget Summary</h3>
          <div className="monthly-summary-budget-content">
            <div className="monthly-summary-budget-stats">
              <div className="monthly-summary-budget-stat">
                <span className="monthly-summary-budget-label">Budgeted</span>
                <span className="monthly-summary-budget-value">{formatCurrency(budgetSummary.totalBudgeted)}</span>
              </div>
              <div className="monthly-summary-budget-stat">
                <span className="monthly-summary-budget-label">Spent</span>
                <span className="monthly-summary-budget-value">{formatCurrency(budgetSummary.totalSpent)}</span>
              </div>
              <div className="monthly-summary-budget-stat">
                <span className="monthly-summary-budget-label">Utilization</span>
                <span className={`monthly-summary-budget-value ${budgetSummary.utilizationPercentage >= 100 ? 'over-budget' : ''}`}>
                  {budgetSummary.utilizationPercentage.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="monthly-summary-budget-bar-container">
              <div
                className={`monthly-summary-budget-bar ${budgetSummary.utilizationPercentage >= 100 ? 'over-budget' : budgetSummary.utilizationPercentage >= 80 ? 'warning' : ''}`}
                style={{ width: `${Math.min(budgetSummary.utilizationPercentage, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlySummaryView;
