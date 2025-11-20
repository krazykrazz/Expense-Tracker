import { useState, useEffect, useMemo } from 'react';
import './AnnualSummary.css';
import { formatAmount, getMonthNameShort } from '../utils/formatters';

const AnnualSummary = ({ year }) => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAnnualSummary();
  }, [year]);

  // Memoize expensive chart calculations - MUST be at top level, before any returns
  const chartData = useMemo(() => {
    if (!summary || !summary.monthlyTotals || summary.monthlyTotals.length === 0) {
      return null;
    }
    
    const maxValue = Math.max(
      summary.highestMonth?.total || 0,
      ...summary.monthlyTotals.map(m => m.income || 0)
    );
    const scaleFactor = maxValue > 0 ? maxValue : 1;
    
    return { maxValue, scaleFactor };
  }, [summary]);

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

  // Check if there's any data for this year
  const hasData = summary.totalExpenses > 0 || summary.totalIncome > 0;

  // Show empty state if no data
  if (!hasData) {
    return (
      <div className="annual-summary">
        <h2>📊 Annual Summary {year}</h2>
        <div className="empty-state">No expenses or income recorded for {year}</div>
      </div>
    );
  }

  return (
    <div className="annual-summary">
      <h2>📊 Annual Summary {year}</h2>

      <div className="summary-grid">
        <div className="summary-card">
          <h3>Total Expenses</h3>
          <div className="big-number">${formatAmount(summary.totalExpenses)}</div>
          <div className="expense-breakdown">
            <span className="fixed-label">Fixed: ${formatAmount(summary.totalFixedExpenses || 0)}</span>
            <span className="separator"> + </span>
            <span className="variable-label">Variable: ${formatAmount(summary.totalVariableExpenses || 0)}</span>
          </div>
        </div>

        <div className="summary-card income-card">
          <h3>Total Income</h3>
          <div className="big-number positive">${formatAmount(summary.totalIncome || 0)}</div>
          <div className="sub-text">From all sources</div>
        </div>

        <div className="summary-card net-income-card">
          <h3>Net Income</h3>
          <div className={`big-number ${summary.netIncome > 0 ? 'positive' : summary.netIncome < 0 ? 'negative' : 'neutral'}`}>
            ${formatAmount(Math.abs(summary.netIncome || 0))}
          </div>
          <div className="sub-text">
            {summary.netIncome > 0 ? 'Surplus' : summary.netIncome < 0 ? 'Deficit' : 'Break Even'}
          </div>
        </div>

        <div className="summary-card">
          <h3>Average Monthly</h3>
          <div className="big-number">${formatAmount(summary.averageMonthly)}</div>
        </div>

        <div className="summary-card">
          <h3>Highest Month</h3>
          <div className="big-number">
            {summary.highestMonth ? getMonthNameShort(summary.highestMonth.month) : 'N/A'}
          </div>
          <div className="sub-text">
            ${formatAmount(summary.highestMonth?.total || 0)}
          </div>
        </div>

        <div className="summary-card">
          <h3>Lowest Month</h3>
          <div className="big-number">
            {summary.lowestMonth ? getMonthNameShort(summary.lowestMonth.month) : 'N/A'}
          </div>
          <div className="sub-text">
            ${formatAmount(summary.lowestMonth?.total || 0)}
          </div>
        </div>
      </div>

      <div className="summary-section">
        <h3>Monthly Breakdown</h3>
        <div className="chart-legend">
          <div className="legend-item">
            <div className="legend-color fixed-color"></div>
            <span>Fixed Expenses</span>
          </div>
          <div className="legend-item">
            <div className="legend-color variable-color"></div>
            <span>Variable Expenses</span>
          </div>
          <div className="legend-item">
            <div className="legend-color income-color"></div>
            <span>Income</span>
          </div>
        </div>
        <div className="monthly-chart">
          {summary.monthlyTotals && summary.monthlyTotals.length > 0 && chartData && summary.monthlyTotals.map((month) => {
            // Use memoized scale factor for performance
            const { scaleFactor } = chartData;
            
            const fixedWidth = ((month.fixedExpenses || 0) / scaleFactor) * 100;
            const variableWidth = ((month.variableExpenses || 0) / scaleFactor) * 100;
            const incomeWidth = ((month.income || 0) / scaleFactor) * 100;
            const netIncome = (month.income || 0) - month.total;
            
            return (
              <div key={month.month} className="month-bar-container">
                <div className="month-label">{getMonthNameShort(month.month)}</div>
                <div className="month-bars-wrapper">
                  <div className="bar-wrapper">
                    {(month.fixedExpenses || 0) > 0 && (
                      <div 
                        className="month-bar fixed-expense-bar"
                        style={{ width: `${fixedWidth}%` }}
                        title={`Fixed: $${formatAmount(month.fixedExpenses || 0)}`}
                      >
                        <span className="bar-value">${formatAmount(month.fixedExpenses)}</span>
                      </div>
                    )}
                    {(month.variableExpenses || 0) > 0 && (
                      <div 
                        className="month-bar variable-expense-bar"
                        style={{ 
                          width: `${variableWidth}%`,
                          marginLeft: (month.fixedExpenses || 0) > 0 ? '2px' : '0'
                        }}
                        title={`Variable: $${formatAmount(month.variableExpenses || 0)}`}
                      >
                        <span className="bar-value">${formatAmount(month.variableExpenses)}</span>
                      </div>
                    )}
                    {month.total === 0 && (
                      <div className="empty-bar">
                        <span className="bar-value">$0.00</span>
                      </div>
                    )}
                  </div>
                  {(month.income || 0) > 0 && (
                    <div className="bar-wrapper income-bar-wrapper">
                      <div 
                        className="month-bar income-bar"
                        style={{ width: `${incomeWidth}%` }}
                        title={`Income: $${formatAmount(month.income || 0)} | Net: $${formatAmount(Math.abs(netIncome))}`}
                      >
                        <span className="bar-value">${formatAmount(month.income)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {summary.byCategory && Object.keys(summary.byCategory).length > 0 && (
        <div className="summary-section">
          <h3>By Category</h3>
          <div className="category-grid">
            {Object.entries(summary.byCategory).map(([category, total]) => (
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
      )}

      {summary.byMethod && Object.keys(summary.byMethod).length > 0 && (
        <div className="summary-section">
          <h3>By Payment Method</h3>
          <div className="category-grid">
            {Object.entries(summary.byMethod).map(([method, total]) => (
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
      )}
    </div>
  );
};

export default AnnualSummary;
