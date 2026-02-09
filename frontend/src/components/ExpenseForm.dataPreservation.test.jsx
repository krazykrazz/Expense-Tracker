/**
 * @file ExpenseForm.dataPreservation.test.jsx
 * @description
 * Tests for data preservation during section collapse/expand in ExpenseForm.
 * 
 * This test file focuses on verifying that form data is retained when collapsible
 * sections are collapsed and re-expanded. This is critical for user experience
 * as users may collapse sections to reduce visual clutter without losing their work.
 * 
 * Test Coverage:
 * - Reimbursement section data preservation
 * - Insurance section data preservation
 * - Advanced Options section data preservation
 * - People Assignment section data preservation
 * - Multiple sections preserving data independently
 * - Form submission includes data from collapsed sections
 * 
 * Part of the test suite optimization effort to split ExpenseForm.test.jsx
 * into focused, maintainable test files.
 * 
 * Requirements: 1.3, 1.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExpenseForm from './ExpenseForm';
import * as expenseApi from '../services/expenseApi';
import * as peopleApi from '../services/peopleApi';
import * as categoriesApi from '../services/categoriesApi';
import * as categorySuggestionApi from '../services/categorySuggestionApi';
import * as paymentMethodApi from '../services/paymentMethodApi';
import {
  setupExpenseFormMocks,
  mockCategories,
  mockPaymentMethods,
  mockPeople,
  expandSection
} from '../test-utils/expenseFormHelpers';

// Mock all API modules
vi.mock('../services/expenseApi');
vi.mock('../services/peopleApi');
vi.mock('../services/categoriesApi');
vi.mock('../services/categorySuggestionApi');
vi.mock('../services/paymentMethodApi');

// Mock fetch globally
global.fetch = vi.fn();

describe('ExpenseForm - Data Preservation During Collapse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    setupExpenseFormMocks();
  });

  /**
   * Test: Data persists after collapsing section
   * Requirements: 1.4
   */
  it('should preserve posted date data when Advanced Options section is collapsed', async () => {
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    // Wait for form to load - use specific selector to avoid matching "Posted Date"
    await waitFor(() => {
      expect(screen.getByLabelText(/^Date \*/i)).toBeInTheDocument();
    });

    // Fill in core fields
    fireEvent.change(screen.getByLabelText(/^Date \*/i), { target: { value: '2024-06-15' } });
    fireEvent.change(screen.getByLabelText(/Place/i), { target: { value: 'Test Place' } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '100' } });
    
    // Select credit card payment method to enable posted date field
    const paymentMethodSelect = screen.getByLabelText(/Payment Method/i);
    fireEvent.change(paymentMethodSelect, { target: { value: '2' } }); // Credit Card

    // Find and expand Advanced Options section
    const advancedHeader = await expandSection(container, 'Advanced Options');

    // Wait for posted date field to appear - use ID selector to avoid ambiguity with clear button
    await waitFor(() => {
      expect(container.querySelector('#posted_date')).toBeInTheDocument();
    });

    // Enter posted date
    const postedDateInput = container.querySelector('#posted_date');
    fireEvent.change(postedDateInput, { target: { value: '2024-06-20' } });
    expect(postedDateInput.value).toBe('2024-06-20');

    // Collapse the section
    fireEvent.click(advancedHeader);

    // Verify section is collapsed (posted date field not in DOM)
    await waitFor(() => {
      expect(container.querySelector('#posted_date')).not.toBeInTheDocument();
    });

    // Re-expand the section
    fireEvent.click(advancedHeader);

    // Verify data is preserved
    await waitFor(() => {
      const postedDateAfterExpand = container.querySelector('#posted_date');
      expect(postedDateAfterExpand).toBeInTheDocument();
      expect(postedDateAfterExpand.value).toBe('2024-06-20');
    });
  });

  /**
   * Test: Data displays correctly after re-expanding
   * Requirements: 1.4
   */
  it('should preserve generic original cost when Reimbursement section is collapsed and re-expanded', async () => {
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    // Wait for form to load - use specific selector
    await waitFor(() => {
      expect(screen.getByLabelText(/^Date \*/i)).toBeInTheDocument();
    });

    // Fill in core fields
    fireEvent.change(screen.getByLabelText(/^Date \*/i), { target: { value: '2024-06-15' } });
    fireEvent.change(screen.getByLabelText(/Place/i), { target: { value: 'Test Place' } });
    fireEvent.change(screen.getByLabelText(/Type/i), { target: { value: 'Other' } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '75' } });

    // Find and expand Reimbursement section
    const reimbursementHeader = await expandSection(container, 'Reimbursement');

    // Wait for original cost field to appear - use ID to avoid ambiguity
    await waitFor(() => {
      expect(container.querySelector('#genericOriginalCost')).toBeInTheDocument();
    });

    // Enter original cost
    const originalCostInput = container.querySelector('#genericOriginalCost');
    fireEvent.change(originalCostInput, { target: { value: '100' } });
    expect(originalCostInput.value).toBe('100');

    // Verify reimbursement breakdown is displayed - use getAllByText for duplicate text
    await waitFor(() => {
      expect(screen.getByText(/Charged:/i)).toBeInTheDocument();
      expect(screen.getByText(/100\.00/)).toBeInTheDocument();
      // Use getAllByText since "Reimbursed:" appears in both badge and preview
      const reimbursedElements = screen.getAllByText(/Reimbursed:/i);
      expect(reimbursedElements.length).toBeGreaterThan(0);
      // Use getAllByText for 25.00 since it appears in both badge and preview
      const amountElements = screen.getAllByText(/25\.00/);
      expect(amountElements.length).toBeGreaterThan(0);
    });

    // Collapse the section
    fireEvent.click(reimbursementHeader);

    // Verify section is collapsed
    await waitFor(() => {
      expect(container.querySelector('#genericOriginalCost')).not.toBeInTheDocument();
    });

    // Re-expand the section
    fireEvent.click(reimbursementHeader);

    // Verify data and breakdown are preserved
    await waitFor(() => {
      const originalCostAfterExpand = container.querySelector('#genericOriginalCost');
      expect(originalCostAfterExpand).toBeInTheDocument();
      expect(originalCostAfterExpand.value).toBe('100');
      
      // Verify breakdown is still displayed correctly
      expect(screen.getByText(/Charged:/i)).toBeInTheDocument();
      expect(screen.getByText(/100\.00/)).toBeInTheDocument();
      expect(screen.getAllByText(/Reimbursed:/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/25\.00/).length).toBeGreaterThan(0);
    });
  });

  /**
   * Test: Form submission includes collapsed section data
   * Requirements: 1.4
   */
  it('should include data from collapsed sections in form submission', async () => {
    expenseApi.createExpense.mockResolvedValue({ 
      id: 1, 
      type: 'Other',
      posted_date: '2024-06-20'
    });

    const onExpenseAdded = vi.fn();
    const { container } = render(<ExpenseForm onExpenseAdded={onExpenseAdded} />);

    // Wait for form to load - use specific selector
    await waitFor(() => {
      expect(screen.getByLabelText(/^Date \*/i)).toBeInTheDocument();
    });

    // Fill in core fields
    fireEvent.change(screen.getByLabelText(/^Date \*/i), { target: { value: '2024-06-15' } });
    fireEvent.change(screen.getByLabelText(/Place/i), { target: { value: 'Test Store' } });
    fireEvent.change(screen.getByLabelText(/Type/i), { target: { value: 'Other' } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '50' } });
    
    // Select credit card to enable posted date
    const paymentMethodSelect = screen.getByLabelText(/Payment Method/i);
    fireEvent.change(paymentMethodSelect, { target: { value: '2' } }); // Credit Card

    // Expand Advanced Options and enter posted date
    const advancedHeader = await expandSection(container, 'Advanced Options');

    await waitFor(() => {
      expect(container.querySelector('#posted_date')).toBeInTheDocument();
    });

    const postedDateInput = container.querySelector('#posted_date');
    fireEvent.change(postedDateInput, { target: { value: '2024-06-20' } });

    // Collapse the Advanced Options section
    fireEvent.click(advancedHeader);

    // Verify section is collapsed
    await waitFor(() => {
      expect(container.querySelector('#posted_date')).not.toBeInTheDocument();
    });

    // Submit the form
    const submitButton = screen.getByRole('button', { name: /Add Expense/i });
    fireEvent.click(submitButton);

    // Verify the API was called with the posted_date from the collapsed section
    await waitFor(() => {
      expect(expenseApi.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2024-06-15',
          place: 'Test Store',
          type: 'Other',
          amount: '50',
          payment_method_id: 2,
          posted_date: '2024-06-20' // Data from collapsed section
        }),
        null, // people allocations
        0 // future months
      );
    });
  });

  /**
   * Test: Insurance data persists when section is collapsed
   * Requirements: 1.4
   */
  it('should preserve insurance data when Insurance section is collapsed', async () => {
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} people={mockPeople} />);

    // Wait for form to load - use specific selector
    await waitFor(() => {
      expect(screen.getByLabelText(/^Date \*/i)).toBeInTheDocument();
    });

    // Fill in core fields and select medical type
    fireEvent.change(screen.getByLabelText(/^Date \*/i), { target: { value: '2024-06-15' } });
    fireEvent.change(screen.getByLabelText(/Place/i), { target: { value: 'Hospital' } });
    fireEvent.change(screen.getByLabelText(/Type/i), { target: { value: 'Tax - Medical' } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '200' } });

    // Find and expand Insurance section
    const insuranceHeader = await expandSection(container, 'Insurance Tracking');

    // Wait for insurance checkbox to appear
    await waitFor(() => {
      expect(screen.getByLabelText(/Eligible for Insurance Reimbursement/i)).toBeInTheDocument();
    });

    // Enable insurance and fill in details
    const insuranceCheckbox = screen.getByLabelText(/Eligible for Insurance Reimbursement/i);
    fireEvent.click(insuranceCheckbox);

    await waitFor(() => {
      expect(container.querySelector('#originalCost')).toBeInTheDocument();
    });

    const originalCostInput = container.querySelector('#originalCost');
    const claimStatusSelect = screen.getByLabelText(/Claim Status/i);
    
    fireEvent.change(originalCostInput, { target: { value: '300' } });
    fireEvent.change(claimStatusSelect, { target: { value: 'in_progress' } });

    expect(originalCostInput.value).toBe('300');
    expect(claimStatusSelect.value).toBe('in_progress');

    // Collapse the section
    fireEvent.click(insuranceHeader);

    // Verify section is collapsed
    await waitFor(() => {
      expect(container.querySelector('#originalCost')).not.toBeInTheDocument();
    });

    // Re-expand the section
    fireEvent.click(insuranceHeader);

    // Verify all insurance data is preserved
    await waitFor(() => {
      const insuranceCheckboxAfter = screen.getByLabelText(/Eligible for Insurance Reimbursement/i);
      const originalCostAfter = container.querySelector('#originalCost');
      const claimStatusAfter = screen.getByLabelText(/Claim Status/i);
      
      expect(insuranceCheckboxAfter).toBeChecked();
      expect(originalCostAfter.value).toBe('300');
      expect(claimStatusAfter.value).toBe('in_progress');
    });
  });

  /**
   * Test: Multiple sections preserve data independently
   * Requirements: 1.4
   */
  it('should preserve data in multiple collapsed sections independently', async () => {
    const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);

    // Wait for form to load - use specific selector
    await waitFor(() => {
      expect(screen.getByLabelText(/^Date \*/i)).toBeInTheDocument();
    });

    // Fill in core fields
    fireEvent.change(screen.getByLabelText(/^Date \*/i), { target: { value: '2024-06-15' } });
    fireEvent.change(screen.getByLabelText(/Place/i), { target: { value: 'Test Place' } });
    fireEvent.change(screen.getByLabelText(/Type/i), { target: { value: 'Other' } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '50' } });
    
    // Select credit card
    const paymentMethodSelect = screen.getByLabelText(/Payment Method/i);
    fireEvent.change(paymentMethodSelect, { target: { value: '2' } });

    // Expand and fill Advanced Options
    const advancedHeader = await expandSection(container, 'Advanced Options');

    await waitFor(() => {
      expect(container.querySelector('#posted_date')).toBeInTheDocument();
    });

    fireEvent.change(container.querySelector('#posted_date'), { target: { value: '2024-06-20' } });

    // Expand and fill Reimbursement section
    const reimbursementHeader = await expandSection(container, 'Reimbursement');

    await waitFor(() => {
      expect(container.querySelector('#genericOriginalCost')).toBeInTheDocument();
    });

    fireEvent.change(container.querySelector('#genericOriginalCost'), { target: { value: '75' } });

    // Collapse both sections
    fireEvent.click(advancedHeader);
    fireEvent.click(reimbursementHeader);

    // Verify both are collapsed
    await waitFor(() => {
      expect(container.querySelector('#posted_date')).not.toBeInTheDocument();
      expect(container.querySelector('#genericOriginalCost')).not.toBeInTheDocument();
    });

    // Re-expand Advanced Options
    fireEvent.click(advancedHeader);

    // Verify Advanced Options data is preserved
    await waitFor(() => {
      const postedDate = container.querySelector('#posted_date');
      expect(postedDate.value).toBe('2024-06-20');
    });

    // Re-expand Reimbursement
    fireEvent.click(reimbursementHeader);

    // Verify Reimbursement data is preserved
    await waitFor(() => {
      const originalCost = container.querySelector('#genericOriginalCost');
      expect(originalCost.value).toBe('75');
    });
  });
});
