import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import BudgetsModal from './BudgetsModal';
import { getBudgetHistory } from '../../services/budgetApi';

// ── Mock dependencies ──────────────────────────────────────────────────────────

vi.mock('../../services/budgetApi', () => ({
  getBudgets: vi.fn().mockResolvedValue({ budgets: [] }),
  getBudgetSummary: vi.fn().mockResolvedValue({ totalBudgeted: 0, totalSpent: 0, remaining: 0, budgetsOnTrack: 0, totalBudgets: 0 }),
  createBudget: vi.fn().mockResolvedValue({ id: 1 }),
  updateBudget: vi.fn().mockResolvedValue({ id: 1 }),
  deleteBudget: vi.fn().mockResolvedValue({ success: true }),
  copyBudgets: vi.fn().mockResolvedValue({ copied: 0 }),
  getBudgetSuggestion: vi.fn().mockResolvedValue({ suggestedAmount: 0, basedOnMonths: 0, averageSpending: 0 }),
  getBudgetHistory: vi.fn().mockResolvedValue({ categories: {} }),
}));

vi.mock('../../services/categoriesApi', () => ({
  getCategories: vi.fn().mockResolvedValue(['Groceries', 'Dining Out', 'Gas']),
}));

vi.mock('./BudgetCard', () => ({
  default: ({ category }) => <div data-testid="budget-card">{category}</div>,
}));

vi.mock('./BudgetProgressBar', () => ({
  default: ({ category }) => <div data-testid="budget-progress-bar">{category}</div>,
}));

vi.mock('./BudgetPlanTab', () => ({
  default: ({ onManageBudgets }) => (
    <div data-testid="plan-tab">
      <button onClick={onManageBudgets}>go-manage</button>
    </div>
  ),
}));

// Mock useTabState to control tab state in tests
const mockSetActiveTab = vi.fn();
let mockActiveTab = 'manage';

