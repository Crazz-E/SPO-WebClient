/**
 * Conformity sweep — RDO frames must be written via writeRdoFrame() (Latin-1).
 *
 * The Delphi servers speak ANSI single-byte on the wire. A raw
 * socket.write(string) encodes UTF-8 and corrupts characters >= 0x80.
 * This test scans production server sources and fails if any raw
 * `socket.write(` call site reappears outside rdo-helpers.ts.
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const SERVER_SRC = path.resolve(__dirname, '..');

/** Only rdo-helpers.ts (the helper implementation) may call socket.write. */
const ALLOWLIST = new Set(['rdo-helpers.ts']);

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === '__mocks__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('no raw socket.write() on RDO sockets', () => {
  it('every RDO write goes through writeRdoFrame()', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SERVER_SRC)) {
      if (ALLOWLIST.has(path.basename(file))) continue;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        // Match socket.write( / socket!.write( call sites; comments referencing
        // the API by name (no opening paren with args context) are updated too.
        if (/\bsocket!?\.write\(/.test(line)) {
          offenders.push(`${path.relative(SERVER_SRC, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
