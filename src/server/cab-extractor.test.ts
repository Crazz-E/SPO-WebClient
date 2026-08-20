import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  extractCabArchive,
  listCabContents,
  isCabExtractorAvailable
} from './cab-extractor';

describe('CAB Extractor (7zip-min)', () => {
  let tempDir: string;
  let cabextractAvailable: boolean;

  beforeAll(async () => {
    cabextractAvailable = await isCabExtractorAvailable();
    if (!cabextractAvailable) {
      console.error('⚠ 7zip-min not available - this should not happen!');
      console.error('Try: npm install 7zip-min');
    }
  });

  beforeEach(() => {
    // Create temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cab-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('isCabExtractorAvailable', () => {
    it('should return true since 7zip-min is bundled', async () => {
      const available = await isCabExtractorAvailable();
      expect(available).toBe(true);
    });
  });

  describe('listCabContents', () => {
    it('should return null for non-existent file', async () => {
      const result = await listCabContents('/path/to/nonexistent.cab');
      expect(result).toBeNull();
    });

    it('should list contents of BuildingClasses CAB file', async () => {
      if (!cabextractAvailable) {
        return;
      }

      const cabPath = path.join(__dirname, '../../cache/BuildingClasses/classes.cab');
      if (!fs.existsSync(cabPath)) {
        console.warn('⚠ BuildingClasses/classes.cab not found, skipping test');
        return;
      }

      const files = await listCabContents(cabPath);
      expect(files).not.toBeNull();
      expect(Array.isArray(files)).toBe(true);

      if (files) {
        expect(files.length).toBeGreaterThan(0);

        // Verify file info structure
        const firstFile = files[0];
        expect(firstFile).toHaveProperty('name');
        expect(firstFile).toHaveProperty('size');
        expect(firstFile).toHaveProperty('offset');
        expect(typeof firstFile.name).toBe('string');
        expect(typeof firstFile.size).toBe('number');
      }
    });

    it('should list contents of CarClasses CAB file', async () => {
      if (!cabextractAvailable) {
        return;
      }

      const cabPath = path.join(__dirname, '../../cache/CarClasses/classes.cab');
      if (!fs.existsSync(cabPath)) {
        console.warn('⚠ CarClasses/classes.cab not found, skipping test');
        return;
      }

      const files = await listCabContents(cabPath);
      expect(files).not.toBeNull();

      if (files) {
        expect(files.length).toBeGreaterThan(0);
        // CarClasses should have multiple .ini files
        const iniFiles = files.filter(f => f.name.toLowerCase().endsWith('.ini'));
        expect(iniFiles.length).toBeGreaterThan(0);
      }
    });

    it('should list contents of ConcreteClasses CAB file', async () => {
      if (!cabextractAvailable) {
        return;
      }

      const cabPath = path.join(__dirname, '../../cache/ConcreteClasses/classes.cab');
      if (!fs.existsSync(cabPath)) {
        console.warn('⚠ ConcreteClasses/classes.cab not found, skipping test');
        return;
      }

      const files = await listCabContents(cabPath);
      expect(files).not.toBeNull();

      if (files) {
        expect(files.length).toBeGreaterThan(0);
      }
    });
  });

  describe('extractCabArchive', () => {
    it('should fail gracefully for non-existent file', async () => {
      const result = await extractCabArchive('/path/to/nonexistent.cab', tempDir);

      expect(result.success).toBe(false);
      expect(result.extractedFiles.length).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('CAB file not found');
    });

    it('should extract BuildingClasses CAB file', async () => {
      if (!cabextractAvailable) {
        return;
      }

      const cabPath = path.join(__dirname, '../../cache/BuildingClasses/classes.cab');
      if (!fs.existsSync(cabPath)) {
        console.warn('⚠ BuildingClasses/classes.cab not found, skipping test');
        return;
      }

      const result = await extractCabArchive(cabPath, tempDir);

      expect(result.success).toBe(true);
      expect(result.extractedFiles.length).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);

      // Verify extracted files exist
      for (const fileName of result.extractedFiles) {
        const filePath = path.join(tempDir, fileName);
        expect(fs.existsSync(filePath)).toBe(true);

        const stats = fs.statSync(filePath);
        expect(stats.isFile()).toBe(true);
        expect(stats.size).toBeGreaterThan(0);
      }
    });

    it('should extract CarClasses CAB file with multiple files', async () => {
      if (!cabextractAvailable) {
        return;
      }

      const cabPath = path.join(__dirname, '../../cache/CarClasses/classes.cab');
      if (!fs.existsSync(cabPath)) {
        console.warn('⚠ CarClasses/classes.cab not found, skipping test');
        return;
      }

      const result = await extractCabArchive(cabPath, tempDir);

      expect(result.success).toBe(true);
      expect(result.extractedFiles.length).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);

      // Verify all extracted files exist
      for (const fileName of result.extractedFiles) {
        const filePath = path.join(tempDir, fileName);
        expect(fs.existsSync(filePath)).toBe(true);
      }

      // Should have extracted multiple .ini files
      const iniFiles = result.extractedFiles.filter(f => f.toLowerCase().endsWith('.ini'));
      expect(iniFiles.length).toBeGreaterThan(0);
    });

    it('should extract ConcreteClasses CAB file', async () => {
      if (!cabextractAvailable) {
        return;
      }

      const cabPath = path.join(__dirname, '../../cache/ConcreteClasses/classes.cab');
      if (!fs.existsSync(cabPath)) {
        console.warn('⚠ ConcreteClasses/classes.cab not found, skipping test');
        return;
      }

      const result = await extractCabArchive(cabPath, tempDir);

      expect(result.success).toBe(true);
      expect(result.extractedFiles.length).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);

      // Verify extracted files exist
      for (const fileName of result.extractedFiles) {
        const filePath = path.join(tempDir, fileName);
        expect(fs.existsSync(filePath)).toBe(true);
      }
    });

    it('should extract chaticons CAB file', async () => {
      if (!cabextractAvailable) {
        return;
      }

      const cabPath = path.join(__dirname, '../../cache/chaticons/chaticons.cab');
      if (!fs.existsSync(cabPath)) {
        console.warn('⚠ chaticons/chaticons.cab not found, skipping test');
        return;
      }

      const result = await extractCabArchive(cabPath, tempDir);

      expect(result.success).toBe(true);
      expect(result.extractedFiles.length).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);
    });

    it('should create target directory if it does not exist', async () => {
      if (!cabextractAvailable) {
        return;
      }

      const cabPath = path.join(__dirname, '../../cache/BuildingClasses/classes.cab');
      if (!fs.existsSync(cabPath)) {
        return;
      }

      const nestedDir = path.join(tempDir, 'nested', 'sub', 'directory');
      expect(fs.existsSync(nestedDir)).toBe(false);

      const result = await extractCabArchive(cabPath, nestedDir);

      expect(result.success).toBe(true);
      expect(fs.existsSync(nestedDir)).toBe(true);
    });
  });

  describe('Path normalization', () => {
    it('should normalize backslashes to forward slashes in file names', async () => {
      if (!cabextractAvailable) {
        return;
      }

      const cabPath = path.join(__dirname, '../../cache/BuildingClasses/classes.cab');
      if (!fs.existsSync(cabPath)) {
        return;
      }

      const files = await listCabContents(cabPath);
      if (!files) {
        return;
      }

      // All file names should use forward slashes
      for (const file of files) {
        expect(file.name).not.toContain('\\');
      }
    });
  });

  describe('CAB file exclusion', () => {
    it('should not include the source CAB file in extractedFiles', async () => {
      if (!cabextractAvailable) {
        return;
      }

      const cabPath = path.join(__dirname, '../../cache/BuildingClasses/classes.cab');
      if (!fs.existsSync(cabPath)) {
        console.warn('⚠ BuildingClasses/classes.cab not found, skipping test');
        return;
      }

      // Extract into tempDir first, then copy the CAB alongside the extracted files
      // to simulate the real scenario where extraction happens in the same dir as the CAB
      const extractDir = path.join(tempDir, 'with-cab');
      fs.mkdirSync(extractDir, { recursive: true });
      fs.copyFileSync(cabPath, path.join(extractDir, 'classes.cab'));

      const result = await extractCabArchive(path.join(extractDir, 'classes.cab'), extractDir);

      expect(result.success).toBe(true);
      expect(result.extractedFiles.length).toBeGreaterThan(0);

      // The source CAB file must NOT be in extractedFiles
      const cabInList = result.extractedFiles.some(
        f => f.toLowerCase() === 'classes.cab'
      );
      expect(cabInList).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should report errors for corrupted CAB files', async () => {
      if (!cabextractAvailable) {
        return;
      }

      // Create a fake CAB file
      const fakeCabPath = path.join(tempDir, 'fake.cab');
      fs.writeFileSync(fakeCabPath, 'This is not a valid CAB file');

      const result = await extractCabArchive(fakeCabPath, tempDir);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
