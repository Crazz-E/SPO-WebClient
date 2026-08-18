#!/usr/bin/env node
/**
 * extract-rdo-arity.js - mechanical arity/type extraction for RDO-reachable members.
 *
 * RDO dispatch resolves members with TObject.MethodAddress (RDOObjectServer.pas:210),
 * which only sees PUBLISHED methods. So the extraction unit is:
 *   (a) every method declared in a `published` section, plus
 *   (b) every method named RDO* anywhere (belt and braces).
 *
 * Emits NDJSON: {member, kind, paramCount, regParams, paramTypes, class, file, line,
 *                variantSafety, confidence, raw}
 *
 * Usage: node extract-rdo-arity.js <SPO-Original root> [--report] [> out.ndjson]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2];
const REPORT = process.argv.includes('--report');
if (!ROOT) { console.error('usage: extract-rdo-arity.js <SPO-Original root> [--report] [--scope <re>]'); process.exit(2); }

/**
 * Units that can host an object the client ever gets an ObjectId for.
 * Everything else (Borland VCL, the Delphi Voyager client, installers) is noise:
 * MethodAddress is only ever called on server-side objects.
 */
const DEFAULT_SCOPE = '^(Kernel|Interface Server|Cache|Cache Server|Directory Server|DServer|DSZip'
  + '|Rdo|Rdo\\.IS|Rdo\\.BIN|StdBlocks|Illegal|IB|Gm|Mail Server|News Server|Model Extensions'
  + '|Model Server|Economics|Land|NewLand|Protocol|Communities|Lotto|Trade)/';
const scopeArg = process.argv.indexOf('--scope');
const SCOPE = new RegExp(scopeArg > 0 ? process.argv[scopeArg + 1] : DEFAULT_SCOPE, 'i');

// -- Delphi register-convention classification ------------------------------
// RDOObjectServer.pas:236-278: varVariant / varInteger / varOleStr consume a
// register (EDX then ECX); varSingle / varDouble are ALWAYS pushed and never
// increment RegsUsed. Everything else the marshaller falls through to @String.
const REAL_TYPES = new Set(['single', 'double', 'real', 'extended', 'currency', 'comp']);
const isRealType = t => REAL_TYPES.has(String(t).toLowerCase());

const VIS = /^\s*(published|public|protected|private|strict\s+private|strict\s+protected)\b/i;
// `T = class` / `T = class(TBase)` / `T = interface`. NOT `T = class;` (forward)
// and NOT `T = class of TBase;` (metaclass) — those never open a body, and
// treating them as a body was what desynchronised the visibility tracker.
const CLASS_START = /^\s*([A-Za-z_]\w*)\s*=\s*(?:packed\s+)?(?:class|interface)\b(?!\s*(?:;|of\b))/i;
// The SPO house style splits the header: `TClientView =` then `class( TBase )`
// on the next line (InterfaceServer.pas:91-92). Both forms must open a body.
const TYPE_NAME_ONLY = /^\s*([A-Za-z_]\w*)\s*=\s*$/;
const CLASS_KEYWORD = /^\s*(?:packed\s+)?(?:class|interface)\b(?!\s*(?:;|of\b))/i;
const END_BLOCK = /^\s*end\s*;/i;
// Nested `record` / variant `case` blocks inside a class body also end with `end;`.
const NESTED_OPEN = /\b(record|case\s+.*\bof)\b\s*$/i;
const METHOD = /^\s*(procedure|function)\s+([A-Za-z_]\w*)\s*(\(([^)]*)\))?\s*(?::\s*([A-Za-z_]\w*))?\s*;/i;
// Published PROPERTIES are the GET/SET half of the RDO surface (RDOQueryServer
// resolves them through RTTI, not MethodAddress) — e.g. `SubObjCount`,
// Cache Server/CachedObjectWrap.pas:45. Array properties take an index.
const PROPERTY = /^\s*property\s+([A-Za-z_]\w*)\s*(\[[^\]]*\])?\s*:\s*([A-Za-z_]\w*)\s*(read\s+\w+)?\s*(write\s+\w+)?/i;
const METHOD_OPEN = /^\s*(procedure|function)\s+([A-Za-z_]\w*)\s*\([^)]*$/i;
const DIRECTIVES = /\b(overload|override|virtual|abstract|safecall|stdcall|cdecl|dispid|reintroduce)\b/i;

const suspects = [];
const rows = [];

