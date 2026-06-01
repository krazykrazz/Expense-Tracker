/* eslint-disable no-console */
/**
 * Post-import category resolution: resolves "Other" categories using 2025+ dominant category per place.
 * 
 * Usage: node scripts/resolveLegacyCategories.js --db-path <path> [--threshold 0.75] [--commit]
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const args = process.argv.slice(2);
const dbPath = args.includes('--db-path') ? args[args.indexOf('--db-path') + 1] : null;
const threshold = args.includes('--threshold') ? parseFloat(args[args.indexOf('--threshold') + 1]) : 0.75;
const commit = args.includes('--commit');

if (!dbPath) {
  console.error('Usage: node scripts/resolveLegacyCategories.js --db-path <path> [--threshold 0.75] [--commit]');
  process.exit(1);
}

const resolvedPath = path.resolve(__dirname, '..', dbPath);
console.log(`DB: ${resolvedPath}`);
console.log(`Threshold: ${threshold * 100}%`);
console.log(`Mode: ${commit ? 'COMMIT' : 'DRY-RUN (pass --commit to apply)'}`);
console.log('');

const db = new sqlite3.Database(resolvedPath);

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows || []); });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { if (err) reject(err); else resolve(this.changes); });
  });
}

async function main() {
  // Get 2025+ category distribution per place (excluding "Other")
  const modernCategories = await dbAll(
    `SELECT place, type, COUNT(*) as cnt
     FROM expenses
     WHERE date >= '2025-01-01' AND type != 'Other'
     GROUP BY place, type
     ORDER BY place, cnt DESC`
  );

  // Build map: place -> dominant category (if >= threshold)
  const byPlace = {};
  for (const row of modernCategories) {
    if (!byPlace[row.place]) byPlace[row.place] = [];
    byPlace[row.place].push({ type: row.type, cnt: row.cnt });
  }

  const updates = [];
  for (const [place, cats] of Object.entries(byPlace)) {
    const total = cats.reduce((s, c) => s + c.cnt, 0);
    const ratio = cats[0].cnt / total;
    if (ratio >= threshold) {
      updates.push({ place, category: cats[0].type, ratio });
    }
  }

  // Check how many "Other" rows each place has
  const otherCounts = await dbAll(
    `SELECT place, COUNT(*) as cnt
     FROM expenses
     WHERE type = 'Other' AND date < '2025-01-01'
     GROUP BY place`
  );
  const otherMap = new Map(otherCounts.map(r => [r.place, r.cnt]));

  // Filter to only places that actually have "Other" rows
  const applicable = updates.filter(u => otherMap.has(u.place));
  applicable.sort((a, b) => (otherMap.get(b.place) || 0) - (otherMap.get(a.place) || 0));

  console.log(`Places with dominant category (>= ${threshold * 100}%): ${updates.length}`);
  console.log(`Places with "Other" rows to resolve: ${applicable.length}`);
  console.log('');

  let totalRows = 0;
  for (const u of applicable) {
    const cnt = otherMap.get(u.place) || 0;
    totalRows += cnt;
    console.log(`  ${u.place}: Other(${cnt}) -> ${u.category} (${(u.ratio * 100).toFixed(0)}% dominant)`);
  }
  console.log('');
  console.log(`Total "Other" rows to resolve: ${totalRows}`);

  if (!commit) {
    console.log('\nDry run complete. Pass --commit to apply changes.');
    db.close();
    return;
  }

  console.log('\nApplying updates...');
  await dbRun('BEGIN TRANSACTION');
  let resolved = 0;
  for (const { place, category } of applicable) {
    const changes = await dbRun(
      `UPDATE expenses SET type = ? WHERE place = ? AND type = 'Other' AND date < '2025-01-01'`,
      [category, place]
    );
    resolved += changes;
  }
  await dbRun('COMMIT');
  console.log(`Done. Resolved ${resolved} "Other" rows to their 2025+ dominant category.`);
  db.close();
}

main().catch(err => {
  console.error('Error:', err);
  db.close();
  process.exit(1);
});
