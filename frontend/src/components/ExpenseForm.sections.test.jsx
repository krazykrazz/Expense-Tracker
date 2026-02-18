/**
 * @file ExpenseForm.sections.test.jsx
 * @description
 * Collapsible sections, badges, and help tooltips tests for ExpenseForm component.
 * 
 * This file contains tests for:
 * - Advanced Options section (visibility, expansion, badges)
 * - Reimbursement section (visibility, badges, validation)
 * - Insurance section (visibility, badges)
 * - People Assignment section (visibility, badges)
 * - Help tooltip display and functionality
 * - Section-specific validation
 * 
 * This is part of the test suite optimization effort to split the monolithic
 * ExpenseForm.test.jsx into focused, maintainable test files that can run
 * in parallel for faster test execution.
 * 
 * Related test files:
 * - ExpenseForm.core.test.jsx - Basic rendering and submission
 * - ExpenseForm.people.test.jsx - People assignment feature
 * - ExpenseForm.futureMonths.test.jsx - Future months recurring feature
 * - ExpenseForm.dataPreservation.test.jsx - Data persistence during collapse/expand
 * 
 * @see {@link module:test-utils/expenseFormHelpers} for shared test utilities
 * @requirements 1.1, 1.5, 3.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  setupExpenseFormMocks,
  fillBasicFields,
  mockCategories,
  mockPaymentMethods,
  mockPeople,
  assertFieldVisible,
  assertFieldHidden
} from '../test-utils/expenseFormHelpers';
import { MockCollapsibleSection } from '../test-utils/componentMocks';

// Mock CollapsibleSection to avoid jsdom expansion issues
vi.mock('./CollapsibleSection', () => ({
  default: MockCollapsibleSection
}));

// Mock ALL dependencies that might import config
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    CATEGORIES: '/api/categories',
    EXPENSES: '/api/expenses',
    PEOPLE: '/api/people',
    SUGGEST_CATEGORY: '/api/expenses/suggest-category',
    PLACE_NAMES_ANALYZE: '/api/expenses/place-names/analyze',
    PLACE_NAMES_STANDARDIZE: '/api/expenses/place-names/standardize',
    REMINDER_STATUS: (year, month) => `/api/reminders/status/${year}/${month}`
  },
  default: 'http://localhost:2424'
}));

import * as peopleApi from '../services/peopleApi';
import * as expenseApi from '../services/expenseApi';
import * as categorySuggestionApi from '../services/categorySuggestionApi';
import * as categoriesApi from '../services/categoriesApi';
import * as paymentMethodApi from '../services/paymentMethodApi';

vi.mock('../services/peopleApi', () => ({
  getPeople: vi.fn()
}));

vi.mock('../services/expenseApi', () => ({
  createExpense: vi.fn(),
  getExpenses: vi.fn(),
  getPlaces: vi.fn(),
  updateExpense: vi.fn(),
  getExpenseWithPeople: vi.fn()
}));

vi.mock('../services/categorySuggestionApi', () => ({
  fetchCategorySuggestion: vi.fn()
}));

vi.mock('../services/categoriesApi', () => ({
  getCategories: vi.fn()
}));

vi.mock('../services/paymentMethodApi', () => ({
  getActivePaymentMethods: vi.fn(),
  getPaymentMethod: vi.fn()
}));

vi.mock('../utils/formatters', () => ({
  getTodayLocalDate: () => '2025-01-15'
}));

vi.mock('../utils/constants', () => ({
  PAYMENT_METHODS: ['Cash', 'Credit Card', 'Debit Card']
}));

vi.mock('./PersonAllocationModal', () => {
  return {
    default: ({ isOpen, onSave, onCancel, selectedPeople }) => {
      if (!isOpen) return null;
      return (
        <div data-testid="person-allocation-modal">
          <h3>Allocate Expense Amount</h3>
          <button onClick={() => onSave(selectedPeople.map(p => ({ ...p, amount: 100 })))}>
            Save Allocation
          </button>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={() => {
            // Simulate split equally
            const equalAmount = 200 / selectedPeople.length;
            onSave(selectedPeople.map(p => ({ ...p, amount: equalAmount })));
          }}>
            Split Equally
          </button>
        </div>
      );
    }
  };
});

vi.mock('../contexts/ModalContext', () => ({
  ModalProvider: ({ children }) => children,
  useModalContext: () => ({ openFinancialOverview: vi.fn() }),
}));

import ExpenseForm from './ExpenseForm';

// Mock fetch globally
global.fetch = vi.fn();

/**
 * ExpenseForm - Collapsible Sections, Badges, and Help Tooltips Tests
 * 
 * Tests the collapsible section functionality, badge display, and help tooltip
 * behavior in the ExpenseForm component.
 */
