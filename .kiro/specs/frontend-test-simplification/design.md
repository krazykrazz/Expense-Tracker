# Design Document: Frontend Test Simplification

## Overview

This design simplifies frontend testing in the expense tracker application by establishing clear testing guidelines, creating reusable test utilities, and converting over-engineered property-based tests (PBT) to simpler parameterized unit tests where appropriate. The goal is to maintain test value and coverage while reducing complexity, verbosity, and execution time.

The approach focuses on three key strategies:
1. **Testing Strategy Guidelines** - Clear rules for when to use PBT vs unit tests vs parameterized tests
2. **Test Utility Library** - Reusable helpers to reduce boilerplate by 30-40%
3. **Selective Test Conversion** - Convert low-value PBT tests to parameterized tests while retaining high-value PBT tests

## Architecture

### Testing Strategy Decision Tree

```
Is this testing a universal property across infinite inputs?
├─ YES: Does it involve complex state machines or interactions?
│  ├─ YES: Use PBT (e.g., modal state transitions, context interactions)
│  └─ NO: Can it be validated with 5-10 key examples?
│     ├─ YES: Use parameterized unit tests
│     └─ NO: Use PBT with simplified helpers
└─ NO: Is this testing specific examples or edge cases?
   ├─ YES: Use unit tests
   └─ NO: Is this testing UI rendering or styling?
      └─ YES: Use unit tests (PBT not appropriate for visual validation)
```

### Test Utility Architecture

```
frontend/src/test-utils/
├── arbitraries.js          # Reusable fast-check generators
├── wrappers.js             # Context provider wrapper builders
├── assertions.js           # Async assertion helpers
├── mocks.js                # Mock factory functions
└── index.js                # Unified exports
```

### Test Organization Pattern

```
Component.test.jsx          # Unit tests (specific examples, edge cases)
Component.pbt.test.jsx      # PBT tests (universal properties only)
Component.integration.test.jsx  # Integration tests (multi-component flows)
```

## Components and Interfaces

### 1. Testing Guidelines Document

**Location**: `docs/testing/FRONTEND_TESTING_GUIDELINES.md`

**Content Structure**:
- When to use PBT (state machines, complex interactions, universal properties)
- When to use unit tests (specific examples, edge cases, UI rendering)
- When to use parameterized tests (key examples without full randomization)
- Examples of good and bad test choices
- Migration examples showing before/after simplification

### 2. Test Utility Library

#### 2.1 Arbitraries Module (`frontend/src/test-utils/arbitraries.js`)

**Purpose**: Provide reusable fast-check generators for common domain objects

**Interface**:
```javascript
// Date generators
export const safeDate = (options = {}) => fc.Arbitrary<string>
export const safeDateObject = (options = {}) => fc.Arbitrary<Date>
export const dateRange = (options = {}) => fc.Arbitrary<{start: string, end: string}>

// Amount generators
export const safeAmount = (options = {}) => fc.Arbitrary<number>
export const positiveAmount = () => fc.Arbitrary<number>
export const amountWithCents = () => fc.Arbitrary<number>

// String generators
export const safeString = (options = {}) => fc.Arbitrary<string>
export const nonEmptyString = (options = {}) => fc.Arbitrary<string>
export const placeName = () => fc.Arbitrary<string>

// Domain-specific generators
export const expenseCategory = () => fc.Arbitrary<string>
export const taxDeductibleCategory = () => fc.Arbitrary<string>
export const paymentMethod = () => fc.Arbitrary<string>
export const insuranceStatus = () => fc.Arbitrary<string>

// Composite generators
export const expenseRecord = (options = {}) => fc.Arbitrary<Expense>
export const personRecord = () => fc.Arbitrary<Person>
export const budgetRecord = () => fc.Arbitrary<Budget>

// Modal operation sequences
export const modalOperationSequence = () => fc.Arbitrary<Array<'open'|'close'>>
export const stateTransitionSequence = (states) => fc.Arbitrary<Array<State>>
```

#### 2.2 Wrappers Module (`frontend/src/test-utils/wrappers.js`)

**Purpose**: Provide reusable context provider wrappers

**Interface**:
```javascript
// Basic wrappers
export const createModalWrapper = (props = {}) => WrapperComponent
export const createFilterWrapper = (props = {}) => WrapperComponent
export const createExpenseWrapper = (props = {}) => WrapperComponent
export const createSharedDataWrapper = (props = {}) => WrapperComponent

// Composite wrappers
export const createFullContextWrapper = (props = {}) => WrapperComponent
export const createMinimalWrapper = (contexts = []) => WrapperComponent

// Wrapper builder
export const wrapperBuilder = () => {
  return {
    withModal: (props) => this,
    withFilter: (props) => this,
    withExpense: (props) => this,
    withSharedData: (props) => this,
    build: () => WrapperComponent
  }
}
```

