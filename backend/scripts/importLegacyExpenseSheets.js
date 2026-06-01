/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const XLSX = require('xlsx');
const { getDatabase, initializeDatabase } = require('../database/db');
const { CATEGORIES, normalizeCategory } = require('../utils/categories');
const { calculateWeek } = require('../utils/dateUtils');

const VALID_CATEGORIES = new Set(CATEGORIES);
const DEFAULT_CATEGORY = 'Other';
const DEFAULT_METHOD = 'Debit';
const LEGACY_FIXED_EXPENSE_NAME = 'Legacy Fixed Expenses (Imported)';
const LEGACY_UNKNOWN_PLACE = 'Unknown Merchant (Legacy Import)';
const LEGACY_MONTHLY_INCOME_NAME = 'Legacy Monthly Gross (Imported)';

const METHOD_ALIAS_MAP = {
  // User-provided legacy mappings
  comc: 'Capital One Mastercard',
  bmomc: 'BMO MC',
  visa: 'RBC VISA',
  amex: 'AMEX',
};

const LEGACY_INACTIVE_METHODS = [
  { display_name: 'Capital One Mastercard', full_name: 'Capital One Mastercard (Legacy)', type: 'credit_card' },
  { display_name: 'BMO MC', full_name: 'BMO Mastercard (Legacy)', type: 'credit_card' },
  { display_name: 'AMEX', full_name: 'American Express (Legacy)', type: 'credit_card' },
];

const MONTH_MAP = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function parseArgs(argv) {
  const args = {
    source: '',
    dryRun: true,
    defaultMethod: DEFAULT_METHOD,
    defaultCategory: DEFAULT_CATEGORY,
    skipDedupe: false,
    verbose: false,
    limitFiles: null,
    dbPath: '',
    reportFile: '',
    reportAll: false,
    importMonthlySummary: true,
    ensureLegacyMethods: true,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--source' && argv[i + 1]) {
      args.source = argv[++i];
      continue;
    }

    if (arg === '--commit') {
      args.dryRun = false;
      continue;
    }

    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (arg === '--default-method' && argv[i + 1]) {
      args.defaultMethod = argv[++i].trim() || DEFAULT_METHOD;
      continue;
    }

    if (arg === '--default-category' && argv[i + 1]) {
      args.defaultCategory = argv[++i].trim() || DEFAULT_CATEGORY;
      continue;
    }

    if (arg === '--skip-dedupe') {
      args.skipDedupe = true;
      continue;
    }

    if (arg === '--verbose') {
      args.verbose = true;
      continue;
    }

    if (arg === '--limit-files' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[++i], 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        args.limitFiles = parsed;
      }
      continue;
    }

    if (arg === '--db-path' && argv[i + 1]) {
      args.dbPath = argv[++i];
      continue;
    }

    if (arg === '--report-file' && argv[i + 1]) {
      args.reportFile = argv[++i];
      continue;
    }

    if (arg === '--report-all') {
      args.reportAll = true;
      continue;
    }

    if (arg === '--no-monthly-summary') {
      args.importMonthlySummary = false;
      continue;
    }

    if (arg === '--no-ensure-legacy-methods') {
      args.ensureLegacyMethods = false;
      continue;
    }

    if (!arg.startsWith('--') && !args.source) {
      args.source = arg;
      continue;
    }
  }

  return args;
}

function usage() {
  console.log('Usage: node scripts/importLegacyExpenseSheets.js --source "C:\\path\\to\\legacy" [--commit] [--verbose]');
  console.log('');
  console.log('Options:');
  console.log('  --source <dir>         Directory containing .xls/.xlsx files (required)');
  console.log('  --dry-run              Preview only, no inserts (default)');
  console.log('  --commit               Insert rows into database');
  console.log('  --default-method <m>   Fallback payment method (default: Debit)');
  console.log('  --default-category <c> Fallback category (default: Other)');
  console.log('  --skip-dedupe          Do not skip already-existing matching rows');
  console.log('  --limit-files <n>      Process only first n files (for testing)');
  console.log('  --db-path <file>       Explicit SQLite DB path (use staging/prod restore)');
  console.log('  --report-file <file>   CSV report output path');
  console.log('  --report-all           Include all imported rows in CSV report');
  console.log('  --no-monthly-summary   Skip monthly gross/fixed expense summary import');
  console.log('  --no-ensure-legacy-methods  Skip creating inactive legacy methods');
  console.log('  --verbose              Print skip details as they happen');
}

