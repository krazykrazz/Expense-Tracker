# Generic Expense Reimbursement

## Overview

Track reimbursements for non-medical expenses (e.g. employer or third-party reimbursements). The expense **Amount** is what you paid out-of-pocket; an optional **Original Cost** records the full amount charged. The reimbursed amount is derived as `original_cost - amount`.

## Features

- **Reimbursement section** in the expense form (collapsible, shown for every type except `Tax - Medical`, which uses the insurance UI — see [Medical Insurance Tracking](./MEDICAL_INSURANCE_TRACKING.md))
- **Original Cost $ (optional)** input with a clear (✕) button; the section header badge summarises the reimbursement
- **Preview** of Charged / Reimbursed / Net (out-of-pocket) once Original Cost and Amount are both set
- **Validation** (form and backend): Original Cost must be non-negative and Amount cannot exceed Original Cost
- **List indicator**: 💰 icon on non-medical expenses where `original_cost` is set and differs from `amount`; tooltip shows Charged, Reimbursed and Net

## Usage

1. Create or edit an expense.
2. Enter the out-of-pocket amount in **Amount**.
3. Expand **Reimbursement** and enter the full charged amount in **Original Cost**.
4. Check the preview and save. Clearing Original Cost on an existing expense sets `original_cost` back to `NULL`.

## Technical Details

### Data Storage

Uses the `expenses.original_cost` column (shared with medical insurance tracking):
- `original_cost` = total amount charged
- `amount` = net out-of-pocket

### Credit Card Balances

Credit card balance, statement and billing-cycle calculations use `COALESCE(original_cost, amount)` so the full charge is counted against the card (e.g. `paymentMethodBalanceService`, `statementBalanceService`, `creditCardPaymentService`).

## Components

| File | Purpose |
|------|---------|
| `frontend/src/components/expenses/ReimbursementIndicator.jsx` | 💰 indicator with tooltip |
| `frontend/src/components/expenses/ExpenseForm.jsx` | Reimbursement section |
| `frontend/src/hooks/useFormSubmission.js` | Adds/clears `original_cost` on submit |
| `frontend/src/hooks/useExpenseFormValidation.js` | Client-side validation |
| `frontend/src/components/expenses/ExpenseList.jsx` | Indicator placement |
| `backend/services/expenseValidationService.js` | Server-side validation |

---

**Last Updated**: 2026-10-04

