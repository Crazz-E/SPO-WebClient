/**
 * Unit tests for TextureAlphaBaker
 *
 * Tests BMP decoding, PNG encoding, color key detection, and alpha baking.
 * Uses synthetic BMP data (no filesystem dependencies for core logic tests).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import {
  decodeBmp,
  decodeBmpIndices,
  decodePng,
  encodePng,
  applyColorKey,
  detectColorKey,
  bakeAlpha,
  bakeDirectory,
  downscaleRGBA2x,
  ColorKey,
} from './texture-alpha-baker';

// ============================================================================
// Helper: Create synthetic 24-bit BMP buffers for testing
// ============================================================================

/**
 * Create a minimal 24-bit uncompressed BMP buffer.
 *
 * @param width - Image width
 * @param height - Image height (positive = bottom-up)
 * @param pixelsFn - Function that returns RGB for each (x, y) pixel
 * @returns BMP file buffer
 */
function createTestBmp(
  width: number,
  height: number,
  pixelsFn: (x: number, y: number) => [number, number, number]
): Buffer {
  const absHeight = Math.abs(height);
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const dataSize = rowSize * absHeight;
  const fileSize = 54 + dataSize;
  const buffer = Buffer.alloc(fileSize);

  // File header (14 bytes)
  buffer.writeUInt16LE(0x4D42, 0);       // Signature 'BM'
  buffer.writeUInt32LE(fileSize, 2);      // File size
  buffer.writeUInt32LE(0, 6);             // Reserved
  buffer.writeUInt32LE(54, 10);           // Data offset

  // Info header (40 bytes)
  buffer.writeUInt32LE(40, 14);           // Header size
  buffer.writeInt32LE(width, 18);         // Width
  buffer.writeInt32LE(height, 22);        // Height (positive = bottom-up)
  buffer.writeUInt16LE(1, 26);            // Planes
  buffer.writeUInt16LE(24, 28);           // Bits per pixel
  buffer.writeUInt32LE(0, 30);            // Compression (0 = none)
  buffer.writeUInt32LE(dataSize, 34);     // Image data size
  buffer.writeInt32LE(2835, 38);          // X pixels per meter
  buffer.writeInt32LE(2835, 42);          // Y pixels per meter
  buffer.writeUInt32LE(0, 46);            // Colors used
  buffer.writeUInt32LE(0, 50);            // Important colors

  // Pixel data
  const isBottomUp = height > 0;
  for (let y = 0; y < absHeight; y++) {
    const srcRow = isBottomUp ? (absHeight - 1 - y) : y;
    const rowOffset = 54 + srcRow * rowSize;

    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelsFn(x, y);
      const pixOffset = rowOffset + x * 3;
      buffer[pixOffset] = b;     // BGR order in BMP
      buffer[pixOffset + 1] = g;
      buffer[pixOffset + 2] = r;
    }
  }

  return buffer;
}

/**
 * Create a BMP with a blue background (0,0,255) and a colored diamond center
 */
function createBlueKeyedBmp(width: number, height: number): Buffer {
  return createTestBmp(width, height, (x, y) => {
    // Simple check: corners are blue, center is green
    const cx = width / 2;
    const cy = height / 2;
    const dist = Math.abs(x - cx) / cx + Math.abs(y - cy) / cy;
    if (dist < 0.8) {
      return [0, 200, 0]; // Green (inside diamond)
    }
    return [0, 0, 255]; // Blue (outside diamond - transparency key)
  });
}

/**
 * Create a BMP with a green background (0,128,0) for building textures
 */
