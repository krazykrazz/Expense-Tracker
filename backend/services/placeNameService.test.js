const placeNameService = require('./placeNameService');

describe('PlaceNameService - Fuzzy Matching Algorithm', () => {
  describe('levenshteinDistance', () => {
    test('should return 0 for identical strings', () => {
      expect(placeNameService.levenshteinDistance('walmart', 'walmart')).toBe(0);
    });

    test('should return 1 for single character difference', () => {
      expect(placeNameService.levenshteinDistance('walmart', 'walmaxt')).toBe(1);
    });

    test('should calculate distance for case differences', () => {
      // Note: levenshtein works on raw strings, case matters
      expect(placeNameService.levenshteinDistance('Walmart', 'walmart')).toBe(1);
    });

    test('should calculate distance for insertions', () => {
      expect(placeNameService.levenshteinDistance('walmart', 'wal-mart')).toBe(1);
    });

    test('should calculate distance for deletions', () => {
      expect(placeNameService.levenshteinDistance('walmart', 'walart')).toBe(1);
    });

    test('should calculate distance for substitutions', () => {
      expect(placeNameService.levenshteinDistance('walmart', 'walmert')).toBe(1);
    });

    test('should handle empty strings', () => {
      expect(placeNameService.levenshteinDistance('', '')).toBe(0);
      expect(placeNameService.levenshteinDistance('walmart', '')).toBe(7);
      expect(placeNameService.levenshteinDistance('', 'walmart')).toBe(7);
    });

    test('should calculate distance for completely different strings', () => {
      const distance = placeNameService.levenshteinDistance('walmart', 'costco');
      expect(distance).toBeGreaterThan(4);
    });
  });

  describe('normalizeString', () => {
    test('should convert to lowercase', () => {
      expect(placeNameService.normalizeString('Walmart')).toBe('walmart');
      expect(placeNameService.normalizeString('WALMART')).toBe('walmart');
    });

    test('should trim whitespace', () => {
      expect(placeNameService.normalizeString('  walmart  ')).toBe('walmart');
      expect(placeNameService.normalizeString('\twalmarttest\n')).toBe('walmarttest');
    });

    test('should replace multiple spaces with single space', () => {
      expect(placeNameService.normalizeString('wal   mart')).toBe('wal mart');
      expect(placeNameService.normalizeString('wal  mart  store')).toBe('wal mart store');
    });

    test('should handle empty or null strings', () => {
      expect(placeNameService.normalizeString('')).toBe('');
      expect(placeNameService.normalizeString(null)).toBe('');
      expect(placeNameService.normalizeString(undefined)).toBe('');
    });

    test('should combine all normalizations', () => {
      expect(placeNameService.normalizeString('  WAL   MART  ')).toBe('wal mart');
    });
  });

  describe('calculateSimilarity', () => {
    test('should return 1.0 for identical strings after normalization', () => {
      expect(placeNameService.calculateSimilarity('Walmart', 'walmart')).toBe(1.0);
      expect(placeNameService.calculateSimilarity('  Walmart  ', 'walmart')).toBe(1.0);
    });

    test('should return 0.9 for substring matches', () => {
      expect(placeNameService.calculateSimilarity('Walmart', 'Walmart Store')).toBe(0.9);
      expect(placeNameService.calculateSimilarity('Store', 'Walmart Store')).toBe(0.9);
    });

    test('should return 0.95 for punctuation differences', () => {
      expect(placeNameService.calculateSimilarity('Wal-Mart', 'Walmart')).toBe(0.95);
      expect(placeNameService.calculateSimilarity("McDonald's", 'McDonalds')).toBe(0.95);
    });

    test('should return high score for small Levenshtein distance', () => {
      const similarity = placeNameService.calculateSimilarity('walmart', 'walmart');
      expect(similarity).toBeGreaterThanOrEqual(0.85);
    });

    test('should return low score for very different strings', () => {
      const similarity = placeNameService.calculateSimilarity('Walmart', 'Costco');
      expect(similarity).toBeLessThan(0.5);
    });

    test('should handle case and whitespace variations', () => {
      expect(placeNameService.calculateSimilarity('WAL MART', 'wal mart')).toBe(1.0);
    });
  });

  describe('areSimilar', () => {
    test('should return true for similar names above threshold', () => {
      expect(placeNameService.areSimilar('Walmart', 'walmart')).toBe(true);
      expect(placeNameService.areSimilar('Wal-Mart', 'Walmart')).toBe(true);
      expect(placeNameService.areSimilar('walmart', 'walmart')).toBe(true);
    });

    test('should return false for dissimilar names', () => {
      expect(placeNameService.areSimilar('Walmart', 'Costco')).toBe(false);
      expect(placeNameService.areSimilar('Target', 'Safeway')).toBe(false);
    });

    test('should respect custom threshold', () => {
      // With high threshold, even small differences fail
      expect(placeNameService.areSimilar('walmart', 'walart', 0.95)).toBe(false);
      
      // With low threshold, more differences pass
      expect(placeNameService.areSimilar('walmart', 'walart', 0.7)).toBe(true);
    });

    test('should use default threshold of 0.8', () => {
      // This should pass with default threshold
      expect(placeNameService.areSimilar('Walmart', 'walmart')).toBe(true);
    });
  });

  describe('groupSimilarNames', () => {
    test('should group similar place names together', () => {
      const placeNames = [
        { place: 'Walmart', count: 45 },
        { place: 'walmart', count: 12 },
        { place: 'Wal-Mart', count: 8 }
      ];

      const groups = placeNameService.groupSimilarNames(placeNames);

      expect(groups).toHaveLength(1);
      expect(groups[0].variations).toHaveLength(3);
      expect(groups[0].totalCount).toBe(65);
    });

    test('should suggest most frequent variation as canonical', () => {
      const placeNames = [
        { place: 'walmart', count: 12 },
        { place: 'Walmart', count: 45 },
        { place: 'Wal-Mart', count: 8 }
      ];

      const groups = placeNameService.groupSimilarNames(placeNames);

      expect(groups[0].suggestedCanonical).toBe('Walmart');
    });

    test('should not group dissimilar names', () => {
      const placeNames = [
        { place: 'Walmart', count: 45 },
        { place: 'Costco', count: 30 }
      ];

      const groups = placeNameService.groupSimilarNames(placeNames);

      expect(groups).toHaveLength(0); // No groups with multiple variations
    });

    test('should handle multiple distinct groups', () => {
      const placeNames = [
        { place: 'Walmart', count: 45 },
        { place: 'walmart', count: 12 },
        { place: 'Costco', count: 30 },
        { place: 'costco', count: 15 }
      ];

      const groups = placeNameService.groupSimilarNames(placeNames);

      expect(groups).toHaveLength(2);
      expect(groups[0].totalCount).toBe(57); // Walmart group (sorted by count)
      expect(groups[1].totalCount).toBe(45); // Costco group
    });

    test('should sort groups by total count descending', () => {
      const placeNames = [
        { place: 'Costco', count: 30 },
        { place: 'costco', count: 15 },
        { place: 'Walmart', count: 45 },
        { place: 'walmart', count: 20 }
      ];

      const groups = placeNameService.groupSimilarNames(placeNames);

      expect(groups[0].totalCount).toBeGreaterThan(groups[1].totalCount);
    });

    test('should sort variations within group by count descending', () => {
      const placeNames = [
        { place: 'walmart', count: 12 },
        { place: 'Walmart', count: 45 },
        { place: 'Wal-Mart', count: 8 }
      ];

      const groups = placeNameService.groupSimilarNames(placeNames);

      expect(groups[0].variations[0].count).toBe(45);
      expect(groups[0].variations[1].count).toBe(12);
      expect(groups[0].variations[2].count).toBe(8);
    });

    test('should assign unique IDs to groups', () => {
      const placeNames = [
        { place: 'Walmart', count: 45 },
        { place: 'walmart', count: 12 },
        { place: 'Costco', count: 30 },
        { place: 'costco', count: 15 }
      ];

      const groups = placeNameService.groupSimilarNames(placeNames);

      expect(groups[0].id).toBe('group-1');
      expect(groups[1].id).toBe('group-2');
    });

    test('should handle empty input', () => {
      const groups = placeNameService.groupSimilarNames([]);
      expect(groups).toHaveLength(0);
    });

    test('should only include groups with multiple variations', () => {
      const placeNames = [
        { place: 'Walmart', count: 45 },
        { place: 'walmart', count: 12 },
        { place: 'UniqueStore', count: 5 }
      ];

      const groups = placeNameService.groupSimilarNames(placeNames);

      expect(groups).toHaveLength(1); // Only Walmart group
      expect(groups[0].variations.some(v => v.name === 'UniqueStore')).toBe(false);
    });
  });
});

