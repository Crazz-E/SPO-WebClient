/**
 * Patch cached Z0-Z2 terrain chunks to fix semi-transparent alpha at edges.
 *
 * The old downscaleRGBA2x box filter averaged alpha values, creating semi-transparent
 * pixels at chunk boundaries that appear as visible seam lines.
 *
 * This script reads each cached WebP, clamps any semi-transparent pixel to fully opaque,
 * and writes it back. Uses sharp (native libvips) for fast WebP decode/encode.
 *
 * Usage: npx tsx scripts/patch-chunk-alpha.ts
 */
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import { decodeWebP, encodeWebP } from '../src/server/texture-alpha-baker';

const CACHE_ROOT = path.join(__dirname, '..', 'webclient-cache', 'chunks');
const ZOOM_DIRS = ['z0', 'z1', 'z2']; // Z3 is base resolution (no downscale), skip it

async function findWebpFiles(): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.webp')) {
        const parent = path.basename(path.dirname(full));
        if (ZOOM_DIRS.includes(parent)) {
          files.push(full);
        }
      }
    }
  }

  await walk(CACHE_ROOT);
  return files;
}

async function patchFileSharp(filePath: string): Promise<boolean> {
  const img = sharp(filePath);
  const { width, height } = await img.metadata();
  if (!width || !height) return false;

  const raw = await img.ensureAlpha().raw().toBuffer();

  let patched = false;
  for (let i = 3; i < raw.length; i += 4) {
    const a = raw[i];
    if (a > 0 && a < 255) {
      raw[i] = 255;
      patched = true;
    }
  }

  if (patched) {
    await sharp(raw, { raw: { width, height, channels: 4 } })
      .webp({ lossless: true })
      .toFile(filePath);
  }
  return patched;
}

async function patchFileWasm(filePath: string): Promise<boolean> {
  const buf = await fsp.readFile(filePath);
  const { pixels, width, height } = await decodeWebP(buf);

  let patched = false;
  for (let i = 3; i < pixels.length; i += 4) {
    const a = pixels[i];
    if (a > 0 && a < 255) {
      pixels[i] = 255;
      patched = true;
    }
  }

  if (patched) {
    const webp = await encodeWebP(width, height, pixels);
    await fsp.writeFile(filePath, webp);
  }
  return patched;
}

async function patchFile(filePath: string): Promise<'patched' | 'clean' | 'error'> {
  // Skip empty/corrupt files
  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat || stat.size === 0) return 'error';

  try {
    const wasPatched = await patchFileSharp(filePath);
    return wasPatched ? 'patched' : 'clean';
  } catch {
    // sharp can't read some webp-wasm-encoded files — fall back
    try {
      const wasPatched = await patchFileWasm(filePath);
      return wasPatched ? 'patched' : 'clean';
    } catch {
      return 'error';
    }
  }
}

async function main(): Promise<void> {
  console.log('Scanning for Z0-Z2 cached chunks...');
  const files = await findWebpFiles();
  console.log(`Found ${files.length} WebP files to check.`);

  let patchedCount = 0;
  let cleanCount = 0;
  let errorCount = 0;
  const batchSize = 200;

  const t0 = Date.now();
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(f => patchFile(f)));
    for (const result of results) {
      if (result === 'patched') patchedCount++;
      else if (result === 'clean') cleanCount++;
      else errorCount++;
    }
    const progress = Math.min(i + batchSize, files.length);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(`\r  ${progress}/${files.length} (${patchedCount} patched, ${errorCount} errors) ${elapsed}s`);
  }

  const total = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${total}s. Patched: ${patchedCount}, Clean: ${cleanCount}, Errors: ${errorCount}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