function timestampForFilename() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${y}${m}${day}-${hh}${mm}${ss}`;
}

function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function listWorkbookFiles(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listWorkbookFiles(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (ext === '.xls' || ext === '.xlsx' || ext === '.xlsm') {
      files.push(fullPath);
    }
  }

  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function isLikelySummarySheet(sheetName) {
  const name = (sheetName || '').toLowerCase();
  return name.includes('summary') || name === 'sheet1';
}

function getSheetYearHint(sheetName, rows) {
  const sheet = sheetName || '';
  const monthYearMatch = sheet.match(/([A-Za-z]{3,9})(\d{2})$/);
  if (monthYearMatch) {
    const yy = Number.parseInt(monthYearMatch[2], 10);
    if (!Number.isNaN(yy)) {
      return yy <= 69 ? 2000 + yy : 1900 + yy;
    }
  }

  if (rows.length > 0 && Array.isArray(rows[0]) && rows[0].length > 0 && typeof rows[0][0] === 'string') {
    const m = rows[0][0].match(/(19|20)\d{2}/);
    if (m) return Number.parseInt(m[0], 10);
  }

  return null;
}

function findHeaderRowIndex(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    const normalized = row.map((cell) => String(cell || '').trim().toLowerCase());

    const hasDate = normalized.includes('date');
    const hasPlace = normalized.includes('place');
    const hasAmount = normalized.includes('amount');
    if (hasDate && hasPlace && hasAmount) {
      return i;
    }
  }

  return -1;
}

function resolveSheetColumns(headerRow) {
  const normalized = (Array.isArray(headerRow) ? headerRow : []).map((cell) => String(cell || '').trim().toLowerCase());

  const indexOf = (name) => {
    const idx = normalized.indexOf(name);
    return idx >= 0 ? idx : null;
  };

  const columns = {
    date: indexOf('date'),
    place: indexOf('place'),
    amount: indexOf('amount'),
    notes: indexOf('notes'),
    type: indexOf('type'),
    week: indexOf('week'),
    method: indexOf('method'),
  };

  if (columns.date === null) columns.date = 0;
  if (columns.place === null) columns.place = 1;
  if (columns.amount === null) columns.amount = 2;
  if (columns.notes === null) columns.notes = 3;

  const coreIndexes = [columns.date, columns.place, columns.amount, columns.notes, columns.type, columns.week, columns.method]
    .filter((idx) => typeof idx === 'number');

  const maxExpenseCol = coreIndexes.length > 0 ? Math.max(...coreIndexes) : 3;

  return {
    ...columns,
    maxExpenseCol,
  };
}

function parseCurrencyLikeAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;

  const raw = String(value).trim();
  if (!raw) return null;

  const parenNegative = raw.startsWith('(') && raw.endsWith(')');
  const cleaned = raw
    .replace(/[$,\s]/g, '')
    .replace(/[()]/g, '');
  const amount = Number.parseFloat(cleaned);
  if (Number.isNaN(amount)) return null;
  return parenNegative ? -amount : amount;
}

function toIsoDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateValue(value, sheetYearHint) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed || !parsed.y || !parsed.m || !parsed.d) return null;
    return toIsoDate(parsed.y, parsed.m, parsed.d);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashMatch) {
    const month = Number.parseInt(slashMatch[1], 10);
    const day = Number.parseInt(slashMatch[2], 10);
    let year = Number.parseInt(slashMatch[3], 10);

    if (year < 100) {
      year = year <= 69 ? 2000 + year : 1900 + year;
      if (sheetYearHint && Math.abs(year - sheetYearHint) > 1) {
        year = sheetYearHint;
      }
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return toIsoDate(year, month, day);
    }
  }

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return toIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  return null;
}

function parseMonthFromSheetName(sheetName) {
  const key = String(sheetName || '').replace(/\d+/g, '').trim().toLowerCase();
  return MONTH_MAP[key] || null;
}

function parseMonthFromTitle(rows) {
  if (!rows || !rows.length || !Array.isArray(rows[0]) || !rows[0].length) return null;
  const title = String(rows[0][0] || '').toLowerCase();
  for (const [name, month] of Object.entries(MONTH_MAP)) {
    if (title.startsWith(name)) {
      return month;
    }
  }
  return null;
}

function findNumericValueNearLabel(rows, labelRegex, maxRows = 6) {
  for (let r = 0; r < Math.min(rows.length, maxRows); r += 1) {
    const row = Array.isArray(rows[r]) ? rows[r] : [];
    for (let c = 0; c < row.length; c += 1) {
      const cell = String(row[c] || '').trim();
      if (!cell || !labelRegex.test(cell.toLowerCase())) continue;

      const near = [c + 1, c + 2, c - 1].filter((idx) => idx >= 0 && idx < row.length);
      for (const idx of near) {
        const amount = parseCurrencyLikeAmount(row[idx]);
        if (amount !== null && !Number.isNaN(amount) && amount > 0) {
          return Number.parseFloat(amount.toFixed(2));
        }
      }
    }
  }
  return null;
}

function extractMonthlySummary(rows, sheetName, sheetYearHint) {
  const year = sheetYearHint;
  const month = parseMonthFromSheetName(sheetName) || parseMonthFromTitle(rows);
  if (!year || !month) {
    return null;
  }

  const monthlyGross = findNumericValueNearLabel(rows, /monthly\s+gross/i);
  const fixedExpenses = findNumericValueNearLabel(rows, /fixed\s+expenses|\bexpenses\b/i);

  if (monthlyGross === null && fixedExpenses === null) {
    return null;
  }

  return {
    year,
    month,
    monthlyGross,
    fixedExpenses,
  };
}

function normalizeMethod(value, fallback) {
  const v = String(value || '').trim();
  if (!v) return fallback;
  return v;
}

function normalizeMethodKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isLikelyMethodNoise(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return true;
  if (!/[a-z]/i.test(raw)) return true;

  const noisePatterns = [
    /^week\s*\d+$/,
    /^total$/,
    /^remaining$/,
    /tax credit/,
    /overcharged/,
    /supposed to be/,
    /^\(-?\$?\d/,
  ];

  return noisePatterns.some((pattern) => pattern.test(raw));
}

function resolvePaymentMethod(rawMethod, paymentMethodMaps) {
  if (!paymentMethodMaps || !rawMethod) {
    return null;
  }

  const exact = paymentMethodMaps.byLower.get(rawMethod.toLowerCase());
  if (exact) {
    return { paymentMethod: exact, source: 'direct' };
  }

  const normalizedKey = normalizeMethodKey(rawMethod);
  const normalized = paymentMethodMaps.byKey.get(normalizedKey);
  if (normalized) {
    return { paymentMethod: normalized, source: 'normalized' };
  }

  const aliasTarget = METHOD_ALIAS_MAP[normalizedKey];
  if (aliasTarget) {
    const aliasExact = paymentMethodMaps.byLower.get(aliasTarget.toLowerCase());
    const aliasNormalized = paymentMethodMaps.byKey.get(normalizeMethodKey(aliasTarget));
    const aliasResolved = aliasExact || aliasNormalized;
    if (aliasResolved) {
      return { paymentMethod: aliasResolved, source: 'alias' };
    }

    // If a specific alias target does not exist, route legacy card aliases to generic Credit Card.
    const genericCreditCard = paymentMethodMaps.byLower.get('credit card');
    if (genericCreditCard) {
      return { paymentMethod: genericCreditCard, source: 'alias_fallback' };
    }
  }

  return null;
}

function normalizeCategoryValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = normalizeCategory(raw);
  if (VALID_CATEGORIES.has(normalized)) return normalized;
  return null;
}

function normalizePlaceForMatch(place) {
  return String(place || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Aggressive normalization that also strips spaces —
 * used as a secondary lookup key for cases like "Wal-Mart" vs "WalMart"
 */
function normalizePlaceCompact(place) {
  return String(place || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function chooseMostFrequentVariant(countMap) {
  const items = Array.from(countMap.entries());
  if (!items.length) return null;
  items.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  return items[0][0];
}

function daysBetweenIsoDates(a, b) {
  const da = new Date(`${a}T00:00:00Z`);
  const db = new Date(`${b}T00:00:00Z`);
  const diffMs = Math.abs(db.getTime() - da.getTime());
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function inferRowDates(rows, headerIndex, sheetYearHint) {
  const inferred = new Array(rows.length).fill(null);

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    inferred[i] = parseDateValue(row[0], sheetYearHint);
  }

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    if (inferred[i]) continue;

    let prev = null;
    for (let p = i - 1; p > headerIndex; p -= 1) {
      if (inferred[p]) {
        prev = inferred[p];
        break;
      }
    }

    let next = null;
    for (let n = i + 1; n < rows.length; n += 1) {
      if (inferred[n]) {
        next = inferred[n];
        break;
      }
    }

    if (prev && next) {
      if (prev === next) {
        inferred[i] = prev;
        continue;
      }
      const span = daysBetweenIsoDates(prev, next);
      if (span <= 7) {
        inferred[i] = prev;
        continue;
      }
      inferred[i] = prev;
      continue;
    }

    if (prev) {
      inferred[i] = prev;
      continue;
    }

    if (next) {
      inferred[i] = next;
    }
  }

  return inferred;
}

function findLastValidExpenseRowIndex(rows, headerIndex, sheetYearHint, columns) {
  let lastValid = headerIndex;

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    const date = parseDateValue(row[columns.date], sheetYearHint);
    const amount = parseCurrencyLikeAmount(row[columns.amount]);
    if (date && amount !== null && !Number.isNaN(amount) && amount > 0) {
      lastValid = i;
    }
  }

  return lastValid;
}

function tokenizePlace(place) {
  const stopWords = new Set([
    'the', 'and', 'for', 'inc', 'ltd', 'co', 'company', 'store', 'shop',
    'mart', 'canada', 'services', 'service', 'restaurant', 'cafe', 'bar',
  ]);

  return normalizePlaceForMatch(place)
    .split(' ')
    .filter((t) => t.length >= 3 && !stopWords.has(t));
}

function getCategoryByMaxCount(categoryCountMap) {
  const entries = Array.from(categoryCountMap.entries());
  const hasSpecificCategory = entries.some(([category]) => category !== 'Other');

  const candidates = hasSpecificCategory
    ? entries.filter(([category]) => category !== 'Other')
    : entries;

  let bestCategory = null;
  let bestCount = 0;
  for (const [category, count] of candidates) {
    if (count > bestCount) {
      bestCategory = category;
      bestCount = count;
    }
  }
  return bestCategory;
}

function buildTokenCategoryIndex(placeCategoryStats) {
  const tokenIndex = new Map();

  for (const [, stats] of placeCategoryStats.entries()) {
    const tokens = tokenizePlace(stats.place);
    const category = getCategoryByMaxCount(stats.categoryCounts);
    if (!category || tokens.length === 0) continue;

    for (const token of tokens) {
      if (!tokenIndex.has(token)) tokenIndex.set(token, new Map());
      const categoryCounts = tokenIndex.get(token);
      const prev = categoryCounts.get(category) || 0;
      categoryCounts.set(category, prev + stats.totalCount);
    }
  }

  return tokenIndex;
}

function getHistoricalCategory(place, placeCategoryStats, tokenCategoryIndex) {
  const normalized = normalizePlaceForMatch(place);
  if (!normalized) return null;

  const exact = placeCategoryStats.get(normalized);
  if (exact) {
    const category = getCategoryByMaxCount(exact.categoryCounts);
    if (category) {
      return {
        category,
        source: 'historical_exact',
      };
    }
  }

  const tokens = tokenizePlace(place);
  if (tokens.length === 0) return null;

  const aggregate = new Map();
  for (const token of tokens) {
    const counts = tokenCategoryIndex.get(token);
    if (!counts) continue;
    for (const [category, count] of counts.entries()) {
      aggregate.set(category, (aggregate.get(category) || 0) + count);
    }
  }

  if (aggregate.size === 0) return null;

  const category = getCategoryByMaxCount(aggregate);
  if (!category) return null;

  const totalVotes = Array.from(aggregate.values()).reduce((a, b) => a + b, 0);
  const winningVotes = aggregate.get(category) || 0;
  const confidence = totalVotes > 0 ? winningVotes / totalVotes : 0;

  if (confidence < 0.55) return null;

  return {
    category,
    source: 'historical_fuzzy',
  };
}

function inferCategory(place, notes, fallback) {
  const hay = `${String(place || '')} ${String(notes || '')}`.toLowerCase();

  if (/donation|charity/.test(hay)) return 'Tax - Donation';
  if (/medical|clinic|dental|orthodont|pharma|drug|prescription|braces|physio/.test(hay)) return 'Tax - Medical';
  if (/esso|shell|pioneer|ultramar|petro|gas\b|fuel/.test(hay)) return 'Gas';
  if (/loblaw|loblaws|sobey|independent|food basics|costco|grocery|groceries|loeb/.test(hay)) return 'Groceries';
  if (/pizza|pub|restaurant|tim hort|mcdonald|kfc|dairy queen|quizno|harvey|breakfast|lunch|dinner|supper|cafe/.test(hay)) return 'Dining Out';
  if (/rogers|bell|koodo|internet|phone|hydro|enbridge|utility|utilities/.test(hay)) return 'Utilities';
  if (/insurance/.test(hay)) return 'Insurance';
  return fallback;
}

function isTransactionNoiseRow(row, maxExpenseCol = null) {
  const relevant = typeof maxExpenseCol === 'number'
    ? row.slice(0, maxExpenseCol + 1)
    : row;

  const text = relevant
    .map((cell) => String(cell || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');

  if (!text) return true;
  if (text.includes('grand total')) return true;
  if (/\btotal\b/.test(text) && !text.includes('total gas -')) return true;
  if (text.includes('monthly gross')) return true;
  if (text.includes('fixed expenses') || text.includes('expenses')) return true;
  if (text.includes('remaining')) return true;

  return false;
}

function rowToExpense(row, context) {
  const columns = context.columns;
  const placeCell = String(row[columns.place] || '').trim();
  const date = context.inferredDate || parseDateValue(row[columns.date], context.sheetYearHint);
  const amount = parseCurrencyLikeAmount(row[columns.amount]);
  const notes = String(row[columns.notes] || '').trim();

  if (!date) {
    return { skip: true, reason: 'invalid_date' };
  }

  let place = placeCell || LEGACY_UNKNOWN_PLACE;

  if (context.placeCanonicalMap) {
    const { canonical, compact } = context.placeCanonicalMap;
    const compactKey = normalizePlaceCompact(place);
    const normalizedKey = normalizePlaceForMatch(place);

    // Priority 1: modern (2025+) compact match — source of truth
    const compactResolved = compact ? compact.get(compactKey) : null;
    if (compactResolved) {
      place = compactResolved;
    } else {
      // Priority 2: normal key lookup (may come from historical or legacy)
      const resolved = canonical.get(normalizedKey);
      if (resolved) {
        place = resolved;
      }
    }
  }

  if (amount === null || Number.isNaN(amount)) {
    return { skip: true, reason: 'invalid_amount' };
  }

  if (amount <= 0) {
    return { skip: true, reason: 'non_positive_amount' };
  }

  let category = normalizeCategoryValue(columns.type !== null ? row[columns.type] : null);
  let categorySource = 'sheet_type';

  if (!category && context.placeCategoryStats && context.tokenCategoryIndex) {
    const historical = getHistoricalCategory(place, context.placeCategoryStats, context.tokenCategoryIndex);
    if (historical) {
      category = historical.category;
      categorySource = historical.source;
    }
  }

  if (!category) {
    category = inferCategory(place, notes, context.defaultCategory);
    categorySource = category === context.defaultCategory ? 'default_category' : 'keyword_inference';
  }

  const rawMethodCell = columns.method !== null ? String(row[columns.method] || '').trim() : '';
  const methodCellIsNoise = rawMethodCell && isLikelyMethodNoise(rawMethodCell);
  const rawMethod = methodCellIsNoise ? context.defaultMethod : normalizeMethod(rawMethodCell, context.defaultMethod);

  let method = rawMethod;
  let paymentMethodId = null;
  let methodMatchSource = methodCellIsNoise ? 'noise_default' : 'unmatched';

  if (context.paymentMethodMaps) {
    const resolved = resolvePaymentMethod(rawMethod, context.paymentMethodMaps);
    if (resolved) {
      method = resolved.paymentMethod.display_name;
      paymentMethodId = resolved.paymentMethod.id;
      methodMatchSource = resolved.source;
    }
  }

  const expense = {
    date,
    posted_date: null,
    place,
    notes: notes || null,
    amount: Number.parseFloat(amount.toFixed(2)),
    type: category,
    week: calculateWeek(date),
    method,
    payment_method_id: paymentMethodId,
    insurance_eligible: 0,
    claim_status: null,
    original_cost: null,
    _category_source: categorySource,
    _method_source: methodMatchSource,
  };

  if (!VALID_CATEGORIES.has(expense.type)) {
    expense.type = context.defaultCategory;
    expense._category_source = 'default_category';
  }

  return { skip: false, expense };
}

function dbGet(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row || null);
    });
  });
}

function dbRun(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.lastID);
    });
  });
}

async function existsDuplicate(db, expense) {
  const sql = `
    SELECT id
    FROM expenses
    WHERE date = ?
      AND amount = ?
      AND COALESCE(place, '') = COALESCE(?, '')
      AND COALESCE(notes, '') = COALESCE(?, '')
      AND type = ?
      AND method = ?
    LIMIT 1
  `;
  const row = await dbGet(db, sql, [
    expense.date,
    expense.amount,
    expense.place,
    expense.notes,
    expense.type,
    expense.method,
  ]);
  return !!row;
}

async function insertExpense(db, expense) {
  const sql = `
    INSERT INTO expenses (
      date, posted_date, place, notes, amount, type, week, method,
      payment_method_id, insurance_eligible, claim_status, original_cost
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  return dbRun(db, sql, [
    expense.date,
    expense.posted_date,
    expense.place,
    expense.notes,
    expense.amount,
    expense.type,
    expense.week,
    expense.method,
    expense.payment_method_id,
    expense.insurance_eligible,
    expense.claim_status,
    expense.original_cost,
  ]);
}

