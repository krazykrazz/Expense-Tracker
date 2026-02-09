/**
 * @file expenseFormHelpers.test.js
 * @description Unit tests for ExpenseForm test helper utilities
 * 
 * Tests the shared helper functions used across split ExpenseForm test files
 * to ensure they work correctly before being used in actual component tests.
 * 
 * **Validates: Requirements 1.4**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Mock all API modules BEFORE importing expenseFormHelpers
vi.mock('../services/peopleApi');
vi.mock('../services/expenseApi');
vi.mock('../services/categorySuggestionApi');
vi.mock('../services/categoriesApi');
vi.mock('../services/paymentMethodApi');

import {
  mockCategories,
  mockPaymentMethods,
  mockPeople,
  setupExpenseFormMocks,
  expandSection,
  fillBasicFields,
  fillBasicFieldsWithValues,
  selectSinglePerson,
  selectMultiplePeople,
  waitForAllocationModal,
  submitForm
} from './expenseFormHelpers';
import * as peopleApi from '../services/peopleApi';
import * as expenseApi from '../services/expenseApi';
import * as categorySuggestionApi from '../services/categorySuggestionApi';
import * as categoriesApi from '../services/categoriesApi';
import * as paymentMethodApi from '../services/paymentMethodApi';

describe('expenseFormHelpers - Mock Data', () => {
  it('should export mockCategories with expected structure', () => {
    expect(mockCategories).toBeInstanceOf(Array);
    expect(mockCategories.length).toBeGreaterThan(0);
    expect(mockCategories).toContain('Other');
    expect(mockCategories).toContain('Tax - Medical');
    expect(mockCategories).toContain('Tax - Donation');
  });

  it('should export mockPaymentMethods with expected structure', () => {
    expect(mockPaymentMethods).toBeInstanceOf(Array);
    expect(mockPaymentMethods.length).toBe(3);
    
    mockPaymentMethods.forEach(method => {
      expect(method).toHaveProperty('id');
      expect(method).toHaveProperty('display_name');
      expect(method).toHaveProperty('type');
      expect(method).toHaveProperty('is_active');
      expect(method.is_active).toBe(1);
    });
  });

  it('should export mockPeople with expected structure', () => {
    expect(mockPeople).toBeInstanceOf(Array);
    expect(mockPeople.length).toBe(3);
    
    mockPeople.forEach(person => {
      expect(person).toHaveProperty('id');
      expect(person).toHaveProperty('name');
      expect(person).toHaveProperty('dateOfBirth');
      expect(person.dateOfBirth).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

describe('expenseFormHelpers - setupExpenseFormMocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('should mock peopleApi.getPeople', async () => {
    setupExpenseFormMocks();
    
    const result = await peopleApi.getPeople();
    expect(result).toEqual(mockPeople);
    expect(peopleApi.getPeople).toHaveBeenCalled();
  });

  it('should mock expenseApi.createExpense', async () => {
    setupExpenseFormMocks();
    
    const result = await expenseApi.createExpense({});
    expect(result).toEqual({ id: 1, type: 'Tax - Medical' });
    expect(expenseApi.createExpense).toHaveBeenCalled();
  });

  it('should mock expenseApi.getPlaces', async () => {
    setupExpenseFormMocks();
    
    const result = await expenseApi.getPlaces();
    expect(result).toEqual([]);
    expect(expenseApi.getPlaces).toHaveBeenCalled();
  });

  it('should mock categoriesApi.getCategories', async () => {
    setupExpenseFormMocks();
    
    const result = await categoriesApi.getCategories();
    expect(result).toEqual(mockCategories);
    expect(categoriesApi.getCategories).toHaveBeenCalled();
  });

  it('should mock categorySuggestionApi.fetchCategorySuggestion', async () => {
    setupExpenseFormMocks();
    
    const result = await categorySuggestionApi.fetchCategorySuggestion('test');
    expect(result).toEqual({ category: null });
    expect(categorySuggestionApi.fetchCategorySuggestion).toHaveBeenCalled();
  });

  it('should mock paymentMethodApi.getActivePaymentMethods', async () => {
    setupExpenseFormMocks();
    
    const result = await paymentMethodApi.getActivePaymentMethods();
    expect(result).toEqual(mockPaymentMethods);
    expect(paymentMethodApi.getActivePaymentMethods).toHaveBeenCalled();
  });

  it('should mock paymentMethodApi.getPaymentMethod', async () => {
    setupExpenseFormMocks();
    
    const result = await paymentMethodApi.getPaymentMethod(1);
    expect(result).toEqual(mockPaymentMethods[0]);
    expect(paymentMethodApi.getPaymentMethod).toHaveBeenCalled();
  });

  it('should mock global fetch for /api/categories', async () => {
    setupExpenseFormMocks();
    
    const response = await global.fetch('/api/categories');
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.categories).toEqual(mockCategories);
    expect(data).toHaveProperty('budgetableCategories');
    expect(data).toHaveProperty('taxDeductibleCategories');
  });

  it('should mock global fetch for /places', async () => {
    setupExpenseFormMocks();
    
    const response = await global.fetch('/places');
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it('should mock global fetch for /api/people', async () => {
    setupExpenseFormMocks();
    
    const response = await global.fetch('/api/people');
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data).toEqual(mockPeople);
  });

  it('should reject unknown URLs', async () => {
    setupExpenseFormMocks();
    
    await expect(global.fetch('/unknown')).rejects.toThrow('Unknown URL');
  });
});

describe('expenseFormHelpers - expandSection', () => {
  // Create a minimal test component with collapsible sections that actually toggle
  const TestComponent = () => {
    const [expanded, setExpanded] = React.useState({});
    
    const handleClick = (section) => {
      setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
    };
    
    return (
      <div>
        <div 
          className="collapsible-header" 
          aria-expanded={expanded['advanced'] ? 'true' : 'false'}
          onClick={() => handleClick('advanced')}
        >
          Advanced Options
        </div>
        <div 
          className="collapsible-header" 
          aria-expanded={expanded['reimbursement'] ? 'true' : 'false'}
          onClick={() => handleClick('reimbursement')}
        >
          Reimbursement
        </div>
        <div 
          className="collapsible-header" 
          aria-expanded={expanded['insurance'] ? 'true' : 'false'}
          onClick={() => handleClick('insurance')}
        >
          Insurance
        </div>
      </div>
    );
  };

  it('should find and click section header by name', async () => {
    const { container } = render(<TestComponent />);
    
    const header = await expandSection(container, 'Advanced Options');
    
    expect(header).toBeTruthy();
    expect(header.textContent).toContain('Advanced Options');
  });

  it('should wait for aria-expanded to be true', async () => {
    const { container } = render(<TestComponent />);
    
    const header = await expandSection(container, 'Reimbursement');
    
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  it('should throw error for invalid section name', async () => {
    const { container } = render(<TestComponent />);
    
    await expect(
      expandSection(container, 'NonExistent Section')
    ).rejects.toThrow('Section "NonExistent Section" not found');
  });

  it('should handle partial section name matches', async () => {
    const { container } = render(<TestComponent />);
    
    // Should find "Insurance" even with partial match
    const header = await expandSection(container, 'Insurance');
    
    expect(header).toBeTruthy();
    expect(header.textContent).toContain('Insurance');
  });

  it('should return the header element', async () => {
    const { container } = render(<TestComponent />);
    
    const header = await expandSection(container, 'Advanced Options');
    
    expect(header).toBeInstanceOf(HTMLElement);
    expect(header.classList.contains('collapsible-header')).toBe(true);
  });
});

describe('expenseFormHelpers - fillBasicFields', () => {
  // Create a minimal test form
  const TestForm = () => (
    <form>
      <label htmlFor="date">Date *</label>
      <input id="date" type="date" />
      
      <label htmlFor="amount">Amount</label>
      <input id="amount" type="number" />
      
      <label htmlFor="type">Type</label>
      <select id="type">
        <option value="">Select...</option>
        <option value="Other">Other</option>
        <option value="Groceries">Groceries</option>
      </select>
      
      <label htmlFor="paymentMethod">Payment Method</label>
      <select id="paymentMethod">
        <option value="">Select...</option>
        <option value="1">Cash</option>
        <option value="2">Credit Card</option>
      </select>
    </form>
  );

  it('should fill date field with default value', async () => {
    render(<TestForm />);
    
    await fillBasicFields();
    
    const dateInput = screen.getByLabelText(/^Date \*/i);
    expect(dateInput.value).toBe('2025-01-15');
  });

  it('should fill amount field with default value', async () => {
    render(<TestForm />);
    
    await fillBasicFields();
    
    const amountInput = screen.getByLabelText(/Amount/i);
    expect(amountInput.value).toBe('100.00');
  });

  it('should fill type field with default value', async () => {
    render(<TestForm />);
    
    await fillBasicFields();
    
    const typeSelect = screen.getByLabelText(/Type/i);
    expect(typeSelect.value).toBe('Other');
  });

  it('should fill payment method field with default value', async () => {
    render(<TestForm />);
    
    await fillBasicFields();
    
    const paymentMethodSelect = screen.getByLabelText(/Payment Method/i);
    expect(paymentMethodSelect.value).toBe('1');
  });

  it('should wait for form to be ready before filling', async () => {
    const { rerender } = render(<div>Loading...</div>);
    
    // Start filling (will wait)
    const fillPromise = fillBasicFields();
    
    // Render the form after a delay
    setTimeout(() => {
      rerender(<TestForm />);
    }, 50);
    
    // Should complete without error
    await expect(fillPromise).resolves.toBeUndefined();
  });

  it('should fill all required fields in correct order', async () => {
    render(<TestForm />);
    
    await fillBasicFields();
    
    // Verify all fields are filled
    expect(screen.getByLabelText(/^Date \*/i).value).toBe('2025-01-15');
    expect(screen.getByLabelText(/Amount/i).value).toBe('100.00');
    expect(screen.getByLabelText(/Type/i).value).toBe('Other');
    expect(screen.getByLabelText(/Payment Method/i).value).toBe('1');
  });
});

