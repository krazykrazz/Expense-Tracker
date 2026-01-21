# Medical Insurance Tracking

## Overview

The Medical Insurance Tracking feature enables users to track insurance eligibility and claim status for medical expenses (Tax - Medical type). Users can monitor whether expenses are eligible for insurance reimbursement, track claim progress through submission, and record both original costs and out-of-pocket amounts after reimbursement.

**Related Features:**
- [Medical Expense People Tracking](./MEDICAL_EXPENSE_PEOPLE_TRACKING.md) - Associate expenses with family members
- [Tax-Deductible Expense Invoice Attachments](./TAX_DEDUCTIBLE_INVOICES.md) - Attach PDF invoices to expenses

## Key Features

### Insurance Eligibility
- Mark medical expenses as eligible or not eligible for insurance reimbursement
- Insurance fields only appear for Tax - Medical expense type
- Default to "not eligible" for new expenses

### Claim Status Tracking
- Track claim progress through four statuses:
  - **Not Claimed**: Expense not yet submitted to insurance
  - **In Progress**: Claim submitted, awaiting decision
  - **Paid**: Insurance has reimbursed the expense
  - **Denied**: Insurance denied the claim
- Quick status update from expense list without opening edit form

### Original Cost vs Out-of-Pocket
- Track original expense amount before insurance
- Track out-of-pocket amount (what you actually paid)
- Automatic reimbursement calculation (original - out-of-pocket)
- Validation ensures out-of-pocket doesn't exceed original cost

### People Allocation Integration
- Split insurance-eligible expenses across family members
- Track both original cost and out-of-pocket per person
- Person-grouped tax reports show both amounts

### Visual Indicators
- Insurance status badges in expense list:
  - 📋 Gray: Not Claimed
  - ⏳ Yellow/Orange: In Progress
  - ✅ Green: Paid
  - ❌ Red: Denied
- No indicator shown for non-eligible expenses

## Usage Guide

### Marking an Expense as Insurance Eligible

1. Create or edit a medical expense (Tax - Medical type)
2. Check the **"Eligible for Insurance"** checkbox
3. Enter the **Original Cost** (full expense amount)
4. The **Amount** field becomes the out-of-pocket cost
5. Select the initial **Claim Status** (defaults to "Not Claimed")
6. Save the expense

### Updating Claim Status

**From Expense List (Quick Update):**
1. Find the medical expense in the expense list
2. Click the insurance status indicator (📋, ⏳, ✅, or ❌)
3. Select the new status from the dropdown
4. Status updates immediately

**From Edit Form:**
1. Click edit on the expense
2. Change the Claim Status dropdown
3. Update the out-of-pocket amount if needed (for Paid status)
4. Save the expense

### Tracking Reimbursement

When a claim is paid:
1. Update the claim status to "Paid"
2. Enter the actual out-of-pocket amount you paid
3. The system calculates: Reimbursement = Original Cost - Out-of-Pocket
4. View reimbursement amounts in the Tax Deductible report

### Viewing Insurance Summary

1. Navigate to **Tax Deductible** view
2. Medical expenses show insurance status indicators
3. View summary totals:
   - Total Original Costs
   - Total Out-of-Pocket (deductible amount)
   - Total Reimbursements
   - Breakdown by claim status
4. Filter by claim status to focus on specific expenses

### Filtering by Insurance Status

In the Tax Deductible view:
1. Use the **Claim Status** filter dropdown
2. Select a status to filter (Not Claimed, In Progress, Paid, Denied)
3. View only expenses matching that status

In the Expense List:
1. Use the insurance status filter
2. Filter medical expenses by claim status

## Database Schema

### Expenses Table (Extended Fields)

```sql
-- Insurance tracking fields (Tax - Medical expenses only)
insurance_eligible INTEGER DEFAULT 0,    -- 0 = not eligible, 1 = eligible
claim_status TEXT DEFAULT NULL,          -- 'not_claimed', 'in_progress', 'paid', 'denied'
original_cost REAL DEFAULT NULL          -- Original cost before reimbursement
```

### Expense People Table (Extended Fields)

```sql
-- Original amount allocation for insurance tracking
original_amount REAL DEFAULT NULL        -- Original cost allocation per person
```

## API Endpoints

### Quick Status Update
- `PATCH /api/expenses/:id/insurance-status` - Update claim status only
  - Request: `{ "status": "in_progress" }`
  - Response: Updated expense object

### Extended Expense Endpoints
- `POST /api/expenses` - Create expense with insurance fields
- `PUT /api/expenses/:id` - Update expense with insurance fields
- `GET /api/expenses/tax-deductible` - Returns insurance data with expenses

### Request/Response Examples

**Create Insurance-Eligible Expense:**
```json
POST /api/expenses
{
  "date": "2026-01-15",
  "place": "Medical Clinic",
  "amount": 50.00,
  "type": "Tax - Medical",
  "method": "Credit Card",
  "insurance_eligible": true,
  "original_cost": 200.00,
  "claim_status": "not_claimed"
}
```

**Quick Status Update:**
```json
PATCH /api/expenses/123/insurance-status
{
  "status": "paid"
}
```

**Tax Deductible Response (with insurance):**
```json
{
  "expenses": [
    {
      "id": 123,
      "date": "2026-01-15",
      "place": "Medical Clinic",
      "amount": 50.00,
      "original_cost": 200.00,
      "insurance_eligible": true,
      "claim_status": "paid",
      "reimbursement": 150.00
    }
  ],
  "insuranceSummary": {
    "totalOriginalCost": 200.00,
    "totalOutOfPocket": 50.00,
    "totalReimbursement": 150.00,
    "byStatus": {
      "not_claimed": { "count": 0, "amount": 0 },
      "in_progress": { "count": 0, "amount": 0 },
      "paid": { "count": 1, "amount": 200.00 },
      "denied": { "count": 0, "amount": 0 }
    }
  }
}
```

## Validation Rules

1. **Insurance fields only for Tax - Medical**: Insurance eligibility, claim status, and original cost are only valid for expenses with type "Tax - Medical"

2. **Amount validation**: Out-of-pocket amount (amount field) cannot exceed original cost

3. **Claim status values**: Must be one of: "not_claimed", "in_progress", "paid", "denied", or null

4. **Person allocation validation**: Per-person out-of-pocket amounts cannot exceed their original cost allocations

## Backward Compatibility

- Existing medical expenses default to `insurance_eligible = 0`
- Existing expenses have `original_cost` set equal to `amount`
- No data loss during migration
- Backup created before migration runs

## Technical Details

### Property-Based Testing
The feature includes comprehensive property-based tests validating:
- Insurance data persistence round-trip
- Claim status enum validation
- Amount validation invariant
- Reimbursement calculation accuracy
- People allocation consistency
- Migration data preservation
- Backup/restore round-trip

### Test Coverage
- 12 correctness properties with 100+ iterations each
- Unit tests for validation and calculations
- Integration tests for API endpoints
- Frontend component tests

---

**Version:** 4.14.0  
**Last Updated:** January 21, 2026
