import { useState, useEffect, useMemo } from 'react';
import './AnnualSummary.css';
import { formatAmount, getMonthNameShort } from '../utils/formatters';
import { getAnnualIncomeByCategory } from '../services/incomeApi';
import { createLogger } from '../utils/logger';

const logger = createLogger('AnnualSummary');

const AnnualSummary = ({ year }) => {
  const [summary, setSummary] = useState(null);
  const [incomeByCategory, setIncomeByCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAnnualSummary();
  }, [year]);

  // Helper function to get category icon
  const getCategoryIcon = (category) => {
    const icons = {
      'Salary': '💼',
      'Government': '🏛️',
      'Gifts': '🎁',
      'Other': '💰'
    };
    return icons[category] || '💰';
  };

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

      // Fetch income by category
      try {
        const categoryData = await getAnnualIncomeByCategory(year);
        setIncomeByCategory(categoryData);
      } catch (categoryErr) {
        logger.error('Error fetching income by category:', categoryErr);
        // Don't fail the whole component if category data fails
        setIncomeByCategory(null);
      }
    } catch (err) {
      setError(err.message);
      logger.error('Error fetching annual summary:', err);
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
        <div className="summary-card income-card">
          <h3>Total Income</h3>
          <div className="big-number positive">${formatAmount(summary.totalIncome || 0)}</div>
          <div className="sub-text">From all sources</div>
        </div>

        <div className="summary-card">
          <h3>Fixed Expenses</h3>
          <div className="big-number">${formatAmount(summary.totalFixedExpenses || 0)}</div>
          <div className="sub-text">Monthly recurring costs</div>
        </div>

        <div className="summary-card">
          <h3>Variable Expenses</h3>
          <div className="big-number">${formatAmount(summary.totalVariableExpenses || 0)}</div>
          <div className="sub-text">Day-to-day spending</div>
        </div>

        <div className="summary-card net-income-card">
          <h3>Balance</h3>
          <div className={`big-number ${summary.netIncome > 0 ? 'positive' : summary.netIncome < 0 ? 'negative' : 'neutral'}`}>
            ${formatAmount(Math.abs(summary.netIncome || 0))}
          </div>
          <div className="sub-text">
            {summary.netIncome > 0 ? 'Surplus' : summary.netIncome < 0 ? 'Deficit' : 'Break Even'}
          </div>
        </div>

        <div className="summary-card net-worth-card">
          <h3>Net Worth</h3>
          <div className={`big-number ${(summary.netWorth || 0) >= 0 ? 'positive' : 'negative'}`}>
            ${formatAmount(Math.abs(summary.netWorth || 0))}
          </div>
          <div className="net-worth-breakdown">
            <span className="assets-label">Assets: ${formatAmount(summary.totalAssets || 0)}</span>
            <span className="separator">-</span>
            <span className="liabilities-label">Liabilities: ${formatAmount(summary.totalLiabilities || 0)}</span>
          </div>
          <div className="sub-text">Year-end position</div>
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

      {/* Income by Category Section */}
      {incomeByCategory && Object.keys(incomeByCategory).length > 0 && (
        <div className="summary-section">
          <h3>Income by Category</h3>
          <div className="category-grid">
            {Object.entries(incomeByCategory).map(([category, total]) => (
              <div key={category} className="category-item income-category-item">
                <div className="category-icon-large">{getCategoryIcon(category)}</div>
                <div className="category-name">{category}</div>
                <div className="category-amount">${formatAmount(total)}</div>
                <div className="category-percentage">
                  {summary.totalIncome > 0 
                    ? ((total / summary.totalIncome) * 100).toFixed(1) 
                    : 0}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
            const totalExpenseWidth = fixedWidth + variableWidth;
            
            return (
              <div key={month.month} className="month-bar-container">
                <div className="month-label">{getMonthNameShort(month.month)}</div>
                <div className="month-bars-wrapper">
                  {/* Expenses Bar - Stacked Horizontal */}
                  <div className="bar-wrapper">
                    {month.total > 0 ? (
                      <div className="horizontal-stacked-bar" style={{ width: `${totalExpenseWidth}%` }}>
                        {fixedWidth > 0 && (
                          <div 
                            className="horizontal-segment fixed-segment"
                            style={{ width: `${(fixedWidth / totalExpenseWidth) * 100}%` }}
                            title={`Fixed: $${formatAmount(month.fixedExpenses || 0)}`}
                          >
                            {fixedWidth > 10 && <span className="bar-value">${formatAmount(month.fixedExpenses)}</span>}
                          </div>
                        )}
                        {variableWidth > 0 && (
                          <div 
                            className="horizontal-segment variable-segment"
                            style={{ width: `${(variableWidth / totalExpenseWidth) * 100}%` }}
                            title={`Variable: $${formatAmount(month.variableExpenses || 0)}`}
                          >
                            {variableWidth > 10 && <span className="bar-value">${formatAmount(month.variableExpenses)}</span>}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="empty-bar">
                        <span className="bar-value">$0.00</span>
                      </div>
                    )}
                  </div>
                  {/* Income Bar - Horizontal */}
                  {(month.income || 0) > 0 && (
                    <div className="bar-wrapper">
                      <div 
                        className="month-bar income-bar"
                        style={{ width: `${incomeWidth}%` }}
                        title={`Income: $${formatAmount(month.income || 0)}`}
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
