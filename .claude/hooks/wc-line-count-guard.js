// The decision half of .claude/hooks/wc-line-count-guard.sh — see that file for WHY.
//
// Reads a PreToolUse payload on stdin, prints one line-or-more to stdout: the literal string
// "ALLOW", or a full BLOCKED explanation (reason, corrected command, override). It lives in
// its own file for the same reason driver-scope-guard.js does: a hook is a program with an
// exit-code contract, so it can be tested directly — src/__tests__/wc-line-count-guard.test.ts
// drives this file with crafted payloads. Always exits 0; the wrapper turns "not ALLOW" into
// exit 2, so a defect here fails the build loudly instead of ever blocking a session's turn.
//
// Card #406. Detects `wc -l <file>` and `wc -l < <file>` reading a single file to report its
// line count — the Read tool does the same job with line numbers, image/PDF support, and
// harness cancellation, and CLAUDE.md already asks for the built-in tools over shell
// equivalents. Scope is deliberately narrow: only a `wc` invocation carrying the `-l` flag
// (line-count mode; `-c`/`-w`/`-m` are none of this guard's business) whose first non-flag,
// non-redirect operand resolves to a path — `wc -l` alone (stdin) is left alone. A file under
// a legacy tree root (SPO_LEGACY_TREES) is left alone too — the same carve-out
// cat-file-read-guard.js uses.
//
// Env: SPO_LEGACY_TREES — colon-separated legacy tree roots, same shape and default as
// cat-file-read-guard.js (the wrapper defaults it to `$HOME/SPO-Original:$HOME/SPO-ASP`).

"use strict";

const path = require("path");
const { statements, unquote } = require("./bash-command-parse");

function say(v) {
  process.stdout.write(v);
  process.exit(0);
}

function expandHome(p) {
  if (p === "~") return process.env.HOME || p;
  if (p.startsWith("~/")) return path.join(process.env.HOME || "", p.slice(2));
  return p;
}

function legacyRoots() {
  const raw = process.env.SPO_LEGACY_TREES || "";
  return raw
    .split(":")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      try {
        return path.resolve(expandHome(t));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// Whitespace-delimited tokens, preserving a single- or double-quoted span as one token so its
// interior (spaces, parens, pipes) survives intact — the shape file-discovery-guard.js and
// cat-file-read-guard.js both use.
function tokenize(s) {
  return s.match(/"[^"]*"|'[^']*'|\S+/g) || [];
}

function isFlag(tok) {
  return tok.startsWith("-") && tok !== "-";
}

function isRedirect(tok) {
  return tok.startsWith("<") || tok.startsWith(">");
}

// A flag token carries line-count mode when it is `-l`, its long form `--lines`, or a stacked
// short-flag cluster that includes `l` (e.g. `-cl`, `-lc`) — never a long-option other than
// `--lines`, so `--lines-per-page` (were such a thing) would not false-positive here since wc
// has no such option.
function hasLineFlag(tok) {
  if (tok === "-l" || tok === "--lines") return true;
  if (tok.startsWith("--")) return false;
  return /l/.test(tok.slice(1));
}

// Reads ANALYZED as one shell statement. Returns null when the statement is none of this
// guard's business (wrong head verb, no `-l` flag, no operand, no path, or the path is under a
// legacy tree root left alone same as cat-file-read-guard.js).
function analyzeStatement(rawStatement, cwd, roots) {
  const text = rawStatement.trim();
  if (!text) return null;

  const tokens = tokenize(text);
  if (!tokens.length) return null;

  // Strip leading `VAR=val` assignments — `FOO=bar wc -l x` is still a wc invocation.
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  if (tokens[i] !== "wc") return null;
  i++;

  // Skip flags (tracking whether `-l` appeared) and redirects (e.g. `wc -l < file`) to find
  // the first bare operand — the file `wc` is reading.
  let sawLineFlag = false;
  let fileTok = null;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === "|" || tok === ";" || tok === "&&" || tok === "||") break;
    if (isFlag(tok)) {
      if (hasLineFlag(tok)) sawLineFlag = true;
      i++;
      continue;
    }
    if (isRedirect(tok)) {
      i++;
      continue;
    }
    fileTok = tok;
    break;
  }

  if (!sawLineFlag) return null; // not line-count mode — -c/-w/-m are none of our business
  if (!fileTok) return null; // no file operand — `wc -l` alone reads stdin, none of our business

  const raw = unquote(fileTok);
  let abs;
  try {
    abs = path.resolve(cwd, expandHome(raw));
  } catch {
    return null;
  }

  // Under a legacy tree root — left alone, same carve-out cat-file-read-guard.js uses.
  if (roots.some((r) => abs === r || abs.startsWith(r + path.sep))) return null;

  return { text, raw, abs };
}

function buildMessage(abs) {
  const lines = [
    "BLOCKED: that reads a file with `wc -l`. Use the Read tool instead.",
    "",
    "The Read tool integrates with the harness — line numbers, image/PDF support, and",
    "cancellation — for something a shell subprocess does not give you.",
    "",
    "Corrected form:",
    "",
    `  Read(file_path="${abs}")`,
    "",
    "Human override, on explicit instruction only (a session must not type this):",
    "  SPO_WC_LINE_COUNT_GUARD_OVERRIDE=i-mean-it <the original command>",
  ];

  return lines.join("\n");
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let p;
  try {
    p = JSON.parse(raw);
  } catch {
    return say("ALLOW"); // unparseable payload is never a reason to block work
  }

  if (p.tool_name !== "Bash") return say("ALLOW");

  const ti = p.tool_input || {};
  const command = typeof ti.command === "string" ? ti.command : "";
  if (!command) return say("ALLOW");
  if (command.includes("SPO_WC_LINE_COUNT_GUARD_OVERRIDE=")) return say("ALLOW");

  // Quick gate: no `wc` token at all
  if (!/\bwc\b/.test(command)) return say("ALLOW");

  const roots = legacyRoots();
  const cwd = p.cwd || process.cwd();

  for (const stmt of statements(command)) {
    const hit = analyzeStatement(stmt, cwd, roots);
    if (hit) return say(buildMessage(hit.abs));
  }

  return say("ALLOW");
});