**Example Usage**:
```javascript
const wrapper = wrapperBuilder()
  .withModal()
  .withFilter({ selectedYear: 2024 })
  .withExpense()
  .build();

const { result } = renderHook(() => useModalContext(), { wrapper });
```

#### 2.3 Assertions Module (`frontend/src/test-utils/assertions.js`)

**Purpose**: Provide async assertion helpers for common patterns

**Interface**:
```javascript
// Async state assertions
export const waitForState = async (getter, expectedValue, options = {}) => Promise<void>
export const waitForStateChange = async (getter, options = {}) => Promise<any>
export const waitForApiCall = async (mockFn, options = {}) => Promise<void>

// Modal assertions
export const assertModalOpen = (result, modalName) => void
export const assertModalClosed = (result, modalName) => void
export const assertAllModalsClosed = (result) => void

// Sequence assertions
export const assertSequenceResult = (operations, finalState) => void
export const assertIdempotence = (operation, getter) => Promise<void>
```

**Example Usage**:
```javascript
await waitForState(() => result.current.showExpenseForm, true);
assertModalOpen(result.current, 'expenseForm');
```

#### 2.4 Mocks Module (`frontend/src/test-utils/mocks.js`)

**Purpose**: Provide mock factory functions for API responses

**Interface**:
```javascript
// API mock factories
export const createExpenseApiMock = (overrides = {}) => MockedApi
export const createPaymentMethodApiMock = (overrides = {}) => MockedApi
export const createPeopleApiMock = (overrides = {}) => MockedApi
export const createBudgetApiMock = (overrides = {}) => MockedApi

// Response builders
export const mockExpenseResponse = (data = []) => ApiResponse
export const mockErrorResponse = (status, message) => ApiResponse
export const mockSuccessResponse = (data) => ApiResponse

// Call tracking helpers
export const createCallTracker = () => {
  return {
    track: (fn) => TrackedFunction,
    getCallCount: () => number,
    getLastCall: () => any,
    reset: () => void
  }
}
```

### 3. Parameterized Test Helper

**Location**: `frontend/src/test-utils/parameterized.js`

**Purpose**: Simplify parameterized test creation

**Interface**:
```javascript
export const testEach = (testCases) => {
  return {
    test: (name, fn) => void,
    it: (name, fn) => void
  }
}
```

**Example Usage**:
```javascript
testEach([
  { input: '', expected: false, description: 'empty string' },
  { input: '   ', expected: false, description: 'whitespace only' },
  { input: 'valid', expected: true, description: 'valid input' }
]).test('validates input', ({ input, expected, description }) => {
  expect(validate(input)).toBe(expected);
});
```

## Data Models

### Test Utility Configuration

```typescript
interface ArbitraryOptions {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  allowEmpty?: boolean;
}

interface WrapperProps {
  selectedYear?: number;
  selectedMonth?: number;
  initialState?: any;
  mockApis?: boolean;
}

interface AssertionOptions {
  timeout?: number;
  interval?: number;
  errorMessage?: string;
}

interface TestCase<T> {
  input: T;
  expected: any;
  description: string;
  skip?: boolean;
  only?: boolean;
}
```

### PBT Configuration

