/**
 * @invariant Tab State Persistence: For any tab selection, the state is persisted to localStorage and restored on re-initialization; invalid stored values fall back to the default tab. Randomization covers diverse tab identifiers and storage states.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as fc from 'fast-check';
import useTabState from './useTabState';

describe('useTabState - Property-Based Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  /**
   * Property 7: Tab State Hook Behavior
   * Feature: settings-system-split, Property 7: Tab State Hook Behavior
   * 
   * For any initial tab value and sequence of tab changes, the useTabState hook
   * should always return the most recently set tab value and preserve it in localStorage.
   * 
   * Validates: Requirements 6.2
   */
  it('Property 7: should return most recent tab value and persist to localStorage', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // storageKey
        fc.string({ minLength: 1, maxLength: 20 }), // defaultTab
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }), // tab changes
        (storageKey, defaultTab, tabChanges) => {
          localStorage.clear();

          // Render hook with initial values
          const { result } = renderHook(() => useTabState(storageKey, defaultTab));

          // Initial state should be defaultTab
          expect(result.current[0]).toBe(defaultTab);
          expect(localStorage.getItem(storageKey)).toBe(defaultTab);

          // Apply each tab change
          tabChanges.forEach((newTab) => {
            act(() => {
              result.current[1](newTab);
            });

            // Hook should return the most recent tab value
            expect(result.current[0]).toBe(newTab);
            
            // localStorage should be updated
            expect(localStorage.getItem(storageKey)).toBe(newTab);
          });

          // Final state should be the last tab change
          const lastTab = tabChanges[tabChanges.length - 1];
          expect(result.current[0]).toBe(lastTab);
          expect(localStorage.getItem(storageKey)).toBe(lastTab);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 7: should load initial tab from localStorage if available', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // storageKey
        fc.string({ minLength: 1, maxLength: 20 }), // defaultTab
        fc.string({ minLength: 1, maxLength: 20 }), // storedTab
        (storageKey, defaultTab, storedTab) => {
          localStorage.clear();
          
          // Pre-populate localStorage
          localStorage.setItem(storageKey, storedTab);

          // Render hook
          const { result } = renderHook(() => useTabState(storageKey, defaultTab));

          // Should use stored value, not default
          expect(result.current[0]).toBe(storedTab);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 7: should use default tab when localStorage is empty', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // storageKey
        fc.string({ minLength: 1, maxLength: 20 }), // defaultTab
        (storageKey, defaultTab) => {
          localStorage.clear();

          // Render hook with no stored value
          const { result } = renderHook(() => useTabState(storageKey, defaultTab));

          // Should use default tab
          expect(result.current[0]).toBe(defaultTab);
          expect(localStorage.getItem(storageKey)).toBe(defaultTab);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 7: should handle localStorage errors gracefully', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // storageKey
        fc.string({ minLength: 1, maxLength: 20 }), // defaultTab
        (storageKey, defaultTab) => {
          // Mock localStorage.getItem to throw error
          const originalGetItem = localStorage.getItem;
          localStorage.getItem = vi.fn(() => {
            throw new Error('localStorage error');
          });

          // Should fall back to default tab
          const { result } = renderHook(() => useTabState(storageKey, defaultTab));
          expect(result.current[0]).toBe(defaultTab);

          // Restore original
          localStorage.getItem = originalGetItem;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property 7: should persist tab changes across hook re-renders', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // storageKey
        fc.string({ minLength: 1, maxLength: 20 }), // defaultTab
        fc.string({ minLength: 1, maxLength: 20 }), // newTab
        (storageKey, defaultTab, newTab) => {
          localStorage.clear();

          // First render
          const { result: result1, unmount } = renderHook(() => useTabState(storageKey, defaultTab));
          
          // Change tab
          act(() => {
            result1.current[1](newTab);
          });

          // Unmount and re-render
          unmount();
          const { result: result2 } = renderHook(() => useTabState(storageKey, defaultTab));

          // Should load the changed tab, not the default
          expect(result2.current[0]).toBe(newTab);
        }
      ),
      { numRuns: 100 }
    );
  });
});
