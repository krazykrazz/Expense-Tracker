const { getDatabase } = require('../database/db');

/**
 * Get all unique place names with their counts
 * @returns {Promise<Array>} Array of {place: string, count: number}
 */
async function getAllPlaceNames() {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    const query = `
      SELECT place, COUNT(*) as count
      FROM expenses
      WHERE place IS NOT NULL AND place != ''
      GROUP BY place
      ORDER BY count DESC
    `;

    db.all(query, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

/**
 * Update place names from variations to canonical name with transaction support
 * @param {Array<string>} fromNames - Array of place name variations to update
 * @param {string} toName - Canonical name to update to
 * @returns {Promise<number>} Number of rows updated
 */
async function updatePlaceNames(fromNames, toName) {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    // Create placeholders for the IN clause
    const placeholders = fromNames.map(() => '?').join(',');
    
    const query = `
      UPDATE expenses
      SET place = ?
      WHERE place IN (${placeholders})
    `;

    const params = [toName, ...fromNames];

    db.run(query, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes);
      }
    });
  });
}

/**
 * Update multiple place name groups in a single transaction
 * @param {Array<Object>} updates - Array of {from: string[], to: string} objects
 * @returns {Promise<number>} Total number of rows updated
 */
async function updatePlaceNamesTransaction(updates) {
  const db = await getDatabase();
  
  return new Promise((resolve, reject) => {
    let totalUpdated = 0;
    
    // Begin transaction
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          reject(err);
          return;
        }
      });
      
      // Process each update
      let completed = 0;
      let hasError = false;
      
      updates.forEach((update) => {
        if (hasError) return;
        
        const placeholders = update.from.map(() => '?').join(',');
        const query = `
          UPDATE expenses
          SET place = ?
          WHERE place IN (${placeholders})
        `;
        const params = [update.to, ...update.from];
        
        db.run(query, params, function(err) {
          if (err) {
            hasError = true;
            // Rollback on error
            db.run('ROLLBACK', () => {
              reject(new Error(`Transaction failed: ${err.message}`));
            });
            return;
          }
          
          totalUpdated += this.changes;
          completed++;
          
          // If all updates completed successfully, commit
          if (completed === updates.length && !hasError) {
            db.run('COMMIT', (err) => {
              if (err) {
                db.run('ROLLBACK', () => {
                  reject(new Error(`Commit failed: ${err.message}`));
                });
              } else {
                resolve(totalUpdated);
              }
            });
          }
        });
      });
      
      // Handle empty updates array
      if (updates.length === 0) {
        db.run('COMMIT', (err) => {
          if (err) {
            db.run('ROLLBACK', () => {
              reject(new Error(`Commit failed: ${err.message}`));
            });
          } else {
            resolve(0);
          }
        });
      }
    });
  });
}

module.exports = {
  getAllPlaceNames,
  updatePlaceNames,
  updatePlaceNamesTransaction
};
