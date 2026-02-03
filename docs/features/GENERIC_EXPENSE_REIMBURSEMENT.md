# Generic Expense Reimbursement

**Version**: 5.3.0  
**Completed**: February 2026  
**Spec**: `archive/specs/generic-expense-reimbursement/`

## Overview

Track reimbursements for any expense type (not just medical). This feature allows users to record expected reimbursements from employers, insurance, or other sources, with automatic calculation of net out-of-pocket amounts.

## Features

### Reimbursement Tracking

- **Reimbursement Field**: Add expected reimbursement amount to any expense
- **Net Amount Calculation**: Automatically calculates out-of-pocket (amount - reimbursement)
- **Visual Indicator**: 💰 icon shows which expenses have reimbursements
- **Tooltip Breakdown**: Hover to see Charged, Reimbursed, and Net amounts

### Form Integration

- **Reimbursement Input**: Available for all non-medical expense types
- **Medical Exclusion**: Medical expenses with insurance tracking use their specialized UI
- **Preview Display**: Shows breakdown before saving
- **Validation**: Ensures reimbursement doesn't exceed expense amount

### Data Storage

- **No Schema Changes**: Uses existing `original_cost` column
- **Backward Compatible**: Existing expenses unaffected
- **Credit Card Integration**: Balance calculations use original charged amount

## Usage

### Adding a Reimbursement

1. Create or edit an expense
2. Enter the total amount charged
3. Enter the expected reimbursement amount
4. The form shows the net out-of-pocket amount
5. Save the expense

### Viewing Reimbursements

- Look for the 💰 indicator in the expense list
- Hover over the indicator to see the breakdown
- The displayed amount is the net out-of-pocket

## Technical Details

### Data Transformation

When saving an expense with reimbursement:
- `original_cost` = total amount charged
- `amount` = net out-of-pocket (original - reimbursement)

When editing:
- Reimbursement is calculated from `original_cost - amount`

### Credit Card Balance

Credit card balance calculations use `COALESCE(original_cost, amount)` to reflect the actual charge to the card.

## Components

| Component | Purpose |
|-----------|---------|
| `ReimbursementIndicator.jsx` | Visual indicator with tooltip |
| `ExpenseForm.jsx` | Reimbursement input section |
| `ExpenseList.jsx` | Indicator integration |

## Testing

Property-based tests validate:
- Reimbursement validation (non-negative, ≤ amount)
- Data storage consistency
- Edit round-trip preservation
- Indicator display logic

---

**Last Updated**: February 2, 2026
