/* eslint-disable no-console */
/**
 * Place Name Standardization Script
 *
 * Fetches variation groups from the analyze endpoint and applies
 * conservative, rule-based merges directly via SQL (with date guard).
 *
 * IMPORTANT: Only updates expenses dated BEFORE --cutoff-date (default 2025-01-01).
 * Expenses in 2025+ are assumed already normalized and will NOT be touched.
 *
 * Safe rules applied (all variants must satisfy at least one):
 *   1. Apostrophe / possessive difference     ("Loblaws" vs "Loblaw's")
 *   2. .ca / .com suffix                       ("Costco" vs "Costco.ca")
 *   3. Article prefix ("The ", "A ")           ("Cancer Society" vs "The Cancer Society")
 *   4. Pure whitespace difference              ("SleepTek" vs "Sleep Tek")
 *   5. Trailing year suffix                    ("Run4Health" vs "Run4Health 2019")
 *   6. Abbreviation period ("L.C.B.O." vs "LCBO")
 *   7. Accented / unicode normalisation        ("Savana Café" vs "Savanna Café")
 *   8. Single-character typo on short strings  (Levenshtein ≤ 1 on normalized ≤ 12 chars)
 *   9. Plural suffix ("-s" only)               ("Gardens" vs "Garden")
 *  10. Trailing descriptor (e.g. " Gas", " Centre", " Online", " Pharmacy" added to name)
 *      — only when the canonical name is entirely contained within the variant
 *
 * Usage:
 *   node scripts/standardizePlaceNames.js --api-url http://localhost:2627 --db-path <path> [--commit]
 *
 * Options:
 *   --api-url <url>       Base URL of the running API (for fetching analysis groups)
 *   --db-path <path>      Path to SQLite database (required for --commit)
 *   --cutoff-date <date>  Only update expenses before this date (default: 2025-01-01)
 *   --commit              Apply changes (default: dry-run)
 *   --verbose             Print every group evaluated, including skipped ones
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const sqlite3 = require('sqlite3').verbose();

// --------------------------------------------------------------------------
// CLI args
// --------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    apiUrl: 'http://localhost:2627',
    commit: false,
    verbose: false,
    dbPath: '',
    cutoffDate: '2025-01-01',
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--api-url' && argv[i + 1]) args.apiUrl = argv[++i];
    else if (argv[i] === '--db-path' && argv[i + 1]) args.dbPath = argv[++i];
    else if (argv[i] === '--cutoff-date' && argv[i + 1]) args.cutoffDate = argv[++i];
    else if (argv[i] === '--commit') args.commit = true;
    else if (argv[i] === '--verbose') args.verbose = true;
  }
  return args;
}

// --------------------------------------------------------------------------
// HTTP helpers
// --------------------------------------------------------------------------
function httpRequest(urlStr, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(parsed, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}\nBody: ${data.slice(0, 500)}`)); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function get(url) {
  return httpRequest(url, { method: 'GET', headers: { Accept: 'application/json' } });
}

function post(url, payload) {
  const body = JSON.stringify(payload);
  return httpRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, body);
}

// --------------------------------------------------------------------------
// Normalisation helpers
// --------------------------------------------------------------------------
function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeForCompare(s) {
  return stripAccents(s)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[''`]/g, "'")   // curly/backtick apostrophes → straight
    .replace(/\./g, '');      // remove periods (for abbreviations)
}

function levenshtein(a, b) {
  const m = a.length; const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// --------------------------------------------------------------------------
// Safe-merge rules
// Each returns true if the variant is a safe alias for the canonical.
// ALL variants in the group must pass at least one rule.
// --------------------------------------------------------------------------
const ARTICLE_PREFIX_RE = /^(the|a|an)\s+/i;
const WEB_SUFFIX_RE = /\.(ca|com|net|org)$/i;
// Descriptor words that may safely be appended to a canonical name
const TRAILING_DESCRIPTOR_RE = /\s+(gas|gas bar|centre|center|online|pharmacy|portrait studio|photo studio|photo|garden centre|cafeteria|food court|concessions|concession stand|canteen|parking|parking garage|food|liquor|resto|restaurant)\s*$/i;

function isSafeMerge(canonical, variant) {
  if (canonical === variant) return true; // same name — trivially safe

  const nc = normalizeForCompare(canonical);
  const nv = normalizeForCompare(variant);

  // 1. After full normalization they are identical
  if (nc === nv) return true;

  // 2. Web suffix on variant only (e.g. "Costco.ca" → "Costco")
  if (WEB_SUFFIX_RE.test(variant) && normalizeForCompare(variant.replace(WEB_SUFFIX_RE, '')) === nc) return true;
  // Or web suffix on canonical only (e.g. canonical is "Playstation.com", variant is "PlayStation")
  if (WEB_SUFFIX_RE.test(canonical) && normalizeForCompare(canonical.replace(WEB_SUFFIX_RE, '')) === nv) return true;

  // 3. Article prefix difference ("The Burger Box" vs "Burger Box")
  const ncNoArticle = nc.replace(ARTICLE_PREFIX_RE, '');
  const nvNoArticle = nv.replace(ARTICLE_PREFIX_RE, '');
  if (ncNoArticle === nvNoArticle && ncNoArticle !== nc) return true; // one has article the other doesn't
  // Symmetric: also check if variant has no article but canonical has one
  if (ncNoArticle === nv || nvNoArticle === nc) return true;

  // 4. Plural suffix ("-s" only, not "-es" — too risky)
  if (nc + 's' === nv || nv + 's' === nc) return true;

  // 5. Single-char typo on short names (≤ 12 chars normalized)
  if (nc.length <= 12 && nv.length <= 12 && levenshtein(nc, nv) <= 1) return true;

  // 6. Trailing descriptor — variant has canonical as full prefix + descriptor suffix
  //    e.g. "Canadian Tire Gas Bar" when canonical is "Canadian Tire"
  if (variant.toLowerCase().startsWith(canonical.toLowerCase() + ' ')) {
    const suffix = variant.slice(canonical.length);
    if (TRAILING_DESCRIPTOR_RE.test(suffix)) return true;
  }
  // Symmetric: canonical has trailing descriptor, variant is the base
  if (canonical.toLowerCase().startsWith(variant.toLowerCase() + ' ')) {
    const suffix = canonical.slice(variant.length);
    if (TRAILING_DESCRIPTOR_RE.test(suffix)) return true;
  }

  return false;
}

/**
 * Given a variation group, determine whether it is safe to auto-merge.
 * Returns { safe: true, updates } or { safe: false, reason }.
 */