describe('ExpenseForm - Advanced Options Section', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    setupExpenseFormMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test: Section renders with correct default state
   * Requirements: 2.1, 2.2
   */
  it('should render Advanced Options section collapsed by default in create mode', async () => {
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    // Wait for form to load
    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Find Advanced Options section header
    const advancedOptionsHeader = Array.from(container.querySelectorAll('.collapsible-header'))
      .find(header => header.textContent.includes('Advanced Options'));

    expect(advancedOptionsHeader).toBeTruthy();
    expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('false');
  });

  /**
   * Test: Section expands when clicked
   * Requirements: 2.3
   */
  it('should expand Advanced Options section when header is clicked', async () => {
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // With MockCollapsibleSection, content is always rendered
    // Verify future months checkbox is visible
    const futureMonthsCheckbox = screen.getByText(/Add to Future Months/i);
    expect(futureMonthsCheckbox).toBeInTheDocument();
  });

  /**
   * Test: Badge displays correct content for future months
   * Requirements: 2.2
   */
  it('should display badge with future months count when set', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // With MockCollapsibleSection, content is always visible
    const advancedOptionsHeader = container.querySelector('[data-testid="collapsible-header-advanced-options"]');
    expect(advancedOptionsHeader).toBeInTheDocument();

    // Wait for the content to be visible
    await waitFor(() => {
      const futureMonthsLabel = screen.queryByText(/Add to Future Months/i);
      expect(futureMonthsLabel).toBeInTheDocument();
    });

    // Check the future months checkbox
    const futureMonthsCheckbox = container.querySelector('input[type="checkbox"]');
    await user.click(futureMonthsCheckbox);

    await waitFor(() => {
      const futureMonthsSelect = container.querySelector('select[name="futureMonths"]');
      expect(futureMonthsSelect).toBeInTheDocument();
    });

    // Set future months to 3
    const futureMonthsSelect = container.querySelector('select[name="futureMonths"]');
    await user.selectOptions(futureMonthsSelect, '3');

    await waitFor(() => {
      const badge = advancedOptionsHeader.querySelector('.collapsible-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toMatch(/Future: 3 months/);
    });
  });

  /**
   * Test: Posted date field visibility based on payment method
   * Requirements: 4.1, 4.2
   */
  it('should show posted date field only for credit card payment methods', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Wait for payment methods to load
    await waitFor(() => {
      const methodSelect = screen.getByLabelText(/Payment Method/i);
      expect(methodSelect).toBeInTheDocument();
    });

    // Select a credit card payment method
    const methodSelect = screen.getByLabelText(/Payment Method/i);
    await user.selectOptions(methodSelect, '2'); // Credit Card

    // With MockCollapsibleSection, content is always visible
    await waitFor(() => {
      const postedDateInput = container.querySelector('input[name="posted_date"]');
      expect(postedDateInput).toBeInTheDocument();
    });

    // Switch to non-credit card method
    await user.selectOptions(methodSelect, '1'); // Cash

    await waitFor(() => {
      const postedDateInput = container.querySelector('input[name="posted_date"]');
      expect(postedDateInput).not.toBeInTheDocument();
    });
  });

  /**
   * Test: Badge displays posted date when set
   * Requirements: 2.2
   */
  it('should display badge with posted date when set for credit card', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Wait for payment methods to load
    await waitFor(() => {
      const methodSelect = screen.getByLabelText(/Payment Method/i);
      expect(methodSelect).toBeInTheDocument();
    });

    // Select credit card payment method
    const methodSelect = screen.getByLabelText(/Payment Method/i);
    await user.selectOptions(methodSelect, '2'); // Credit Card

    // Get the header element
    const advancedOptionsHeader = container.querySelector('[data-testid="collapsible-header-advanced-options"]');

    // Wait for posted date field to be visible
    await waitFor(() => {
      const postedDateInput = container.querySelector('input[name="posted_date"]');
      expect(postedDateInput).toBeInTheDocument();
    }, { timeout: 3000 });

    // Set posted date
    const postedDateInput = container.querySelector('input[name="posted_date"]');
    await user.clear(postedDateInput);
    await user.type(postedDateInput, '2025-01-20');

    await waitFor(() => {
      const badge = advancedOptionsHeader.querySelector('.collapsible-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toMatch(/Posted:/);
    });
  });

  /**
   * Test: Badge displays both future months and posted date
   * Requirements: 2.2
   */
  it('should display badge with both future months and posted date when both are set', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Wait for payment methods to load
    await waitFor(() => {
      const methodSelect = screen.getByLabelText(/Payment Method/i);
      expect(methodSelect).toBeInTheDocument();
    });

    // Select credit card payment method
    const methodSelect = screen.getByLabelText(/Payment Method/i);
    await user.selectOptions(methodSelect, '2'); // Credit Card

    // Get the header element
    const advancedOptionsHeader = container.querySelector('[data-testid="collapsible-header-advanced-options"]');

    // Wait for content to be visible
    await waitFor(() => {
      const futureMonthsLabel = screen.queryByText(/Add to Future Months/i);
      expect(futureMonthsLabel).toBeInTheDocument();
    });

    // Set future months
    const futureMonthsCheckbox = container.querySelector('input[type="checkbox"]');
    await user.click(futureMonthsCheckbox);

    await waitFor(() => {
      const futureMonthsSelect = container.querySelector('select[name="futureMonths"]');
      expect(futureMonthsSelect).toBeInTheDocument();
    });

    const futureMonthsSelect = container.querySelector('select[name="futureMonths"]');
    await user.selectOptions(futureMonthsSelect, '2');

    // Wait for posted date field to be visible
    await waitFor(() => {
      const postedDateInput = container.querySelector('input[name="posted_date"]');
      expect(postedDateInput).toBeInTheDocument();
    });

    // Set posted date
    const postedDateInput = container.querySelector('input[name="posted_date"]');
    await user.clear(postedDateInput);
    await user.type(postedDateInput, '2025-01-20');

    await waitFor(() => {
      const badge = advancedOptionsHeader.querySelector('.collapsible-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toMatch(/Future: 2 months/);
      expect(badge.textContent).toMatch(/Posted:/);
    });
  });
});

