import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BudgetsModal from './BudgetsModal';

// ── Mock dependencies ──────────────────────────────────────────────────────────

vi.mock('../services/budgetApi', () => ({
  getBudgets: vi.fn().mockResolvedValue({ budgets: [] }),
  getBudgetSummary: vi.fn().mockResolvedValue({ totalBudgeted: 0, totalSpent: 0, remaining: 0, budgetsOnTrack: 0, totalBudgets: 0 }),
  createBudget: vi.fn().mockResolvedValue({ id: 1 }),
  updateBudget: vi.fn().mockResolvedValue({ id: 1 }),
  deleteBudget: vi.fn().mockResolvedValue({ success: true }),
  copyBudgets: vi.fn().mockResolvedValue({ copied: 0 }),
  getBudgetSuggestion: vi.fn().mockResolvedValue({ suggestedAmount: 0, basedOnMonths: 0, averageSpending: 0 }),
  getBudgetHistory: vi.fn().mockResolvedValue({ categories: {} }),
}));

vi.mock('../services/categoriesApi', () => ({
  getCategories: vi.fn().mockResolvedValue(['Groceries', 'Dining Out', 'Gas']),
}));

vi.mock('./BudgetCard', () => ({
  default: ({ category }) => <div data-testid="budget-card">{category}</div>,
}));

vi.mock('./BudgetProgressBar', () => ({
  default: ({ category }) => <div data-testid="budget-progress-bar">{category}</div>,
}));

// Mock useTabState to control tab state in tests
const mockSetActiveTab = vi.fn();
let mockActiveTab = 'manage';

vi.mock('../hooks/useTabState', () => ({
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

    it('renders both tab buttons with correct labels', () => {
      render(<BudgetsModal {...defaultProps} />);
      expect(screen.getByText('📋 Manage')).toBeInTheDocument();
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
      const overlay = document.querySelector('.budgets-modal-overlay');
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