function stripComments(line) {
  const s = line.replace(/\{[^}]*\}/g, ' ').replace(/\(\*[\s\S]*?\*\)/g, ' ');
  const i = s.indexOf('//');
  return i >= 0 ? s.slice(0, i) : s;
}

/** `FluidId : widestring; SupplierIdx, OverPrice : integer` -> [{name,type,modifier}] */
function parseParams(inside) {
  const out = [];
  if (!inside || !inside.trim()) return out;
  for (const group of inside.split(';')) {
    if (!group.trim()) continue;
    const m = /^([^:]*):\s*(.+)$/.exec(group);
    if (!m) return null;                       // untyped param -> hand review
    const modifier = /^\s*(const|var|out)\s+/i.exec(m[1]);
    const names = m[1].replace(/^\s*(const|var|out)\s+/i, '').split(',').map(s => s.trim()).filter(Boolean);
    const type = m[2].trim();
    if (!names.length) return null;
    for (const name of names) {
      out.push({ name, type, modifier: modifier ? modifier[1].toLowerCase() : null });
    }
  }
  return out;
}

/**
 * Replays the RDOObjectServer.pas:236-292 thunk to decide where the hidden
 * result pointer (the `"^"` VariantId) lands.
 *   'error9'   - RegsUsed stays 1, pointer goes to EDX, server answers error 9
 *   'safe-ecx' - pointer lands in ECX, the procedure simply ignores it
 *   'FREEZE'   - RegsUsed hit MaxRegs=3, pointer is PUSHED and never popped
 */
function variantSafety(kind, params) {
  if (kind === 'function') return 'n/a-function';
  let regsUsed = 1;                            // RDOObjectServer.pas:223
  for (const p of params) {
    if (isRealType(p.type)) continue;          // @CheckIfSingle/@CheckIfDouble: pushed, no reg
    if (regsUsed < 3) regsUsed++;              // @UseRegister / @UseECX
  }
  if (regsUsed === 1) return 'error9';         // @ResParam -> mov edx
  if (regsUsed < 3) return 'safe-ecx';         // @TryWithECX -> mov ecx
  return 'FREEZE';                             // @PushResParam -> push edi
}

function walk(dir, acc) {
  acc = acc || [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.pas$/i.test(e.name)) acc.push(p);
  }
  return acc;
}

const FILES = walk(ROOT);

