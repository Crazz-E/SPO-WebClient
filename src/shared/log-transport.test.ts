/**
 * Tests for FileTransport — file writing with size-based rotation.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileTransport } from './log-transport';

describe('FileTransport', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-log-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the log directory if it does not exist', () => {
    const logDir = path.join(tmpDir, 'nested', 'logs');
    const filePath = path.join(logDir, 'test.ndjson');
    const transport = new FileTransport({ filePath, maxFileSize: 1024, maxFiles: 3 });
    transport.write('{"msg":"hello"}');
    expect(fs.existsSync(logDir)).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('writes NDJSON lines to the file', () => {
    const filePath = path.join(tmpDir, 'test.ndjson');
    const transport = new FileTransport({ filePath, maxFileSize: 1024, maxFiles: 3 });
    transport.write('{"msg":"line1"}');
    transport.write('{"msg":"line2"}');
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ msg: 'line1' });
    expect(JSON.parse(lines[1])).toEqual({ msg: 'line2' });
  });

  it('rotates when file exceeds maxFileSize', () => {
    const filePath = path.join(tmpDir, 'test.ndjson');
    // Set a very small max size to trigger rotation
    const transport = new FileTransport({ filePath, maxFileSize: 50, maxFiles: 3 });

    // Write enough to exceed 50 bytes
    transport.write('{"msg":"aaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'); // >50 bytes
    transport.write('{"msg":"bbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'); // triggers rotation

    // After rotation, the original file should have the new content
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(`${filePath}.1`)).toBe(true);

    const current = fs.readFileSync(filePath, 'utf8').trim();
    expect(current).toContain('bbbb');

    const rotated = fs.readFileSync(`${filePath}.1`, 'utf8').trim();
    expect(rotated).toContain('aaaa');
  });

  it('caps rotated files at maxFiles', () => {
    const filePath = path.join(tmpDir, 'test.ndjson');
    const transport = new FileTransport({ filePath, maxFileSize: 30, maxFiles: 2 });

    // Write 4 batches to trigger multiple rotations
    transport.write('{"msg":"first-batch-data"}');
    transport.write('{"msg":"second-batch-data"}');
    transport.write('{"msg":"third-batch-data"}');
    transport.write('{"msg":"fourth-batch-data"}');

    // Should have current + .1 + .2 max (maxFiles=2)
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(`${filePath}.1`)).toBe(true);
    expect(fs.existsSync(`${filePath}.2`)).toBe(true);
    // .3 should NOT exist (capped at maxFiles)
    expect(fs.existsSync(`${filePath}.3`)).toBe(false);
  });

  it('appends to an existing file on restart', () => {
    const filePath = path.join(tmpDir, 'test.ndjson');

    // Pre-populate the file
    fs.writeFileSync(filePath, '{"msg":"existing"}\n', 'utf8');

    const transport = new FileTransport({ filePath, maxFileSize: 1024, maxFiles: 3 });
    transport.write('{"msg":"new"}');

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ msg: 'existing' });
    expect(JSON.parse(lines[1])).toEqual({ msg: 'new' });
  });

  it('close() is a no-op (does not throw)', () => {
    const filePath = path.join(tmpDir, 'test.ndjson');
    const transport = new FileTransport({ filePath, maxFileSize: 1024, maxFiles: 3 });
    expect(() => transport.close()).not.toThrow();
  });
});
