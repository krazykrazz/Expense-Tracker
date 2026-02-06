import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { ModalProvider, useModalContext } from './ModalContext';

describe('ModalContext Unit Tests', () => {
  afterEach(() => {
    cleanup();
  });

  /**
   * Requirement 4.2: useModalContext throws outside provider
   */
  it('useModalContext throws when used outside ModalProvider', () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useModalContext())).toThrow(
      'useModalContext must be used within a ModalProvider'
    );
    spy.mockRestore();
  });

  /**
   * Requirement 5.2: ModalProvider works without FilterProvider or ExpenseProvider (independence)
   */
  it('ModalProvider works without FilterProvider or ExpenseProvider', () => {
    // Should not throw when rendered standalone
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
    });

    // Should have all expected values
    expect(result.current).toBeDefined();
    expect(typeof result.current.openExpenseForm).toBe('function');
  });

  /**
   * Requirements 1.1-1.9: Initial state values (all false, focusCategory null)
   */
  it('initializes all modal visibility states to false', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
    });

    expect(result.current.showExpenseForm).toBe(false);
    expect(result.current.showBackupSettings).toBe(false);
    expect(result.current.showAnnualSummary).toBe(false);
    expect(result.current.showTaxDeductible).toBe(false);
    expect(result.current.showBudgetManagement).toBe(false);
    expect(result.current.showBudgetHistory).toBe(false);
    expect(result.current.showPeopleManagement).toBe(false);
    expect(result.current.showAnalyticsHub).toBe(false);
  });

  it('initializes budgetManagementFocusCategory to null', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
    });

    expect(result.current.budgetManagementFocusCategory).toBe(null);
  });

  /**
   * Interface completeness: all expected fields present
   */
  it('provides all expected visibility state values', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
    });

    // Visibility state
    expect('showExpenseForm' in result.current).toBe(true);
    expect('showBackupSettings' in result.current).toBe(true);
    expect('showAnnualSummary' in result.current).toBe(true);
    expect('showTaxDeductible' in result.current).toBe(true);
    expect('showBudgetManagement' in result.current).toBe(true);
    expect('budgetManagementFocusCategory' in result.current).toBe(true);
    expect('showBudgetHistory' in result.current).toBe(true);
    expect('showPeopleManagement' in result.current).toBe(true);
    expect('showAnalyticsHub' in result.current).toBe(true);
  });

  it('provides all expected open handlers', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
    });

    expect(typeof result.current.openExpenseForm).toBe('function');
    expect(typeof result.current.openBackupSettings).toBe('function');
    expect(typeof result.current.openAnnualSummary).toBe('function');
    expect(typeof result.current.openTaxDeductible).toBe('function');
    expect(typeof result.current.openBudgetManagement).toBe('function');
    expect(typeof result.current.openBudgetHistory).toBe('function');
    expect(typeof result.current.openPeopleManagement).toBe('function');
    expect(typeof result.current.openAnalyticsHub).toBe('function');
  });

  it('provides all expected close handlers', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
    });

    expect(typeof result.current.closeExpenseForm).toBe('function');
    expect(typeof result.current.closeBackupSettings).toBe('function');
    expect(typeof result.current.closeAnnualSummary).toBe('function');
    expect(typeof result.current.closeTaxDeductible).toBe('function');
    expect(typeof result.current.closeBudgetManagement).toBe('function');
    expect(typeof result.current.closeBudgetHistory).toBe('function');
    expect(typeof result.current.closePeopleManagement).toBe('function');
    expect(typeof result.current.closeAnalyticsHub).toBe('function');
  });

  it('provides closeAllOverlays handler', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
    });

    expect(typeof result.current.closeAllOverlays).toBe('function');
  });

  /**
   * Requirement 6.1: navigateToTaxDeductible event opens tax deductible modal
   */
  it('navigateToTaxDeductible event opens tax deductible modal', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
    });

    expect(result.current.showTaxDeductible).toBe(false);

    act(() => {
      window.dispatchEvent(new CustomEvent('navigateToTaxDeductible'));
    });

    expect(result.current.showTaxDeductible).toBe(true);
  });

  it('navigateToTaxDeductible event with insuranceFilter dispatches setTaxDeductibleInsuranceFilter', async () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
    });

    const filterEventPromise = new Promise((resolve) => {
      const handler = (event) => {
        window.removeEventListener('setTaxDeductibleInsuranceFilter', handler);
        resolve(event.detail);
      };
      window.addEventListener('setTaxDeductibleInsuranceFilter', handler);
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('navigateToTaxDeductible', {
        detail: { insuranceFilter: 'Not Claimed' }
      }));
    });

    expect(result.current.showTaxDeductible).toBe(true);

    // Wait for the setTimeout to fire
    const detail = await filterEventPromise;
    expect(detail.insuranceFilter).toBe('Not Claimed');
  });
});