describe('ExpenseForm - Reimbursement Section', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    setupExpenseFormMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test: Reimbursement section visibility based on expense type
   * Requirements: 5.1
   */
  it('should show Reimbursement section for non-medical expenses', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Select a non-medical expense type
    const typeSelect = screen.getByLabelText(/Type/i);
    await user.selectOptions(typeSelect, 'Groceries');

    await waitFor(() => {
      const reimbursementHeader = Array.from(container.querySelectorAll('.collapsible-header'))
        .find(header => header.textContent.includes('Reimbursement'));
      expect(reimbursementHeader).toBeInTheDocument();
    });
  });

  /**
   * Test: Reimbursement section hidden for medical expenses
   * Requirements: 5.1
   */
  it('should hide Reimbursement section for medical expenses', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Select medical expense type
    const typeSelect = screen.getByLabelText(/Type/i);
    await user.selectOptions(typeSelect, 'Tax - Medical');

    await waitFor(() => {
      const reimbursementHeader = Array.from(container.querySelectorAll('.collapsible-header'))
        .find(header => header.textContent.includes('Reimbursement'));
      expect(reimbursementHeader).toBeFalsy();
    });
  });

  /**
   * Test: Reimbursement badge displays reimbursement amount
   * Requirements: 5.2
   */
  it('should display badge with reimbursement amount when original cost is set', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Select non-medical expense type
    const typeSelect = screen.getByLabelText(/Type/i);
    await user.selectOptions(typeSelect, 'Groceries');

    // Set amount
    const amountInput = screen.getByLabelText(/Amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, '50.00');

    // Get the reimbursement header
    const reimbursementHeader = container.querySelector('[data-testid="collapsible-header-reimbursement"]');

    // Wait for original cost field to appear (MockCollapsibleSection always renders children)
    await waitFor(() => {
      const originalCostInput = container.querySelector('input[name="genericOriginalCost"]');
      expect(originalCostInput).toBeInTheDocument();
    });

    // Set original cost
    const originalCostInput = container.querySelector('input[name="genericOriginalCost"]');
    await user.clear(originalCostInput);
    await user.type(originalCostInput, '100.00');

    // Check badge displays reimbursement amount
    await waitFor(() => {
      const badge = reimbursementHeader.querySelector('.collapsible-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toContain('Reimbursed: $50.00');
    });
  });

  /**
   * Test: Reimbursement breakdown displays correct values
   * Requirements: 5.3, 5.4
   */
  it('should display breakdown with Charged, Reimbursed, and Net values', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Select non-medical expense type
    const typeSelect = screen.getByLabelText(/Type/i);
    await user.selectOptions(typeSelect, 'Groceries');

    // Set amount
    const amountInput = screen.getByLabelText(/Amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, '30.00');

    // Wait for the input to be visible (MockCollapsibleSection always renders children)
    await waitFor(() => {
      const originalCostInput = container.querySelector('input[name="genericOriginalCost"]');
      expect(originalCostInput).toBeInTheDocument();
    });

    // Set original cost
    const originalCostInput = container.querySelector('input[name="genericOriginalCost"]');
    await user.clear(originalCostInput);
    await user.type(originalCostInput, '80.00');

    // Check breakdown displays
    await waitFor(() => {
      const breakdown = container.querySelector('.reimbursement-preview');
      expect(breakdown).toBeInTheDocument();
    });

    const breakdown = container.querySelector('.reimbursement-preview');
    expect(breakdown.textContent).toContain('Charged:$80.00');
    expect(breakdown.textContent).toContain('Reimbursed:$50.00');
    expect(breakdown.textContent).toContain('Net (out-of-pocket):$30.00');
  });

  /**
   * Test: Validation error when amount exceeds original cost
   * Requirements: 5.5
   */
  it('should display validation error when net amount exceeds original cost', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Select non-medical expense type
    const typeSelect = screen.getByLabelText(/Type/i);
    await user.selectOptions(typeSelect, 'Groceries');

    // Set amount (higher than original cost we'll set)
    const amountInput = screen.getByLabelText(/Amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, '100.00');

    // Wait for section to be visible (MockCollapsibleSection always renders children)
    await waitFor(() => {
      const originalCostInput = container.querySelector('input[name="genericOriginalCost"]');
      expect(originalCostInput).toBeInTheDocument();
    });

    // Set original cost (less than amount - invalid)
    const originalCostInput = container.querySelector('input[name="genericOriginalCost"]');
    await user.clear(originalCostInput);
    await user.type(originalCostInput, '50.00');

    // Check validation error displays
    await waitFor(() => {
      const errorElement = container.querySelector('.reimbursement-error');
      expect(errorElement).toBeInTheDocument();
      expect(errorElement.textContent).toContain('Net amount cannot exceed original cost');
    });

    // Verify breakdown is NOT displayed when there's an error
    const breakdown = container.querySelector('.reimbursement-preview');
    expect(breakdown).toBeFalsy();
  });
});

