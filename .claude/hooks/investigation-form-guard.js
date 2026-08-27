// The decision half of .claude/hooks/investigation-form-guard.sh — see that file for WHY.
//
// Reads a PreToolUse payload on stdin, prints one line-or-more to stdout: the literal string
// "ALLOW", or a full BLOCKED explanation (reason, corrected command, override). It lives in
// its own file for the same reason driver-scope-guard.js does: a hook is a program with an
// exit-code contract, so it can be tested directly — src/__tests__/investigation-form-guard.test.ts
// drives this file with crafted payloads. Always exits 0; the wrapper turns "not ALLOW" into
// exit 2, so a defect here fails the build loudly instead of ever blocking a session's turn.
//
// Card #324. Three shell forms, observed on live `/next-task` sessions, turn a read over the
// legacy Delphi tree (SPO-Original, SPO-ASP) into a WRONG answer that looks like a clean one —
// none of them fails loudly:
//
//   1. `grep` without `-a` returns nothing on the ISO-8859-encoded .pas files, exiting 1 as if
//      the text were absent (CLAUDE.md § SPO-Original).
//   2. `find ... | xargs ...` without null-delimiting silently drops files: `xargs` aborts on
//      the apostrophe in `Pastel's mp3/`, and word-splitting breaks every spaced directory
//      (`Interface Server/`, `Model Extensions/`, `Mail Server/`) into non-existent operands.
//      Measured (card #117): 2 files came back where the truth is 15, and the missing one is
//      the authority (`Interface Server/InterfaceServer.pas`) — only 1338 of 1747 files ever
//      reached `grep`.
//   3. `2>/dev/null` swallows the errors that would have shown either of the above happening —
//      343 stderr lines were suppressed in the measured incident, including the fatal
//      `xargs: unmatched single quote`.
//
// Scope is deliberately narrow: the trigger is a READ verb (grep/find/ls/cat/file) whose
// operand resolves under one of the legacy tree roots. `git grep`, `git ls-files` and friends
// are excluded — not by an explicit check, but because their HEAD token is `git`, never a
// member of the read-verb set.
//
// Env: SPO_LEGACY_TREES — colon-separated legacy tree roots (the wrapper defaults this to
// `$HOME/SPO-Original:$HOME/SPO-ASP`; tests inject fabricated roots directly).

"use strict";

const path = require("path");
const { statements, unquote } = require("./bash-command-parse");

const READ_VERBS = new Set(["grep", "find", "ls", "cat", "file"]);

// Case-sensitive by design: the short-flag bundle test only matches a lowercase `a` (grep's
// "treat binary as text"), never an unrelated `-A` (trailing context) or a capital elsewhere.
const SHORT_A = /^-[^-]*a/;

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
// interior (spaces, parens, pipes) survives intact — the same shape bash-command-parse.js's
// bashCandidates uses for its own token matching.
function tokenize(s) {
  return s.match(/"[^"]*"|'[^']*'|\S+/g) || [];
}

function isFlag(tok) {
  return tok.startsWith("-") && tok !== "-";
}

function resolvesUnderLegacy(tok, cwd, roots) {
  if (!tok || isFlag(tok) || tok === "|") return false;
  if (/^2>\s*\/dev\/null$/.test(tok) || tok === "2>" ) return false;
  const raw = unquote(tok);
  let abs;
  try {
    abs = path.resolve(cwd, expandHome(raw));
  } catch {
    return false;
  }
  return roots.some((r) => abs === r || abs.startsWith(r + path.sep));
}

// Reads ANALYZED as one shell statement. Returns null when the statement is none of this
// guard's business (wrong head verb, no legacy-tree operand, or no violation once it is in
// scope) — a string reason is never printed on its own, only via buildMessage below.
function analyzeStatement(rawStatement, cwd, roots) {
  const text = rawStatement.trim();
  if (!text) return null;

  const tokens = tokenize(text);
  if (!tokens.length) return null;

  // Strip leading `VAR=val` assignments — `FOO=bar grep ...` is still a grep invocation.
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  const head = tokens[i];
  if (!head || !READ_VERBS.has(head)) return null;

  const inScope = tokens.slice(i + 1).some((t) => resolvesUnderLegacy(t, cwd, roots));
  if (!inScope) return null;

  const violations = {};

  if (/2>\s*\/dev\/null/.test(text)) violations.redirect = true;

  if (head === "find" && /\|\s*xargs\b/.test(text)) {
    const hasPrint0 = tokens.includes("-print0");
    const hasXargsNull = /\bxargs\b\s+(?:-0\b|--null\b)/.test(text);
    if (!hasPrint0 || !hasXargsNull) violations.xargsNull = true;
  }

  // A `grep` invocation anywhere in the statement (the head itself, or after `xargs` in a
  // find pipeline) — excluding one immediately preceded by `git`, which is a different
  // program with no ISO-8859 trap the client's `-a` flag would fix.
  const grepIdx = tokens.findIndex((t, idx) => t === "grep" && tokens[idx - 1] !== "git");
  if (grepIdx !== -1) {
    // Only grep's OWN argument span — up to the next pipe or end of statement — counts. A
    // sibling command's flag that happens to contain `a` (`find`'s `-name`) must not satisfy
    // grep's `-a`.
    let end = tokens.indexOf("|", grepIdx);
    if (end === -1) end = tokens.length;
    const span = tokens.slice(grepIdx + 1, end);
    const hasShortA = span.some((t) => t.startsWith("-") && !t.startsWith("--") && SHORT_A.test(t));
    const hasLongText = span.some((t) => t === "--text" || t.startsWith("--text="));
    if (!hasShortA && !hasLongText) violations.grepA = true;
  }

  if (!violations.redirect && !violations.xargsNull && !violations.grepA) return null;

  return { text, violations };
}

