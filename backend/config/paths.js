const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Configuration module for managing application paths
 * Supports both containerized (/config) and development environments
 */

// Check if /config directory exists (containerized environment)
const isContainerized = fs.existsSync('/config');

// Base configuration directory
const CONFIG_DIR = isContainerized ? '/config' : path.join(__dirname, '..', 'config');

// Log the detected environment on module load (helps debug path issues)
logger.info('Environment detection:', { isContainerized, CONFIG_DIR });

/**
 * Get the base configuration directory path
 * @returns {string} Path to configuration directory
 */
function getConfigDir() {
  return CONFIG_DIR;
}

/**
 * Get the database file path
 * @returns {string} Path to SQLite database file
 */
function getDatabasePath() {
  return path.join(CONFIG_DIR, 'database', 'expenses.db');
}

/**
 * Get the backup directory path
 * @returns {string} Path to backup directory
 */
function getBackupPath() {
  return path.join(CONFIG_DIR, 'backups');
}

/**
 * Get the backup configuration file path
 * @returns {string} Path to backup configuration JSON file
 */
function getBackupConfigPath() {
  return path.join(CONFIG_DIR, 'config', 'backupConfig.json');
}

/**
 * Get the invoices directory path
 * @returns {string} Path to invoices directory
 */
function getInvoicesPath() {
  return path.join(CONFIG_DIR, 'invoices');
}

/**
 * Get the credit card statements directory path
 * @returns {string} Path to statements directory
 */
function getStatementsPath() {
  return path.join(CONFIG_DIR, 'statements');
}

/**
 * Ensure all required directories exist
 * Creates directory structure if it doesn't exist
 * @returns {Promise<void>}
 */
async function ensureDirectories() {
  const directories = [
    path.join(CONFIG_DIR, 'database'),
    path.join(CONFIG_DIR, 'backups'),
    path.join(CONFIG_DIR, 'config'),
    path.join(CONFIG_DIR, 'invoices'),
    path.join(CONFIG_DIR, 'invoices', 'temp'),
    path.join(CONFIG_DIR, 'statements')
  ];

  for (const dir of directories) {
    try {
      await fs.promises.mkdir(dir, { recursive: true });
    } catch (error) {
      // Log error but don't throw - allow application to continue
      logger.warn('Failed to create directory:', { dir, error: error.message });
    }
  }
}

module.exports = {
  getConfigDir,
  getDatabasePath,
  getBackupPath,
  getBackupConfigPath,
  getInvoicesPath,
  getStatementsPath,
  ensureDirectories,
  isContainerized
};
