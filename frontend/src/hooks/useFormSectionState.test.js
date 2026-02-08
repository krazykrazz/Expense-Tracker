import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormSectionState } from './useFormSectionState';

describe('useFormSectionState - Unit Tests', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('Initial state from sessionStorage', () => {
    test('should use initial states when sessionStorage is empty', () => {
      const initialStates = {
        advancedOptions: false,
        reimbursement: false,
        insurance: true
      };

      const { result } = renderHook(() =>
        useFormSectionState('create', initialStates)
      );

      expect(result.current.sectionStates).toEqual(initialStates);
    });

    test('should restore state from sessionStorage when available', () => {
      const storedStates = {
        advancedOptions: true,
        reimbursement: true,
        insurance: false
      };

      sessionStorage.setItem('expenseForm_expansion_create', JSON.stringify(storedStates));

      const { result } = renderHook(() =>
        useFormSectionState('create', { advancedOptions: false })
      );

      expect(result.current.sectionStates).toEqual(storedStates);
    });

    test('should handle corrupted sessionStorage data gracefully', () => {
      const initialStates = { advancedOptions: false };
      
      sessionStorage.setItem('expenseForm_expansion_create', 'invalid-json{');

      const { result } = renderHook(() =>
        useFormSectionState('create', initialStates)
      );

      expect(result.current.sectionStates).toEqual(initialStates);
    });

    test('should handle empty object as initial state', () => {
      const { result } = renderHook(() =>
        useFormSectionState('create', {})
      );

      expect(result.current.sectionStates).toEqual({});
    });
  });

  describe('State updates to sessionStorage', () => {
    test('should persist state changes to sessionStorage', () => {
      const initialStates = { advancedOptions: false };

      const { result } = renderHook(() =>
        useFormSectionState('create', initialStates)
      );

      act(() => {
        result.current.toggleSection('advancedOptions');
      });

      const stored = JSON.parse(sessionStorage.getItem('expenseForm_expansion_create'));
      expect(stored).toEqual({ advancedOptions: true });
    });

    test('should update sessionStorage on multiple toggles', () => {
      const initialStates = {
        advancedOptions: false,
        reimbursement: false
      };

      const { result } = renderHook(() =>
        useFormSectionState('create', initialStates)
      );

      act(() => {
        result.current.toggleSection('advancedOptions');
      });

      let stored = JSON.parse(sessionStorage.getItem('expenseForm_expansion_create'));
      expect(stored.advancedOptions).toBe(true);

      act(() => {
        result.current.toggleSection('reimbursement');
      });

      stored = JSON.parse(sessionStorage.getItem('expenseForm_expansion_create'));
      expect(stored).toEqual({
        advancedOptions: true,
        reimbursement: true
      });
    });

    test('should toggle section state correctly', () => {
      const initialStates = { advancedOptions: false };

      const { result } = renderHook(() =>
        useFormSectionState('create', initialStates)
      );

      expect(result.current.sectionStates.advancedOptions).toBe(false);

      act(() => {
        result.current.toggleSection('advancedOptions');
      });

      expect(result.current.sectionStates.advancedOptions).toBe(true);

      act(() => {
        result.current.toggleSection('advancedOptions');
      });

      expect(result.current.sectionStates.advancedOptions).toBe(false);
    });

    test('should handle toggling non-existent section', () => {
      const initialStates = { advancedOptions: false };

      const { result } = renderHook(() =>
        useFormSectionState('create', initialStates)
      );

      act(() => {
        result.current.toggleSection('nonExistent');
      });

      expect(result.current.sectionStates.nonExistent).toBe(true);
      expect(result.current.sectionStates.advancedOptions).toBe(false);
    });
  });

  describe('Separate keys for create/edit modes', () => {
    test('should use different storage keys for create and edit modes', () => {
      const createStates = { advancedOptions: false };
      const editStates = { advancedOptions: true };

      const { result: createResult } = renderHook(() =>
        useFormSectionState('create', createStates)
      );

      const { result: editResult } = renderHook(() =>
        useFormSectionState('edit', editStates)
      );

      expect(createResult.current.sectionStates).toEqual(createStates);
      expect(editResult.current.sectionStates).toEqual(editStates);

      const createStored = sessionStorage.getItem('expenseForm_expansion_create');
      const editStored = sessionStorage.getItem('expenseForm_expansion_edit');

      expect(createStored).not.toBe(editStored);
      expect(JSON.parse(createStored)).toEqual(createStates);
      expect(JSON.parse(editStored)).toEqual(editStates);
    });

    test('should maintain independent states for create and edit modes', () => {
      const { result: createResult } = renderHook(() =>
        useFormSectionState('create', { advancedOptions: false })
      );

      const { result: editResult } = renderHook(() =>
        useFormSectionState('edit', { advancedOptions: false })
      );

      act(() => {
        createResult.current.toggleSection('advancedOptions');
      });

      expect(createResult.current.sectionStates.advancedOptions).toBe(true);
      expect(editResult.current.sectionStates.advancedOptions).toBe(false);
    });

    test('should restore correct mode-specific state on remount', () => {
      // Set up create mode state
      const { result: createResult1, unmount: unmountCreate1 } = renderHook(() =>
        useFormSectionState('create', { advancedOptions: false })
      );

      act(() => {
        createResult1.current.toggleSection('advancedOptions');
      });

      unmountCreate1();

      // Set up edit mode state
      const { result: editResult1, unmount: unmountEdit1 } = renderHook(() =>
        useFormSectionState('edit', { advancedOptions: false })
      );

      act(() => {
        editResult1.current.toggleSection('advancedOptions');
        editResult1.current.toggleSection('advancedOptions'); // Toggle twice
      });

      unmountEdit1();

      // Remount create mode - should restore create state
      const { result: createResult2 } = renderHook(() =>
        useFormSectionState('create', { advancedOptions: false })
      );

      expect(createResult2.current.sectionStates.advancedOptions).toBe(true);

      // Remount edit mode - should restore edit state
      const { result: editResult2 } = renderHook(() =>
        useFormSectionState('edit', { advancedOptions: false })
      );

      expect(editResult2.current.sectionStates.advancedOptions).toBe(false);
    });
  });

  describe('State reset functionality', () => {
    test('should reset all states to initial values', () => {
      const initialStates = {
        advancedOptions: false,
        reimbursement: false,
        insurance: false
      };

      const { result } = renderHook(() =>
        useFormSectionState('create', initialStates)
      );

      // Toggle all sections
      act(() => {
        result.current.toggleSection('advancedOptions');
        result.current.toggleSection('reimbursement');
        result.current.toggleSection('insurance');
      });

      expect(result.current.sectionStates).toEqual({
        advancedOptions: true,
        reimbursement: true,
        insurance: true
      });

      // Reset
      act(() => {
        result.current.resetStates();
      });

      expect(result.current.sectionStates).toEqual(initialStates);
    });

    test('should update sessionStorage after reset', () => {
      const initialStates = { advancedOptions: false };

      const { result } = renderHook(() =>
        useFormSectionState('create', initialStates)
      );

      act(() => {
        result.current.toggleSection('advancedOptions');
      });

      let stored = JSON.parse(sessionStorage.getItem('expenseForm_expansion_create'));
      expect(stored.advancedOptions).toBe(true);

      act(() => {
        result.current.resetStates();
      });

      stored = JSON.parse(sessionStorage.getItem('expenseForm_expansion_create'));
      expect(stored).toEqual(initialStates);
    });

    test('should reset to empty object if initial states were empty', () => {
      const { result } = renderHook(() =>
        useFormSectionState('create', {})
      );

      act(() => {
        result.current.toggleSection('newSection');
      });

      expect(result.current.sectionStates.newSection).toBe(true);

      act(() => {
        result.current.resetStates();
      });

      expect(result.current.sectionStates).toEqual({});
    });

    test('should preserve initial states with mixed boolean values', () => {
      const initialStates = {
        advancedOptions: true,
        reimbursement: false,
        insurance: true
      };

      const { result } = renderHook(() =>
        useFormSectionState('create', initialStates)
      );

      act(() => {
        result.current.toggleSection('advancedOptions');
        result.current.toggleSection('insurance');
      });

      expect(result.current.sectionStates).toEqual({
        advancedOptions: false,
        reimbursement: false,
        insurance: false
      });

      act(() => {
        result.current.resetStates();
      });

      expect(result.current.sectionStates).toEqual(initialStates);
    });
  });

  describe('Edge cases', () => {
    test('should handle rapid successive toggles', () => {
      const initialStates = { advancedOptions: false };

      const { result } = renderHook(() =>
        useFormSectionState('create', initialStates)
      );

      act(() => {
        result.current.toggleSection('advancedOptions');
        result.current.toggleSection('advancedOptions');
        result.current.toggleSection('advancedOptions');
      });

      expect(result.current.sectionStates.advancedOptions).toBe(true);
    });

    test('should handle multiple sections with different states', () => {
      const initialStates = {
        section1: false,
        section2: true,
        section3: false,
        section4: true
      };

      const { result } = renderHook(() =>
        useFormSectionState('create', initialStates)
      );

      act(() => {
        result.current.toggleSection('section1');
        result.current.toggleSection('section3');
      });

      expect(result.current.sectionStates).toEqual({
        section1: true,
        section2: true,
        section3: true,
        section4: true
      });
    });

    test('should maintain referential stability of toggle function', () => {
      const { result, rerender } = renderHook(() =>
        useFormSectionState('create', { advancedOptions: false })
      );

      const toggleFn1 = result.current.toggleSection;

      act(() => {
        result.current.toggleSection('advancedOptions');
      });

      rerender();

      const toggleFn2 = result.current.toggleSection;

      expect(toggleFn1).toBe(toggleFn2);
    });

    test('should maintain referential stability of reset function', () => {
      const initialStates = { advancedOptions: false };
      
      const { result, rerender } = renderHook(() =>
        useFormSectionState('create', initialStates)
      );

      const resetFn1 = result.current.resetStates;

      act(() => {
        result.current.toggleSection('advancedOptions');
      });

      rerender();

      const resetFn2 = result.current.resetStates;

      expect(resetFn1).toBe(resetFn2);
    });
  });
});
