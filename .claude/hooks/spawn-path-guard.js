// The decision half of .claude/hooks/spawn-path-guard.sh — see that file for WHY.
//
// Reads a PreToolUse payload (tool_name "Agent") on stdin, scans the spawn payload's `prompt`
// field for absolute path tokens, and classifies each one with the SAME THREE-REGION logic
// worktree-scope-guard.js uses to judge an actual write: outside FAMILY (the scratchpad,
// ~/SPO-Original, ~/SPO-ASP, ~/.spo-bench) is always free; inside TOP (this session's own
// worktree) is the ordinary case; under FAMILY but outside TOP — the main checkout itself, or
// another session's worktree nested beside this one — is the leak this guard exists to catch,
// one spawn earlier than worktree-scope-guard.js can: at the moment the payload is BUILT,
// before any sub-agent ever resolves a relative path against the wrong repository root
// (CLAUDE.md § Environment — "repo at /home/<user>/SPO-WebClient" names the main checkout, not
// any one worktree; that is the exact drift the 2026-08-26 incident worktree-scope-guard.js's
// own header describes).
//
// This file intentionally DUPLICATES classify()/correctPath() from worktree-scope-guard.js
// rather than requiring it: that file has no `require.main` guard, so `require()`-ing it would
// immediately arm its own stdin listener and hang this process forever waiting for input
// nobody sends it. Keep the two classifiers in sync by hand — src/__tests__/spawn-path-guard.
// test.ts and worktree-scope-guard.test.ts both assert on the THREE_REGIONS shape, so a drift
// between them fails a test, not silently.
//
// Env: SPO_TOP (this session's worktree root, resolved), SPO_FAMILY (the main checkout root
// that contains every worktree, resolved).
//
// Prints "ALLOW", or "BLOCKED" followed by one "offendingPath\tcorrectedPath" line per
// offending path found in the prompt. Always exits 0 — the shell wrapper is what turns a
// BLOCKED verdict into exit 2.

"use strict";

const path = require("path");

const TOP = process.env.SPO_TOP || "";
const FAMILY = process.env.SPO_FAMILY || "";

// An absolute path token inside free-text prompt: `/` preceded by start-of-string, whitespace,
// or an opening quote/paren/brace (never by another non-space character), so the second slash
// of a URL like `https://github.com/...` never starts a match — the `:` (and the `/` right
// after it) both fail the "preceded by an opening delimiter" test. Captures the path itself in
// group 1, without the delimiter that preceded it.
const PATH_RE = /(?:^|[\s"'`([{])(\/[^\s"'`)\]}>,;]+)/g;

// null = this path is none of the guard's business. A string = the reason it is refused.
// Copied from worktree-scope-guard.js's classify() — see that file's header for the THREE
// REGIONS this implements, and this file's header for why it is copied rather than required.
function classify(abs) {
  if (!TOP || !FAMILY) return null;
  if (abs !== FAMILY && !abs.startsWith(FAMILY + path.sep)) return null;
  if (abs === TOP || abs.startsWith(TOP + path.sep)) return null;
  const rel = path.relative(FAMILY, abs) || ".";
  return "targets `" + rel + "`, which is under the main checkout but outside this session's worktree";
}

// Copied from worktree-scope-guard.js's correctPath() — see that file for the rebuild rule.
function correctPath(abs) {
  if (!TOP || !FAMILY) return "";
  const rel = path.relative(FAMILY, abs);
  const parts = rel.split(path.sep);
  if (parts.length >= 4 && parts[0] === ".claude" && parts[1] === "worktrees") {
    const repoRel = parts.slice(3).join(path.sep);
    return path.join(TOP, repoRel);
  }
  return path.join(TOP, rel);
}

function say(v) {
  process.stdout.write(v + "\n");
  process.exit(0);
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

  if (!TOP || !FAMILY) return say("ALLOW"); // missing env — fail open, never block on our own defect
  if ((p.tool_name || "") !== "Agent") return say("ALLOW");

  const ti = p.tool_input || {};
  const prompt = typeof ti.prompt === "string" ? ti.prompt : "";
  if (!prompt) return say("ALLOW");

  const seen = new Set();
  const offenders = [];
  for (const m of prompt.matchAll(PATH_RE)) {
    const token = m[1];
    let abs;
    try {
      abs = path.resolve(token);
    } catch {
      continue;
    }
    if (seen.has(abs)) continue;
    seen.add(abs);
    const why = classify(abs);
    if (!why) continue;
    offenders.push(abs + "\t" + correctPath(abs));
  }

  if (offenders.length === 0) return say("ALLOW");
  return say("BLOCKED\n" + offenders.join("\n"));
});
