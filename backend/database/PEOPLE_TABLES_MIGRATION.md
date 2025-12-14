# People Tables Migration

## Overview

This migration adds support for tracking medical expenses by person/family member. It creates two new tables to enable associating medical expenses with specific individuals and tracking expense allocations.

## Migration: `add_people_tables_v1`

### Tables Created

#### `people` Table
Stores information about family members who can be associated with medical expenses.

```sql
CREATE TABLE people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date_of_birth DATE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

**Columns:**
- `id`: Primary key, auto-incrementing
- `name`: Required name of the person
- `date_of_birth`: Optional date of birth
- `created_at`: Timestamp when record was created
- `updated_at`: Timestamp when record was last updated

#### `expense_people` Table
Junction table linking expenses to people with amount allocations.

```sql
CREATE TABLE expense_people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
  UNIQUE(expense_id, person_id)
)
```

**Columns:**
- `id`: Primary key, auto-incrementing
- `expense_id`: Foreign key to expenses table
- `person_id`: Foreign key to people table
- `amount`: Amount allocated to this person for this expense
- `created_at`: Timestamp when association was created

**Constraints:**
- Foreign key to `expenses(id)` with CASCADE DELETE
- Foreign key to `people(id)` with CASCADE DELETE
- Unique constraint on `(expense_id, person_id)` - prevents duplicate associations

### Indexes Created

For optimal query performance:

```sql
CREATE INDEX idx_people_name ON people(name);
CREATE INDEX idx_expense_people_expense_id ON expense_people(expense_id);
CREATE INDEX idx_expense_people_person_id ON expense_people(person_id);
```

## Requirements Satisfied

- **1.1**: People table with id, name, date_of_birth, timestamps ✓
- **1.4**: Foreign key constraints with CASCADE DELETE ✓
- **2.5**: Junction table with expense_id, person_id, amount ✓

## Usage Examples

### Add a Person
```sql
INSERT INTO people (name, date_of_birth) 
VALUES ('John Doe', '1990-01-15');
```

### Associate Expense with Person
```sql
-- For a $100 medical expense (ID 123) fully allocated to person ID 1
INSERT INTO expense_people (expense_id, person_id, amount) 
VALUES (123, 1, 100.00);
```

### Split Expense Between Multiple People
```sql
-- For a $150 medical expense (ID 124) split between two people
INSERT INTO expense_people (expense_id, person_id, amount) VALUES 
(124, 1, 75.00),
(124, 2, 75.00);
```

### Query Expenses by Person
```sql
SELECT e.*, ep.amount as allocated_amount
FROM expenses e
JOIN expense_people ep ON e.id = ep.expense_id
JOIN people p ON ep.person_id = p.id
WHERE p.name = 'John Doe'
AND e.type = 'Tax - Medical';
```

## Cascade Delete Behavior

- **Deleting a person**: Automatically removes all expense associations for that person
- **Deleting an expense**: Automatically removes all person associations for that expense

This ensures referential integrity while allowing flexible management of people and expenses.

## Migration Status

The migration is automatically executed during database initialization and is tracked in the `schema_migrations` table to prevent duplicate execution.

## Testing

Use the provided test scripts to verify the migration:

```bash
# Test the migration
node backend/scripts/runPeopleMigration.js

# Verify schema
node backend/scripts/checkPeopleSchema.js

# Test constraints
node backend/scripts/testPeopleConstraints.js

# Verify requirements
node backend/scripts/verifyPeopleTablesRequirements.js
```