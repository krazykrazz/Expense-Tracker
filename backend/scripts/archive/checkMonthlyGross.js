const { getDatabase } = require('../database/db');

async function checkMonthlyGross() {
  try {
    const db = await getDatabase();

    // Check monthly_gross records
    const monthlyGrossRecords = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM monthly_gross ORDER BY year, month', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    console.log('=== monthly_gross Records ===');
    if (monthlyGrossRecords.length > 0) {
      console.table(monthlyGrossRecords);
    } else {
      console.log('No records found in monthly_gross table');
    }

    // Check income_sources records
    const incomeSourcesRecords = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM income_sources ORDER BY year, month', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    console.log('\n=== income_sources Records ===');
    if (incomeSourcesRecords.length > 0) {
      console.table(incomeSourcesRecords);
    } else {
      console.log('No records found in income_sources table');
    }

    db.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkMonthlyGross();
