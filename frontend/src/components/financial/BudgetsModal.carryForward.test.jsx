import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import BudgetsModal from './BudgetsModal';
import * as budgetApi from '../../services/budgetApi';

vi.mock('../../services/budgetApi', () => ({
  getBudgets: vi.fn(),
  getBudgetSummary: vi.fn().mockResolvedValue({ totalBudgeted: 0, totalSpent: 0, remaining: 0, budgetsOnTrack: 0, totalBudgets: 0 }),
  createBudget: vi.fn().mockResolvedValue({ id: 1 }),
  updateBudget: vi.fn().mockResolvedValue({ id: 1 }),
  deleteBudget: vi.fn().mockResolvedValue(null),
  copyBudgets: vi.fn().mockResolvedValue({ copied: 2, skipped: 0, overwritten: 0 }),
  getBudgetSuggestion: vi.fn().mockResolvedValue({ suggestedAmount: 0, basedOnMonths: 0, averageSpending: 0 }),
  getBudgetHistory: vi.fn().mockResolvedValue({ categories: {} }),
}));

vi.mock('../../services/categoriesApi', () => ({
  getCategories: vi.fn().mockResolvedValue(['Groceries', 'Dining Out', 'Gas']),
}));

vi.mock('./BudgetCard', () => ({ default: () => null }));
vi.mock('./BudgetProgressBar', () => ({ default: () => null }));
vi.mock('./BudgetPlanTab', () => ({ default: () => null }));
vi.mock('../../hooks/useTabState', () => ({ default: () => ['manage', vi.fn()] }));

const carried = [
  { category: 'Groceries', limit: 400, spent: 0, year: 2025, month: 6, carriedForward: true },
  { category: 'Gas', limit: 100, spent: 0, year: 2025, month: 6, carriedForward: true },
];
const stored = [
  { id: 11, category: 'Gas', limit: 100, spent: 0 },
  { id: 12, category: 'Groceries', limit: 400, spent: 0 },
];

const renderModal = () =>
  render(<BudgetsModal isOpen onClose={vi.fn()} year={2025} month={6} onBudgetUpdated={vi.fn()} />);

const rowFor = async (category) =>
  (await screen.findByText(category, { selector: '.budget-category-name' })).closest('.budget-category-item');

describe('BudgetsModal Manage tab: carried-forward budgets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    budgetApi.getBudgets.mockResolvedValueOnce({ budgets: carried }).mockResolvedValue({ budgets: stored });
  });

  it('says the budgets come from last month', async () => {
    renderModal();

    expect(await screen.findByText(/Showing last month's budgets/)).toBeInTheDocument();
  });

  it('saves the carried budgets before editing one, then updates it by its stored id', async () => {
    renderModal();
    fireEvent.click(within(await rowFor('Groceries')).getByTitle('Edit budget'));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '450' } });
    fireEvent.click(screen.getByTitle('Save'));

    await waitFor(() => expect(budgetApi.updateBudget).toHaveBeenCalledWith(12, 450));
    expect(budgetApi.copyBudgets).toHaveBeenCalledWith(2025, 5, 2025, 6, false);
  });

  it('keeps the other carried budgets when a new category is added', async () => {
    renderModal();
    fireEvent.click(within(await rowFor('Dining Out')).getByTitle('Set budget'));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '80' } });
    fireEvent.click(screen.getByTitle('Save'));

    await waitFor(() => expect(budgetApi.createBudget).toHaveBeenCalledWith(2025, 6, 'Dining Out', 80));
    expect(budgetApi.copyBudgets.mock.invocationCallOrder[0])
      .toBeLessThan(budgetApi.createBudget.mock.invocationCallOrder[0]);
  });

  it('saves the carried budgets before removing one', async () => {
    renderModal();
    fireEvent.click(within(await rowFor('Gas')).getByTitle('Remove budget'));
    fireEvent.click(await screen.findByText('Delete'));

    await waitFor(() => expect(budgetApi.deleteBudget).toHaveBeenCalledWith(11));
    expect(budgetApi.copyBudgets).toHaveBeenCalledWith(2025, 5, 2025, 6, false);
  });

  it('reloads the budget overview after removing a budget', async () => {
    renderModal();
    fireEvent.click(within(await rowFor('Gas')).getByTitle('Remove budget'));
    const summaryCallsBefore = budgetApi.getBudgetSummary.mock.calls.length;
    budgetApi.getBudgets
      .mockResolvedValueOnce({ budgets: stored })
      .mockResolvedValue({ budgets: stored.filter(b => b.category !== 'Gas') });
    fireEvent.click(await screen.findByText('Delete'));

    await waitFor(() => expect(budgetApi.getBudgetSummary.mock.calls.length).toBeGreaterThan(summaryCallsBefore));
    await waitFor(async () => expect(within(await rowFor('Gas')).queryByTitle('Remove budget')).toBeNull());
  });

  it('does not ask to overwrite when only carried-forward budgets are showing', async () => {
    budgetApi.copyBudgets.mockResolvedValue({ copied: 2, skipped: 0, overwritten: 0 });
    renderModal();
    await rowFor('Groceries');

    fireEvent.click(screen.getByText(/Copy from Previous Month/));

    await waitFor(() => expect(budgetApi.copyBudgets).toHaveBeenCalledWith(2025, 5, 2025, 6, true));
    expect(screen.queryByText('Overwrite Budgets')).not.toBeInTheDocument();
  });
});
