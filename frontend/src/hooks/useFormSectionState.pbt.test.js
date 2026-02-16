/**
 * @invariant Session State Persistence: For any form section toggle state, saving to sessionStorage and reading back returns the same state; the hook correctly initializes from persisted state. Randomization covers diverse section name and state combinations.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { useFormSectionState } from './useFormSectionState';

describe('useFormSectionState - Property-Based Tests', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  // Feature: expense-form-simplification, Property 3: Session state persistence
  test('Property 3: Session state persistence across renders', () => {
    /**
     * **Validates: Requirements 1.3, 11.2, 11.5**
     * 
     * For any section expansion state change, the new state should be stored in 
     * sessionStorage with the appropriate key (create or edit mode), and should 
     * be retrievable on subsequent renders within the same session.
     */
    fc.assert(
      fc.property(
        // Generate random mode
        fc.constantFrom('create', 'edit'),
        // Generate random section names
        fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 5 }),
        // Generate random boolean states
        fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }),
        (mode, sectionNames, booleanStates) => {
          // Create initial states object
          const initialStates = {};
          const numSections = Math.min(sectionNames.length, booleanStates.length);
          
          for (let i = 0; i < numSections; i++) {
            initialStates[sectionNames[i]] = booleanStates[i];
          }

          // First render - initialize with initial states
          const { result: result1, unmount: unmount1 } = renderHook(() =>
            useFormSectionState(mode, initialStates)
          );

          // Toggle some sections
          const sectionsToToggle = sectionNames.slice(0, Math.ceil(numSections / 2));
          act(() => {
            sectionsToToggle.forEach(section => {
              result1.current.toggleSection(section);
            });
          });

          // Capture the state after toggles
          const stateAfterToggles = { ...result1.current.sectionStates };

          // Unmount the hook
          unmount1();

          // Second render - should restore from sessionStorage
          const { result: result2, unmount: unmount2 } = renderHook(() =>
            useFormSectionState(mode, initialStates)
          );

          // Verify state was restored from sessionStorage
          expect(result2.current.sectionStates).toEqual(stateAfterToggles);

          // Verify sessionStorage contains the correct data
          const storageKey = `expenseForm_expansion_${mode}`;
          const storedData = JSON.parse(sessionStorage.getItem(storageKey));
          expect(storedData).toEqual(stateAfterToggles);

          unmount2();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3a: Separate storage keys for create and edit modes', () => {
    /**
     * **Validates: Requirements 11.2**
     * 
     * Create and edit modes should use separate sessionStorage keys to maintain
     * independent expansion preferences.
     */
    fc.assert(
      fc.property(
        // Generate random section states
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          fc.boolean(),
          { minKeys: 1, maxKeys: 5 }
        ),
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          fc.boolean(),
          { minKeys: 1, maxKeys: 5 }
        ),
        (createStates, editStates) => {
          // Render hook in create mode
          const { result: createResult, unmount: unmountCreate } = renderHook(() =>
            useFormSectionState('create', createStates)
          );

          // Render hook in edit mode
          const { result: editResult, unmount: unmountEdit } = renderHook(() =>
            useFormSectionState('edit', editStates)
          );

          // Verify separate storage keys exist
          const createKey = 'expenseForm_expansion_create';
          const editKey = 'expenseForm_expansion_edit';

          const createStored = JSON.parse(sessionStorage.getItem(createKey));
          const editStored = JSON.parse(sessionStorage.getItem(editKey));

          expect(createStored).toEqual(createResult.current.sectionStates);
          expect(editStored).toEqual(editResult.current.sectionStates);

          // Verify they are independent
          expect(createStored).not.toEqual(editStored);

          unmountCreate();
          unmountEdit();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3b: Multiple toggles result in correct final state', () => {
    /**
     * **Validates: Requirements 1.3, 11.5**
     * 
     * For any sequence of toggle operations, the final state should be correct
     * (odd number of toggles inverts initial state, even number restores it).
     */
    fc.assert(
      fc.property(
        fc.constantFrom('create', 'edit'),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        fc.boolean(),
        fc.integer({ min: 1, max: 10 }), // Number of toggles (at least 1)
        (mode, sectionName, initialState, numToggles) => {
          // CRITICAL: Clear sessionStorage before each property test run
          // to ensure we start with a clean state
          sessionStorage.clear();

          const initialStates = { [sectionName]: initialState };

          const { result, unmount } = renderHook(() =>
            useFormSectionState(mode, initialStates)
          );

          // Perform multiple toggles, one at a time
          for (let i = 0; i < numToggles; i++) {
            act(() => {
              result.current.toggleSection(sectionName);
            });
          }

          // Calculate expected state: odd toggles invert, even toggles restore
          const expectedState = numToggles % 2 === 0 ? initialState : !initialState;

          // Verify final state is correct
          expect(result.current.sectionStates[sectionName]).toBe(expectedState);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3c: Reset function restores initial states and updates storage', () => {
    /**
     * **Validates: Requirements 11.3**
     * 
     * The reset function should restore all sections to their initial states
     * and update sessionStorage accordingly.
     */
    fc.assert(
      fc.property(
        fc.constantFrom('create', 'edit'),
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          fc.boolean(),
          { minKeys: 1, maxKeys: 5 }
        ),
        (mode, initialStates) => {
          const { result, unmount } = renderHook(() =>
            useFormSectionState(mode, initialStates)
          );

          const storageKey = `expenseForm_expansion_${mode}`;

          // Capture initial state
          const stateBeforeToggle = { ...result.current.sectionStates };

          // Toggle all sections to change state
          act(() => {
            Object.keys(initialStates).forEach(section => {
              result.current.toggleSection(section);
            });
          });

          // Verify states have changed (inverted from initial)
          Object.keys(initialStates).forEach(section => {
            expect(result.current.sectionStates[section]).toBe(!stateBeforeToggle[section]);
          });

          // Reset states
          act(() => {
            result.current.resetStates();
          });

          // Verify states are restored to initial values
          expect(result.current.sectionStates).toEqual(initialStates);

          // Verify sessionStorage is updated
          const stored = JSON.parse(sessionStorage.getItem(storageKey));
          expect(stored).toEqual(initialStates);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 3d: Handles corrupted sessionStorage gracefully', () => {
    /**
     * **Validates: Requirements 1.3**
     * 
     * If sessionStorage contains invalid JSON, the hook should fall back to
     * initial states without crashing.
     */
    fc.assert(
      fc.property(
        fc.constantFrom('create', 'edit'),
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          fc.boolean(),
          { minKeys: 1, maxKeys: 5 }
        ),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => {
          try {
            JSON.parse(s);
            return false; // Valid JSON, skip
          } catch {
            return true; // Invalid JSON, use it
          }
        }),
        (mode, initialStates, corruptedData) => {
          const storageKey = `expenseForm_expansion_${mode}`;

          // Set corrupted data in sessionStorage
          sessionStorage.setItem(storageKey, corruptedData);

          // Render hook - should not crash
          const { result, unmount } = renderHook(() =>
            useFormSectionState(mode, initialStates)
          );

          // Should fall back to initial states
          expect(result.current.sectionStates).toEqual(initialStates);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
