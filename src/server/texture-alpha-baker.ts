/**
 * TextureAlphaBaker
 *
 * Converts BMP images with color key transparency to PNG images with alpha channel.
 * This pre-bakes the transparency server-side, eliminating per-pixel color keying on the client.
 *
 * BMP format handled: 8-bit indexed and 24-bit uncompressed (SPO terrain/road/concrete textures)
 * PNG output: 32-bit RGBA with pre-computed alpha channel
 *
 * Color key detection:
 * - Dynamic: reads corner pixel (0,0) which is always outside the isometric diamond
 * - Static: uses a provided RGB color key (e.g., green for buildings)
 *
 * No external dependencies - uses Node's built-in zlib for PNG compression.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

/**
 * RGB color used as transparency key
 */
export interface ColorKey {
  r: number;
  g: number;
  b: number;
}

/**
 * Result of a bake operation
 */
export interface BakeResult {
  success: boolean;
  inputPath: string;
  outputPath: string;
  width: number;
  height: number;
  colorKey: ColorKey;
  transparentPixels: number;
  totalPixels: number;
  error?: string;
}

/**
 * Decoded BMP image data
 */
interface BmpData {
  width: number;
  height: number;
  /** RGBA pixel data, top-to-bottom, left-to-right */
  pixels: Buffer;
}

// ============================================================================
// CRC32 for PNG chunk checksums (no external dependency)
// ============================================================================

const CRC_TABLE: Uint32Array = new Uint32Array(256);

// Initialize CRC table
(function initCrcTable() {
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xEDB88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    CRC_TABLE[n] = c >>> 0;
  }
})();

function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ============================================================================
// BMP Decoder (8-bit indexed and 24-bit uncompressed)
// ============================================================================

/**
 * Decode an 8-bit or 24-bit uncompressed BMP file to RGBA pixel data.
 * BMP stores pixels bottom-up in BGR order with row padding to 4-byte boundary.
 * 8-bit BMPs have a color palette (up to 256 entries of 4 bytes: B,G,R,reserved).
 *
 * @param buffer - Raw BMP file data
 * @returns Decoded image with RGBA pixels (top-to-bottom, left-to-right)
 * @throws Error if BMP format is not supported
 */
export function decodeBmp(buffer: Buffer): BmpData {
  // BMP File Header (14 bytes)
  if (buffer.length < 54) {
    throw new Error('BMP file too small (< 54 bytes)');
  }

  const signature = buffer.readUInt16LE(0);
  if (signature !== 0x4D42) { // 'BM'
    throw new Error(`Invalid BMP signature: 0x${signature.toString(16)}`);
  }

  const dataOffset = buffer.readUInt32LE(10);

  // BMP Info Header (BITMAPINFOHEADER = 40 bytes)
  const headerSize = buffer.readUInt32LE(14);
  if (headerSize < 40) {
    throw new Error(`Unsupported BMP header size: ${headerSize}`);
  }

  const width = buffer.readInt32LE(18);
  const height = buffer.readInt32LE(22);
  const bitsPerPixel = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);

  if (bitsPerPixel !== 8 && bitsPerPixel !== 24) {
    throw new Error(`Unsupported BMP bit depth: ${bitsPerPixel} (only 8-bit and 24-bit supported)`);
  }

  if (compression !== 0) {
    throw new Error(`Unsupported BMP compression: ${compression} (only uncompressed supported)`);
  }

  // BMP height can be negative (top-down storage) but usually positive (bottom-up)
  const isBottomUp = height > 0;
  const absHeight = Math.abs(height);

  // Create RGBA output buffer
  const pixels = Buffer.alloc(width * absHeight * 4);

  if (bitsPerPixel === 8) {
    // 8-bit indexed: read color palette (located right after the info header)
    const paletteOffset = 14 + headerSize;
    const numColors = buffer.readUInt32LE(46) || 256; // biClrUsed, 0 means 256
    const palette: Array<{ r: number; g: number; b: number }> = [];

    for (let i = 0; i < numColors; i++) {
      const off = paletteOffset + i * 4;
      palette.push({
        r: buffer[off + 2], // BGR order in palette
        g: buffer[off + 1],
        b: buffer[off],
      });
    }

    // Row size: 1 byte per pixel, padded to 4-byte boundary
    const rowSize = Math.ceil(width / 4) * 4;

    for (let y = 0; y < absHeight; y++) {
      const srcRow = isBottomUp ? (absHeight - 1 - y) : y;
      const srcOffset = dataOffset + srcRow * rowSize;

      for (let x = 0; x < width; x++) {
        const paletteIndex = buffer[srcOffset + x];
        const color = palette[paletteIndex] || { r: 0, g: 0, b: 0 };
        const dstIdx = (y * width + x) * 4;

        pixels[dstIdx] = color.r;
        pixels[dstIdx + 1] = color.g;
        pixels[dstIdx + 2] = color.b;
        pixels[dstIdx + 3] = 255; // Fully opaque
      }
    }
  } else {
    // 24-bit: 3 bytes per pixel in BGR order
    const rowSize = Math.ceil((width * 3) / 4) * 4;

    for (let y = 0; y < absHeight; y++) {
      const srcRow = isBottomUp ? (absHeight - 1 - y) : y;
      const srcOffset = dataOffset + srcRow * rowSize;

      for (let x = 0; x < width; x++) {
        const srcIdx = srcOffset + x * 3;
        const dstIdx = (y * width + x) * 4;

        pixels[dstIdx] = buffer[srcIdx + 2];     // R
        pixels[dstIdx + 1] = buffer[srcIdx + 1]; // G
        pixels[dstIdx + 2] = buffer[srcIdx];     // B
        pixels[dstIdx + 3] = 255;                // A (fully opaque)
      }
    }
  }

  return { width, height: absHeight, pixels };
}

