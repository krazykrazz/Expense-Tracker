import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BudgetPlanTab from './BudgetPlanTab';
import * as budgetApi from '../../services/budgetApi';
import { getAllInvestments } from '../../services/investmentApi';

vi.mock('../../services/budgetApi', () => ({
  getBudgetPlan: vi.fn(),
  createAllocation: vi.fn().mockResolvedValue({ id: 1 }),
  updateAllocation: vi.fn().mockResolvedValue({ id: 1 }),
  deleteAllocation: vi.fn().mockResolvedValue(null),
  copyAllocations: vi.fn().mockResolvedValue({ copied: 1, skipped: 0, overwritten: 0 }),
}));

vi.mock('../../services/investmentApi', () => ({
  getAllInvestments: vi.fn(),
}));

const basePlan = {
  year: 2025,
  month: 6,
  income: 5000,
  fixedExpenses: 1500,
  budgeted: 600,
  allocated: 750,
  unassigned: 2150,
  variableExpenses: 500,
  balance: 3000,
  balanceAfterPlannedSavings: 2250,
  allocationRate: 15,
  allocations: [
    { id: 1, name: 'TFSA', amount: 500, investmentId: 10 },
    { id: 2, name: 'Emergency Fund', amount: 250, investmentId: null },
  ],
};

const renderTab = (props = {}) =>
  render(<BudgetPlanTab year={2025} month={6} onBudgetUpdated={vi.fn()} onManageBudgets={vi.fn()} {...props} />);

