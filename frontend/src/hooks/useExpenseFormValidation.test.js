import { describe, it, expect } from 'vitest';
import useExpenseFormValidation from './useExpenseFormValidation';

// Since useExpenseFormValidation is a pure function hook with no React state,
// we can test it directly without renderHook.
const { validate } = useExpenseFormValidation();

// Helper to build valid form data
const validFormData = (overrides = {}) => ({
  date: '2024-06-15',
  amount: '50.00',
  type: 'Food',
  payment_method_id: 1,
  place: 'Grocery Store',
  notes: '',
  ...overrides,
});

// Helper to build valid options (no special flags)
const defaultOptions = (overrides = {}) => ({
  isMedicalExpense: false,
  insuranceEligible: false,
  originalCost: '',
  isCreditCard: false,
  postedDate: '',
  showGenericReimbursementUI: false,
  genericOriginalCost: '',
  ...overrides,
});

describe('useExpenseFormValidation', () => {
  describe('basic field validations', () => {
    it('should reject empty date', () => {
      const result = validate(validFormData({ date: '' }), defaultOptions());
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ message: 'Date is required', field: 'date' });
    });

    it('should reject missing amount', () => {
      const result = validate(validFormData({ amount: '' }), defaultOptions());
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ message: 'Amount must be a positive number', field: 'amount' });
    });

    it('should reject zero amount', () => {
      const result = validate(validFormData({ amount: '0' }), defaultOptions());
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ message: 'Amount must be a positive number', field: 'amount' });
    });

    it('should reject negative amount', () => {
      const result = validate(validFormData({ amount: '-10' }), defaultOptions());
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ message: 'Amount must be a positive number', field: 'amount' });
    });

    it('should reject empty type', () => {
      const result = validate(validFormData({ type: '' }), defaultOptions());
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ message: 'Type is required', field: 'type' });
    });

    it('should reject missing payment_method_id', () => {
      const result = validate(validFormData({ payment_method_id: null }), defaultOptions());
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ message: 'Payment method is required', field: 'payment_method_id' });
    });

    it('should reject undefined payment_method_id', () => {
      const result = validate(validFormData({ payment_method_id: undefined }), defaultOptions());
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ message: 'Payment method is required', field: 'payment_method_id' });
    });

    it('should reject place longer than 200 characters', () => {
      const result = validate(validFormData({ place: 'a'.repeat(201) }), defaultOptions());
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ message: 'Place must be 200 characters or less', field: 'place' });
    });

    it('should accept place exactly 200 characters', () => {
      const result = validate(validFormData({ place: 'a'.repeat(200) }), defaultOptions());
      expect(result.valid).toBe(true);
    });

    it('should reject notes longer than 200 characters', () => {
      const result = validate(validFormData({ notes: 'a'.repeat(201) }), defaultOptions());
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ message: 'Notes must be 200 characters or less', field: 'notes' });
    });

    it('should accept notes exactly 200 characters', () => {
      const result = validate(validFormData({ notes: 'a'.repeat(200) }), defaultOptions());
      expect(result.valid).toBe(true);
    });
  });

  describe('valid form data', () => {
    it('should pass with all valid fields', () => {
      const result = validate(validFormData(), defaultOptions());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should pass with empty place and notes', () => {
      const result = validate(validFormData({ place: '', notes: '' }), defaultOptions());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('insurance validation for medical expenses', () => {
    it('should reject when original cost is zero for insurance-eligible medical expense', () => {
      const result = validate(
        validFormData({ amount: '50' }),
        defaultOptions({ isMedicalExpense: true, insuranceEligible: true, originalCost: '0' })
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        message: 'Original cost is required for insurance-eligible expenses',
        field: 'originalCost',
      });
    });

    it('should reject when original cost is empty for insurance-eligible medical expense', () => {
      const result = validate(
        validFormData({ amount: '50' }),
        defaultOptions({ isMedicalExpense: true, insuranceEligible: true, originalCost: '' })
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        message: 'Original cost is required for insurance-eligible expenses',
        field: 'originalCost',
      });
    });

    it('should reject when out-of-pocket exceeds original cost', () => {
      const result = validate(
        validFormData({ amount: '100' }),
        defaultOptions({ isMedicalExpense: true, insuranceEligible: true, originalCost: '80' })
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        message: 'Out-of-pocket amount cannot exceed original cost',
        field: 'originalCost',
      });
    });

    it('should pass when out-of-pocket equals original cost', () => {
      const result = validate(
        validFormData({ amount: '100' }),
        defaultOptions({ isMedicalExpense: true, insuranceEligible: true, originalCost: '100' })
      );
      expect(result.valid).toBe(true);
    });

    it('should pass when out-of-pocket is less than original cost', () => {
      const result = validate(
        validFormData({ amount: '50' }),
        defaultOptions({ isMedicalExpense: true, insuranceEligible: true, originalCost: '100' })
      );
      expect(result.valid).toBe(true);
    });

    it('should skip insurance validation when not medical expense', () => {
      const result = validate(
        validFormData({ amount: '100' }),
        defaultOptions({ isMedicalExpense: false, insuranceEligible: true, originalCost: '50' })
      );
      expect(result.valid).toBe(true);
    });

    it('should skip insurance validation when not insurance eligible', () => {
      const result = validate(
        validFormData({ amount: '100' }),
        defaultOptions({ isMedicalExpense: true, insuranceEligible: false, originalCost: '50' })
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('posted date validation for credit card expenses', () => {
    it('should reject posted date before expense date', () => {
      const result = validate(
        validFormData({ date: '2024-06-15' }),
        defaultOptions({ isCreditCard: true, postedDate: '2024-06-10' })
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        message: 'Posted date cannot be before transaction date',
        field: 'postedDate',
      });
    });

    it('should pass when posted date equals expense date', () => {
      const result = validate(
        validFormData({ date: '2024-06-15' }),
        defaultOptions({ isCreditCard: true, postedDate: '2024-06-15' })
      );
      expect(result.valid).toBe(true);
    });

    it('should pass when posted date is after expense date', () => {
      const result = validate(
        validFormData({ date: '2024-06-15' }),
        defaultOptions({ isCreditCard: true, postedDate: '2024-06-20' })
      );
      expect(result.valid).toBe(true);
    });

    it('should skip posted date validation when not credit card', () => {
      const result = validate(
        validFormData({ date: '2024-06-15' }),
        defaultOptions({ isCreditCard: false, postedDate: '2024-06-10' })
      );
      expect(result.valid).toBe(true);
    });

    it('should skip posted date validation when posted date is empty', () => {
      const result = validate(
        validFormData({ date: '2024-06-15' }),
        defaultOptions({ isCreditCard: true, postedDate: '' })
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('generic reimbursement validation', () => {
    it('should reject negative original cost', () => {
      const result = validate(
        validFormData({ amount: '50' }),
        defaultOptions({ showGenericReimbursementUI: true, genericOriginalCost: '-10' })
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        message: 'Original cost must be a non-negative number',
        field: 'genericOriginalCost',
      });
    });

    it('should reject non-numeric original cost', () => {
      const result = validate(
        validFormData({ amount: '50' }),
        defaultOptions({ showGenericReimbursementUI: true, genericOriginalCost: 'abc' })
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        message: 'Original cost must be a non-negative number',
        field: 'genericOriginalCost',
      });
    });

    it('should reject net amount exceeding original cost', () => {
      const result = validate(
        validFormData({ amount: '100' }),
        defaultOptions({ showGenericReimbursementUI: true, genericOriginalCost: '80' })
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        message: 'Net amount cannot exceed original cost',
        field: 'genericOriginalCost',
      });
    });

    it('should pass when net amount equals original cost', () => {
      const result = validate(
        validFormData({ amount: '100' }),
        defaultOptions({ showGenericReimbursementUI: true, genericOriginalCost: '100' })
      );
      expect(result.valid).toBe(true);
    });

    it('should pass when net amount is less than original cost', () => {
      const result = validate(
        validFormData({ amount: '50' }),
        defaultOptions({ showGenericReimbursementUI: true, genericOriginalCost: '100' })
      );
      expect(result.valid).toBe(true);
    });

    it('should skip reimbursement validation when UI is not shown', () => {
      const result = validate(
        validFormData({ amount: '100' }),
        defaultOptions({ showGenericReimbursementUI: false, genericOriginalCost: '50' })
      );
      expect(result.valid).toBe(true);
    });

    it('should skip reimbursement validation when original cost is empty', () => {
      const result = validate(
        validFormData({ amount: '100' }),
        defaultOptions({ showGenericReimbursementUI: true, genericOriginalCost: '' })
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('multiple errors', () => {
    it('should collect multiple errors at once', () => {
      const result = validate(
        { date: '', amount: '', type: '', payment_method_id: null, place: '', notes: '' },
        defaultOptions()
      );
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('default options', () => {
    it('should work with no options provided', () => {
      const result = validate(validFormData());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });
});
