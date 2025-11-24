try {
  console.log('About to require...');
  const script = require('./scripts/expandCategories');
  console.log('Script loaded successfully');
  console.log('Exports:', Object.keys(script));
} catch (err) {
  console.error('Error loading script:', err.message);
  console.error(err.stack);
}
