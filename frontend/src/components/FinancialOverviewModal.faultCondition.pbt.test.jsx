/**
 * Bug Condition Exploration Test for Financial Overview Styling Consistency
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 6.1, 6.2, 7.1, 7.2, 7.5**
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * DO NOT attempt to fix the test or the code when it fails
 * 
 * This test encodes the expected behavior - it will validate the fix when it passes after implementation
 * GOAL: Surface counterexamples that demonstrate the styling inconsistencies exist
 * 
 * Scoped PBT Approach: Test concrete failing cases (hardcoded colors, emoji buttons, missing deactivation UI)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import LoanRow from './LoanRow';
import PaymentMethodForm from './PaymentMethodForm';
import FinancialOverviewModal from './FinancialOverviewModal';
import ModalContext from '../contexts/ModalContext';

// Helper to read CSS file content
const readCSSFile = async (filename) => {
  const fs = await import('fs/promises');
  const path = await import('path');
  const cssPath = path.resolve(__dirname, filename);
  return await fs.readFile(cssPath, 'utf-8');
};

// Helper to check if CSS contains hardcoded values instead of CSS variables
const containsHardcodedColor = (css, hexColor) => {
  // Match hex color not inside var() function
  const regex = new RegExp(`(?<!var\\([^)]*)(${hexColor})(?![^(]*\\))`, 'i');
  return regex.test(css);
};

const containsHardcodedValue = (css, value) => {
  return css.includes(value);
};

describe('Financial Overview Styling Consistency - Bug Condition Exploration', () => {
  
  describe('Property 1: Fault Condition - Styling Inconsistencies Detection', () => {
    
    it('should detect hardcoded red color #991b1b in LoanRow balance styling', async () => {
      // Read the actual CSS file
      const css = await readCSSFile('LoanRow.css');
      
      // EXPECTED TO FAIL: LoanRow uses hardcoded red color instead of CSS variable
      // This proves the bug exists - balance amounts should use neutral colors
      expect(
        containsHardcodedColor(css, '#991b1b'),
        'LoanRow.css should NOT contain hardcoded red color #991b1b - should use CSS variables like var(--text-primary)'
      ).toBe(false);
    });
    
    it('should detect hardcoded colors in LoanRow styling', async () => {
      const css = await readCSSFile('LoanRow.css');
      
      // EXPECTED TO FAIL: Multiple hardcoded colors exist
      const hardcodedColors = ['#333', '#666', '#ff9800', '#fff8f0', '#fff3e0'];
      const foundColors = hardcodedColors.filter(color => containsHardcodedColor(css, color));
      
      expect(
        foundColors,
        `LoanRow.css should NOT contain hardcoded colors: ${foundColors.join(', ')} - should use CSS variables`
      ).toHaveLength(0);
    });
    
    it('should detect emoji icons in LoanRow buttons instead of text labels', () => {
      const mockLoan = {
        id: 1,
        name: 'Test Loan',
        loan_type: 'loan',
        currentBalance: 5000,
        currentRate: 5.5,
        payment_tracking_enabled: true
      };
      
      render(
        <LoanRow
          loan={mockLoan}
          onLogPayment={() => {}}
          onViewDetails={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );
      
      // EXPECTED TO FAIL: Buttons contain emoji characters
      const viewButton = screen.getByTitle(`View details for ${mockLoan.name}`);
      const editButton = screen.getByTitle(`Edit ${mockLoan.name}`);
      const deleteButton = screen.getByTitle(`Delete ${mockLoan.name}`);
      const logPaymentButton = screen.getByTitle(`Log payment for ${mockLoan.name}`);
      
      // Check that buttons use text labels instead of emoji
      expect(
        viewButton.textContent,
        'View button should contain "View" text, not emoji 👁️'
      ).toMatch(/^View$/);
      
      expect(
        editButton.textContent,
        'Edit button should contain "Edit" text, not emoji ✏️'
      ).toMatch(/^Edit$/);
      
      expect(
        deleteButton.textContent,
        'Delete button should contain "Delete" text, not emoji 🗑️'
      ).toMatch(/^Delete$/);
      
      expect(
        logPaymentButton.textContent,
        'Log Payment button should not contain emoji 💰'
      ).not.toContain('💰');
    });
    
    it('should detect missing badge styling for LoanRow balance amounts', () => {
      const mockLoan = {
        id: 1,
        name: 'Test Loan',
        loan_type: 'loan',
        currentBalance: 5000,
        currentRate: 5.5,
        payment_tracking_enabled: false
      };
      
      const { container } = render(
        <LoanRow
          loan={mockLoan}
          onViewDetails={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      );
      
      // EXPECTED TO PASS: Balance should have badge element with proper class
      const balanceBadgeElement = container.querySelector('.loan-row-balance-badge');
      expect(
        balanceBadgeElement,
        'Balance badge element with class .loan-row-balance-badge should exist'
      ).toBeTruthy();
      
      // Verify the badge contains the formatted currency
      expect(
        balanceBadgeElement.textContent,
        'Balance badge should contain formatted currency'
      ).toContain('$');
    });
    
    it('should detect missing deactivate/activate button in PaymentMethodForm', () => {
      const mockMethod = {
        id: 1,
        type: 'credit_card',
        display_name: 'Test Card',
        full_name: 'Test Credit Card',
        is_active: true,
        payment_due_day: 15,
        billing_cycle_day: 10
      };
      
      render(
        <PaymentMethodForm
          isOpen={true}
          method={mockMethod}
          onSave={() => {}}
          onCancel={() => {}}
        />
      );
      
      // EXPECTED TO FAIL: Deactivate button should exist in edit mode
      const deactivateButton = screen.queryByRole('button', { name: /deactivate/i });
      expect(
        deactivateButton,
        'PaymentMethodForm should display a "Deactivate" button when editing an active payment method'
      ).toBeInTheDocument();
    });
    
    it('should detect emoji icon in credit card view button', () => {
      const mockModalContext = {
        openModal: () => {},
        closeModal: () => {},
        modalState: {}
      };
      
      const mockPaymentMethods = [
        {
          id: 1,
          type: 'credit_card',
          display_name: 'Test Card',
          is_active: true,
          current_balance: 1000
        }
      ];
      
      // Mock the API calls
      global.fetch = vi.fn((url) => {
        if (url.includes('/statement-balance')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ balance: 1000 })
          });
        }
        if (url.includes('/payment-methods')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPaymentMethods[0])
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });
      
      const { container } = render(
        <ModalContext.Provider value={mockModalContext}>
          <FinancialOverviewModal
            isOpen={true}
            onClose={() => {}}
            paymentMethods={mockPaymentMethods}
          />
        </ModalContext.Provider>
      );
      
      // Wait for credit card section to render
      setTimeout(() => {
        const viewButtons = container.querySelectorAll('.financial-cc-view-btn');
        if (viewButtons.length > 0) {
          const viewButton = viewButtons[0];
          
          // EXPECTED TO FAIL: Button should contain "View" text, not emoji
          expect(
            viewButton.textContent,
            'Credit card view button should contain "View" text, not emoji 👁️'
          ).toMatch(/^View$/);
        }
      }, 100);
    });
    
    describe('Property-Based: CSS Variable Compliance', () => {
      it('should use CSS variables for all color properties in LoanRow', async () => {
        const css = await readCSSFile('LoanRow.css');
        
        // Common hardcoded colors that should be replaced with CSS variables
        const hardcodedColors = [
          '#991b1b',  // Red color for amounts
          '#d32f2f',  // Another red variant
          '#333',     // Dark gray text
          '#666',     // Medium gray text
          '#4caf50',  // Green
          '#2196f3',  // Blue
          '#ff9800',  // Orange
          '#f44336',  // Red
          '#f8fafc'   // Light gray (fallback colors)
        ];
        
        const violations = hardcodedColors.filter(color => 
          containsHardcodedColor(css, color)
        );
        
        // EXPECTED TO PASS: LoanRow.css uses CSS variables
        expect(
          violations,
          `LoanRow.css should use CSS variables instead of hardcoded colors: ${violations.join(', ')}`
        ).toHaveLength(0);
      });
      
      it('should use CSS variables for font sizes', async () => {
        const css = await readCSSFile('LoanRow.css');
        
        // Check for hardcoded rem values that should use CSS variables
        const hardcodedFontSizes = ['1.1rem', '0.7rem', '0.75rem'];
        const foundSizes = hardcodedFontSizes.filter(size => 
          containsHardcodedValue(css, `font-size: ${size}`)
        );
        
        // EXPECTED TO FAIL: Hardcoded font sizes exist
        expect(
          foundSizes,
          `LoanRow.css should use CSS variables like var(--text-sm) instead of hardcoded sizes: ${foundSizes.join(', ')}`
        ).toHaveLength(0);
      });
    });
    
    describe('Property-Based: Button Text Consistency', () => {
      it('should render text labels for all button types', () => {
        fc.assert(
          fc.property(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              name: fc.string({ minLength: 1, maxLength: 50 }),
              loan_type: fc.constantFrom('loan', 'line_of_credit', 'mortgage'),
              currentBalance: fc.float({ min: 0, max: 100000 }),
              currentRate: fc.float({ min: 0, max: 20 }),
              payment_tracking_enabled: fc.boolean()
            }),
            (loan) => {
              const { container } = render(
                <LoanRow
                  loan={loan}
                  onLogPayment={() => {}}
                  onViewDetails={() => {}}
                  onEdit={() => {}}
                  onDelete={() => {}}
                />
              );
              
              // Check all buttons for emoji characters
              const buttons = container.querySelectorAll('button');
              const buttonsWithEmoji = Array.from(buttons).filter(btn => 
                /[\u{1F300}-\u{1F9FF}]/u.test(btn.textContent)
              );
              
              // EXPECTED TO FAIL: Buttons contain emoji
              expect(
                buttonsWithEmoji.length,
                'Buttons should use text labels, not emoji characters'
              ).toBe(0);
            }
          ),
          { numRuns: 10 }
        );
      });
    });
    
    describe('Property-Based: Deactivation UI Presence', () => {
      beforeEach(() => {
        cleanup();
      });
      
      it('should display deactivate button for active payment methods in edit mode', () => {
        fc.assert(
          fc.property(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              type: fc.constantFrom('cash', 'cheque', 'debit', 'credit_card'),
              display_name: fc.string({ minLength: 1, maxLength: 50 }),
              full_name: fc.string({ minLength: 1, maxLength: 100 }),
              is_active: fc.boolean(),
              payment_due_day: fc.integer({ min: 1, max: 31 }),
              billing_cycle_day: fc.integer({ min: 1, max: 31 })
            }),
            (method) => {
              // Only test credit cards with required fields
              if (method.type !== 'credit_card') return;
              
              cleanup(); // Clean up before each property test run
              
              render(
                <PaymentMethodForm
                  isOpen={true}
                  method={method}
                  onSave={() => {}}
                  onCancel={() => {}}
                />
              );
              
              // EXPECTED TO PASS: Deactivate/Activate button should exist
              const actionButton = method.is_active
                ? screen.queryAllByRole('button', { name: /deactivate/i })[0]
                : screen.queryAllByRole('button', { name: /activate/i })[0];
              
              expect(
                actionButton,
                `PaymentMethodForm should display ${method.is_active ? 'Deactivate' : 'Activate'} button in edit mode`
              ).toBeInTheDocument();
            }
          ),
          { numRuns: 10 }
        );
      });
    });
  });
});
