// Simple wrapper to run the migration
const { migrate } = require('./expandCategories');

console.log('Starting migration wrapper...');

migrate().then(() => {
  console.log('Migration wrapper complete');
}).catch((err) => {
  console.error('Migration wrapper error:', err);
  process.exit(1);
});
