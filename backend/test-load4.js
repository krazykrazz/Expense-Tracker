const fs = require('fs');
try {
  const script = require('./scripts/expandCategories');
  fs.writeFileSync('load-result.txt', 'Success: ' + JSON.stringify(Object.keys(script)));
} catch (err) {
  fs.writeFileSync('load-result.txt', 'Error: ' + err.message + '\n' + err.stack);
}