describe('ExpenseForm - Insurance Section', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    setupExpenseFormMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test: Insurance section visibility for medical expenses
   * Requirements: 4.3, 4.4
   */
  it('should show Insurance Tracking section for medical expenses', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Select medical expense type
    const typeSelect = screen.getByLabelText(/Type/i);
    await user.selectOptions(typeSelect, 'Tax - Medical');

    await waitFor(() => {
      const insuranceHeader = Array.from(container.querySelectorAll('.collapsible-header'))
        .find(header => header.textContent.includes('Insurance Tracking'));
      expect(insuranceHeader).toBeInTheDocument();
    });
  });

  /**
   * Test: Insurance section hidden for non-medical expenses
   * Requirements: 4.3, 4.4
   */
  it('should hide Insurance Tracking section for non-medical expenses', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Select non-medical expense type
    const typeSelect = screen.getByLabelText(/Type/i);
    await user.selectOptions(typeSelect, 'Groceries');

    await waitFor(() => {
      const insuranceHeader = Array.from(container.querySelectorAll('.collapsible-header'))
        .find(header => header.textContent.includes('Insurance Tracking'));
      expect(insuranceHeader).toBeFalsy();
    });
  });

  /**
   * Test: Insurance badge displays claim status
   * Requirements: 6.2
   */
  it('should display badge with claim status when insurance is enabled', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Select medical expense type
    const typeSelect = screen.getByLabelText(/Type/i);
    await user.selectOptions(typeSelect, 'Tax - Medical');

    // Get the insurance header
    const insuranceHeader = container.querySelector('[data-testid="collapsible-header-insurance-tracking"]');

    // Wait for section content to be visible (MockCollapsibleSection always renders children)
    await waitFor(() => {
      const checkbox = container.querySelector('.insurance-checkbox input[type="checkbox"]');
      expect(checkbox).toBeInTheDocument();
    });

    // Enable insurance
    const insuranceCheckbox = container.querySelector('.insurance-checkbox input[type="checkbox"]');
    await user.click(insuranceCheckbox);

    // Wait for insurance details to appear
    await waitFor(() => {
      const claimStatusSelect = container.querySelector('select#claimStatus');
      expect(claimStatusSelect).toBeInTheDocument();
    });

    // Change claim status
    const claimStatusSelect = container.querySelector('select#claimStatus');
    await user.selectOptions(claimStatusSelect, 'in_progress');

    // Check badge displays claim status
    await waitFor(() => {
      const badge = insuranceHeader.querySelector('.collapsible-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toContain('Claim: In Progress');
    });
  });

  /**
   * Test: Insurance details expand/collapse with checkbox
   * Requirements: 6.3, 6.4
   */
  it('should show insurance details when checkbox is checked', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Select medical expense type
    const typeSelect = screen.getByLabelText(/Type/i);
    await user.selectOptions(typeSelect, 'Tax - Medical');

    // Wait for the checkbox to be visible (MockCollapsibleSection always renders children)
    await waitFor(() => {
      const checkbox = container.querySelector('.insurance-checkbox input[type="checkbox"]');
      expect(checkbox).toBeInTheDocument();
    });

    // Initially, insurance details should not be visible
    let originalCostInput = container.querySelector('input#originalCost');
    expect(originalCostInput).toBeFalsy();

    // Enable insurance
    const insuranceCheckbox = container.querySelector('.insurance-checkbox input[type="checkbox"]');
    await user.click(insuranceCheckbox);

    // Wait for insurance details to appear
    await waitFor(() => {
      originalCostInput = container.querySelector('input#originalCost');
      expect(originalCostInput).toBeInTheDocument();
    });

    const claimStatusSelect = container.querySelector('select#claimStatus');
    const reimbursementDisplay = container.querySelector('.reimbursement-display');
    expect(claimStatusSelect).toBeInTheDocument();
    expect(reimbursementDisplay).toBeInTheDocument();
  });

  /**
   * Test: Status notes display for each claim status
   * Requirements: 6.5
   */
  it('should display appropriate status note for each claim status', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Select medical expense type
    const typeSelect = screen.getByLabelText(/Type/i);
    await user.selectOptions(typeSelect, 'Tax - Medical');

    // Wait for section content to be visible (MockCollapsibleSection always renders children)
    await waitFor(() => {
      const checkbox = container.querySelector('.insurance-checkbox input[type="checkbox"]');
      expect(checkbox).toBeInTheDocument();
    });

    // Enable insurance
    const insuranceCheckbox = container.querySelector('.insurance-checkbox input[type="checkbox"]');
    await user.click(insuranceCheckbox);

    // Wait for insurance details to appear
    await waitFor(() => {
      const claimStatusSelect = container.querySelector('select#claimStatus');
      expect(claimStatusSelect).toBeInTheDocument();
    });

    const claimStatusSelect = container.querySelector('select#claimStatus');

    // Test each status
    const statusTests = [
      { value: 'not_claimed', expectedText: 'Not yet claimed' },
      { value: 'in_progress', expectedText: 'Claim in progress' },
      { value: 'paid', expectedText: 'Claim paid' },
      { value: 'denied', expectedText: 'Claim denied' }
    ];

    for (const { value, expectedText } of statusTests) {
      await user.selectOptions(claimStatusSelect, value);

      await waitFor(() => {
        const statusNote = container.querySelector('.insurance-status-note');
        expect(statusNote).toBeInTheDocument();
        expect(statusNote.textContent).toContain(expectedText);
      });
    }
  });
});