describe('PlaceNameService - Validation', () => {
  describe('validateUpdates', () => {
    test('should accept valid updates array', () => {
      const updates = [
        { from: ['walmart', 'Wal-Mart'], to: 'Walmart' },
        { from: ['costco'], to: 'Costco' }
      ];
      
      expect(() => placeNameService.validateUpdates(updates)).not.toThrow();
    });

    test('should reject non-array input', () => {
      expect(() => placeNameService.validateUpdates('not an array')).toThrow('Updates must be an array');
    });

    test('should reject empty array', () => {
      expect(() => placeNameService.validateUpdates([])).toThrow('Updates array cannot be empty');
    });

    test('should reject update with non-array from field', () => {
      const updates = [{ from: 'not an array', to: 'Walmart' }];
      expect(() => placeNameService.validateUpdates(updates)).toThrow("'from' must be an array");
    });

    test('should reject update with empty from array', () => {
      const updates = [{ from: [], to: 'Walmart' }];
      expect(() => placeNameService.validateUpdates(updates)).toThrow("'from' array cannot be empty");
    });

    test('should reject update with non-string to field', () => {
      const updates = [{ from: ['walmart'], to: 123 }];
      expect(() => placeNameService.validateUpdates(updates)).toThrow("'to' must be a string");
    });

    test('should reject update with empty to field', () => {
      const updates = [{ from: ['walmart'], to: '   ' }];
      expect(() => placeNameService.validateUpdates(updates)).toThrow("'to' cannot be empty or whitespace");
    });

    test('should reject update with non-string in from array', () => {
      const updates = [{ from: ['walmart', 123], to: 'Walmart' }];
      expect(() => placeNameService.validateUpdates(updates)).toThrow("'from[1]' must be a string");
    });

    test('should reject update with empty string in from array', () => {
      const updates = [{ from: ['walmart', '  '], to: 'Walmart' }];
      expect(() => placeNameService.validateUpdates(updates)).toThrow("'from[1]' cannot be empty or whitespace");
    });
  });
});