// Renders the corrected command: token-level, not a raw-text regex rewrite, so the fix lands
// exactly once per violation even when a statement carries several (the measured incident's
// `find | xargs grep` carries all three at once).
function buildCorrected(text, violations) {
  let tokens = tokenize(text);

  if (violations.redirect) {
    const next = [];
    for (let idx = 0; idx < tokens.length; idx++) {
      const t = tokens[idx];
      if (/^2>\s*\/dev\/null$/.test(t)) continue;
      if (t === "2>" && tokens[idx + 1] === "/dev/null") {
        idx++;
        continue;
      }
      next.push(t);
    }
    tokens = next;
  }

  if (violations.xargsNull) {
    const pipeIdx = tokens.indexOf("|");
    if (pipeIdx !== -1 && !tokens.slice(0, pipeIdx).includes("-print0")) {
      tokens.splice(pipeIdx, 0, "-print0");
    }
    const xargsIdx = tokens.indexOf("xargs");
    if (xargsIdx !== -1) {
      const nextTok = tokens[xargsIdx + 1];
      if (nextTok !== "-0" && nextTok !== "--null") tokens.splice(xargsIdx + 1, 0, "-0");
    }
  }

  if (violations.grepA) {
    const grepIdx = tokens.findIndex((t, idx) => t === "grep" && tokens[idx - 1] !== "git");
    if (grepIdx !== -1) tokens.splice(grepIdx + 1, 0, "-a");
  }

  return tokens.join(" ");
}

function buildMessage(corrected, violations) {
  const lines = [
    "BLOCKED: that reads the legacy Delphi tree in a shape that has already answered WRONG, not empty (card #324).",
    "",
  ];

  if (violations.grepA) {
    lines.push(
      "`grep` without `-a` returns nothing on the ISO-8859-encoded .pas files (at least",
      "Kernel/KernelCache.pas, rc4.pas, MediaNameGenerator.pas, PublicFacility.pas) — exiting 1",
      "as if the text were absent (CLAUDE.md § SPO-Original). Prefer the Grep tool over the",
      "absolute path; it has no such trap.",
      ""
    );
  }

  if (violations.xargsNull) {
    lines.push(
      "`find | xargs` without null-delimiting silently drops files: `xargs` aborts on the",
      "apostrophe in `Pastel's mp3/`, and word-splitting breaks every spaced directory",
      "(`Interface Server/`, `Model Extensions/`, `Mail Server/`) into non-existent operands.",
      "Measured on card #117: 2 files came back where the truth is 15, missing the authority",
      "(Interface Server/InterfaceServer.pas) — only 1338 of 1747 files ever reached `grep`.",
      ""
    );
  }

  if (violations.redirect) {
    lines.push(
      "`2>/dev/null` hides exactly the error that would have shown the above happening: 343",
      "stderr lines were suppressed in the measured incident, including the fatal",
      "`xargs: unmatched single quote`.",
      ""
    );
  }

  lines.push("Corrected form:", "", "  " + corrected, "");
  lines.push(
    "Human override, on explicit instruction only (a session must not type this):",
    "  SPO_INVESTIGATION_FORM_OVERRIDE=i-mean-it <the original command>"
  );

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
  if (command.includes("SPO_INVESTIGATION_FORM_OVERRIDE=")) return say("ALLOW");

  const roots = legacyRoots();
  if (!roots.length) return say("ALLOW"); // missing env — fail open, never block on our own defect

  const cwd = p.cwd || process.cwd();

  for (const stmt of statements(command)) {
    const hit = analyzeStatement(stmt, cwd, roots);
    if (hit) {
      const corrected = buildCorrected(hit.text, hit.violations);
      return say(buildMessage(corrected, hit.violations));
    }
  }

  return say("ALLOW");
});