```typescript
interface PBTOptions {
  numRuns: number;        // Default: 100 for frontend
  timeout: number;        // Default: 30000ms
  seed?: number;          // For reproducibility
  verbose?: boolean;      // Detailed output
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Test utility modules export expected functions

*For any* test utility module (arbitraries, wrappers, assertions, mocks), importing the module should provide all documented exports without errors, and each export should be a function or builder object.

**Validates: Requirements 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 5.1**

### Property 2: Arbitrary generators produce valid domain values

*For any* value generated by domain-specific arbitraries (safeDate, safeAmount, expenseCategory, paymentMethod), the generated value should satisfy the domain constraints (dates are valid, amounts are positive numbers, categories are from the valid set).

**Validates: Requirements 3.1**

### Property 3: Wrapper builders provide all requested contexts

*For any* combination of contexts added to the wrapper builder (modal, filter, expense, sharedData), the built wrapper should render without errors and provide all requested context values to child components.

**Validates: Requirements 3.2**

### Property 4: Mock factories produce valid API responses

*For any* mock factory function (createExpenseApiMock, createPaymentMethodApiMock), the generated mock should have the expected API methods and return responses with the correct structure.

**Validates: Requirements 3.4**

### Property 5: Async assertions wait for conditions correctly

*For any* async assertion helper (waitForState, waitForApiCall), when the expected condition becomes true before the timeout, the helper should resolve successfully, and when the condition never becomes true, it should reject with a timeout error containing the expected and actual values.

**Validates: Requirements 3.3, 5.5**

### Property 6: Modal sequence helpers validate state transitions

*For any* sequence of modal open/close operations, the modal assertion helpers should correctly determine the final expected state (true if last operation was open, false if last operation was close) and validate it matches the actual state.

**Validates: Requirements 5.2**

### Property 7: Call tracking utilities count invocations accurately

*For any* tracked function created by the call tracker, the call count should equal the number of times the function was invoked, and getLastCall should return the arguments from the most recent invocation.

**Validates: Requirements 5.3**

### Property 8: Failed assertions include diagnostic information

*For any* test utility assertion that fails (async assertions, modal assertions, sequence assertions), the error message should include both the expected value and the actual value to aid debugging.

**Validates: Requirements 2.5**

## Error Handling

### Test Utility Errors

**Wrapper Builder Errors**:
- Throw clear error if attempting to build wrapper without any contexts
- Throw error if duplicate context is added
- Provide helpful message if required props are missing

**Arbitrary Errors**:
- Filter out invalid generated values (NaN, Infinity, invalid dates)
- Provide fallback values for edge cases
- Log warnings for filtered values in verbose mode

**Assertion Errors**:
- Include actual vs expected values in error messages
- Show timeout duration and polling interval
- Provide stack trace to failing assertion

### Test Conversion Errors

**Coverage Validation**:
- Fail conversion if coverage drops more than 1%
- Report which lines/branches lost coverage
- Suggest additional test cases to restore coverage

**Edge Case Detection**:
- Warn if converted test doesn't cover obvious edge cases
- Suggest additional parameterized test cases
- Validate against original PBT shrunk counterexamples

## Testing Strategy

### Dual Testing Approach

The application uses both unit tests and property-based tests as complementary strategies:

**Unit Tests**:
- Specific examples demonstrating correct behavior
- Edge cases (empty strings, null values, boundary conditions)
- Integration points between components
- UI rendering and styling validation
- Error conditions with specific inputs

**Property-Based Tests**:
- Universal properties across all inputs
- State machine transitions
- Complex interaction sequences
- Idempotence and commutativity properties
- Round-trip properties (serialize/deserialize)

**Parameterized Tests**:
- Key examples without full randomization
- Known edge cases as explicit test cases
- Regression tests for previously found bugs
- Faster execution than full PBT

### Test Selection Guidelines

**Use PBT when**:
- Testing state machines (modal contexts, form state)
- Testing complex interaction sequences
- Testing mathematical properties (idempotence, associativity)
- Testing data transformations (round-trip properties)
- Input space is large and edge cases are non-obvious

**Use Unit Tests when**:
- Testing specific examples
- Testing UI rendering and styling
- Testing error messages and user feedback
- Testing integration between components
- Testing specific edge cases

**Use Parameterized Tests when**:
- PBT would generate fewer than 10 meaningful variations
- Edge cases are known and finite
- Execution speed is critical
- Debugging specific failures is important

### Property-Based Test Configuration

**Frontend PBT Configuration**:
- Minimum 100 iterations per property test
- Timeout: 30 seconds per test
- Use fast-check library
- Tag format: `Feature: frontend-test-simplification, Property {number}: {property_text}`

**Test Organization**:
- Keep PBT tests in separate `.pbt.test.jsx` files
- Use descriptive property names in test descriptions
- Reference design document property numbers in comments
- Include property statement in test description

### Test Conversion Strategy

**High-Value PBT Tests (Keep)**:
- SharedDataContext modal state transitions
- ModalContext idempotence properties
- ExpenseContext state management
- FilterContext interaction sequences
- Form validation with complex rules

**Low-Value PBT Tests (Convert to Parameterized)**:
- CollapsibleSection toggle interactions (3 key scenarios: click, Enter, Space)
- HelpTooltip rendering (5 prop combinations)
- Simple component rendering with prop variations
- Basic validation functions with known edge cases

**Conversion Process**:
1. Identify all edge cases from PBT shrunk failures
2. Create parameterized test cases covering those edge cases
3. Add 2-3 additional "happy path" examples
4. Run both tests to verify coverage is maintained
5. Remove PBT test after validation
6. Document conversion in migration guide

### Test Utility Usage Patterns

**Before (Verbose PBT)**:
```javascript
describe('Modal State', () => {
  afterEach(() => cleanup());
  
  const operationArb = fc.constantFrom('open', 'close');
  const sequenceArb = fc.array(operationArb, { minLength: 1, maxLength: 20 });
  
  it('final state matches last operation', () => {
    fc.assert(
      fc.property(sequenceArb, (operations) => {
        const wrapper = ({ children }) => (
          <ModalProvider>{children}</ModalProvider>
        );
        const { result } = renderHook(() => useModalContext(), { wrapper });
        
        for (const op of operations) {
          act(() => {
            if (op === 'open') result.current.openExpenseForm();
            else result.current.closeExpenseForm();
          });
        }
        
        const lastOp = operations[operations.length - 1];
        expect(result.current.showExpenseForm).toBe(lastOp === 'open');
        cleanup();
      }),
      { numRuns: 100 }
    );
  });
});
```

**After (With Utilities)**:
```javascript
import { modalOperationSequence } from '@/test-utils/arbitraries';
import { createModalWrapper } from '@/test-utils/wrappers';
import { assertSequenceResult } from '@/test-utils/assertions';

