/**
 * File transport for structured logging with size-based rotation.
 *
 * Server-only — entire module is a no-op when running in the browser.
 */

// Browser-safe guard: skip everything if we're not in Node.js
const isNode = typeof window === 'undefined' && typeof process !== 'undefined';

/* eslint-disable @typescript-eslint/no-require-imports */
// Dynamic require so bundlers don't try to include 'fs' / 'path' in browser builds
const fs: typeof import('fs') | null = isNode ? require('fs') : null;
const path: typeof import('path') | null = isNode ? require('path') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

export interface FileTransportOptions {
  filePath: string;
  maxFileSize: number;
  maxFiles: number;
}

export class FileTransport {
  private readonly filePath: string;
  private readonly maxFileSize: number;
  private readonly maxFiles: number;
  private currentSize: number;

  constructor(options: FileTransportOptions) {
    this.filePath = options.filePath;
    this.maxFileSize = options.maxFileSize;
    this.maxFiles = options.maxFiles;
    this.currentSize = 0;

    if (!fs || !path) return;

    // Ensure log directory exists
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });

    // Get current file size if it already exists
    try {
      const stat = fs.statSync(this.filePath);
      this.currentSize = stat.size;
    } catch {
      this.currentSize = 0;
    }
  }

  write(line: string): void {
    if (!fs || !path) return;

    const data = line + '\n';
    const dataSize = Buffer.byteLength(data, 'utf8');

    // Rotate if needed before writing
    if (this.currentSize + dataSize > this.maxFileSize && this.currentSize > 0) {
      this.rotate();
    }

    fs.appendFileSync(this.filePath, data, 'utf8');
    this.currentSize += dataSize;
  }

  private rotate(): void {
    if (!fs) return;

    // Delete the oldest rotated file if it would exceed maxFiles
    try { fs.unlinkSync(`${this.filePath}.${this.maxFiles}`); } catch { /* doesn't exist */ }

    // Shift existing rotated files: .N-1 → .N, .N-2 → .N-1, ... .1 → .2
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      try {
        fs.renameSync(`${this.filePath}.${i}`, `${this.filePath}.${i + 1}`);
      } catch {
        // File doesn't exist yet — skip
      }
    }

    // Rename current file to .1
    try {
      fs.renameSync(this.filePath, `${this.filePath}.1`);
    } catch {
      // Current file doesn't exist — skip
    }

    this.currentSize = 0;
  }

  close(): void {
    // No-op for sync writes; placeholder for future async transport
  }
}
