/**
 * Jest Global Setup
 *
 * This file runs ONCE before all test suites.
 * It points the backend's file I/O at a throwaway config tree so tests can never
 * read, overwrite or pollute the real database, invoices or statements.
 */

const fs = require('fs');
const path = require('path');

// Tests used to share backend/config with real data. Two problems came from that:
// suites running with SKIP_TEST_DB wrote to the developer's database, and invoice
// files leaked whenever a run crashed before its cleanup. Leaked files compounded —
// every performBackup() copies the whole invoices tree, so ~1000 strays took a backup
// from 15ms to 1100ms, which pushed the suite past its timeout, which leaked more.
const TEST_CONFIG_DIR = path.join(__dirname, '.test-config');

const TEST_SUBDIRS = [
  'database',
  'backups',
  'config',
  'invoices',
  path.join('invoices', 'temp'),
  'statements'
];

module.exports = async () => {
  // Wiping up front rather than on teardown keeps artifacts available for debugging
  // a failed run while still guaranteeing every run starts clean.
  fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
  for (const dir of TEST_SUBDIRS) {
    fs.mkdirSync(path.join(TEST_CONFIG_DIR, dir), { recursive: true });
  }

  // Read by config/paths.js. Jest workers are forked after this hook, so they inherit it.
  process.env.CONFIG_DIR = TEST_CONFIG_DIR;

  console.log(`\n✓ Isolated test config directory: ${path.relative(__dirname, TEST_CONFIG_DIR)}`);
};