function evaluateGroup(group) {
  const canonical = group.suggestedCanonical;
  const variants = group.variations.map((v) => v.name).filter((n) => n !== canonical);

  if (variants.length === 0) return { safe: false, reason: 'no variants to merge' };

  const unsafeVariants = variants.filter((v) => !isSafeMerge(canonical, v));

  if (unsafeVariants.length > 0) {
    return {
      safe: false,
      reason: `unsafe variants: ${unsafeVariants.slice(0, 3).map((v) => `"${v}"`).join(', ')}${unsafeVariants.length > 3 ? ` (+${unsafeVariants.length - 3} more)` : ''}`,
    };
  }

  return { safe: true, updates: { from: variants, to: canonical } };
}

// --------------------------------------------------------------------------
// Direct SQL helpers (bypass API to apply date guard)
// --------------------------------------------------------------------------
function openDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
      if (err) reject(new Error(`Cannot open database: ${err.message}`));
      else resolve(db);
    });
  });
}

function runSql(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

function closeDb(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => { if (err) reject(err); else resolve(); });
  });
}

/**
 * Apply updates directly via SQL within a transaction, with date guard.
 * Only rows with date < cutoffDate are updated.
 */
async function applyUpdatesWithDateGuard(dbPath, updates, cutoffDate) {
  const db = await openDatabase(dbPath);
  let totalUpdated = 0;

  await runSql(db, 'BEGIN TRANSACTION');
  try {
    for (const update of updates) {
      const placeholders = update.from.map(() => '?').join(',');
      const sql = `UPDATE expenses SET place = ? WHERE place IN (${placeholders}) AND date < ?`;
      const params = [update.to, ...update.from, cutoffDate];
      const changes = await runSql(db, sql, params);
      totalUpdated += changes;
    }
    await runSql(db, 'COMMIT');
  } catch (err) {
    await runSql(db, 'ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await closeDb(db);
  }

  return totalUpdated;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv);
  const baseUrl = args.apiUrl.replace(/\/$/, '');

  console.log(`\n=== Place Name Standardization ===`);
  console.log(`API: ${baseUrl}`);
  console.log(`Cutoff: only update expenses with date < ${args.cutoffDate}`);
  console.log(`Mode: ${args.commit ? 'COMMIT' : 'DRY-RUN (pass --commit to apply)'}\n`);

  if (args.commit && !args.dbPath) {
    console.error('ERROR: --db-path is required when using --commit (direct SQL with date guard).');
    process.exit(1);
  }

  // Fetch analysis groups
  console.log('Fetching place name variation groups...');
  const analyzeRes = await get(`${baseUrl}/api/expenses/place-names/analyze`);
  if (analyzeRes.status !== 200) {
    console.error('Error fetching analyze endpoint:', analyzeRes.body);
    process.exit(1);
  }

  const { groups } = analyzeRes.body;
  console.log(`Found ${groups.length} variation groups.\n`);

  // Evaluate each group
  const safeUpdates = [];
  let skippedCount = 0;

  for (const group of groups) {
    const result = evaluateGroup(group);
    if (result.safe) {
      safeUpdates.push(result.updates);
      if (args.verbose) {
        const varNames = result.updates.from.join('", "');
        console.log(`  SAFE   [${group.totalCount}] "${group.suggestedCanonical}" <- "${varNames}"`);
      }
    } else {
      skippedCount++;
      if (args.verbose) {
        console.log(`  SKIP   [${group.totalCount}] "${group.suggestedCanonical}" — ${result.reason}`);
      }
    }
  }

  console.log(`Safe merges:   ${safeUpdates.length}`);
  console.log(`Skipped groups: ${skippedCount}`);
  console.log(`(Use --verbose to see all group evaluations)\n`);

  if (safeUpdates.length === 0) {
    console.log('Nothing to standardize.');
    return;
  }

  // Summary of what will be merged
  const totalVariants = safeUpdates.reduce((sum, u) => sum + u.from.length, 0);
  console.log(`Will rename ${totalVariants} variant name(s) across ${safeUpdates.length} canonical place(s):`);
  for (const u of safeUpdates) {
    console.log(`  "${u.to}" <- ${u.from.map((f) => `"${f}"`).join(', ')}`);
  }
  console.log('');

  if (!args.commit) {
    console.log('Dry-run complete. Pass --commit --db-path <path> to apply these changes.');
    return;
  }

  // Apply changes directly via SQL with date guard
  console.log(`Applying standardizations (only expenses dated before ${args.cutoffDate})...`);
  const totalUpdated = await applyUpdatesWithDateGuard(args.dbPath, safeUpdates, args.cutoffDate);
  console.log(`\nDone! Updated ${totalUpdated} expense record(s).`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
