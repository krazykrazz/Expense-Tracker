#!/usr/bin/env python3
"""
XLS to CSV Converter for Expense Tracker
Exports all sheets from an Excel file to a CSV format compatible with the expense tracker.
- Skips the "Summary" sheet
- Extracts columns: Date, Place, Amount, Notes, Type, Week, Method
- Formats output to match expense tracker import expectations

Usage:
    python xls_to_csv.py <input_file.xls>
    python xls_to_csv.py <input_file.xls> <output_file.csv>

Requirements:
    pip install pandas openpyxl xlrd
"""

import sys
import os
import pandas as pd
from pathlib import Path


def convert_xls_to_csv(input_file, output_file=None):
    """
    Convert all sheets in an Excel file to a single CSV file.
    
    Args:
        input_file: Path to the Excel file (.xls or .xlsx)
        output_file: Path to output CSV file (default: same name as input with .csv extension)
    """
    # Validate input file
    if not os.path.exists(input_file):
        print(f"Error: File '{input_file}' not found.")
        return False
    
    # Determine output file
    if output_file is None:
        base_name = Path(input_file).stem
        output_dir = os.path.dirname(input_file) or '.'
        output_file = os.path.join(output_dir, f"{base_name}_combined.csv")
    
    # Create output directory if it doesn't exist
    output_dir = os.path.dirname(output_file)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
    
    try:
        # Read all sheets from the Excel file
        print(f"Reading Excel file: {input_file}")
        excel_file = pd.ExcelFile(input_file)
        sheet_names = excel_file.sheet_names
        
        print(f"Found {len(sheet_names)} sheet(s): {', '.join(sheet_names)}")
        print()
        
        # List to store all dataframes
        all_dataframes = []
        total_rows = 0
        
        # Read each sheet
        for sheet_name in sheet_names:
            # Skip the "Summary" sheet
            if sheet_name.lower() == 'summary':
                print(f"⊘ Skipped '{sheet_name}' (excluded)")
                continue
            
            # Read the sheet without headers
            df = pd.read_excel(excel_file, sheet_name=sheet_name, header=None)
            
            # Find the row with "Date" in it (this is the header row)
            header_row_idx = None
            for idx, row in df.iterrows():
                if 'Date' in row.values:
                    header_row_idx = idx
                    break
            
            if header_row_idx is None:
                print(f"⊘ Skipped '{sheet_name}' (no header row found)")
                continue
            
            # Find which column has "Date" (this is where data starts)
            date_col_idx = None
            header_row = df.iloc[header_row_idx]
            for col_idx, value in enumerate(header_row):
                if value == 'Date':
                    date_col_idx = col_idx
                    break
            
            if date_col_idx is None:
                print(f"⊘ Skipped '{sheet_name}' (Date column not found)")
                continue
            
            # Extract data starting from the row after header and the Date column
            # Get 7 columns: Date, Place, Amount, Notes, Type, Week, Method
            data_start_row = header_row_idx + 1
            data_end_col = date_col_idx + 7
            
            df = df.iloc[data_start_row:, date_col_idx:data_end_col]
            
            # Set proper column names
            df.columns = ['Date', 'Place', 'Amount', 'Notes', 'Type', 'Week', 'Method']
            
            # Remove rows where Date is empty
            df = df[df['Date'].notna()]
            
            # Convert Date column to datetime for filtering
            df['Date'] = pd.to_datetime(df['Date'], errors='coerce')
            
            # Filter out dates before 2025
            df = df[df['Date'] >= '2025-01-01']
            
            # Convert back to string in YYYY-MM-DD format
            df['Date'] = df['Date'].dt.strftime('%Y-%m-%d')
            
            if len(df) == 0:
                print(f"⊘ Skipped '{sheet_name}' (no data rows)")
                continue
            
            all_dataframes.append(df)
            
            print(f"✓ Read '{sheet_name}'")
            print(f"  Rows: {len(df)}, Columns: {len(df.columns)}")
            total_rows += len(df)
        
        if not all_dataframes:
            print("\nError: No sheets to process after filtering.")
            return False
        
        print()
        print(f"Combining {len(all_dataframes)} sheet(s)...")
        
        # Combine all dataframes
        combined_df = pd.concat(all_dataframes, ignore_index=True)
        
        # Create the output CSV with 3 header rows (as expected by the import)
        with open(output_file, 'w', encoding='utf-8', newline='') as f:
            # Write 3 blank header rows
            f.write('\n')
            f.write('\n')
            f.write('\n')
        
        # Append the data (starting from row 4)
        combined_df.to_csv(output_file, mode='a', index=False, header=False, encoding='utf-8')
        
        print(f"✓ Combined CSV created: {os.path.basename(output_file)}")
        print(f"  Total rows: {total_rows}")
        print(f"  Columns: Date, Place, Amount, Notes, Type, Week, Method")
        print()
        print(f"Success! File saved to: {os.path.abspath(output_file)}")
        print()
        print("Note: CSV formatted for expense tracker import (3 blank header rows)")
        return True
        
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main entry point for the script."""
    # Check command line arguments
    if len(sys.argv) < 2:
        print("Usage: python xls_to_csv.py <input_file.xls> [output_file.csv]")
        print()
        print("Examples:")
        print("  python xls_to_csv.py expenses.xls")
        print("  python xls_to_csv.py expenses.xlsx output.csv")
        print("  python xls_to_csv.py data.xls C:\\Output\\combined.csv")
        print()
        print("Note: Skips 'Summary' sheet and formats for expense tracker import")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    # Convert the file
    success = convert_xls_to_csv(input_file, output_file)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
