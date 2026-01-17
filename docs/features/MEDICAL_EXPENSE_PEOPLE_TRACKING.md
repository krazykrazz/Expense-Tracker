# Medical Expense People Tracking

## Overview

The Medical Expense People Tracking feature enables users to associate medical expenses with specific family members and generate detailed tax reporting summaries organized by person and provider. This enhancement builds on the existing "Tax - Medical" category to provide more granular tracking for tax preparation and family expense management.

**Related Features:** 
- [Tax-Deductible Expense Invoice Attachments](./TAX_DEDUCTIBLE_INVOICES.md) (v4.12.0) - Attach PDF invoices to tax-deductible expenses
- **Invoice-Person Linking** (v4.13.0) - Link individual invoices to specific family members for comprehensive record keeping

## Key Features

### People Management
- Add, edit, and delete family members from Settings → People tab
- Store name and optional date of birth for each person
- Cascade delete removes person associations when a person is deleted

### Expense Association
- Associate medical expenses (Tax - Medical category) with one or more people
- Single person selection automatically assigns the full expense amount
- Multiple person selection opens an allocation modal for custom splits
- "Split Equally" button for convenient equal division

### Tax Reporting
- View medical expenses grouped by person in Tax Deductible view
- Per-person subtotals by medical provider for tax form preparation
- "Unassigned" section for medical expenses without people associations
- Quick assign functionality to add people to unassigned expenses

### Visual Indicators
- Person icons/badges on medical expenses in expense list
- "Unassigned" indicators for medical expenses without people
- Person count display for multi-person expenses
- Allocation amounts shown for split expenses
- Invoice-person links shown in invoice lists (v4.13.0+)

## Usage Guide

### Managing People

1. Click the **⚙️ Settings** button in the header
2. Navigate to the **People** tab
3. To add a person:
   - Enter the person's name (required)
   - Optionally enter their date of birth
   - Click **Add Person**
4. To edit a person:
   - Click the **Edit** button next to their name
   - Modify the details
   - Click **Save**
5. To delete a person:
   - Click the **Delete** button
   - Confirm the deletion (this removes all expense associations)

### Creating Medical Expenses with People

1. Click **+ Add Expense** to open the expense form
2. Select **Tax - Medical** as the category
3. Fill in the expense details (date, place, amount, etc.)
4. In the **People** dropdown:
   - **Single Person**: Select one person - the full amount is automatically assigned
   - **Multiple People**: Select multiple people - the allocation modal opens

### Allocating Amounts Across Multiple People

When you select multiple people for a medical expense:

1. The **Person Allocation Modal** opens automatically
2. You'll see each selected person with an amount input field
3. Options:
   - **Split Equally**: Click to divide the total evenly among all people
   - **Custom Amounts**: Enter specific amounts for each person
4. The total allocated must equal the expense amount
5. Click **Save** to confirm the allocations

### Viewing Person-Grouped Tax Reports

1. Navigate to **Tax Deductible** view
2. Toggle **Group by Person** to enable person grouping
3. View medical expenses organized by:
   - Person name
   - Provider (place) subtotals within each person
   - Per-person totals for tax preparation
4. **Unassigned** section shows medical expenses without people

### Quick Assigning People to Existing Expenses

1. In the Tax Deductible view, find the **Unassigned** section
2. Click the **Assign** button next to an unassigned expense
3. Select the person(s) to assign
4. If multiple people, allocate amounts
5. The expense moves to the appropriate person section

### Linking Invoices to People (v4.13.0+)

When uploading invoices to medical expenses, you can optionally link each invoice to a specific family member:

1. Edit a medical expense with people assigned
2. In the Invoice section, click "Add Invoice"
3. Select a PDF file to upload
4. Use the "Link to Person" dropdown to select a family member
5. The invoice will be associated with that person
6. View person-linked invoices in the Tax Deductible report's person-grouped view

## Database Schema

### People Table
```sql
CREATE TABLE people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date_of_birth DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Expense People Junction Table
```sql
CREATE TABLE expense_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL,
    person_id INTEGER NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
    UNIQUE(expense_id, person_id)
);
```

## API Endpoints

### People Management
- `GET /api/people` - Get all people
- `POST /api/people` - Create a new person
- `PUT /api/people/:id` - Update a person
- `DELETE /api/people/:id` - Delete a person (cascades to associations)

### Enhanced Expense Endpoints
- `POST /api/expenses` - Create expense with optional `people` array
- `PUT /api/expenses/:id` - Update expense with optional `people` array
- `GET /api/expenses/:id` - Get expense with people associations
- `GET /api/expenses/tax-deductible` - Get tax deductible expenses with person grouping

## Backward Compatibility

- Existing medical expenses without people associations continue to work
- They appear in the "Unassigned" section in person-grouped views
- Users can retroactively add people to existing expenses
- No data migration required for existing expenses
- Existing invoices without person links continue to work (v4.13.0+)

## Integration with Invoice Feature (v4.13.0+)

The people tracking feature integrates with the multi-invoice support:

- **Invoice-Person Linking**: When uploading an invoice, optionally select a person from those assigned to the expense
- **Person Validation**: The system validates that the selected person is actually assigned to the expense
- **Cascade Behavior**: When a person is removed from an expense, their invoice links are set to NULL (invoices preserved)
- **Tax Report Integration**: Person-grouped tax reports show which invoices are linked to each family member

## Technical Details

### Property-Based Testing
The feature includes comprehensive property-based tests validating:
- Person data round-trip storage
- Person deletion cascade behavior
- Amount allocation validation
- Person-grouped aggregation accuracy
- Backward compatibility preservation
- Assignment workflow correctness

### Test Coverage
- 13 correctness properties with 100+ iterations each
- Unit tests for all CRUD operations
- Integration tests for complete workflows
- Frontend component tests for UI functionality

---

**Version:** 4.13.0 (Updated for Invoice-Person Linking)  
**Original Version:** 4.6.0  
**Last Updated:** January 17, 2026
