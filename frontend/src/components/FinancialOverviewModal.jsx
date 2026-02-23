import { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINTS } from '../config';
import { getAllLoans, createLoan, updateLoan, deleteLoan } from '../services/loanApi';
import { getFixedExpensesByLoan } from '../services/fixedExpenseApi';
import { getAllInvestments, createInvestment, updateInvestment, deleteInvestment } from '../services/investmentApi';
import { getPaymentMethods, getPaymentMethod, deletePaymentMethod, setPaymentMethodActive } from '../services/paymentMethodApi';
import { getStatementBalance } from '../services/creditCardApi';
import CreditCardPaymentForm from './CreditCardPaymentForm';
import LoanRow from './LoanRow';
import InvestmentRow from './InvestmentRow';
import { validateName, validateAmount } from '../utils/validation';
import { formatCurrency, formatDate, formatCAD } from '../utils/formatters';
import { createLogger } from '../utils/logger';
import LoanDetailView from './LoanDetailView';
import TotalDebtView from './TotalDebtView';
import InvestmentDetailView from './InvestmentDetailView';
import PaymentMethodForm from './PaymentMethodForm';
import CreditCardDetailView from './CreditCardDetailView';
import LoanPaymentForm from './LoanPaymentForm';
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

// ─── CreditCardSummary ────────────────────────────────────────────────────────