describe('expenseFormHelpers - fillBasicFieldsWithValues', () => {
  const TestForm = () => (
    <form>
      <label htmlFor="date">Date *</label>
      <input id="date" type="date" />
      
      <label htmlFor="amount">Amount</label>
      <input id="amount" type="number" />
      
      <label htmlFor="type">Type</label>
      <select id="type">
        <option value="">Select...</option>
        <option value="Other">Other</option>
        <option value="Tax - Medical">Tax - Medical</option>
      </select>
      
      <label htmlFor="paymentMethod">Payment Method</label>
      <select id="paymentMethod">
        <option value="">Select...</option>
        <option value="1">Cash</option>
        <option value="2">Credit Card</option>
      </select>
    </form>
  );

  it('should fill fields with custom values', async () => {
    render(<TestForm />);
    
    await fillBasicFieldsWithValues({
      date: '2025-02-01',
      amount: '250.00',
      type: 'Tax - Medical',
      paymentMethod: '2'
    });
    
    expect(screen.getByLabelText(/^Date \*/i).value).toBe('2025-02-01');
    expect(screen.getByLabelText(/Amount/i).value).toBe('250.00');
    expect(screen.getByLabelText(/Type/i).value).toBe('Tax - Medical');
    expect(screen.getByLabelText(/Payment Method/i).value).toBe('2');
  });

  it('should handle different date formats', async () => {
    render(<TestForm />);
    
    await fillBasicFieldsWithValues({
      date: '2024-12-31',
      amount: '100.00',
      type: 'Other',
      paymentMethod: '1'
    });
    
    expect(screen.getByLabelText(/^Date \*/i).value).toBe('2024-12-31');
  });

  it('should handle decimal amounts', async () => {
    render(<TestForm />);
    
    await fillBasicFieldsWithValues({
      date: '2025-01-15',
      amount: '99.99',
      type: 'Other',
      paymentMethod: '1'
    });
    
    expect(screen.getByLabelText(/Amount/i).value).toBe('99.99');
  });
});

