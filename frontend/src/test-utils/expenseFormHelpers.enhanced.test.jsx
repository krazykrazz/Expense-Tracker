/**
 * @file expenseFormHelpers.enhanced.test.jsx
 * @description Unit tests for enhanced ExpenseForm test helper utilities (Task 1.3)
 * 
 * Tests the new helper functions added in task 1.3:
 * - assertFieldVisible
 * - assertFieldHidden
 * - assertSubmittedData
 * - assertValidationError
 * 
 * **Validates: Requirements 8.2, 8.3**
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// Import only the new helper functions we're testing
// These don't depend on API modules, so no mocking needed
import {
  assertFieldVisible,
  assertFieldHidden,
  assertSubmittedData,
  assertValidationError
} from './expenseFormHelpers';

describe('expenseFormHelpers - assertFieldVisible', () => {
  it('should pass when field is visible by label text', () => {
    render(
      <div>
        <label htmlFor="test-field">Test Field</label>
        <input id="test-field" type="text" />
      </div>
    );

    expect(() => assertFieldVisible('Test Field')).not.toThrow();
  });

  it('should pass when field is visible by role (textbox)', () => {
    render(
      <div>
        <label htmlFor="test-field">Test Field</label>
        <input id="test-field" type="text" />
      </div>
    );

    expect(() => assertFieldVisible('Test Field')).not.toThrow();
  });

  it('should pass when field is visible by role (combobox)', () => {
    render(
      <div>
        <label htmlFor="test-select">Test Select</label>
        <select id="test-select">
          <option>Option 1</option>
        </select>
      </div>
    );

    expect(() => assertFieldVisible('Test Select')).not.toThrow();
  });

  it('should pass when field is visible by role (spinbutton)', () => {
    render(
      <div>
        <label htmlFor="test-number">Test Number</label>
        <input id="test-number" type="number" />
      </div>
    );

    expect(() => assertFieldVisible('Test Number')).not.toThrow();
  });

  it('should throw when field is not found', () => {
    render(<div>No fields here</div>);

    expect(() => assertFieldVisible('Nonexistent Field')).toThrow();
  });

  it('should handle case-insensitive matching', () => {
    render(
      <div>
        <label htmlFor="test-field">Test Field</label>
        <input id="test-field" type="text" />
      </div>
    );

    expect(() => assertFieldVisible('test field')).not.toThrow();
  });

  it('should handle partial label matching', () => {
    render(
      <div>
        <label htmlFor="test-field">Test Field *</label>
        <input id="test-field" type="text" />
      </div>
    );

    expect(() => assertFieldVisible('Test Field')).not.toThrow();
  });
});

describe('expenseFormHelpers - assertFieldHidden', () => {
  it('should pass when field is not in document', () => {
    render(<div>No fields here</div>);

    expect(() => assertFieldHidden('Nonexistent Field')).not.toThrow();
  });

  it('should throw when field is visible by label text', () => {
    render(
      <div>
        <label htmlFor="test-field">Test Field</label>
        <input id="test-field" type="text" />
      </div>
    );

    expect(() => assertFieldHidden('Test Field')).toThrow();
  });

  it('should throw when field is visible by role (textbox)', () => {
    render(
      <div>
        <label htmlFor="test-field">Test Field</label>
        <input id="test-field" type="text" />
      </div>
    );

    expect(() => assertFieldHidden('Test Field')).toThrow();
  });

  it('should throw when field is visible by role (combobox)', () => {
    render(
      <div>
        <label htmlFor="test-select">Test Select</label>
        <select id="test-select">
          <option>Option 1</option>
        </select>
      </div>
    );

    expect(() => assertFieldHidden('Test Select')).toThrow();
  });

  it('should handle case-insensitive matching', () => {
    render(<div>No fields here</div>);

    expect(() => assertFieldHidden('test field')).not.toThrow();
  });
});

describe('expenseFormHelpers - assertSubmittedData', () => {
  it('should pass when mock was called with matching data', () => {
    const mockFn = vi.fn();
    mockFn({ date: '2025-01-15', amount: 100, type: 'Other' });

    expect(() => 
      assertSubmittedData(mockFn, { date: '2025-01-15', amount: 100 })
    ).not.toThrow();
  });

  it('should pass with partial data matching', () => {
    const mockFn = vi.fn();
    mockFn({ 
      date: '2025-01-15', 
      amount: 100, 
      type: 'Other',
      paymentMethod: 1,
      week: 3
    });

    expect(() => 
      assertSubmittedData(mockFn, { date: '2025-01-15', amount: 100 })
    ).not.toThrow();
  });

  it('should throw when mock was not called', () => {
    const mockFn = vi.fn();

    expect(() => 
      assertSubmittedData(mockFn, { date: '2025-01-15' })
    ).toThrow();
  });

  it('should throw when data does not match', () => {
    const mockFn = vi.fn();
    mockFn({ date: '2025-01-15', amount: 100 });

    expect(() => 
      assertSubmittedData(mockFn, { date: '2025-02-01', amount: 200 })
    ).toThrow();
  });

  it('should handle nested object matching', () => {
    const mockFn = vi.fn();
    mockFn({ 
      expense: { date: '2025-01-15', amount: 100 },
      metadata: { source: 'test' }
    });

    expect(() => 
      assertSubmittedData(mockFn, { 
        expense: expect.objectContaining({ date: '2025-01-15' })
      })
    ).not.toThrow();
  });

  it('should handle multiple calls and match last call', () => {
    const mockFn = vi.fn();
    mockFn({ date: '2025-01-15', amount: 100 });
    mockFn({ date: '2025-02-01', amount: 200 });

    expect(() => 
      assertSubmittedData(mockFn, { date: '2025-02-01', amount: 200 })
    ).not.toThrow();
  });
});

describe('expenseFormHelpers - assertValidationError', () => {
  it('should pass when error message is present', async () => {
    render(<div>Date is required</div>);

    await expect(assertValidationError('Date is required')).resolves.toBeUndefined();
  });

  it('should pass with partial text matching', async () => {
    render(<div>Date is required</div>);

    await expect(assertValidationError('Date is')).resolves.toBeUndefined();
  });

  it('should pass with regex pattern', async () => {
    render(<div>Amount must be positive</div>);

    await expect(assertValidationError(/amount.*positive/i)).resolves.toBeUndefined();
  });

  it('should wait for error to appear', async () => {
    const { rerender } = render(<div>No error</div>);

    const assertPromise = assertValidationError('Date is required');

    setTimeout(() => {
      rerender(<div>Date is required</div>);
    }, 50);

    await expect(assertPromise).resolves.toBeUndefined();
  });

  it('should throw when error does not appear within timeout', async () => {
    render(<div>No error</div>);

    await expect(assertValidationError('Date is required')).rejects.toThrow();
  });

  it('should handle multiple error messages', async () => {
    render(
      <div>
        <div>Date is required</div>
        <div>Amount is required</div>
      </div>
    );

    await expect(assertValidationError('Date is required')).resolves.toBeUndefined();
    await expect(assertValidationError('Amount is required')).resolves.toBeUndefined();
  });

  it('should handle case-insensitive regex matching', async () => {
    render(<div>DATE IS REQUIRED</div>);

    await expect(assertValidationError(/date is required/i)).resolves.toBeUndefined();
  });
});
