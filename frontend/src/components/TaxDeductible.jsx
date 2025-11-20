import { useState, useEffect, useMemo } from 'react';
import './TaxDeductible.css';
import { formatAmount, formatLocalDate, getMonthNameShort } from '../utils/formatters';

const TaxDeductible = ({ year }) => {
  const [taxDeductible, setTaxDeductible] = useState(null);
  const [loading, setLoading] = useState(true);
  const [medicalExpanded, setMedicalExpanded] = useState(false);
  const [donationsExpanded, setDonationsExpanded] = useState(false);

  useEffect(() => {
    fetchTaxDeductibleData();
  }, [year]);

  const fetchTaxDeductibleData = async () => {
    setLoading(true);

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
      setLoading(false);
    }
  };

  const formatDate = formatLocalDate;

  // Memoize expensive chart calculations
  const chartData = useMemo(() => {
    if (!taxDeductible || !taxDeductible.monthlyBreakdown || taxDeductible.monthlyBreakdown.length === 0) {
      return null;
    }
    
    const highestMonthTotal = Math.max(
      ...taxDeductible.monthlyBreakdown.map(m => m.total), 
      1
    );
    
    return { highestMonthTotal };
  }, [taxDeductible]);

  if (loading) {
    return (
      <div className="tax-deductible">
        <h2>💰 Tax Deductible Expenses {year}</h2>
        <div className="loading-message">Loading tax deductible data...</div>
      </div>
    );
  }

  return (
    <div className="tax-deductible">
      <h2>💰 Tax Deductible Expenses {year}</h2>

      {!taxDeductible || taxDeductible.totalDeductible === 0 ? (
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
              {chartData && taxDeductible.expenses && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((monthNum) => {
                // Calculate medical and donation totals for this month
                const medicalExpenses = (taxDeductible.expenses.medical || []).filter(exp => {
                  const expMonth = parseInt(exp.date.substring(5, 7));
                  return expMonth === monthNum;
                });
                const donationExpenses = (taxDeductible.expenses.donations || []).filter(exp => {
                  const expMonth = parseInt(exp.date.substring(5, 7));
                  return expMonth === monthNum;
                });
                
                const medicalTotal = medicalExpenses.reduce((sum, exp) => sum + exp.amount, 0);
                const donationTotal = donationExpenses.reduce((sum, exp) => sum + exp.amount, 0);
                const monthTotal = medicalTotal + donationTotal;
                
                // Use memoized highest month total for performance
                const { highestMonthTotal } = chartData;
                const medicalWidth = highestMonthTotal > 0 ? (medicalTotal / highestMonthTotal) * 100 : 0;
                const donationWidth = highestMonthTotal > 0 ? (donationTotal / highestMonthTotal) * 100 : 0;

                return (
                  <div key={monthNum} className="month-bar-container">
                    <div className="month-label">{getMonthNameShort(monthNum)}</div>
                    <div className="bar-wrapper">
                      {medicalTotal > 0 && (
                        <div 
                          className="month-bar tax-medical-bar" 
                          style={{ 
                            width: `${medicalWidth}%` 
                          }}
                          title={`Medical: ${formatAmount(medicalTotal)}`}
                        >
                          <span className="bar-value">${formatAmount(medicalTotal)}</span>
                        </div>
                      )}
                      {donationTotal > 0 && (
                        <div 
                          className="month-bar tax-donation-bar" 
                          style={{ 
                            width: `${donationWidth}%`,
                            marginLeft: medicalTotal > 0 ? '2px' : '0'
                          }}
                          title={`Donations: ${formatAmount(donationTotal)}`}
                        >
                          <span className="bar-value">${formatAmount(donationTotal)}</span>
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
  );
};

export default TaxDeductible;
