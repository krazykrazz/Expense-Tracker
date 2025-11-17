/**
 * Test script to verify database initialization with /config directory support
 */

const { getDatabasePath, ensureDirectories, getConfigDir, isContainerized } = require('../config/paths');
const { initializeDatabase, getDatabase } = require('../database/db');

async function testDatabaseConfig() {
  console.log('=== Database Configuration Test ===\n');
  
  // Test 1: Check configuration paths
  console.log('1. Configuration Paths:');
  console.log('   - Is Containerized:', isContainerized);
  console.log('   - Config Directory:', getConfigDir());
  console.log('   - Database Path:', getDatabasePath());
  
  // Test 2: Ensure directories
  console.log('\n2. Creating directory structure...');
  try {
    await ensureDirectories();
    console.log('   ✓ Directories created successfully');
  } catch (error) {
    console.error('   ✗ Error creating directories:', error.message);
    process.exit(1);
  }
  
  // Test 3: Initialize database
  console.log('\n3. Initializing database...');
  try {
    const db = await initializeDatabase();
    console.log('   ✓ Database initialized successfully');
    db.close();
  } catch (error) {
    console.error('   ✗ Error initializing database:', error.message);
    process.exit(1);
  }
  
  // Test 4: Get database connection
  console.log('\n4. Testing database connection...');
  try {
    const db = await getDatabase();
    console.log('   ✓ Database connection successful');
    
    // Test a simple query
    db.get('SELECT COUNT(*) as count FROM expenses', (err, row) => {
      if (err) {
        console.error('   ✗ Error querying database:', err.message);
        db.close();
        process.exit(1);
      }
      console.log('   ✓ Query successful - Expense count:', row.count);
      db.close();
      
      console.log('\n=== All Tests Passed ===');
      process.exit(0);
    });
  } catch (error) {
    console.error('   ✗ Error connecting to database:', error.message);
    process.exit(1);
  }
}

// Run tests
testDatabaseConfig().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
