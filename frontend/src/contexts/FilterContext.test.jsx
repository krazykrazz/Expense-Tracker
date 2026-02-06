import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { FilterProvider, useFilterContext } from './FilterContext';

describe('FilterContext Unit Tests', () => {
  afterEach(() => {
    cleanup();
  });

  /**
   * Requirement 3.2: useFilterContext throws outside provider
   */
  it('useFilterContext throws when used outside FilterProvider', () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useFilterContext())).toThrow(
      'useFilterContext must be used within a FilterProvider'
    );
    spy.mockRestore();
  });

  /**
   * Requirement 2.1: Initial state values
   */
  it('initializes filter state with empty strings', () => {
    const { result } = renderHook(() => useFilterContext(), {
      wrapper: ({ children }) => <FilterProvider>{children}</FilterProvider>,
    });

    expect(result.current.searchText).toBe('');
    expect(result.current.filterType).toBe('');
    expect(result.current.filterMethod).toBe('');
    expect(result.current.filterYear).toBe('');
    expect(result.current.filterInsurance).toBe('');
  });

  it('initializes view state to current year and month', () => {
    const now = new Date();
    const { result } = renderHook(() => useFilterContext(), {
      wrapper: ({ children }) => <FilterProvider>{children}</FilterProvider>,
    });

    expect(result.current.selectedYear).toBe(now.getFullYear());
    expect(result.current.selectedMonth).toBe(now.getMonth() + 1);
  });

  it('initializes derived state correctly', () => {
    const { result } = renderHook(() => useFilterContext(), {
      wrapper: ({ children }) => <FilterProvider>{children}</FilterProvider>,
    });

    expect(result.current.isGlobalView).toBe(false);
    expect(result.current.globalViewTriggers).toEqual([]);
  });

  /**
   * Edge cases: empty strings and whitespace
   */
  it('whitespace-only search text does not trigger global view', () => {
    const { result } = renderHook(() => useFilterContext(), {
      wrapper: ({ children }) => <FilterProvider>{children}</FilterProvider>,
    });

    act(() => {
      result.current.handleSearchChange('   ');
    });

    expect(result.current.searchText).toBe('   ');
    expect(result.current.isGlobalView).toBe(false);
    expect(result.current.globalViewTriggers).toEqual([]);
  });

  it('empty string filter values do not trigger global view', () => {
    const { result } = renderHook(() => useFilterContext(), {
      wrapper: ({ children }) => <FilterProvider>{children}</FilterProvider>,
    });

    act(() => {
      result.current.handleSearchChange('');
      result.current.handleFilterTypeChange('');
      result.current.handleFilterMethodChange('');
      result.current.handleFilterYearChange('');
      result.current.setFilterInsurance('');
    });

    expect(result.current.isGlobalView).toBe(false);
  });
});
