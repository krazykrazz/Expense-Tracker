const sqlite3 = require('sqlite3').verbose();
const { getDatabasePath } = require('../config/paths');

const db = new sqlite3.Database(getDatabasePath());

db.serialize(() => {
  db.get('SELECT COUNT(*) as c FROM expenses', (e, r) => console.log('Total expenses:', r.c));
  db.get('SELECT COUNT(*) as c FROM people', (e, r) => console.log('People:', r.c));
  db.get('SELECT COUNT(*) as c FROM expenses WHERE insurance_eligible = 1', (e, r) => console.log('Insurance eligible:', r.c));
  db.all('SELECT claim_status, COUNT(*) as c FROM expenses WHERE insurance_eligible = 1 GROUP BY claim_status', (e, r) => {
    console.log('By claim status:');
    r.forEach(row => console.log('  ', row.claim_status || 'null', ':', row.c));
  });
  db.all('SELECT type, COUNT(*) as c FROM expenses GROUP BY type ORDER BY c DESC', (e, r) => {
    console.log('By type:');
    r.forEach(row => console.log('  ', row.type, ':', row.c));
    db.close();
  });
});
