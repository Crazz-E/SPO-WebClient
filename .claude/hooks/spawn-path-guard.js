// The decision half of .claude/hooks/spawn-path-guard.sh — see that file for WHY.
//
// Reads a PreToolUse payload on stdin, prints one line: "ALLOW", or a tab-separated pair —
// reason TAB corrected path — for the first wrong-tree absolute path found in an Agent tool's
// `prompt`.
//
// CARD #370. worktree-scope-guard.js catches a wrong-tree WRITE (Edit/Write/NotebookEdit,
// or a Bash write verb) after the fact — the sub-agent already believes a path, and the write
// it produces from that belief is what gets caught. The belief itself forms one step earlier,
// in the prompt text a driver hand-composes for the spawn (next-task.md § Handoff discipline).
// This guard catches it there: a family-rooted or other-worktree absolute path named in the
// PROMPT is refused before the sub-agent ever starts, with the same corrected form
// worktree-scope-guard.js would have offered after the fact.
//
// "reuse its classification, do not fork it" (#370's own words): this file carries no
// family/worktree containment logic of its own. `classify`/`correctPath` are required straight
// from worktree-scope-guard.js — the "outside FAMILY entirely is free" clause in `classify` is
// exactly what already lets ~/SPO-Original, ~/SPO-ASP, the scratchpad and ~/.spo-bench pass
// through with no separate allowlist here.
//
// SCOPE IS ABSOLUTE PATHS ONLY (#370's criterion #1). A prompt's bare relative mention
// (`doc/foo.md`, `src/bar.ts`) resolves against the sub-agent's own cwd, which IS this
// worktree — never wrong-tree by construction, so it is not this guard's business.
//
// Env: SPO_TOP, SPO_FAMILY — the same roots worktree-scope-guard.js reads. They must already be
// set in this process's environment before this file requires that module (spawn-path-guard.sh
// sets them for the whole `node` invocation, and env vars are visible to a process from the
// start, before any module's top-level code runs — so require order here does not matter).

"use strict";

const path = require("path");
const { classify, correctPath } = require("./worktree-scope-guard.js");

const TOP = process.env.SPO_TOP || "";
const FAMILY = process.env.SPO_FAMILY || "";

const MAX_CANDIDATES = 40;

function say(v) {
  process.stdout.write(v + "\n");
  process.exit(0);
}

// A literal `~` or `$HOME`/`${HOME}` prefix, expanded by hand — a hook reads the prompt's raw
// text, never through a shell, so nothing else expands these. Same shape driver-scope-guard.js
// and worktree-scope-guard.js's own callers use for the identical problem (card #324/#325).
function expandHome(p) {
  if (p === "~") return process.env.HOME || p;
  if (p.startsWith("~/")) return path.join(process.env.HOME || "", p.slice(2));
  if (p === "$HOME") return process.env.HOME || p;
  if (p.startsWith("$HOME/")) return path.join(process.env.HOME || "", p.slice("$HOME/".length));
  if (p === "${HOME}") return process.env.HOME || p;
  if (p.startsWith("${HOME}/")) return path.join(process.env.HOME || "", p.slice("${HOME}/".length));
  return p;
}

// Absolute-path-shaped substrings in free text: a leading `/` not preceded by `:` or a word
// character (excludes the second slash of `https://...`) or `~/`, `$HOME/`, `${HOME}/`.
// Deliberately a heuristic scan of prose, not a parser — it can both over- and under-match, and
// every match `classify` waves through below is silently dropped, never a reason to block.
const PATH_TOKEN_RE = /(~\/|\$\{?HOME\}?\/|(?<![:\w])\/)[A-Za-z0-9_.\-/]*[A-Za-z0-9_-]/g;

function extractCandidates(text) {
  const out = [];
  for (const m of text.matchAll(PATH_TOKEN_RE)) {
    out.push(m[0]);
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
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
  if (TOP === FAMILY) return say("ALLOW"); // not inside a session worktree — nothing to arm against

  if ((p.tool_name || "") !== "Agent") return say("ALLOW");

  const ti = p.tool_input || {};
  const prompt = typeof ti.prompt === "string" ? ti.prompt : "";
  if (!prompt) return say("ALLOW");

  for (const cand of extractCandidates(prompt)) {
    let abs;
    try {
      abs = path.resolve(expandHome(cand));
    } catch {
      continue;
    }
    const why = classify(abs, TOP);
    if (!why) continue;
    return say(why + "\t" + correctPath(abs));
  }

  return say("ALLOW");
});