function closeDb(db) {
  return new Promise((resolve) => {
    db.close(() => resolve());
  });
}

function openDbByPath(dbPath) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      db.run('PRAGMA foreign_keys = ON', (pragmaErr) => {
        if (pragmaErr) {
          reject(pragmaErr);
          return;
        }
        resolve(db);
      });
    });
  });
}

function createStats() {
  return {
    files: 0,
    sheets: 0,
    rowsRead: 0,
    inserted: 0,
    duplicates: 0,
    skipped: 0,
    skipReasons: {},
    categorySources: {},
    monthlyGrossUpserts: 0,
    fixedExpenseInserts: 0,
    monthlyIncomeInserts: 0,
    monthlyIncomeUpdates: 0,
    monthlyIncomeSkippedExisting: 0,
    legacyMethodsCreated: 0,
    methodMatched: 0,
    methodUnmatched: 0,
    methodSources: {},
    datesInferred: 0,
    missingPlaceFilled: 0,
    tailRowsSkipped: 0,
    reviewRows: [],
    errors: [],
  };
}

function addSkip(stats, reason) {
  stats.skipped += 1;
  stats.skipReasons[reason] = (stats.skipReasons[reason] || 0) + 1;
}

function addCategorySource(stats, source) {
  stats.categorySources[source] = (stats.categorySources[source] || 0) + 1;
}

