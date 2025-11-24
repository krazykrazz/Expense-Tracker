const http = require('http');

function testAPI(place) {
  return new Promise((resolve, reject) => {
    const encodedPlace = encodeURIComponent(place);
    const options = {
      hostname: 'localhost',
      port: 2626,
      path: `/api/expenses/suggest-category?place=${encodedPlace}`,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({ status: res.statusCode, data: result });
        } catch (error) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function runTests() {
  console.log('Testing Category Suggestion API Endpoint\n');
  console.log('==========================================\n');
  console.log('Make sure the backend server is running on port 2626\n');

  try {
    // Test 1: Valid place with history
    console.log('Test 1: GET /api/expenses/suggest-category?place=Walmart');
    const result1 = await testAPI('Walmart');
    console.log(`Status: ${result1.status}`);
    console.log('Response:', JSON.stringify(result1.data, null, 2));
    console.log('');

    // Test 2: Place without history
    console.log('Test 2: GET /api/expenses/suggest-category?place=NewPlace123');
    const result2 = await testAPI('NewPlace123');
    console.log(`Status: ${result2.status}`);
    console.log('Response:', JSON.stringify(result2.data, null, 2));
    console.log('');

    // Test 3: Missing place parameter
    console.log('Test 3: GET /api/expenses/suggest-category (no place parameter)');
    try {
      const result3 = await testAPI('');
      console.log(`Status: ${result3.status}`);
      console.log('Response:', JSON.stringify(result3.data, null, 2));
    } catch (error) {
      console.log('Error (expected):', error.message);
    }
    console.log('');

    console.log('All API tests completed!');
  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\nError: Could not connect to backend server.');
      console.error('Please start the backend server with: cd backend && npm start');
    }
  }
}

runTests();