// ============================================================================
// PNG Encoder (minimal, RGBA only)
// ============================================================================

/**
 * Create a PNG chunk with type, data, and CRC
 */
function createPngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crcValue = crc32(crcInput);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crcValue, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

/**
 * Encode RGBA pixel data as a PNG file.
 *
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param rgbaPixels - RGBA pixel data (4 bytes per pixel, top-to-bottom)
 * @returns PNG file buffer
 */
export function encodePng(width: number, height: number, rgbaPixels: Buffer): Buffer {
  // Build raw scanlines with filter byte (0 = None) for each row
  const rowBytes = width * 4;
  const rawData = Buffer.alloc(height * (1 + rowBytes));

  for (let y = 0; y < height; y++) {
    const rawOffset = y * (1 + rowBytes);
    rawData[rawOffset] = 0; // Filter type: None
    rgbaPixels.copy(rawData, rawOffset + 1, y * rowBytes, (y + 1) * rowBytes);
  }

  const compressed = zlib.deflateSync(rawData, { level: 6 });

  const chunks: Buffer[] = [];

  // PNG Signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // Bit depth
  ihdr[9] = 6;  // Color type: RGBA
  ihdr[10] = 0; // Compression method
  ihdr[11] = 0; // Filter method
  ihdr[12] = 0; // Interlace method
  chunks.push(createPngChunk('IHDR', ihdr));

  // IDAT chunk (compressed pixel data)
  chunks.push(createPngChunk('IDAT', compressed));

  // IEND chunk
  chunks.push(createPngChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

// ============================================================================
// Alpha Baking
// ============================================================================

/**
 * Apply color key transparency to RGBA pixel data.
 * Pixels matching the color key (within tolerance) get alpha set to 0.
 *
 * @param pixels - RGBA pixel buffer (modified in place)
 * @param width - Image width
 * @param height - Image height
 * @param colorKey - RGB color to make transparent
 * @param tolerance - Color matching tolerance (default 5)
 * @returns Number of pixels made transparent
 */
export function applyColorKey(
  pixels: Buffer,
  width: number,
  height: number,
  colorKey: ColorKey,
  tolerance: number = 5
): number {
  let transparentCount = 0;
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];

    if (
      Math.abs(r - colorKey.r) <= tolerance &&
      Math.abs(g - colorKey.g) <= tolerance &&
      Math.abs(b - colorKey.b) <= tolerance
    ) {
      pixels[offset + 3] = 0; // Set alpha to 0 (fully transparent)
      transparentCount++;
    }
  }

  return transparentCount;
}

