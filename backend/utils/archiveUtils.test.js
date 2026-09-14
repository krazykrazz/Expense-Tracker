const fs = require('fs');
const path = require('path');
const archiveUtils = require('./archiveUtils');

describe('ArchiveUtils', () => {
  const testDir = path.join(__dirname, '../../test-archives');
  const testSourceDir = path.join(testDir, 'source');
  const testExtractDir = path.join(testDir, 'extract');
  
  beforeAll(async () => {
    // Create test directories
    await fs.promises.mkdir(testSourceDir, { recursive: true });
    await fs.promises.mkdir(testExtractDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test directories
    await fs.promises.rm(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Clean extract directory before each test
    await fs.promises.rm(testExtractDir, { recursive: true, force: true });
    await fs.promises.mkdir(testExtractDir, { recursive: true });
  });

  describe('createArchive', () => {
    test('creates archive with multiple files', async () => {
      // Create test files
      const file1Path = path.join(testSourceDir, 'file1.txt');
      const file2Path = path.join(testSourceDir, 'file2.txt');
      await fs.promises.writeFile(file1Path, 'Content of file 1');
      await fs.promises.writeFile(file2Path, 'Content of file 2');

      const archivePath = path.join(testDir, 'test-multi.tar.gz');

      const result = await archiveUtils.createArchive(archivePath, [
        { source: file1Path, archivePath: 'data/file1.txt' },
        { source: file2Path, archivePath: 'data/file2.txt' }
      ]);

      expect(result.success).toBe(true);
      expect(result.size).toBeGreaterThan(0);
      expect(fs.existsSync(archivePath)).toBe(true);
    });

    test('creates archive with directory structure', async () => {
      // Create nested directory structure
      const nestedDir = path.join(testSourceDir, 'nested', 'deep');
      await fs.promises.mkdir(nestedDir, { recursive: true });
      await fs.promises.writeFile(path.join(nestedDir, 'nested.txt'), 'Nested content');

      const archivePath = path.join(testDir, 'test-nested.tar.gz');

      const result = await archiveUtils.createArchive(archivePath, [
        { source: path.join(testSourceDir, 'nested'), archivePath: 'nested' }
      ]);

      expect(result.success).toBe(true);
      expect(fs.existsSync(archivePath)).toBe(true);
    });

    test('throws error for missing output path', async () => {
      await expect(archiveUtils.createArchive(null, []))
        .rejects.toThrow('Output path is required');
    });

    test('throws error for empty entries', async () => {
      const archivePath = path.join(testDir, 'test-empty.tar.gz');
      
      await expect(archiveUtils.createArchive(archivePath, []))
        .rejects.toThrow('At least one entry is required');
    });

    test('throws error when no valid entries exist', async () => {
      const archivePath = path.join(testDir, 'test-invalid.tar.gz');
      
      await expect(archiveUtils.createArchive(archivePath, [
        { source: '/nonexistent/path', archivePath: 'data/file.txt' }
      ])).rejects.toThrow('No valid entries to archive');
    });
  });

  describe('extractArchive', () => {
    test('extracts archive contents', async () => {
      // Create a test archive first
      const file1Path = path.join(testSourceDir, 'extract-test.txt');
      await fs.promises.writeFile(file1Path, 'Extract test content');

      const archivePath = path.join(testDir, 'test-extract.tar.gz');
      await archiveUtils.createArchive(archivePath, [
        { source: file1Path, archivePath: 'data/extract-test.txt' }
      ]);

      // Extract the archive
      const result = await archiveUtils.extractArchive(archivePath, testExtractDir);

      expect(result.success).toBe(true);
      expect(result.filesExtracted).toBeGreaterThan(0);

      // Verify extracted file exists
      const extractedFile = path.join(testExtractDir, 'data', 'extract-test.txt');
      expect(fs.existsSync(extractedFile)).toBe(true);

      const content = await fs.promises.readFile(extractedFile, 'utf8');
      expect(content).toBe('Extract test content');
    });

    test('throws error for missing archive path', async () => {
      await expect(archiveUtils.extractArchive(null, testExtractDir))
        .rejects.toThrow('Archive path is required');
    });

    test('throws error for missing destination path', async () => {
      await expect(archiveUtils.extractArchive('/some/path.tar.gz', null))
        .rejects.toThrow('Destination path is required');
    });

    test('throws error for non-existent archive', async () => {
      await expect(archiveUtils.extractArchive('/nonexistent/archive.tar.gz', testExtractDir))
        .rejects.toThrow('Backup file not found');
    });

    test('throws error for invalid archive format', async () => {
      // Create an invalid file (not gzip)
      const invalidPath = path.join(testDir, 'invalid.tar.gz');
      await fs.promises.writeFile(invalidPath, 'This is not a gzip file');

      await expect(archiveUtils.extractArchive(invalidPath, testExtractDir))
        .rejects.toThrow('Backup archive is corrupted or invalid');
    });
  });

  describe('listArchiveContents', () => {
    test('lists archive contents correctly', async () => {
      // Create test files and archive
      const file1Path = path.join(testSourceDir, 'list-test1.txt');
      const file2Path = path.join(testSourceDir, 'list-test2.txt');
      await fs.promises.writeFile(file1Path, 'List test 1');
      await fs.promises.writeFile(file2Path, 'List test 2 with more content');

      const archivePath = path.join(testDir, 'test-list.tar.gz');
      await archiveUtils.createArchive(archivePath, [
        { source: file1Path, archivePath: 'files/list-test1.txt' },
        { source: file2Path, archivePath: 'files/list-test2.txt' }
      ]);

      const contents = await archiveUtils.listArchiveContents(archivePath);

      expect(Array.isArray(contents)).toBe(true);
      expect(contents.length).toBeGreaterThan(0);
      
      const fileNames = contents.map(c => c.name);
      expect(fileNames.some(n => n.includes('list-test1.txt'))).toBe(true);
      expect(fileNames.some(n => n.includes('list-test2.txt'))).toBe(true);
    });

    test('throws error for missing archive path', async () => {
      await expect(archiveUtils.listArchiveContents(null))
        .rejects.toThrow('Archive path is required');
    });

    test('throws error for non-existent archive', async () => {
      await expect(archiveUtils.listArchiveContents('/nonexistent/archive.tar.gz'))
        .rejects.toThrow('Archive file not found');
    });

    test('throws error for invalid archive', async () => {
      const invalidPath = path.join(testDir, 'invalid-list.tar.gz');
      await fs.promises.writeFile(invalidPath, 'Not a valid archive');

      await expect(archiveUtils.listArchiveContents(invalidPath))
        .rejects.toThrow('Archive is corrupted or invalid');
    });
  });

  describe('verifyArchive', () => {
    // Large enough that truncation removes real deflate data rather than padding.
    async function createLargeArchive(name) {
      const bigFile = path.join(testSourceDir, `${name}-big.txt`);
      await fs.promises.writeFile(bigFile, 'verification payload '.repeat(5000));

      const archivePath = path.join(testDir, `${name}.tar.gz`);
      await archiveUtils.createArchive(archivePath, [
        { source: bigFile, archivePath: 'data/big.txt' }
      ]);

      return archivePath;
    }

    test('reports a well-formed archive as valid', async () => {
      const archivePath = await createLargeArchive('verify-good');

      const result = await archiveUtils.verifyArchive(archivePath);

      expect(result.valid).toBe(true);
      expect(result.entryCount).toBeGreaterThan(0);
      expect(result.error).toBeNull();
    });

    test('detects a truncated archive that the gzip header check accepts', async () => {
      const archivePath = await createLargeArchive('verify-truncated');
      const original = await fs.promises.readFile(archivePath);
      const truncatedPath = path.join(testDir, 'verify-truncated-cut.tar.gz');
      await fs.promises.writeFile(truncatedPath, original.subarray(0, Math.floor(original.length * 0.6)));

      // The 2-byte magic check passes — this is exactly the gap R27 closes.
      expect(await archiveUtils._isValidGzipFile(truncatedPath)).toBe(true);

      const result = await archiveUtils.verifyArchive(truncatedPath);

      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    test('detects mid-stream corruption', async () => {
      const archivePath = await createLargeArchive('verify-corrupt');
      const buffer = await fs.promises.readFile(archivePath);
      buffer[Math.floor(buffer.length / 2)] ^= 0xff;
      const corruptPath = path.join(testDir, 'verify-corrupt-flipped.tar.gz');
      await fs.promises.writeFile(corruptPath, buffer);

      const result = await archiveUtils.verifyArchive(corruptPath);

      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    test('rejects an empty file, which inflates without error', async () => {
      const emptyPath = path.join(testDir, 'verify-empty.tar.gz');
      await fs.promises.writeFile(emptyPath, '');

      const result = await archiveUtils.verifyArchive(emptyPath);

      expect(result.valid).toBe(false);
      expect(result.entryCount).toBe(0);
    });

    test('reports a missing archive as invalid rather than throwing', async () => {
      const result = await archiveUtils.verifyArchive(path.join(testDir, 'verify-absent.tar.gz'));

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('createArchive verification', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('fails the backup and discards the archive when verification fails', async () => {
      const sourceFile = path.join(testSourceDir, 'unverifiable.txt');
      await fs.promises.writeFile(sourceFile, 'content');
      const archivePath = path.join(testDir, 'unverifiable.tar.gz');

      jest.spyOn(archiveUtils, 'verifyArchive').mockResolvedValue({
        valid: false,
        entryCount: 0,
        error: 'zlib: unexpected end of file'
      });

      await expect(
        archiveUtils.createArchive(archivePath, [
          { source: sourceFile, archivePath: 'data/unverifiable.txt' }
        ])
      ).rejects.toThrow('Archive verification failed');

      expect(fs.existsSync(archivePath)).toBe(false);
    });

    test('verifies every archive it reports as successful', async () => {
      const sourceFile = path.join(testSourceDir, 'verified.txt');
      await fs.promises.writeFile(sourceFile, 'content');
      const archivePath = path.join(testDir, 'verified.tar.gz');

      const verifySpy = jest.spyOn(archiveUtils, 'verifyArchive');

      const result = await archiveUtils.createArchive(archivePath, [
        { source: sourceFile, archivePath: 'data/verified.txt' }
      ]);

      expect(result.success).toBe(true);
      expect(verifySpy).toHaveBeenCalledWith(archivePath);
    });
  });

  describe('round-trip integrity', () => {
    test('archive and extract preserves file content', async () => {
      // Create test file with specific content
      const originalContent = 'This is the original content that should be preserved';
      const testFile = path.join(testSourceDir, 'roundtrip.txt');
      await fs.promises.writeFile(testFile, originalContent);

      // Create archive
      const archivePath = path.join(testDir, 'test-roundtrip.tar.gz');
      await archiveUtils.createArchive(archivePath, [
        { source: testFile, archivePath: 'roundtrip.txt' }
      ]);

      // Extract archive
      await archiveUtils.extractArchive(archivePath, testExtractDir);

      // Verify content
      const extractedContent = await fs.promises.readFile(
        path.join(testExtractDir, 'roundtrip.txt'),
        'utf8'
      );
      expect(extractedContent).toBe(originalContent);
    });
  });
});
