const sqlite3 = require('sqlite3').verbose();
const { getDatabasePath } = require('../config/paths');

const dbPath = getDatabasePath();

// Medical providers for Tax - Medical expenses
const medicalProviders = [
  'Dr. Smith Family Practice', 'City Hospital', 'Dental Care Plus', 'Vision Center',
  'Physical Therapy Associates', 'Urgent Care Clinic', 'Pharmacy Plus', 'Lab Corp',
  'Mental Health Services', 'Dermatology Clinic', 'Orthopedic Specialists',
  'Pediatric Care Center', 'Womens Health Clinic', 'Cardiology Associates'
];

// Charity organizations for Tax - Donation
const charities = [
  'Red Cross', 'United Way', 'Salvation Army', 'Local Food Bank', 'Habitat for Humanity',
  'Cancer Research Foundation', 'Heart Association', 'Children\'s Hospital Foundation'
];

// Regular places
const regularPlaces = [
  'Walmart', 'Target', 'Costco', 'Amazon', 'Starbucks', 'McDonald\'s',
  'Home Depot', 'Best Buy', 'Shell Gas Station', 'Safeway', 'Whole Foods',
  'Chipotle', 'Panera Bread', 'Olive Garden', 'Netflix', 'Spotify'
];

const paymentMethods = ['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];

// Family members for medical expense tracking
const familyMembers = [
  { name: 'John Smith', date_of_birth: '1985-03-15' },
  { name: 'Jane Smith', date_of_birth: '1987-07-22' },
  { name: 'Tommy Smith', date_of_birth: '2015-11-08' },
  { name: 'Sarah Smith', date_of_birth: '2018-04-30' }
];

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getWeekNumber(dateString) {
  const date = new Date(dateString);
  return Math.ceil(date.getDate() / 7);
}

function getRandomDate(monthsBack = 12) {
  const now = new Date();
  const past = new Date();
  past.setMonth(now.getMonth() - monthsBack);
  const randomTime = past.getTime() + Math.random() * (now.getTime() - past.getTime());
  return new Date(randomTime).toISOString().split('T')[0];
}

async function seedInsuranceTestData() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      console.log('Connected to SQLite database at:', dbPath);
    });

    db.serialize(() => {
      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON');

      // 1. Insert family members (people)
      console.log('\n📋 Creating family members...');
      familyMembers.forEach(person => {
        db.run('INSERT OR IGNORE INTO people (name, date_of_birth) VALUES (?, ?)', 
          [person.name, person.date_of_birth]);
      });

      // Get person IDs after a small delay to ensure inserts complete
      setTimeout(() => {
        db.all('SELECT id, name FROM people', (err, people) => {
          if (err) {
            console.error('Error getting people:', err);
            reject(err);
            return;
          }
          
          console.log(`   Created/found ${people.length} family members`);
          const personMap = {};
          people.forEach(p => personMap[p.name] = p.id);
          const personIds = Object.values(personMap);

          // 2. Create medical expenses with insurance tracking
          console.log('\n🏥 Creating medical expenses with insurance data...');
          
          const claimStatuses = ['not_claimed', 'in_progress', 'paid', 'denied'];
          let insertedMedical = 0;
          
          // Create 20 medical expenses with various insurance statuses
          for (let i = 0; i < 20; i++) {
            const date = getRandomDate(12);
            const originalCost = parseFloat((Math.random() * 400 + 50).toFixed(2));
            const insuranceEligible = Math.random() > 0.2 ? 1 : 0;
            
            let claimStatus = null;
            let amount = originalCost;
            
            if (insuranceEligible) {
              claimStatus = getRandomItem(claimStatuses);
              if (claimStatus === 'paid') {
                const coverage = Math.random() * 0.7 + 0.2;
                amount = parseFloat((originalCost * (1 - coverage)).toFixed(2));
              }
            }
            
            const personId = getRandomItem(personIds);
            const notes = `Medical visit - ${['checkup', 'treatment', 'prescription', 'lab work', 'specialist'][Math.floor(Math.random() * 5)]}`;
            
            db.run(`
              INSERT INTO expenses (date, place, notes, amount, type, week, method, insurance_eligible, claim_status, original_cost)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [date, getRandomItem(medicalProviders), notes, amount, 'Tax - Medical', 
                getWeekNumber(date), getRandomItem(paymentMethods), insuranceEligible, claimStatus, originalCost],
              function(err) {
                if (!err && this.lastID) {
                  insertedMedical++;
                  db.run('INSERT INTO expense_people (expense_id, person_id, amount, original_amount) VALUES (?, ?, ?, ?)',
                    [this.lastID, personId, amount, originalCost]);
                }
              }
            );
          }

          // 3. Create donation expenses
          console.log('\n💝 Creating donation expenses...');
          for (let i = 0; i < 8; i++) {
            const date = getRandomDate(12);
            const amount = parseFloat((Math.random() * 200 + 25).toFixed(2));
            db.run(`
              INSERT INTO expenses (date, place, notes, amount, type, week, method, insurance_eligible, claim_status, original_cost)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL)
            `, [date, getRandomItem(charities), 'Charitable donation', amount, 'Tax - Donation', 
                getWeekNumber(date), getRandomItem(paymentMethods)]);
          }

          // 4. Create regular expenses
          console.log('\n🛒 Creating regular expenses...');
          const regularCategories = ['Groceries', 'Dining Out', 'Gas', 'Entertainment', 'Clothing', 'Utilities'];
          for (let i = 0; i < 30; i++) {
            const date = getRandomDate(6);
            const category = getRandomItem(regularCategories);
            const amount = parseFloat((Math.random() * 100 + 10).toFixed(2));
            db.run(`
              INSERT INTO expenses (date, place, notes, amount, type, week, method, insurance_eligible, claim_status, original_cost)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL)
            `, [date, getRandomItem(regularPlaces), `${category} purchase`, amount, category,
                getWeekNumber(date), getRandomItem(paymentMethods)]);
          }

          // 5. Add income sources
          console.log('\n💰 Creating income sources...');
          const now = new Date();
          for (let i = 0; i < 6; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            db.run('INSERT OR REPLACE INTO income_sources (year, month, name, amount, category) VALUES (?, ?, ?, ?, ?)',
              [d.getFullYear(), d.getMonth() + 1, 'Primary Salary', 5500.00, 'Salary']);
            db.run('INSERT OR REPLACE INTO income_sources (year, month, name, amount, category) VALUES (?, ?, ?, ?, ?)',
              [d.getFullYear(), d.getMonth() + 1, 'Side Income', 800.00, 'Other']);
          }

          // 6. Add fixed expenses
          console.log('\n📅 Creating fixed expenses...');
          for (let i = 0; i < 6; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            db.run('INSERT OR REPLACE INTO fixed_expenses (year, month, name, amount, category, payment_type) VALUES (?, ?, ?, ?, ?, ?)',
              [d.getFullYear(), d.getMonth() + 1, 'Rent', 1500.00, 'Housing', 'Auto-Pay']);
            db.run('INSERT OR REPLACE INTO fixed_expenses (year, month, name, amount, category, payment_type) VALUES (?, ?, ?, ?, ?, ?)',
              [d.getFullYear(), d.getMonth() + 1, 'Health Insurance', 350.00, 'Insurance', 'Auto-Pay']);
            db.run('INSERT OR REPLACE INTO fixed_expenses (year, month, name, amount, category, payment_type) VALUES (?, ?, ?, ?, ?, ?)',
              [d.getFullYear(), d.getMonth() + 1, 'Internet', 80.00, 'Utilities', 'Credit Card']);
            db.run('INSERT OR REPLACE INTO fixed_expenses (year, month, name, amount, category, payment_type) VALUES (?, ?, ?, ?, ?, ?)',
              [d.getFullYear(), d.getMonth() + 1, 'Phone', 75.00, 'Utilities', 'Credit Card']);
          }

          // 7. Add budgets
          console.log('\n📊 Creating budgets...');
          const budgetCategories = {
            'Groceries': 600, 'Dining Out': 300, 'Gas': 200, 'Entertainment': 150,
            'Clothing': 200, 'Personal Care': 100
          };
          
          for (let i = 0; i < 3; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            Object.entries(budgetCategories).forEach(([cat, limit]) => {
              db.run('INSERT OR REPLACE INTO budgets (year, month, category, "limit") VALUES (?, ?, ?, ?)',
                [d.getFullYear(), d.getMonth() + 1, cat, limit]);
            });
          }

          // Wait for all inserts to complete
          setTimeout(() => {
            console.log('\n✅ Test data seeding complete!');
            console.log('\n📋 Summary:');
            console.log('   - Family members: 4');
            console.log('   - Medical expenses (with insurance): ~20');
            console.log('   - Donation expenses: 8');
            console.log('   - Regular expenses: 30');
            console.log('   - Income sources: 6 months');
            console.log('   - Fixed expenses: 6 months');
            console.log('   - Budgets: 3 months');

            db.close((err) => {
              if (err) reject(err);
              else resolve();
            });
          }, 500);
        });
      }, 100);
    });
  });
}

if (require.main === module) {
  seedInsuranceTestData()
    .then(() => {
      console.log('\n🚀 Ready to test! Open http://localhost:5173');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}

module.exports = { seedInsuranceTestData };
