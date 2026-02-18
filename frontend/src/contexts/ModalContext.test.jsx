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
    expect(result.current.showBudgets).toBe(false);
    expect(result.current.showPeopleManagement).toBe(false);
    expect(result.current.showAnalyticsHub).toBe(false);
    expect(result.current.showFinancialOverview).toBe(false);
  });

  it('initializes budgetManagementFocusCategory to null', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
    });

    expect(result.current.budgetManagementFocusCategory).toBe(null);
  });

  it('initializes financialOverviewInitialTab to null', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
    });

    expect(result.current.financialOverviewInitialTab).toBe(null);
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
    expect('showBudgets' in result.current).toBe(true);
    expect('budgetManagementFocusCategory' in result.current).toBe(true);
    expect('showPeopleManagement' in result.current).toBe(true);
    expect('showAnalyticsHub' in result.current).toBe(true);
    expect('showFinancialOverview' in result.current).toBe(true);
    expect('financialOverviewInitialTab' in result.current).toBe(true);
    // Old payment methods modal state must not exist
    expect('showPaymentMethods' in result.current).toBe(false);
  });

  it('provides all expected open handlers', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
    });

    expect(typeof result.current.openExpenseForm).toBe('function');
    expect(typeof result.current.openBackupSettings).toBe('function');
    expect(typeof result.current.openAnnualSummary).toBe('function');
    expect(typeof result.current.openTaxDeductible).toBe('function');
    expect(typeof result.current.openBudgets).toBe('function');
    expect(typeof result.current.openPeopleManagement).toBe('function');
    expect(typeof result.current.openAnalyticsHub).toBe('function');
    expect(typeof result.current.openFinancialOverview).toBe('function');
    // Old payment methods handlers must not exist
    expect('openPaymentMethods' in result.current).toBe(false);
  });

  it('provides all expected close handlers', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
    });

    expect(typeof result.current.closeExpenseForm).toBe('function');
    expect(typeof result.current.closeBackupSettings).toBe('function');
    expect(typeof result.current.closeAnnualSummary).toBe('function');
    expect(typeof result.current.closeTaxDeductible).toBe('function');
    expect(typeof result.current.closeBudgets).toBe('function');
    expect(typeof result.current.closePeopleManagement).toBe('function');
    expect(typeof result.current.closeAnalyticsHub).toBe('function');
    expect(typeof result.current.closeFinancialOverview).toBe('function');
    // Old payment methods handlers must not exist
    expect('closePaymentMethods' in result.current).toBe(false);
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

  /**
   * Requirements 4.1, 4.2: openFinancialOverview / closeFinancialOverview
   */
  it('openFinancialOverview sets showFinancialOverview to true', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
    });

    expect(result.current.showFinancialOverview).toBe(false);

    act(() => {
      result.current.openFinancialOverview();
    });

    expect(result.current.showFinancialOverview).toBe(true);
    expect(result.current.financialOverviewInitialTab).toBe(null);
  });

  it('openFinancialOverview with tab sets financialOverviewInitialTab', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
    });

    act(() => {
      result.current.openFinancialOverview('investments');
    });

    expect(result.current.showFinancialOverview).toBe(true);
    expect(result.current.financialOverviewInitialTab).toBe('investments');
  });

  it('closeFinancialOverview resets showFinancialOverview and financialOverviewInitialTab', () => {
    const { result } = renderHook(() => useModalContext(), {
      wrapper: ({ children }) => <ModalProvider>{children}</ModalProvider>,
    });

    act(() => {
      result.current.openFinancialOverview('loans');
    });

    expect(result.current.showFinancialOverview).toBe(true);
    expect(result.current.financialOverviewInitialTab).toBe('loans');

    act(() => {
      result.current.closeFinancialOverview();
    });

    expect(result.current.showFinancialOverview).toBe(false);
    expect(result.current.financialOverviewInitialTab).toBe(null);
  });
});
