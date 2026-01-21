import { useState, useEffect, useMemo, useCallback } from 'react';
import './TaxDeductible.css';
import { formatAmount, formatLocalDate, getMonthNameShort } from '../utils/formatters';
import { getPeople } from '../services/peopleApi';
import { getExpenseWithPeople, updateExpense, updateInsuranceStatus } from '../services/expenseApi';
import { API_ENDPOINTS } from '../config';
import { PAYMENT_METHODS } from '../utils/constants';
import PersonAllocationModal from './PersonAllocationModal';
import InvoiceIndicator from './InvoiceIndicator';
import InvoiceList from './InvoiceList';
import InsuranceStatusIndicator from './InsuranceStatusIndicator';
import QuickStatusUpdate from './QuickStatusUpdate';
import { getInvoicesForExpense } from '../services/invoiceApi';

const TaxDeductible = ({ year, refreshTrigger }) => {
  const [taxDeductible, setTaxDeductible] = useState(null);
  const [loading, setLoading] = useState(true);
  const [medicalExpanded, setMedicalExpanded] = useState(false);
  const [donationsExpanded, setDonationsExpanded] = useState(false);
  
  // Person grouping state
  const [groupByPerson, setGroupByPerson] = useState(false);
  const [expandedPersons, setExpandedPersons] = useState({});
  const [unassignedExpanded, setUnassignedExpanded] = useState(false);
  
  // Invoice filtering state
  const [invoiceFilter, setInvoiceFilter] = useState('all'); // 'all', 'with-invoice', 'without-invoice'
  
  // Insurance claim status filter state
  const [claimStatusFilter, setClaimStatusFilter] = useState('all'); // 'all', 'not_claimed', 'in_progress', 'paid', 'denied'
  
  // Quick status update state
  const [quickStatusExpense, setQuickStatusExpense] = useState(null);
  
  // People and categories state
  const [people, setPeople] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editMessage, setEditMessage] = useState({ text: '', type: '' });
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [showPersonAllocation, setShowPersonAllocation] = useState(false);
  
  // Invoice modal state
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceModalExpense, setInvoiceModalExpense] = useState(null);
  const [invoiceModalInvoices, setInvoiceModalInvoices] = useState([]);

  useEffect(() => {
    fetchTaxDeductibleData();
  }, [year, groupByPerson, refreshTrigger]);

  useEffect(() => {
    // Fetch people list and categories
    const fetchPeopleData = async () => {
      try {
        const peopleData = await getPeople();
        setPeople(peopleData);
      } catch (err) {
        console.error('Error fetching people:', err);
      }
    };
    
    const fetchCategories = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.CATEGORIES);
        if (response.ok) {
          const data = await response.json();
          setCategories(data.categories || []);
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    
    fetchPeopleData();
    fetchCategories();
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

  // Edit modal handlers
  const handleEditClick = useCallback(async (expense) => {
    setExpenseToEdit(expense);
    const dateValue = expense.date.includes('T') ? expense.date.split('T')[0] : expense.date;
    setEditFormData({
      date: dateValue,
      place: expense.place || '',
      notes: expense.notes || '',
      amount: expense.amount.toString(),
      type: expense.type,
      method: expense.method || 'Debit'
    });
    
    // Load people assignments for medical expenses
    if (expense.type === 'Tax - Medical') {
      try {
        const expenseWithPeople = await getExpenseWithPeople(expense.id);
        if (expenseWithPeople.people && expenseWithPeople.people.length > 0) {
          setSelectedPeople(expenseWithPeople.people.map(p => ({
            id: p.personId,
            name: p.name,
            amount: p.amount
          })));
        } else {
          setSelectedPeople([]);
        }
      } catch (error) {
        console.error('Failed to load people for expense:', error);
        setSelectedPeople([]);
      }
    } else {
      setSelectedPeople([]);
    }
    
    setShowEditModal(true);
    setEditMessage({ text: '', type: '' });
  }, []);

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear people selection when changing away from medical expenses
    if (name === 'type' && value !== 'Tax - Medical') {
      setSelectedPeople([]);
    }
  };

  const handleEditPeopleChange = (e) => {
    const selectedOptions = Array.from(e.target.selectedOptions, option => ({
      id: parseInt(option.value),
      name: option.text
    }));
    setSelectedPeople(selectedOptions);
  };

  const handleEditPersonAllocation = (allocations) => {
    setShowPersonAllocation(false);
    setSelectedPeople(allocations);
  };

  const isEditingMedicalExpense = editFormData.type === 'Tax - Medical';

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditMessage({ text: '', type: '' });

    // For medical expenses with multiple people, show allocation modal if amounts not set
    if (isEditingMedicalExpense && selectedPeople.length > 1 && !selectedPeople[0].amount) {
      setShowPersonAllocation(true);
      return;
    }

    setIsSubmitting(true);

    try {
      const dateValue = editFormData.date.includes('T') ? editFormData.date.split('T')[0] : editFormData.date;
      
      // Prepare people allocations for medical expenses
      let peopleAllocations = null;
      if (isEditingMedicalExpense && selectedPeople.length > 0) {
        if (selectedPeople.length === 1) {
          peopleAllocations = [{
            personId: selectedPeople[0].id,
            amount: parseFloat(editFormData.amount)
          }];
        } else {
          peopleAllocations = selectedPeople.map(person => ({
            personId: person.id,
            amount: person.amount
          }));
        }
      } else if (isEditingMedicalExpense) {
        peopleAllocations = [];
      }

      await updateExpense(expenseToEdit.id, {
        date: dateValue,
        place: editFormData.place,
        notes: editFormData.notes,
        amount: parseFloat(editFormData.amount),
        type: editFormData.type,
        method: editFormData.method
      }, peopleAllocations);
      
      // Refresh the data
      await fetchTaxDeductibleData();
      
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('expensesUpdated'));
      
      setShowEditModal(false);
      setExpenseToEdit(null);
      setSelectedPeople([]);
    } catch (error) {
      console.error('Error updating expense:', error);
      setEditMessage({ text: error.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setShowEditModal(false);
    setExpenseToEdit(null);
    setEditFormData({});
    setEditMessage({ text: '', type: '' });
    setSelectedPeople([]);
  };

  // Invoice modal handlers
  const handleViewInvoices = useCallback(async (expense) => {
    setInvoiceModalExpense(expense);
    // Use invoices from expense if available, otherwise fetch them
    if (expense.invoices && expense.invoices.length > 0) {
      setInvoiceModalInvoices(expense.invoices);
    } else {
      try {
        const invoices = await getInvoicesForExpense(expense.id);
        setInvoiceModalInvoices(invoices);
      } catch (error) {
        console.error('Failed to fetch invoices:', error);
        setInvoiceModalInvoices([]);
      }
    }
    setShowInvoiceModal(true);
  }, []);

  const handleCloseInvoiceModal = useCallback(() => {
    setShowInvoiceModal(false);
    setInvoiceModalExpense(null);
    setInvoiceModalInvoices([]);
  }, []);

  const handleInvoiceDeleted = useCallback((invoiceId) => {
    // Update the invoices list in the modal
    setInvoiceModalInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
    // Refresh the tax data to update counts
    fetchTaxDeductibleData();
  }, []);

  const formatDate = formatLocalDate;

  // Filter expenses based on invoice status
  const filterExpensesByInvoice = useCallback((expenses) => {
    if (invoiceFilter === 'all') return expenses;
    if (invoiceFilter === 'with-invoice') return expenses.filter(exp => exp.hasInvoice);
    if (invoiceFilter === 'without-invoice') return expenses.filter(exp => !exp.hasInvoice);
    return expenses;
  }, [invoiceFilter]);

  // Filter expenses based on claim status (for medical expenses only)
  const filterExpensesByClaimStatus = useCallback((expenses) => {
    if (claimStatusFilter === 'all') return expenses;
    return expenses.filter(exp => {
      // Only filter insurance-eligible expenses
      if (!exp.insuranceEligible) {
        // Show non-eligible expenses when filtering for specific status? No, hide them
        return claimStatusFilter === 'all';
      }
      const status = exp.claimStatus || 'not_claimed';
      return status === claimStatusFilter;
    });
  }, [claimStatusFilter]);

  // Combined filter for medical expenses (invoice + claim status)
  const filterMedicalExpenses = useCallback((expenses) => {
    let filtered = filterExpensesByInvoice(expenses);
    filtered = filterExpensesByClaimStatus(filtered);
    return filtered;
  }, [filterExpensesByInvoice, filterExpensesByClaimStatus]);

  // Handle quick status update
  const handleQuickStatusClick = useCallback((expense, event) => {
    event.stopPropagation();
    setQuickStatusExpense(expense);
  }, []);

  // Handle status change from QuickStatusUpdate
  const handleStatusChange = useCallback(async (expenseId, newStatus) => {
    try {
      await updateInsuranceStatus(expenseId, newStatus);
      // Refresh the data
      await fetchTaxDeductibleData();
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('expensesUpdated'));
    } catch (error) {
      console.error('Error updating insurance status:', error);
    } finally {
      setQuickStatusExpense(null);
    }
  }, []);

  // Close quick status update
  const handleCloseQuickStatus = useCallback(() => {
    setQuickStatusExpense(null);
  }, []);

  // Calculate invoice coverage statistics
  const invoiceStats = useMemo(() => {
    if (!taxDeductible || !taxDeductible.expenses) {
      return { medicalWithInvoice: 0, medicalTotal: 0, donationsWithInvoice: 0, donationsTotal: 0, totalInvoices: 0 };
    }

    const medicalExpenses = taxDeductible.expenses.medical || [];
    const donationExpenses = taxDeductible.expenses.donations || [];

    const medicalWithInvoice = medicalExpenses.filter(exp => exp.hasInvoice).length;
    const donationsWithInvoice = donationExpenses.filter(exp => exp.hasInvoice).length;
    
    // Calculate total invoice count across all expenses
    const totalMedicalInvoices = medicalExpenses.reduce((sum, exp) => sum + (exp.invoiceCount || (exp.hasInvoice ? 1 : 0)), 0);
    const totalDonationInvoices = donationExpenses.reduce((sum, exp) => sum + (exp.invoiceCount || (exp.hasInvoice ? 1 : 0)), 0);

    return {
      medicalWithInvoice,
      medicalTotal: medicalExpenses.length,
      donationsWithInvoice,
      donationsTotal: donationExpenses.length,
      medicalCoverage: medicalExpenses.length > 0 ? Math.round((medicalWithInvoice / medicalExpenses.length) * 100) : 0,
      donationsCoverage: donationExpenses.length > 0 ? Math.round((donationsWithInvoice / donationExpenses.length) * 100) : 0,
      totalMedicalInvoices,
      totalDonationInvoices,
      totalInvoices: totalMedicalInvoices + totalDonationInvoices
    };
  }, [taxDeductible]);

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

          {/* Invoice Filter Controls */}
          <div className="invoice-filter-section">
            <div className="invoice-filter-controls">
              <label className="filter-label">Filter by Invoice Status:</label>
              <select 
                value={invoiceFilter} 
                onChange={(e) => setInvoiceFilter(e.target.value)}
                className="invoice-filter-select"
              >
                <option value="all">All Expenses</option>
                <option value="with-invoice">With Invoice</option>
                <option value="without-invoice">Without Invoice</option>
              </select>
            </div>

            {/* Invoice Coverage Statistics */}
            <div className="invoice-statistics">
              <div className="invoice-stat-card">
                <h4>Medical Invoice Coverage</h4>
                <div className="stat-content">
                  <span className="stat-number">{invoiceStats.medicalWithInvoice}/{invoiceStats.medicalTotal}</span>
                  <span className="stat-percentage">({invoiceStats.medicalCoverage}%)</span>
                </div>
                {invoiceStats.totalMedicalInvoices > 0 && (
                  <div className="stat-total-invoices">
                    {invoiceStats.totalMedicalInvoices} total invoice{invoiceStats.totalMedicalInvoices !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
              
              {invoiceStats.donationsTotal > 0 && (
                <div className="invoice-stat-card">
                  <h4>Donation Invoice Coverage</h4>
                  <div className="stat-content">
                    <span className="stat-number">{invoiceStats.donationsWithInvoice}/{invoiceStats.donationsTotal}</span>
                    <span className="stat-percentage">({invoiceStats.donationsCoverage}%)</span>
                  </div>
                  {invoiceStats.totalDonationInvoices > 0 && (
                    <div className="stat-total-invoices">
                      {invoiceStats.totalDonationInvoices} total invoice{invoiceStats.totalDonationInvoices !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Insurance Summary Section - Requirements 6.3, 6.4 */}
          {taxDeductible.insuranceSummary && taxDeductible.insuranceSummary.eligibleCount > 0 && (
            <div className="insurance-summary-section">
              <h4>🏥 Insurance Tracking Summary</h4>
              
              {/* Insurance Summary Cards */}
              <div className="insurance-summary-cards">
                <div className="insurance-summary-card original-cost">
                  <h5>Total Original Cost</h5>
                  <div className="summary-value">${formatAmount(taxDeductible.insuranceSummary.totalOriginalCost)}</div>
                </div>
                
                <div className="insurance-summary-card out-of-pocket">
                  <h5>Out-of-Pocket</h5>
                  <div className="summary-value">${formatAmount(taxDeductible.insuranceSummary.totalOutOfPocket)}</div>
                </div>
                
                <div className="insurance-summary-card reimbursement">
                  <h5>Total Reimbursement</h5>
                  <div className="summary-value">${formatAmount(taxDeductible.insuranceSummary.totalReimbursement)}</div>
                </div>
                
                <div className="insurance-summary-card eligible-count">
                  <h5>Eligible Expenses</h5>
                  <div className="summary-value">{taxDeductible.insuranceSummary.eligibleCount}</div>
                </div>
              </div>

              {/* Status Breakdown */}
              <div className="insurance-status-breakdown">
                <h5>Breakdown by Claim Status</h5>
                <div className="status-breakdown-grid">
                  <div className="status-breakdown-item">
                    <span className="status-icon">📋</span>
                    <div className="status-info">
                      <span className="status-label">Not Claimed</span>
                      <span className="status-count">{taxDeductible.insuranceSummary.byStatus.not_claimed.count} expenses</span>
                      <span className="status-amount">${formatAmount(taxDeductible.insuranceSummary.byStatus.not_claimed.originalCost)}</span>
                    </div>
                  </div>
                  
                  <div className="status-breakdown-item">
                    <span className="status-icon">⏳</span>
                    <div className="status-info">
                      <span className="status-label">In Progress</span>
                      <span className="status-count">{taxDeductible.insuranceSummary.byStatus.in_progress.count} expenses</span>
                      <span className="status-amount">${formatAmount(taxDeductible.insuranceSummary.byStatus.in_progress.originalCost)}</span>
                    </div>
                  </div>
                  
                  <div className="status-breakdown-item">
                    <span className="status-icon">✅</span>
                    <div className="status-info">
                      <span className="status-label">Paid</span>
                      <span className="status-count">{taxDeductible.insuranceSummary.byStatus.paid.count} expenses</span>
                      <span className="status-amount">${formatAmount(taxDeductible.insuranceSummary.byStatus.paid.originalCost)}</span>
                    </div>
                  </div>
                  
                  <div className="status-breakdown-item">
                    <span className="status-icon">❌</span>
                    <div className="status-info">
                      <span className="status-label">Denied</span>
                      <span className="status-count">{taxDeductible.insuranceSummary.byStatus.denied.count} expenses</span>
                      <span className="status-amount">${formatAmount(taxDeductible.insuranceSummary.byStatus.denied.originalCost)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Claim Status Filter - Requirement 6.5 */}
              <div className="claim-status-filter">
                <label className="filter-label">Filter by Claim Status:</label>
                <select 
                  value={claimStatusFilter} 
                  onChange={(e) => setClaimStatusFilter(e.target.value)}
                  className="claim-status-select"
                >
                  <option value="all">All Statuses</option>
                  <option value="not_claimed">📋 Not Claimed</option>
                  <option value="in_progress">⏳ In Progress</option>
                  <option value="paid">✅ Paid</option>
                  <option value="denied">❌ Denied</option>
                </select>
              </div>
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
                              {filterMedicalExpenses(provider.expenses).map((expense) => (
                                <div key={expense.id} className={`tax-expense-item ${expense.insuranceEligible ? 'insurance-eligible' : ''}`}>
                                  <div className="tax-expense-date">
                                    {formatDate(expense.date)}
                                  </div>
                                  <div className="tax-expense-details">
                                    {expense.notes && (
                                      <div className="tax-expense-notes">{expense.notes}</div>
                                    )}
                                  </div>
                                  {/* Insurance Status Indicator - Requirement 4.5 */}
                                  <div className="tax-expense-insurance">
                                    <InsuranceStatusIndicator
                                      insuranceEligible={expense.insuranceEligible}
                                      claimStatus={expense.claimStatus}
                                      originalCost={expense.originalCost}
                                      outOfPocket={expense.amount}
                                      size="small"
                                      showText={false}
                                      onClick={expense.insuranceEligible ? (e) => handleQuickStatusClick(expense, e) : undefined}
                                    />
                                  </div>
                                  {/* Original Cost per Person - Requirement 4.5 */}
                                  {expense.insuranceEligible && expense.originalAmount && (
                                    <div className="tax-expense-original-cost">
                                      <span className="cost-label">Orig:</span>
                                      <span className="cost-value">${formatAmount(expense.originalAmount)}</span>
                                    </div>
                                  )}
                                  {/* Out-of-Pocket Amount per Person */}
                                  <div className="tax-expense-amount">
                                    {expense.insuranceEligible && expense.originalAmount ? (
                                      <>
                                        <span className="amount-label">OOP:</span>
                                        <span className="amount-value">${formatAmount(expense.allocatedAmount)}</span>
                                      </>
                                    ) : (
                                      <>${formatAmount(expense.allocatedAmount)}</>
                                    )}
                                  </div>
                                  {/* Reimbursement per Person - Requirement 4.5 */}
                                  {expense.insuranceEligible && expense.originalAmount && expense.originalAmount > expense.allocatedAmount && (
                                    <div className="tax-expense-reimbursement">
                                      <span className="reimbursement-label">Reimb:</span>
                                      <span className="reimbursement-value">${formatAmount(expense.originalAmount - expense.allocatedAmount)}</span>
                                    </div>
                                  )}
                                  <div className="tax-expense-invoice">
                                    <InvoiceIndicator
                                      hasInvoice={expense.hasInvoice}
                                      invoiceInfo={expense.invoice}
                                      invoiceCount={expense.invoiceCount || 0}
                                      invoices={expense.invoices || []}
                                      expenseId={expense.id}
                                      size="small"
                                      alwaysShow={true}
                                      onClick={expense.hasInvoice ? () => handleViewInvoices(expense) : undefined}
                                    />
                                  </div>
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
                        {taxDeductible.unassignedExpenses.providers.map((provider) => (
                          <div key={provider.providerName} className="provider-group unassigned-provider">
                            <div className="provider-header">
                              <span className="provider-name">🏥 {provider.providerName}</span>
                              <span className="provider-total">${formatAmount(provider.total)}</span>
                            </div>
                            <div className="provider-expenses">
                              {filterMedicalExpenses(provider.expenses).map((expense) => (
                                <div key={expense.id} className={`tax-expense-item unassigned-expense ${expense.insuranceEligible ? 'insurance-eligible' : ''}`}>
                                  <div className="tax-expense-date">
                                    {formatDate(expense.date)}
                                  </div>
                                  <div className="tax-expense-details">
                                    {expense.notes && (
                                      <div className="tax-expense-notes">{expense.notes}</div>
                                    )}
                                  </div>
                                  {/* Insurance Status Indicator */}
                                  <div className="tax-expense-insurance">
                                    <InsuranceStatusIndicator
                                      insuranceEligible={expense.insuranceEligible}
                                      claimStatus={expense.claimStatus}
                                      originalCost={expense.originalCost}
                                      outOfPocket={expense.amount}
                                      size="small"
                                      showText={false}
                                      onClick={expense.insuranceEligible ? (e) => handleQuickStatusClick(expense, e) : undefined}
                                    />
                                  </div>
                                  {/* Original Cost */}
                                  {expense.insuranceEligible && expense.originalCost && (
                                    <div className="tax-expense-original-cost">
                                      <span className="cost-label">Orig:</span>
                                      <span className="cost-value">${formatAmount(expense.originalCost)}</span>
                                    </div>
                                  )}
                                  {/* Out-of-Pocket Amount */}
                                  <div className="tax-expense-amount">
                                    {expense.insuranceEligible && expense.originalCost ? (
                                      <>
                                        <span className="amount-label">OOP:</span>
                                        <span className="amount-value">${formatAmount(expense.amount)}</span>
                                      </>
                                    ) : (
                                      <>${formatAmount(expense.amount)}</>
                                    )}
                                  </div>
                                  <div className="tax-expense-invoice">
                                    <InvoiceIndicator
                                      hasInvoice={expense.hasInvoice}
                                      invoiceInfo={expense.invoice}
                                      invoiceCount={expense.invoiceCount || 0}
                                      invoices={expense.invoices || []}
                                      expenseId={expense.id}
                                      size="small"
                                      alwaysShow={true}
                                      onClick={expense.hasInvoice ? () => handleViewInvoices(expense) : undefined}
                                    />
                                  </div>
                                  <div className="expense-actions">
                                    <button
                                      className="edit-expense-btn"
                                      onClick={() => handleEditClick(expense)}
                                      title="Edit expense and assign people"
                                    >
                                      ✏️ Edit
                                    </button>
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
                    🏥 Medical Expenses ({filterMedicalExpenses(taxDeductible.expenses.medical).length} items - ${formatAmount(filterMedicalExpenses(taxDeductible.expenses.medical).reduce((sum, exp) => sum + exp.amount, 0))})
                    {invoiceFilter !== 'all' && (
                      <span className="filter-indicator"> - {invoiceFilter === 'with-invoice' ? 'With Invoice' : 'Without Invoice'}</span>
                    )}
                    {claimStatusFilter !== 'all' && (
                      <span className="filter-indicator"> - {claimStatusFilter.replace('_', ' ')}</span>
                    )}
                  </h4>
                  <button className="collapse-toggle" aria-label={medicalExpanded ? "Collapse" : "Expand"}>
                    {medicalExpanded ? '▲' : '▼'}
                  </button>
                </div>
                {medicalExpanded && (
                  <div className="tax-expense-list">
                    {filterMedicalExpenses(taxDeductible.expenses.medical).map((expense) => (
                      <div key={expense.id} className={`tax-expense-item ${expense.insuranceEligible ? 'insurance-eligible' : ''}`}>
                        <div className="tax-expense-date">
                          {formatDate(expense.date)}
                        </div>
                        <div className="tax-expense-details">
                          <div className="tax-expense-place">{expense.place}</div>
                          {expense.notes && (
                            <div className="tax-expense-notes">{expense.notes}</div>
                          )}
                        </div>
                        {/* Insurance Status Indicator - Requirements 6.1, 6.2 */}
                        <div className="tax-expense-insurance">
                          <InsuranceStatusIndicator
                            insuranceEligible={expense.insuranceEligible}
                            claimStatus={expense.claimStatus}
                            originalCost={expense.originalCost}
                            outOfPocket={expense.amount}
                            size="small"
                            showText={false}
                            onClick={expense.insuranceEligible ? (e) => handleQuickStatusClick(expense, e) : undefined}
                          />
                        </div>
                        {/* Original Cost Column - shown for insurance eligible expenses */}
                        {expense.insuranceEligible && expense.originalCost && (
                          <div className="tax-expense-original-cost">
                            <span className="cost-label">Orig:</span>
                            <span className="cost-value">${formatAmount(expense.originalCost)}</span>
                          </div>
                        )}
                        {/* Out-of-Pocket Amount */}
                        <div className="tax-expense-amount">
                          {expense.insuranceEligible && expense.originalCost ? (
                            <>
                              <span className="amount-label">OOP:</span>
                              <span className="amount-value">${formatAmount(expense.amount)}</span>
                            </>
                          ) : (
                            <>${formatAmount(expense.amount)}</>
                          )}
                        </div>
                        <div className="tax-expense-invoice">
                          <InvoiceIndicator
                            hasInvoice={expense.hasInvoice}
                            invoiceInfo={expense.invoice}
                            invoiceCount={expense.invoiceCount || 0}
                            invoices={expense.invoices || []}
                            expenseId={expense.id}
                            size="small"
                            alwaysShow={true}
                            onClick={expense.hasInvoice ? () => handleViewInvoices(expense) : undefined}
                          />
                        </div>
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
                    ❤️ Donations ({filterExpensesByInvoice(taxDeductible.expenses.donations).length} items - ${formatAmount(filterExpensesByInvoice(taxDeductible.expenses.donations).reduce((sum, exp) => sum + exp.amount, 0))})
                    {invoiceFilter !== 'all' && (
                      <span className="filter-indicator"> - {invoiceFilter === 'with-invoice' ? 'With Invoice' : 'Without Invoice'}</span>
                    )}
                  </h4>
                  <button className="collapse-toggle" aria-label={donationsExpanded ? "Collapse" : "Expand"}>
                    {donationsExpanded ? '▲' : '▼'}
                  </button>
                </div>
                {donationsExpanded && (
                  <div className="tax-expense-list">
                    {filterExpensesByInvoice(taxDeductible.expenses.donations).map((expense) => (
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
                        <div className="tax-expense-invoice">
                          <InvoiceIndicator
                            hasInvoice={expense.hasInvoice}
                            invoiceInfo={expense.invoice}
                            invoiceCount={expense.invoiceCount || 0}
                            invoices={expense.invoices || []}
                            expenseId={expense.id}
                            size="small"
                            alwaysShow={true}
                            onClick={expense.hasInvoice ? () => handleViewInvoices(expense) : undefined}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Edit Modal */}
      {showEditModal && expenseToEdit && (
        <div className="modal-overlay" onClick={handleCancelEdit}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close-button" 
              onClick={handleCancelEdit}
              aria-label="Close"
            >
              ×
            </button>
            <h3>Edit Expense</h3>
            <form onSubmit={handleEditSubmit} className="edit-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit-date">Date *</label>
                  <input
                    type="date"
                    id="edit-date"
                    name="date"
                    value={editFormData.date}
                    onChange={handleEditChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="edit-amount">Amount *</label>
                  <input
                    type="number"
                    id="edit-amount"
                    name="amount"
                    value={editFormData.amount}
                    onChange={handleEditChange}
                    step="0.01"
                    min="0.01"
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit-type">Type *</label>
                  <select
                    id="edit-type"
                    name="type"
                    value={editFormData.type}
                    onChange={handleEditChange}
                    required
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="edit-method">Payment Method *</label>
                  <select
                    id="edit-method"
                    name="method"
                    value={editFormData.method}
                    onChange={handleEditChange}
                    required
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="edit-place">Place</label>
                <input
                  type="text"
                  id="edit-place"
                  name="place"
                  value={editFormData.place}
                  onChange={handleEditChange}
                  maxLength="200"
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-notes">Notes</label>
                <textarea
                  id="edit-notes"
                  name="notes"
                  value={editFormData.notes}
                  onChange={handleEditChange}
                  maxLength="200"
                  rows="3"
                />
              </div>

              {/* People Selection for Medical Expenses */}
              {isEditingMedicalExpense && (
                <div className="form-group">
                  <label htmlFor="edit-people">Assign to People</label>
                  <select
                    id="edit-people"
                    name="people"
                    multiple
                    value={selectedPeople.map(p => p.id.toString())}
                    onChange={handleEditPeopleChange}
                    className="people-select"
                    size={Math.min(people.length + 1, 4)}
                  >
                    <option value="" disabled>Select family members...</option>
                    {people.map(person => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                  {selectedPeople.length > 0 && (
                    <div className="selected-people-info">
                      Selected: {selectedPeople.map(p => p.name).join(', ')}
                      {selectedPeople.length > 1 && (
                        <span className="allocation-note"> (allocation required)</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {editMessage.text && (
                <div className={`message ${editMessage.type}`}>
                  {editMessage.text}
                </div>
              )}

              <div className="dialog-actions">
                <button 
                  type="button"
                  className="cancel-button" 
                  onClick={handleCancelEdit}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="save-button" 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Person Allocation Modal */}
      <PersonAllocationModal
        isOpen={showPersonAllocation}
        expense={{ amount: parseFloat(editFormData.amount) || 0 }}
        selectedPeople={selectedPeople}
        onSave={handleEditPersonAllocation}
        onCancel={() => setShowPersonAllocation(false)}
      />

      {/* Invoice List Modal */}
      {showInvoiceModal && invoiceModalExpense && (
        <div className="modal-overlay" onClick={handleCloseInvoiceModal}>
          <div className="invoice-modal" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close-button" 
              onClick={handleCloseInvoiceModal}
              aria-label="Close"
            >
              ×
            </button>
            <h3>📄 Invoices for {invoiceModalExpense.place || 'Expense'}</h3>
            <div className="invoice-modal-info">
              <span className="invoice-modal-date">{formatDate(invoiceModalExpense.date)}</span>
              <span className="invoice-modal-amount">${formatAmount(invoiceModalExpense.amount)}</span>
            </div>
            <InvoiceList
              invoices={invoiceModalInvoices}
              expenseId={invoiceModalExpense.id}
              people={people}
              onInvoiceDeleted={handleInvoiceDeleted}
              onPersonLinkUpdated={() => fetchTaxDeductibleData()}
            />
            {invoiceModalInvoices.length === 0 && (
              <div className="invoice-modal-empty">No invoices attached to this expense.</div>
            )}
          </div>
        </div>
      )}

      {/* Quick Status Update Component */}
      {quickStatusExpense && (
        <QuickStatusUpdate
          expenseId={quickStatusExpense.id}
          currentStatus={quickStatusExpense.claimStatus || 'not_claimed'}
          onStatusChange={handleStatusChange}
          onClose={handleCloseQuickStatus}
          isOpen={true}
          position={{ top: 100, left: 100 }}
        />
      )}
    </div>
  );
};

export default TaxDeductible;