function createGreenKeyedBmp(width: number, height: number): Buffer {
  return createTestBmp(width, height, (x, y) => {
    const cx = width / 2;
    const cy = height / 2;
    const dist = Math.abs(x - cx) / cx + Math.abs(y - cy) / cy;
    if (dist < 0.8) {
      return [200, 100, 50]; // Brown (building)
    }
    return [0, 128, 0]; // Green (background)
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('decodeBmp', () => {
  it('should decode a 4x4 BMP with solid red pixels', () => {
    const bmp = createTestBmp(4, 4, () => [255, 0, 0]);
    const result = decodeBmp(bmp);

    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(result.pixels.length).toBe(4 * 4 * 4); // 4x4 RGBA

    // Check first pixel is red with full alpha
    expect(result.pixels[0]).toBe(255); // R
    expect(result.pixels[1]).toBe(0);   // G
    expect(result.pixels[2]).toBe(0);   // B
    expect(result.pixels[3]).toBe(255); // A
  });

  it('should decode a BMP with various colors', () => {
    const bmp = createTestBmp(2, 2, (x, y) => {
      if (x === 0 && y === 0) return [255, 0, 0];   // Red
      if (x === 1 && y === 0) return [0, 255, 0];   // Green
      if (x === 0 && y === 1) return [0, 0, 255];   // Blue
      return [255, 255, 255];                         // White
    });

    const result = decodeBmp(bmp);

    // Top-left (0,0) = Red
    expect(result.pixels[0]).toBe(255);
    expect(result.pixels[1]).toBe(0);
    expect(result.pixels[2]).toBe(0);

    // Top-right (1,0) = Green
    expect(result.pixels[4]).toBe(0);
    expect(result.pixels[5]).toBe(255);
    expect(result.pixels[6]).toBe(0);

    // Bottom-left (0,1) = Blue
    expect(result.pixels[8]).toBe(0);
    expect(result.pixels[9]).toBe(0);
    expect(result.pixels[10]).toBe(255);

    // Bottom-right (1,1) = White
    expect(result.pixels[12]).toBe(255);
    expect(result.pixels[13]).toBe(255);
    expect(result.pixels[14]).toBe(255);
  });

  it('should handle non-4-aligned widths (row padding)', () => {
    // Width=3: row = 9 bytes, padded to 12
    const bmp = createTestBmp(3, 2, (x, y) => [x * 80, y * 120, 100]);
    const result = decodeBmp(bmp);

    expect(result.width).toBe(3);
    expect(result.height).toBe(2);

    // (0,0) = [0, 0, 100]
    expect(result.pixels[0]).toBe(0);
    expect(result.pixels[1]).toBe(0);
    expect(result.pixels[2]).toBe(100);

    // (2,0) = [160, 0, 100]
    expect(result.pixels[8]).toBe(160);
    expect(result.pixels[9]).toBe(0);
    expect(result.pixels[10]).toBe(100);
  });

  it('should handle standard 64x32 tile size', () => {
    const bmp = createTestBmp(64, 32, () => [128, 128, 128]);
    const result = decodeBmp(bmp);

    expect(result.width).toBe(64);
    expect(result.height).toBe(32);
    expect(result.pixels.length).toBe(64 * 32 * 4);
  });

  it('should handle tall textures (64x90)', () => {
    const bmp = createTestBmp(64, 90, () => [100, 150, 200]);
    const result = decodeBmp(bmp);

    expect(result.width).toBe(64);
    expect(result.height).toBe(90);
  });

  it('should throw on invalid BMP signature', () => {
    const buffer = Buffer.alloc(54);
    buffer.writeUInt16LE(0x1234, 0); // Wrong signature

    expect(() => decodeBmp(buffer)).toThrow('Invalid BMP signature');
  });

  it('should throw on too-small buffer', () => {
    const buffer = Buffer.alloc(10);
    expect(() => decodeBmp(buffer)).toThrow('BMP file too small');
  });

  it('should throw on non-24-bit BMP', () => {
    const buffer = Buffer.alloc(54);
    buffer.writeUInt16LE(0x4D42, 0);  // BM
    buffer.writeUInt32LE(54, 10);      // Data offset
    buffer.writeUInt32LE(40, 14);      // Header size
    buffer.writeInt32LE(4, 18);        // Width
    buffer.writeInt32LE(4, 22);        // Height
    buffer.writeUInt16LE(32, 28);      // 32-bit (unsupported)
    buffer.writeUInt32LE(0, 30);       // No compression

    expect(() => decodeBmp(buffer)).toThrow('Unsupported BMP bit depth: 32');
  });

  it('should throw on compressed BMP', () => {
    const buffer = Buffer.alloc(54);
    buffer.writeUInt16LE(0x4D42, 0);
    buffer.writeUInt32LE(54, 10);
    buffer.writeUInt32LE(40, 14);
    buffer.writeInt32LE(4, 18);
    buffer.writeInt32LE(4, 22);
    buffer.writeUInt16LE(24, 28);
    buffer.writeUInt32LE(1, 30);       // RLE8 compression

    expect(() => decodeBmp(buffer)).toThrow('Unsupported BMP compression');
  });

  it('should decode an 8-bit indexed BMP', () => {
    // Create a minimal 8-bit BMP: 4x2, 4 palette colors
    const width = 4;
    const height = 2;
    const numColors = 4;
    const paletteSize = numColors * 4;
    const rowSize = Math.ceil(width / 4) * 4; // 4 bytes (already aligned)
    const dataSize = rowSize * height;
    const dataOffset = 54 + paletteSize;
    const fileSize = dataOffset + dataSize;
    const buffer = Buffer.alloc(fileSize);

    // File header
    buffer.writeUInt16LE(0x4D42, 0);
    buffer.writeUInt32LE(fileSize, 2);
    buffer.writeUInt32LE(dataOffset, 10);

    // Info header
    buffer.writeUInt32LE(40, 14);
    buffer.writeInt32LE(width, 18);
    buffer.writeInt32LE(height, 22);  // positive = bottom-up
    buffer.writeUInt16LE(1, 26);
    buffer.writeUInt16LE(8, 28);      // 8 bits per pixel
    buffer.writeUInt32LE(0, 30);      // No compression
    buffer.writeUInt32LE(dataSize, 34);
    buffer.writeUInt32LE(numColors, 46); // Colors used

    // Palette (BGR + reserved, 4 bytes each)
    // Color 0: Red (B=0, G=0, R=255)
    buffer[54] = 0; buffer[55] = 0; buffer[56] = 255; buffer[57] = 0;
    // Color 1: Green (B=0, G=255, R=0)
    buffer[58] = 0; buffer[59] = 255; buffer[60] = 0; buffer[61] = 0;
    // Color 2: Blue (B=255, G=0, R=0)
    buffer[62] = 255; buffer[63] = 0; buffer[64] = 0; buffer[65] = 0;
    // Color 3: White (B=255, G=255, R=255)
    buffer[66] = 255; buffer[67] = 255; buffer[68] = 255; buffer[69] = 0;

    // Pixel data (bottom-up: first row in file = bottom of image)
    // File row 0 at dataOffset = bottom of image = output row 1: indices [3, 2, 1, 0]
    buffer[dataOffset] = 3;     // White
    buffer[dataOffset + 1] = 2; // Blue
    buffer[dataOffset + 2] = 1; // Green
    buffer[dataOffset + 3] = 0; // Red

    // File row 1 at dataOffset+rowSize = top of image = output row 0: indices [0, 1, 2, 3]
    buffer[dataOffset + rowSize] = 0;     // Red
    buffer[dataOffset + rowSize + 1] = 1; // Green
    buffer[dataOffset + rowSize + 2] = 2; // Blue
    buffer[dataOffset + rowSize + 3] = 3; // White

    const decoded = decodeBmp(buffer);

    expect(decoded.width).toBe(4);
    expect(decoded.height).toBe(2);

    // Top-left pixel (row 0, col 0) = palette index 0 = Red
    expect(decoded.pixels[0]).toBe(255); // R
    expect(decoded.pixels[1]).toBe(0);   // G
    expect(decoded.pixels[2]).toBe(0);   // B
    expect(decoded.pixels[3]).toBe(255); // A

    // Top-right pixel (row 0, col 3) = palette index 3 = White
    expect(decoded.pixels[12]).toBe(255); // R
    expect(decoded.pixels[13]).toBe(255); // G
    expect(decoded.pixels[14]).toBe(255); // B

    // Bottom-left pixel (row 1, col 0) = palette index 3 = White
    expect(decoded.pixels[16]).toBe(255); // R
    expect(decoded.pixels[17]).toBe(255); // G
    expect(decoded.pixels[18]).toBe(255); // B

    // Bottom-right pixel (row 1, col 3) = palette index 0 = Red
    expect(decoded.pixels[28]).toBe(255); // R
    expect(decoded.pixels[29]).toBe(0);   // G
    expect(decoded.pixels[30]).toBe(0);   // B
  });
});

describe('detectColorKey', () => {
  it('should detect blue color key from corner pixel', () => {
    const bmp = createBlueKeyedBmp(64, 32);
    const decoded = decodeBmp(bmp);
    const key = detectColorKey(decoded.pixels);

    expect(key.r).toBe(0);
    expect(key.g).toBe(0);
    expect(key.b).toBe(255);
  });

  it('should detect green color key from corner pixel', () => {
    const bmp = createGreenKeyedBmp(64, 32);
    const decoded = decodeBmp(bmp);
    const key = detectColorKey(decoded.pixels);

    expect(key.r).toBe(0);
    expect(key.g).toBe(128);
    expect(key.b).toBe(0);
  });

  it('should detect gray color key', () => {
    const bmp = createTestBmp(4, 4, (x, y) => {
      if (x === 0 && y === 0) return [128, 128, 128];
      return [200, 100, 50];
    });
    const decoded = decodeBmp(bmp);
    const key = detectColorKey(decoded.pixels);

    expect(key.r).toBe(128);
    expect(key.g).toBe(128);
    expect(key.b).toBe(128);
  });
});

describe('applyColorKey', () => {
  it('should make matching pixels transparent', () => {
    const pixels = Buffer.from([
      0, 0, 255, 255,   // Blue (should become transparent)
      255, 0, 0, 255,   // Red (should stay opaque)
      0, 0, 255, 255,   // Blue (should become transparent)
      0, 200, 0, 255,   // Green (should stay opaque)
    ]);

    const count = applyColorKey(pixels, 2, 2, { r: 0, g: 0, b: 255 });

    expect(count).toBe(2);
    expect(pixels[3]).toBe(0);   // Blue pixel alpha = 0
    expect(pixels[7]).toBe(255); // Red pixel alpha = 255
    expect(pixels[11]).toBe(0);  // Blue pixel alpha = 0
    expect(pixels[15]).toBe(255); // Green pixel alpha = 255
  });

  it('should handle tolerance for near-matching pixels', () => {
    const pixels = Buffer.from([
      2, 1, 253, 255,  // Nearly blue (within tolerance=5)
      0, 0, 250, 255,  // Nearly blue (within tolerance=5)
      10, 10, 245, 255, // Not close enough
    ]);

    const count = applyColorKey(pixels, 3, 1, { r: 0, g: 0, b: 255 }, 5);

    expect(count).toBe(2);
    expect(pixels[3]).toBe(0);   // Nearly blue → transparent
    expect(pixels[7]).toBe(0);   // Nearly blue → transparent
    expect(pixels[11]).toBe(255); // Not close → opaque
  });

  it('should handle zero tolerance (exact match only)', () => {
    const pixels = Buffer.from([
      0, 0, 255, 255,  // Exact blue
      1, 0, 255, 255,  // Off by 1
    ]);

    const count = applyColorKey(pixels, 2, 1, { r: 0, g: 0, b: 255 }, 0);

    expect(count).toBe(1);
    expect(pixels[3]).toBe(0);   // Exact match → transparent
    expect(pixels[7]).toBe(255); // Not exact → opaque
  });

  it('should return 0 when no pixels match', () => {
    const pixels = Buffer.from([
      255, 0, 0, 255,
      0, 255, 0, 255,
    ]);

    const count = applyColorKey(pixels, 2, 1, { r: 0, g: 0, b: 255 });
    expect(count).toBe(0);
  });

  it('should handle all pixels matching', () => {
    const pixels = Buffer.from([
      0, 0, 255, 255,
      0, 0, 255, 255,
      0, 0, 255, 255,
      0, 0, 255, 255,
    ]);

    const count = applyColorKey(pixels, 2, 2, { r: 0, g: 0, b: 255 });
    expect(count).toBe(4);

    // All pixels should be transparent
    for (let i = 0; i < 4; i++) {
      expect(pixels[i * 4 + 3]).toBe(0);
    }
  });
});

describe('encodePng', () => {
  it('should produce valid PNG signature', () => {
    const pixels = Buffer.from([255, 0, 0, 255]); // 1x1 red pixel
    const png = encodePng(1, 1, pixels);

    // PNG signature: 137 80 78 71 13 10 26 10
    expect(png[0]).toBe(137);
    expect(png[1]).toBe(80);  // P
    expect(png[2]).toBe(78);  // N
    expect(png[3]).toBe(71);  // G
    expect(png[4]).toBe(13);
    expect(png[5]).toBe(10);
    expect(png[6]).toBe(26);
    expect(png[7]).toBe(10);
  });

  it('should contain IHDR chunk with correct dimensions', () => {
    const pixels = Buffer.alloc(4 * 4 * 4, 128); // 4x4 gray
    const png = encodePng(4, 4, pixels);

    // After signature (8 bytes), IHDR chunk starts:
    // 4 bytes length + 4 bytes 'IHDR' + 13 bytes data + 4 bytes CRC
    const ihdrLength = png.readUInt32BE(8);
    expect(ihdrLength).toBe(13);

    const ihdrType = png.toString('ascii', 12, 16);
    expect(ihdrType).toBe('IHDR');

    // Width and height in IHDR data
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(4);
    expect(height).toBe(4);

    // Bit depth and color type
    expect(png[24]).toBe(8); // 8-bit
    expect(png[25]).toBe(6); // RGBA
  });

  it('should produce decompressible IDAT chunk with Up filter', () => {
    const pixels = Buffer.from([255, 0, 0, 255]); // 1x1 red RGBA
    const png = encodePng(1, 1, pixels);

    // Find IDAT chunk (after signature + IHDR)
    // Signature: 8 bytes
    // IHDR: 4 (length) + 4 (type) + 13 (data) + 4 (crc) = 25 bytes
    const idatStart = 33; // 8 + 25

    const idatLength = png.readUInt32BE(idatStart);
    const idatType = png.toString('ascii', idatStart + 4, idatStart + 8);
    expect(idatType).toBe('IDAT');

    // Decompress IDAT data
    const idatData = png.subarray(idatStart + 8, idatStart + 8 + idatLength);
    const decompressed = zlib.inflateSync(idatData);

    // Should contain filter byte (2=Up) + 4 RGBA bytes for 1x1 image
    // For first row, Up filter with no row above = same as raw values
    expect(decompressed.length).toBe(5);
    expect(decompressed[0]).toBe(2);   // Filter: Up
    expect(decompressed[1]).toBe(255); // R (no row above, so raw value)
    expect(decompressed[2]).toBe(0);   // G
    expect(decompressed[3]).toBe(0);   // B
    expect(decompressed[4]).toBe(255); // A
  });

  it('should handle transparent pixels', () => {
    const pixels = Buffer.from([0, 0, 255, 0]); // 1x1 transparent blue
    const png = encodePng(1, 1, pixels);
    const decoded = decodePng(png);

    expect(decoded.pixels[3]).toBe(0); // Alpha = 0 (transparent)
    expect(decoded.pixels[2]).toBe(255); // B preserved
  });

  it('should contain IEND chunk', () => {
    const pixels = Buffer.from([255, 0, 0, 255]);
    const png = encodePng(1, 1, pixels);

    // IEND should be the last 12 bytes: 4 (length=0) + 4 ('IEND') + 4 (crc)
    const iendType = png.toString('ascii', png.length - 8, png.length - 4);
    expect(iendType).toBe('IEND');

    const iendLength = png.readUInt32BE(png.length - 12);
    expect(iendLength).toBe(0);
  });

  it('should roundtrip a 4x4 image correctly', () => {
    // Create a 4x4 RGBA image with known pattern
    const pixels = Buffer.alloc(4 * 4 * 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const idx = (y * 4 + x) * 4;
        pixels[idx] = x * 64;       // R
        pixels[idx + 1] = y * 64;   // G
        pixels[idx + 2] = 128;      // B
        pixels[idx + 3] = 255;      // A
      }
    }

    const png = encodePng(4, 4, pixels);
    const decoded = decodePng(png);

    expect(decoded.width).toBe(4);
    expect(decoded.height).toBe(4);
    expect(decoded.pixels.equals(pixels)).toBe(true);
  });
});

describe('bakeAlpha (file-based)', () => {
  const tmpDir = path.join(__dirname, '../../.test-tmp-baker');

  beforeEach(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up temp files
    if (fs.existsSync(tmpDir)) {
      const files = fs.readdirSync(tmpDir);
      for (const f of files) {
        fs.unlinkSync(path.join(tmpDir, f));
      }
      fs.rmdirSync(tmpDir);
    }
  });

  it('should convert BMP with blue key to PNG', () => {
    const bmpPath = path.join(tmpDir, 'test.bmp');
    const pngPath = path.join(tmpDir, 'test.png');

    const bmpData = createBlueKeyedBmp(64, 32);
    fs.writeFileSync(bmpPath, bmpData);

    const result = bakeAlpha(bmpPath, pngPath);

    expect(result.success).toBe(true);
    expect(result.width).toBe(64);
    expect(result.height).toBe(32);
    expect(result.colorKey).toEqual({ r: 0, g: 0, b: 255 });
    expect(result.transparentPixels).toBeGreaterThan(0);
    expect(result.totalPixels).toBe(64 * 32);
    expect(fs.existsSync(pngPath)).toBe(true);

    // Verify PNG file starts with correct signature
    const pngBuffer = fs.readFileSync(pngPath);
    expect(pngBuffer[0]).toBe(137);
    expect(pngBuffer[1]).toBe(80);
    expect(pngBuffer[2]).toBe(78);
    expect(pngBuffer[3]).toBe(71);
  });

  it('should use static color key when provided', () => {
    const bmpPath = path.join(tmpDir, 'building.bmp');
    const pngPath = path.join(tmpDir, 'building.png');

    const bmpData = createGreenKeyedBmp(64, 32);
    fs.writeFileSync(bmpPath, bmpData);

    const result = bakeAlpha(bmpPath, pngPath, { r: 0, g: 128, b: 0 });

    expect(result.success).toBe(true);
    expect(result.colorKey).toEqual({ r: 0, g: 128, b: 0 });
    expect(result.transparentPixels).toBeGreaterThan(0);
  });

  it('should auto-generate output path from input path', () => {
    const bmpPath = path.join(tmpDir, 'auto.bmp');
    const expectedPng = path.join(tmpDir, 'auto.png');

    fs.writeFileSync(bmpPath, createBlueKeyedBmp(8, 8));

    const result = bakeAlpha(bmpPath);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe(expectedPng);
    expect(fs.existsSync(expectedPng)).toBe(true);
  });

  it('should handle missing input file gracefully', () => {
    const result = bakeAlpha(path.join(tmpDir, 'nonexistent.bmp'));

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should handle invalid BMP data gracefully', () => {
    const bmpPath = path.join(tmpDir, 'invalid.bmp');
    fs.writeFileSync(bmpPath, Buffer.from('not a bmp file'));

    const result = bakeAlpha(bmpPath);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('bakeDirectory', () => {
  const tmpDir = path.join(__dirname, '../../.test-tmp-baker-dir');

  beforeEach(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      const files = fs.readdirSync(tmpDir);
      for (const f of files) {
        fs.unlinkSync(path.join(tmpDir, f));
      }
      fs.rmdirSync(tmpDir);
    }
  });

  it('should process all BMP files in directory', () => {
    // Create 3 test BMPs
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(
        path.join(tmpDir, `tile${i}.bmp`),
        createBlueKeyedBmp(8, 8)
      );
    }

    const results = bakeDirectory(tmpDir);

    expect(results.length).toBe(3);
    for (const result of results) {
      expect(result.success).toBe(true);
    }

    // Verify PNG files exist
    for (let i = 0; i < 3; i++) {
      expect(fs.existsSync(path.join(tmpDir, `tile${i}.png`))).toBe(true);
    }
  });

  it('should skip non-BMP files', () => {
    fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'hello');
    fs.writeFileSync(path.join(tmpDir, 'tile.bmp'), createBlueKeyedBmp(8, 8));

    const results = bakeDirectory(tmpDir);

    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);
  });

  it('should skip already-processed PNGs (newer than BMP)', () => {
    const bmpPath = path.join(tmpDir, 'cached.bmp');
    const pngPath = path.join(tmpDir, 'cached.png');

    fs.writeFileSync(bmpPath, createBlueKeyedBmp(8, 8));

    // First bake
    bakeAlpha(bmpPath, pngPath);

    // Second bake via directory should skip
    const results = bakeDirectory(tmpDir);

    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);
    // Skipped file has width=0 (not re-processed)
    expect(results[0].width).toBe(0);
  });

  it('should return empty array for non-existent directory', () => {
    const results = bakeDirectory('/nonexistent/path');
    expect(results).toEqual([]);
  });

  it('should use static color key when provided', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'building.bmp'),
      createGreenKeyedBmp(8, 8)
    );

    const results = bakeDirectory(tmpDir, { r: 0, g: 128, b: 0 });

    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);
  });
});

