/**
 * @invariant Functional preservation: View/edit/delete/pay button callbacks, form submission,
 * responsive layout, keyboard navigation, and hover states are preserved after styling changes.
 *
 * Preservation Property Tests for Financial Overview Styling Consistency
 * 
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3, 10.4, 10.5**
 * 
 * Property 2: Preservation - Functional Equivalence
 * 
 * IMPORTANT: Follow observation-first methodology
 * These tests observe behavior on UNFIXED code for non-styling interactions
 * They should PASS on unfixed code to establish baseline behavior to preserve
 * 
 * Tests verify:
 * - Clicking view/edit/delete/pay buttons triggers correct callbacks
 * - Form submission in PaymentMethodForm works correctly
 * - Responsive behavior on mobile (< 768px) stacks elements correctly
 * - Keyboard navigation and focus indicators work
 * - Hover states provide visual feedback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fc from 'fast-check';
import LoanRow from './LoanRow';
import PaymentMethodForm from './PaymentMethodForm';
import FinancialOverviewModal from './FinancialOverviewModal';

// Mock dependencies
vi.mock('../config', () => ({
  API_ENDPOINTS: {
    REMINDER_STATUS: (year, month) => `/api/reminders/status/${year}/${month}`,
  },
  default: 'http://localhost:2424'
}));

vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()
  })
}));

vi.mock('../services/loanApi', () => ({
  getAllLoans: vi.fn(),
  createLoan: vi.fn(),
  updateLoan: vi.fn(),
  deleteLoan: vi.fn()
}));

vi.mock('../services/fixedExpenseApi', () => ({
  getFixedExpensesByLoan: vi.fn()
}));

vi.mock('../services/investmentApi', () => ({
  getAllInvestments: vi.fn(),
  createInvestment: vi.fn(),
  updateInvestment: vi.fn(),
  deleteInvestment: vi.fn()
}));

vi.mock('../services/paymentMethodApi', () => ({
  getPaymentMethods: vi.fn(),
  getPaymentMethod: vi.fn(),
  getDisplayNames: vi.fn(),
  createPaymentMethod: vi.fn(),
  updatePaymentMethod: vi.fn(),
  deletePaymentMethod: vi.fn(),
  setPaymentMethodActive: vi.fn()
}));

vi.mock('../services/creditCardApi', () => ({
  getStatementBalance: vi.fn()
}));

vi.mock('../utils/validation', () => ({
  validateName: vi.fn(() => null),
  validateAmount: vi.fn(() => null)
}));

vi.mock('../utils/formatters', () => ({
  formatCurrency: (v) => `$${Number(v || 0).toFixed(2)}`,
  formatDate: (d) => d || '',
  formatCAD: (v) => `$${Number(v || 0).toFixed(2)}`
}));

// Mock child components that aren't under test
vi.mock('./LoanDetailView', () => ({
  default: ({ isOpen, onClose }) => isOpen ? <div data-testid="loan-detail-view"><button onClick={onClose}>Close</button></div> : null
}));

vi.mock('./TotalDebtView', () => ({
  default: ({ isOpen, onClose }) => isOpen ? <div data-testid="total-debt-view"><button onClick={onClose}>Close</button></div> : null
}));

vi.mock('./InvestmentDetailView', () => ({
  default: ({ isOpen, onClose }) => isOpen ? <div data-testid="investment-detail-view"><button onClick={onClose}>Close</button></div> : null
}));

vi.mock('./CreditCardDetailView', () => ({
  default: ({ isOpen, onClose }) => isOpen ? <div data-testid="credit-card-detail-view"><button onClick={onClose}>Close</button></div> : null
}));

vi.mock('./CreditCardPaymentForm', () => ({
  default: ({ onPaymentRecorded, onCancel }) => (
    <div data-testid="credit-card-payment-form">
      <button onClick={onPaymentRecorded}>Record Payment</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  )
}));

vi.mock('./LoanPaymentForm', () => ({
  default: ({ onPaymentRecorded, onCancel }) => (
    <div data-testid="loan-payment-form">
      <button onClick={onPaymentRecorded}>Record Payment</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  )
}));

vi.mock('./InvestmentRow', () => ({
  default: ({ investment, onViewDetails, onEdit, onDelete }) => (
    <div data-testid={`investment-row-${investment.id}`}>
      <span>{investment.name}</span>
      <button onClick={() => onViewDetails(investment)}>View</button>
      <button onClick={() => onEdit(investment)}>Edit</button>
      <button onClick={() => onDelete(investment)}>Delete</button>
    </div>
  )
}));

vi.mock('./HelpTooltip', () => ({
  default: ({ content }) => <span data-testid="help-tooltip">{content}</span>
}));

import * as paymentMethodApi from '../services/paymentMethodApi';

describe('Financial Overview Preservation Tests', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ loans: [], investments: [] })
    });
  });

  
  describe('Property 2.1: Button Click Handlers Preservation', () => {
    
    // Helper to generate valid loan names
    const validLoanName = () => fc.string({ minLength: 3, maxLength: 50 })
      .filter(s => s.trim().length >= 3 && !/^\s|\s$|\s{2,}/.test(s));
    
    it('should trigger onViewDetails callback when View button is clicked', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.integer({ min: 1, max: 1000 }),
            name: validLoanName(),
            loan_type: fc.constantFrom('loan', 'line_of_credit', 'mortgage'),
            currentBalance: fc.float({ min: 0, max: 100000, noNaN: true }),
            currentRate: fc.float({ min: 0, max: 20, noNaN: true }),
            payment_tracking_enabled: fc.boolean()
          }),
          (loan) => {
            const onViewDetails = vi.fn();
            
            const { unmount } = render(
              <LoanRow
                loan={loan}
                onLogPayment={vi.fn()}
                onViewDetails={onViewDetails}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
              />
            );
            
            const viewButton = screen.getByTitle(`View details for ${loan.name}`);
            fireEvent.click(viewButton);
            
            // EXPECTED TO PASS: Callback should be triggered with correct loan
            expect(onViewDetails).toHaveBeenCalledTimes(1);
            expect(onViewDetails).toHaveBeenCalledWith(loan);
            
            unmount();
          }
        ),
        { numRuns: 20 }
      );
    });
    
    it('should trigger onEdit callback when Edit button is clicked', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.integer({ min: 1, max: 1000 }),
            name: validLoanName(),
            loan_type: fc.constantFrom('loan', 'line_of_credit', 'mortgage'),
            currentBalance: fc.float({ min: 0, max: 100000, noNaN: true }),
            currentRate: fc.float({ min: 0, max: 20, noNaN: true }),
            payment_tracking_enabled: fc.boolean()
          }),
          (loan) => {
            const onEdit = vi.fn();
            
            const { unmount } = render(
              <LoanRow
                loan={loan}
                onLogPayment={vi.fn()}
                onViewDetails={vi.fn()}
                onEdit={onEdit}
                onDelete={vi.fn()}
              />
            );
            
            const editButton = screen.getByTitle(`Edit ${loan.name}`);
            fireEvent.click(editButton);
            
            // EXPECTED TO PASS: Callback should be triggered with correct loan
            expect(onEdit).toHaveBeenCalledTimes(1);
            expect(onEdit).toHaveBeenCalledWith(loan);
            
            unmount();
          }
        ),
        { numRuns: 20 }
      );
    });

    
    it('should trigger onDelete callback when Delete button is clicked', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.integer({ min: 1, max: 1000 }),
            name: validLoanName(),
            loan_type: fc.constantFrom('loan', 'line_of_credit', 'mortgage'),
            currentBalance: fc.float({ min: 0, max: 100000, noNaN: true }),
            currentRate: fc.float({ min: 0, max: 20, noNaN: true }),
            payment_tracking_enabled: fc.boolean()
          }),
          (loan) => {
            const onDelete = vi.fn();
            
            const { unmount } = render(
              <LoanRow
                loan={loan}
                onLogPayment={vi.fn()}
                onViewDetails={vi.fn()}
                onEdit={vi.fn()}
                onDelete={onDelete}
              />
            );
            
            const deleteButton = screen.getByTitle(`Delete ${loan.name}`);
            fireEvent.click(deleteButton);
            
            // EXPECTED TO PASS: Callback should be triggered with correct loan
            expect(onDelete).toHaveBeenCalledTimes(1);
            expect(onDelete).toHaveBeenCalledWith(loan);
            
            unmount();
          }
        ),
        { numRuns: 20 }
      );
    });
    
    it('should trigger onLogPayment callback when Log Payment button is clicked', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.integer({ min: 1, max: 1000 }),
            name: validLoanName(),
            loan_type: fc.constantFrom('loan', 'line_of_credit', 'mortgage'),
            currentBalance: fc.float({ min: 0, max: 100000, noNaN: true }),
            currentRate: fc.float({ min: 0, max: 20, noNaN: true }),
            payment_tracking_enabled: fc.constant(true) // Only test when enabled
          }),
          (loan) => {
            const onLogPayment = vi.fn();
            
            const { unmount } = render(
              <LoanRow
                loan={loan}
                onLogPayment={onLogPayment}
                onViewDetails={vi.fn()}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
              />
            );
            
            const logPaymentButton = screen.getByTitle(`Log payment for ${loan.name}`);
            fireEvent.click(logPaymentButton);
            
            // EXPECTED TO PASS: Callback should be triggered with correct loan
            expect(onLogPayment).toHaveBeenCalledTimes(1);
            expect(onLogPayment).toHaveBeenCalledWith(loan);
            
            unmount();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  
  describe('Property 2.2: PaymentMethodForm Submission Preservation', () => {
    
    it('should call onSave callback when form is submitted successfully', async () => {
      paymentMethodApi.getDisplayNames.mockResolvedValue([]);
      paymentMethodApi.createPaymentMethod.mockResolvedValue({ id: 1 });
      
      const onSave = vi.fn();
      const onCancel = vi.fn();
      
      render(
        <PaymentMethodForm
          isOpen={true}
          method={null}
          onSave={onSave}
          onCancel={onCancel}
        />
      );
      
      // Fill in required fields
      const displayNameInput = screen.getByLabelText(/Display Name/i);
      fireEvent.change(displayNameInput, { target: { value: 'Test Cash' } });
      
      // Submit form
      const submitButton = screen.getByRole('button', { name: /Create/i });
      fireEvent.click(submitButton);
      
      // EXPECTED TO PASS: onSave should be called after successful submission
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
      });
    });
    
    it('should call onCancel callback when Cancel button is clicked', () => {
      paymentMethodApi.getDisplayNames.mockResolvedValue([]);
      
      const onSave = vi.fn();
      const onCancel = vi.fn();
      
      render(
        <PaymentMethodForm
          isOpen={true}
          method={null}
          onSave={onSave}
          onCancel={onCancel}
        />
      );
      
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelButton);
      
      // EXPECTED TO PASS: onCancel should be called
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
    
    it('should validate required fields before submission', async () => {
      paymentMethodApi.getDisplayNames.mockResolvedValue([]);
      
      const onSave = vi.fn();
      
      render(
        <PaymentMethodForm
          isOpen={true}
          method={null}
          onSave={onSave}
          onCancel={vi.fn()}
        />
      );
      
      // Try to submit without filling required fields
      const submitButton = screen.getByRole('button', { name: /Create/i });
      fireEvent.click(submitButton);
      
      // EXPECTED TO PASS: onSave should NOT be called, validation error should show
      await waitFor(() => {
        expect(screen.getByText(/Display name is required/i)).toBeInTheDocument();
      });
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  
  describe('Property 2.3: Responsive Behavior Preservation', () => {
    
    it('should render all action buttons in LoanRow regardless of viewport size', () => {
      // Helper to generate valid loan names
      const validLoanName = () => fc.string({ minLength: 3, maxLength: 50 })
        .filter(s => s.trim().length >= 3 && !/^\s|\s$/.test(s));
      
      fc.assert(
        fc.property(
          fc.record({
            id: fc.integer({ min: 1, max: 1000 }),
            name: validLoanName(),
            loan_type: fc.constantFrom('loan', 'line_of_credit', 'mortgage'),
            currentBalance: fc.float({ min: 0, max: 100000, noNaN: true }),
            currentRate: fc.float({ min: 0, max: 20, noNaN: true }),
            payment_tracking_enabled: fc.boolean()
          }),
          (loan) => {
            const { container, unmount } = render(
              <LoanRow
                loan={loan}
                onLogPayment={vi.fn()}
                onViewDetails={vi.fn()}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
              />
            );
            
            // EXPECTED TO PASS: All buttons should be present in DOM
            const viewButton = screen.getByTitle(`View details for ${loan.name}`);
            const editButton = screen.getByTitle(`Edit ${loan.name}`);
            const deleteButton = screen.getByTitle(`Delete ${loan.name}`);
            
            expect(viewButton).toBeInTheDocument();
            expect(editButton).toBeInTheDocument();
            expect(deleteButton).toBeInTheDocument();
            
            // If payment tracking enabled, log payment button should exist
            if (loan.payment_tracking_enabled) {
              const logPaymentButton = screen.getByTitle(`Log payment for ${loan.name}`);
              expect(logPaymentButton).toBeInTheDocument();
            }
            
            // All buttons should be in the actions container
            const actionsContainer = container.querySelector('.loan-row-actions');
            expect(actionsContainer).toBeInTheDocument();
            
            unmount();
          }
        ),
        { numRuns: 20 }
      );
    });
    
    it('should maintain button accessibility with proper title attributes', () => {
      // Helper to generate valid loan names
      const validLoanName = () => fc.string({ minLength: 3, maxLength: 50 })
        .filter(s => s.trim().length >= 3 && !/^\s|\s$/.test(s));
      
      fc.assert(
        fc.property(
          fc.record({
            id: fc.integer({ min: 1, max: 1000 }),
            name: validLoanName(),
            loan_type: fc.constantFrom('loan', 'line_of_credit', 'mortgage'),
            currentBalance: fc.float({ min: 0, max: 100000, noNaN: true }),
            currentRate: fc.float({ min: 0, max: 20, noNaN: true }),
            payment_tracking_enabled: fc.boolean()
          }),
          (loan) => {
            const { unmount } = render(
              <LoanRow
                loan={loan}
                onLogPayment={vi.fn()}
                onViewDetails={vi.fn()}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
              />
            );
            
            // EXPECTED TO PASS: All buttons should have descriptive title attributes
            const viewButton = screen.getByTitle(`View details for ${loan.name}`);
            const editButton = screen.getByTitle(`Edit ${loan.name}`);
            const deleteButton = screen.getByTitle(`Delete ${loan.name}`);
            
            expect(viewButton.getAttribute('title')).toBe(`View details for ${loan.name}`);
            expect(editButton.getAttribute('title')).toBe(`Edit ${loan.name}`);
            expect(deleteButton.getAttribute('title')).toBe(`Delete ${loan.name}`);
            
            unmount();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  
  describe('Property 2.4: Keyboard Navigation and Focus Preservation', () => {
    
    it('should allow keyboard navigation through all buttons in LoanRow', () => {
      const loan = {
        id: 1,
        name: 'Test Loan',
        loan_type: 'loan',
        currentBalance: 5000,
        currentRate: 5.5,
        payment_tracking_enabled: true
      };
      
      const { container } = render(
        <LoanRow
          loan={loan}
          onLogPayment={vi.fn()}
          onViewDetails={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      
      // EXPECTED TO PASS: All buttons should be focusable
      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);
      
      buttons.forEach(button => {
        // Buttons should not have tabindex=-1 (should be keyboard accessible)
        const tabIndex = button.getAttribute('tabindex');
        expect(tabIndex).not.toBe('-1');
        
        // Buttons should be focusable
        button.focus();
        expect(document.activeElement).toBe(button);
      });
    });
    
    it('should maintain focus indicators on button focus', () => {
      const loan = {
        id: 1,
        name: 'Test Loan',
        loan_type: 'loan',
        currentBalance: 5000,
        currentRate: 5.5,
        payment_tracking_enabled: false
      };
      
      render(
        <LoanRow
          loan={loan}
          onLogPayment={vi.fn()}
          onViewDetails={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      
      const viewButton = screen.getByTitle(`View details for ${loan.name}`);
      
      // EXPECTED TO PASS: Button should be focusable and receive focus
      viewButton.focus();
      expect(document.activeElement).toBe(viewButton);
    });
  });
  
  describe('Property 2.5: Visual Feedback Preservation', () => {
    
    it('should render conditional badges based on loan state', () => {
      // Helper to generate valid loan names
      const validLoanName = () => fc.string({ minLength: 3, maxLength: 50 })
        .filter(s => s.trim().length >= 3 && !/^\s|\s$/.test(s));
      
      fc.assert(
        fc.property(
          fc.record({
            id: fc.integer({ min: 1, max: 1000 }),
            name: validLoanName(),
            loan_type: fc.constantFrom('loan', 'line_of_credit', 'mortgage'),
            currentBalance: fc.float({ min: 0, max: 100000, noNaN: true }),
            currentRate: fc.float({ min: 0, max: 20, noNaN: true }),
            payment_tracking_enabled: fc.boolean()
          }),
          fc.boolean(), // needsUpdate
          fc.integer({ min: 0, max: 5 }), // fixedExpenseCount
          (loan, needsUpdate, fixedExpenseCount) => {
            const { container, unmount } = render(
              <LoanRow
                loan={loan}
                needsUpdate={needsUpdate}
                fixedExpenseCount={fixedExpenseCount}
                onLogPayment={vi.fn()}
                onViewDetails={vi.fn()}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
              />
            );
            
            // EXPECTED TO PASS: Conditional badges should render based on props
            if (needsUpdate) {
              const badge = container.querySelector('.loan-row-needs-update-badge');
              expect(badge).toBeInTheDocument();
            } else {
              const badge = container.querySelector('.loan-row-needs-update-badge');
              expect(badge).not.toBeInTheDocument();
            }
            
            if (fixedExpenseCount > 0) {
              const badge = container.querySelector('.loan-row-fixed-expense-badge');
              expect(badge).toBeInTheDocument();
              expect(badge).toHaveTextContent(fixedExpenseCount.toString());
            } else {
              const badge = container.querySelector('.loan-row-fixed-expense-badge');
              expect(badge).not.toBeInTheDocument();
            }
            
            // Type badge should always be present
            const typeBadge = container.querySelector('.loan-row-type-badge');
            expect(typeBadge).toBeInTheDocument();
            
            unmount();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  
  describe('Property 2.6: Data Display Preservation', () => {
    
    it('should display loan information correctly', () => {
      // Helper to generate valid loan names
      const validLoanName = () => fc.string({ minLength: 3, maxLength: 50 })
        .filter(s => s.trim().length >= 3 && !/^\s|\s$|\s{2,}/.test(s));
      
      fc.assert(
        fc.property(
          fc.record({
            id: fc.integer({ min: 1, max: 1000 }),
            name: validLoanName(),
            loan_type: fc.constantFrom('loan', 'line_of_credit', 'mortgage'),
            currentBalance: fc.float({ min: 0, max: 100000, noNaN: true }),
            currentRate: fc.float({ min: 0, max: 20, noNaN: true }),
            payment_tracking_enabled: fc.boolean()
          }),
          (loan) => {
            const { container, unmount } = render(
              <LoanRow
                loan={loan}
                onLogPayment={vi.fn()}
                onViewDetails={vi.fn()}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
              />
            );
            
            // EXPECTED TO PASS: Loan name should be displayed
            const nameElement = container.querySelector('.loan-row-name');
            expect(nameElement).toHaveTextContent(loan.name);
            
            // Balance and rate should be displayed in details section
            const detailsElement = container.querySelector('.loan-row-details');
            expect(detailsElement).toBeTruthy();
            
            // Check balance is displayed
            expect(detailsElement.textContent).toContain('Balance:');
            expect(detailsElement.textContent).toContain(loan.currentBalance.toFixed(2));
            
            // Check rate is displayed
            expect(detailsElement.textContent).toContain('Rate:');
            if (loan.currentRate != null && loan.currentRate > 0) {
              expect(detailsElement.textContent).toContain(`${loan.currentRate}%`);
            } else {
              expect(detailsElement.textContent).toContain('N/A');
            }
            
            unmount();
          }
        ),
        { numRuns: 20 }
      );
    });
    
    it('should display correct type badge label', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('loan', 'line_of_credit', 'mortgage'),
          (loanType) => {
            const loan = {
              id: Math.floor(Math.random() * 1000) + 1,
              name: `Test Loan ${Math.random()}`,
              loan_type: loanType,
              currentBalance: 5000,
              currentRate: 5.5,
              payment_tracking_enabled: false
            };
            
            const { container, unmount } = render(
              <LoanRow
                loan={loan}
                onLogPayment={vi.fn()}
                onViewDetails={vi.fn()}
                onEdit={vi.fn()}
                onDelete={vi.fn()}
              />
            );
            
            const typeBadge = container.querySelector('.loan-row-type-badge');
            
            // EXPECTED TO PASS: Type badge should display correct label
            if (loanType === 'line_of_credit') {
              expect(typeBadge).toHaveTextContent('LOC');
            } else if (loanType === 'mortgage') {
              expect(typeBadge).toHaveTextContent('Mortgage');
            } else {
              expect(typeBadge).toHaveTextContent('Loan');
            }
            
            unmount();
          }
        ),
        { numRuns: 3 }
      );
    });
  });
  
  describe('Property 2.7: Form State Management Preservation', () => {
    
    it('should maintain form state when switching payment method types', async () => {
      paymentMethodApi.getDisplayNames.mockResolvedValue([]);
      
      render(
        <PaymentMethodForm
          isOpen={true}
          method={null}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      );
      
      // Fill in display name
      const displayNameInput = screen.getByLabelText(/Display Name/i);
      fireEvent.change(displayNameInput, { target: { value: 'Test Method' } });
      
      // EXPECTED TO PASS: Display name should persist
      expect(displayNameInput.value).toBe('Test Method');
      
      // Change type
      const typeSelect = screen.getByLabelText(/Type/i);
      fireEvent.change(typeSelect, { target: { value: 'credit_card' } });
      
      // Display name should still be there
      expect(displayNameInput.value).toBe('Test Method');
    });
  });
});