function addMethodSource(stats, source) {
  stats.methodSources[source] = (stats.methodSources[source] || 0) + 1;
}

async function loadHistoricalPlaceCategoryStats(db) {
  const sql = `
    SELECT place, type, COUNT(*) AS cnt
    FROM expenses
    WHERE place IS NOT NULL
      AND TRIM(place) <> ''
      AND type IS NOT NULL
      AND TRIM(type) <> ''
    GROUP BY place, type
  `;

  const rows = await new Promise((resolve, reject) => {
    db.all(sql, [], (err, resultRows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(resultRows || []);
    });
  });

  const placeCategoryStats = new Map();
  for (const row of rows) {
    const normalizedPlace = normalizePlaceForMatch(row.place);
    if (!normalizedPlace) continue;

    const category = normalizeCategoryValue(row.type);
    if (!category) continue;

    if (!placeCategoryStats.has(normalizedPlace)) {
      placeCategoryStats.set(normalizedPlace, {
        place: normalizedPlace,
        totalCount: 0,
        categoryCounts: new Map(),
      });
    }

    const stat = placeCategoryStats.get(normalizedPlace);
    stat.totalCount += row.cnt;
    stat.categoryCounts.set(category, (stat.categoryCounts.get(category) || 0) + row.cnt);
  }

  const tokenCategoryIndex = buildTokenCategoryIndex(placeCategoryStats);

  return {
    placeCategoryStats,
    tokenCategoryIndex,
  };
}