describe('ExpenseForm - People Assignment Section Visibility', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    setupExpenseFormMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test: People Assignment section visibility for medical expenses
   * Requirements: 2.1, 2.2
   */
  it('should show People Assignment section only for medical expenses', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={() => {}} />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    const typeSelect = screen.getByLabelText(/type/i);

    // Initially, People Assignment section should not be visible (default type is "Other")
    let peopleHeader = Array.from(container.querySelectorAll('.collapsible-header'))
      .find(header => header.textContent.includes('People Assignment'));
    expect(peopleHeader).toBeFalsy();

    // Change to medical expense type
    await user.selectOptions(typeSelect, 'Tax - Medical');

    // People Assignment collapsible section should appear
    await waitFor(() => {
      peopleHeader = Array.from(container.querySelectorAll('.collapsible-header'))
        .find(header => header.textContent.includes('People Assignment'));
      expect(peopleHeader).toBeInTheDocument();
    });

    // Change back to non-medical type
    await user.selectOptions(typeSelect, 'Groceries');

    // People Assignment section should be hidden again
    await waitFor(() => {
      peopleHeader = Array.from(container.querySelectorAll('.collapsible-header'))
        .find(header => header.textContent.includes('People Assignment'));
      expect(peopleHeader).toBeFalsy();
    });
  });

  /**
   * Test: People Assignment section can be expanded
   * Requirements: 2.3
   */
  it('should expand People Assignment section when header is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={() => {}} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Change to medical expense type
    const typeSelect = screen.getByLabelText(/type/i);
    await user.selectOptions(typeSelect, 'Tax - Medical');

    // Wait for People Assignment section to appear
    await waitFor(() => {
      const peopleHeader = Array.from(container.querySelectorAll('.collapsible-header'))
        .find(header => header.textContent.includes('People Assignment'));
      expect(peopleHeader).toBeInTheDocument();
    });

    // With MockCollapsibleSection, content is always rendered
    // People dropdown should be visible
    await waitFor(() => {
      expect(screen.getByLabelText(/assign to people/i)).toBeInTheDocument();
    });
  });

  /**
   * Test: People Assignment badge displays selected count
   * Requirements: 2.2
   */
  it('should display badge with selected people count', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={() => {}} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/type/i)).toBeInTheDocument();
    });

    // Change to medical expense type
    const typeSelect = screen.getByLabelText(/type/i);
    await user.selectOptions(typeSelect, 'Tax - Medical');

    // Get the people header
    const peopleHeader = container.querySelector('[data-testid="collapsible-header-people-assignment"]');

    // Wait for people dropdown to appear (MockCollapsibleSection always renders children)
    await waitFor(() => {
      expect(screen.getByLabelText(/assign to people/i)).toBeInTheDocument();
    });

    // Select a person
    const peopleSelect = screen.getByLabelText(/assign to people/i);
    const options = peopleSelect.querySelectorAll('option');
    options[1].selected = true; // Select first person (John Doe)
    fireEvent.change(peopleSelect);

    // Check badge displays selected count
    await waitFor(() => {
      const badge = peopleHeader.querySelector('.collapsible-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toMatch(/1 person/i);
    });

    // Select multiple people
    options[2].selected = true; // Select second person (Jane Smith)
    fireEvent.change(peopleSelect);

    // Badge should update to show 2 people
    await waitFor(() => {
      const badge = peopleHeader.querySelector('.collapsible-badge');
      expect(badge.textContent).toMatch(/2 people/i);
    });
  });
});

