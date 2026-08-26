// The decision half of .claude/hooks/worktree-scope-guard.sh — see that file for WHY.
//
// Reads a PreToolUse payload on stdin, prints one line: "ALLOW", or the reason half of a
// refusal ("targets `...`, which is under the main checkout but outside this worktree").
// Lives in its own file for the same reason driver-scope-guard.js does: a hook is a program
// with an exit-code contract, so it can be tested directly —
// src/__tests__/worktree-scope-guard.test.ts drives this file with crafted payloads.
//
// Env: SPO_TOP (this session's worktree root, resolved), SPO_FAMILY (the main checkout root
// that contains every worktree, resolved).

"use strict";

const path = require("path");
const { bashCandidates } = require("./bash-command-parse");

const TOP = process.env.SPO_TOP || "";
const FAMILY = process.env.SPO_FAMILY || "";

// The Bash write verbs named in the card: a redirection, or one of these followed by a path
// operand. `bashCandidates` (bash-command-parse.js) also always extracts `>`/`>>` targets, so
// that door needs no entry here. `\brm\s+` already matches the operand of `git rm <path>` too
// (word boundary before "rm" does not care what came before it) — the explicit `git rm` entry
// stays anyway so the verb list reads as a checklist against the card, not as a golfed regex.
const VERBS = [
  /\bsed\s+(?=[^\n;|&]*-[a-zA-Z]*i)/g,
  /\brm\s+/g,
  /\bmv\s+/g,
  /\bcp\s+/g,
  /\btee\s+/g,
  /\bchmod\s+/g,
  /\bgit\s+rm\s+/g,
];

function say(v) {
  process.stdout.write(v + "\n");
  process.exit(0);
}

// null = this path is none of the guard's business. A string = the reason it is refused.
//
// Three regions, in order: outside FAMILY entirely (the scratchpad, /tmp, ~/.claude) is
// always free — this guard only knows about the tree rooted at FAMILY. Inside TOP is the
// ordinary case: every write a session makes into its own worktree. What is left — under
// FAMILY but not under TOP — is the leak: the main checkout itself, or another session's
// worktree nested beside this one.
function classify(raw, cwd) {
  if (!raw) return null;
  if (raw === "/dev/null" || raw.startsWith("/dev/")) return null;
  if (!TOP || !FAMILY) return null;
  let abs;
  try {
    abs = path.resolve(cwd || TOP, raw);
  } catch {
    return null;
  }
  if (abs !== FAMILY && !abs.startsWith(FAMILY + path.sep)) return null;
  if (abs === TOP || abs.startsWith(TOP + path.sep)) return null;
  const rel = path.relative(FAMILY, abs) || ".";
  return "targets `" + rel + "`, which is under the main checkout but outside this session's worktree";
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

  const tool = p.tool_name || "";
  const ti = p.tool_input || {};
  const cwd = p.cwd || TOP;

  // Deliberately NOT exempted by `agent_id`. driver-scope-guard.js lets the execution
  // sub-agent through on purpose — implementation is its job. This guard exists precisely
  // because that same sub-agent, handed a relative path, can resolve it against the wrong
  // repository root; agent vs. driver says nothing about which tree the write lands in.
  if (tool === "Edit" || tool === "Write" || tool === "NotebookEdit") {
    return say(classify(ti.file_path || ti.notebook_path || "", cwd) || "ALLOW");
  }

  if (tool === "Bash") {
    const command = typeof ti.command === "string" ? ti.command : "";
    if (!command) return say("ALLOW");
    for (const cand of bashCandidates(command, VERBS)) {
      const why = classify(cand, cwd);
      if (why) return say(why);
    }
  }

  return say("ALLOW");
});