const CreditCardSummary = ({ paymentMethods, onPaymentRecorded, onViewDetails }) => {
  const [cardData, setCardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingCardId, setPayingCardId] = useState(null);

  const creditCards = (paymentMethods || []).filter(m => m.type === 'credit_card' && m.is_active);

  const fetchCardData = useCallback(async () => {
    if (creditCards.length === 0) { setLoading(false); return; }
    setLoading(true);
    const results = await Promise.all(
      creditCards.map(async (card) => {
        let statementBalance = null;
        let cycleBalance = null;
        try { statementBalance = await getStatementBalance(card.id); } catch { /* silent */ }
        try {
          const method = await getPaymentMethod(card.id);
          cycleBalance = method?.current_cycle?.total_amount ?? null;
        } catch { /* silent */ }
        return { id: card.id, name: card.display_name, currentBalance: card.current_balance, statementBalance, cycleBalance };
      })
    );
    setCardData(results);
    setLoading(false);
  }, [paymentMethods]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchCardData(); }, [fetchCardData]);

  if (creditCards.length === 0) return null;

  const payingCard = payingCardId ? cardData.find(c => c.id === payingCardId) : null;

  if (payingCard) {
    return (
      <div className="financial-cc-summary">
        <CreditCardPaymentForm
          paymentMethodId={payingCard.id}
          paymentMethodName={payingCard.name}
          currentBalance={payingCard.currentBalance}
          onPaymentRecorded={async () => {
            setPayingCardId(null);
            await fetchCardData();
            if (onPaymentRecorded) onPaymentRecorded();
          }}
          onCancel={() => setPayingCardId(null)}
        />
      </div>
    );
  }

  return (
    <div className="financial-cc-summary">
      <div className="financial-cc-summary-title">Credit Cards</div>
      {loading ? (
        <div className="financial-cc-summary-loading">Loading...</div>
      ) : (
        <div className="financial-cc-summary-grid">
          <div className="financial-cc-summary-header-row">
            <span>Card</span>
            <span>Current</span>
            <span>Statement</span>
            <span>Cycle</span>
            <span></span>
          </div>
          {cardData.map(card => (
            <div key={card.id} className="financial-cc-summary-row">
              <span className="financial-cc-name">{card.name}</span>
              <span className="financial-cc-amount">{formatCurrency(card.currentBalance)}</span>
              <span className="financial-cc-amount">{card.statementBalance != null ? formatCurrency(card.statementBalance) : '—'}</span>
              <span className="financial-cc-amount">{card.cycleBalance != null ? formatCurrency(card.cycleBalance) : '—'}</span>
              <span className="financial-cc-pay-cell">
                <button
                  className="financial-cc-view-btn"
                  onClick={() => onViewDetails && onViewDetails(card)}
                  title={`View details for ${card.name}`}
                >
                  View
                </button>
                <button
                  className="financial-cc-pay-btn"
                  onClick={() => setPayingCardId(card.id)}
                  title={`Log payment for ${card.name}`}
                >
                  Pay
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── PaymentMethodsSection ────────────────────────────────────────────────────

const TYPE_LABELS = { debit: 'Debit', cheque: 'Cheque', cash: 'Cash' };

const PaymentMethodsSection = ({ paymentMethods, loading, onPaymentRecorded, onViewDetails, onAddNew }) => {
  const [activeTab, setActiveTab] = useState('active');
  const [cardData, setCardData] = useState([]);
  const [cardLoading, setCardLoading] = useState(true);
  const [payingCardId, setPayingCardId] = useState(null);
  const [reactivating, setReactivating] = useState(null);

  const allMethods = (paymentMethods || []).filter(m => activeTab === 'active' ? m.is_active : !m.is_active);
  const creditCards = allMethods.filter(m => m.type === 'credit_card');
  const otherMethods = allMethods.filter(m => m.type !== 'credit_card');
  const totalCount = allMethods.length;

  const fetchCardData = useCallback(async () => {
    if (creditCards.length === 0) { setCardLoading(false); return; }
    setCardLoading(true);
    const results = await Promise.all(
      creditCards.map(async (card) => {
        let statementBalance = null;
        let cycleBalance = null;
        try { statementBalance = await getStatementBalance(card.id); } catch { /* silent */ }
        try {
          const method = await getPaymentMethod(card.id);
          cycleBalance = method?.current_cycle?.total_amount ?? null;
        } catch { /* silent */ }
        return { id: card.id, name: card.display_name, currentBalance: card.current_balance, statementBalance, cycleBalance };
      })
    );
    setCardData(results);
    setCardLoading(false);
  }, [creditCards]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchCardData(); }, [fetchCardData]);

  const payingCard = payingCardId ? cardData.find(c => c.id === payingCardId) : null;

  const handleReactivate = async (methodId) => {
    setReactivating(methodId);
    try {
      await setPaymentMethodActive(methodId, true);
      // Trigger refresh by calling onPaymentRecorded which should refresh the parent
      if (onPaymentRecorded) onPaymentRecorded();
    } catch (error) {
      logger.error('Failed to reactivate payment method:', error);
      alert('Failed to reactivate payment method. Please try again.');
    } finally {
      setReactivating(null);
    }
  };

  const getTypeBadgeLabel = (type) => TYPE_LABELS[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Other');

  return (
    <div className="financial-section" data-testid="payment-methods-section">
      <div className="financial-section-header">
        <div className="financial-section-header-left">
          <span className="financial-section-icon">💳</span>
          <h3 className="financial-section-title">Payment Methods ({totalCount})</h3>
        </div>
        <button className="financial-section-add-button" onClick={onAddNew} disabled={loading}>+ Add</button>
      </div>
      
      <div className="payment-methods-tabs">
        <button 
          className={`payment-methods-tab ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
          data-testid="active-tab"
        >
          Active
        </button>
        <button 
          className={`payment-methods-tab ${activeTab === 'inactive' ? 'active' : ''}`}
          onClick={() => setActiveTab('inactive')}
          data-testid="inactive-tab"
        >
          Inactive
        </button>
      </div>

      <div className="financial-section-content">
        {totalCount === 0 ? (
          <div className="financial-section-empty">No payment methods configured yet. Add one to get started.</div>
        ) : (
          <>
            {creditCards.length > 0 && (
              <div data-testid="cc-subsection" className="payment-methods-cc-subsection">
                {payingCard ? (
                  <CreditCardPaymentForm
                    paymentMethodId={payingCard.id}
                    paymentMethodName={payingCard.name}
                    currentBalance={payingCard.currentBalance}
                    onPaymentRecorded={async () => {
                      setPayingCardId(null);
                      await fetchCardData();
                      if (onPaymentRecorded) onPaymentRecorded();
                    }}
                    onCancel={() => setPayingCardId(null)}
                  />
                ) : cardLoading ? (
                  <div className="financial-cc-summary-loading">Loading...</div>
                ) : (
                  <div className="financial-cc-summary-grid">
                    <div className="financial-cc-summary-header-row">
                      <span>Card</span>
                      <span>Current</span>
                      <span>Statement</span>
                      <span>Cycle</span>
                      <span></span>
                    </div>
                    {cardData.map(card => (
                      <div key={card.id} className="financial-cc-summary-row">
                        <span className="financial-cc-name">{card.name}</span>
                        <span className="financial-cc-amount">{formatCurrency(card.currentBalance)}</span>
                        <span className="financial-cc-amount">{card.statementBalance != null ? formatCurrency(card.statementBalance) : '—'}</span>
                        <span className="financial-cc-amount">{card.cycleBalance != null ? formatCurrency(card.cycleBalance) : '—'}</span>
                        <span className="financial-cc-pay-cell">
                          {activeTab === 'active' ? (
                            <>
                              <button
                                className="financial-cc-view-btn"
                                onClick={() => onViewDetails && onViewDetails(card)}
                                title={`View details for ${card.name}`}
                              >
                                View
                              </button>
                              <button
                                className="financial-cc-pay-btn"
                                onClick={() => setPayingCardId(card.id)}
                                title={`Log payment for ${card.name}`}
                              >
                                Pay
                              </button>
                            </>
                          ) : (
                            <button
                              className="financial-cc-reactivate-btn"
                              onClick={() => handleReactivate(card.id)}
                              disabled={reactivating === card.id}
                              title={`Reactivate ${card.name}`}
                            >
                              {reactivating === card.id ? 'Reactivating...' : 'Reactivate'}
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {otherMethods.length > 0 && (
              <div data-testid="other-subsection" className="payment-methods-other-subsection">
                {creditCards.length > 0 && <div className="payment-methods-subsection-divider">Other Payment Methods</div>}
                {otherMethods.map(method => (
                  <div key={method.id} className="other-payment-method-row">
                    <span className="other-payment-method-name">{method.display_name}</span>
                    <span className="other-payment-method-type-badge" data-testid="type-badge">{getTypeBadgeLabel(method.type)}</span>
                    {activeTab === 'active' ? (
                      <button
                        className="other-payment-method-view-btn"
                        onClick={() => onViewDetails && onViewDetails(method)}
                        title={`View details for ${method.display_name}`}
                      >
                        View
                      </button>
                    ) : (
                      <button
                        className="other-payment-method-reactivate-btn"
                        onClick={() => handleReactivate(method.id)}
                        disabled={reactivating === method.id}
                        title={`Reactivate ${method.display_name}`}
                      >
                        {reactivating === method.id ? 'Reactivating...' : 'Reactivate'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── LoansSection ─────────────────────────────────────────────────────────────

const LoansSection = ({ year, month, onUpdate, highlightIds = [], onTotalDebtChange }) => {
  const [loans, setLoans] = useState([]);
  const [activeTab, setActiveTab] = useState('active');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState(null);
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [showTotalDebt, setShowTotalDebt] = useState(false);
  const [loanFixedExpenseCounts, setLoanFixedExpenseCounts] = useState({});
  const [payingLoan, setPayingLoan] = useState(null);

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

  const handleDeleteLoan = async (loan) => {
    if (!window.confirm('Delete this loan? This will also delete all balance entries.')) return;
    setLoading(true);
    setError(null);
    try {
      await deleteLoan(loan.id);
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

  const handleLogPayment = (loan) => {
    setPayingLoan(loan);
  };

  const handlePaymentRecorded = () => {
    setPayingLoan(null);
    fetchLoans();
    if (onUpdate) onUpdate();
  };

  const activeLoans = loans.filter(l => !l.is_paid_off);
  const paidOffLoans = loans.filter(l => l.is_paid_off);
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
    <div className="financial-section" data-testid="loans-section">
      <div className="financial-section-header">
        <div className="financial-section-header-left">
          <span className="financial-section-icon">🏦</span>
          <h3 className="financial-section-title">Loans ({loans.length})</h3>
        </div>
        <div className="financial-section-header-actions">
          <button
            className="financial-section-debt-trend-button"
            onClick={() => setShowTotalDebt(true)}
            disabled={loading}
            title="View Total Debt Trend"
          >
            📊 View Total Debt Trend
          </button>
          <button
            className="financial-section-add-button"
            onClick={() => { clearForm(); setEditingLoanId(null); setShowAddForm(true); }}
            disabled={loading || showAddForm}
            title="Add New Loan"
          >
            + Add
          </button>
        </div>
      </div>
      <div className="financial-section-content">
        {error && (
          <div className="financial-section-error">
            <div>{error}</div>
            {loans.length === 0 && !loading && (
              <button className="financial-error-retry-button" onClick={fetchLoans}>Retry</button>
            )}
          </div>
        )}
        {loading && loans.length === 0 ? (
          <div className="financial-section-loading">Loading loans...</div>
        ) : (
          <>
            {payingLoan && (
              <div className="financial-section-inline-form">
                <LoanPaymentForm
                  loanId={payingLoan.id}
                  loanName={payingLoan.name}
                  loanType={payingLoan.loan_type}
                  currentBalance={payingLoan.currentBalance}
                  onPaymentRecorded={handlePaymentRecorded}
                  onCancel={() => setPayingLoan(null)}
                />
              </div>
            )}

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

            <div className="financial-section-list">
              {(activeTab === 'active' ? activeLoans : paidOffLoans).length === 0 ? (
                <div className="financial-section-empty">{activeTab === 'active' ? 'No active loans.' : 'No paid off loans yet.'}</div>
              ) : (
                (activeTab === 'active' ? activeLoans : paidOffLoans).map((loan) => (
                  <LoanRow
                    key={loan.id}
                    loan={loan}
                    needsUpdate={highlightIds.includes(loan.id)}
                    fixedExpenseCount={loanFixedExpenseCounts[loan.id] || 0}
                    onLogPayment={handleLogPayment}
                    onViewDetails={(l) => setSelectedLoanId(l.id)}
                    onEdit={handleEditLoan}
                    onDelete={handleDeleteLoan}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── InvestmentsSection ───────────────────────────────────────────────────────

const InvestmentsSection = ({ onUpdate, highlightIds = [], onTotalInvestmentsChange }) => {
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

  const handleDelete = async (investment) => {
    if (!window.confirm('Delete this investment? This will also delete all value entries.')) return;
    setLoading(true);
    setError(null);
    try {
      await deleteInvestment(investment.id);
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

  const handleUpdateValue = (investment) => {
    setSelectedInvestmentId(investment.id);
  };

  const handleViewDetails = (investment) => {
    setSelectedInvestmentId(investment.id);
  };

  if (selectedInvestmentId) {
    const selectedInvestment = investments.find(i => i.id === selectedInvestmentId);
    return (
      <InvestmentDetailView
        investment={selectedInvestment}
        isOpen={true}
        onClose={() => { setSelectedInvestmentId(null); }}
        onUpdate={() => { fetchInvestments(); if (onUpdate) onUpdate(); }}
      />
    );
  }

  return (
    <div className="financial-section" data-testid="investments-section">
      <div className="financial-section-header">
        <div className="financial-section-header-left">
          <span className="financial-section-icon">📈</span>
          <h3 className="financial-section-title">Investments ({investments.length})</h3>
        </div>
        <button
          className="financial-section-add-button"
          onClick={() => { clearForm(); setEditingInvestmentId(null); setShowAddForm(true); }}
          disabled={loading || showAddForm}
          title="Add New Investment"
        >
          + Add
        </button>
      </div>
      <div className="financial-section-content">
        {error && (
          <div className="financial-section-error">
            <div>{error}</div>
            {investments.length === 0 && !loading && (
              <button className="financial-error-retry-button" onClick={fetchInvestments}>Retry</button>
            )}
          </div>
        )}
        {loading && investments.length === 0 ? (
          <div className="financial-section-loading">Loading investments...</div>
        ) : (
          <>
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

            <div className="financial-section-list">
              {investments.length === 0 ? (
                <div className="financial-section-empty">No investments yet. Add one to get started.</div>
              ) : (
                investments.map((investment) => (
                  <InvestmentRow
                    key={investment.id}
                    investment={investment}
                    needsUpdate={highlightIds.includes(investment.id)}
                    onUpdateValue={handleUpdateValue}
                    onViewDetails={handleViewDetails}
                    onEdit={handleEditInvestment}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
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
  const [totalInvestments, setTotalInvestments] = useState(_testNetWorth ? _testNetWorth.totalInvestments : 0);
  const [totalDebt, setTotalDebt] = useState(_testNetWorth ? _testNetWorth.totalDebt : 0);
  const [highlightLoanIds, setHighlightLoanIds] = useState([]);
  const [highlightInvestmentIds, setHighlightInvestmentIds] = useState([]);
  const [creditCardMethods, setCreditCardMethods] = useState([]);
  const [selectedCreditCard, setSelectedCreditCard] = useState(null);
  const [showPaymentMethodForm, setShowPaymentMethodForm] = useState(false);
  const [editingPaymentMethod, setEditingPaymentMethod] = useState(null);

  // Fetch reminder status and payment methods on open
  useEffect(() => {
    if (!isOpen) return;

    const fetchOnOpen = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.REMINDER_STATUS(year, month));
        if (response.ok) {
          const data = await response.json();
          setHighlightLoanIds((data.loans || []).filter(l => !l.hasBalance).map(l => l.id));
          setHighlightInvestmentIds((data.investments || []).filter(i => !i.hasValue).map(i => i.id));
        }
      } catch (err) {
        logger.error('Error fetching reminder status in FinancialOverviewModal:', err);
      }

      // Fetch totals independently so NetWorthSummary is correct
      try {
        const [loansData, investmentsData] = await Promise.all([
          getAllLoans(),
          getAllInvestments(),
        ]);
        const debt = (loansData || [])
          .filter(l => !l.is_paid_off)
          .reduce((sum, l) => sum + (l.currentBalance || 0), 0);
        const assets = (investmentsData || [])
          .reduce((sum, i) => sum + (i.currentValue || 0), 0);
        if (!_testNetWorth) {
          setTotalDebt(debt);
          setTotalInvestments(assets);
        }
      } catch (err) {
        logger.error('Error fetching totals in FinancialOverviewModal:', err);
      }

      // Fetch credit card payment methods
      try {
        const pmData = await getPaymentMethods();
        setCreditCardMethods(pmData || []);
      } catch (err) {
        logger.error('Error fetching payment methods in FinancialOverviewModal:', err);
      }
    };

    fetchOnOpen();
  }, [isOpen, year, month, _testNetWorth]);

  const handleClose = () => {
    if (onUpdate) onUpdate();
    onClose();
  };

  const handleCreditCardViewDetails = (card) => {
    if (card.type && card.type !== 'credit_card') {
      // Non-CC payment method — open edit form
      setEditingPaymentMethod(card);
      setShowPaymentMethodForm(true);
    } else {
      setSelectedCreditCard(card.id);
    }
  };

  const handlePaymentMethodFormSave = async () => {
    setShowPaymentMethodForm(false);
    setEditingPaymentMethod(null);
    try {
      const pmData = await getPaymentMethods();
      setCreditCardMethods(pmData || []);
    } catch (err) {
      logger.error('Error refreshing payment methods:', err);
    }
    if (onPaymentMethodsUpdate) onPaymentMethodsUpdate();
    if (onUpdate) onUpdate();
  };

  if (!isOpen) return null;

  if (showPaymentMethodForm) {
    return (
      <div className="financial-modal-overlay" onClick={handleClose}>
        <div className="financial-modal-container" onClick={(e) => e.stopPropagation()}>
          <PaymentMethodForm
            isOpen={true}
            method={editingPaymentMethod}
            onSave={handlePaymentMethodFormSave}
            onCancel={() => { setShowPaymentMethodForm(false); setEditingPaymentMethod(null); }}
          />
        </div>
      </div>
    );
  }

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

        <div className="financial-unified-content">

          <PaymentMethodsSection
            paymentMethods={creditCardMethods}
            loading={false}
            onPaymentRecorded={async () => {
              try {
                const pmData = await getPaymentMethods();
                setCreditCardMethods(pmData || []);
              } catch (err) {
                logger.error('Error refreshing payment methods after payment:', err);
              }
            }}
            onViewDetails={handleCreditCardViewDetails}
            onAddNew={() => { setEditingPaymentMethod(null); setShowPaymentMethodForm(true); }}
          />

          <LoansSection
            year={year}
            month={month}
            onUpdate={onUpdate}
            highlightIds={highlightLoanIds}
            onTotalDebtChange={setTotalDebt}
          />

          <InvestmentsSection
            onUpdate={onUpdate}
            highlightIds={highlightInvestmentIds}
            onTotalInvestmentsChange={setTotalInvestments}
          />
        </div>

        <CreditCardDetailView
          paymentMethodId={selectedCreditCard}
          isOpen={selectedCreditCard !== null}
          onClose={() => setSelectedCreditCard(null)}
          onUpdate={async () => {
            try {
              const pmData = await getPaymentMethods();
              setCreditCardMethods(pmData || []);
            } catch (err) {
              logger.error('Error refreshing payment methods:', err);
            }
            if (onUpdate) onUpdate();
          }}
          onEdit={(creditCard) => {
            // Close detail view and open edit form
            setSelectedCreditCard(null);
            setEditingPaymentMethod(creditCard);
            setShowPaymentMethodForm(true);
          }}
        />
      </div>
    </div>
  );
};

export default FinancialOverviewModal;