// ============================================================================
// decodePng tests
// ============================================================================

describe('decodePng', () => {
  it('should round-trip a 1x1 red pixel', () => {
    const original = Buffer.from([255, 0, 0, 255]);
    const png = encodePng(1, 1, original);
    const decoded = decodePng(png);

    expect(decoded.width).toBe(1);
    expect(decoded.height).toBe(1);
    expect(decoded.pixels[0]).toBe(255); // R
    expect(decoded.pixels[1]).toBe(0);   // G
    expect(decoded.pixels[2]).toBe(0);   // B
    expect(decoded.pixels[3]).toBe(255); // A
  });

  it('should round-trip a 4x4 image with known pattern', () => {
    const original = Buffer.alloc(4 * 4 * 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const idx = (y * 4 + x) * 4;
        original[idx] = x * 60;
        original[idx + 1] = y * 60;
        original[idx + 2] = 128;
        original[idx + 3] = 200;
      }
    }

    const png = encodePng(4, 4, original);
    const decoded = decodePng(png);

    expect(decoded.width).toBe(4);
    expect(decoded.height).toBe(4);
    expect(decoded.pixels.length).toBe(4 * 4 * 4);
    expect(decoded.pixels.equals(original)).toBe(true);
  });

  it('should round-trip transparent pixels', () => {
    const original = Buffer.from([0, 0, 255, 0]); // transparent blue
    const png = encodePng(1, 1, original);
    const decoded = decodePng(png);

    expect(decoded.pixels[3]).toBe(0); // Alpha = 0
    expect(decoded.pixels[2]).toBe(255); // B preserved
  });

  it('should reject invalid PNG signature', () => {
    expect(() => decodePng(Buffer.from('not a png'))).toThrow('Invalid PNG signature');
  });

  it('should reject buffer too small', () => {
    expect(() => decodePng(Buffer.alloc(4))).toThrow('Invalid PNG signature');
  });

  it('should round-trip a larger image (64x32)', () => {
    const w = 64, h = 32;
    const original = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h * 4; i++) {
      original[i] = i % 256;
    }

    const png = encodePng(w, h, original);
    const decoded = decodePng(png);

    expect(decoded.width).toBe(w);
    expect(decoded.height).toBe(h);
    expect(decoded.pixels.equals(original)).toBe(true);
  });
});

