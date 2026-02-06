import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { ModalProvider, useModalContext } from './ModalContext';

describe('ModalContext Property-Based Tests', () => {
  afterEach(() => {
    cleanup();
  });

  // The 7 simple modals (all except budgetManagement which has special focus category handling)
  const SIMPLE_MODALS = [
    'ExpenseForm',
    'BackupSettings',
    'AnnualSummary',
    'TaxDeductible',
    'BudgetHistory',
    'PeopleManagement',
    'AnalyticsHub',
  ];

  // Arbitrary for selecting a simple modal name
  const simpleModalArb = fc.constantFrom(...SIMPLE_MODALS);

  // Arbitrary for sequences of modal names
  const modalSequenceArb = fc.array(simpleModalArb, { minLength: 1, maxLength: 20 });

  /**
   * **Feature: modal-context, Property 1: Open/close round-trip for simple modals**
   *
   * For any simple modal (expenseForm, backupSettings, annualSummary, taxDeductible,
   * budgetHistory, peopleManagement, analyticsHub), calling its open handler SHALL set
   * its visibility to true, and subsequently calling its close handler SHALL set its
   * visibility back to false. The open/close cycle is a round-trip that restores the
   * initial state.
   *
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16**
   */
  describe('Property 1: Open/close round-trip for simple modals', () => {
    /**
     * Property 1a: For any single simple modal, open sets visibility to true
     */
    it('1a: open handler sets visibility to true for any simple modal', () => {
      fc.assert(
        fc.property(
          simpleModalArb,
          (modalName) => {
            const { result } = renderHook(() => useModalContext(), {
              wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
            });

            const stateKey = `show${modalName}`;
            const openHandler = `open${modalName}`;

            // Initial state should be false
            expect(result.current[stateKey]).toBe(false);

            // Call open handler
            act(() => {
              result.current[openHandler]();
            });

            // State should now be true
            expect(result.current[stateKey]).toBe(true);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1b: For any single simple modal, close sets visibility to false
     */
    it('1b: close handler sets visibility to false for any simple modal', () => {
      fc.assert(
        fc.property(
          simpleModalArb,
          (modalName) => {
            const { result } = renderHook(() => useModalContext(), {
              wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
            });

            const stateKey = `show${modalName}`;
            const openHandler = `open${modalName}`;
            const closeHandler = `close${modalName}`;

            // Open the modal first
            act(() => {
              result.current[openHandler]();
            });
            expect(result.current[stateKey]).toBe(true);

            // Call close handler
            act(() => {
              result.current[closeHandler]();
            });

            // State should now be false
            expect(result.current[stateKey]).toBe(false);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1c: For any sequence of modal names, each open/close round-trip
     * correctly transitions the state true→false
     */
    it('1c: open/close round-trip works for any sequence of simple modals', () => {
      fc.assert(
        fc.property(
          modalSequenceArb,
          (modalSequence) => {
            const { result } = renderHook(() => useModalContext(), {
              wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
            });

            // For each modal in the sequence, perform open/close round-trip
            for (const modalName of modalSequence) {
              const stateKey = `show${modalName}`;
              const openHandler = `open${modalName}`;
              const closeHandler = `close${modalName}`;

              // Open the modal
              act(() => {
                result.current[openHandler]();
              });
              expect(result.current[stateKey]).toBe(true);

              // Close the modal
              act(() => {
                result.current[closeHandler]();
              });
              expect(result.current[stateKey]).toBe(false);
            }

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1d: Opening one modal does not affect other modals' visibility
     */
    it('1d: opening one modal does not affect other modals', () => {
      fc.assert(
        fc.property(
          simpleModalArb,
          (modalToOpen) => {
            const { result } = renderHook(() => useModalContext(), {
              wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
            });

            const openHandler = `open${modalToOpen}`;

            // Open the selected modal
            act(() => {
              result.current[openHandler]();
            });

            // Verify only the selected modal is open
            for (const modal of SIMPLE_MODALS) {
              const stateKey = `show${modal}`;
              if (modal === modalToOpen) {
                expect(result.current[stateKey]).toBe(true);
              } else {
                expect(result.current[stateKey]).toBe(false);
              }
            }

            // Also verify budgetManagement is not affected
            expect(result.current.showBudgetManagement).toBe(false);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


describe('ModalContext Budget Management Property Tests', () => {
  afterEach(() => {
    cleanup();
  });

  // Arbitrary for category strings (including null)
  const categoryArb = fc.oneof(
    fc.constant(null),
    fc.string({ minLength: 0, maxLength: 50 }),
    fc.constantFrom('Groceries', 'Dining Out', 'Entertainment', 'Gas', 'Utilities', 'Housing')
  );

  // Arbitrary for sequences of categories
  const categorySequenceArb = fc.array(categoryArb, { minLength: 1, maxLength: 10 });

  /**
   * **Feature: modal-context, Property 2: Budget management open with focus category and close resets**
   *
   * For any string category (including null), calling openBudgetManagement(category) SHALL set
   * showBudgetManagement to true and budgetManagementFocusCategory to the provided category.
   * Subsequently calling closeBudgetManagement SHALL set showBudgetManagement to false and
   * budgetManagementFocusCategory to null, regardless of what category was previously set.
   *
   * **Validates: Requirements 2.9, 2.10**
   */
  describe('Property 2: Budget management open with focus category and close resets', () => {
    /**
     * Property 2a: openBudgetManagement sets visibility to true and focus category to provided value
     */
    it('2a: openBudgetManagement sets visibility and focus category', () => {
      fc.assert(
        fc.property(
          categoryArb,
          (category) => {
            const { result } = renderHook(() => useModalContext(), {
              wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
            });

            // Initial state
            expect(result.current.showBudgetManagement).toBe(false);
            expect(result.current.budgetManagementFocusCategory).toBe(null);

            // Call openBudgetManagement with category
            act(() => {
              result.current.openBudgetManagement(category);
            });

            // Verify visibility is true
            expect(result.current.showBudgetManagement).toBe(true);
            // Verify focus category is set to the provided value
            expect(result.current.budgetManagementFocusCategory).toBe(category);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2b: closeBudgetManagement resets both visibility and focus category
     */
    it('2b: closeBudgetManagement resets visibility to false and focus category to null', () => {
      fc.assert(
        fc.property(
          categoryArb,
          (category) => {
            const { result } = renderHook(() => useModalContext(), {
              wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
            });

            // Open with a category
            act(() => {
              result.current.openBudgetManagement(category);
            });

            expect(result.current.showBudgetManagement).toBe(true);
            expect(result.current.budgetManagementFocusCategory).toBe(category);

            // Close the modal
            act(() => {
              result.current.closeBudgetManagement();
            });

            // Verify both are reset
            expect(result.current.showBudgetManagement).toBe(false);
            expect(result.current.budgetManagementFocusCategory).toBe(null);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2c: Multiple open/close cycles with different categories all reset correctly
     */
    it('2c: multiple open/close cycles with different categories all reset correctly', () => {
      fc.assert(
        fc.property(
          categorySequenceArb,
          (categories) => {
            const { result } = renderHook(() => useModalContext(), {
              wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
            });

            for (const category of categories) {
              // Open with this category
              act(() => {
                result.current.openBudgetManagement(category);
              });

              expect(result.current.showBudgetManagement).toBe(true);
              expect(result.current.budgetManagementFocusCategory).toBe(category);

              // Close
              act(() => {
                result.current.closeBudgetManagement();
              });

              // Both should be reset regardless of what category was used
              expect(result.current.showBudgetManagement).toBe(false);
              expect(result.current.budgetManagementFocusCategory).toBe(null);
            }

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2d: openBudgetManagement without argument defaults category to null
     */
    it('2d: openBudgetManagement without argument defaults category to null', () => {
      fc.assert(
        fc.property(
          fc.constant(undefined), // Just run once with no argument
          () => {
            const { result } = renderHook(() => useModalContext(), {
              wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
            });

            // Call openBudgetManagement without argument
            act(() => {
              result.current.openBudgetManagement();
            });

            expect(result.current.showBudgetManagement).toBe(true);
            expect(result.current.budgetManagementFocusCategory).toBe(null);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


describe('ModalContext closeAllOverlays Property Tests', () => {
  afterEach(() => {
    cleanup();
  });

  // Overlay modals (closed by closeAllOverlays)
  const OVERLAY_MODALS = ['TaxDeductible', 'AnnualSummary', 'BackupSettings', 'BudgetHistory'];

  // Non-overlay modals (NOT closed by closeAllOverlays)
  const NON_OVERLAY_MODALS = ['ExpenseForm', 'BudgetManagement', 'PeopleManagement', 'AnalyticsHub'];

  // Arbitrary for random boolean states for all 8 modals
  const modalStatesArb = fc.record({
    showExpenseForm: fc.boolean(),
    showBackupSettings: fc.boolean(),
    showAnnualSummary: fc.boolean(),
    showTaxDeductible: fc.boolean(),
    showBudgetManagement: fc.boolean(),
    showBudgetHistory: fc.boolean(),
    showPeopleManagement: fc.boolean(),
    showAnalyticsHub: fc.boolean(),
  });

  /**
   * **Feature: modal-context, Property 3: closeAllOverlays selectively closes overlay modals**
   *
   * For any combination of initial modal visibility states (all 8 booleans set randomly to
   * true or false), calling closeAllOverlays SHALL set showTaxDeductible, showAnnualSummary,
   * showBackupSettings, and showBudgetHistory to false, while leaving showExpenseForm,
   * showBudgetManagement, showPeopleManagement, and showAnalyticsHub unchanged from their
   * initial values.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  describe('Property 3: closeAllOverlays selectively closes overlay modals', () => {
    /**
     * Property 3a: closeAllOverlays closes all overlay modals
     */
    it('3a: closeAllOverlays sets all overlay modals to false', () => {
      fc.assert(
        fc.property(
          modalStatesArb,
          (initialStates) => {
            const { result } = renderHook(() => useModalContext(), {
              wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
            });

            // Set initial states for all modals
            act(() => {
              // Set overlay modals
              if (initialStates.showTaxDeductible) result.current.openTaxDeductible();
              if (initialStates.showAnnualSummary) result.current.openAnnualSummary();
              if (initialStates.showBackupSettings) result.current.openBackupSettings();
              if (initialStates.showBudgetHistory) result.current.openBudgetHistory();

              // Set non-overlay modals
              if (initialStates.showExpenseForm) result.current.openExpenseForm();
              if (initialStates.showBudgetManagement) result.current.openBudgetManagement();
              if (initialStates.showPeopleManagement) result.current.openPeopleManagement();
              if (initialStates.showAnalyticsHub) result.current.openAnalyticsHub();
            });

            // Call closeAllOverlays
            act(() => {
              result.current.closeAllOverlays();
            });

            // Verify all overlay modals are now false
            expect(result.current.showTaxDeductible).toBe(false);
            expect(result.current.showAnnualSummary).toBe(false);
            expect(result.current.showBackupSettings).toBe(false);
            expect(result.current.showBudgetHistory).toBe(false);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3b: closeAllOverlays does NOT affect non-overlay modals
     */
    it('3b: closeAllOverlays does not affect non-overlay modals', () => {
      fc.assert(
        fc.property(
          modalStatesArb,
          (initialStates) => {
            const { result } = renderHook(() => useModalContext(), {
              wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
            });

            // Set initial states for all modals
            act(() => {
              // Set overlay modals
              if (initialStates.showTaxDeductible) result.current.openTaxDeductible();
              if (initialStates.showAnnualSummary) result.current.openAnnualSummary();
              if (initialStates.showBackupSettings) result.current.openBackupSettings();
              if (initialStates.showBudgetHistory) result.current.openBudgetHistory();

              // Set non-overlay modals
              if (initialStates.showExpenseForm) result.current.openExpenseForm();
              if (initialStates.showBudgetManagement) result.current.openBudgetManagement();
              if (initialStates.showPeopleManagement) result.current.openPeopleManagement();
              if (initialStates.showAnalyticsHub) result.current.openAnalyticsHub();
            });

            // Call closeAllOverlays
            act(() => {
              result.current.closeAllOverlays();
            });

            // Verify non-overlay modals are UNCHANGED from their initial states
            expect(result.current.showExpenseForm).toBe(initialStates.showExpenseForm);
            expect(result.current.showBudgetManagement).toBe(initialStates.showBudgetManagement);
            expect(result.current.showPeopleManagement).toBe(initialStates.showPeopleManagement);
            expect(result.current.showAnalyticsHub).toBe(initialStates.showAnalyticsHub);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3c: closeAllOverlays is idempotent - calling it multiple times has same effect
     */
    it('3c: closeAllOverlays is idempotent', () => {
      fc.assert(
        fc.property(
          modalStatesArb,
          fc.integer({ min: 1, max: 5 }),
          (initialStates, callCount) => {
            const { result } = renderHook(() => useModalContext(), {
              wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
            });

            // Set initial states
            act(() => {
              if (initialStates.showTaxDeductible) result.current.openTaxDeductible();
              if (initialStates.showAnnualSummary) result.current.openAnnualSummary();
              if (initialStates.showBackupSettings) result.current.openBackupSettings();
              if (initialStates.showBudgetHistory) result.current.openBudgetHistory();
              if (initialStates.showExpenseForm) result.current.openExpenseForm();
              if (initialStates.showBudgetManagement) result.current.openBudgetManagement();
              if (initialStates.showPeopleManagement) result.current.openPeopleManagement();
              if (initialStates.showAnalyticsHub) result.current.openAnalyticsHub();
            });

            // Call closeAllOverlays multiple times
            for (let i = 0; i < callCount; i++) {
              act(() => {
                result.current.closeAllOverlays();
              });
            }

            // Overlay modals should be false
            expect(result.current.showTaxDeductible).toBe(false);
            expect(result.current.showAnnualSummary).toBe(false);
            expect(result.current.showBackupSettings).toBe(false);
            expect(result.current.showBudgetHistory).toBe(false);

            // Non-overlay modals should be unchanged
            expect(result.current.showExpenseForm).toBe(initialStates.showExpenseForm);
            expect(result.current.showBudgetManagement).toBe(initialStates.showBudgetManagement);
            expect(result.current.showPeopleManagement).toBe(initialStates.showPeopleManagement);
            expect(result.current.showAnalyticsHub).toBe(initialStates.showAnalyticsHub);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
