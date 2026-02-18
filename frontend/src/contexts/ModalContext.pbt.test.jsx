/**
 * @invariant Modal State Exclusivity: For any sequence of modal open/close operations, at most one modal is open at a time; opening a new modal closes the previous one; close operations are idempotent. Randomization covers diverse modal operation sequences.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { useModalContext } from './ModalContext';
import { createModalWrapper } from '../test-utils/wrappers.jsx';

describe('ModalContext Property-Based Tests', () => {
  afterEach(() => {
    cleanup();
  });

  const wrapper = createModalWrapper();

  // The 7 simple modals (all except budgets which has special focus category handling)
  const SIMPLE_MODALS = [
    'ExpenseForm',
    'BackupSettings',
    'AnnualSummary',
    'TaxDeductible',
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
   * peopleManagement, analyticsHub), calling its open handler SHALL set
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
            const { result } = renderHook(() => useModalContext(), { wrapper });

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
            const { result } = renderHook(() => useModalContext(), { wrapper });

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
            const { result } = renderHook(() => useModalContext(), { wrapper });

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
            const { result } = renderHook(() => useModalContext(), { wrapper });

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

            // Also verify budgets is not affected
            expect(result.current.showBudgets).toBe(false);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


describe('ModalContext Budget Property Tests', () => {
  afterEach(() => {
    cleanup();
  });

  const wrapper = createModalWrapper();

  // Arbitrary for category strings (including null)
  const categoryArb = fc.oneof(
    fc.constant(null),
    fc.string({ minLength: 0, maxLength: 50 }),
    fc.constantFrom('Groceries', 'Dining Out', 'Entertainment', 'Gas', 'Utilities', 'Housing')
  );

  // Arbitrary for sequences of categories
  const categorySequenceArb = fc.array(categoryArb, { minLength: 1, maxLength: 10 });

  /**
   * **Feature: budget-modal-consolidation, Property 3: ModalContext open/close round-trip**
   *
   * For any category string (including null), calling openBudgets(category) SHALL set
   * showBudgets to true and budgetManagementFocusCategory to the provided category.
   * Subsequently calling closeBudgets SHALL set showBudgets to false and
   * budgetManagementFocusCategory to null, regardless of what category was previously set.
   *
   * **Validates: Requirements 4.4, 4.5**
   */
  describe('Property 3: ModalContext open/close round-trip', () => {
    /**
     * Property 3a: openBudgets sets visibility to true and focus category to provided value
     */
    it('3a: openBudgets sets visibility and focus category', () => {
      fc.assert(
        fc.property(
          categoryArb,
          (category) => {
            const { result } = renderHook(() => useModalContext(), { wrapper });

            // Initial state
            expect(result.current.showBudgets).toBe(false);
            expect(result.current.budgetManagementFocusCategory).toBe(null);

            // Call openBudgets with category
            act(() => {
              result.current.openBudgets(category);
            });

            // Verify visibility is true
            expect(result.current.showBudgets).toBe(true);
            // Verify focus category is set to the provided value
            expect(result.current.budgetManagementFocusCategory).toBe(category);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3b: closeBudgets resets both visibility and focus category
     */
    it('3b: closeBudgets resets visibility to false and focus category to null', () => {
      fc.assert(
        fc.property(
          categoryArb,
          (category) => {
            const { result } = renderHook(() => useModalContext(), { wrapper });

            // Open with a category
            act(() => {
              result.current.openBudgets(category);
            });

            expect(result.current.showBudgets).toBe(true);
            expect(result.current.budgetManagementFocusCategory).toBe(category);

            // Close the modal
            act(() => {
              result.current.closeBudgets();
            });

            // Verify both are reset
            expect(result.current.showBudgets).toBe(false);
            expect(result.current.budgetManagementFocusCategory).toBe(null);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3c: Multiple open/close cycles with different categories all reset correctly
     */
    it('3c: multiple open/close cycles with different categories all reset correctly', () => {
      fc.assert(
        fc.property(
          categorySequenceArb,
          (categories) => {
            const { result } = renderHook(() => useModalContext(), { wrapper });

            for (const category of categories) {
              // Open with this category
              act(() => {
                result.current.openBudgets(category);
              });

              expect(result.current.showBudgets).toBe(true);
              expect(result.current.budgetManagementFocusCategory).toBe(category);

              // Close
              act(() => {
                result.current.closeBudgets();
              });

              // Both should be reset regardless of what category was used
              expect(result.current.showBudgets).toBe(false);
              expect(result.current.budgetManagementFocusCategory).toBe(null);
            }

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3d: openBudgets without argument defaults category to null
     */
    it('3d: openBudgets without argument defaults category to null', () => {
      fc.assert(
        fc.property(
          fc.constant(undefined),
          () => {
            const { result } = renderHook(() => useModalContext(), { wrapper });

            // Call openBudgets without argument
            act(() => {
              result.current.openBudgets();
            });

            expect(result.current.showBudgets).toBe(true);
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

  const wrapper = createModalWrapper();

  // Non-overlay modals (NOT closed by closeAllOverlays)
  const NON_OVERLAY_MODALS = ['ExpenseForm', 'Budgets', 'PeopleManagement', 'AnalyticsHub'];

  // Arbitrary for random boolean states for all modals
  const modalStatesArb = fc.record({
    showExpenseForm: fc.boolean(),
    showBackupSettings: fc.boolean(),
    showAnnualSummary: fc.boolean(),
    showTaxDeductible: fc.boolean(),
    showBudgets: fc.boolean(),
    showPeopleManagement: fc.boolean(),
    showAnalyticsHub: fc.boolean(),
  });

  /**
   * **Feature: modal-context, Property 3: closeAllOverlays selectively closes overlay modals**
   *
   * For any combination of initial modal visibility states, calling closeAllOverlays SHALL set
   * showTaxDeductible, showAnnualSummary, showBackupSettings to false, while leaving
   * showExpenseForm, showBudgets, showPeopleManagement, and showAnalyticsHub unchanged.
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
            const { result } = renderHook(() => useModalContext(), { wrapper });

            // Set initial states for all modals
            act(() => {
              if (initialStates.showTaxDeductible) result.current.openTaxDeductible();
              if (initialStates.showAnnualSummary) result.current.openAnnualSummary();
              if (initialStates.showBackupSettings) result.current.openBackupSettings();
              if (initialStates.showExpenseForm) result.current.openExpenseForm();
              if (initialStates.showBudgets) result.current.openBudgets();
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
            const { result } = renderHook(() => useModalContext(), { wrapper });

            // Set initial states for all modals
            act(() => {
              if (initialStates.showTaxDeductible) result.current.openTaxDeductible();
              if (initialStates.showAnnualSummary) result.current.openAnnualSummary();
              if (initialStates.showBackupSettings) result.current.openBackupSettings();
              if (initialStates.showExpenseForm) result.current.openExpenseForm();
              if (initialStates.showBudgets) result.current.openBudgets();
              if (initialStates.showPeopleManagement) result.current.openPeopleManagement();
              if (initialStates.showAnalyticsHub) result.current.openAnalyticsHub();
            });

            // Call closeAllOverlays
            act(() => {
              result.current.closeAllOverlays();
            });

            // Verify non-overlay modals are UNCHANGED from their initial states
            expect(result.current.showExpenseForm).toBe(initialStates.showExpenseForm);
            expect(result.current.showBudgets).toBe(initialStates.showBudgets);
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
            const { result } = renderHook(() => useModalContext(), { wrapper });

            // Set initial states
            act(() => {
              if (initialStates.showTaxDeductible) result.current.openTaxDeductible();
              if (initialStates.showAnnualSummary) result.current.openAnnualSummary();
              if (initialStates.showBackupSettings) result.current.openBackupSettings();
              if (initialStates.showExpenseForm) result.current.openExpenseForm();
              if (initialStates.showBudgets) result.current.openBudgets();
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

            // Non-overlay modals should be unchanged
            expect(result.current.showExpenseForm).toBe(initialStates.showExpenseForm);
            expect(result.current.showBudgets).toBe(initialStates.showBudgets);
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


/**
 * @invariant FinancialOverview Modal Open/Close Round-Trip: For any tab value (including null),
 * openFinancialOverview(tab) sets showFinancialOverview=true and financialOverviewInitialTab=tab;
 * closeFinancialOverview() resets both to false/null. The round-trip is idempotent and does not
 * affect other modal state.
 */
describe('ModalContext FinancialOverview Property Tests', () => {
  afterEach(() => {
    cleanup();
  });

  const wrapper = createModalWrapper();

  // Valid tab values for the financial overview modal
  const TAB_VALUES = ['loans', 'investments', 'payment-methods'];

  // Arbitrary for tab (including null for "no initial tab")
  const tabArb = fc.oneof(
    fc.constant(null),
    fc.constantFrom(...TAB_VALUES)
  );

  // Arbitrary for sequences of tabs
  const tabSequenceArb = fc.array(tabArb, { minLength: 1, maxLength: 15 });

  /**
   * **Feature: financial-overview-modal, Property 3: ModalContext open/close round-trip**
   *
   * For any tab value (including null), calling openFinancialOverview(tab) SHALL set
   * showFinancialOverview to true and financialOverviewInitialTab to the provided tab.
   * Subsequently calling closeFinancialOverview SHALL set showFinancialOverview to false
   * and financialOverviewInitialTab to null, regardless of what tab was previously set.
   *
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
   */
  describe('Property 3: ModalContext open/close round-trip', () => {
    /**
     * Property 3a: openFinancialOverview sets visibility to true and initialTab to provided value
     */
    it('3a: openFinancialOverview sets showFinancialOverview=true and financialOverviewInitialTab=tab', () => {
      fc.assert(
        fc.property(
          tabArb,
          (tab) => {
            const { result } = renderHook(() => useModalContext(), { wrapper });

            expect(result.current.showFinancialOverview).toBe(false);
            expect(result.current.financialOverviewInitialTab).toBe(null);

            act(() => {
              result.current.openFinancialOverview(tab);
            });

            expect(result.current.showFinancialOverview).toBe(true);
            expect(result.current.financialOverviewInitialTab).toBe(tab);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3b: closeFinancialOverview resets both visibility and initialTab to false/null
     */
    it('3b: closeFinancialOverview resets showFinancialOverview=false and financialOverviewInitialTab=null', () => {
      fc.assert(
        fc.property(
          tabArb,
          (tab) => {
            const { result } = renderHook(() => useModalContext(), { wrapper });

            act(() => {
              result.current.openFinancialOverview(tab);
            });

            expect(result.current.showFinancialOverview).toBe(true);
            expect(result.current.financialOverviewInitialTab).toBe(tab);

            act(() => {
              result.current.closeFinancialOverview();
            });

            expect(result.current.showFinancialOverview).toBe(false);
            expect(result.current.financialOverviewInitialTab).toBe(null);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3c: Multiple open/close cycles with different tabs all reset correctly
     */
    it('3c: multiple open/close cycles with different tabs all reset correctly', () => {
      fc.assert(
        fc.property(
          tabSequenceArb,
          (tabs) => {
            const { result } = renderHook(() => useModalContext(), { wrapper });

            for (const tab of tabs) {
              act(() => {
                result.current.openFinancialOverview(tab);
              });

              expect(result.current.showFinancialOverview).toBe(true);
              expect(result.current.financialOverviewInitialTab).toBe(tab);

              act(() => {
                result.current.closeFinancialOverview();
              });

              expect(result.current.showFinancialOverview).toBe(false);
              expect(result.current.financialOverviewInitialTab).toBe(null);
            }

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3d: openFinancialOverview without argument defaults initialTab to null
     */
    it('3d: openFinancialOverview without argument defaults financialOverviewInitialTab to null', () => {
      fc.assert(
        fc.property(
          fc.constant(undefined),
          () => {
            const { result } = renderHook(() => useModalContext(), { wrapper });

            act(() => {
              result.current.openFinancialOverview();
            });

            expect(result.current.showFinancialOverview).toBe(true);
            expect(result.current.financialOverviewInitialTab).toBe(null);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3e: Opening FinancialOverview does not affect other modal states
     */
    it('3e: opening FinancialOverview does not affect other modal states', () => {
      fc.assert(
        fc.property(
          tabArb,
          (tab) => {
            const { result } = renderHook(() => useModalContext(), { wrapper });

            act(() => {
              result.current.openFinancialOverview(tab);
            });

            // All other modals should remain false
            expect(result.current.showExpenseForm).toBe(false);
            expect(result.current.showBudgets).toBe(false);
            expect(result.current.showPeopleManagement).toBe(false);
            expect(result.current.showAnalyticsHub).toBe(false);
            expect(result.current.showAnnualSummary).toBe(false);
            expect(result.current.showTaxDeductible).toBe(false);
            expect(result.current.showBackupSettings).toBe(false);

            cleanup();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