describe('BudgetPlanTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    budgetApi.getBudgetPlan.mockResolvedValue(basePlan);
    getAllInvestments.mockResolvedValue([{ id: 10, name: 'My TFSA', type: 'TFSA' }]);
  });

  describe('plan breakdown', () => {
    it('shows where income goes and what is unassigned', async () => {
      renderTab();

      expect(await screen.findByText('Unassigned')).toBeInTheDocument();
      const rows = Object.fromEntries(
        Array.from(document.querySelectorAll('.plan-table tr')).map(tr => [
          tr.querySelector('th').textContent.replace(/^[−=]/, '').replace('Edit in Manage', ''),
          tr.querySelector('td').textContent,
        ])
      );
      expect(rows['Income']).toBe('$5,000.00');
      expect(rows['Fixed expenses']).toBe('$1,500.00');
      expect(rows['Category budgets']).toBe('$600.00');
      expect(rows['Savings & investments']).toBe('$750.00');
      expect(rows['Unassigned']).toBe('$2,150.00');
      expect(rows['Balance after planned savings']).toBe('$2,250.00');
      expect(screen.getByText(/15% of income is planned/)).toBeInTheDocument();
    });

    it('labels a negative result as over-planned', async () => {
      budgetApi.getBudgetPlan.mockResolvedValue({ ...basePlan, unassigned: -300 });
      renderTab();

      expect(await screen.findByText('Over-planned')).toBeInTheDocument();
      expect(document.querySelector('.plan-row-total .plan-amount')).toHaveClass('negative');
    });

    it('explains how to add income instead of showing a misleading remainder', async () => {
      budgetApi.getBudgetPlan.mockResolvedValue({ ...basePlan, income: 0, unassigned: -2850, allocationRate: null });
      renderTab();

      expect(await screen.findByText(/No income is recorded/)).toBeInTheDocument();
      expect(document.querySelector('.plan-row-total .plan-amount').textContent).toBe('—');
    });

    it('points category budget edits to the Manage tab', async () => {
      const onManageBudgets = vi.fn();
      renderTab({ onManageBudgets });

      fireEvent.click(await screen.findByText('Edit in Manage'));

      expect(onManageBudgets).toHaveBeenCalled();
    });

    it('shows an error with retry when the plan cannot be loaded', async () => {
      budgetApi.getBudgetPlan.mockRejectedValueOnce(new Error('boom'));
      renderTab();

      expect(await screen.findByText('boom')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Retry'));
      expect(await screen.findByText('Unassigned')).toBeInTheDocument();
    });
  });

  describe('allocations', () => {
    it('lists allocations with the linked account name', async () => {
      renderTab();

      expect(await screen.findByText('TFSA')).toBeInTheDocument();
      expect(screen.getByText(/My TFSA/)).toBeInTheDocument();
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
    });

    it('creates an allocation linked to an account, prefilling the name from it', async () => {
      const onBudgetUpdated = vi.fn();
      renderTab({ onBudgetUpdated });
      fireEvent.click(await screen.findByText('➕ Add allocation'));

      await waitFor(() => expect(screen.getByRole('option', { name: 'My TFSA (TFSA)' })).toBeInTheDocument());
      fireEvent.change(screen.getByLabelText('Linked account'), { target: { value: '10' } });
      expect(screen.getByLabelText('Allocation name')).toHaveValue('My TFSA');
      fireEvent.change(screen.getByLabelText('Allocation amount'), { target: { value: '125.50' } });
      fireEvent.click(screen.getByTitle('Save'));

      await waitFor(() => expect(budgetApi.createAllocation).toHaveBeenCalledWith(2025, 6, {
        name: 'My TFSA', amount: 125.5, investmentId: 10,
      }));
      expect(budgetApi.copyAllocations).not.toHaveBeenCalled();
      expect(onBudgetUpdated).toHaveBeenCalled();
    });

    it.each([
      ['', '10', 'Name is required'],
      ['RRSP', '', 'Amount'],
      ['RRSP', '0', 'greater than zero'],
    ])('rejects name=%j amount=%j without calling the API', async (name, amount, message) => {
      renderTab();
      fireEvent.click(await screen.findByText('➕ Add allocation'));

      fireEvent.change(screen.getByLabelText('Allocation name'), { target: { value: name } });
      fireEvent.change(screen.getByLabelText('Allocation amount'), { target: { value: amount } });
      fireEvent.click(screen.getByTitle('Save'));

      expect(await screen.findByText(new RegExp(message, 'i'))).toBeInTheDocument();
      expect(budgetApi.createAllocation).not.toHaveBeenCalled();
    });

    it('updates a stored allocation by id', async () => {
      renderTab();
      fireEvent.click(await screen.findByLabelText('Edit Emergency Fund'));

      fireEvent.change(screen.getByLabelText('Allocation amount'), { target: { value: '300' } });
      fireEvent.click(screen.getByTitle('Save'));

      await waitFor(() => expect(budgetApi.updateAllocation).toHaveBeenCalledWith(2, {
        name: 'Emergency Fund', amount: 300, investmentId: null,
      }));
    });

    it('deletes after confirmation', async () => {
      renderTab();
      fireEvent.click(await screen.findByLabelText('Remove Emergency Fund'));
      fireEvent.click(await screen.findByText('Delete'));

      await waitFor(() => expect(budgetApi.deleteAllocation).toHaveBeenCalledWith(2));
    });

    it('shows server errors from a failed save in the form', async () => {
      budgetApi.createAllocation.mockRejectedValueOnce(new Error('An allocation with this name already exists for this month'));
      renderTab();
      fireEvent.click(await screen.findByText('➕ Add allocation'));
      fireEvent.change(screen.getByLabelText('Allocation name'), { target: { value: 'TFSA' } });
      fireEvent.change(screen.getByLabelText('Allocation amount'), { target: { value: '10' } });
      fireEvent.click(screen.getByTitle('Save'));

      expect(await screen.findByText(/already exists/)).toBeInTheDocument();
    });
  });

  describe('carried-forward allocations', () => {
    const carriedPlan = {
      ...basePlan,
      allocations: [{ name: 'TFSA', amount: 500, investmentId: null, carriedForward: true, year: 2025, month: 6 }],
    };
    const storedPlan = { ...basePlan, allocations: [{ id: 42, name: 'TFSA', amount: 500, investmentId: null }] };

    beforeEach(() => {
      budgetApi.getBudgetPlan.mockResolvedValueOnce(carriedPlan).mockResolvedValue(storedPlan);
    });

    it('says the rows come from last month', async () => {
      renderTab();

      expect(await screen.findByText(/Showing last month's allocations/)).toBeInTheDocument();
    });

    it('persists carried rows without overwriting before editing one', async () => {
      renderTab();
      fireEvent.click(await screen.findByLabelText('Edit TFSA'));
      fireEvent.change(screen.getByLabelText('Allocation amount'), { target: { value: '650' } });
      fireEvent.click(screen.getByTitle('Save'));

      await waitFor(() => expect(budgetApi.updateAllocation).toHaveBeenCalledWith(42, {
        name: 'TFSA', amount: 650, investmentId: null,
      }));
      expect(budgetApi.copyAllocations).toHaveBeenCalledWith(2025, 5, 2025, 6, false);
    });

    it('persists carried rows before adding a new allocation so the others are kept', async () => {
      renderTab();
      fireEvent.click(await screen.findByText('➕ Add allocation'));
      fireEvent.change(screen.getByLabelText('Allocation name'), { target: { value: 'RRSP' } });
      fireEvent.change(screen.getByLabelText('Allocation amount'), { target: { value: '100' } });
      fireEvent.click(screen.getByTitle('Save'));

      await waitFor(() => expect(budgetApi.createAllocation).toHaveBeenCalled());
      expect(budgetApi.copyAllocations).toHaveBeenCalledWith(2025, 5, 2025, 6, false);
      expect(budgetApi.copyAllocations.mock.invocationCallOrder[0])
        .toBeLessThan(budgetApi.createAllocation.mock.invocationCallOrder[0]);
    });

    it('persists carried rows before deleting one', async () => {
      renderTab();
      fireEvent.click(await screen.findByLabelText('Remove TFSA'));
      fireEvent.click(await screen.findByText('Delete'));

      await waitFor(() => expect(budgetApi.deleteAllocation).toHaveBeenCalledWith(42));
      expect(budgetApi.copyAllocations).toHaveBeenCalledWith(2025, 5, 2025, 6, false);
    });
  });
});
