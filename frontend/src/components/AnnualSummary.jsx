import React, { useState, useEffect } from 'react';
import './AnnualSummary.css';

const AnnualSummary = ({ year, onClose }) => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAnnualSummary();
  }, [year]);

  const fetchAnnualSummary = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/expenses/annual-summary?year=${year}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch annual summary');
      }

      const data = await response.json();
      setSummary(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching annual summary:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount) => {
    return parseFloat(amount || 0).toFixed(2);
  };

  const getMonthName = (monthNum) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[monthNum - 1];
  };

  if (loading) {
    return (
      <div className="annual-summary">
        <h2>📊 Annual Summary {year}</h2>
        <div className="loading-message">Loading annual summary...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="annual-summary">
        <h2>📊 Annual Summary {year}</h2>
        <div className="error-message">Error: {error}</div>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <div className="annual-summary">
      <h2>📊 Annual Summary {year}</h2>

      <div className="summary-grid">
        <div className="summary-card">
          <h3>Total Expenses</h3>
          <div className="big-number">${formatAmount(summary.totalExpenses)}</div>
        </div>

        <div className="summary-card">
          <h3>Average Monthly</h3>
          <div className="big-number">${formatAmount(summary.averageMonthly)}</div>
        </div>

        <div className="summary-card">
          <h3>Highest Month</h3>
          <div className="big-number">
            {summary.highestMonth ? getMonthName(summary.highestMonth.month) : 'N/A'}
          </div>
          <div className="sub-text">
            ${formatAmount(summary.highestMonth?.total || 0)}
          </div>
        </div>

        <div className="summary-card">
          <h3>Lowest Month</h3>
          <div className="big-number">
            {summary.lowestMonth ? getMonthName(summary.lowestMonth.month) : 'N/A'}
          </div>
          <div className="sub-text">
            ${formatAmount(summary.lowestMonth?.total || 0)}
          </div>
        </div>
      </div>

      <div className="summary-section">
        <h3>Monthly Breakdown</h3>
        <div className="monthly-chart">
          {summary.monthlyTotals && summary.monthlyTotals.map((month) => (
            <div key={month.month} className="month-bar-container">
              <div className="month-label">{getMonthName(month.month)}</div>
              <div className="bar-wrapper">
                <div 
                  className="month-bar" 
                  style={{ 
                    width: `${(month.total / summary.highestMonth.total) * 100}%` 
                  }}
                >
                  <span className="bar-value">${formatAmount(month.total)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="summary-section">
        <h3>By Category</h3>
        <div className="category-grid">
          {summary.byCategory && Object.entries(summary.byCategory).map(([category, total]) => (
            <div key={category} className="category-item">
              <div className="category-name">{category}</div>
              <div className="category-amount">${formatAmount(total)}</div>
              <div className="category-percentage">
                {((total / summary.totalExpenses) * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="summary-section">
        <h3>By Payment Method</h3>
        <div className="category-grid">
          {summary.byMethod && Object.entries(summary.byMethod).map(([method, total]) => (
            <div key={method} className="category-item">
              <div className="category-name">{method}</div>
              <div className="category-amount">${formatAmount(total)}</div>
              <div className="category-percentage">
                {((total / summary.totalExpenses) * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AnnualSummary;
