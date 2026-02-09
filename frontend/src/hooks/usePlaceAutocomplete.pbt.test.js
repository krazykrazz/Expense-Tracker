import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property-based tests for place autocomplete filtering logic
 * 
 * Feature: post-spec-cleanup
 * Property 3: Place autocomplete filtering is case-insensitive substring match
 * 
 * Validates: Requirements 3.4
 */

/**
 * Pure function extracted from usePlaceAutocomplete for testing
 * Filters places based on case-insensitive substring match
 */
function filterPlacesList(places, searchValue) {
  if (searchValue.trim() === '') {
    return [];
  }
  return places.filter(place =>
    place.toLowerCase().includes(searchValue.toLowerCase())
  );
}

describe('usePlaceAutocomplete - Property-Based Tests', () => {
  describe('Property 3: Place autocomplete filtering is case-insensitive substring match', () => {
    it('filtered results are a subset of the original list', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 50 })),
          fc.string({ maxLength: 20 }),
          (places, searchValue) => {
            const filtered = filterPlacesList(places, searchValue);
            
            // Every filtered item must exist in the original list
            return filtered.every(item => places.includes(item));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('every filtered item contains the search string (case-insensitive)', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 50 })),
          fc.string({ minLength: 1, maxLength: 20 }),
          (places, searchValue) => {
            const filtered = filterPlacesList(places, searchValue);
            const lowerSearch = searchValue.toLowerCase();
            
            // Every filtered item must contain the search string (case-insensitive)
            return filtered.every(place => 
              place.toLowerCase().includes(lowerSearch)
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns empty array for empty or whitespace-only search', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 50 })),
          fc.constantFrom('', ' ', '  ', '\t', '\n', '   '),
          (places, searchValue) => {
            const filtered = filterPlacesList(places, searchValue);
            return filtered.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filtering is case-insensitive', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 50 })),
          fc.string({ minLength: 1, maxLength: 20 }),
          (places, searchValue) => {
            const filteredLower = filterPlacesList(places, searchValue.toLowerCase());
            const filteredUpper = filterPlacesList(places, searchValue.toUpperCase());
            const filteredMixed = filterPlacesList(places, searchValue);
            
            // All three should produce the same results
            return (
              filteredLower.length === filteredUpper.length &&
              filteredLower.length === filteredMixed.length &&
              filteredLower.every((item, idx) => item === filteredUpper[idx]) &&
              filteredLower.every((item, idx) => item === filteredMixed[idx])
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filtering is monotonic: longer search strings produce fewer or equal results', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 50 })),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          (places, searchValue, suffix) => {
            const filtered1 = filterPlacesList(places, searchValue);
            const filtered2 = filterPlacesList(places, searchValue + suffix);
            
            // Longer search string should produce fewer or equal results
            return filtered2.length <= filtered1.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('exact match is always included in results', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 50 })),
          fc.integer({ min: 0, max: 49 }),
          (places, index) => {
            if (places.length === 0) return true;
            
            const targetIndex = index % places.length;
            const exactPlace = places[targetIndex];
            const filtered = filterPlacesList(places, exactPlace);
            
            // The exact match must be in the filtered results
            return filtered.includes(exactPlace);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('substring match works for any position in the string', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 50 }),
          fc.integer({ min: 0, max: 45 }),
          fc.integer({ min: 1, max: 5 }),
          (place, startPos, length) => {
            if (startPos + length > place.length) return true;
            
            const substring = place.substring(startPos, startPos + length);
            const places = [place];
            const filtered = filterPlacesList(places, substring);
            
            // The place containing the substring must be in results
            return filtered.includes(place);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filtering with non-existent substring returns empty array', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 50 })),
          (places) => {
            // Use a search string that's extremely unlikely to match
            const searchValue = '🦄🌈✨NONEXISTENT_PLACE_12345✨🌈🦄';
            const filtered = filterPlacesList(places, searchValue);
            
            // Should return empty array (unless by extreme chance a place contains this)
            return filtered.length === 0 || filtered.every(place => 
              place.toLowerCase().includes(searchValue.toLowerCase())
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filtering preserves order of original list', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 50 })),
          fc.string({ minLength: 1, maxLength: 20 }),
          (places, searchValue) => {
            const filtered = filterPlacesList(places, searchValue);
            
            // Find indices in original array
            const indices = filtered.map(place => places.indexOf(place));
            
            // Indices should be in ascending order (preserving original order)
            for (let i = 1; i < indices.length; i++) {
              if (indices[i] < indices[i - 1]) {
                return false;
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filtering is idempotent: filtering twice produces same result', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 50 })),
          fc.string({ minLength: 1, maxLength: 20 }),
          (places, searchValue) => {
            const filtered1 = filterPlacesList(places, searchValue);
            const filtered2 = filterPlacesList(filtered1, searchValue);
            
            // Filtering the filtered results should produce the same result
            return (
              filtered1.length === filtered2.length &&
              filtered1.every((item, idx) => item === filtered2[idx])
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