describe('expenseFormHelpers - selectSinglePerson', () => {
  const TestForm = () => (
    <form>
      <label htmlFor="people">Assign to People</label>
      <select id="people" multiple>
        <option value="" disabled>Select people...</option>
        <option value="1">John Doe</option>
        <option value="2">Jane Smith</option>
        <option value="3">Bob Johnson</option>
      </select>
    </form>
  );

  it('should select person by index', async () => {
    render(<TestForm />);
    
    await selectSinglePerson(0);
    
    const select = screen.getByLabelText(/assign to people/i);
    const options = select.querySelectorAll('option');
    expect(options[1].selected).toBe(true); // +1 for placeholder
  });

  it('should wait for people dropdown to be available', async () => {
    const { rerender } = render(<div>Loading...</div>);
    
    const selectPromise = selectSinglePerson(0);
    
    setTimeout(() => {
      rerender(<TestForm />);
    }, 50);
    
    await expect(selectPromise).resolves.toBeUndefined();
  });

  it('should handle different person indices', async () => {
    render(<TestForm />);
    
    await selectSinglePerson(2);
    
    const select = screen.getByLabelText(/assign to people/i);
    const options = select.querySelectorAll('option');
    expect(options[3].selected).toBe(true); // +1 for placeholder
  });
});

