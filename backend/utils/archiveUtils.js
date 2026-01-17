const fs = require('fs');
const path = require('path');
const tar = require('tar');
const logger = require('../config/logger');

/**
 * Archive utilities for backup operations
 * Handles tar.gz creation and extraction for comprehensive backups
 */
class ArchiveUtils {
  /**
   * Create a tar.gz archive from multiple source paths
   * @param {string} outputPath - Path for the output archive
   * @param {Array<{source: string, archivePath: string}>} entries - Files/dirs to include
   *   - source: Absolute path to the file or directory
   *   - archivePath: Path within the archive (e.g., 'database/expenses.db')
   * @returns {Promise<{success: boolean, size: number}>}
   */
  async createArchive(outputPath, entries) {
    if (!outputPath) {
      throw new Error('Output path is required');
    }

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      throw new Error('At least one entry is required');
    }

    // Validate entries
    const validEntries = [];
    for (const entry of entries) {
      if (!entry.source || !entry.archivePath) {
        logger.warn('Skipping invalid entry:', entry);
        continue;
      }

      try {
        await fs.promises.access(entry.source);
        validEntries.push(entry);
      } catch (error) {
        logger.warn(`Source path not accessible: ${entry.source}`);
      }
    }

    if (validEntries.length === 0) {
      throw new Error('No valid entries to archive');
    }

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.promises.mkdir(outputDir, { recursive: true });

    // Create a temporary directory to stage files with correct structure
    const tempDir = path.join(outputDir, `temp_archive_${Date.now()}`);
    
    try {
      await fs.promises.mkdir(tempDir, { recursive: true });

      // Copy files to temp directory with archive structure
      for (const entry of validEntries) {
        const destPath = path.join(tempDir, entry.archivePath);
        const destDir = path.dirname(destPath);
        
        await fs.promises.mkdir(destDir, { recursive: true });
        
        const stats = await fs.promises.stat(entry.source);
        if (stats.isDirectory()) {
          await this._copyDirectory(entry.source, destPath);
        } else {
          await fs.promises.copyFile(entry.source, destPath);
        }
      }

      // Get list of items to archive (top-level directories/files in temp)
      const itemsToArchive = await fs.promises.readdir(tempDir);

      // Create the tar.gz archive
      await tar.create(
        {
          gzip: true,
          file: outputPath,
          cwd: tempDir
        },
        itemsToArchive
      );

      // Get archive size
      const archiveStats = await fs.promises.stat(outputPath);

      logger.debug('Archive created successfully:', {
        path: outputPath,
        size: archiveStats.size,
        entries: validEntries.length
      });

      return {
        success: true,
        size: archiveStats.size
      };
    } finally {
      // Clean up temp directory
      await this._removeDirectory(tempDir);
    }
  }

  /**
   * Extract a tar.gz archive to a destination
   * @param {string} archivePath - Path to the archive
   * @param {string} destPath - Destination directory
   * @returns {Promise<{success: boolean, filesExtracted: number}>}
   */
  async extractArchive(archivePath, destPath) {
    if (!archivePath) {
      throw new Error('Archive path is required');
    }

    if (!destPath) {
      throw new Error('Destination path is required');
    }

    // Verify archive exists
    try {
      await fs.promises.access(archivePath);
    } catch (error) {
      throw new Error('Backup file not found');
    }

    // Verify it's a valid gzip file by checking magic bytes
    const isValid = await this._isValidGzipFile(archivePath);
    if (!isValid) {
      throw new Error('Backup archive is corrupted or invalid');
    }

    // Ensure destination directory exists
    await fs.promises.mkdir(destPath, { recursive: true });

    // Count files before extraction
    let filesExtracted = 0;

    // Extract the archive
    await tar.extract({
      file: archivePath,
      cwd: destPath,
      onentry: () => {
        filesExtracted++;
      }
    });

    logger.debug('Archive extracted successfully:', {
      archivePath,
      destPath,
      filesExtracted
    });

    return {
      success: true,
      filesExtracted
    };
  }

  /**
   * List contents of a tar.gz archive
   * @param {string} archivePath - Path to the archive
   * @returns {Promise<Array<{name: string, size: number}>>}
   */
  async listArchiveContents(archivePath) {
    if (!archivePath) {
      throw new Error('Archive path is required');
    }

    // Verify archive exists
    try {
      await fs.promises.access(archivePath);
    } catch (error) {
      throw new Error('Archive file not found');
    }

    // Verify it's a valid gzip file
    const isValid = await this._isValidGzipFile(archivePath);
    if (!isValid) {
      throw new Error('Archive is corrupted or invalid');
    }

    const contents = [];

    await tar.list({
      file: archivePath,
      onentry: (entry) => {
        contents.push({
          name: entry.path,
          size: entry.size,
          type: entry.type
        });
      }
    });

    logger.debug('Archive contents listed:', {
      archivePath,
      itemCount: contents.length
    });

    return contents;
  }

  /**
   * Check if a file is a valid gzip file by checking magic bytes
   * @param {string} filePath - Path to the file
   * @returns {Promise<boolean>}
   * @private
   */
  async _isValidGzipFile(filePath) {
    try {
      const fd = await fs.promises.open(filePath, 'r');
      const buffer = Buffer.alloc(2);
      await fd.read(buffer, 0, 2, 0);
      await fd.close();
      
      // Gzip magic bytes: 0x1f 0x8b
      return buffer[0] === 0x1f && buffer[1] === 0x8b;
    } catch (error) {
      return false;
    }
  }

  /**
   * Recursively copy a directory
   * @param {string} src - Source directory
   * @param {string} dest - Destination directory
   * @private
   */
  async _copyDirectory(src, dest) {
    await fs.promises.mkdir(dest, { recursive: true });
    const entries = await fs.promises.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this._copyDirectory(srcPath, destPath);
      } else {
        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Recursively remove a directory
   * @param {string} dirPath - Directory to remove
   * @private
   */
  async _removeDirectory(dirPath) {
    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      logger.warn('Failed to remove temp directory:', error.message);
    }
  }
}

module.exports = new ArchiveUtils();