for (const file of FILES) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (!SCOPE.test(rel)) continue;
  // Backup / scratch copies pollute the surface with stale duplicates.
  const isScratch = /(^|\/)(Copy of |Copy \(\d\) of )/i.test(rel)
    || /\.(last|ok|Iroel)\.pas$/i.test(rel)
    || /(^|\/)\w+[0-9]\.pas$/i.test(rel)
    || /~/.test(rel);
  let text;
  try { text = fs.readFileSync(file, 'latin1'); } catch { continue; }
  const lines = text.split(/\r?\n/);
  const classStack = [];
  let visibility = null;
  let braceDepth = 0;
  let nestDepth = 0;
  let pendingTypeName = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (/^\s*implementation\b/i.test(rawLine)) break;   // declarations live in `interface`

    const opens = (rawLine.match(/\{/g) || []).length - (rawLine.match(/\}/g) || []).length;
    if (braceDepth > 0) { braceDepth += opens; continue; }
    if (opens > 0) { braceDepth += opens; continue; }

    const line = stripComments(rawLine);
    if (!line.trim()) continue;

    const nameOnly = TYPE_NAME_ONLY.exec(line);
    if (nameOnly) { pendingTypeName = nameOnly[1]; continue; }
    if (pendingTypeName && CLASS_KEYWORD.test(line)) {
      classStack.push(pendingTypeName);
      pendingTypeName = null;
      nestDepth = 0;
      visibility = 'public';
      continue;
    }
    pendingTypeName = null;

    const cs = CLASS_START.exec(line);
    if (cs) {
      classStack.push(cs[1]);
      nestDepth = 0;
      // `T = class(TBase) end;` — an empty body opened and closed on one line.
      visibility = /\bend\s*;/i.test(line.slice(cs.index + cs[0].length)) ? (classStack.pop(), null) : 'public';
      continue;
    }
    if (classStack.length && NESTED_OPEN.test(line)) { nestDepth++; continue; }
    if (classStack.length && END_BLOCK.test(line)) {
      if (nestDepth > 0) nestDepth--;
      else { classStack.pop(); visibility = null; }
      continue;
    }

    const v = VIS.exec(line);
    if (v) visibility = v[1].toLowerCase().replace(/\s+/g, ' ');

    const prop = PROPERTY.exec(line);
    if (prop && visibility === 'published') {
      rows.push({
        member: prop[1],
        kind: 'property',
        paramCount: 0,
        regParams: 0,
        paramTypes: [],
        paramNames: [],
        returnType: prop[3],
        indexed: !!prop[2],
        access: (prop[4] ? 'r' : '') + (prop[5] ? 'w' : '') || 'r',
        class: classStack.length ? classStack[classStack.length - 1] : null,
        visibility: 'published',
        variantSafety: 'n/a-property',    // GET/SET never take the CallMethod path
        file: rel,
        line: i + 1,
        scratch: isScratch,
        confidence: 'verified-declaration',
        raw: rawLine.trim(),
      });
      continue;
    }

    if (METHOD_OPEN.test(line)) {
      suspects.push({ reason: 'multi-line-declaration', file: rel, line: i + 1, raw: rawLine.trim() });
      continue;
    }

    const m = METHOD.exec(line);
    if (!m) continue;
    const kind = m[1].toLowerCase();
    const name = m[2];
    const inside = m[4];
    const retType = m[5];
    const isRdoPrefixed = /^RDO/i.test(name);
    const published = visibility === 'published';
    if (!published && !isRdoPrefixed) continue;

    if (DIRECTIVES.test(line.slice(m[0].length - 1))) {
      suspects.push({ reason: 'directive-on-declaration', file: rel, line: i + 1, raw: rawLine.trim() });
    }

    const params = parseParams(inside);
    if (params === null) {
      suspects.push({ reason: 'unparseable-param-list', file: rel, line: i + 1, raw: rawLine.trim() });
      continue;
    }
    if (kind === 'function' && !retType) {
      suspects.push({ reason: 'function-without-return-type', file: rel, line: i + 1, raw: rawLine.trim() });
    }

    rows.push({
      member: name,
      kind,
      paramCount: params.length,
      regParams: params.filter(p => !isRealType(p.type)).length,
      paramTypes: params.map(p => (p.modifier ? p.modifier + ' ' : '') + p.type),
      paramNames: params.map(p => p.name),
      returnType: retType || null,
      class: classStack.length ? classStack[classStack.length - 1] : null,
      visibility: published ? 'published' : visibility,
      variantSafety: variantSafety(kind, params),
      file: rel,
      line: i + 1,
      scratch: isScratch,
      confidence: 'verified-declaration',
      raw: rawLine.trim(),
    });
  }
}

// -- Collision detection: same member name, different arity across the corpus --
const byName = new Map();
for (const r of rows) {
  if (r.scratch) continue;
  if (!byName.has(r.member)) byName.set(r.member, []);
  byName.get(r.member).push(r);
}
const ambiguous = [];
for (const [name, rs] of byName) {
  const shapes = new Set(rs.map(r => r.kind + '/' + r.paramCount + '/' + r.paramTypes.join(',').toLowerCase()));
  if (shapes.size > 1) {
    ambiguous.push({ member: name, variants: [...shapes], sites: rs.map(r => r.file + ':' + r.line) });
  }
}

for (const r of rows) process.stdout.write(JSON.stringify(r) + '\n');

if (REPORT) {
  const live = rows.filter(r => !r.scratch);
  const e = m => process.stderr.write(m + '\n');
  e('files scanned      : ' + FILES.length);
  e('declarations       : ' + rows.length + ' (' + live.length + ' outside scratch/backup copies)');
  e('unique members     : ' + byName.size);
  e('FREEZE on "^"      : ' + live.filter(r => r.variantSafety === 'FREEZE').length);
  e('error9 on "^"      : ' + live.filter(r => r.variantSafety === 'error9').length);
  e('safe-ecx on "^"    : ' + live.filter(r => r.variantSafety === 'safe-ecx').length);
  e('functions          : ' + live.filter(r => r.kind === 'function').length);
  e('SUSPECTS (hand)    : ' + suspects.length);
  for (const s of suspects.slice(0, 60)) e('  [' + s.reason + '] ' + s.file + ':' + s.line + '  ' + s.raw);
  e('AMBIGUOUS names    : ' + ambiguous.length);
  for (const a of ambiguous.slice(0, 60)) {
    e('  ' + a.member + ' -> ' + a.variants.join(' | ') + '   @ ' + a.sites.slice(0, 4).join(', '));
  }
}
