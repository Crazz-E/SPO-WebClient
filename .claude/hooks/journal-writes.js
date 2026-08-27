// Journal writes to judging-instrument files (.claude/hooks/journal-writes.sh).
//
// Reads a PostToolUse payload on stdin, prints a JSON object if the write targets an
// instrumented file, or an empty string if not. Always exits 0 (never blocks).
//
// Instrumented file families:
//  - .claude/hooks/**
//  - .claude/settings.json
//  - src/e2e/bench/**
//  - scripts/bench-*
//  - scripts/verify-gate.js
//  - jest.config.js
//  - RDO files: src/shared/rdo-types.ts, src/shared/rdo-frame.ts, src/shared/rdo-members.ts, src/server/rdo.ts
//
// Env: SPO_TOP (worktree root, resolved).

"use strict";

const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { stripHeredocs, bashCandidates: bashCandidatesGeneric } = require("./bash-command-parse");

const TOP = process.env.SPO_TOP || "";

// Patterns that match instrumented files. Each is a function that takes a relative path
// and returns true if it matches.
const PATTERNS = [
  // .claude/hooks/** — all hook files
  (rel) => rel.startsWith(".claude/hooks/") && rel !== ".claude/hooks/",
  // .claude/settings.json
  (rel) => rel === ".claude/settings.json",
  // src/e2e/bench/** — all bench infrastructure
  (rel) => rel.startsWith("src/e2e/bench/") && rel !== "src/e2e/bench/",
  // scripts/bench-* — bench-related scripts
  (rel) => rel.startsWith("scripts/bench-"),
  // scripts/verify-gate.js
  (rel) => rel === "scripts/verify-gate.js",
  // jest.config.js
  (rel) => rel === "jest.config.js",
  // RDO protocol files
  (rel) =>
    rel === "src/shared/rdo-types.ts" ||
    rel === "src/shared/rdo-frame.ts" ||
    rel === "src/shared/rdo-members.ts" ||
    rel === "src/server/rdo.ts",
];

function isInstrumented(rel) {
  return PATTERNS.some((p) => p(rel));
}

// Resolve a raw path token to absolute, classify, and return the relative path if instrumented.
function classifyPath(raw, cwd) {
  if (!raw) return null;
  if (raw === "/dev/null" || raw.startsWith("/dev/")) return null;

  let abs;
  try {
    abs = path.resolve(cwd || TOP, raw);
  } catch {
    return null;
  }

  // Outside the worktree — the scratchpad, /tmp, etc. — is not instrumented.
  if (abs !== TOP && !abs.startsWith(TOP + path.sep)) return null;

  const rel = path.relative(TOP, abs) || ".";
  return isInstrumented(rel) ? rel : null;
}

// Bash verbs whose operands are paths and should be checked.
const PATH_VERBS = [
  /\bsed\s+(?=[^\n;|&]*-[a-zA-Z]*i)/g,
  /\bperl\s+(?=[^\n;|&]*-[a-zA-Z]*i)/g,
  /\brm\s+/g,
  /\bmv\s+/g,
  /\bcp\s+/g,
  /\bchmod\s+/g,
  /\bchown\s+/g,
  /\btouch\s+/g,
  /\btruncate\s+/g,
  /\binstall\s+/g,
  /\bpatch\s+/g,
  /\btee\s+/g,
  /\bdd\s+/g,
];

const MAX_CANDIDATES = 40;

// Extract candidate paths from a bash command (redirections + verb operands).
function bashCandidates(command) {
  return bashCandidatesGeneric(command, PATH_VERBS, MAX_CANDIDATES);
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
    return say(""); // unparseable payload = no journal
  }

  const tool = p.tool_name || "";
  const ti = p.tool_input || {};
  const cwd = p.cwd || TOP;

  let filePath = null;

  if (tool === "Edit" || tool === "Write") {
    const rawPath = ti.file_path || "";
    filePath = classifyPath(rawPath, cwd);
  } else if (tool === "NotebookEdit") {
    const rawPath = ti.notebook_path || "";
    filePath = classifyPath(rawPath, cwd);
  } else if (tool === "Bash") {
    const command = typeof ti.command === "string" ? ti.command : "";
    if (!command) return say("");

    // Check for redirections (> >>)
    const text = stripHeredocs(command);
    const redirections = [];
    for (const m of text.matchAll(/(?<!&)>>?\s*(?!&)("[^"]+"|'[^']+'|[^\s;&|<>()]+)/g)) {
      const target = m[1];
      if (target.startsWith('"') && target.endsWith('"')) {
        redirections.push(target.slice(1, -1));
      } else if (target.startsWith("'") && target.endsWith("'")) {
        redirections.push(target.slice(1, -1));
      } else {
        redirections.push(target);
      }
    }

    // Check redirections first
    for (const redir of redirections) {
      const classified = classifyPath(redir, cwd);
      if (classified) {
        filePath = classified;
        break;
      }
    }

    // If no redirection matched, check verb operands
    if (!filePath) {
      const candidates = bashCandidates(command);

      // For cp and mv, only check the last operand (the destination).
      // Earlier operands are sources and should not trigger journaling.
      if (/\b(cp|mv)\b/.test(text) && candidates.length > 0) {
        const lastCandidate = candidates[candidates.length - 1];
        const classified = classifyPath(lastCandidate, cwd);
        if (classified) {
          filePath = classified;
        }
      } else {
        // For other verbs, check all operands
        for (const cand of candidates) {
          const classified = classifyPath(cand, cwd);
          if (classified) {
            filePath = classified;
            break;
          }
        }
      }
    }
  }

  if (!filePath) return say("");

  // Return JSON with tool and path
  const result = JSON.stringify({ tool, path: filePath });
  say(result);
});