/**
 * Detect color key from the corner pixel (0,0) of an image.
 * The corner is always outside the isometric diamond shape.
 *
 * @param pixels - RGBA pixel buffer
 * @returns RGB color key detected from (0,0)
 */
export function detectColorKey(pixels: Buffer): ColorKey {
  return {
    r: pixels[0],
    g: pixels[1],
    b: pixels[2]
  };
}

/**
 * Bake alpha transparency into a single BMP file, producing a PNG with alpha channel.
 *
 * @param inputPath - Path to the input BMP file
 * @param outputPath - Path for the output PNG file (if omitted, replaces .bmp with .png)
 * @param staticColorKey - Optional static color key (if null, auto-detects from corner pixel)
 * @param tolerance - Color matching tolerance (default 5)
 * @returns BakeResult with success/failure info
 */
export function bakeAlpha(
  inputPath: string,
  outputPath?: string,
  staticColorKey?: ColorKey | null,
  tolerance: number = 5
): BakeResult {
  const outPath = outputPath || inputPath.replace(/\.bmp$/i, '.png');

  try {
    const bmpBuffer = fs.readFileSync(inputPath);
    const bmpData = decodeBmp(bmpBuffer);

    // Detect or use provided color key
    const colorKey = staticColorKey || detectColorKey(bmpData.pixels);

    // Apply color key transparency
    const transparentPixels = applyColorKey(
      bmpData.pixels,
      bmpData.width,
      bmpData.height,
      colorKey,
      tolerance
    );

    // Encode as PNG
    const pngBuffer = encodePng(bmpData.width, bmpData.height, bmpData.pixels);

    // Write output file
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(outPath, pngBuffer);

    return {
      success: true,
      inputPath,
      outputPath: outPath,
      width: bmpData.width,
      height: bmpData.height,
      colorKey,
      transparentPixels,
      totalPixels: bmpData.width * bmpData.height,
    };
  } catch (error: unknown) {
    return {
      success: false,
      inputPath,
      outputPath: outPath,
      width: 0,
      height: 0,
      colorKey: { r: 0, g: 0, b: 0 },
      transparentPixels: 0,
      totalPixels: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Bake alpha for a GIF file. GIF files are handled differently:
 * they use createImageBitmap on the client which handles transparency natively.
 * For GIF buildings with green (0,128,0) background, we still need to convert.
 *
 * Since GIF decoding is complex and buildings are handled separately (Option A in plan),
 * this function just copies the file and returns success.
 * Building textures will continue to use pre-baked alpha only for BMP format.
 *
 * @param inputPath - Path to the input GIF file
 * @param outputPath - Output path (currently just returns the input path)
 * @returns BakeResult
 */
export function bakeAlphaGif(
  inputPath: string,
  outputPath?: string
): BakeResult {
  return {
    success: true,
    inputPath,
    outputPath: outputPath || inputPath,
    width: 0,
    height: 0,
    colorKey: { r: 0, g: 128, b: 0 },
    transparentPixels: 0,
    totalPixels: 0,
  };
}

// ============================================================================
// RGBA Downscaler (2× box filter for chunk zoom levels)
// ============================================================================

/**
 * Downscale an RGBA buffer by 2× using box filtering.
 * Each 2×2 block of source pixels is averaged into a single destination pixel.
 * Used to generate lower-zoom terrain chunks from zoom-3 base.
 *
 * @param src - Source RGBA pixel buffer
 * @param srcW - Source width in pixels
 * @param srcH - Source height in pixels
 * @returns Downscaled pixels with new dimensions (floor division by 2)
 */
export function downscaleRGBA2x(
  src: Buffer, srcW: number, srcH: number
): { pixels: Buffer; width: number; height: number } {
  const dstW = Math.floor(srcW / 2);
  const dstH = Math.floor(srcH / 2);
  const dst = Buffer.alloc(dstW * dstH * 4, 0);

  for (let dy = 0; dy < dstH; dy++) {
    const sy = dy * 2;
    for (let dx = 0; dx < dstW; dx++) {
      const sx = dx * 2;

      // Indices for 2×2 source block
      const i00 = (sy * srcW + sx) * 4;
      const i10 = (sy * srcW + sx + 1) * 4;
      const i01 = ((sy + 1) * srcW + sx) * 4;
      const i11 = ((sy + 1) * srcW + sx + 1) * 4;

      // Box filter: average of 4 pixels
      const dstIdx = (dy * dstW + dx) * 4;
      dst[dstIdx]     = (src[i00] + src[i10] + src[i01] + src[i11] + 2) >> 2;     // R
      dst[dstIdx + 1] = (src[i00 + 1] + src[i10 + 1] + src[i01 + 1] + src[i11 + 1] + 2) >> 2; // G
      dst[dstIdx + 2] = (src[i00 + 2] + src[i10 + 2] + src[i01 + 2] + src[i11 + 2] + 2) >> 2; // B
      dst[dstIdx + 3] = (src[i00 + 3] + src[i10 + 3] + src[i01 + 3] + src[i11 + 3] + 2) >> 2; // A
    }
  }

  return { pixels: dst, width: dstW, height: dstH };
}

// ============================================================================
// PNG Decoder (minimal, RGBA only — decodes PNGs produced by encodePng)
// ============================================================================

/**
 * Decoded PNG image data
 */
export interface PngData {
  width: number;
  height: number;
  /** RGBA pixel data, top-to-bottom, left-to-right */
  pixels: Buffer;
}

/**
 * Decode a PNG file to raw RGBA pixel data.
 * This minimal decoder handles PNGs produced by our own encodePng() function:
 * - 8-bit RGBA (color type 6)
 * - Filter type 0 (None) on all rows
 * - Single IDAT chunk (or multiple concatenated)
 * - No interlacing
 *
 * @param buffer - Raw PNG file data
 * @returns Decoded image with RGBA pixels (top-to-bottom, left-to-right)
 * @throws Error if PNG format is not supported
 */
export function decodePng(buffer: Buffer): PngData {
  // Verify PNG signature (8 bytes)
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Invalid PNG signature');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  // Parse chunks
  let offset = 8;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;

    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const chunkData = buffer.subarray(offset + 8, offset + 8 + chunkLength);

    if (chunkType === 'IHDR') {
      if (chunkLength < 13) throw new Error('Invalid IHDR chunk');
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
      const compression = chunkData[10];
      const interlace = chunkData[12];

      if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth} (only 8-bit supported)`);
      if (colorType !== 6) throw new Error(`Unsupported PNG color type: ${colorType} (only RGBA type 6 supported)`);
      if (compression !== 0) throw new Error(`Unsupported PNG compression: ${compression}`);
      if (interlace !== 0) throw new Error('Interlaced PNGs not supported');
    } else if (chunkType === 'IDAT') {
      idatChunks.push(chunkData);
    } else if (chunkType === 'IEND') {
      break;
    }

    // Move to next chunk (length + type + data + CRC)
    offset += 4 + 4 + chunkLength + 4;
  }

  if (width === 0 || height === 0) {
    throw new Error('Missing IHDR chunk in PNG');
  }

  if (idatChunks.length === 0) {
    throw new Error('Missing IDAT chunk in PNG');
  }

  // Decompress IDAT data
  const compressedData = Buffer.concat(idatChunks);
  const rawData = zlib.inflateSync(compressedData);

  // Remove filter bytes (one per row)
  const rowBytes = width * 4;
  const expectedSize = height * (1 + rowBytes);

  if (rawData.length !== expectedSize) {
    throw new Error(`PNG data size mismatch: expected ${expectedSize}, got ${rawData.length}`);
  }

  const pixels = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    const filterByte = rawData[y * (1 + rowBytes)];
    if (filterByte !== 0) {
      throw new Error(`Unsupported PNG filter type: ${filterByte} (only None=0 supported)`);
    }

    // Copy row data (skip the filter byte)
    rawData.copy(pixels, y * rowBytes, y * (1 + rowBytes) + 1, y * (1 + rowBytes) + 1 + rowBytes);
  }

  return { width, height, pixels };
}

// ============================================================================
// BMP Index Decoder (8-bit indexed only — returns raw palette indices)
// ============================================================================

/**
 * Decoded BMP palette indices (raw 8-bit values, not RGBA)
 */
export interface BmpIndexData {
  width: number;
  height: number;
  /** Raw palette indices (1 byte per pixel, top-to-bottom, left-to-right) */
  indices: Uint8Array;
}

/**
 * Decode an 8-bit indexed BMP file to raw palette indices.
 * Unlike decodeBmp() which converts to RGBA, this returns the raw palette index
 * for each pixel. Used for terrain map BMPs where the palette index IS the data.
 *
 * @param buffer - Raw BMP file data
 * @returns Decoded indices (1 byte per pixel, top-to-bottom, left-to-right)
 * @throws Error if BMP is not 8-bit indexed
 */
export function decodeBmpIndices(buffer: Buffer): BmpIndexData {
  if (buffer.length < 54) {
    throw new Error('BMP file too small (< 54 bytes)');
  }

  const signature = buffer.readUInt16LE(0);
  if (signature !== 0x4D42) {
    throw new Error(`Invalid BMP signature: 0x${signature.toString(16)}`);
  }

  const dataOffset = buffer.readUInt32LE(10);
  const headerSize = buffer.readUInt32LE(14);

  if (headerSize < 40) {
    throw new Error(`Unsupported BMP header size: ${headerSize}`);
  }

  const width = buffer.readInt32LE(18);
  const height = buffer.readInt32LE(22);
  const bitsPerPixel = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);

  if (bitsPerPixel !== 8) {
    throw new Error(`decodeBmpIndices only supports 8-bit indexed BMP, got ${bitsPerPixel}-bit`);
  }

  if (compression !== 0) {
    throw new Error(`Unsupported BMP compression: ${compression}`);
  }

  const isBottomUp = height > 0;
  const absHeight = Math.abs(height);

  // Row size: 1 byte per pixel, padded to 4-byte boundary
  const rowSize = Math.ceil(width / 4) * 4;

  const indices = new Uint8Array(width * absHeight);

  for (let y = 0; y < absHeight; y++) {
    const srcRow = isBottomUp ? (absHeight - 1 - y) : y;
    const srcOffset = dataOffset + srcRow * rowSize;

    for (let x = 0; x < width; x++) {
      indices[y * width + x] = buffer[srcOffset + x];
    }
  }

  return { width, height: absHeight, indices };
}

/**
 * Batch-bake all BMP files in a directory to PNG with alpha.
 *
 * @param directory - Directory containing BMP files
 * @param staticColorKey - Optional static color key (null = auto-detect per file)
 * @param tolerance - Color matching tolerance
 * @returns Array of BakeResult for each processed file
 */
export function bakeDirectory(
  directory: string,
  staticColorKey?: ColorKey | null,
  tolerance: number = 5
): BakeResult[] {
  const results: BakeResult[] = [];

  if (!fs.existsSync(directory)) {
    return results;
  }

  const bmpFiles = fs.readdirSync(directory)
    .filter(f => f.toLowerCase().endsWith('.bmp'));

  for (const file of bmpFiles) {
    const inputPath = path.join(directory, file);
    const outputPath = path.join(directory, file.replace(/\.bmp$/i, '.png'));

    // Skip if PNG already exists and is newer than BMP
    if (fs.existsSync(outputPath)) {
      const bmpStat = fs.statSync(inputPath);
      const pngStat = fs.statSync(outputPath);
      if (pngStat.mtimeMs > bmpStat.mtimeMs) {
        results.push({
          success: true,
          inputPath,
          outputPath,
          width: 0,
          height: 0,
          colorKey: { r: 0, g: 0, b: 0 },
          transparentPixels: 0,
          totalPixels: 0,
        });
        continue;
      }
    }

    const result = bakeAlpha(inputPath, outputPath, staticColorKey, tolerance);
    results.push(result);
  }

  return results;
}
