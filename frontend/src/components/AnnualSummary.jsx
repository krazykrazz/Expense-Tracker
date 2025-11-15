import { useState, useEffect } from 'react';
import './AnnualSummary.css';

const AnnualSummary = ({ year }) => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [taxDeductible, setTaxDeductible] = useState(null);
  const [taxLoading, setTaxLoading] = useState(true);
  const [medicalExpanded, setMedicalExpanded] = useState(false);
  const [donationsExpanded, setDonationsExpanded] = useState(false);

  useEffect(() => {
    fetchAnnualSummary();
    fetchTaxDeductibleData();
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

  const fetchTaxDeductibleData = async () => {
    setTaxLoading(true);

    try {
      const response = await fetch(`/api/expenses/tax-deductible?year=${year}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch tax deductible data');
      }

      const data = await response.json();
      setTaxDeductible(data);
    } catch (err) {
      console.error('Error fetching tax deductible data:', err);
      setTaxDeductible(null);
    } finally {
      setTaxLoading(false);
    }
  };

  const formatAmount = (amount) => {
    return parseFloat(amount || 0).toFixed(2);
  };

  const getMonthName = (monthNum) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[monthNum - 1];
  };

  const formatDate = (dateString) => {
    // Parse date string (YYYY-MM-DD) to avoid timezone issues
    const [year, month, day] = dateString.split('-');
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
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

      {/* Tax Deductible Expenses Section */}
      <div className="summary-section tax-deductible-section">
        <h3>💰 Tax Deductible Expenses</h3>
        
        {taxLoading ? (
          <div className="loading-message">Loading tax deductible data...</div>
        ) : !taxDeductible || taxDeductible.totalDeductible === 0 ? (
          <div className="empty-state">No tax-deductible expenses found for {year}</div>
        ) : (
          <>
            <div className="tax-summary-cards">
              <div className="summary-card tax-card">
                <h3>Total Deductible</h3>
                <div className="big-number">${formatAmount(taxDeductible.totalDeductible)}</div>
              </div>

              <div className="summary-card tax-card">
                <h3>Medical</h3>
                <div className="big-number">${formatAmount(taxDeductible.medicalTotal)}</div>
              </div>

              <div className="summary-card tax-card">
                <h3>Donations</h3>
                <div className="big-number">${formatAmount(taxDeductible.donationTotal)}</div>
              </div>
            </div>

            {/* Monthly Breakdown for Tax Deductible Expenses */}
            <div className="tax-monthly-breakdown">
              <h4>Monthly Breakdown</h4>
              <div className="tax-legend">
                <div className="legend-item">
                  <div className="legend-color medical-color"></div>
                  <span>Medical</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color donation-color"></div>
                  <span>Donations</span>
                </div>
              </div>
              <div className="monthly-chart">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((monthNum) => {
                  // Calculate medical and donation totals for this month
                  const medicalExpenses = taxDeductible.expenses.medical.filter(exp => {
                    const expMonth = parseInt(exp.date.substring(5, 7));
                    return expMonth === monthNum;
                  });
                  const donationExpenses = taxDeductible.expenses.donations.filter(exp => {
                    const expMonth = parseInt(exp.date.substring(5, 7));
                    return expMonth === monthNum;
                  });
                  
                  const medicalTotal = medicalExpenses.reduce((sum, exp) => sum + exp.amount, 0);
                  const donationTotal = donationExpenses.reduce((sum, exp) => sum + exp.amount, 0);
                  const monthTotal = medicalTotal + donationTotal;
                  
                  const highestMonthTotal = Math.max(...taxDeductible.monthlyBreakdown.map(m => m.total), 1);
                  const medicalWidth = highestMonthTotal > 0 ? (medicalTotal / highestMonthTotal) * 100 : 0;
                  const donationWidth = highestMonthTotal > 0 ? (donationTotal / highestMonthTotal) * 100 : 0;

                  return (
                    <div key={monthNum} className="month-bar-container">
                      <div className="month-label">{getMonthName(monthNum)}</div>
                      <div className="bar-wrapper">
                        {medicalTotal > 0 && (
                          <div 
                            className="month-bar tax-medical-bar" 
                            style={{ 
                              width: `${medicalWidth}%` 
                            }}
                            title={`Medical: $${formatAmount(medicalTotal)}`}
                          >
                            {medicalTotal >= 50 && <span className="bar-value">${formatAmount(medicalTotal)}</span>}
                          </div>
                        )}
                        {donationTotal > 0 && (
                          <div 
                            className="month-bar tax-donation-bar" 
                            style={{ 
                              width: `${donationWidth}%`,
                              marginLeft: medicalTotal > 0 ? '2px' : '0'
                            }}
                            title={`Donations: $${formatAmount(donationTotal)}`}
                          >
                            {donationTotal >= 50 && <span className="bar-value">${formatAmount(donationTotal)}</span>}
                          </div>
                        )}
                        {monthTotal === 0 && (
                          <div className="empty-bar">
                            <span className="bar-value">$0.00</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detailed Expense Lists */}
            <div className="tax-details">
              {/* Medical Expenses Section */}
              {taxDeductible.expenses.medical && taxDeductible.expenses.medical.length > 0 && (
                <div className="tax-category">
                  <div 
                    className="tax-category-header-collapsible"
                    onClick={() => setMedicalExpanded(!medicalExpanded)}
                  >
                    <h4 className="tax-category-header">
                      🏥 Medical Expenses ({taxDeductible.expenses.medical.length} items - ${formatAmount(taxDeductible.medicalTotal)})
                    </h4>
                    <button className="collapse-toggle" aria-label={medicalExpanded ? "Collapse" : "Expand"}>
                      {medicalExpanded ? '▲' : '▼'}
                    </button>
                  </div>
                  {medicalExpanded && (
                    <div className="tax-expense-list">
                      {taxDeductible.expenses.medical.map((expense) => (
                        <div key={expense.id} className="tax-expense-item">
                          <div className="tax-expense-date">
                            {formatDate(expense.date)}
                          </div>
                          <div className="tax-expense-details">
                            <div className="tax-expense-place">{expense.place}</div>
                            {expense.notes && (
                              <div className="tax-expense-notes">{expense.notes}</div>
                            )}
                          </div>
                          <div className="tax-expense-amount">${formatAmount(expense.amount)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Donations Section */}
              {taxDeductible.expenses.donations && taxDeductible.expenses.donations.length > 0 && (
                <div className="tax-category">
                  <div 
                    className="tax-category-header-collapsible"
                    onClick={() => setDonationsExpanded(!donationsExpanded)}
                  >
                    <h4 className="tax-category-header">
                      ❤️ Donations ({taxDeductible.expenses.donations.length} items - ${formatAmount(taxDeductible.donationTotal)})
                    </h4>
                    <button className="collapse-toggle" aria-label={donationsExpanded ? "Collapse" : "Expand"}>
                      {donationsExpanded ? '▲' : '▼'}
                    </button>
                  </div>
                  {donationsExpanded && (
                    <div className="tax-expense-list">
                      {taxDeductible.expenses.donations.map((expense) => (
                        <div key={expense.id} className="tax-expense-item">
                          <div className="tax-expense-date">
                            {formatDate(expense.date)}
                          </div>
                          <div className="tax-expense-details">
                            <div className="tax-expense-place">{expense.place}</div>
                            {expense.notes && (
                              <div className="tax-expense-notes">{expense.notes}</div>
                            )}
                          </div>
                          <div className="tax-expense-amount">${formatAmount(expense.amount)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AnnualSummary;
