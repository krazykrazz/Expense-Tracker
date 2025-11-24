const fs = require('fs');
const script = require('./scripts/expandCategories');
fs.writeFileSync('exports-debug.txt', JSON.stringify(Object.keys(script), null, 2));
console.log('Written to exports-debug.txt');
