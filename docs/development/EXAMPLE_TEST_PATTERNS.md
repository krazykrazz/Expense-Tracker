# Example Test Patterns

This document provides complete, working examples of the testing patterns established in the `frontend-test-refactoring` spec.

## Table of Contents

1. [Mocking CollapsibleSection](#1-mocking-collapsiblesection)
2. [Converting PBT to Parameterized Tests](#2-converting-pbt-to-parameterized-tests)
3. [Using userEvent vs fireEvent](#3-using-userevent-vs-fireevent)
4. [Using Accessible Queries](#4-using-accessible-queries)
5. [Testing Form Submission](#5-testing-form-submission)
6. [Testing Conditional Field Display](#6-testing-conditional-field-display)

---

## 1. Mocking CollapsibleSection

### Problem
CollapsibleSection expansion doesn't work reliably in jsdom, causing tests to fail or be flaky.

### Solution
Mock the component to always render children, bypassing the expansion logic.

### Before (Brittle)

```javascript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpenseForm from './ExpenseForm';

it('should show insurance fields when Tax - Medical is selected', async () => {
  render(<ExpenseForm onExpenseAdded={vi.fn()} />);
  
  // Select Tax - Medical category
  const categorySelect = screen.getByLabelText('Category');
  await userEvent.selectOptions(categorySelect, 'Tax - Medical');
  
  // Try to expand Insurance section (FAILS IN JSDOM)
  const insuranceHeader = screen.getByText('Insurance Tracking');
  await userEvent.click(insuranceHeader);
  
  // Field may not be visible due to jsdom limitations
  await waitFor(() => {
    const insuranceField = screen.getByLabelText('Insurance Status');
    expect(insuranceField).toBeVisible();
  });
});
```

### After (Reliable)

```javascript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpenseForm from './ExpenseForm';
import { MockCollapsibleSection } from '../test-utils';

// Mock CollapsibleSection at top of file
vi.mock('./CollapsibleSection', () => ({
  default: MockCollapsibleSection
}));

it('should show insurance fields when Tax - Medical is selected', async () => {
  render(<ExpenseForm onExpenseAdded={vi.fn()} />);
  
  // Select Tax - Medical category
  const categorySelect = screen.getByLabelText('Category');
  await userEvent.selectOptions(categorySelect, 'Tax - Medical');
  
  // Field is always rendered in tests (no expansion needed)
  const insuranceField = screen.getByLabelText('Insurance Status');
  expect(insuranceField).toBeInTheDocument();
});
```

**Key Changes:**
- Added `vi.mock()` at top of file
- Removed section expansion logic
- Field is always in DOM (mocked component renders children)
- Test is faster and more reliable

---

## 2. Converting PBT to Parameterized Tests

### Problem
Using PBT for finite input sets (< 10 cases) is overkill and makes tests harder to understand.

### Solution
Use `testEach` for parameterized tests with clear descriptions.

### Before (PBT with Finite Inputs)

```javascript
import * as fc from 'fast-check';

it('Property: validates all payment methods', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('cash', 'debit', 'credit_card', 'cheque'),
      (method) => {
        const { getByLabelText, getByRole } = render(<ExpenseForm />);
        
        const methodSelect = getByLabelText('Payment Method');
        fireEvent.change(methodSelect, { target: { value: method } });
        
        expect(methodSelect.value).toBe(method);
        
        cleanup();
      }
    ),
    { numRuns: 100 }
  );
});
```

### After (Parameterized Test)

```javascript
import { testEach } from '../test-utils';

testEach([
  { method: 'cash', description: 'Cash' },
  { method: 'debit', description: 'Debit' },
  { method: 'credit_card', description: 'Credit Card' },
  { method: 'cheque', description: 'Cheque' }
]).test('validates $description payment method', async ({ method }) => {
  render(<ExpenseForm onExpenseAdded={vi.fn()} />);
  
  const methodSelect = screen.getByLabelText('Payment Method');
  await userEvent.selectOptions(methodSelect, method);
  
  expect(methodSelect.value).toBe(method);
});
```

**Key Changes:**
- Replaced `fc.assert` with `testEach`
- Explicit list of test cases (4 tests instead of 100 random runs)
- Descriptive test names (`validates Cash payment method`, etc.)
- Faster execution (4 tests vs 100 iterations)
- Easier to debug (can run individual test cases)

---

## 3. Using userEvent vs fireEvent

### Problem
`fireEvent` doesn't simulate real user interactions (no focus, blur, keyboard events).

### Solution
Use `userEvent` for realistic interactions, except in PBT with 100+ iterations.

### Before (fireEvent)

```javascript
import { render, fireEvent } from '@testing-library/react';

it('should submit form with valid data', async () => {
  const onSubmit = vi.fn();
  const { container } = render(<ExpenseForm onExpenseAdded={onSubmit} />);
  
  const dateInput = container.querySelector('#date');
  const amountInput = container.querySelector('#amount');
  const submitButton = container.querySelector('button[type="submit"]');
  
  fireEvent.change(dateInput, { target: { value: '2025-01-15' } });
  fireEvent.change(amountInput, { target: { value: '50.00' } });
  fireEvent.click(submitButton);
  
  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalled();
  });
});
```

### After (userEvent)

```javascript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

it('should submit form with valid data', async () => {
  const onSubmit = vi.fn();
  render(<ExpenseForm onExpenseAdded={onSubmit} />);
  
  const dateInput = screen.getByLabelText('Date');
  const amountInput = screen.getByLabelText('Amount');
  const submitButton = screen.getByRole('button', { name: /add expense/i });
  
  await userEvent.clear(dateInput);
  await userEvent.type(dateInput, '2025-01-15');
  await userEvent.clear(amountInput);
  await userEvent.type(amountInput, '50.00');
  await userEvent.click(submitButton);
  
  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalled();
  });
});
```

**Key Changes:**
- Replaced `fireEvent` with `userEvent`
- Added `await` for async user interactions
- More realistic simulation (triggers focus, blur, input events)
- Better matches actual user behavior

### Exception: PBT with Many Iterations

```javascript
// Keep fireEvent for PBT with 100+ iterations (performance)
it('Property: form accepts valid inputs', () => {
  fc.assert(
    fc.asyncProperty(
      validDateArb,
      validAmountArb,
      async (date, amount) => {
        const { container } = render(<ExpenseForm />);
        
        const dateInput = container.querySelector('#date');
        const amountInput = container.querySelector('#amount');
        
        // Use fireEvent for speed (100 iterations)
        fireEvent.change(dateInput, { target: { value: date } });
        fireEvent.change(amountInput, { target: { value: amount } });
        
        expect(dateInput.value).toBe(date);
        expect(amountInput.value).toBe(amount);
      }
    ),
    { numRuns: 100 }
  );
});
```

---

## 4. Using Accessible Queries

### Problem
Implementation detail queries break when refactoring internal structure.

### Solution
Use accessible queries that match how users interact with the UI.

### Before (Implementation Details)

```javascript
it('should display validation error', async () => {
  const { container } = render(<ExpenseForm />);
  
  // Brittle selectors
  const submitButton = container.querySelector('.submit-button');
  const amountInput = container.querySelector('#amount');
  const errorMessage = container.querySelector('.error-message');
  
  fireEvent.click(submitButton);
  
  expect(errorMessage).toBeInTheDocument();
  expect(errorMessage.textContent).toContain('Amount is required');
});
```

### After (Accessible Queries)

```javascript
it('should display validation error', async () => {
  render(<ExpenseForm onExpenseAdded={vi.fn()} />);
  
  // Accessible selectors
  const submitButton = screen.getByRole('button', { name: /add expense/i });
  const amountInput = screen.getByLabelText('Amount');
  
  await userEvent.click(submitButton);
  
  // Query by text (what user sees)
  expect(screen.getByText(/amount is required/i)).toBeInTheDocument();
});
```

**Query Priority (from most to least preferred):**
1. `getByRole` - Matches accessibility tree
2. `getByLabelText` - Matches form labels
3. `getByPlaceholderText` - Matches placeholder text
4. `getByText` - Matches visible text
5. `getByDisplayValue` - Matches input values
6. `getByAltText` - Matches image alt text
7. `getByTitle` - Matches title attribute
8. `getByTestId` - Last resort (implementation detail)

---

## 5. Testing Form Submission

### Complete Example

```javascript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpenseForm from './ExpenseForm';

describe('ExpenseForm - Submission', () => {
  it('should submit form with all required fields', async () => {
    const mockOnExpenseAdded = vi.fn();
    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 1 })
      })
    );
    global.fetch = mockFetch;
    
    render(<ExpenseForm onExpenseAdded={mockOnExpenseAdded} />);
    
    // Fill in required fields
    await userEvent.type(screen.getByLabelText('Date'), '2025-01-15');
    await userEvent.type(screen.getByLabelText('Place'), 'Test Store');
    await userEvent.type(screen.getByLabelText('Amount'), '50.00');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Groceries');
    await userEvent.selectOptions(screen.getByLabelText('Payment Method'), '1');
    
    // Submit form
    await userEvent.click(screen.getByRole('button', { name: /add expense/i }));
    
    // Verify API was called with correct data
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/expenses'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"place":"Test Store"')
        })
      );
    });
    
    // Verify callback was called
    expect(mockOnExpenseAdded).toHaveBeenCalled();
  });
  
  it('should show validation errors for missing required fields', async () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    // Submit without filling fields
    await userEvent.click(screen.getByRole('button', { name: /add expense/i }));
    
    // Verify validation errors appear
    expect(screen.getByText(/date is required/i)).toBeInTheDocument();
    expect(screen.getByText(/amount is required/i)).toBeInTheDocument();
  });
});
```

---

## 6. Testing Conditional Field Display

### Complete Example

```javascript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpenseForm from './ExpenseForm';
import { MockCollapsibleSection } from '../test-utils';

// Mock CollapsibleSection
vi.mock('./CollapsibleSection', () => ({
  default: MockCollapsibleSection
}));

describe('ExpenseForm - Conditional Fields', () => {
  it('should show insurance fields when Tax - Medical is selected', async () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    // Initially, insurance fields should not be present
    expect(screen.queryByLabelText('Insurance Status')).not.toBeInTheDocument();
    
    // Select Tax - Medical category
    const categorySelect = screen.getByLabelText('Category');
    await userEvent.selectOptions(categorySelect, 'Tax - Medical');
    
    // Insurance fields should now be visible
    expect(screen.getByLabelText('Insurance Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Claim Status')).toBeInTheDocument();
  });
  
  it('should hide insurance fields when switching from Tax - Medical', async () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    // Select Tax - Medical
    const categorySelect = screen.getByLabelText('Category');
    await userEvent.selectOptions(categorySelect, 'Tax - Medical');
    
    // Verify insurance fields are visible
    expect(screen.getByLabelText('Insurance Status')).toBeInTheDocument();
    
    // Switch to different category
    await userEvent.selectOptions(categorySelect, 'Groceries');
    
    // Insurance fields should be hidden
    expect(screen.queryByLabelText('Insurance Status')).not.toBeInTheDocument();
  });
  
  it('should show posted date field when credit card is selected', async () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    // Initially, posted date should not be present
    expect(screen.queryByLabelText('Posted Date')).not.toBeInTheDocument();
    
    // Select credit card payment method
    const methodSelect = screen.getByLabelText('Payment Method');
    await userEvent.selectOptions(methodSelect, '3'); // Assuming 3 is credit card
    
    // Posted date field should now be visible
    expect(screen.getByLabelText('Posted Date')).toBeInTheDocument();
  });
});
```

---

## Summary

These patterns provide:
- **Reliability:** Tests work consistently in jsdom
- **Maintainability:** Tests don't break when refactoring
- **Clarity:** Tests are easy to understand and debug
- **Performance:** Tests run quickly (except PBT with many iterations)

For more examples, see:
- `frontend/src/components/ExpenseForm.sections.test.jsx` (mocked CollapsibleSection)
- `frontend/src/components/ExpenseForm.pbt.test.jsx` (parameterized tests)
- `frontend/src/test-utils/` (test utilities and helpers)
