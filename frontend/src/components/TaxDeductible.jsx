import { useState, useEffect, useMemo, useCallback } from 'react';
import './TaxDeductible.css';
import { formatAmount, formatLocalDate, getMonthNameShort } from '../utils/formatters';
import { getPeople } from '../services/peopleApi';
import { updateExpense } from '../services/expenseApi';

const TaxDeductible = ({ year, refreshTrigger }) => {
  const [taxDeductible, setTaxDeductible] = useState(null);
  const [loading, setLoading] = useState(true);
  const [medicalExpanded, setMedicalExpanded] = useState(false);
  const [donationsExpanded, setDonationsExpanded] = useState(false);
  
  // Person grouping state
  const [groupByPerson, setGroupByPerson] = useState(false);
  const [expandedPersons, setExpandedPersons] = useState({});
  const [unassignedExpanded, setUnassignedExpanded] = useState(false);
  
  // Quick assign state
  const [people, setPeople] = useState([]);
  const [assigningExpenseId, setAssigningExpenseId] = useState(null);
  const [assignError, setAssignError] = useState(null);

  useEffect(() => {
    fetchTaxDeductibleData();
  }, [year, groupByPerson, refreshTrigger]);

  useEffect(() => {
    // Fetch people list for quick assign functionality
    const fetchPeopleData = async () => {
      try {
        const peopleData = await getPeople();
        setPeople(peopleData);
      } catch (err) {
        console.error('Error fetching people:', err);
      }
    };
    fetchPeopleData();
  }, [refreshTrigger]);

  // Listen for peopleUpdated event to refresh people list
  useEffect(() => {
    const handlePeopleUpdated = () => {
      // Refresh people list and tax data
      const refreshData = async () => {
        try {
          const peopleData = await getPeople();
          setPeople(peopleData);
          await fetchTaxDeductibleData();
        } catch (err) {
          console.error('Error refreshing data after people update:', err);
        }
      };
      refreshData();
    };

    window.addEventListener('peopleUpdated', handlePeopleUpdated);
    
    return () => {
      window.removeEventListener('peopleUpdated', handlePeopleUpdated);
    };
  }, [year, groupByPerson]);

  const fetchTaxDeductibleData = async () => {
    setLoading(true);

    try {
      let url = `/api/expenses/tax-deductible?year=${year}`;
      if (groupByPerson) {
        url += '&groupByPerson=true';
      }
      
      const response = await fetch(url);
      
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

  const togglePersonExpanded = useCallback((personId) => {
    setExpandedPersons(prev => ({
      ...prev,
      [personId]: !prev[personId]
    }));
  }, []);

  const handleQuickAssign = useCallback(async (expenseId, personId) => {
    if (!personId) return;
    
    setAssigningExpenseId(expenseId);
    setAssignError(null);
    
    try {
      // Find the expense to get its details
      const expense = taxDeductible?.unassignedExpenses?.providers
        ?.flatMap(p => p.expenses)
        ?.find(e => e.id === expenseId);
      
      if (!expense) {
        throw new Error('Expense not found');
      }
      
      // Update the expense with the person allocation (full amount to single person)
      await updateExpense(expenseId, {
        date: expense.date,
        place: expense.place,
        notes: expense.notes,
        amount: expense.amount,
        type: expense.type,
        method: expense.method
      }, [{ personId: parseInt(personId), amount: expense.amount }]);
      
      // Refresh the data
      await fetchTaxDeductibleData();
      
      // Dispatch event to notify other components (expense list) of the update
      window.dispatchEvent(new CustomEvent('expensesUpdated'));
    } catch (err) {
      console.error('Error assigning person to expense:', err);
      setAssignError(`Failed to assign: ${err.message}`);
    } finally {
      setAssigningExpenseId(null);
    }
  }, [taxDeductible, year, groupByPerson]);

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

          {/* Person Grouping Toggle - Only for Medical Expenses */}
          {taxDeductible.medicalTotal > 0 && (
            <div className="person-grouping-toggle">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={groupByPerson}
                  onChange={(e) => setGroupByPerson(e.target.checked)}
                />
                <span className="toggle-text">Group Medical Expenses by Person</span>
              </label>
            </div>
          )}

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
            {/* Person-Grouped Medical Expenses View */}
            {groupByPerson && taxDeductible.groupedByPerson && (
              <>
                {/* Person Groups */}
                {Object.values(taxDeductible.groupedByPerson).map((personGroup) => (
                  <div key={personGroup.personId} className="person-group">
                    <div 
                      className="person-group-header"
                      onClick={() => togglePersonExpanded(personGroup.personId)}
                    >
                      <h4 className="person-name">
                        👤 {personGroup.personName}
                      </h4>
                      <div className="person-total">${formatAmount(personGroup.total)}</div>
                      <button className="collapse-toggle" aria-label={expandedPersons[personGroup.personId] ? "Collapse" : "Expand"}>
                        {expandedPersons[personGroup.personId] ? '▲' : '▼'}
                      </button>
                    </div>
                    {expandedPersons[personGroup.personId] && (
                      <div className="person-providers">
                        {personGroup.providers.map((provider) => (
                          <div key={provider.providerName} className="provider-group">
                            <div className="provider-header">
                              <span className="provider-name">🏥 {provider.providerName}</span>
                              <span className="provider-total">${formatAmount(provider.total)}</span>
                            </div>
                            <div className="provider-expenses">
                              {provider.expenses.map((expense) => (
                                <div key={expense.id} className="tax-expense-item">
                                  <div className="tax-expense-date">
                                    {formatDate(expense.date)}
                                  </div>
                                  <div className="tax-expense-details">
                                    {expense.notes && (
                                      <div className="tax-expense-notes">{expense.notes}</div>
                                    )}
                                  </div>
                                  <div className="tax-expense-amount">${formatAmount(expense.allocatedAmount)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Unassigned Medical Expenses Section */}
                {taxDeductible.unassignedExpenses && taxDeductible.unassignedExpenses.count > 0 && (
                  <div className="unassigned-section">
                    <div 
                      className="unassigned-header"
                      onClick={() => setUnassignedExpanded(!unassignedExpanded)}
                    >
                      <h4 className="unassigned-title">
                        ⚠️ Unassigned Medical Expenses ({taxDeductible.unassignedExpenses.count} items)
                      </h4>
                      <div className="unassigned-total">${formatAmount(taxDeductible.unassignedExpenses.total)}</div>
                      <button className="collapse-toggle" aria-label={unassignedExpanded ? "Collapse" : "Expand"}>
                        {unassignedExpanded ? '▲' : '▼'}
                      </button>
                    </div>
                    {unassignedExpanded && (
                      <div className="unassigned-expenses">
                        {assignError && (
                          <div className="assign-error">{assignError}</div>
                        )}
                        {taxDeductible.unassignedExpenses.providers.map((provider) => (
                          <div key={provider.providerName} className="provider-group unassigned-provider">
                            <div className="provider-header">
                              <span className="provider-name">🏥 {provider.providerName}</span>
                              <span className="provider-total">${formatAmount(provider.total)}</span>
                            </div>
                            <div className="provider-expenses">
                              {provider.expenses.map((expense) => (
                                <div key={expense.id} className="tax-expense-item unassigned-expense">
                                  <div className="tax-expense-date">
                                    {formatDate(expense.date)}
                                  </div>
                                  <div className="tax-expense-details">
                                    {expense.notes && (
                                      <div className="tax-expense-notes">{expense.notes}</div>
                                    )}
                                  </div>
                                  <div className="tax-expense-amount">${formatAmount(expense.amount)}</div>
                                  <div className="quick-assign">
                                    <select
                                      className="quick-assign-select"
                                      onChange={(e) => handleQuickAssign(expense.id, e.target.value)}
                                      disabled={assigningExpenseId === expense.id}
                                      defaultValue=""
                                    >
                                      <option value="" disabled>Assign to...</option>
                                      {people.map((person) => (
                                        <option key={person.id} value={person.id}>
                                          {person.name}
                                        </option>
                                      ))}
                                    </select>
                                    {assigningExpenseId === expense.id && (
                                      <span className="assigning-indicator">...</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Standard Medical Expenses Section (when not grouped by person) */}
            {!groupByPerson && taxDeductible.expenses.medical && taxDeductible.expenses.medical.length > 0 && (
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
