import { useState, useEffect, useCallback } from 'react';
import useTabState from '../hooks/useTabState';
import { API_ENDPOINTS } from '../config';
import { getAllLoans, createLoan, updateLoan, deleteLoan } from '../services/loanApi';
import { getFixedExpensesByLoan } from '../services/fixedExpenseApi';
import { getAllInvestments, createInvestment, updateInvestment, deleteInvestment } from '../services/investmentApi';
import { getPaymentMethods, deletePaymentMethod, setPaymentMethodActive } from '../services/paymentMethodApi';
import { validateName, validateAmount } from '../utils/validation';
import { formatCurrency, formatDate } from '../utils/formatters';
import { createLogger } from '../utils/logger';
import LoanDetailView from './LoanDetailView';
import TotalDebtView from './TotalDebtView';
import InvestmentDetailView from './InvestmentDetailView';
import PaymentMethodForm from './PaymentMethodForm';
import CreditCardDetailView from './CreditCardDetailView';
import './FinancialOverviewModal.css';

const logger = createLogger('FinancialOverviewModal');

// ─── NetWorthSummary ──────────────────────────────────────────────────────────

const NetWorthSummary = ({ totalInvestments, totalDebt }) => {
  const netWorth = totalInvestments - totalDebt;
  const isPositive = netWorth >= 0;

  return (
    <div className="financial-net-worth-summary">
      <div className="financial-net-worth-item">
        <span className="financial-net-worth-label">Assets</span>
        <span className="financial-net-worth-value positive">{formatCurrency(totalInvestments)}</span>
      </div>
      <div className="financial-net-worth-item">
        <span className="financial-net-worth-label">Liabilities</span>
        <span className="financial-net-worth-value negative">{formatCurrency(totalDebt)}</span>
      </div>
      <div className="financial-net-worth-item net-worth">
        <span className="financial-net-worth-label">Net Worth</span>
        <span
          data-testid="net-worth-value"
          className={`financial-net-worth-value ${isPositive ? 'positive' : 'negative'}`}
        >
          {formatCurrency(netWorth)}
        </span>
      </div>
    </div>
  );
};

// ─── LoansTabContent ──────────────────────────────────────────────────────────

