#!/usr/bin/env python3
"""
CSV Validator for Expense Tracker
Validates a CSV file and reports any rows with missing required fields.

Valid expense categories (as of expanded categories feature):
- Housing, Utilities, Groceries, Dining Out, Insurance
- Gas, Vehicle Maintenance
- Entertainment, Subscriptions, Recreation Activities
- Pet Care
- Tax - Medical, Tax - Donation
- Other

Note: The legacy "Food" category has been replaced with "Dining Out".

Usage:
    python validate_csv.py <csv_file.csv>
"""

import sys
import csv

def validate_csv(csv_file):
    """Validate CSV file and report errors."""
    
    errors = []
    # Updated category list - matches backend/utils/categories.js
    # Note: "Food" has been replaced with "Dining Out" as of the category expansion
    valid_types = [
        'Housing',
        'Utilities',
        'Groceries',
        'Dining Out',
        'Insurance',
        'Gas',
        'Vehicle Maintenance',
        'Entertainment',
        'Subscriptions',
        'Recreation Activities',
        'Pet Care',
        'Tax - Medical',
        'Tax - Donation',
        'Other'
    ]
    valid_methods = ['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA']
    
    try:
        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            
            # Skip first 3 header rows
            for _ in range(3):
                next(reader, None)
            
            row_num = 4  # Data starts at row 4
            valid_count = 0
            
            for row in reader:
                if len(row) < 7:
                    errors.append({
                        'row': row_num,
                        'error': f'Not enough columns (has {len(row)}, needs 7)',
                        'data': row
                    })
                    row_num += 1
                    continue
                
                date = row[0].strip() if len(row) > 0 else ''
                place = row[1].strip() if len(row) > 1 else ''
                amount = row[2].strip() if len(row) > 2 else ''
                notes = row[3].strip() if len(row) > 3 else ''
                expense_type = row[4].strip() if len(row) > 4 else ''
                week = row[5].strip() if len(row) > 5 else ''
                method = row[6].strip() if len(row) > 6 else ''
                
                row_errors = []
                
                # Check required fields
                if not date:
                    row_errors.append('Missing Date')
                if not amount:
                    row_errors.append('Missing Amount')
                else:
                    # Try to parse amount
                    try:
                        clean_amount = amount.replace('$', '').replace(',', '')
                        float(clean_amount)
                    except ValueError:
                        row_errors.append(f'Invalid Amount: "{amount}"')
                
                if not expense_type:
                    row_errors.append('Missing Type')
                elif expense_type not in valid_types:
                    row_errors.append(f'Invalid Type: "{expense_type}" (must be one of: {", ".join(valid_types)})')
                
                if not method:
                    row_errors.append('Missing Method')
                elif method not in valid_methods:
                    row_errors.append(f'Invalid Method: "{method}" (must be one of: {", ".join(valid_methods)})')
                
                if row_errors:
                    errors.append({
                        'row': row_num,
                        'error': '; '.join(row_errors),
                        'data': {
                            'Date': date,
                            'Place': place,
                            'Amount': amount,
                            'Notes': notes,
                            'Type': expense_type,
                            'Week': week,
                            'Method': method
                        }
                    })
                else:
                    valid_count += 1
                
                row_num += 1
        
        # Print results
        print(f"\n{'='*80}")
        print(f"CSV Validation Results: {csv_file}")
        print(f"{'='*80}\n")
        
        print(f"✓ Valid rows: {valid_count}")
        print(f"✗ Invalid rows: {len(errors)}\n")
        
        if errors:
            print(f"{'='*80}")
            print("ERRORS:")
            print(f"{'='*80}\n")
            
            for i, error in enumerate(errors, 1):
                print(f"Error #{i} - Row {error['row']}:")
                print(f"  Issue: {error['error']}")
                if isinstance(error['data'], dict):
                    print(f"  Data:")
                    for key, value in error['data'].items():
                        print(f"    {key}: {value if value else '(empty)'}")
                else:
                    print(f"  Raw: {error['data']}")
                print()
        else:
            print("✓ No errors found! All rows are valid.")
        
        return len(errors) == 0
        
    except FileNotFoundError:
        print(f"Error: File '{csv_file}' not found.")
        return False
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python validate_csv.py <csv_file.csv>")
        sys.exit(1)
    
    csv_file = sys.argv[1]
    success = validate_csv(csv_file)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