vi.mock('../../hooks/useTabState', () => ({
  default: vi.fn((key, defaultTab) => {
    return [mockActiveTab, mockSetActiveTab];
  }),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  year: 2024,
  month: 3,
  onBudgetUpdated: vi.fn(),
  focusedCategory: null,
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('BudgetsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveTab = 'manage';
    localStorage.clear();
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      render(<BudgetsModal {...defaultProps} isOpen={false} />);
      expect(screen.queryByText('💵 Budgets')).not.toBeInTheDocument();
    });

    it('renders the modal when isOpen is true', () => {
      render(<BudgetsModal {...defaultProps} />);
      expect(screen.getByText(/💵 Budgets/)).toBeInTheDocument();
    });

    it('renders all tab buttons with correct labels', () => {
      render(<BudgetsModal {...defaultProps} />);
      expect(screen.getByText('📋 Manage')).toBeInTheDocument();
      expect(screen.getByText('🧭 Plan')).toBeInTheDocument();
      expect(screen.getByText('📊 History')).toBeInTheDocument();
    });

    it('renders the month and year in the header', () => {
      render(<BudgetsModal {...defaultProps} year={2024} month={3} />);
      expect(screen.getByText(/March 2024/)).toBeInTheDocument();
    });

    it('renders close button', () => {
      render(<BudgetsModal {...defaultProps} />);
      expect(screen.getByLabelText('Close')).toBeInTheDocument();
    });
  });

  describe('Tab rendering', () => {
    it('shows manage tab content when activeTab is manage', async () => {
      mockActiveTab = 'manage';
      render(<BudgetsModal {...defaultProps} />);
      // Manage tab shows the copy button
      await waitFor(() => {
        expect(screen.getByText(/Copy from Previous Month/)).toBeInTheDocument();
      });
    });

    it('shows history tab content when activeTab is history', async () => {
      mockActiveTab = 'history';
      render(<BudgetsModal {...defaultProps} />);
      // History tab shows the period selector
      await waitFor(() => {
        expect(screen.getByText('Time Period:')).toBeInTheDocument();
      });
    });

    it('shows plan tab content when activeTab is plan', () => {
      mockActiveTab = 'plan';
      render(<BudgetsModal {...defaultProps} />);
      expect(screen.getByTestId('plan-tab')).toBeInTheDocument();
      expect(screen.getByText('🧭 Plan')).toHaveClass('active');
    });

    it('lets the plan tab switch to the manage tab', () => {
      mockActiveTab = 'plan';
      render(<BudgetsModal {...defaultProps} />);
      fireEvent.click(screen.getByText('go-manage'));
      expect(mockSetActiveTab).toHaveBeenCalledWith('manage');
    });

    it('manage tab button has active class when manage is selected', () => {
      mockActiveTab = 'manage';
      render(<BudgetsModal {...defaultProps} />);
      const manageBtn = screen.getByText('📋 Manage');
      expect(manageBtn).toHaveClass('active');
    });

    it('history tab button has active class when history is selected', () => {
      mockActiveTab = 'history';
      render(<BudgetsModal {...defaultProps} />);
      const historyBtn = screen.getByText('📊 History');
      expect(historyBtn).toHaveClass('active');
    });
  });

  describe('Tab switching', () => {
    it('calls setActiveTab with "history" when History tab is clicked', () => {
      mockActiveTab = 'manage';
      render(<BudgetsModal {...defaultProps} />);
      fireEvent.click(screen.getByText('📊 History'));
      expect(mockSetActiveTab).toHaveBeenCalledWith('history');
    });

    it('calls setActiveTab with "manage" when Manage tab is clicked', () => {
      mockActiveTab = 'history';
      render(<BudgetsModal {...defaultProps} />);
      fireEvent.click(screen.getByText('📋 Manage'));
      expect(mockSetActiveTab).toHaveBeenCalledWith('manage');
    });
  });

  describe('focusCategory forces manage tab', () => {
    it('calls setActiveTab("manage") when focusedCategory is non-null', () => {
      mockActiveTab = 'history';
      render(<BudgetsModal {...defaultProps} focusedCategory="Groceries" />);
      expect(mockSetActiveTab).toHaveBeenCalledWith('manage');
    });

    it('does not call setActiveTab when focusedCategory is null', () => {
      mockActiveTab = 'history';
      render(<BudgetsModal {...defaultProps} focusedCategory={null} />);
      expect(mockSetActiveTab).not.toHaveBeenCalled();
    });

    it('does not call setActiveTab when focusedCategory is undefined', () => {
      mockActiveTab = 'history';
      const { focusedCategory, ...propsWithoutFocus } = defaultProps;
      render(<BudgetsModal {...propsWithoutFocus} />);
      expect(mockSetActiveTab).not.toHaveBeenCalled();
    });
  });

  describe('initialTab', () => {
    it('switches to the requested tab when opened with one', () => {
      render(<BudgetsModal {...defaultProps} initialTab="plan" />);
      expect(mockSetActiveTab).toHaveBeenCalledWith('plan');
    });
  });

  describe('History planned savings', () => {
    const history = {
      period: { start: '2024-01-01', end: '2024-03-01', months: 3 },
      categories: {
        Groceries: {
          history: [
            { year: 2024, month: 2, budgeted: null, spent: 120, met: null },
            { year: 2024, month: 3, budgeted: 500, spent: 450, met: true }
          ],
          successRate: 100,
          averageSpent: 285,
          averageBudgeted: 500
        }
      },
      plannedSavings: {
        history: [
          { year: 2024, month: 2, planned: 0, saved: 900, met: null },
          { year: 2024, month: 3, planned: 1000, saved: 750, met: false }
        ],
        totalPlanned: 1000,
        totalSaved: 750,
        successRate: 0
      }
    };

    let csv;
    beforeEach(() => {
      mockActiveTab = 'history';
      csv = null;
      vi.stubGlobal('Blob', class { constructor(parts) { csv = parts.join(''); } });
      URL.createObjectURL = vi.fn(() => 'blob:test');
      URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      delete URL.createObjectURL;
      delete URL.revokeObjectURL;
    });

    it('lists planned vs saved per month', async () => {
      getBudgetHistory.mockResolvedValueOnce(history);
      render(<BudgetsModal {...defaultProps} />);

      const section = await screen.findByTestId('history-planned-savings');
      expect(section).toHaveTextContent('Plan met in 0.0% of planned months.');
      const rows = within(section).getAllByRole('row').slice(1);
      expect(rows[0]).toHaveTextContent('No plan');
      expect(rows[1]).toHaveTextContent('$1,000.00');
      expect(rows[1]).toHaveTextContent('$750.00');
      expect(rows[1]).toHaveTextContent('✗ Short');
    });

    it('is hidden when nothing was planned', async () => {
      getBudgetHistory.mockResolvedValueOnce({ ...history, plannedSavings: { ...history.plannedSavings, totalPlanned: 0 } });
      render(<BudgetsModal {...defaultProps} />);

      await screen.findByText('📥 Export to CSV');
      expect(screen.queryByTestId('history-planned-savings')).not.toBeInTheDocument();
    });

    it('exports months without a budget and planned savings rows to CSV', async () => {
      getBudgetHistory.mockResolvedValueOnce(history);
      render(<BudgetsModal {...defaultProps} />);

      fireEvent.click(await screen.findByText('📥 Export to CSV'));

      expect(csv.split('\n')).toEqual([
        'Category,Month,Year,Budgeted,Spent,Variance,Met Budget',
        'Groceries,2,2024,,120.00,,',
        'Groceries,3,2024,500.00,450.00,50.00,Yes',
        'Planned savings,3,2024,1000.00,750.00,-250.00,No'
      ]);
    });
  });

  describe('onClose callback', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<BudgetsModal {...defaultProps} onClose={onClose} />);
      fireEvent.click(screen.getByLabelText('Close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when overlay is clicked', () => {
      const onClose = vi.fn();
      render(<BudgetsModal {...defaultProps} onClose={onClose} />);
      const overlay = document.querySelector('.modal-overlay');
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when modal container is clicked', () => {
      const onClose = vi.fn();
      render(<BudgetsModal {...defaultProps} onClose={onClose} />);
      const container = document.querySelector('.budgets-modal-container');
      fireEvent.click(container);
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