const LoansTabContent = ({ year, month, onUpdate, highlightIds = [], onTotalDebtChange }) => {
  const [loans, setLoans] = useState([]);
  const [activeTab, setActiveTab] = useState('active');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState(null);
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [showTotalDebt, setShowTotalDebt] = useState(false);
  const [loanFixedExpenseCounts, setLoanFixedExpenseCounts] = useState({});

  const [formData, setFormData] = useState({
    name: '', initial_balance: '', start_date: '', loan_type: 'loan', notes: '',
    fixed_interest_rate: '', amortization_period: '', term_length: '', renewal_date: '',
    rate_type: 'fixed', payment_frequency: 'monthly', estimated_property_value: ''
  });
  const [validationErrors, setValidationErrors] = useState({});

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllLoans();
      const loanList = data || [];
      setLoans(loanList);
      await fetchFixedExpenseCounts(loanList);
      // Lift total debt up for net worth calculation
      const totalDebt = loanList
        .filter(l => !l.is_paid_off)
        .reduce((sum, l) => sum + (l.currentBalance || 0), 0);
      if (onTotalDebtChange) onTotalDebtChange(totalDebt);
    } catch (err) {
      setError(err.message || 'Unable to load loans.');
      logger.error('Error fetching loans:', err);
    } finally {
      setLoading(false);
    }
  }, [onTotalDebtChange]);

  const fetchFixedExpenseCounts = async (loansList) => {
    const counts = {};
    await Promise.all(loansList.map(async (loan) => {
      try {
        const fixedExpenses = await getFixedExpensesByLoan(loan.id);
        counts[loan.id] = new Set(fixedExpenses.map(fe => fe.name)).size;
      } catch {
        counts[loan.id] = 0;
      }
    }));
    setLoanFixedExpenseCounts(counts);
  };

  useEffect(() => { fetchLoans(); }, [fetchLoans]);

  const clearForm = () => {
    setFormData({
      name: '', initial_balance: '', start_date: '', loan_type: 'loan', notes: '',
      fixed_interest_rate: '', amortization_period: '', term_length: '', renewal_date: '',
      rate_type: 'fixed', payment_frequency: 'monthly', estimated_property_value: ''
    });
    setValidationErrors({});
  };

  const validateForm = () => {
    const errors = {};
    const nameError = validateName(formData.name);
    if (nameError) errors.name = nameError;
    const amountError = validateAmount(formData.initial_balance);
    if (amountError) errors.initial_balance = amountError;
    if (!formData.start_date) errors.start_date = 'Start date is required';
    if (formData.loan_type === 'loan' && formData.fixed_interest_rate !== '') {
      const r = parseFloat(formData.fixed_interest_rate);
      if (isNaN(r)) errors.fixed_interest_rate = 'Must be a valid number';
      else if (r < 0) errors.fixed_interest_rate = 'Must be >= 0';
    }
    if (formData.loan_type === 'mortgage') {
      if (!formData.amortization_period) errors.amortization_period = 'Required';
      else { const v = parseInt(formData.amortization_period, 10); if (isNaN(v) || v < 1 || v > 40) errors.amortization_period = 'Must be 1-40 years'; }
      if (!formData.term_length) errors.term_length = 'Required';
      else { const v = parseInt(formData.term_length, 10); if (isNaN(v) || v < 1 || v > 10) errors.term_length = 'Must be 1-10 years'; }
      if (!formData.renewal_date) errors.renewal_date = 'Required';
      if (!['fixed', 'variable'].includes(formData.rate_type)) errors.rate_type = 'Invalid';
      if (!['monthly', 'bi-weekly', 'accelerated_bi-weekly'].includes(formData.payment_frequency)) errors.payment_frequency = 'Invalid';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateLoan = async () => {
    setError(null);
    if (!validateForm()) { setError('Please fix validation errors.'); return; }
    setLoading(true);
    try {
      const loanData = {
        name: formData.name.trim(),
        initial_balance: parseFloat(formData.initial_balance),
        start_date: formData.start_date,
        loan_type: formData.loan_type,
        notes: formData.notes.trim() || null
      };
      if (formData.loan_type === 'loan') loanData.fixed_interest_rate = formData.fixed_interest_rate !== '' ? parseFloat(formData.fixed_interest_rate) : null;
      if (formData.loan_type === 'mortgage') {
        loanData.amortization_period = parseInt(formData.amortization_period, 10);
        loanData.term_length = parseInt(formData.term_length, 10);
        loanData.renewal_date = formData.renewal_date;
        loanData.rate_type = formData.rate_type;
        loanData.payment_frequency = formData.payment_frequency;
        loanData.estimated_property_value = formData.estimated_property_value ? parseFloat(formData.estimated_property_value) : null;
      }
      await createLoan(loanData);
      await fetchLoans();
      setShowAddForm(false);
      clearForm();
    } catch (err) {
      setError(err.message || 'Unable to create loan.');
      logger.error('Error creating loan:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLoan = async () => {
    setError(null);
    const nameError = validateName(formData.name);
    if (nameError) { setValidationErrors({ name: nameError }); setError('Please fix validation errors.'); return; }
    setLoading(true);
    try {
      const updateData = { name: formData.name.trim(), notes: formData.notes.trim() || null };
      if (formData.loan_type === 'loan') updateData.fixed_interest_rate = formData.fixed_interest_rate !== '' ? parseFloat(formData.fixed_interest_rate) : null;
      if (formData.loan_type === 'mortgage') {
        updateData.renewal_date = formData.renewal_date || null;
        updateData.estimated_property_value = formData.estimated_property_value ? parseFloat(formData.estimated_property_value) : null;
      }
      await updateLoan(editingLoanId, updateData);
      await fetchLoans();
      setShowAddForm(false);
      setEditingLoanId(null);
      clearForm();
    } catch (err) {
      setError(err.message || 'Unable to update loan.');
      logger.error('Error updating loan:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLoan = async (id) => {
    if (!window.confirm('Delete this loan? This will also delete all balance entries.')) return;
    setLoading(true);
    setError(null);
    try {
      await deleteLoan(id);
      await fetchLoans();
    } catch (err) {
      setError(err.message || 'Unable to delete loan.');
      logger.error('Error deleting loan:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditLoan = (loan) => {
    setFormData({
      name: loan.name, initial_balance: loan.initial_balance.toString(),
      start_date: loan.start_date, loan_type: loan.loan_type || 'loan',
      notes: loan.notes || '',
      fixed_interest_rate: loan.fixed_interest_rate != null ? loan.fixed_interest_rate.toString() : '',
      amortization_period: loan.amortization_period ? loan.amortization_period.toString() : '',
      term_length: loan.term_length ? loan.term_length.toString() : '',
      renewal_date: loan.renewal_date || '', rate_type: loan.rate_type || 'fixed',
      payment_frequency: loan.payment_frequency || 'monthly',
      estimated_property_value: loan.estimated_property_value ? loan.estimated_property_value.toString() : ''
    });
    setEditingLoanId(loan.id);
    setShowAddForm(true);
    setValidationErrors({});
  };

  const handleCloseLoanDetail = () => {
    setSelectedLoanId(null);
    fetchLoans();
    if (onUpdate) onUpdate();
  };

  const activeLoans = loans.filter(l => !l.is_paid_off);
  const paidOffLoans = loans.filter(l => l.is_paid_off);
  const displayedLoans = activeTab === 'active' ? activeLoans : paidOffLoans;
  const selectedLoan = selectedLoanId ? loans.find(l => l.id === selectedLoanId) : null;

  if (showTotalDebt) {
    return <TotalDebtView isOpen={true} onClose={() => setShowTotalDebt(false)} />;
  }

  if (selectedLoan) {
    return (
      <LoanDetailView
        loan={selectedLoan}
        isOpen={true}
        onClose={handleCloseLoanDetail}
        onUpdate={fetchLoans}
      />
    );
  }

  return (
    <div className="financial-tab-panel">
      {error && (
        <div className="financial-modal-error">
          <div>{error}</div>
          {loans.length === 0 && !loading && (
            <button className="financial-error-retry-button" onClick={fetchLoans}>Retry</button>
          )}
        </div>
      )}
      <div className="financial-modal-content">
        {loading && loans.length === 0 ? (
          <div className="financial-modal-loading">Loading loans...</div>
        ) : (
          <>
            <div className="loans-add-button-section">
              <button className="loans-add-new-button" onClick={() => { clearForm(); setEditingLoanId(null); setShowAddForm(true); }} disabled={loading || showAddForm}>
                + Add New Loan
              </button>
              <button className="loans-total-debt-button" onClick={() => setShowTotalDebt(true)} disabled={loading}>
                📊 View Total Debt Trend
              </button>
            </div>

            {showAddForm && (
              <div className="loans-form-section">
                <h3>{editingLoanId ? 'Edit Loan' : 'Add New Loan'}</h3>
                <div className="loans-form">
                  <div className="loans-input-group">
                    <label>Loan Name *</label>
                    <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Car Loan" className={validationErrors.name ? 'input-error' : ''} disabled={loading} />
                    {validationErrors.name && <span className="validation-error">{validationErrors.name}</span>}
                  </div>
                  <div className="loans-input-group">
                    <label>Initial Balance * {editingLoanId && '(cannot be changed)'}</label>
                    <input type="number" value={formData.initial_balance} onChange={(e) => setFormData({ ...formData, initial_balance: e.target.value })} placeholder="0.00" step="0.01" min="0" className={validationErrors.initial_balance ? 'input-error' : ''} disabled={loading || !!editingLoanId} />
                    {validationErrors.initial_balance && <span className="validation-error">{validationErrors.initial_balance}</span>}
                  </div>
                  <div className="loans-input-group">
                    <label>Start Date * {editingLoanId && '(cannot be changed)'}</label>
                    <input type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} className={validationErrors.start_date ? 'input-error' : ''} disabled={loading || !!editingLoanId} />
                    {validationErrors.start_date && <span className="validation-error">{validationErrors.start_date}</span>}
                  </div>
                  <div className="loans-input-group">
                    <label>Loan Type *</label>
                    <select value={formData.loan_type} onChange={(e) => setFormData({ ...formData, loan_type: e.target.value })} disabled={loading || !!editingLoanId}>
                      <option value="loan">Loan</option>
                      <option value="line_of_credit">Line of Credit</option>
                      <option value="mortgage">Mortgage</option>
                    </select>
                  </div>
                  {formData.loan_type === 'loan' && (
                    <div className="loans-input-group">
                      <label>Fixed Interest Rate (%)</label>
                      <input type="number" value={formData.fixed_interest_rate} onChange={(e) => setFormData({ ...formData, fixed_interest_rate: e.target.value })} placeholder="e.g., 5.25" step="0.01" min="0" className={validationErrors.fixed_interest_rate ? 'input-error' : ''} disabled={loading} />
                      {validationErrors.fixed_interest_rate && <span className="validation-error">{validationErrors.fixed_interest_rate}</span>}
                    </div>
                  )}
                  <div className="loans-input-group">
                    <label>Notes</label>
                    <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows="2" disabled={loading} />
                  </div>
                  <div className="loans-form-actions">
                    <button className="loans-form-submit-button" onClick={editingLoanId ? handleUpdateLoan : handleCreateLoan} disabled={loading}>
                      {loading ? 'Saving...' : (editingLoanId ? 'Update Loan' : 'Create Loan')}
                    </button>
                    <button className="loans-form-cancel-button" onClick={() => { setShowAddForm(false); setEditingLoanId(null); clearForm(); }} disabled={loading}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            <div className="loans-tabs">
              <button className={`loans-tab ${activeTab === 'active' ? 'active' : ''}`} onClick={() => setActiveTab('active')}>Active Loans ({activeLoans.length})</button>
              <button className={`loans-tab ${activeTab === 'paidOff' ? 'active' : ''}`} onClick={() => setActiveTab('paidOff')}>Paid Off ({paidOffLoans.length})</button>
            </div>

            <div className="loans-list">
              {displayedLoans.length === 0 ? (
                <div className="loans-empty">{activeTab === 'active' ? 'No active loans.' : 'No paid off loans yet.'}</div>
              ) : (
                displayedLoans.map((loan) => {
                  const needsUpdate = highlightIds.includes(loan.id);
                  const fixedExpenseCount = loanFixedExpenseCounts[loan.id] || 0;
                  return (
                    <div key={loan.id} className={`loan-item ${needsUpdate ? 'needs-update' : ''}`}>
                      <div className="loan-item-main">
                        <div className="loan-item-info">
                          <div className="loan-item-name">
                            {loan.name}
                            {loan.loan_type === 'line_of_credit' && <span className="loan-type-badge">LOC</span>}
                            {loan.loan_type === 'mortgage' && <span className="loan-type-badge mortgage">Mortgage</span>}
                            {fixedExpenseCount > 0 && <span className="loan-fixed-expense-badge" title={`${fixedExpenseCount} linked fixed expense(s)`}>📋 {fixedExpenseCount}</span>}
                            {needsUpdate && <span className="needs-update-badge">⚠️ Update Needed</span>}
                          </div>
                          <div className="loan-item-details">
                            <span className="loan-item-rate">Rate: {loan.currentRate != null && loan.currentRate > 0 ? `${loan.currentRate}%` : 'N/A'}</span>
                            <span className="loan-item-balance">Balance: {formatCurrency(loan.currentBalance)}</span>
                            <span className="loan-item-start-date">Started: {formatDate(loan.start_date)}</span>
                          </div>
                        </div>
                        <div className="loan-item-actions">
                          <button className="loan-view-button" onClick={() => setSelectedLoanId(loan.id)} disabled={loading}>👁️ View</button>
                          <button className="loan-edit-button" onClick={() => handleEditLoan(loan)} disabled={loading}>✏️</button>
                          <button className="loan-delete-button" onClick={() => handleDeleteLoan(loan.id)} disabled={loading}>🗑️</button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── InvestmentsTabContent ────────────────────────────────────────────────────

const InvestmentsTabContent = ({ onUpdate, highlightIds = [], onTotalInvestmentsChange }) => {
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingInvestmentId, setEditingInvestmentId] = useState(null);
  const [selectedInvestmentId, setSelectedInvestmentId] = useState(null);
  const [formData, setFormData] = useState({ name: '', type: 'TFSA', initial_value: '' });
  const [validationErrors, setValidationErrors] = useState({});

  const fetchInvestments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllInvestments();
      const list = data || [];
      setInvestments(list);
      const total = list.reduce((sum, i) => sum + (i.currentValue || 0), 0);
      if (onTotalInvestmentsChange) onTotalInvestmentsChange(total);
    } catch (err) {
      setError(err.message || 'Unable to load investments.');
      logger.error('Error fetching investments:', err);
    } finally {
      setLoading(false);
    }
  }, [onTotalInvestmentsChange]);

  useEffect(() => { fetchInvestments(); }, [fetchInvestments]);

  const clearForm = () => { setFormData({ name: '', type: 'TFSA', initial_value: '' }); setValidationErrors({}); };

  const validateForm = () => {
    const errors = {};
    const nameError = validateName(formData.name);
    if (nameError) errors.name = nameError;
    if (!['TFSA', 'RRSP'].includes(formData.type)) errors.type = 'Must be TFSA or RRSP';
    const amountError = validateAmount(formData.initial_value);
    if (amountError) errors.initial_value = amountError;
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    setError(null);
    if (!validateForm()) { setError('Please fix validation errors.'); return; }
    setLoading(true);
    try {
      await createInvestment({ name: formData.name.trim(), type: formData.type, initial_value: parseFloat(formData.initial_value) });
      await fetchInvestments();
      setShowAddForm(false);
      clearForm();
    } catch (err) {
      setError(err.message || 'Unable to create investment.');
      logger.error('Error creating investment:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    setError(null);
    const errors = {};
    const nameError = validateName(formData.name);
    if (nameError) errors.name = nameError;
    if (!['TFSA', 'RRSP'].includes(formData.type)) errors.type = 'Must be TFSA or RRSP';
    if (Object.keys(errors).length > 0) { setValidationErrors(errors); setError('Please fix validation errors.'); return; }
    setLoading(true);
    try {
      await updateInvestment(editingInvestmentId, { name: formData.name.trim(), type: formData.type, initial_value: parseFloat(formData.initial_value) });
      await fetchInvestments();
      if (onUpdate) onUpdate();
      setShowAddForm(false);
      setEditingInvestmentId(null);
      clearForm();
    } catch (err) {
      setError(err.message || 'Unable to update investment.');
      logger.error('Error updating investment:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this investment? This will also delete all value entries.')) return;
    setLoading(true);
    setError(null);
    try {
      await deleteInvestment(id);
      await fetchInvestments();
    } catch (err) {
      setError(err.message || 'Unable to delete investment.');
      logger.error('Error deleting investment:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditInvestment = (investment) => {
    setFormData({ name: investment.name, type: investment.type, initial_value: investment.initial_value.toString() });
    setEditingInvestmentId(investment.id);
    setShowAddForm(true);
    setValidationErrors({});
  };

  if (selectedInvestmentId) {
    const selectedInvestment = investments.find(i => i.id === selectedInvestmentId);
    return (
      <InvestmentDetailView
        investment={selectedInvestment}
        isOpen={true}
        onClose={() => setSelectedInvestmentId(null)}
        onUpdate={() => { fetchInvestments(); if (onUpdate) onUpdate(); }}
      />
    );
  }

  return (
    <div className="financial-tab-panel">
      {error && (
        <div className="financial-modal-error">
          <div>{error}</div>
          {investments.length === 0 && !loading && (
            <button className="financial-error-retry-button" onClick={fetchInvestments}>Retry</button>
          )}
        </div>
      )}
      <div className="financial-modal-content">
        {loading && investments.length === 0 ? (
          <div className="financial-modal-loading">Loading investments...</div>
        ) : (
          <>
            <div className="investments-add-button-section">
              <button className="investments-add-new-button" onClick={() => { clearForm(); setEditingInvestmentId(null); setShowAddForm(true); }} disabled={loading || showAddForm}>
                + Add New Investment
              </button>
            </div>

            {showAddForm && (
              <div className="investments-form-section">
                <h3>{editingInvestmentId ? 'Edit Investment' : 'Add New Investment'}</h3>
                <div className="investments-form">
                  <div className="investments-input-group">
                    <label>Investment Name *</label>
                    <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., My TFSA" className={validationErrors.name ? 'input-error' : ''} disabled={loading} />
                    {validationErrors.name && <span className="validation-error">{validationErrors.name}</span>}
                  </div>
                  <div className="investments-input-group">
                    <label>Investment Type *</label>
                    <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className={validationErrors.type ? 'input-error' : ''} disabled={loading}>
                      <option value="TFSA">TFSA</option>
                      <option value="RRSP">RRSP</option>
                    </select>
                    {validationErrors.type && <span className="validation-error">{validationErrors.type}</span>}
                  </div>
                  <div className="investments-input-group">
                    <label>Initial Value * {editingInvestmentId && '(cannot be changed)'}</label>
                    <input type="number" value={formData.initial_value} onChange={(e) => setFormData({ ...formData, initial_value: e.target.value })} placeholder="0.00" step="0.01" min="0" className={validationErrors.initial_value ? 'input-error' : ''} disabled={loading || !!editingInvestmentId} />
                    {validationErrors.initial_value && <span className="validation-error">{validationErrors.initial_value}</span>}
                  </div>
                  <div className="investments-form-actions">
                    <button className="investments-form-submit-button" onClick={editingInvestmentId ? handleUpdate : handleCreate} disabled={loading}>
                      {loading ? 'Saving...' : (editingInvestmentId ? 'Update Investment' : 'Create Investment')}
                    </button>
                    <button className="investments-form-cancel-button" onClick={() => { setShowAddForm(false); setEditingInvestmentId(null); clearForm(); }} disabled={loading}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            <div className="investments-list">
              {investments.length === 0 ? (
                <div className="investments-empty">No investments yet. Add one to get started.</div>
              ) : (
                investments.map((investment) => {
                  const needsUpdate = highlightIds.includes(investment.id);
                  return (
                    <div key={investment.id} className={`investment-item ${needsUpdate ? 'needs-update' : ''}`}>
                      <div className="investment-item-main">
                        <div className="investment-item-info">
                          <div className="investment-item-name">
                            {investment.name}
                            <span className="investment-type-badge">{investment.type}</span>
                            {needsUpdate && <span className="needs-update-badge">⚠️ Update Needed</span>}
                          </div>
                          <div className="investment-item-details">
                            <span className="investment-item-current-value">Current Value: {formatCurrency(investment.currentValue)}</span>
                          </div>
                        </div>
                        <div className="investment-item-actions">
                          <button className="investment-view-button" onClick={() => setSelectedInvestmentId(investment.id)} disabled={loading}>👁️ View</button>
                          <button className="investment-edit-button" onClick={() => handleEditInvestment(investment)} disabled={loading}>✏️</button>
                          <button className="investment-delete-button" onClick={() => handleDelete(investment.id)} disabled={loading}>🗑️</button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── PaymentMethodsTabContent ─────────────────────────────────────────────────

const TYPE_LABELS = { cash: 'Cash', cheque: 'Cheque', debit: 'Debit', credit_card: 'Credit Cards' };
const TYPE_ORDER = ['cash', 'cheque', 'debit', 'credit_card'];
const UTILIZATION_WARNING_THRESHOLD = 30;
const UTILIZATION_DANGER_THRESHOLD = 70;

const PaymentMethodsTabContent = ({ onUpdate }) => {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [activeTab, setActiveTab] = useState('active');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMethod, setEditingMethod] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState(null);
  const [selectedCreditCard, setSelectedCreditCard] = useState(null);

  const fetchPaymentMethods = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPaymentMethods();
      setPaymentMethods(data || []);
    } catch (err) {
      setError(err.message || 'Unable to load payment methods.');
      logger.error('Error fetching payment methods:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPaymentMethods(); }, [fetchPaymentMethods]);

  const activePaymentMethods = paymentMethods.filter(m => m.is_active);
  const inactivePaymentMethods = paymentMethods.filter(m => !m.is_active);
  const displayedMethods = activeTab === 'active' ? activePaymentMethods : inactivePaymentMethods;
  const groupedMethods = TYPE_ORDER.reduce((acc, type) => {
    const methods = displayedMethods.filter(m => m.type === type);
    if (methods.length > 0) acc[type] = methods;
    return acc;
  }, {});

  const handleFormSave = async () => {
    setShowAddForm(false);
    setEditingMethod(null);
    await fetchPaymentMethods();
    if (onUpdate) onUpdate();
  };

  const handleToggleActive = async (method) => {
    const activeCount = paymentMethods.filter(m => m.is_active).length;
    if (method.is_active && activeCount <= 1) {
      setError('Cannot deactivate the last active payment method.');
      return;
    }
    if (method.is_active) { setDeactivateConfirm(method); return; }
    await performToggleActive(method);
  };

  const performToggleActive = async (method) => {
    setLoading(true);
    setError(null);
    try {
      await setPaymentMethodActive(method.id, !method.is_active);
      await fetchPaymentMethods();
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.message || 'Unable to update payment method status.');
      logger.error('Error toggling payment method:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (method) => {
    if (method.total_expense_count > 0) {
      setError('Cannot delete payment method with associated expenses. Mark it as inactive instead.');
      return;
    }
    setDeleteConfirm(method);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setLoading(true);
    setError(null);
    try {
      await deletePaymentMethod(deleteConfirm.id);
      setDeleteConfirm(null);
      await fetchPaymentMethods();
      if (onUpdate) onUpdate();
    } catch (err) {
      setError(err.message || 'Unable to delete payment method.');
      logger.error('Error deleting payment method:', err);
    } finally {
      setLoading(false);
    }
  };

  const getUtilizationClass = (utilization) => {
    if (utilization >= UTILIZATION_DANGER_THRESHOLD) return 'danger';
    if (utilization >= UTILIZATION_WARNING_THRESHOLD) return 'warning';
    return 'good';
  };

  const formatCurrencyLocal = (amount) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount || 0);

  if (showAddForm) {
    return (
      <PaymentMethodForm
        isOpen={true}
        method={editingMethod}
        onSave={handleFormSave}
        onCancel={() => { setShowAddForm(false); setEditingMethod(null); }}
      />
    );
  }

  return (
    <div className="financial-tab-panel">
      {error && (
        <div className="financial-modal-error">
          <div>{error}</div>
          {paymentMethods.length === 0 && !loading && (
            <button className="financial-error-retry-button" onClick={fetchPaymentMethods}>Retry</button>
          )}
        </div>
      )}
      <div className="financial-modal-content">
        {loading && paymentMethods.length === 0 ? (
          <div className="financial-modal-loading">Loading payment methods...</div>
        ) : (
          <>
            <div className="payment-methods-add-section">
              <button className="payment-methods-add-button" onClick={() => { setEditingMethod(null); setShowAddForm(true); }} disabled={loading}>
                + Add Payment Method
              </button>
            </div>

            <div className="payment-methods-tabs">
              <button className={`payment-methods-tab ${activeTab === 'active' ? 'active' : ''}`} onClick={() => setActiveTab('active')}>
                Active ({activePaymentMethods.length})
              </button>
              <button className={`payment-methods-tab ${activeTab === 'inactive' ? 'active' : ''}`} onClick={() => setActiveTab('inactive')}>
                Inactive ({inactivePaymentMethods.length})
              </button>
            </div>

            <div className="payment-methods-list">
              {Object.keys(groupedMethods).length === 0 ? (
                <div className="payment-methods-empty">
                  {activeTab === 'active' ? 'No active payment methods.' : 'No inactive payment methods.'}
                </div>
              ) : (
                TYPE_ORDER.map(type => {
                  const methods = groupedMethods[type];
                  if (!methods || methods.length === 0) return null;
                  return (
                    <div key={type} className="payment-methods-group">
                      <h3 className="payment-methods-group-title">{TYPE_LABELS[type]}</h3>
                      {methods.map(method => (
                        <div key={method.id} className={`payment-method-item ${!method.is_active ? 'inactive' : ''}`}>
                          <div className="payment-method-info">
                            <div className="payment-method-name">{method.display_name}</div>
                            {method.full_name && method.full_name !== method.display_name && (
                              <div className="payment-method-full-name">{method.full_name}</div>
                            )}
                            <div className="payment-method-expense-count">
                              {method.expense_count || 0} expense{(method.expense_count || 0) !== 1 ? 's' : ''} this period
                            </div>
                          </div>
                          {method.type === 'credit_card' && (
                            <div
                              className="payment-method-credit-info clickable"
                              onClick={() => setSelectedCreditCard(method.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedCreditCard(method.id); } }}
                            >
                              <div className="credit-balance">Balance: {formatCurrencyLocal(method.current_balance)}</div>
                              {method.credit_limit > 0 && (
                                <div className={`credit-utilization ${getUtilizationClass(method.utilization_percentage || 0)}`}>
                                  <div className="utilization-bar">
                                    <div className="utilization-fill" style={{ width: `${Math.min(method.utilization_percentage || 0, 100)}%` }} />
                                  </div>
                                  <span className="utilization-text">{(method.utilization_percentage || 0).toFixed(1)}% of {formatCurrencyLocal(method.credit_limit)}</span>
                                </div>
                              )}
                              {method.days_until_due !== null && method.days_until_due !== undefined && (
                                <div className={`credit-due-date ${method.days_until_due <= 7 ? 'due-soon' : ''}`}>
                                  {method.days_until_due <= 0 ? '⚠️ Payment overdue!' : method.days_until_due <= 7 ? `⚠️ Due in ${method.days_until_due} day${method.days_until_due !== 1 ? 's' : ''}` : `Due in ${method.days_until_due} days`}
                                </div>
                              )}
                              <div className="credit-view-details">View Details →</div>
                            </div>
                          )}
                          <div className="payment-method-actions">
                            <button className="payment-method-edit-btn" onClick={() => { setEditingMethod(method); setShowAddForm(true); }} disabled={loading}>✏️</button>
                            {method.is_active ? (
                              <button className="payment-method-deactivate-btn" onClick={() => handleToggleActive(method)} disabled={loading}>Deactivate</button>
                            ) : (
                              <button className="payment-method-activate-btn" onClick={() => handleToggleActive(method)} disabled={loading}>Activate</button>
                            )}
                            {(method.total_expense_count || 0) === 0 && (
                              <button className="payment-method-delete-btn" onClick={() => handleDelete(method)} disabled={loading}>🗑️</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {deleteConfirm && (
        <div className="payment-methods-confirm-overlay">
          <div className="payment-methods-confirm-dialog">
            <h3>Delete Payment Method</h3>
            <p>Are you sure you want to delete "{deleteConfirm.display_name}"?</p>
            <p className="confirm-warning">This action cannot be undone.</p>
            <div className="confirm-actions">
              <button className="confirm-delete-btn" onClick={confirmDelete} disabled={loading}>{loading ? 'Deleting...' : 'Delete'}</button>
              <button className="confirm-cancel-btn" onClick={() => setDeleteConfirm(null)} disabled={loading}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {deactivateConfirm && (
        <div className="payment-methods-confirm-overlay">
          <div className="payment-methods-confirm-dialog">
            <h3>Deactivate Payment Method</h3>
            <p>Are you sure you want to deactivate "{deactivateConfirm.display_name}"?</p>
            <p className="confirm-info">Deactivated methods won't appear in expense form dropdowns.</p>
            <div className="confirm-actions">
              <button className="confirm-deactivate-btn" onClick={async () => { await performToggleActive(deactivateConfirm); setDeactivateConfirm(null); }} disabled={loading}>{loading ? 'Deactivating...' : 'Deactivate'}</button>
              <button className="confirm-cancel-btn" onClick={() => setDeactivateConfirm(null)} disabled={loading}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <CreditCardDetailView
        paymentMethodId={selectedCreditCard}
        isOpen={selectedCreditCard !== null}
        onClose={() => setSelectedCreditCard(null)}
        onUpdate={async () => { await fetchPaymentMethods(); if (onUpdate) onUpdate(); }}
      />
    </div>
  );
};

// ─── FinancialOverviewModal ───────────────────────────────────────────────────

const FinancialOverviewModal = ({
  isOpen,
  onClose,
  year,
  month,
  onUpdate,
  onPaymentMethodsUpdate,
  initialTab,
  _testNetWorth,
}) => {
  const [activeTab, setActiveTab] = useTabState('financial-overview-modal-tab', 'loans');
  const [totalInvestments, setTotalInvestments] = useState(_testNetWorth ? _testNetWorth.totalInvestments : 0);
  const [totalDebt, setTotalDebt] = useState(_testNetWorth ? _testNetWorth.totalDebt : 0);
  const [highlightLoanIds, setHighlightLoanIds] = useState([]);
  const [highlightInvestmentIds, setHighlightInvestmentIds] = useState([]);

  // Override persisted tab when initialTab is provided
  useEffect(() => {
    if (initialTab !== null && initialTab !== undefined) {
      setActiveTab(initialTab);
    }
  }, [initialTab, setActiveTab]);

  // Fetch reminder status on open to self-manage highlight IDs
  useEffect(() => {
    if (!isOpen) return;

    const fetchReminderStatus = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.REMINDER_STATUS(year, month));
        if (!response.ok) return;
        const data = await response.json();
        setHighlightLoanIds((data.loans || []).map(l => l.id));
        setHighlightInvestmentIds((data.investments || []).map(i => i.id));
      } catch (err) {
        logger.error('Error fetching reminder status in FinancialOverviewModal:', err);
      }
    };

    fetchReminderStatus();
  }, [isOpen, year, month]);

  const handleClose = () => {
    if (onUpdate) onUpdate();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="financial-modal-overlay" onClick={handleClose}>
      <div className="financial-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="financial-modal-header">
          <div className="financial-modal-header-top">
            <h2>💼 Financial Overview</h2>
            <button className="financial-modal-close" onClick={handleClose} aria-label="Close">✕</button>
          </div>
          <NetWorthSummary totalInvestments={totalInvestments} totalDebt={totalDebt} />
        </div>

        <div className="financial-tabs">
          <button
            className={`tab-button ${activeTab === 'loans' ? 'active' : ''}`}
            onClick={() => setActiveTab('loans')}
          >
            🏦 Loans
          </button>
          <button
            className={`tab-button ${activeTab === 'investments' ? 'active' : ''}`}
            onClick={() => setActiveTab('investments')}
          >
            📈 Investments
          </button>
          <button
            className={`tab-button ${activeTab === 'payment-methods' ? 'active' : ''}`}
            onClick={() => setActiveTab('payment-methods')}
          >
            💳 Payment Methods
          </button>
        </div>

        <div className="financial-tab-content">
          {activeTab === 'loans' && (
            <LoansTabContent
              year={year}
              month={month}
              onUpdate={onUpdate}
              highlightIds={highlightLoanIds}
              onTotalDebtChange={setTotalDebt}
            />
          )}
          {activeTab === 'investments' && (
            <InvestmentsTabContent
              onUpdate={onUpdate}
              highlightIds={highlightInvestmentIds}
              onTotalInvestmentsChange={setTotalInvestments}
            />
          )}
          {activeTab === 'payment-methods' && (
            <PaymentMethodsTabContent
              onUpdate={onPaymentMethodsUpdate || onUpdate}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default FinancialOverviewModal;
