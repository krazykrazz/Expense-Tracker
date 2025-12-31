const { initializeDatabase } = require('../database/db');
const { seedTestData } = require('./seedTestData');

async function initAndSeed() {
  try {
    console.log('🔧 Initializing database...');
    const db = await initializeDatabase();
    console.log('✅ Database initialized successfully');
    
    // Close the initialization connection
    db.close();
    
    console.log('🌱 Seeding test data...');
    await seedTestData();
    
    console.log('🎉 Database initialization and seeding completed!');
  } catch (error) {
    console.error('❌ Error during initialization and seeding:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  initAndSeed();
}

module.exports = { initAndSeed };