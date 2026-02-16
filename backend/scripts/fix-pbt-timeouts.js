/**
 * Script to fix PBT test timeouts and options
 * Replaces pbtOptions with dbPbtOptions and adds Jest timeouts
 */

const fs = require('fs');
const path = require('path');

const filesToFix = [
  'backend/services/paymentMethodService.balance.pbt.test.js',
  'backend/services/paymentMethodService.creditCard.pbt.test.js',
  'backend/services/paymentMethodService.lifecycle.pbt.test.js',
  'backend/services/paymentMethodService.validation.pbt.test.js',
  'backend/services/merchantAnalyticsService.filtering.pbt.test.js',
  'backend/services/merchantAnalyticsService.statistics.pbt.test.js',
  'backend/services/merchantAnalyticsService.trends.pbt.test.js',
  'backend/services/expenseService.financial.pbt.test.js',
  'backend/services/expenseService.people.pbt.test.js',
  'backend/services/expenseService.validation.pbt.test.js',
  'backend/services/expenseService.integrity.pbt.test.js'
];

filesToFix.forEach(filePath => {
  const fullPath = path.join(__dirname, '..', '..', filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`Skipping ${filePath} - file not found`);
    return;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;
  
  // 1. Add dbPbtOptions to imports if not already there
  if (content.includes('const { pbtOptions }') && !content.includes('dbPbtOptions')) {
    content = content.replace(
      /const \{ pbtOptions \}/g,
      'const { pbtOptions, dbPbtOptions }'
    );
    modified = true;
  }
  
  // 2. Replace pbtOptions({ with dbPbtOptions({ for database tests
  const pbtOptionsMatches = content.match(/pbtOptions\(\{[^}]*\}\)/g);
  if (pbtOptionsMatches) {
    content = content.replace(/pbtOptions\(\{/g, 'dbPbtOptions({');
    modified = true;
  }
  
  // 3. Add Jest timeout to tests that don't have one
  // Match: test('...', async () => { ... }, TIMEOUT);
  // If no timeout, add }, 120000);
  content = content.replace(
    /(\s+\);\s+\}\);)/g,
    (match) => {
      // Check if the next characters are already a timeout
      return match;
    }
  );
  
  // Better approach: find test blocks and add timeout if missing
  const testRegex = /(test\([^,]+,\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\);)(\s*\}\);)/g;
  content = content.replace(testRegex, (match, testBlock, ending) => {
    // Check if there's already a timeout (number after the test block)
    if (/\}\),\s*\d+\);/.test(match)) {
      return match; // Already has timeout
    }
    // Add timeout
    return testBlock + ', 120000' + ending;
  });
  
  if (modified || content !== fs.readFileSync(fullPath, 'utf8')) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✓ Fixed ${filePath}`);
  } else {
    console.log(`- No changes needed for ${filePath}`);
  }
});

console.log('\nDone!');
