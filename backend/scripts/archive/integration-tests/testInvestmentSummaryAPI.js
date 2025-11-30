/**
 * Test script to verify investment data is returned via the summary API endpoint
 * This simulates what the frontend will receive
 */

const http = require('http');

// Helper function to make HTTP requests
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    
    req.end();
  });
}

async function testInvestmentSummaryAPI() {
  console.log('Testing Investment Summary API Integration...\n');
  
  const baseUrl = 'localhost';
  const port = 2424;
  
  try {
    // 1. Create a test investment via API
    console.log('1. Creating test investment via API...');
    const createResponse = await makeRequest({
      hostname: baseUrl,
      port: port,
      path: '/api/investments',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, {
      name: 'API Test RRSP',
      type: 'RRSP',
      initial_value: 25000
    });
    
    if (createResponse.status !== 201) {
      throw new Error(`Failed to create investment: ${createResponse.status}`);
    }
    
    const createdInvestment = createResponse.data;
    console.log('   Created investment:', createdInvestment);
    
    // 2. Get summary via API
    console.log('\n2. Fetching summary via API...');
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    
    const summaryResponse = await makeRequest({
      hostname: baseUrl,
      port: port,
      path: `/api/expenses/summary?year=${year}&month=${month}`,
      method: 'GET'
    });
    
    if (summaryResponse.status !== 200) {
      throw new Error(`Failed to get summary: ${summaryResponse.status}`);
    }
    
    const summary = summaryResponse.data;
    console.log('   Summary received successfully');
    
    // 3. Verify investment data in summary
    console.log('\n3. Verifying investment data in summary:');
    console.log('   - Has investments property:', summary.hasOwnProperty('investments'));
    console.log('   - Has totalInvestmentValue property:', summary.hasOwnProperty('totalInvestmentValue'));
    console.log('   - Number of investments:', summary.investments ? summary.investments.length : 0);
    console.log('   - Total investment value:', summary.totalInvestmentValue);
    
    // 4. Verify our test investment is in the summary
    const foundInvestment = summary.investments.find(inv => inv.id === createdInvestment.id);
    console.log('\n4. Test investment found in summary:', foundInvestment ? 'YES' : 'NO');
    if (foundInvestment) {
      console.log('   - Name:', foundInvestment.name);
      console.log('   - Type:', foundInvestment.type);
      console.log('   - Current Value:', foundInvestment.currentValue);
    }
    
    // 5. Test with includePrevious parameter
    console.log('\n5. Testing summary with includePrevious=true...');
    const summaryWithPreviousResponse = await makeRequest({
      hostname: baseUrl,
      port: port,
      path: `/api/expenses/summary?year=${year}&month=${month}&includePrevious=true`,
      method: 'GET'
    });
    
    if (summaryWithPreviousResponse.status !== 200) {
      throw new Error(`Failed to get summary with previous: ${summaryWithPreviousResponse.status}`);
    }
    
    const summaryWithPrevious = summaryWithPreviousResponse.data;
    console.log('   - Has current property:', summaryWithPrevious.hasOwnProperty('current'));
    console.log('   - Has previous property:', summaryWithPrevious.hasOwnProperty('previous'));
    console.log('   - Current has investments:', summaryWithPrevious.current?.hasOwnProperty('investments'));
    console.log('   - Previous has investments:', summaryWithPrevious.previous?.hasOwnProperty('investments'));
    console.log('   - Current totalInvestmentValue:', summaryWithPrevious.current?.totalInvestmentValue);
    console.log('   - Previous totalInvestmentValue:', summaryWithPrevious.previous?.totalInvestmentValue);
    
    // 6. Clean up - delete test investment
    console.log('\n6. Cleaning up test investment...');
    const deleteResponse = await makeRequest({
      hostname: baseUrl,
      port: port,
      path: `/api/investments/${createdInvestment.id}`,
      method: 'DELETE'
    });
    
    if (deleteResponse.status !== 200) {
      console.warn('   Warning: Failed to delete test investment');
    } else {
      console.log('   Test investment deleted');
    }
    
    console.log('\n✅ API integration test completed successfully!');
    return true;
    
  } catch (error) {
    console.error('\n❌ API integration test failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Check if server is running
console.log('Checking if server is running on port 2424...');
const checkServer = http.get('http://localhost:2424/api/health', (res) => {
  if (res.statusCode === 200) {
    console.log('Server is running. Starting tests...\n');
    testInvestmentSummaryAPI()
      .then(success => {
        process.exit(success ? 0 : 1);
      })
      .catch(error => {
        console.error('Unexpected error:', error);
        process.exit(1);
      });
  } else {
    console.error('Server returned status:', res.statusCode);
    console.error('Please start the server with: npm start');
    process.exit(1);
  }
});

checkServer.on('error', (error) => {
  console.error('❌ Server is not running on port 2424');
  console.error('Please start the server with: npm start');
  process.exit(1);
});