async function loadProductionPlaceStats(db) {
  // Load 2025+ place names as the canonical "truth" source
  const modernRows = await new Promise((resolve, reject) => {
    db.all(
      `
        SELECT place, COUNT(*) AS cnt
        FROM expenses
        WHERE place IS NOT NULL AND TRIM(place) <> ''
          AND date >= '2025-01-01'
        GROUP BY place
      `,
      [],
      (err, resultRows) => {
        if (err) { reject(err); return; }
        resolve(resultRows || []);
      }
    );
  });

  // Also load all historical entries as fallback (for places not seen in 2025+)
  const allRows = await new Promise((resolve, reject) => {
    db.all(
      `
        SELECT place, COUNT(*) AS cnt
        FROM expenses
        WHERE place IS NOT NULL AND TRIM(place) <> ''
          AND date < '2025-01-01'
        GROUP BY place
      `,
      [],
      (err, resultRows) => {
        if (err) { reject(err); return; }
        resolve(resultRows || []);
      }
    );
  });

  // Build modern (2025+) map — these take priority
  const modernByNormalized = new Map();
  const modernByCompact = new Map();
  for (const row of modernRows) {
    const rawPlace = String(row.place || '').trim();
    const normalized = normalizePlaceForMatch(rawPlace);
    const compact = normalizePlaceCompact(rawPlace);
    if (!normalized) continue;
    if (!modernByNormalized.has(normalized)) modernByNormalized.set(normalized, new Map());
    modernByNormalized.get(normalized).set(rawPlace, (modernByNormalized.get(normalized).get(rawPlace) || 0) + row.cnt);
    if (compact) {
      if (!modernByCompact.has(compact)) modernByCompact.set(compact, new Map());
      modernByCompact.get(compact).set(rawPlace, (modernByCompact.get(compact).get(rawPlace) || 0) + row.cnt);
    }
  }

  // Build historical fallback map (pre-2025)
  const historicalByNormalized = new Map();
  for (const row of allRows) {
    const rawPlace = String(row.place || '').trim();
    const normalized = normalizePlaceForMatch(rawPlace);
    if (!normalized) continue;
    if (!historicalByNormalized.has(normalized)) historicalByNormalized.set(normalized, new Map());
    const countMap = historicalByNormalized.get(normalized);
    countMap.set(rawPlace, (countMap.get(rawPlace) || 0) + row.cnt);
  }

  return { modern: modernByNormalized, modernByCompact, historical: historicalByNormalized };
}

function scanLegacyPlaceUsage(workbookFiles) {
  const byNormalized = new Map();

  for (const workbookPath of workbookFiles) {
    const workbook = XLSX.readFile(workbookPath, { cellDates: false, raw: true });

    for (const sheetName of workbook.SheetNames) {
      if (isLikelySummarySheet(sheetName)) continue;
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: false,
      });

      const headerIndex = findHeaderRowIndex(rows);
      if (headerIndex < 0) continue;

      for (let i = headerIndex + 1; i < rows.length; i += 1) {
        const row = Array.isArray(rows[i]) ? rows[i] : [];
        if (isTransactionNoiseRow(row)) continue;
        const rawPlace = String(row[1] || '').trim();
        if (!rawPlace) continue;

        const normalized = normalizePlaceForMatch(rawPlace);
        if (!normalized) continue;

        if (!byNormalized.has(normalized)) byNormalized.set(normalized, new Map());
        const countMap = byNormalized.get(normalized);
        countMap.set(rawPlace, (countMap.get(rawPlace) || 0) + 1);
      }
    }
  }

  return byNormalized;
}

function buildCanonicalPlaceMap(prodPlaceStats, legacyPlaceStats) {
  const { modern, modernByCompact, historical } = prodPlaceStats;
  const canonicalMap = new Map();
  const compactCanonicalMap = new Map();
  const allKeys = new Set([...modern.keys(), ...historical.keys(), ...legacyPlaceStats.keys()]);

  for (const key of allKeys) {
    // Priority 1: 2025+ modern usage (source of truth)
    const modernVariants = modern.get(key);
    if (modernVariants && modernVariants.size > 0) {
      canonicalMap.set(key, chooseMostFrequentVariant(modernVariants));
      continue;
    }

    // Priority 2: pre-2025 production data (historical DB entries)
    const historicalVariants = historical.get(key);
    if (historicalVariants && historicalVariants.size > 0) {
      canonicalMap.set(key, chooseMostFrequentVariant(historicalVariants));
      continue;
    }

    // Priority 3: legacy spreadsheet usage
    const legacyVariants = legacyPlaceStats.get(key);
    if (legacyVariants && legacyVariants.size > 0) {
      canonicalMap.set(key, chooseMostFrequentVariant(legacyVariants));
    }
  }

  // Build compact-key lookup from modern 2025+ data for secondary matching
  for (const [compactKey, variantsMap] of modernByCompact.entries()) {
    compactCanonicalMap.set(compactKey, chooseMostFrequentVariant(variantsMap));
  }

  return { canonical: canonicalMap, compact: compactCanonicalMap };
}

async function loadPaymentMethodMaps(db) {
  const rows = await new Promise((resolve, reject) => {
    db.all('SELECT id, display_name FROM payment_methods', [], (err, resultRows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(resultRows || []);
    });
  });

  const byLower = new Map();
  const byKey = new Map();

  for (const row of rows) {
    const displayName = String(row.display_name || '').trim();
    if (!displayName) continue;
    byLower.set(displayName.toLowerCase(), row);
    byKey.set(normalizeMethodKey(displayName), row);
  }

  return { byLower, byKey, total: rows.length };
}