describe('Modal State', () => {
  const wrapper = createModalWrapper();
  
  it('final state matches last operation', () => {
    fc.assert(
      fc.property(modalOperationSequence(), (operations) => {
        const { result } = renderHook(() => useModalContext(), { wrapper });
        
        operations.forEach(op => {
          act(() => op === 'open' 
            ? result.current.openExpenseForm() 
            : result.current.closeExpenseForm()
          );
        });
        
        assertSequenceResult(operations, result.current.showExpenseForm);
      }),
      { numRuns: 100 }
    );
  });
});
```

**Parameterized Alternative**:
```javascript
import { testEach } from '@/test-utils/parameterized';
import { createModalWrapper } from '@/test-utils/wrappers';

describe('Modal State', () => {
  const wrapper = createModalWrapper();
  
  testEach([
    { ops: ['open'], expected: true, desc: 'single open' },
    { ops: ['close'], expected: false, desc: 'single close' },
    { ops: ['open', 'close'], expected: false, desc: 'open then close' },
    { ops: ['close', 'open'], expected: true, desc: 'close then open' },
    { ops: ['open', 'open'], expected: true, desc: 'double open (idempotent)' },
    { ops: ['close', 'close'], expected: false, desc: 'double close (idempotent)' },
    { ops: ['open', 'close', 'open'], expected: true, desc: 'alternating sequence' }
  ]).test('applies operation sequence correctly', ({ ops, expected }) => {
    const { result } = renderHook(() => useModalContext(), { wrapper });
    
    ops.forEach(op => {
      act(() => op === 'open' 
        ? result.current.openExpenseForm() 
        : result.current.closeExpenseForm()
      );
    });
    
    expect(result.current.showExpenseForm).toBe(expected);
  });
});
```

### Expected Improvements

**Boilerplate Reduction**:
- Context setup: 40% reduction (wrapper builders)
- Arbitrary creation: 50% reduction (reusable generators)
- Async assertions: 30% reduction (helper functions)
- Overall: 30-40% less boilerplate code

**Execution Time**:
- Parameterized tests: 70-80% faster than equivalent PBT
- Overall test suite: 20-30% faster
- Individual test files: Under 5 seconds for unit tests

**Maintainability**:
- Clearer test intent with parameterized tests
- Easier debugging with explicit test cases
- Consistent patterns across test files
- Better error messages from utilities

### Migration Priority

**Phase 1: Create Utilities** (Week 1)
- Implement arbitraries module
- Implement wrappers module
- Implement assertions module
- Implement mocks module
- Write documentation and examples

**Phase 2: Convert Low-Value PBT** (Week 2)
- CollapsibleSection tests
- HelpTooltip tests
- Simple component tests
- Basic validation tests

**Phase 3: Simplify High-Value PBT** (Week 3)
- Refactor context tests to use utilities
- Reduce boilerplate in remaining PBT tests
- Validate coverage is maintained

**Phase 4: Documentation** (Week 4)
- Write testing guidelines
- Create migration examples
- Document patterns and best practices
- Update existing test documentation