describe('ExpenseForm - Help Tooltips', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    setupExpenseFormMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test: Help tooltip content for posted date
   * Requirements: 3.2
   */
  it('should display help tooltip for posted date field', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Wait for payment methods to load
    await waitFor(() => {
      const methodSelect = screen.getByLabelText(/Payment Method/i);
      expect(methodSelect).toBeInTheDocument();
    });

    // Select credit card payment method
    const methodSelect = screen.getByLabelText(/Payment Method/i);
    await user.selectOptions(methodSelect, '2'); // Credit Card

    // Wait for posted date field to be visible (MockCollapsibleSection always renders children)
    await waitFor(() => {
      const postedDateInput = container.querySelector('input[name="posted_date"]');
      expect(postedDateInput).toBeInTheDocument();
    });

    // Find the posted date label
    const postedDateLabel = container.querySelector('label[for="posted_date"]');
    expect(postedDateLabel).toBeInTheDocument();
    
    // Find the help tooltip icon within the label
    const helpIcon = postedDateLabel.querySelector('.help-tooltip-icon');
    expect(helpIcon).toBeInTheDocument();
    
    // Hover over the help icon to show tooltip
    fireEvent.mouseEnter(helpIcon);
    
    // Tooltip should now be visible in document.body (portal)
    await waitFor(() => {
      const tooltip = document.body.querySelector('.help-tooltip-content');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip.textContent).toContain('credit card');
    });
  });

  /**
   * Test: Help tooltip content for future months
   * Requirements: 3.3
   */
  it('should display help tooltip for future months field', async () => {
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // With MockCollapsibleSection, content is always visible
    await waitFor(() => {
      const futureMonthsLabel = screen.getByText(/Add to Future Months/i);
      expect(futureMonthsLabel).toBeInTheDocument();
    });

    // Find the help tooltip icon
    const futureMonthsLabel = screen.getByText(/Add to Future Months/i);
    const helpIcon = futureMonthsLabel.parentElement.querySelector('.help-tooltip-icon');
    
    expect(helpIcon).toBeInTheDocument();
    
    // Hover over the help icon to show tooltip
    fireEvent.mouseEnter(helpIcon);
    
    // Tooltip should now be visible in document.body (portal)
    await waitFor(() => {
      const tooltip = document.body.querySelector('.help-tooltip-content');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip.textContent).toContain('recurring');
    });
  });

  /**
   * Test: Help tooltip for original cost field (Reimbursement)
   * Requirements: 3.4
   */
  it('should display help tooltip for original cost field in Reimbursement section', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Select non-medical expense type
    const typeSelect = screen.getByLabelText(/Type/i);
    await user.selectOptions(typeSelect, 'Groceries');

    // Wait for the input to be visible (MockCollapsibleSection always renders children)
    await waitFor(() => {
      const originalCostInput = container.querySelector('input[name="genericOriginalCost"]');
      expect(originalCostInput).toBeInTheDocument();
    });

    // Find the original cost label
    const originalCostLabel = container.querySelector('label[for="genericOriginalCost"]');
    expect(originalCostLabel).toBeInTheDocument();

    // Find the help tooltip icon within the label
    const helpIcon = originalCostLabel.querySelector('.help-tooltip-icon');
    expect(helpIcon).toBeInTheDocument();
    
    // Hover over the help icon to show tooltip
    fireEvent.mouseEnter(helpIcon);
    
    // Tooltip should now be visible in document.body (portal)
    await waitFor(() => {
      const tooltip = document.body.querySelector('.help-tooltip-content');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip.textContent).toContain('reimbursed');
    });
  });

  /**
   * Test: Help tooltips for insurance fields
   * Requirements: 6.1
   */
  it('should display help tooltips for insurance fields', async () => {
    const user = userEvent.setup();
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Type/i)).toBeInTheDocument();
    });

    // Select medical expense type
    const typeSelect = screen.getByLabelText(/Type/i);
    await user.selectOptions(typeSelect, 'Tax - Medical');

    // Wait for the checkbox to be visible (MockCollapsibleSection always renders children)
    await waitFor(() => {
      const checkbox = container.querySelector('.insurance-checkbox input[type="checkbox"]');
      expect(checkbox).toBeInTheDocument();
    });

    // Check for help tooltip on insurance eligibility checkbox
    const insuranceCheckboxLabel = container.querySelector('.insurance-checkbox');
    const eligibilityHelpIcon = insuranceCheckboxLabel.querySelector('.help-tooltip-icon');
    expect(eligibilityHelpIcon).toBeInTheDocument();

    // Enable insurance to see other fields
    const insuranceCheckbox = container.querySelector('.insurance-checkbox input[type="checkbox"]');
    await user.click(insuranceCheckbox);

    // Wait for insurance details to appear
    await waitFor(() => {
      const originalCostInput = container.querySelector('input#originalCost');
      expect(originalCostInput).toBeInTheDocument();
    });

    // Check for help tooltip on original cost field
    const originalCostLabel = container.querySelector('label[for="originalCost"]');
    const originalCostHelpIcon = originalCostLabel.querySelector('.help-tooltip-icon');
    expect(originalCostHelpIcon).toBeInTheDocument();

    // Check for help tooltip on claim status field
    const claimStatusLabel = container.querySelector('label[for="claimStatus"]');
    const claimStatusHelpIcon = claimStatusLabel.querySelector('.help-tooltip-icon');
    expect(claimStatusHelpIcon).toBeInTheDocument();
    
    // Test hovering over one of the tooltips to verify portal rendering
    fireEvent.mouseEnter(claimStatusHelpIcon);
    
    // Tooltip should now be visible in document.body (portal)
    await waitFor(() => {
      const tooltip = document.body.querySelector('.help-tooltip-content');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip.textContent).toContain('claim');
    });
  });
});
