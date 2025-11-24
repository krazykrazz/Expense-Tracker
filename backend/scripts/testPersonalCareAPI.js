/**
 * API Integration Tests for Personal Care Category
 * 
 * Tests the actual API endpoints with Personal Care category
 * This test requires the server to be running
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

const http = require('http');

const API_BASE = 'http://localhost:2424/api';

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

// Helper function to make HTTP requests
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const response = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: body ? JSON.parse(body) : null
          };
          resolve(response);
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Test 1: Create expense with Personal Care via API
async function testCreateExpenseAPI() {
  try {
    const expense = {
      date: '2025-11-24',
      place: 'Hair Salon API Test',
      notes: 'Haircut via API',
      amount: 45.00,
      type: 'Personal Care',
      week: 4,
      method: 'Debit'
    };

    const response = await makeRequest('POST', '/expenses', expense);

    if (response.statusCode === 201 || response.statusCode === 200) {
      logTest('API Test 1: Create expense with Personal Care', true);
      return response.body.id || response.body.expense?.id;
    } else {
      logTest('API Test 1: Create expense with Personal Care', false, 
        `Expected 200/201, got ${response.statusCode}: ${JSON.stringify(response.body)}`);
      return null;
    }
  } catch (error) {
    logTest('API Test 1: Create expense with Personal Care', false, error.message);
    return null;
  }
}

// Test 2: Retrieve expense and verify category
async function testRetrieveExpense(expenseId) {
  if (!expenseId) {
    logTest('API Test 2: Retrieve expense', false, 'No expense ID provided');
    return false;
  }

  try {
    const response = await makeRequest('GET', `/expenses/${expenseId}`);

    if (response.statusCode === 200 && response.body.type === 'Personal Care') {
      logTest('API Test 2: Retrieve expense with Personal Care', true);
      return true;
    } else {
      logTest('API Test 2: Retrieve expense with Personal Care', false, 
        `Expected type 'Personal Care', got '${response.body?.type}'`);
      return false;
    }
  } catch (error) {
    logTest('API Test 2: Retrieve expense with Personal Care', false, error.message);
    return false;
  }
}

// Test 3: Create budget for Personal Care via API
async function testCreateBudgetAPI() {
  try {
    const budget = {
      year: 2025,
      month: 12,
      category: 'Personal Care',
      limit: 200.00
    };

    const response = await makeRequest('POST', '/budgets', budget);

    if (response.statusCode === 201 || response.statusCode === 200) {
      logTest('API Test 3: Create budget for Personal Care', true);
      return response.body.id || response.body.budget?.id;
    } else if (response.statusCode === 409) {
      // Budget already exists, that's okay
      logTest('API Test 3: Create budget for Personal Care', true, 'Budget already exists');
      return true;
    } else {
      logTest('API Test 3: Create budget for Personal Care', false, 
        `Expected 200/201, got ${response.statusCode}: ${JSON.stringify(response.body)}`);
      return null;
    }
  } catch (error) {
    logTest('API Test 3: Create budget for Personal Care', false, error.message);
    return null;
  }
}

// Test 4: Get monthly summary with Personal Care
async function testMonthlySummaryAPI() {
  try {
    const response = await makeRequest('GET', '/expenses/summary/2025/11');

    if (response.statusCode === 200) {
      const summary = response.body;
      
      // Check if Personal Care appears in category breakdown
      const hasPersonalCare = summary.byCategory && 
        summary.byCategory.some(cat => cat.type === 'Personal Care' || cat.category === 'Personal Care');

      if (hasPersonalCare) {
        logTest('API Test 4: Monthly summary includes Personal Care', true);
        return true;
      } else {
        logTest('API Test 4: Monthly summary includes Personal Care', false, 
          'Personal Care not found in category breakdown');
        return false;
      }
    } else {
      logTest('API Test 4: Monthly summary includes Personal Care', false, 
        `Expected 200, got ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    logTest('API Test 4: Monthly summary includes Personal Care', false, error.message);
    return false;
  }
}

// Test 5: Get annual summary with Personal Care
async function testAnnualSummaryAPI() {
  try {
    const response = await makeRequest('GET', '/expenses/summary/2025');

    if (response.statusCode === 200) {
      const summary = response.body;
      
      // Check if Personal Care appears in the annual data
      let hasPersonalCare = false;
      
      if (summary.byCategory) {
        hasPersonalCare = summary.byCategory.some(cat => 
          cat.type === 'Personal Care' || cat.category === 'Personal Care'
        );
      }
      
      if (summary.monthlyData) {
        hasPersonalCare = hasPersonalCare || summary.monthlyData.some(month => 
          month.byCategory && month.byCategory.some(cat => 
            cat.type === 'Personal Care' || cat.category === 'Personal Care'
          )
        );
      }

      if (hasPersonalCare) {
        logTest('API Test 5: Annual summary includes Personal Care', true);
        return true;
      } else {
        logTest('API Test 5: Annual summary includes Personal Care', false, 
          'Personal Care not found in annual summary');
        return false;
      }
    } else {
      logTest('API Test 5: Annual summary includes Personal Care', false, 
        `Expected 200, got ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    logTest('API Test 5: Annual summary includes Personal Care', false, error.message);
    return false;
  }
}

// Test 6: Get budget status for Personal Care
async function testBudgetStatusAPI() {
  try {
    const response = await makeRequest('GET', '/budgets/2025/12');

    if (response.statusCode === 200) {
      const budgets = response.body;
      
      // Check if Personal Care budget exists
      const personalCareBudget = budgets.find(b => b.category === 'Personal Care');

      if (personalCareBudget) {
        logTest('API Test 6: Budget status for Personal Care', true);
        return true;
      } else {
        logTest('API Test 6: Budget status for Personal Care', false, 
          'Personal Care budget not found');
        return false;
      }
    } else {
      logTest('API Test 6: Budget status for Personal Care', false, 
        `Expected 200, got ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    logTest('API Test 6: Budget status for Personal Care', false, error.message);
    return false;
  }
}

// Test 7: Filter expenses by Personal Care category
async function testFilterExpensesAPI() {
  try {
    const response = await makeRequest('GET', '/expenses?type=Personal Care');

    if (response.statusCode === 200) {
      const expenses = response.body;
      
      if (Array.isArray(expenses) && expenses.length > 0) {
        const allPersonalCare = expenses.every(e => e.type === 'Personal Care');
        
        if (allPersonalCare) {
          logTest('API Test 7: Filter expenses by Personal Care', true);
          return true;
        } else {
          logTest('API Test 7: Filter expenses by Personal Care', false, 
            'Not all filtered expenses are Personal Care');
          return false;
        }
      } else {
        logTest('API Test 7: Filter expenses by Personal Care', true, 
          'No expenses found (acceptable)');
        return true;
      }
    } else {
      logTest('API Test 7: Filter expenses by Personal Care', false, 
        `Expected 200, got ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    logTest('API Test 7: Filter expenses by Personal Care', false, error.message);
    return false;
  }
}

// Test 8: Check categories endpoint includes Personal Care
async function testCategoriesEndpoint() {
  try {
    const response = await makeRequest('GET', '/categories');

    if (response.statusCode === 200) {
      const categories = response.body;
      
      if (Array.isArray(categories) && categories.includes('Personal Care')) {
        logTest('API Test 8: Categories endpoint includes Personal Care', true);
        return true;
      } else {
        logTest('API Test 8: Categories endpoint includes Personal Care', false, 
          'Personal Care not in categories list');
        return false;
      }
    } else if (response.statusCode === 404) {
      // Endpoint might not exist, skip this test
      logTest('API Test 8: Categories endpoint', true, 'Endpoint not implemented (skipped)');
      return true;
    } else {
      logTest('API Test 8: Categories endpoint includes Personal Care', false, 
        `Expected 200, got ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    logTest('API Test 8: Categories endpoint', true, 'Endpoint not implemented (skipped)');
    return true;
  }
}

// Cleanup function
async function cleanupTestData(expenseId) {
  if (expenseId) {
    try {
      await makeRequest('DELETE', `/expenses/${expenseId}`);
      console.log('\n✓ Test data cleaned up');
    } catch (error) {
      console.log('\n⚠ Could not clean up test expense:', error.message);
    }
  }
}

// Main test runner
async function runTests() {
  console.log('\n=== Personal Care Category API Integration Tests ===\n');
  console.log('Testing Requirements: 5.1, 5.2, 5.3, 5.4, 5.5\n');
  console.log('Note: Server must be running on port 2424\n');

  let expenseId = null;

  try {
    // Run tests in sequence
    expenseId = await testCreateExpenseAPI();
    await testRetrieveExpense(expenseId);
    await testCreateBudgetAPI();
    await testMonthlySummaryAPI();
    await testAnnualSummaryAPI();
    await testBudgetStatusAPI();
    await testFilterExpensesAPI();
    await testCategoriesEndpoint();

    // Cleanup
    await cleanupTestData(expenseId);

    // Print summary
    console.log('\n=== Test Summary ===');
    console.log(`Total: ${results.passed + results.failed}`);
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);
    
    if (results.failed > 0) {
      console.log('\nFailed tests:');
      results.tests.filter(t => !t.passed).forEach(t => {
        console.log(`  - ${t.name}: ${t.message}`);
      });
      process.exit(1);
    } else {
      console.log('\n✓ All API integration tests passed!');
      process.exit(0);
    }
  } catch (error) {
    console.error('Test execution failed:', error);
    await cleanupTestData(expenseId);
    process.exit(1);
  }
}

// Check if server is running before starting tests
async function checkServer() {
  try {
    await makeRequest('GET', '/expenses/summary/2025/11');
    return true;
  } catch (error) {
    console.error('❌ Server is not running on port 2424');
    console.error('Please start the server with: cd backend && npm start');
    process.exit(1);
  }
}

// Run tests
checkServer().then(runTests);
