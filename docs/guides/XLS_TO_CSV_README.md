# XLS to CSV Converter

A simple Python script to export all sheets from an Excel file (.xls or .xlsx) to a single combined CSV file.

## Installation

First, install the required Python packages:

```bash
pip install pandas openpyxl xlrd
```

## Usage

### Basic Usage
Export all sheets to a single CSV file (auto-named):
```bash
python xls_to_csv.py your_file.xls
```
This creates `your_file_combined.csv` in the same directory.

### Specify Output File
Export to a specific CSV file:
```bash
python xls_to_csv.py your_file.xlsx output.csv
```

### Specify Full Path
Export to a specific location:
```bash
python xls_to_csv.py data.xls C:\Output\combined.csv
```

## Examples

```bash
# Convert expenses.xls - creates expenses_combined.csv
python xls_to_csv.py expenses.xls

# Convert and save to a specific file
python xls_to_csv.py data.xlsx all_data.csv

# Save to a specific folder with custom name
python xls_to_csv.py budget.xlsx C:\Reports\budget_2024.csv
```

## Output

The script will:
- Combine all sheets into a single CSV file
- Add a "Sheet" column as the first column to identify which sheet each row came from
- Preserve all data from all sheets
- Display progress and row/column counts for each sheet

## Example Output

```
Reading Excel file: expenses.xls
Found 3 sheet(s): January, February, March

✓ Read 'January'
  Rows: 45, Columns: 7
✓ Read 'February'
  Rows: 52, Columns: 7
✓ Read 'March'
  Rows: 48, Columns: 7

Combining 3 sheet(s)...
✓ Combined CSV created: expenses_combined.csv
  Total rows: 145
  Total columns: 8

Success! File saved to: C:\Users\YourName\Documents\expenses_combined.csv
```

## CSV Structure

The output CSV will have:
- First column: "Sheet" (identifies which sheet the row came from)
- Remaining columns: All columns from your Excel sheets

Example:
```
Sheet,Date,Place,Amount,Type
January,2024-01-15,Store A,45.50,Food
January,2024-01-16,Store B,23.00,Gas
February,2024-02-01,Store C,67.80,Food
```

## Notes

- The script preserves all data from all Excel sheets
- CSV files are encoded in UTF-8
- The "Sheet" column is automatically added to track data origin
- The script does not include row indices in the CSV output
- Works with both .xls and .xlsx files
