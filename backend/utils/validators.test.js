const { validateNumber, validateString, validateYearMonth } = require('./validators');

describe('validators', () => {
  describe('validateNumber', () => {
    describe('required validation', () => {
      it('should throw error when value is undefined and required', () => {
        expect(() => validateNumber(undefined, 'Amount')).toThrow('Amount is required');
      });

      it('should throw error when value is null and required', () => {
        expect(() => validateNumber(null, 'Amount')).toThrow('Amount is required');
      });

      it('should not throw when value is undefined and not required', () => {
        expect(() => validateNumber(undefined, 'Amount', { required: false })).not.toThrow();
      });

      it('should not throw when value is null and allowNull is true', () => {
        expect(() => validateNumber(null, 'Amount', { allowNull: true })).not.toThrow();
      });
    });

    describe('type validation', () => {
      it('should throw error when value is not a number', () => {
        expect(() => validateNumber('123', 'Amount')).toThrow('Amount must be a valid number');
      });

      it('should throw error when value is NaN', () => {
        expect(() => validateNumber(NaN, 'Amount')).toThrow('Amount must be a valid number');
      });

      it('should accept valid numbers', () => {
        expect(validateNumber(123, 'Amount')).toBe(true);
        expect(validateNumber(0, 'Amount')).toBe(true);
        expect(validateNumber(-5, 'Amount')).toBe(true);
        expect(validateNumber(3.14, 'Amount')).toBe(true);
      });
    });

    describe('min validation', () => {
      it('should throw error when value is below minimum', () => {
        expect(() => validateNumber(5, 'Amount', { min: 10 })).toThrow('Amount must be at least 10');
      });

      it('should accept value equal to minimum', () => {
        expect(validateNumber(10, 'Amount', { min: 10 })).toBe(true);
      });

      it('should accept value above minimum', () => {
        expect(validateNumber(15, 'Amount', { min: 10 })).toBe(true);
      });
    });

    describe('max validation', () => {
      it('should throw error when value is above maximum', () => {
        expect(() => validateNumber(15, 'Amount', { max: 10 })).toThrow('Amount must be at most 10');
      });

      it('should accept value equal to maximum', () => {
        expect(validateNumber(10, 'Amount', { max: 10 })).toBe(true);
      });

      it('should accept value below maximum', () => {
        expect(validateNumber(5, 'Amount', { max: 10 })).toBe(true);
      });
    });

    describe('combined min/max validation', () => {
      it('should accept value within range', () => {
        expect(validateNumber(50, 'Amount', { min: 0, max: 100 })).toBe(true);
      });

      it('should throw error when value is below min in range', () => {
        expect(() => validateNumber(-1, 'Amount', { min: 0, max: 100 })).toThrow('Amount must be at least 0');
      });

      it('should throw error when value is above max in range', () => {
        expect(() => validateNumber(101, 'Amount', { min: 0, max: 100 })).toThrow('Amount must be at most 100');
      });
    });
  });

  describe('validateString', () => {
    describe('required validation', () => {
      it('should throw error when value is undefined and required', () => {
        expect(() => validateString(undefined, 'Name')).toThrow('Name is required');
      });

      it('should throw error when value is null and required', () => {
        expect(() => validateString(null, 'Name')).toThrow('Name is required');
      });

      it('should throw error when value is empty string and required', () => {
        expect(() => validateString('', 'Name')).toThrow('Name is required');
      });

      it('should not throw when value is undefined and not required', () => {
        expect(() => validateString(undefined, 'Name', { required: false })).not.toThrow();
      });

      it('should not throw when value is empty string and not required', () => {
        expect(() => validateString('', 'Name', { required: false })).not.toThrow();
      });
    });

    describe('type validation', () => {
      it('should throw error when value is not a string', () => {
        expect(() => validateString(123, 'Name')).toThrow('Name must be a string');
      });

      it('should throw error when value is an object', () => {
        expect(() => validateString({}, 'Name')).toThrow('Name must be a string');
      });

      it('should throw error when value is an array', () => {
        expect(() => validateString([], 'Name')).toThrow('Name must be a string');
      });

      it('should accept valid strings', () => {
        expect(validateString('test', 'Name')).toBe(true);
        expect(validateString('a', 'Name')).toBe(true);
        expect(validateString('hello world', 'Name')).toBe(true);
      });
    });

    describe('minLength validation', () => {
      it('should throw error when string is too short', () => {
        expect(() => validateString('ab', 'Name', { minLength: 3 })).toThrow('Name must be at least 3 characters long');
      });

      it('should accept string equal to minLength', () => {
        expect(validateString('abc', 'Name', { minLength: 3 })).toBe(true);
      });

      it('should accept string longer than minLength', () => {
        expect(validateString('abcd', 'Name', { minLength: 3 })).toBe(true);
      });
    });

    describe('maxLength validation', () => {
      it('should throw error when string is too long', () => {
        expect(() => validateString('abcd', 'Name', { maxLength: 3 })).toThrow('Name must be at most 3 characters long');
      });

      it('should accept string equal to maxLength', () => {
        expect(validateString('abc', 'Name', { maxLength: 3 })).toBe(true);
      });

      it('should accept string shorter than maxLength', () => {
        expect(validateString('ab', 'Name', { maxLength: 3 })).toBe(true);
      });
    });

    describe('pattern validation', () => {
      it('should throw error when string does not match pattern', () => {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        expect(() => validateString('invalid-email', 'Email', { pattern: emailPattern })).toThrow('Email has invalid format');
      });

      it('should accept string that matches pattern', () => {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        expect(validateString('test@example.com', 'Email', { pattern: emailPattern })).toBe(true);
      });

      it('should validate date format YYYY-MM', () => {
        const datePattern = /^\d{4}-\d{2}$/;
        expect(validateString('2024-11', 'Date', { pattern: datePattern })).toBe(true);
        expect(() => validateString('2024-1', 'Date', { pattern: datePattern })).toThrow('Date has invalid format');
      });
    });

    describe('combined validations', () => {
      it('should validate minLength and maxLength together', () => {
        expect(validateString('hello', 'Name', { minLength: 3, maxLength: 10 })).toBe(true);
        expect(() => validateString('hi', 'Name', { minLength: 3, maxLength: 10 })).toThrow('Name must be at least 3 characters long');
        expect(() => validateString('hello world!', 'Name', { minLength: 3, maxLength: 10 })).toThrow('Name must be at most 10 characters long');
      });

      it('should validate pattern and length together', () => {
        const alphaPattern = /^[a-zA-Z]+$/;
        expect(validateString('hello', 'Name', { minLength: 3, pattern: alphaPattern })).toBe(true);
        expect(() => validateString('hello123', 'Name', { pattern: alphaPattern })).toThrow('Name has invalid format');
      });
    });
  });

  describe('validateYearMonth', () => {
    it('should accept valid year and month', () => {
      expect(validateYearMonth(2024, 11)).toBe(true);
      expect(validateYearMonth(2000, 1)).toBe(true);
      expect(validateYearMonth(2050, 12)).toBe(true);
    });

    it('should throw error for invalid year (too low)', () => {
      expect(() => validateYearMonth(1899, 6)).toThrow('Year must be at least 1900');
    });

    it('should throw error for invalid year (too high)', () => {
      expect(() => validateYearMonth(2101, 6)).toThrow('Year must be at most 2100');
    });

    it('should throw error for invalid month (too low)', () => {
      expect(() => validateYearMonth(2024, 0)).toThrow('Month must be at least 1');
    });

    it('should throw error for invalid month (too high)', () => {
      expect(() => validateYearMonth(2024, 13)).toThrow('Month must be at most 12');
    });

    it('should throw error for non-number year', () => {
      expect(() => validateYearMonth('2024', 6)).toThrow('Year must be a valid number');
    });

    it('should throw error for non-number month', () => {
      expect(() => validateYearMonth(2024, '6')).toThrow('Month must be a valid number');
    });

    it('should accept boundary values', () => {
      expect(validateYearMonth(1900, 1)).toBe(true);
      expect(validateYearMonth(2100, 12)).toBe(true);
    });
  });
});
