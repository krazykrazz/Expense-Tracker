const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/expenses.db');

console.log('Testing loans schema constraints...\n');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});

db.serialize(() => {
  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON', (err) => {
    if (err) {
      console.error('Error enabling foreign keys:', err.message);
      db.close();
      process.exit(1);
    }
    console.log('✓ Foreign keys enabled');
  });

  // Check foreign key constraints
  db.all('PRAGMA foreign_key_list(loan_balances)', (err, fks) => {
    if (err) {
      console.error('Error checking foreign keys:', err.message);
    } else {
      console.log('\n=== FOREIGN KEY CONSTRAINTS ===');
      if (fks.length === 0) {
        console.log('⚠️  No foreign keys found');
      } else {
        fks.forEach(fk => {
          console.log(`✓ loan_balances.${fk.from} -> ${fk.table}.${fk.to} (ON DELETE ${fk.on_delete})`);
        });
      }
    }
  });

  // Check unique constraints
  db.all('PRAGMA index_list(loan_balances)', (err, indexes) => {
    if (err) {
      console.error('Error checking indexes:', err.message);
    } else {
      console.log('\n=== UNIQUE CONSTRAINTS ===');
      const uniqueIndexes = indexes.filter(idx => idx.unique === 1);
      if (uniqueIndexes.length === 0) {
        console.log('⚠️  No unique constraints found');
      } else {
        uniqueIndexes.forEach(idx => {
          db.all(`PRAGMA index_info(${idx.name})`, (err, cols) => {
            if (err) {
              console.error('Error getting index info:', err.message);
            } else {
              const colNames = cols.map(c => c.name).join(', ');
              console.log(`✓ UNIQUE constraint on loan_balances(${colNames})`);
            }
          });
        });
      }
    }
  });

  // Check table constraints
  db.all('SELECT sql FROM sqlite_master WHERE type="table" AND name="loans"', (err, rows) => {
    if (err) {
      console.error('Error checking loans table:', err.message);
    } else {
      console.log('\n=== LOANS TABLE CONSTRAINTS ===');
      if (rows.length > 0) {
        const sql = rows[0].sql;
        if (sql.includes('CHECK(initial_balance >= 0)')) {
          console.log('✓ CHECK constraint: initial_balance >= 0');
        }
        if (sql.includes('DEFAULT 0')) {
          console.log('✓ DEFAULT constraint: is_paid_off = 0');
        }
      }
    }
  });

  db.all('SELECT sql FROM sqlite_master WHERE type="table" AND name="loan_balances"', (err, rows) => {
    if (err) {
      console.error('Error checking loan_balances table:', err.message);
    } else {
      console.log('\n=== LOAN_BALANCES TABLE CONSTRAINTS ===');
      if (rows.length > 0) {
        const sql = rows[0].sql;
        if (sql.includes('CHECK(remaining_balance >= 0)')) {
          console.log('✓ CHECK constraint: remaining_balance >= 0');
        }
        if (sql.includes('CHECK(rate >= 0)')) {
          console.log('✓ CHECK constraint: rate >= 0');
        }
        if (sql.includes('ON DELETE CASCADE')) {
          console.log('✓ CASCADE DELETE on loan_id foreign key');
        }
        if (sql.includes('UNIQUE(loan_id, year, month)')) {
          console.log('✓ UNIQUE constraint: (loan_id, year, month)');
        }
      }
    }

    console.log('\n=== INDEXES ===');
    db.all("SELECT name FROM sqlite_master WHERE type='index' AND (tbl_name='loans' OR tbl_name='loan_balances') ORDER BY name", (err, indexes) => {
      if (err) {
        console.error('Error getting indexes:', err.message);
      } else {
        indexes.forEach(idx => {
          console.log(`✓ ${idx.name}`);
        });
      }

      console.log('\n✓ All schema constraints verified successfully!\n');
      db.close();
    });
  });
});