async function ensureLegacyPaymentMethods(db, options, stats) {
  if (!options.ensureLegacyMethods || !options.paymentMethodMaps) {
    return;
  }

  for (const legacyMethod of LEGACY_INACTIVE_METHODS) {
    const exists = options.paymentMethodMaps.byLower.has(legacyMethod.display_name.toLowerCase())
      || options.paymentMethodMaps.byKey.has(normalizeMethodKey(legacyMethod.display_name));

    if (exists) continue;

    if (!options.dryRun) {
      await dbRun(
        db,
        `
          INSERT INTO payment_methods (type, display_name, full_name, is_active)
          VALUES (?, ?, ?, 0)
        `,
        [legacyMethod.type, legacyMethod.display_name, legacyMethod.full_name]
      );
    }

    stats.legacyMethodsCreated += 1;
  }

  // Refresh maps after creating missing legacy methods so matching in same run sees them.
  options.paymentMethodMaps = await loadPaymentMethodMaps(db);
}

async function upsertMonthlyGross(db, year, month, amount, dryRun) {
  if (amount === null || amount === undefined) return false;
  if (dryRun) return true;
  const sql = `
    INSERT INTO monthly_gross (year, month, gross_amount)
    VALUES (?, ?, ?)
    ON CONFLICT(year, month)
    DO UPDATE SET gross_amount = excluded.gross_amount
  `;
  await dbRun(db, sql, [year, month, amount]);
  return true;
}

async function insertLegacyFixedExpense(db, year, month, amount, dryRun) {
  if (amount === null || amount === undefined) return false;

  const existsSql = `
    SELECT id
    FROM fixed_expenses
    WHERE year = ? AND month = ? AND name = ?
    LIMIT 1
  `;
  const existing = await dbGet(db, existsSql, [year, month, LEGACY_FIXED_EXPENSE_NAME]);
  if (existing) return false;

  if (dryRun) return true;

  const insertSql = `
    INSERT INTO fixed_expenses (
      year, month, name, amount, category, payment_type, payment_method_id, payment_due_day, linked_loan_id
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
  `;
  await dbRun(db, insertSql, [year, month, LEGACY_FIXED_EXPENSE_NAME, amount, 'Housing', 'Fixed']);
  return true;
}

