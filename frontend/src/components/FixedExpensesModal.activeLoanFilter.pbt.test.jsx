import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';
import FixedExpensesModal from './FixedExpensesModal';
import * as fixedExpenseApi from '../services/fixedExpenseApi';
import * as paymentMethodApi from '../services/paymentMethodApi';
import * as loanApi from '../services/loanApi';

// Mock the APIs
vi.mock('../services/fixedExpenseApi', () => ({
  getMonthlyFixedExpenses: vi.fn(),
  createFixedExpense: vi.fn(),
  updateFixedExpense: vi.fn(),
  deleteFixedExpense: vi.fn(),
  carryForwardFixedExpenses: vi.fn()
}));

vi.mock('../services/paymentMethodApi', () => ({
  getActivePaymentMethods: vi.fn(),
  getPaymentMethod: vi.fn()
}));

vi.mock('../services/loanApi', () => ({
  getAllLoans: vi.fn()
}));

// Mock payment methods data
const mockPaymentMethods = [
  { id: 1, type: 'cash', display_name: 'Cash', is_active: true },
  { id: 2, type: 'debit', display_name: 'Debit', is_active: true }
];

// Mock fixed expenses data
const mockFixedExpenses = {
  items: [],
  total: 0
};

describe('FixedExpensesModal Active Loans Filter Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixedExpenseApi.getMonthlyFixedExpenses.mockResolvedValue(mockFixedExpenses);
    paymentMethodApi.getActivePaymentMethods.mockResolvedValue(mockPaymentMethods);
    paymentMethodApi.getPaymentMethod.mockResolvedValue(null);
  });

  afterEach(async () => {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * **Feature: fixed-expense-loan-linkage, Property 3: Active Loans Filter**
   * 
   * For any set of loans with various is_paid_off states, the loan dropdown 
   * query should return only loans where is_paid_off = 0, and the count of 
   * returned loans should equal the count of active loans in the input set.
   * 
   * **Validates: Requirements 2.2**
   */
  it('Property 3: should only show active loans (is_paid_off = 0) in the dropdown', async () => {
    // Generator for loan type
    const loanTypeArb = fc.constantFrom('loan', 'mortgage', 'line_of_credit');
    
    // Generator for a single loan
    const loanArb = fc.record({
      id: fc.integer({ min: 1, max: 1000 }),
      name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      loan_type: loanTypeArb,
      is_paid_off: fc.boolean()
    });
    
    // Generator for a set of loans with unique IDs
    const loansArb = fc.array(loanArb, { minLength: 0, maxLength: 20 })
      .map(loans => {
        // Ensure unique IDs
        const seen = new Set();
        return loans.filter(loan => {
          if (seen.has(loan.id)) return false;
          seen.add(loan.id);
          return true;
        });
      });

    await fc.assert(
      fc.asyncProperty(
        loansArb,
        async (loans) => {
          // Convert boolean is_paid_off to 0/1 for consistency
          const normalizedLoans = loans.map(loan => ({
            ...loan,
            is_paid_off: loan.is_paid_off ? 1 : 0
          }));
          
          // Calculate expected active loans count
          const expectedActiveLoans = normalizedLoans.filter(loan => loan.is_paid_off === 0);
          const expectedActiveCount = expectedActiveLoans.length;
          
          // Mock the loan API to return our generated loans
          loanApi.getAllLoans.mockResolvedValue(normalizedLoans);

          // Render the component
          const { container, unmount } = render(
            <FixedExpensesModal 
              isOpen={true} 
              onClose={() => {}} 
              year={2024} 
              month={12} 
              onUpdate={() => {}} 
            />
          );

          // Wait for the component to load
          await waitFor(() => {
            const addButton = container.querySelector('.fixed-expenses-add-toggle-button');
            expect(addButton).toBeTruthy();
          });

          // Click the add button to show the form
          await act(async () => {
            const addButton = container.querySelector('.fixed-expenses-add-toggle-button');
            addButton.click();
          });

          // Wait for the loan dropdown to appear
          await waitFor(() => {
            const loanSelect = container.querySelector('.fixed-expense-add-loan');
            expect(loanSelect).toBeTruthy();
          });

          // Get the loan dropdown
          const loanSelect = container.querySelector('.fixed-expense-add-loan');
          
          // Get all option values (excluding the "No Linked Loan" option)
          const options = Array.from(loanSelect.querySelectorAll('option'));
          const loanOptions = options.filter(opt => opt.value !== '');
          
          // Verify the count matches expected active loans
          expect(loanOptions.length).toBe(expectedActiveCount);
          
          // Verify each option corresponds to an active loan
          const optionIds = loanOptions.map(opt => parseInt(opt.value, 10));
          const activeIds = expectedActiveLoans.map(loan => loan.id);
          
          // All option IDs should be in the active loans list
          for (const optionId of optionIds) {
            expect(activeIds).toContain(optionId);
          }
          
          // All active loan IDs should be in the options
          for (const activeId of activeIds) {
            expect(optionIds).toContain(activeId);
          }

          // Wait for any pending state updates before cleanup
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
          });

          // Clean up
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 120000); // 2 minute timeout for 100 iterations
});
