// The decision half of .claude/hooks/cat-file-read-guard.sh — see that file for WHY.
//
// Reads a PreToolUse payload on stdin, prints one line-or-more to stdout: the literal string
// "ALLOW", or a full BLOCKED explanation (reason, corrected command, override). It lives in
// its own file for the same reason driver-scope-guard.js does: a hook is a program with an
// exit-code contract, so it can be tested directly — src/__tests__/cat-file-read-guard.test.ts
// drives this file with crafted payloads. Always exits 0; the wrapper turns "not ALLOW" into
// exit 2, so a defect here fails the build loudly instead of ever blocking a session's turn.
//
// Card #403. Detects a bare `cat <file>` shell command reading a single file — the Read tool
// does the same job with line numbers, image/PDF support, and harness cancellation, and
// CLAUDE.md already asks for the built-in tools over shell equivalents. Scope is deliberately
// narrow: only a `cat` invocation whose head token is `cat` (flags after it are skipped) and
// whose first non-flag, non-redirect operand resolves to a path. A file under a legacy tree
// root (SPO_LEGACY_TREES) is left alone — that tree already has its own, sharper guard
// (investigation-form-guard.js, the ISO-8859 / `-a` trap), and flagging it here too would just
// be a second, weaker voice on the same read.
//
// Env: SPO_LEGACY_TREES — colon-separated legacy tree roots, same shape and default as
// investigation-form-guard.js (the wrapper defaults it to `$HOME/SPO-Original:$HOME/SPO-ASP`).

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
// investigation-form-guard.js both use.
function tokenize(s) {
  return s.match(/"[^"]*"|'[^']*'|\S+/g) || [];
}

function isFlag(tok) {
  return tok.startsWith("-") && tok !== "-";
}

function isRedirect(tok) {
  return tok.startsWith("<") || tok.startsWith(">");
}

// Reads ANALYZED as one shell statement. Returns null when the statement is none of this
// guard's business (wrong head verb, no operand, no path, or the path is under a legacy tree
// root left to investigation-form-guard.js instead).
function analyzeStatement(rawStatement, cwd, roots) {
  const text = rawStatement.trim();
  if (!text) return null;

  const tokens = tokenize(text);
  if (!tokens.length) return null;

  // Strip leading `VAR=val` assignments — `FOO=bar cat x` is still a cat invocation.
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  if (tokens[i] !== "cat") return null;
  i++;

  // Skip flags (and redirects, e.g. a heredoc's `<<EOF`) to find the first bare operand — the
  // file `cat` is reading.
  let fileTok = null;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === "|" || tok === ";" || tok === "&&" || tok === "||") break;
    if (isFlag(tok) || isRedirect(tok)) {
      i++;
      continue;
    }
    fileTok = tok;
    break;
  }

  if (!fileTok) return null; // no file operand — `cat` alone reads stdin, none of our business

  const raw = unquote(fileTok);
  let abs;
  try {
    abs = path.resolve(cwd, expandHome(raw));
  } catch {
    return null;
  }

  // Under a legacy tree root — investigation-form-guard.js already owns that read.
  if (roots.some((r) => abs === r || abs.startsWith(r + path.sep))) return null;

  return { text, raw, abs };
}

function buildMessage(abs) {
  const lines = [
    "BLOCKED: that reads a file with `cat`. Use the Read tool instead.",
    "",
    "The Read tool integrates with the harness — line numbers, image/PDF support, and",
    "cancellation — for something a shell subprocess does not give you.",
    "",
    "Corrected form:",
    "",
    `  Read(file_path="${abs}")`,
    "",
    "Human override, on explicit instruction only (a session must not type this):",
    "  SPO_CAT_FILE_READ_GUARD_OVERRIDE=i-mean-it <the original command>",
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
  if (command.includes("SPO_CAT_FILE_READ_GUARD_OVERRIDE=")) return say("ALLOW");

  // Quick gate: no `cat` token at all
  if (!/\bcat\b/.test(command)) return say("ALLOW");

  const roots = legacyRoots();
  const cwd = p.cwd || process.cwd();

  for (const stmt of statements(command)) {
    const hit = analyzeStatement(stmt, cwd, roots);
    if (hit) return say(buildMessage(hit.abs));
  }

  return say("ALLOW");
});
