# Budget Display Fix - Zero Spent Amount on Creation

## Issue
When creating a new budget for a category, the budget card initially showed $0.00 as the spent amount, even if expenses already existed for that category in the current month. After leaving and returning to the page, the correct spent amount would display.

## Root Cause
In `BudgetManagementModal.jsx`, when a new budget was created:

1. The `createBudget` API call returned only the budget object (id, year, month, category, limit)
2. The returned budget was directly added to the state without the `spent` field
3. The `BudgetCard` component would then display `spent: 0` because the field was missing

However, when fetching budgets normally (on page load or refresh), the `getBudgets` endpoint properly includes the `spent` amount for each budget.

## Solution
Modified the `handleSaveBudget` function in `BudgetManagementModal.jsx` to refetch all budgets after creating or updating a budget. This ensures:

1. All budgets have the correct `spent` amounts from the backend
2. The newly created budget immediately shows the current spending
3. Consistency between create/update operations and normal fetches

### Code Changes
**File:** `frontend/src/components/BudgetManagementModal.jsx`

**Before:**
```javascript
if (existingBudget) {
  const updatedBudget = await updateBudget(existingBudget.id, amount);
  setBudgets(budgets.map(b => 
    b.id === existingBudget.id ? updatedBudget : b
  ));
} else {
  const newBudget = await createBudget(year, month, editingCategory, amount);
  setBudgets([...budgets, newBudget]);
}
```

**After:**
```javascript
if (existingBudget) {
  await updateBudget(existingBudget.id, amount);
} else {
  await createBudget(year, month, editingCategory, amount);
}

// Refetch all budgets to ensure spent amounts are current
await fetchBudgets();
```

## Benefits
- Immediate display of correct spent amounts when creating budgets
- Simpler code - no need to manually calculate or fetch individual spent amounts
- Consistent behavior between create, update, and fetch operations
- Ensures summary data is also refreshed

## Testing
To verify the fix:
1. Navigate to a month with existing expenses in a category (e.g., Groceries)
2. Open Budget Management modal
3. Create a new budget for that category
4. Verify the budget card immediately shows the correct spent amount (not $0.00)
5. Verify the overall budget summary is also correct
