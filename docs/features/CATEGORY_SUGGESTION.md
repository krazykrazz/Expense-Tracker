# Smart Expense Entry Feature

## Overview

The smart expense entry feature enhances the expense entry workflow by:
1. Reordering form fields to prioritize the Place input
2. Implementing intelligent category suggestions based on historical data
3. Remembering the last used payment method

When a user enters a place name, the system analyzes historical expenses to suggest the most likely category, reducing manual selection and improving data consistency.

## How It Works

### Place-First Entry Flow
1. **Form Opens with Place Focus**: The Place field receives initial focus when the form opens
2. **User Types Place Name**: Autocomplete shows previously used place names
3. **User Selects/Enters Place**: When place is selected or field loses focus
4. **Category Auto-Suggests**: System suggests the most frequently used category for that place
5. **Focus Moves to Amount**: After place entry, focus automatically moves to the Amount field

### Category Suggestion Logic
- Suggests the most frequently used category for the exact place name (case-insensitive)
- If multiple categories have equal frequency, uses the most recently used category
- Shows a visual indicator ("✨ suggested") when category is auto-filled
- Defaults to "Other" if no history exists for the place

### Payment Method Memory
- Remembers the last used payment method in localStorage
- Pre-selects it when opening the form for the next expense
- Defaults to "Cash" if no previous selection exists

## Technical Implementation

### Backend

**Repository Layer** (`backend/repositories/expenseRepository.js`):
- `getCategoryFrequencyByPlace(place)`: Queries category frequency with last used dates
- Case-insensitive matching using `LOWER()` SQL function
- Returns array sorted by count DESC, then last_used DESC

**Service Layer** (`backend/services/categorySuggestionService.js`):
- `getSuggestedCategory(place)`: Returns suggestion with confidence score
- `getCategoryBreakdown(place)`: Returns full breakdown of all categories for a place
- Handles tie-breaker logic using most recent date

**Controller Layer** (`backend/controllers/expenseController.js`):
- `getSuggestedCategory(req, res)`: HTTP endpoint handler
- Returns both suggestion and breakdown in response

**Routes** (`backend/routes/expenseRoutes.js`):
- `GET /api/expenses/suggest-category?place={placeName}`

### Frontend

**ExpenseForm Component** (`frontend/src/components/ExpenseForm.jsx`):
- Field order: Date, Place, Type, Amount, Payment Method, Notes
- Place field gets initial focus via `useRef`
- `fetchAndApplyCategorySuggestion()`: Fetches and applies category suggestion
- `handlePlaceBlur()`: Triggers suggestion fetch when place field loses focus
- Visual indicator for auto-suggested categories
- Payment method persistence via localStorage

**Category Suggestion API** (`frontend/src/services/categorySuggestionApi.js`):
- `fetchCategorySuggestion(place)`: Fetches suggestion from backend
- Graceful degradation on errors (returns null)

## API Endpoint

### Request
```
GET /api/expenses/suggest-category?place=Walmart
```

### Response (with history)
```json
{
  "suggestion": {
    "category": "Groceries",
    "confidence": 0.85,
    "count": 17
  },
  "breakdown": [
    { "category": "Groceries", "count": 17, "lastUsed": "2025-11-25" },
    { "category": "Other", "count": 3, "lastUsed": "2025-10-15" }
  ]
}
```

### Response (no history)
```json
{
  "suggestion": null,
  "breakdown": []
}
```

### Error Response
```json
{
  "error": "Place query parameter is required"
}
```

## Response Fields

- `suggestion.category`: The suggested expense category (or null)
- `suggestion.confidence`: Ratio (0-1) indicating suggestion confidence
- `suggestion.count`: Number of times this category was used for this place
- `breakdown`: Array of all categories used at this place with counts and last used dates

## Form Field Order

The form fields are displayed in this order (Requirements 3.2):
1. Date
2. Place (with autocomplete)
3. Type (with suggestion indicator)
4. Amount
5. Payment Method
6. Notes

## Visual Indicators

- **Suggestion Badge**: "✨ suggested" appears next to the Type label when auto-filled
- **Highlighted Select**: The Type dropdown has a light blue background when auto-suggested
- **Indicator Clears**: When user manually changes the category, the indicator disappears

## localStorage Keys

- `expense-tracker-last-payment-method`: Stores the last used payment method

## Testing

### Backend Property-Based Tests
```bash
npx jest categorySuggestionService.pbt --runInBand
```

Tests:
- Property 2: Tie-breaker uses most recent category
- Property 3: New places return null suggestion

### Backend Unit Tests
```bash
npx jest expenseController.suggestCategory --runInBand
```

Tests:
- Valid place with history
- Missing/empty place parameter
- Place without history
- Error handling

### Frontend Property-Based Tests
```bash
npx vitest run ExpenseForm.pbt
```

Tests:
- Property 4: Form validation enables submit
- Property 5: Payment method persistence

## Correctness Properties

1. **Most Frequent Category Suggestion**: For any place with history, the suggested category is the one with highest frequency
2. **Tie-Breaker Uses Most Recent**: When categories have equal frequency, the most recently used is suggested
3. **New Place Defaults to Null**: Places with no history return null (form defaults to "Other")
4. **Form Validation Enables Submit**: Submit button enabled when all required fields are valid
5. **Payment Method Persistence**: Last used payment method is stored and pre-selected

## Performance

- Database query optimized with proper indexing
- Response time: < 100ms (Requirements 4.3)
- No impact on form load time (suggestion fetched only after place entry)
- Graceful degradation if API is slow or unavailable

## Error Handling

| Error Scenario | Handling Strategy |
|----------------|-------------------|
| API timeout | Use default "Other" category, don't block form |
| Invalid place name | Allow submission, no suggestion |
| Network error | Graceful degradation, form works without suggestions |
| Empty place name | No API call, no suggestion |