async function upsertLegacyMonthlyIncomeSource(db, year, month, amount, dryRun) {
  if (amount === null || amount === undefined) return 'none';

  const legacyRow = await dbGet(
    db,
    `
      SELECT id, amount
      FROM income_sources
      WHERE year = ? AND month = ? AND name = ?
      LIMIT 1
    `,
    [year, month, LEGACY_MONTHLY_INCOME_NAME]
  );

  if (legacyRow) {
    const existingAmount = Number.parseFloat(legacyRow.amount);
    const targetAmount = Number.parseFloat(amount);
    const sameAmount = Number.isFinite(existingAmount)
      && Number.isFinite(targetAmount)
      && Math.abs(existingAmount - targetAmount) < 0.005;

    if (sameAmount) {
      return 'none';
    }

    if (!dryRun) {
      await dbRun(
        db,
        `
          UPDATE income_sources
          SET amount = ?, category = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [amount, 'Salary', legacyRow.id]
      );
    }
    return 'updated';
  }

  const existingCountRow = await dbGet(
    db,
    `
      SELECT COUNT(*) AS count
      FROM income_sources
      WHERE year = ? AND month = ?
    `,
    [year, month]
  );

  const existingCount = existingCountRow ? Number.parseInt(existingCountRow.count, 10) : 0;
  if (existingCount > 0) {
    return 'skipped_existing';
  }

  if (!dryRun) {
    await dbRun(
      db,
      `
        INSERT INTO income_sources (year, month, name, amount, category)
        VALUES (?, ?, ?, ?, ?)
      `,
      [year, month, LEGACY_MONTHLY_INCOME_NAME, amount, 'Salary']
    );
  }
  return 'inserted';
}

async function importWorkbook(db, workbookPath, options, stats) {
  const workbook = XLSX.readFile(workbookPath, {
    cellDates: false,
    raw: true,
  });

  stats.files += 1;

  for (const sheetName of workbook.SheetNames) {
    if (isLikelySummarySheet(sheetName)) {
      addSkip(stats, 'summary_sheet');
      continue;
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      addSkip(stats, 'missing_sheet');
      continue;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });

    if (!rows.length) {
      addSkip(stats, 'empty_sheet');
      continue;
    }

    stats.sheets += 1;

    const headerIndex = findHeaderRowIndex(rows);
    if (headerIndex < 0) {
      addSkip(stats, 'header_not_found');
      continue;
    }

    const columns = resolveSheetColumns(rows[headerIndex]);

    const sheetYearHint = getSheetYearHint(sheetName, rows);
    const inferredDates = inferRowDates(rows, headerIndex, sheetYearHint);
    const lastValidExpenseRow = findLastValidExpenseRowIndex(rows, headerIndex, sheetYearHint, columns);

    if (lastValidExpenseRow > headerIndex) {
      const tail = rows.length - (lastValidExpenseRow + 1);
      if (tail > 0) stats.tailRowsSkipped += tail;
    }

    if (options.importMonthlySummary) {
      const summary = extractMonthlySummary(rows, sheetName, sheetYearHint);
      if (summary) {
        const grossApplied = await upsertMonthlyGross(db, summary.year, summary.month, summary.monthlyGross, options.dryRun);
        const fixedApplied = await insertLegacyFixedExpense(db, summary.year, summary.month, summary.fixedExpenses, options.dryRun);
        const incomeAction = await upsertLegacyMonthlyIncomeSource(db, summary.year, summary.month, summary.monthlyGross, options.dryRun);
        if (grossApplied) stats.monthlyGrossUpserts += 1;
        if (fixedApplied) stats.fixedExpenseInserts += 1;
        if (incomeAction === 'inserted') stats.monthlyIncomeInserts += 1;
        if (incomeAction === 'updated') stats.monthlyIncomeUpdates += 1;
        if (incomeAction === 'skipped_existing') stats.monthlyIncomeSkippedExisting += 1;
      }
    }

    const context = {
      sheetYearHint,
      columns,
      defaultMethod: options.defaultMethod,
      defaultCategory: options.defaultCategory,
      placeCategoryStats: options.placeCategoryStats,
      tokenCategoryIndex: options.tokenCategoryIndex,
      paymentMethodMaps: options.paymentMethodMaps,
      placeCanonicalMap: options.placeCanonicalMap,
      inferredDate: null,
    };

    for (let i = headerIndex + 1; i <= lastValidExpenseRow; i += 1) {
      const row = Array.isArray(rows[i]) ? rows[i] : [];
      stats.rowsRead += 1;

      if (!row.length || row.every((cell) => cell === null || cell === '')) {
        addSkip(stats, 'blank_row');
        continue;
      }

      if (isTransactionNoiseRow(row, columns.maxExpenseCol)) {
        addSkip(stats, 'noise_row');
        continue;
      }

      context.inferredDate = inferredDates[i];
      const hadRawDate = !!parseDateValue(row[columns.date], sheetYearHint);
      if (!hadRawDate && context.inferredDate) {
        stats.datesInferred += 1;
      }

      const result = rowToExpense(row, context);
      if (result.skip) {
        addSkip(stats, result.reason);
        if (options.reportFile) {
          stats.reviewRows.push({
            status: 'skipped',
            source_file: path.basename(workbookPath),
            sheet: sheetName,
            row_number: i + 1,
            date: row[columns.date],
            place: row[columns.place],
            amount: row[columns.amount],
            notes: row[columns.notes],
            type: columns.type !== null ? row[columns.type] : '',
            method: columns.method !== null ? row[columns.method] : '',
            category_source: '',
            skip_reason: result.reason,
          });
        }
        if (options.verbose) {
          console.log(`Skip ${path.basename(workbookPath)} ${sheetName} R${i + 1}: ${result.reason}`);
        }
        continue;
      }

      const expense = result.expense;
      addCategorySource(stats, expense._category_source || 'unknown');
      addMethodSource(stats, expense._method_source || 'unknown');
      if (expense.payment_method_id) stats.methodMatched += 1;
      else stats.methodUnmatched += 1;
      if (!String(row[columns.place] || '').trim()) stats.missingPlaceFilled += 1;

      const shouldReportRow = options.reportFile
        && (options.reportAll
          || expense._category_source === 'historical_fuzzy'
          || expense._category_source === 'default_category'
          || expense._category_source === 'keyword_inference');

      if (shouldReportRow) {
        stats.reviewRows.push({
          status: 'candidate',
          source_file: path.basename(workbookPath),
          sheet: sheetName,
          row_number: i + 1,
          date: expense.date,
          place: expense.place,
          amount: expense.amount,
          notes: expense.notes,
          type: expense.type,
          method: expense.method,
          category_source: expense._category_source,
          skip_reason: '',
        });
      }

      if (!options.skipDedupe) {
        const exists = await existsDuplicate(db, expense);
        if (exists) {
          stats.duplicates += 1;
          if (shouldReportRow) {
            stats.reviewRows[stats.reviewRows.length - 1].status = 'duplicate';
            stats.reviewRows[stats.reviewRows.length - 1].skip_reason = 'duplicate';
          }
          continue;
        }
      }

      if (options.dryRun) {
        stats.inserted += 1;
        if (shouldReportRow) {
          stats.reviewRows[stats.reviewRows.length - 1].status = 'would_insert';
        }
        continue;
      }

      await insertExpense(db, expense);
      stats.inserted += 1;
      if (shouldReportRow) {
        stats.reviewRows[stats.reviewRows.length - 1].status = 'inserted';
      }
    }
  }
}

function writeReport(reportFile, reviewRows) {
  const outputDir = path.dirname(reportFile);
  fs.mkdirSync(outputDir, { recursive: true });

  const header = [
    'status',
    'source_file',
    'sheet',
    'row_number',
    'date',
    'place',
    'amount',
    'notes',
    'type',
    'method',
    'category_source',
    'skip_reason',
  ];

  const lines = [header.join(',')];
  for (const row of reviewRows) {
    const values = header.map((col) => csvEscape(row[col]));
    lines.push(values.join(','));
  }

  fs.writeFileSync(reportFile, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv);

  if (!options.source) {
    usage();
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(options.source)) {
    console.error(`Source directory not found: ${options.source}`);
    process.exitCode = 1;
    return;
  }

  if (!VALID_CATEGORIES.has(options.defaultCategory)) {
    console.error(`Invalid --default-category: ${options.defaultCategory}`);
    console.error(`Allowed: ${Array.from(VALID_CATEGORIES).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  if (options.dbPath && !fs.existsSync(options.dbPath)) {
    console.error(`Database file not found: ${options.dbPath}`);
    process.exitCode = 1;
    return;
  }

  if (!options.reportFile) {
    options.reportFile = path.join(__dirname, '..', 'reports', `legacy-import-review-${timestampForFilename()}.csv`);
  }

  const workbookFiles = listWorkbookFiles(options.source);
  if (!workbookFiles.length) {
    console.error('No .xls/.xlsx/.xlsm files found in source directory');
    process.exitCode = 1;
    return;
  }

  const selectedFiles = options.limitFiles ? workbookFiles.slice(0, options.limitFiles) : workbookFiles;
  const legacyPlaceStats = scanLegacyPlaceUsage(selectedFiles);
  const stats = createStats();

  console.log('Legacy Import Starting');
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'COMMIT'}`);
  console.log(`Source: ${options.source}`);
  console.log(`Files: ${selectedFiles.length}`);
  console.log(`Defaults: category=${options.defaultCategory}, method=${options.defaultMethod}`);
  console.log(`Database: ${options.dbPath || 'default backend config database'}`);
  console.log(`Report: ${options.reportFile}`);
  console.log(`Monthly summaries: ${options.importMonthlySummary ? 'enabled' : 'disabled'}`);
  console.log(`Ensure legacy inactive methods: ${options.ensureLegacyMethods ? 'enabled' : 'disabled'}`);

  let db;

  try {
    if (options.dbPath) {
      db = await openDbByPath(options.dbPath);
    } else {
      await initializeDatabase();
      db = await getDatabase();
    }

    const historical = await loadHistoricalPlaceCategoryStats(db);
    options.placeCategoryStats = historical.placeCategoryStats;
    options.tokenCategoryIndex = historical.tokenCategoryIndex;
    options.paymentMethodMaps = await loadPaymentMethodMaps(db);

    const prodPlaceStats = await loadProductionPlaceStats(db);
    options.placeCanonicalMap = buildCanonicalPlaceMap(prodPlaceStats, legacyPlaceStats);

    await ensureLegacyPaymentMethods(db, options, stats);

    console.log(`Historical place signatures loaded: ${options.placeCategoryStats.size}`);
    console.log(`Payment methods loaded: ${options.paymentMethodMaps.total}`);
    console.log(`Canonical place keys loaded: ${options.placeCanonicalMap.canonical.size} (+ ${options.placeCanonicalMap.compact.size} compact)`);

    if (!options.dryRun) {
      await dbRun(db, 'BEGIN TRANSACTION', []);
    }

    for (const workbookPath of selectedFiles) {
      try {
        await importWorkbook(db, workbookPath, options, stats);
      } catch (error) {
        stats.errors.push({ file: workbookPath, message: error.message });
      }
    }

    if (!options.dryRun) {
      await dbRun(db, 'COMMIT', []);

      // Post-import: standardize pre-existing DB entries using 2025+ canonical names
      const { compact } = options.placeCanonicalMap;
      if (compact && compact.size > 0) {
        console.log('\nPost-import: standardizing pre-existing place names to match 2025+ canonical...');
        const existingPlaces = await new Promise((resolve, reject) => {
          db.all(
            `SELECT DISTINCT place FROM expenses WHERE place IS NOT NULL AND TRIM(place) <> '' AND date < '2025-01-01'`,
            [], (err, rows) => { if (err) reject(err); else resolve(rows || []); }
          );
        });

        let standardized = 0;
        await dbRun(db, 'BEGIN TRANSACTION', []);
        for (const row of existingPlaces) {
          const currentPlace = row.place;
          const compactKey = normalizePlaceCompact(currentPlace);
          const modernCanonical = compact.get(compactKey);
          if (modernCanonical && modernCanonical !== currentPlace) {
            const changes = await new Promise((resolve, reject) => {
              db.run(
                'UPDATE expenses SET place = ? WHERE place = ? AND date < ?',
                [modernCanonical, currentPlace, '2025-01-01'],
                function (err) { if (err) reject(err); else resolve(this.changes); }
              );
            });
            standardized += changes;
          }
        }
        await dbRun(db, 'COMMIT', []);
        console.log(`  Standardized ${standardized} pre-existing expense row(s) to 2025+ canonical names.`);
      }
    }
  } catch (error) {
    if (db && !options.dryRun) {
      try {
        await dbRun(db, 'ROLLBACK', []);
      } catch (rollbackError) {
        stats.errors.push({ file: 'transaction', message: rollbackError.message });
      }
    }
    throw error;
  } finally {
    if (db) {
      await closeDb(db);
    }
  }

  console.log('');
  console.log('Import Summary');
  console.log(`  Workbooks processed: ${stats.files}`);
  console.log(`  Sheets processed: ${stats.sheets}`);
  console.log(`  Rows scanned: ${stats.rowsRead}`);
  console.log(`  Rows ${options.dryRun ? 'would insert' : 'inserted'}: ${stats.inserted}`);
  console.log(`  Duplicates skipped: ${stats.duplicates}`);
  console.log(`  Other skipped rows: ${stats.skipped}`);

  if (Object.keys(stats.skipReasons).length > 0) {
    console.log('  Skip reasons:');
    Object.entries(stats.skipReasons)
      .sort((a, b) => b[1] - a[1])
      .forEach(([reason, count]) => {
        console.log(`    ${reason}: ${count}`);
      });
  }

  if (Object.keys(stats.categorySources).length > 0) {
    console.log('  Category assignment sources:');
    Object.entries(stats.categorySources)
      .sort((a, b) => b[1] - a[1])
      .forEach(([source, count]) => {
        console.log(`    ${source}: ${count}`);
      });
  }

  console.log(`  Monthly gross rows ${options.dryRun ? 'would upsert' : 'upserted'}: ${stats.monthlyGrossUpserts}`);
  console.log(`  Fixed expense rows ${options.dryRun ? 'would insert' : 'inserted'}: ${stats.fixedExpenseInserts}`);
  console.log(`  Monthly income source rows ${options.dryRun ? 'would insert' : 'inserted'}: ${stats.monthlyIncomeInserts}`);
  console.log(`  Monthly income source rows ${options.dryRun ? 'would update' : 'updated'}: ${stats.monthlyIncomeUpdates}`);
  console.log(`  Monthly income source rows skipped (existing month data): ${stats.monthlyIncomeSkippedExisting}`);
  console.log(`  Legacy inactive methods ${options.dryRun ? 'would create' : 'created'}: ${stats.legacyMethodsCreated}`);
  console.log(`  Methods matched to payment_method_id: ${stats.methodMatched}`);
  console.log(`  Methods left unmatched: ${stats.methodUnmatched}`);
  console.log(`  Dates inferred from neighboring rows: ${stats.datesInferred}`);
  console.log(`  Missing-place rows filled with placeholder: ${stats.missingPlaceFilled}`);
  console.log(`  Tail rows skipped after last valid expense: ${stats.tailRowsSkipped}`);

  if (Object.keys(stats.methodSources).length > 0) {
    console.log('  Method match sources:');
    Object.entries(stats.methodSources)
      .sort((a, b) => b[1] - a[1])
      .forEach(([source, count]) => {
        console.log(`    ${source}: ${count}`);
      });
  }

  if (options.reportFile) {
    writeReport(options.reportFile, stats.reviewRows);
    console.log(`  Review rows written: ${stats.reviewRows.length}`);
    console.log(`  Review report file: ${options.reportFile}`);
  }

  if (stats.errors.length > 0) {
    console.log('  Errors:');
    stats.errors.forEach((err) => {
      console.log(`    ${err.file}: ${err.message}`);
    });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Import failed:', error.message);
  process.exitCode = 1;
});