// ============================================================================
// decodeBmpIndices tests
// ============================================================================

/**
 * Create a minimal 8-bit indexed BMP with specified palette indices.
 */
function createTest8bitBmp(
  width: number,
  height: number,
  indexFn: (x: number, y: number) => number
): Buffer {
  const numColors = 256;
  const paletteSize = numColors * 4;
  const rowSize = Math.ceil(width / 4) * 4;
  const dataSize = rowSize * height;
  const dataOffset = 54 + paletteSize;
  const fileSize = dataOffset + dataSize;
  const buffer = Buffer.alloc(fileSize);

  // File header
  buffer.writeUInt16LE(0x4D42, 0);
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(dataOffset, 10);

  // Info header
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22); // positive = bottom-up
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(8, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(dataSize, 34);
  buffer.writeUInt32LE(numColors, 46);

  // Palette (256 dummy colors)
  for (let i = 0; i < numColors; i++) {
    const off = 54 + i * 4;
    buffer[off] = i;     // B
    buffer[off + 1] = i; // G
    buffer[off + 2] = i; // R
    buffer[off + 3] = 0; // reserved
  }

  // Pixel data (bottom-up)
  for (let y = 0; y < height; y++) {
    const srcRow = height - 1 - y; // bottom-up
    const rowOffset = dataOffset + srcRow * rowSize;

    for (let x = 0; x < width; x++) {
      buffer[rowOffset + x] = indexFn(x, y);
    }
  }

  return buffer;
}

