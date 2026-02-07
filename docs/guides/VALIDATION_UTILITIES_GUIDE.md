# Validation Utilities Guide

This guide explains how to use the new centralized validation utilities and middleware created during the code optimization phase.

---

## Table of Contents
1. [Validation Utilities](#validation-utilities)
2. [Validation Middleware](#validation-middleware)
3. [Error Handler Middleware](#error-handler-middleware)
4. [Migration Examples](#migration-examples)

---

## Validation Utilities

Location: `backend/utils/validators.js`

### validateNumber()

Validates numeric fields with optional constraints.

**Signature:**
```javascript
validateNumber(value, fieldName, options = {})
```

**Options:**
- `min` - Minimum value (inclusive)
- `max` - Maximum value (inclusive)
- `required` - Whether the field is required (default: true)
- `allowNull` - Whether null is allowed (default: false)

**Examples:**

```javascript
const { validateNumber } = require('../utils/validators');

// Basic validation
validateNumber(amount, 'Amount'); // Throws if not a number

// With constraints
validateNumber(age, 'Age', { min: 0, max: 120 });

// Optional field
validateNumber(discount, 'Discount', { required: false, min: 0, max: 100 });

// Allow null
validateNumber(optionalValue, 'Optional Value', { allowNull: true });
```

### validateString()

Validates string fields with optional constraints.

**Signature:**
```javascript
validateString(value, fieldName, options = {})
```

**Options:**
- `minLength` - Minimum string length
- `maxLength` - Maximum string length
- `required` - Whether the field is required (default: true)
- `pattern` - Regex pattern to match

**Examples:**

```javascript
const { validateString } = require('../utils/validators');

// Basic validation
validateString(name, 'Name');

// With length constraints
validateString(username, 'Username', { minLength: 3, maxLength: 20 });

// With pattern
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
validateString(email, 'Email', { pattern: emailPattern });

// Optional field
validateString(notes, 'Notes', { required: false, maxLength: 500 });
```

### validateYearMonth()

Validates year and month values together.

**Signature:**
```javascript
validateYearMonth(year, month)
```

**Examples:**

```javascript
const { validateYearMonth } = require('../utils/validators');

// Validate year and month
validateYearMonth(2025, 11); // Valid

// Will throw errors for invalid values
validateYearMonth(1800, 5);  // Year too old
validateYearMonth(2025, 13); // Month out of range
validateYearMonth(2025, 0);  // Month out of range
```

---

## Validation Middleware

Location: `backend/middleware/validateYearMonth.js`

### validateYearMonth Middleware

Middleware to validate year and month from request query, params, or body.

**Signature:**
```javascript
validateYearMonth(source = 'query')
```

**Parameters:**
- `source` - Where to extract year/month from: `'query'`, `'params'`, or `'body'`

**Usage in Routes:**

```javascript
const { validateYearMonth } = require('../middleware/validateYearMonth');

// Validate from query parameters
router.get('/summary', 
  validateYearMonth('query'), 
  async (req, res) => {
    // Access validated values
    const { validatedYear, validatedMonth } = req;
    // ... your logic
  }
);

// Validate from route parameters
router.get('/data/:year/:month', 
  validateYearMonth('params'), 
  async (req, res) => {
    const { validatedYear, validatedMonth } = req;
    // ... your logic
  }
);

// Validate from request body
router.post('/create', 
  validateYearMonth('body'), 
  async (req, res) => {
    const { validatedYear, validatedMonth } = req;
    // ... your logic
  }
);
```

**Benefits:**
- Automatic validation before route handler
- Consistent error responses
- Validated values attached to request
- Reduces boilerplate in controllers

---

## Error Handler Middleware

Location: `backend/middleware/errorHandler.js`

### errorHandler

Centralized error handling middleware for consistent error responses.

**Usage:**

Add as the **last** middleware in your Express app:

```javascript
const { errorHandler } = require('./middleware/errorHandler');

// ... all your routes ...

// Error handler must be last
app.use(errorHandler);
```

**Features:**
- Logs errors with context (path, method)
- Determines appropriate status code
- Sends consistent error response format
- Shows stack trace in development mode only

### asyncHandler

Wrapper for async route handlers to automatically catch errors.

**Usage:**

```javascript
const { asyncHandler } = require('../middleware/errorHandler');

// Without asyncHandler (manual try-catch)
router.get('/data', async (req, res) => {
  try {
    const data = await someAsyncOperation();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// With asyncHandler (automatic error handling)
router.get('/data', asyncHandler(async (req, res) => {
  const data = await someAsyncOperation();
  res.json(data);
  // Errors automatically caught and passed to errorHandler
}));
```

---

## Migration Examples

### Before: Manual Validation

```javascript
// OLD CODE - Duplicate validation in every service
async getSummary(year, month) {
  // Validate year and month
  if (!year || !month) {
    throw new Error('Year and month are required for summary');
  }
  
  if (typeof year !== 'number' || year < 1900 || year > 2100) {
    throw new Error('Invalid year');
  }
  
  if (typeof month !== 'number' || month < 1 || month > 12) {
    throw new Error('Invalid month');
  }
  
  // ... rest of logic
}
```

### After: Using Validators

```javascript
// NEW CODE - Centralized validation
const { validateYearMonth } = require('../utils/validators');

async getSummary(year, month) {
  // Single line validation
  validateYearMonth(year, month);
  
  // ... rest of logic
}
```

### Before: Manual Number Validation

```javascript
// OLD CODE - Verbose validation
if (loan.initial_balance === undefined || loan.initial_balance === null) {
  throw new Error('Initial balance is required');
}

if (typeof loan.initial_balance !== 'number' || loan.initial_balance < 0) {
  throw new Error('Initial balance must be a non-negative number');
}
```

### After: Using Validators

```javascript
// NEW CODE - Concise validation
const { validateNumber } = require('../utils/validators');

validateNumber(loan.initial_balance, 'Initial balance', { min: 0 });
```

### Before: Manual Error Handling in Controllers

```javascript
// OLD CODE - Duplicate error handling
async createExpense(req, res) {
  try {
    const expense = await expenseService.createExpense(req.body);
    res.status(201).json(expense);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
```

### After: Using Error Handler

```javascript
// NEW CODE - Automatic error handling
const { asyncHandler } = require('../middleware/errorHandler');

const createExpense = asyncHandler(async (req, res) => {
  const expense = await expenseService.createExpense(req.body);
  res.status(201).json(expense);
  // Errors automatically handled by errorHandler middleware
});
```

---

## Best Practices

### 1. Use Validators in Services
Services should validate their inputs using the validation utilities:

```javascript
class MyService {
  async createItem(data) {
    // Validate at service level
    validateString(data.name, 'Name', { minLength: 1, maxLength: 100 });
    validateNumber(data.amount, 'Amount', { min: 0 });
    
    // ... business logic
  }
}
```

### 2. Use Middleware in Routes
Routes should use middleware for common validations:

```javascript
router.get('/summary', 
  validateYearMonth('query'),  // Middleware validation
  asyncHandler(async (req, res) => {
    // Use validated values
    const summary = await service.getSummary(
      req.validatedYear, 
      req.validatedMonth
    );
    res.json(summary);
  })
);
```

### 3. Let Error Handler Handle Errors
Don't catch errors just to re-throw them. Let the error handler middleware handle them:

```javascript
// ❌ DON'T DO THIS
router.get('/data', async (req, res) => {
  try {
    const data = await service.getData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ DO THIS
router.get('/data', asyncHandler(async (req, res) => {
  const data = await service.getData();
  res.json(data);
}));
```

### 4. Throw Descriptive Errors
Use descriptive error messages that will be helpful to API consumers:

```javascript
// ❌ BAD
if (!data.name) {
  throw new Error('Invalid');
}

// ✅ GOOD
validateString(data.name, 'Name', { minLength: 1 });
// Throws: "Name is required" or "Name must be at least 1 characters long"
```

---

## Testing

### Testing Validators

```javascript
const { validateNumber, validateString, validateYearMonth } = require('../utils/validators');

describe('Validators', () => {
  describe('validateNumber', () => {
    it('should accept valid numbers', () => {
      expect(() => validateNumber(42, 'Test')).not.toThrow();
    });
    
    it('should reject non-numbers', () => {
      expect(() => validateNumber('42', 'Test')).toThrow('Test must be a valid number');
    });
    
    it('should enforce min constraint', () => {
      expect(() => validateNumber(-5, 'Test', { min: 0 })).toThrow('Test must be at least 0');
    });
  });
});
```

### Testing Middleware

```javascript
const { validateYearMonth } = require('../middleware/validateYearMonth');

describe('validateYearMonth middleware', () => {
  it('should validate query parameters', () => {
    const req = { query: { year: '2025', month: '11' } };
    const res = {};
    const next = jest.fn();
    
    validateYearMonth('query')(req, res, next);
    
    expect(req.validatedYear).toBe(2025);
    expect(req.validatedMonth).toBe(11);
    expect(next).toHaveBeenCalled();
  });
});
```

---

## Summary

The new validation utilities provide:
- ✅ Consistent validation across the application
- ✅ Reduced code duplication
- ✅ Better error messages
- ✅ Easier to maintain and update
- ✅ Type-safe validation with clear constraints

Use these utilities in all new code and gradually migrate existing code during refactoring.
