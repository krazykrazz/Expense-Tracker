# Medical Expense People Tracking

## Overview

Associate medical expenses (`Tax - Medical`) with family members and view the tax report grouped by person and provider.

**Related Features:**
- [Tax-Deductible Invoices](./TAX_DEDUCTIBLE_INVOICES.md) - PDF invoices, optionally linked to a person
- [Medical Insurance Tracking](./MEDICAL_INSURANCE_TRACKING.md) - Insurance eligibility, claim status and per-person original cost

## Key Features

### People Management
- **⚙️ Settings → 👥 People** tab ("Family Members"): add, edit (✏️) and delete (🗑️) people
- Name (required, unique) and optional date of birth
- Deleting a person removes their expense allocations (after a confirmation)

### Expense Association
- **People Assignment** section in the expense form (medical expenses only) with a multi-select "Assign to People"
- One person: the full amount is assigned automatically
- Several people: allocate amounts in the **Allocate Expense Amount** modal (opens via ✏️ Edit, or on submit if amounts aren't set yet)
  - **Split Equally** divides the amount (and original cost, when insurance-eligible) evenly, rounded to cents
  - Totals must equal the expense amount (and original cost for insurance-eligible expenses), every amount must be > 0, and a person's out-of-pocket cannot exceed their original cost
  - **Save Allocation** is disabled until valid

### Expense List Indicators
- 👤 name for one person; 👤 count plus per-person amounts for several (tooltip shows names, amounts, DOB)
- ⚠️ **Unassigned** for medical expenses with no people

### Tax Report
- **Group Medical Expenses by Person** checkbox in the Tax Deductible view (shown when the year has medical expenses)
- Per-person collapsible groups (👤 name, total) with 🏥 provider subtotals; each row shows the person's allocated amount
- **⚠️ Unassigned Medical Expenses** section with a ✏️ Edit button that opens the expense form to assign people

## Database Schema

```sql
CREATE TABLE people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  date_of_birth TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE expense_people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  amount DECIMAL(10,2) NOT NULL,          -- out-of-pocket allocation
  original_amount REAL DEFAULT NULL,      -- original cost allocation (insurance)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
  UNIQUE(expense_id, person_id)
);
```

## API Endpoints

### People
- `GET /api/people` - List people
- `POST /api/people` - Create
- `PUT /api/people/:id` - Update
- `DELETE /api/people/:id` - Delete (removes allocations)

### Expenses
- `POST /api/expenses`, `PUT /api/expenses/:id` - Accept an optional `peopleAllocations` array (`{ personId, amount, originalAmount }`)
- `GET /api/expenses/:id` - Expense with its people
- `GET /api/expenses/tax-deductible?year=YYYY&groupByPerson=true` - Adds `groupedByPerson` and `unassignedExpenses`

## Invoice-Person Linking

Invoices on a medical expense can be linked to one of the people assigned to that expense (the backend rejects other people with "Person is not assigned to this expense"). Deleting a person sets the invoice's `person_id` to `NULL`; the invoice is kept. See [Tax-Deductible Invoices](./TAX_DEDUCTIBLE_INVOICES.md).

## Key Files

| File | Role |
|------|------|
| `frontend/src/components/system/SettingsModal.jsx` | People tab |
| `frontend/src/components/tax/PersonAllocationModal.jsx` | Allocation modal |
| `frontend/src/components/expenses/ExpenseForm.jsx` | People Assignment section |
| `frontend/src/components/expenses/ExpenseList.jsx` | `PeopleIndicator` |
| `frontend/src/components/tax/TaxDeductible.jsx` | Person-grouped report |
| `frontend/src/services/peopleApi.js` | People API client |
| `backend/services/peopleService.js`, `backend/repositories/peopleRepository.js`, `backend/repositories/expensePeopleRepository.js` | Backend |

---

**Last Updated:** 2026-10-04

