import { useState, useEffect, useMemo } from 'react';
import './AnnualSummary.css';
import { formatAmount, getMonthNameShort } from '../utils/formatters';
import { getAnnualIncomeByCategory } from '../services/incomeApi';
import { createLogger } from '../utils/logger';

const logger = createLogger('AnnualSummary');

const AnnualSummary = ({ year }) => {
  const [summary, setSummary] = useState(null);
  const [previousYearSummary, setPreviousYearSummary] = useState(null);
  const [incomeByCategory, setIncomeByCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Collapsible section states
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [paymentMethodOpen, setPaymentMethodOpen] = useState(false);
  const [yoyOpen, setYoyOpen] = useState(true);

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

  // Memoize net balance line graph data
  const netBalanceData = useMemo(() => {
    if (!summary || !summary.monthlyTotals || summary.monthlyTotals.length === 0) {
      return null;
    }
    
    const balances = summary.monthlyTotals.map(m => ({
      month: m.month,
      income: m.income || 0,
      expenses: m.total || 0,
      netBalance: (m.income || 0) - (m.total || 0)
    }));
    
    const maxBalance = Math.max(...balances.map(b => Math.abs(b.netBalance)));
    
    return { balances, maxBalance };
  }, [summary]);

  // Memoize top category calculation
  const topCategory = useMemo(() => {
    if (!summary || !summary.byCategory || Object.keys(summary.byCategory).length === 0) {
      return null;
    }
    
    const entries = Object.entries(summary.byCategory);
    const [name, amount] = entries.reduce((max, current) => 
      current[1] > max[1] ? current : max
    , entries[0]);
    
    const percentage = summary.totalExpenses > 0 
      ? ((amount / summary.totalExpenses) * 100).toFixed(1)
      : 0;
    
    return { name, amount, percentage };
  }, [summary]);

  // Memoize year-over-year comparison with YTD support
  const yoyComparison = useMemo(() => {
    if (!summary || !previousYearSummary) {
      return null;
    }

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const isCurrentYear = year === currentYear;
    
    // For current year, use YTD (months 1 through current month)
    // For past years, use full year data
    const compareMonth = isCurrentYear ? currentMonth : 12;

    // Helper to sum monthly totals up to a specific month
    const sumMonthlyTotals = (monthlyTotals, maxMonth) => {
      if (!monthlyTotals || monthlyTotals.length === 0) {
        return { income: 0, expenses: 0, fixedExpenses: 0, variableExpenses: 0 };
      }
      return monthlyTotals
        .filter(m => m.month <= maxMonth)
        .reduce((acc, m) => ({
          income: acc.income + (m.income || 0),
          expenses: acc.expenses + (m.total || 0),
          fixedExpenses: acc.fixedExpenses + (m.fixedExpenses || 0),
          variableExpenses: acc.variableExpenses + (m.variableExpenses || 0)
        }), { income: 0, expenses: 0, fixedExpenses: 0, variableExpenses: 0 });
    };

    // Calculate YTD totals for both years
    const currentTotals = sumMonthlyTotals(summary.monthlyTotals, compareMonth);
    const prevTotals = sumMonthlyTotals(previousYearSummary.monthlyTotals, compareMonth);

    const calcChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const currentIncome = currentTotals.income;
    const prevIncome = prevTotals.income;
    const currentExpenses = currentTotals.expenses;
    const prevExpenses = prevTotals.expenses;
    const currentNetIncome = currentIncome - currentExpenses;
    const prevNetIncome = prevIncome - prevExpenses;
    const currentSavingsRate = currentIncome > 0 ? (currentNetIncome / currentIncome) * 100 : 0;
    const prevSavingsRate = prevIncome > 0 ? (prevNetIncome / prevIncome) * 100 : 0;

    return {
      income: {
        current: currentIncome,
        previous: prevIncome,
        change: calcChange(currentIncome, prevIncome),
        diff: currentIncome - prevIncome
      },
      expenses: {
        current: currentExpenses,
        previous: prevExpenses,
        change: calcChange(currentExpenses, prevExpenses),
        diff: currentExpenses - prevExpenses
      },
      savingsRate: {
        current: currentSavingsRate,
        previous: prevSavingsRate,
        change: currentSavingsRate - prevSavingsRate
      },
      netWorth: {
        current: summary.netWorth || 0,
        previous: previousYearSummary.netWorth || 0,
        diff: (summary.netWorth || 0) - (previousYearSummary.netWorth || 0)
      },
      hasPreviousData: prevIncome > 0 || prevExpenses > 0,
      isYTD: isCurrentYear,
      compareMonth: compareMonth
    };
  }, [summary, previousYearSummary, year]);

  const fetchAnnualSummary = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch current year and previous year in parallel
      const [currentResponse, previousResponse] = await Promise.all([
        fetch(`/api/expenses/annual-summary?year=${year}`),
        fetch(`/api/expenses/annual-summary?year=${year - 1}`)
      ]);
      
      if (!currentResponse.ok) {
        throw new Error('Failed to fetch annual summary');
      }

      const data = await currentResponse.json();
      setSummary(data);

      // Previous year data is optional - don't fail if it doesn't exist
      if (previousResponse.ok) {
        const prevData = await previousResponse.json();
        setPreviousYearSummary(prevData);
      } else {
        setPreviousYearSummary(null);
      }

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

        <div className="summary-card">
          <h3>Savings Rate</h3>
          <div className={`big-number ${(summary.totalIncome || 0) > 0 && summary.netIncome > 0 ? 'positive' : (summary.totalIncome || 0) > 0 && summary.netIncome < 0 ? 'negative' : 'neutral'}`}>
            {(summary.totalIncome || 0) > 0 
              ? `${((summary.netIncome / summary.totalIncome) * 100).toFixed(1)}%`
              : 'N/A'}
          </div>
          <div className="sub-text">
            {(summary.totalIncome || 0) > 0 
              ? summary.netIncome >= 0 ? 'Of income saved' : 'Overspent'
              : 'No income recorded'}
          </div>
        </div>

        <div className="summary-card">
          <h3>Transactions</h3>
          <div className="big-number">{summary.transactionCount || 0}</div>
          <div className="sub-text">
            {(summary.transactionCount || 0) > 0 && summary.totalVariableExpenses > 0
              ? `Avg $${formatAmount(summary.totalVariableExpenses / summary.transactionCount)}`
              : 'Variable expenses'}
          </div>
        </div>

        {topCategory && (
          <div className="summary-card top-category-card">
            <h3>Top Category</h3>
            <div className="big-number">{topCategory.name}</div>
            <div className="sub-text">
              ${formatAmount(topCategory.amount)} ({topCategory.percentage}%)
            </div>
          </div>
        )}

        <div className="summary-card">
          <h3>Daily Spend</h3>
          <div className="big-number">
            ${formatAmount(
              (summary.totalVariableExpenses || 0) > 0
                ? (summary.totalVariableExpenses / (year === new Date().getFullYear() 
                    ? Math.floor((new Date() - new Date(year, 0, 1)) / (1000 * 60 * 60 * 24)) + 1
                    : 365))
                : 0
            )}
          </div>
          <div className="sub-text">Avg variable/day</div>
        </div>

        <div className="summary-card tax-deductible-card">
          <h3>Tax Deductible</h3>
          <div className="big-number positive">
            ${formatAmount(
              (summary.byCategory?.['Tax - Medical'] || 0) + 
              (summary.byCategory?.['Tax - Donation'] || 0)
            )}
          </div>
          <div className="sub-text">
            Medical + Donations
          </div>
        </div>
      </div>

      {/* Year-over-Year Comparison */}
      {yoyComparison && yoyComparison.hasPreviousData && (
        <div className="summary-section collapsible-section yoy-section">
          <div 
            className="section-header-collapsible" 
            onClick={() => setYoyOpen(!yoyOpen)}
          >
            <h3>
              📈 {yoyComparison.isYTD ? 'YTD' : 'Year-over-Year'} Comparison ({year - 1} → {year})
              {yoyComparison.isYTD && (
                <span className="yoy-period-badge">Jan-{getMonthNameShort(yoyComparison.compareMonth)}</span>
              )}
            </h3>
            <span className="collapse-toggle">{yoyOpen ? '▼' : '▶'}</span>
          </div>
          {yoyOpen && (
            <div className="yoy-grid">
              <div className="yoy-card">
                <div className="yoy-label">Income</div>
                <div className="yoy-values">
                  <span className="yoy-previous">${formatAmount(yoyComparison.income.previous)}</span>
                  <span className="yoy-arrow">→</span>
                  <span className="yoy-current">${formatAmount(yoyComparison.income.current)}</span>
                </div>
                <div className={`yoy-change ${yoyComparison.income.change >= 0 ? 'positive' : 'negative'}`}>
                  <span className="yoy-indicator">{yoyComparison.income.change >= 0 ? '▲' : '▼'}</span>
                  {Math.abs(yoyComparison.income.change).toFixed(1)}%
                  <span className="yoy-diff">
                    ({yoyComparison.income.diff >= 0 ? '+' : '-'}${formatAmount(Math.abs(yoyComparison.income.diff))})
                  </span>
                </div>
              </div>

              <div className="yoy-card">
                <div className="yoy-label">Expenses</div>
                <div className="yoy-values">
                  <span className="yoy-previous">${formatAmount(yoyComparison.expenses.previous)}</span>
                  <span className="yoy-arrow">→</span>
                  <span className="yoy-current">${formatAmount(yoyComparison.expenses.current)}</span>
                </div>
                <div className={`yoy-change ${yoyComparison.expenses.change <= 0 ? 'positive' : 'negative'}`}>
                  <span className="yoy-indicator">{yoyComparison.expenses.change >= 0 ? '▲' : '▼'}</span>
                  {Math.abs(yoyComparison.expenses.change).toFixed(1)}%
                  <span className="yoy-diff">
                    ({yoyComparison.expenses.diff >= 0 ? '+' : '-'}${formatAmount(Math.abs(yoyComparison.expenses.diff))})
                  </span>
                </div>
              </div>

              <div className="yoy-card">
                <div className="yoy-label">Savings Rate</div>
                <div className="yoy-values">
                  <span className="yoy-previous">{yoyComparison.savingsRate.previous.toFixed(1)}%</span>
                  <span className="yoy-arrow">→</span>
                  <span className="yoy-current">{yoyComparison.savingsRate.current.toFixed(1)}%</span>
                </div>
                <div className={`yoy-change ${yoyComparison.savingsRate.change >= 0 ? 'positive' : 'negative'}`}>
                  <span className="yoy-indicator">{yoyComparison.savingsRate.change >= 0 ? '▲' : '▼'}</span>
                  {Math.abs(yoyComparison.savingsRate.change).toFixed(1)} pts
                </div>
              </div>

              <div className="yoy-card">
                <div className="yoy-label">Net Worth</div>
                <div className="yoy-values">
                  <span className="yoy-previous">${formatAmount(yoyComparison.netWorth.previous)}</span>
                  <span className="yoy-arrow">→</span>
                  <span className="yoy-current">${formatAmount(yoyComparison.netWorth.current)}</span>
                </div>
                <div className={`yoy-change ${yoyComparison.netWorth.diff >= 0 ? 'positive' : 'negative'}`}>
                  <span className="yoy-indicator">{yoyComparison.netWorth.diff >= 0 ? '▲' : '▼'}</span>
                  {yoyComparison.netWorth.diff >= 0 ? '+' : '-'}${formatAmount(Math.abs(yoyComparison.netWorth.diff))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Income by Category Section */}
      {incomeByCategory && incomeByCategory.byCategory && Object.keys(incomeByCategory.byCategory).length > 0 && (
        <div className="summary-section">
          <h3>Income by Category</h3>
          <div className="category-grid income-category-grid">
            {Object.entries(incomeByCategory.byCategory).map(([category, total]) => (
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

      {/* Net Balance Line Graph */}
      {netBalanceData && netBalanceData.balances.length > 0 && (
        <div className="summary-section">
          <h3>Monthly Net Balance</h3>
          <div className="net-balance-legend">
            <div className="legend-item">
              <div className="legend-color surplus-color"></div>
              <span>Surplus (Income &gt; Expenses)</span>
            </div>
            <div className="legend-item">
              <div className="legend-color deficit-color"></div>
              <span>Deficit (Expenses &gt; Income)</span>
            </div>
          </div>
          <div className="net-balance-chart">
            <div className="chart-area">
              {/* Zero line */}
              <div className="zero-line"></div>
              
              {/* Data points and lines */}
              <svg className="line-graph" viewBox="0 0 100 60" preserveAspectRatio="none">
                {/* Draw the line path */}
                <path
                  className="balance-line"
                  d={netBalanceData.balances.map((b, i) => {
                    const x = (i / (netBalanceData.balances.length - 1 || 1)) * 100;
                    const y = netBalanceData.maxBalance > 0 
                      ? 30 - (b.netBalance / netBalanceData.maxBalance) * 25
                      : 30;
                    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                  }).join(' ')}
                  fill="none"
                  stroke="url(#balanceGradient)"
                  strokeWidth="0.8"
                />
                
                {/* Gradient definition */}
                <defs>
                  <linearGradient id="balanceGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    {netBalanceData.balances.map((b, i) => (
                      <stop 
                        key={i}
                        offset={`${(i / (netBalanceData.balances.length - 1 || 1)) * 100}%`}
                        stopColor={b.netBalance >= 0 ? '#22c55e' : '#ef4444'}
                      />
                    ))}
                  </linearGradient>
                </defs>
                
                {/* Data points */}
                {netBalanceData.balances.map((b, i) => {
                  const x = (i / (netBalanceData.balances.length - 1 || 1)) * 100;
                  const y = netBalanceData.maxBalance > 0 
                    ? 30 - (b.netBalance / netBalanceData.maxBalance) * 25
                    : 30;
                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r="1.5"
                      className={`data-point ${b.netBalance >= 0 ? 'surplus' : 'deficit'}`}
                    />
                  );
                })}
              </svg>
              
              {/* Month labels and values */}
              <div className="chart-labels">
                {netBalanceData.balances.map((b, i) => (
                  <div key={i} className="chart-label-item">
                    <span className="chart-month">{getMonthNameShort(b.month)}</span>
                    <span className={`chart-value ${b.netBalance >= 0 ? 'positive' : 'negative'}`}>
                      {b.netBalance >= 0 ? '+' : '-'}${formatAmount(Math.abs(b.netBalance))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {summary.byCategory && Object.keys(summary.byCategory).length > 0 && (
        <div className="summary-section collapsible-section">
          <div 
            className="section-header-collapsible" 
            onClick={() => setCategoryOpen(!categoryOpen)}
          >
            <h3>By Category</h3>
            <span className="collapse-toggle">{categoryOpen ? '▼' : '▶'}</span>
          </div>
          {categoryOpen && (
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
          )}
        </div>
      )}

      {summary.byMethod && Object.keys(summary.byMethod).length > 0 && (
        <div className="summary-section collapsible-section">
          <div 
            className="section-header-collapsible" 
            onClick={() => setPaymentMethodOpen(!paymentMethodOpen)}
          >
            <h3>By Payment Method</h3>
            <span className="collapse-toggle">{paymentMethodOpen ? '▼' : '▶'}</span>
          </div>
          {paymentMethodOpen && (
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
          )}
        </div>
      )}
    </div>
  );
};

export default AnnualSummary;