describe('decodeBmpIndices', () => {
  it('should decode a 4x4 8-bit indexed BMP to raw indices', () => {
    const bmp = createTest8bitBmp(4, 4, (x, y) => y * 4 + x);
    const result = decodeBmpIndices(bmp);

    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(result.indices.length).toBe(16);

    // Check specific indices
    expect(result.indices[0]).toBe(0);   // (0,0)
    expect(result.indices[1]).toBe(1);   // (1,0)
    expect(result.indices[4]).toBe(4);   // (0,1)
    expect(result.indices[15]).toBe(15); // (3,3)
  });

  it('should preserve palette indices 0-255', () => {
    // 16x16 map with all possible values
    const bmp = createTest8bitBmp(16, 16, (x, y) => y * 16 + x);
    const result = decodeBmpIndices(bmp);

    expect(result.indices.length).toBe(256);
    for (let i = 0; i < 256; i++) {
      expect(result.indices[i]).toBe(i);
    }
  });

  it('should reject 24-bit BMP', () => {
    const bmp24 = createTestBmp(4, 4, () => [255, 0, 0]);
    expect(() => decodeBmpIndices(bmp24)).toThrow('only supports 8-bit indexed');
  });

  it('should reject invalid BMP signature', () => {
    const badBuf = Buffer.alloc(60, 0); // >= 54 bytes but no valid BMP signature
    expect(() => decodeBmpIndices(badBuf)).toThrow('Invalid BMP signature');
  });
});

