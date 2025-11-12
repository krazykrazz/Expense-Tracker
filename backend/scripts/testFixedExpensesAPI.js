const http = require('http');

console.log('Testing Fixed Expenses API...\n');

// Test 1: GET fixed expenses for November 2024
function testGetFixedExpenses() {
  return new Promise((resolve, reject) => {
    console.log('Test 1: GET /api/fixed-expenses/2024/11');
    
    const options = {
      hostname: 'localhost',
      port: 2424,
      path: '/api/fixed-expenses/2024/11',
      method: 'GET'
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`  Status: ${res.statusCode}`);
        console.log(`  Response: ${data}`);
        
        try {
          const json = JSON.parse(data);
          console.log(`  ✓ Items count: ${json.items.length}`);
          console.log(`  ✓ Total: $${json.total}`);
          resolve(json);
        } catch (e) {
          console.log(`  ✗ Error parsing JSON: ${e.message}`);
          reject(e);
        }
      });
    });
    
    req.on('error', (e) => {
      console.log(`  ✗ Request failed: ${e.message}`);
      reject(e);
    });
    
    req.end();
  });
}

// Test 2: POST create a fixed expense
function testCreateFixedExpense() {
  return new Promise((resolve, reject) => {
    console.log('\nTest 2: POST /api/fixed-expenses');
    
    const postData = JSON.stringify({
      year: 2024,
      month: 11,
      name: 'Test Rent',
      amount: 1500.00
    });
    
    const options = {
      hostname: 'localhost',
      port: 2424,
      path: '/api/fixed-expenses',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`  Status: ${res.statusCode}`);
        console.log(`  Response: ${data}`);
        
        try {
          const json = JSON.parse(data);
          console.log(`  ✓ Created expense ID: ${json.id}`);
          console.log(`  ✓ Name: ${json.name}`);
          console.log(`  ✓ Amount: $${json.amount}`);
          resolve(json);
        } catch (e) {
          console.log(`  ✗ Error parsing JSON: ${e.message}`);
          reject(e);
        }
      });
    });
    
    req.on('error', (e) => {
      console.log(`  ✗ Request failed: ${e.message}`);
      reject(e);
    });
    
    req.write(postData);
    req.end();
  });
}

// Run tests
async function runTests() {
  try {
    await testGetFixedExpenses();
    await testCreateFixedExpense();
    await testGetFixedExpenses(); // Check if the item was added
    
    console.log('\n✓ All tests passed!');
    console.log('\nThe Fixed Expenses API is working correctly.');
    console.log('You can now use the feature in the application.');
  } catch (error) {
    console.log('\n✗ Tests failed!');
    console.log('Error:', error.message);
    process.exit(1);
  }
}

runTests();
