import { useState, useEffect } from 'react';
import useCarryForward from '../../hooks/useCarryForward';
import {
  getBudgetPlan,
  createAllocation,
  updateAllocation,
  deleteAllocation,
  copyAllocations
} from '../../services/budgetApi';
import { getAllInvestments } from '../../services/investmentApi';
import { validateAmount } from '../../utils/validation';
import { formatCAD } from '../../utils/formatters';
import { createLogger } from '../../utils/logger';
import ConfirmDialog from '../shared/ConfirmDialog';

const logger = createLogger('BudgetPlanTab');

const EMPTY_CONFIRM = { open: false, title: '', message: '', onConfirm: null };

const PlanRow = ({ label, sign, amount, children, strong = false, negative = false }) => (
  <tr className={strong ? 'plan-row-total' : undefined}>
    <th scope="row">
      <span className="plan-sign" aria-hidden="true">{sign}</span>
      {label}
      {children}
    </th>
    <td className={`plan-amount ${negative ? 'negative' : ''}`}>{amount}</td>
  </tr>
);

/**
 * Plan tab: where this month's income goes. Category budgets are edited on the Manage tab;
 * savings/investment allocations are edited here. Allocations are plans, never expenses.
 */
const BudgetPlanTab = ({ year, month, onBudgetUpdated, onManageBudgets }) => {
  const [plan, setPlan] = useState(null);
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState(null);
  const [confirmState, setConfirmState] = useState(EMPTY_CONFIRM);

  const loadPlan = async () => {
    const data = await getBudgetPlan(year, month);
    setPlan(data);
    return data.allocations;
  };

  const fetchPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      await loadPlan();
    } catch (err) {
      setError(err.message || 'Network error. Unable to load the plan.');
      logger.error('Error fetching budget plan:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlan();
  }, [year, month]);

  useEffect(() => {
    getAllInvestments()
      .then(list => setInvestments(list || []))
      .catch(err => logger.error('Error fetching investments:', err));
  }, []);

  const { ensurePersisted } = useCarryForward({
    year,
    month,
    rows: plan?.allocations ?? [],
    copyFn: copyAllocations,
    reload: loadPlan
  });

  const startEdit = (allocation = null) => {
    setFormError(null);
    setEditing({
      originalName: allocation ? allocation.name : null,
      name: allocation ? allocation.name : '',
      amount: allocation ? String(allocation.amount) : '',
      investmentId: allocation?.investmentId ? String(allocation.investmentId) : ''
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setFormError(null);
  };

  const handleAccountChange = (investmentId) => {
    const account = investments.find(inv => String(inv.id) === investmentId);
    setEditing(prev => ({
      ...prev,
      investmentId,
      name: prev.name.trim() === '' && account ? account.name : prev.name
    }));
  };

  const handleSave = async () => {
    const name = editing.name.trim();
    let validation = name ? validateAmount(editing.amount) : 'Name is required';
    if (!validation && parseFloat(editing.amount) <= 0) {
      validation = 'Amount must be greater than zero';
    }
    if (validation) {
      setFormError(validation);
      return;
    }

    const payload = {
      name,
      amount: parseFloat(editing.amount),
      investmentId: editing.investmentId ? Number(editing.investmentId) : null
    };

    setLoading(true);
    setError(null);
    try {
      const stored = await ensurePersisted();
      const target = editing.originalName && stored.find(a => a.name === editing.originalName);
      if (target) {
        await updateAllocation(target.id, payload);
      } else {
        await createAllocation(year, month, payload);
      }
      await loadPlan();
      cancelEdit();
      if (onBudgetUpdated) onBudgetUpdated();
    } catch (err) {
      setFormError(err.message || 'Unable to save the allocation.');
      logger.error('Error saving allocation:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (allocation) => {
    setConfirmState({
      open: true,
      title: 'Remove Allocation',
      message: `Remove the planned ${allocation.name} allocation for this month?`,
      onConfirm: async () => {
        setConfirmState(EMPTY_CONFIRM);
        setLoading(true);
        setError(null);
        try {
          const stored = await ensurePersisted();
          const target = stored.find(a => a.name === allocation.name);
          if (target) {
            await deleteAllocation(target.id);
          }
          await loadPlan();
          if (onBudgetUpdated) onBudgetUpdated();
        } catch (err) {
          setError(err.message || 'Unable to remove the allocation.');
          logger.error('Error deleting allocation:', err);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  if (!plan) {
    return error
      ? (
        <div className="budget-modal-error">
          <div>{error}</div>
          <button className="budget-error-retry-button" onClick={fetchPlan}>Retry</button>
        </div>
      )
      : <div className="budget-modal-loading">Loading plan...</div>;
  }

  const hasIncome = plan.income > 0;
  const overPlanned = plan.unassigned < 0;
  const hasCarriedForward = plan.allocations.some(a => a.carriedForward);
  const accountName = (id) => investments.find(inv => inv.id === id)?.name;

  return (
    <div className="budgets-tab-panel">
      {error && <div className="budget-modal-error"><div>{error}</div></div>}

      <div className="budget-modal-content">
        <h3 className="budget-section-title">Where this month&apos;s income goes</h3>

        {!hasIncome && (
          <div className="budget-info-section">
            <p className="budget-info-text">
              No income is recorded for this month. Add it with <strong>Manage Income</strong> on the main screen to see what is left to assign.
            </p>
          </div>
        )}

        <table className="plan-table">
          <tbody>
            <PlanRow label="Income" sign="" amount={formatCAD(plan.income)} />
            <PlanRow label="Fixed expenses" sign="−" amount={formatCAD(plan.fixedExpenses)} />
            <PlanRow label="Category budgets" sign="−" amount={formatCAD(plan.budgeted)}>
              <button type="button" className="plan-link-button" onClick={onManageBudgets}>
                Edit in Manage
              </button>
            </PlanRow>
            <PlanRow label="Savings &amp; investments" sign="−" amount={formatCAD(plan.allocated)} />
            <PlanRow
              label={overPlanned ? 'Over-planned' : 'Unassigned'}
              sign="="
              strong
              negative={overPlanned}
              amount={hasIncome ? formatCAD(Math.abs(plan.unassigned)) : '—'}
            />
          </tbody>
        </table>
        {hasIncome && plan.allocationRate !== null && (
          <p className="plan-note">{plan.allocationRate}% of income is planned for savings and investments.</p>
        )}

        <h3 className="budget-section-title plan-section-gap">So far this month</h3>
        <table className="plan-table">
          <tbody>
            <PlanRow label="Spent so far (variable)" sign="" amount={formatCAD(plan.variableExpenses)} />
            <PlanRow
              label="Balance"
              sign=""
              negative={plan.balance < 0}
              amount={formatCAD(plan.balance)}
            />
            <PlanRow
              label="Balance after planned savings"
              sign=""
              strong
              negative={plan.balanceAfterPlannedSavings < 0}
              amount={formatCAD(plan.balanceAfterPlannedSavings)}
            />
          </tbody>
        </table>
        <p className="plan-note">Balance matches the main screen and Analytics → Cash Flow. Planned savings are not counted as spending.</p>

        <h3 className="budget-section-title plan-section-gap">Savings &amp; investments</h3>
        {hasCarriedForward && (
          <p className="plan-note">Showing last month&apos;s allocations. They are saved to this month when you change one.</p>
        )}

        <div className="budget-categories-list">
          {plan.allocations.length === 0 && !editing && (
            <p className="plan-note">Nothing planned yet. Add an RRSP, TFSA, emergency fund or any other goal.</p>
          )}

          {plan.allocations.map((allocation) => {
            if (editing && editing.originalName === allocation.name) {
              return null;
            }
            const linked = accountName(allocation.investmentId);
            return (
              <div key={allocation.name} className="budget-category-item">
                <div className="budget-category-name">
                  {allocation.name}
                  {linked && <span className="plan-linked"> 🔗 {linked}</span>}
                </div>
                <div className="budget-category-limit">{formatCAD(allocation.amount)}</div>
                <div className="budget-category-actions">
                  <button
                    className="budget-edit-button"
                    onClick={() => startEdit(allocation)}
                    disabled={loading}
                    title="Edit allocation"
                    aria-label={`Edit ${allocation.name}`}
                  >
                    ✏️
                  </button>
                  <button
                    className="budget-delete-button"
                    onClick={() => handleDelete(allocation)}
                    disabled={loading}
                    title="Remove allocation"
                    aria-label={`Remove ${allocation.name}`}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}

          {editing && (
            <div className="plan-form">
              <input
                type="text"
                aria-label="Allocation name"
                placeholder="Name (e.g. RRSP)"
                value={editing.name}
                maxLength={100}
                onChange={(e) => setEditing(prev => ({ ...prev, name: e.target.value }))}
                disabled={loading}
                autoFocus
              />
              <input
                type="number"
                aria-label="Allocation amount"
                placeholder="0.00"
                step="0.01"
                min="0"
                value={editing.amount}
                onChange={(e) => setEditing(prev => ({ ...prev, amount: e.target.value }))}
                disabled={loading}
              />
              <select
                aria-label="Linked account"
                value={editing.investmentId}
                onChange={(e) => handleAccountChange(e.target.value)}
                disabled={loading}
              >
                <option value="">No linked account</option>
                {investments.map(inv => (
                  <option key={inv.id} value={inv.id}>{inv.name} ({inv.type})</option>
                ))}
              </select>
              <div className="budget-edit-actions">
                <button className="budget-save-button" onClick={handleSave} disabled={loading} title="Save">
                  {loading ? '...' : '✓'}
                </button>
                <button className="budget-cancel-button" onClick={cancelEdit} disabled={loading} title="Cancel">
                  ✕
                </button>
              </div>
              {formError && <span className="validation-error plan-form-error">{formError}</span>}
            </div>
          )}
        </div>

        {!editing && (
          <button className="budget-copy-button" onClick={() => startEdit()} disabled={loading}>
            ➕ Add allocation
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(EMPTY_CONFIRM)}
      />
    </div>
  );
};

export default BudgetPlanTab;