// ============================================================================
// downscaleRGBA2x tests
// ============================================================================

// ============================================================================
// PNG Up filter compression tests
// ============================================================================

describe('encodePng Up filter', () => {
  it('should use filter type 2 (Up) in IDAT data', () => {
    const pixels = Buffer.alloc(4 * 3 * 4, 128); // 4x3 uniform gray
    const png = encodePng(4, 3, pixels);

    // Find and decompress IDAT
    const idatStart = 33;
    const idatLength = png.readUInt32BE(idatStart);
    const idatData = png.subarray(idatStart + 8, idatStart + 8 + idatLength);
    const decompressed = zlib.inflateSync(idatData);

    const rowBytes = 4 * 4;
    // Every row should have filter byte = 2
    for (let y = 0; y < 3; y++) {
      expect(decompressed[y * (1 + rowBytes)]).toBe(2);
    }
  });

  it('should produce significantly smaller output for uniform terrain', () => {
    // Simulate terrain-like data: large flat regions with same color
    const w = 64, h = 32;
    const pixels = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        // Flat green terrain with slight horizontal variation
        pixels[idx] = 34;
        pixels[idx + 1] = 139;
        pixels[idx + 2] = 34;
        pixels[idx + 3] = 255;
      }
    }

    const png = encodePng(w, h, pixels);

    // For comparison: encode with filter 0 + level 6 (old method)
    const rowBytes = w * 4;
    const rawDataOld = Buffer.alloc(h * (1 + rowBytes));
    for (let y = 0; y < h; y++) {
      const off = y * (1 + rowBytes);
      rawDataOld[off] = 0; // Filter: None
      pixels.copy(rawDataOld, off + 1, y * rowBytes, (y + 1) * rowBytes);
    }
    const compressedOld = zlib.deflateSync(rawDataOld, { level: 6 });
    // Old PNG would be: signature(8) + IHDR(25) + IDAT(12+compressedOld) + IEND(12)
    const oldSize = 8 + 25 + 12 + compressedOld.length + 12;

    // New (Up filter + level 9) should be smaller
    expect(png.length).toBeLessThan(oldSize);
  });

  it('should produce smaller output for vertically repetitive data', () => {
    // Data where every row is identical — Up filter produces all zeros after row 0
    // Use larger size where the filter difference is meaningful
    const w = 128, h = 64;
    const pixels = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        pixels[idx] = x * 2;     // R varies horizontally
        pixels[idx + 1] = 100;
        pixels[idx + 2] = 50;
        pixels[idx + 3] = 255;
      }
    }

    const png = encodePng(w, h, pixels);

    // Old method for comparison (filter 0 + level 6)
    const rowBytes = w * 4;
    const rawDataOld = Buffer.alloc(h * (1 + rowBytes));
    for (let y = 0; y < h; y++) {
      const off = y * (1 + rowBytes);
      rawDataOld[off] = 0;
      pixels.copy(rawDataOld, off + 1, y * rowBytes, (y + 1) * rowBytes);
    }
    const compressedOld = zlib.deflateSync(rawDataOld, { level: 6 });
    const oldSize = 8 + 25 + 12 + compressedOld.length + 12;

    // Up filter on identical rows should compress better
    expect(png.length).toBeLessThan(oldSize);
  });

  it('should round-trip a single-row image', () => {
    // Edge case: single row means Up filter has no row above (above=0)
    const pixels = Buffer.from([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
    ]);

    const png = encodePng(3, 1, pixels);
    const decoded = decodePng(png);

    expect(decoded.width).toBe(3);
    expect(decoded.height).toBe(1);
    expect(decoded.pixels.equals(pixels)).toBe(true);
  });

  it('should round-trip a single-pixel image', () => {
    const pixels = Buffer.from([42, 99, 200, 128]);
    const png = encodePng(1, 1, pixels);
    const decoded = decodePng(png);

    expect(decoded.pixels.equals(pixels)).toBe(true);
  });

  it('should round-trip a fully transparent image', () => {
    const w = 8, h = 8;
    const pixels = Buffer.alloc(w * h * 4, 0); // All zeros (transparent black)
    const png = encodePng(w, h, pixels);
    const decoded = decodePng(png);

    expect(decoded.pixels.equals(pixels)).toBe(true);
  });

  it('should round-trip a large image with varied pixel data', () => {
    // Simulates a realistic chunk with varied content
    const w = 128, h = 64;
    const pixels = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        pixels[idx] = (x * 7 + y * 13) % 256;
        pixels[idx + 1] = (x * 3 + y * 11) % 256;
        pixels[idx + 2] = (x * 5 + y * 17) % 256;
        pixels[idx + 3] = x < 10 || x > 117 ? 0 : 255; // Transparent edges
      }
    }

    const png = encodePng(w, h, pixels);
    const decoded = decodePng(png);

    expect(decoded.width).toBe(w);
    expect(decoded.height).toBe(h);
    expect(decoded.pixels.equals(pixels)).toBe(true);
  });
});

