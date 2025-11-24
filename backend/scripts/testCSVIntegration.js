/**
 * CSV Import Integration Test
 * 
 * Tests CSV import functionality with expanded categories
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

const fs = require('fs');
const path = require('path');
const { CATEGORIES } = require('../utils/categories');

const TEST_CSV_DIR = path.join(__dirname, '../../test-data');
const TEST_CSV_PATH = path.join(TEST_CSV_DIR, 'test-expanded-categories.csv');

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, message = '') {
  results.tests.push({ name, passed, message });
  if (passed) {
    results.passed++;
    console.log(`✓ ${name}`);
  } else {
    results.failed++;
    console.error(`✗ ${name}: ${message}`);
  }
}

function createTestCSV() {
  console.log('\n=== Creating Test CSV Files ===');
  
  // Ensure test-data directory exists
  if (!fs.existsSync(TEST_CSV_DIR)) {
    fs.mkdirSync(TEST_CSV_DIR, { recursive: true });
  }

  // Create CSV with all valid categories
  const validCSV = [
    'date,place,notes,amount,type,method',
    '2024-11-01,Home Depot,Rent payment,1500.00,Housing,Auto',
    '2024-11-02,Electric Company,Monthly bill,120.00,Utilities,Auto',
    '2024-11-03,Safeway,Weekly groceries,250.00,Groceries,Credit',
    '2024-11-04,Restaurant,Dinner out,85.00,Dining Out,Credit',
    '2024-11-05,Insurance Co,Car insurance,200.00,Insurance,Auto',
    '2024-11-06,Gas Station,Fill up,60.00,Gas,Credit',
    '2024-11-07,Auto Shop,Oil change,75.00,Vehicle Maintenance,Credit',
    '2024-11-08,Cinema,Movie tickets,30.00,Entertainment,Credit',
    '2024-11-09,Netflix,Monthly subscription,15.99,Subscriptions,Credit',
    '2024-11-10,Ski Resort,Day pass,120.00,Recreation Activities,Credit',
    '2024-11-11,Pet Store,Dog food,45.00,Pet Care,Credit',
    '2024-11-12,Doctor,Medical checkup,150.00,Tax - Medical,Credit',
    '2024-11-13,Charity,Donation,100.00,Tax - Donation,Credit',
    '2024-11-14,Store,Miscellaneous,25.00,Other,Cash'
  ].join('\n');

  fs.writeFileSync(TEST_CSV_PATH, validCSV);
  logTest('Created test CSV with all valid categories', true);

  // Create CSV with invalid categories
  const invalidCSVPath = path.join(TEST_CSV_DIR, 'test-invalid-categories.csv');
  const invalidCSV = [
    'date,place,notes,amount,type,method',
    '2024-11-01,Store,Test,50.00,Food,Credit',
    '2024-11-02,Store,Test,50.00,InvalidCategory,Credit',
    '2024-11-03,Store,Test,50.00,Random,Credit'
  ].join('\n');

  fs.writeFileSync(invalidCSVPath, invalidCSV);
  logTest('Created test CSV with invalid categories', true);

  // Create CSV with legacy categories (should work)
  const legacyCSVPath = path.join(TEST_CSV_DIR, 'test-legacy-categories.csv');
  const legacyCSV = [
    'date,place,notes,amount,type,method',
    '2024-11-01,Gas Station,Fill up,60.00,Gas,Credit',
    '2024-11-02,Doctor,Visit,150.00,Tax - Medical,Credit',
    '2024-11-03,Charity,Donation,100.00,Tax - Donation,Credit',
    '2024-11-04,Store,Misc,25.00,Other,Cash'
  ].join('\n');

  fs.writeFileSync(legacyCSVPath, legacyCSV);
  logTest('Created test CSV with legacy categories', true);
}

function validateCSVCategories() {
  console.log('\n=== Validating CSV Categories ===');

  // Read and validate the test CSV
  const csvContent = fs.readFileSync(TEST_CSV_PATH, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',');
  const typeIndex = headers.indexOf('type');

  if (typeIndex === -1) {
    logTest('CSV has type column', false, 'Type column not found');
    return;
  }

  logTest('CSV has type column', true);

  // Validate each row
  let validRows = 0;
  let invalidRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const category = values[typeIndex];

    if (CATEGORIES.includes(category)) {
      validRows++;
    } else {
      invalidRows++;
      console.log(`  Invalid category on line ${i + 1}: "${category}"`);
    }
  }

  logTest(`All categories in valid CSV are valid (${validRows} rows)`, invalidRows === 0,
    `Found ${invalidRows} invalid categories`);

  // Test invalid CSV
  const invalidCSVPath = path.join(TEST_CSV_DIR, 'test-invalid-categories.csv');
  const invalidContent = fs.readFileSync(invalidCSVPath, 'utf-8');
  const invalidLines = invalidContent.split('\n').filter(line => line.trim());

  let foundInvalidCategories = 0;
  for (let i = 1; i < invalidLines.length; i++) {
    const values = invalidLines[i].split(',');
    const category = values[typeIndex];

    if (!CATEGORIES.includes(category)) {
      foundInvalidCategories++;
    }
  }

  logTest('Invalid CSV contains invalid categories', foundInvalidCategories > 0,
    `Found ${foundInvalidCategories} invalid categories`);

  // Test legacy CSV
  const legacyCSVPath = path.join(TEST_CSV_DIR, 'test-legacy-categories.csv');
  const legacyContent = fs.readFileSync(legacyCSVPath, 'utf-8');
  const legacyLines = legacyContent.split('\n').filter(line => line.trim());

  let validLegacyRows = 0;
  for (let i = 1; i < legacyLines.length; i++) {
    const values = legacyLines[i].split(',');
    const category = values[typeIndex];

    if (CATEGORIES.includes(category)) {
      validLegacyRows++;
    }
  }

  logTest('All legacy categories are still valid', validLegacyRows === legacyLines.length - 1,
    `${validLegacyRows} of ${legacyLines.length - 1} rows valid`);
}

function testCategoryList() {
  console.log('\n=== Testing Category List ===');

  // Verify all expected categories are present
  const expectedCategories = [
    'Housing', 'Utilities', 'Groceries', 'Dining Out', 'Insurance',
    'Gas', 'Vehicle Maintenance', 'Entertainment', 'Subscriptions',
    'Recreation Activities', 'Pet Care', 'Tax - Medical', 'Tax - Donation', 'Other'
  ];

  const allPresent = expectedCategories.every(cat => CATEGORIES.includes(cat));
  logTest('All expected categories are present', allPresent);

  // Verify "Food" is not in the list
  const foodNotPresent = !CATEGORIES.includes('Food');
  logTest('"Food" category is not in the list', foodNotPresent);

  // Verify correct count
  const correctCount = CATEGORIES.length === 14;
  logTest('Category list has exactly 14 categories', correctCount,
    `Expected 14, got ${CATEGORIES.length}`);

  // Display all categories
  console.log('\nAll Categories:');
  CATEGORIES.forEach((cat, index) => {
    console.log(`  ${index + 1}. ${cat}`);
  });
}

function testCSVDocumentation() {
  console.log('\n=== Testing CSV Documentation ===');

  // Check if sample CSV exists
  const sampleCSVPath = path.join(TEST_CSV_DIR, 'sample-import.csv');
  const sampleExists = fs.existsSync(sampleCSVPath);
  logTest('Sample CSV file exists', sampleExists);

  if (sampleExists) {
    const content = fs.readFileSync(sampleCSVPath, 'utf-8');
    
    // Check if it contains examples of new categories
    const hasNewCategories = CATEGORIES.some(cat => 
      cat !== 'Gas' && 
      cat !== 'Tax - Medical' && 
      cat !== 'Tax - Donation' && 
      cat !== 'Other' && 
      content.includes(cat)
    );

    logTest('Sample CSV includes new categories', hasNewCategories);
  }

  // Check README
  const readmePath = path.join(TEST_CSV_DIR, 'README.md');
  const readmeExists = fs.existsSync(readmePath);
  logTest('CSV README exists', readmeExists);

  if (readmeExists) {
    const content = fs.readFileSync(readmePath, 'utf-8');
    
    // Check if it mentions the new categories
    const mentionsNewCategories = content.includes('Housing') || 
                                   content.includes('Groceries') ||
                                   content.includes('Dining Out');

    logTest('README mentions new categories', mentionsNewCategories);
  }
}

function cleanup() {
  console.log('\n=== Cleaning Up Test Files ===');

  const testFiles = [
    'test-expanded-categories.csv',
    'test-invalid-categories.csv',
    'test-legacy-categories.csv'
  ];

  testFiles.forEach(file => {
    const filePath = path.join(TEST_CSV_DIR, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`  Removed ${file}`);
    }
  });
}

// Main test runner
function runTests() {
  console.log('=================================================');
  console.log('CSV Import Integration Test: Expanded Categories');
  console.log('=================================================');

  try {
    createTestCSV();
    validateCSVCategories();
    testCategoryList();
    testCSVDocumentation();

    console.log('\n=================================================');
    console.log('Test Results Summary');
    console.log('=================================================');
    console.log(`Total Tests: ${results.passed + results.failed}`);
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
    
    if (results.failed > 0) {
      console.log('\nFailed Tests:');
      results.tests.filter(t => !t.passed).forEach(t => {
        console.log(`  ✗ ${t.name}: ${t.message}`);
      });
    }

    console.log('\n=================================================\n');

  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  } finally {
    cleanup();
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests();