describe('expenseFormHelpers - selectMultiplePeople', () => {
  const TestForm = () => (
    <form>
      <label htmlFor="people">Assign to People</label>
      <select id="people" multiple>
        <option value="" disabled>Select people...</option>
        <option value="1">John Doe</option>
        <option value="2">Jane Smith</option>
        <option value="3">Bob Johnson</option>
      </select>
    </form>
  );

  it('should select multiple people by indices', async () => {
    render(<TestForm />);
    
    await selectMultiplePeople([0, 1]);
    
    const select = screen.getByLabelText(/assign to people/i);
    const options = select.querySelectorAll('option');
    expect(options[1].selected).toBe(true); // John Doe
    expect(options[2].selected).toBe(true); // Jane Smith
    expect(options[3].selected).toBe(false); // Bob Johnson
  });

  it('should handle empty array', async () => {
    render(<TestForm />);
    
    await selectMultiplePeople([]);
    
    const select = screen.getByLabelText(/assign to people/i);
    const options = select.querySelectorAll('option');
    expect(options[1].selected).toBe(false);
    expect(options[2].selected).toBe(false);
    expect(options[3].selected).toBe(false);
  });

  it('should handle all people selected', async () => {
    render(<TestForm />);
    
    await selectMultiplePeople([0, 1, 2]);
    
    const select = screen.getByLabelText(/assign to people/i);
    const options = select.querySelectorAll('option');
    expect(options[1].selected).toBe(true);
    expect(options[2].selected).toBe(true);
    expect(options[3].selected).toBe(true);
  });
});

describe('expenseFormHelpers - waitForAllocationModal', () => {
  it('should wait for allocation modal to appear', async () => {
    const { rerender } = render(<div>No modal</div>);
    
    const waitPromise = waitForAllocationModal();
    
    setTimeout(() => {
      rerender(
        <div>
          <h2>Allocate Expense Amount</h2>
          <button>Split Equally</button>
        </div>
      );
    }, 50);
    
    await expect(waitPromise).resolves.toBeUndefined();
  });

  it('should find modal by text content', async () => {
    render(
      <div>
        <h2>Allocate Expense Amount</h2>
        <button>Split Equally</button>
      </div>
    );
    
    await waitForAllocationModal();
    
    expect(screen.getByText(/allocate expense amount/i)).toBeInTheDocument();
  });
});

describe('expenseFormHelpers - submitForm', () => {
  const TestForm = ({ onSubmit }) => (
    <form onSubmit={onSubmit}>
      <button type="submit">Add Expense</button>
    </form>
  );

  it('should click the submit button', async () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(<TestForm onSubmit={onSubmit} />);
    
    await submitForm();
    
    expect(onSubmit).toHaveBeenCalled();
  });

  it('should find button by accessible name', async () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(<TestForm onSubmit={onSubmit} />);
    
    await submitForm();
    
    const button = screen.getByRole('button', { name: /add expense/i });
    expect(button).toBeInTheDocument();
  });

  it('should wait for button to be available', async () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    const { rerender } = render(<div>Loading...</div>);
    
    // Start the submit process
    const submitPromise = submitForm();
    
    // Render the form after a delay
    setTimeout(() => {
      rerender(<TestForm onSubmit={onSubmit} />);
    }, 50);
    
    // Should complete without error
    await submitPromise;
    
    // Verify the form was submitted
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
  });
});