// ============================================================================
// downscaleRGBA2x tests
// ============================================================================

describe('downscaleRGBA2x', () => {
  it('should downscale a 4x4 image to 2x2', () => {
    // 4x4 image: each 2x2 block has the same color
    const src = Buffer.alloc(4 * 4 * 4);

    // Block (0,0): all red (255,0,0,255)
    for (const [x, y] of [[0,0],[1,0],[0,1],[1,1]]) {
      const idx = (y * 4 + x) * 4;
      src[idx] = 255; src[idx+1] = 0; src[idx+2] = 0; src[idx+3] = 255;
    }
    // Block (1,0): all green (0,255,0,255)
    for (const [x, y] of [[2,0],[3,0],[2,1],[3,1]]) {
      const idx = (y * 4 + x) * 4;
      src[idx] = 0; src[idx+1] = 255; src[idx+2] = 0; src[idx+3] = 255;
    }
    // Block (0,1): all blue (0,0,255,255)
    for (const [x, y] of [[0,2],[1,2],[0,3],[1,3]]) {
      const idx = (y * 4 + x) * 4;
      src[idx] = 0; src[idx+1] = 0; src[idx+2] = 255; src[idx+3] = 255;
    }
    // Block (1,1): all white (255,255,255,255)
    for (const [x, y] of [[2,2],[3,2],[2,3],[3,3]]) {
      const idx = (y * 4 + x) * 4;
      src[idx] = 255; src[idx+1] = 255; src[idx+2] = 255; src[idx+3] = 255;
    }

    const result = downscaleRGBA2x(src, 4, 4);

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.pixels.length).toBe(2 * 2 * 4);

    // Pixel (0,0) = red
    expect(result.pixels[0]).toBe(255);
    expect(result.pixels[1]).toBe(0);
    expect(result.pixels[2]).toBe(0);
    expect(result.pixels[3]).toBe(255);

    // Pixel (1,0) = green
    expect(result.pixels[4]).toBe(0);
    expect(result.pixels[5]).toBe(255);
    expect(result.pixels[6]).toBe(0);
    expect(result.pixels[7]).toBe(255);

    // Pixel (0,1) = blue
    expect(result.pixels[8]).toBe(0);
    expect(result.pixels[9]).toBe(0);
    expect(result.pixels[10]).toBe(255);
    expect(result.pixels[11]).toBe(255);

    // Pixel (1,1) = white
    expect(result.pixels[12]).toBe(255);
    expect(result.pixels[13]).toBe(255);
    expect(result.pixels[14]).toBe(255);
    expect(result.pixels[15]).toBe(255);
  });

  it('should average mixed colors in 2x2 blocks', () => {
    // 2x2 image with different colors → 1x1 average
    const src = Buffer.from([
      100, 0, 0, 255,    // (0,0): R=100
      200, 0, 0, 255,    // (1,0): R=200
      0, 0, 0, 255,      // (0,1): R=0
      100, 0, 0, 255,    // (1,1): R=100
    ]);

    const result = downscaleRGBA2x(src, 2, 2);

    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    // Average R = (100 + 200 + 0 + 100 + 2) / 4 = 100 (with rounding bias)
    expect(result.pixels[0]).toBe(100);
    expect(result.pixels[3]).toBe(255);
  });

  it('should average alpha channel', () => {
    // 2x2 image: 2 opaque + 2 transparent
    const src = Buffer.from([
      255, 0, 0, 255,    // opaque
      255, 0, 0, 0,      // transparent
      255, 0, 0, 0,      // transparent
      255, 0, 0, 255,    // opaque
    ]);

    const result = downscaleRGBA2x(src, 2, 2);

    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    // Average alpha = (255 + 0 + 0 + 255 + 2) / 4 = 128
    expect(result.pixels[3]).toBe(128);
  });

  it('should handle odd dimensions by truncating', () => {
    // 5x3 → 2x1 (drops last column and last row)
    const src = Buffer.alloc(5 * 3 * 4, 128);

    const result = downscaleRGBA2x(src, 5, 3);

    expect(result.width).toBe(2);
    expect(result.height).toBe(1);
    // All channels should be 128 (uniform input)
    expect(result.pixels[0]).toBe(128);
    expect(result.pixels[1]).toBe(128);
    expect(result.pixels[2]).toBe(128);
    expect(result.pixels[3]).toBe(128);
  });

  it('should handle cascading downscales (simulating zoom levels)', () => {
    // Start with 8x8, downscale 3 times: 8→4→2→1
    const src = Buffer.alloc(8 * 8 * 4);
    for (let i = 0; i < 8 * 8; i++) {
      src[i * 4] = 200;      // R
      src[i * 4 + 1] = 100;  // G
      src[i * 4 + 2] = 50;   // B
      src[i * 4 + 3] = 255;  // A
    }

    const d1 = downscaleRGBA2x(src, 8, 8);
    expect(d1.width).toBe(4);
    expect(d1.height).toBe(4);

    const d2 = downscaleRGBA2x(d1.pixels, d1.width, d1.height);
    expect(d2.width).toBe(2);
    expect(d2.height).toBe(2);

    const d3 = downscaleRGBA2x(d2.pixels, d2.width, d2.height);
    expect(d3.width).toBe(1);
    expect(d3.height).toBe(1);

    // Uniform input should remain uniform after any number of downscales
    expect(d3.pixels[0]).toBe(200);
    expect(d3.pixels[1]).toBe(100);
    expect(d3.pixels[2]).toBe(50);
    expect(d3.pixels[3]).toBe(255);
  });
});
