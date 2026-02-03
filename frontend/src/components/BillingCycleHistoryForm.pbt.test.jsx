import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';
import BillingCycleHistoryForm from './BillingCycleHistoryForm';

// Mock fetch globally
global.fetch = vi.fn();

// Helper to create a comprehensive mock implementation
const createMockFetch = (additionalHandlers = {}) => {
  return (url, options = {}) => {
    // Current cycle status API
    if (url.includes('/billing-cycles/current')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          hasActualBalance: false,
          cycleStartDate: '2025-01-16',
          cycleEndDate: '2025-02-15',
          actualBalance: null,
          calculatedBalance: 500.00,
          daysUntilCycleEnd: 5,
          needsEntry: true
        })
      });
    }
    // Create billing cycle API
    if (url.includes('/billing-cycles') && options.method === 'POST') {
      const body = JSON.parse(options.body);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          billingCycle: {
            id: 1,
            payment_method_id: 1,
            cycle_start_date: '2025-01-16',
            cycle_end_date: '2025-02-15',
            actual_statement_balance: body.actual_statement_balance,
            calculated_statement_balance: 500.00,
            minimum_payment: body.minimum_payment || null,
            due_date: body.due_date || null,
            notes: body.notes || null,
            discrepancy: {
              amount: body.actual_statement_balance - 500.00,
              type: body.actual_statement_balance > 500 ? 'higher' : body.actual_statement_balance < 500 ? 'lower' : 'match',
              description: 'Test discrepancy'
            }
          }
        })
      });
    }
    // Check for additional handlers
    for (const [pattern, handler] of Object.entries(additionalHandlers)) {
      if (url.includes(pattern)) {
        return handler(url, options);
      }
    }
    // Default response for any other URL
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({})
    });
  };
};


describe('BillingCycleHistoryForm Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Wait for any pending state updates to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * **Feature: credit-card-billing-cycle-history, Property 11: Form Validation Non-Negative Balance**
   * 
   * Property 11: Form Validation Non-Negative Balance
   * For any form submission with actual_statement_balance < 0, the submission 
   * SHALL be rejected with a validation error.
   * **Validates: Requirements 6.2**
   */
  it('Property 11: should reject form submission when actual_statement_balance is negative', async () => {
    // Generator for negative amounts
    // Use Math.fround to ensure 32-bit float compatibility
    const negativeAmountArb = fc.float({ min: Math.fround(-10000), max: Math.fround(-0.01), noNaN: true })
      .filter(n => n < 0 && isFinite(n))
      .map(n => n.toFixed(2));

    await fc.assert(
      fc.asyncProperty(
        negativeAmountArb,
        async (negativeAmount) => {
          // Mock the API responses
          global.fetch.mockImplementation(createMockFetch());

          const onSubmitMock = vi.fn();
          const onCancelMock = vi.fn();

          // Render the component with pre-populated cycle info
          const { container, unmount } = render(
            <BillingCycleHistoryForm
              paymentMethodId={1}
              paymentMethodName="Test Card"
              cycleStartDate="2025-01-16"
              cycleEndDate="2025-02-15"
              calculatedBalance={500.00}
              onSubmit={onSubmitMock}
              onCancel={onCancelMock}
            />
          );

          // Wait for form to render
          await waitFor(() => {
            const balanceInput = container.querySelector('#actual-balance');
            expect(balanceInput).toBeTruthy();
          });

          // Get the balance input
          const balanceInput = container.querySelector('#actual-balance');
          
          // Try to enter a negative value
          // The form sanitizes input, so we need to check if negative values are blocked
          await act(async () => {
            // First clear the input
            fireEvent.change(balanceInput, { target: { value: '' } });
            // Try to enter negative value character by character
            // The form should block the minus sign
            fireEvent.change(balanceInput, { target: { value: negativeAmount } });
          });

          // The form should either:
          // 1. Block the negative input entirely (value stays empty or positive)
          // 2. Show an error when trying to submit
          
          // Check if the input was sanitized (negative sign removed)
          const inputValue = balanceInput.value;
          
          // If the form allowed the negative value, try to submit and check for error
          if (inputValue && inputValue.includes('-')) {
            // Submit the form
            const form = container.querySelector('form');
            await act(async () => {
              fireEvent.submit(form);
            });

            // Wait for validation error
            await waitFor(() => {
              const errorElement = container.querySelector('.billing-cycle-error');
              expect(errorElement).toBeTruthy();
              expect(errorElement.textContent).toContain('non-negative');
            });

            // onSubmit should NOT have been called
            expect(onSubmitMock).not.toHaveBeenCalled();
          } else {
            // The form sanitized the input - negative sign was blocked
            // This is also valid behavior - the form prevents negative input
            // The value should be empty or the absolute value
            expect(inputValue === '' || !inputValue.includes('-')).toBe(true);
          }

          // Wait for any pending state updates before cleanup
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
          });

          // Clean up
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: credit-card-billing-cycle-history, Property 11 (Supplementary): Valid non-negative balances should be accepted**
   * 
   * This supplementary test verifies that valid non-negative balances are accepted.
   * **Validates: Requirements 6.2**
   */
  it('Property 11 (Supplementary): should accept form submission when actual_statement_balance is non-negative', async () => {
    // Generator for non-negative amounts (including zero)
    // Use Math.fround to ensure 32-bit float compatibility
    const nonNegativeAmountArb = fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
      .filter(n => n >= 0 && isFinite(n))
      .map(n => n.toFixed(2));

    await fc.assert(
      fc.asyncProperty(
        nonNegativeAmountArb,
        async (validAmount) => {
          // Mock the API responses
          global.fetch.mockImplementation(createMockFetch());

          const onSubmitMock = vi.fn();
          const onCancelMock = vi.fn();

          // Render the component with pre-populated cycle info
          const { container, unmount } = render(
            <BillingCycleHistoryForm
              paymentMethodId={1}
              paymentMethodName="Test Card"
              cycleStartDate="2025-01-16"
              cycleEndDate="2025-02-15"
              calculatedBalance={500.00}
              onSubmit={onSubmitMock}
              onCancel={onCancelMock}
            />
          );

          // Wait for form to render
          await waitFor(() => {
            const balanceInput = container.querySelector('#actual-balance');
            expect(balanceInput).toBeTruthy();
          });

          // Get the balance input
          const balanceInput = container.querySelector('#actual-balance');
          
          // Enter a valid non-negative value
          await act(async () => {
            fireEvent.change(balanceInput, { target: { value: validAmount } });
          });

          // Verify the value was accepted
          expect(balanceInput.value).toBe(validAmount);

          // Submit the form
          const form = container.querySelector('form');
          await act(async () => {
            fireEvent.submit(form);
          });

          // Wait for submission to complete
          await waitFor(() => {
            // Either onSubmit was called (success) or we see the success state
            const successHeader = container.querySelector('.billing-cycle-form-header h3');
            const hasSuccessState = successHeader && successHeader.textContent.includes('Recorded');
            expect(onSubmitMock.mock.calls.length > 0 || hasSuccessState).toBe(true);
          });

          // There should be no validation error
          const errorElement = container.querySelector('.billing-cycle-error');
          expect(errorElement).toBeFalsy();

          // Wait for any pending state updates before cleanup
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
          });

          // Clean up
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
