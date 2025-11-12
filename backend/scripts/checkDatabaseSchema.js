const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const DB_PATH = path.join(__dirname, '../database/expenses.db');

console.log('Checking database schema...');
console.log('Database path:', DB_PATH);
console.log('');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});

db.serialize(() => {
  // Get all tables
  db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
    if (err) {
      console.error('Error getting tables:', err.message);
      db.close();
      process.exit(1);
    }
    
    console.log('=== DATABASE TABLES ===');
    console.log('');
    
    if (tables.length === 0) {
      console.log('No tables found in database');
      db.close();
      return;
    }
    
    let processedTables = 0;
    
    tables.forEach((table) => {
      console.log(`Table: ${table.name}`);
      console.log('─'.repeat(50));
      
      // Get table schema
      db.all(`PRAGMA table_info(${table.name})`, (err, columns) => {
        if (err) {
          console.error(`Error getting schema for ${table.name}:`, err.message);
        } else {
          columns.forEach(col => {
            const nullable = col.notnull ? 'NOT NULL' : 'NULL';
            const pk = col.pk ? ' PRIMARY KEY' : '';
            const defaultVal = col.dflt_value ? ` DEFAULT ${col.dflt_value}` : '';
            console.log(`  ${col.name.padEnd(20)} ${col.type.padEnd(10)} ${nullable}${pk}${defaultVal}`);
          });
        }
        
        // Get row count
        db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, row) => {
          if (err) {
            console.error(`Error counting rows in ${table.name}:`, err.message);
          } else {
            console.log(`  → Row count: ${row.count}`);
          }
          console.log('');
          
          processedTables++;
          if (processedTables === tables.length) {
            // Get indexes
            console.log('=== DATABASE INDEXES ===');
            console.log('');
            db.all("SELECT name, tbl_name FROM sqlite_master WHERE type='index' ORDER BY tbl_name, name", (err, indexes) => {
              if (err) {
                console.error('Error getting indexes:', err.message);
              } else if (indexes.length === 0) {
                console.log('No indexes found');
              } else {
                indexes.forEach(idx => {
                  console.log(`  ${idx.name} on ${idx.tbl_name}`);
                });
              }
              
              console.log('');
              console.log('=== REQUIRED TABLES CHECK ===');
              console.log('');
              
              const requiredTables = ['expenses', 'income_sources', 'fixed_expenses', 'recurring_expenses'];
              const existingTableNames = tables.map(t => t.name);
              
              requiredTables.forEach(tableName => {
                const exists = existingTableNames.includes(tableName);
                const status = exists ? '✓' : '✗';
                console.log(`  ${status} ${tableName}`);
              });
              
              console.log('');
              
              if (!existingTableNames.includes('fixed_expenses')) {
                console.log('⚠️  WARNING: fixed_expenses table is missing!');
                console.log('   Run: node backend/scripts/addFixedExpensesTable.js');
              } else {
                console.log('✓ All required tables exist');
              }
              
              db.close();
            });
          }
        });
      });
    });
  });
});
