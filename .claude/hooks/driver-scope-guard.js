// The decision half of .claude/hooks/driver-scope-guard.sh — see that file for WHY.
//
// Reads a PreToolUse payload on stdin, prints one line: "ALLOW", or the reason half of a
// refusal ("edits the tracked file X"). It lives in its own file rather than inline in a
// `node -e` string for one reason: a hook is a program with an exit-code contract, so it can
// be tested — src/__tests__/driver-scope-guard.test.ts drives this file directly with crafted
// payloads. A guard nothing exercises is exactly the unverifiable change the gate cannot see.
//
// Env: SPO_TOP (worktree root, resolved), SPO_DRIVER_SID (session id that claimed the card).

"use strict";

const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const TOP = process.env.SPO_TOP || "";
const DRIVER_SID = process.env.SPO_DRIVER_SID || "";

// A deliberate, human-typed override, in the shape bench-port-guard.sh already uses. It rides
// in the command text, so it exists for Bash only; the Edit/Write escape is removing the marker.
const OVERRIDE = "SPO_DRIVER_SCOPE_OVERRIDE=i-am-the-human";

// Verbs that rewrite tracked files with no path operand worth resolving. Each is unambiguous:
// none of them has a reading in which the working tree comes out unchanged.
const ALWAYS = [
  [/\bgit\s+rm\b/, "runs `git rm`, which deletes tracked files"],
  [/\bgit\s+checkout\s+--(\s|$)/, "runs `git checkout --`, which overwrites tracked files"],
  [/\bgit\s+restore\b/, "runs `git restore`, which overwrites tracked files"],
  [/\bgit\s+apply\b/, "runs `git apply`, which patches tracked files"],
  [/\bgit\s+stash\b/, "runs `git stash`, which rewrites the working tree"],
  [/\bgit\s+clean\b/, "runs `git clean`, which deletes files from the tree"],
  [/\bnpm\s+run\s+format\b/, "runs `npm run format`, which rewrites ~440 tracked files"],
  [/\bprettier\b[^\n;|&]*--write/, "runs `prettier --write`, which rewrites tracked files"],
  [/\beslint\b[^\n;|&]*--fix/, "runs `eslint --fix`, which rewrites tracked files"],
];

// Verbs whose operands ARE paths. Resolved and tested individually, so `sed -i` on a
// scratchpad file outside the tree passes untouched — over-matching is the cry-wolf defect
// next-task.md § 3 warns about, not a safe default.
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

function say(v) {
  process.stdout.write(v + "\n");
  process.exit(0);
}

function unquote(t) {
  if (t.length > 1 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

// A heredoc body is text, not commands — a PR body that happens to contain the word `rm` is
// not a deletion. Same reasoning, and the same shape, as bench-port-guard.sh.
function stripHeredocs(command) {
  const kept = [];
  let terminator = null;
  for (const line of command.split("\n")) {
    if (terminator !== null) {
      if (line.trim() === terminator) terminator = null;
      continue;
    }
    kept.push(line);
    const h = line.match(/<<-?\s*["']?([A-Za-z_][A-Za-z0-9_]*)["']?/);
    if (h) terminator = h[1];
  }
  return kept.join("\n");
}

function gitOk(args) {
  try {
    execFileSync("git", ["-C", TOP].concat(args), { stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

function gitOut(args) {
  try {
    return execFileSync("git", ["-C", TOP].concat(args), {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

// null = this path is none of the driver's business. A string = the reason it is refused.
//
// `allowCreate` is the difference between the two doors, and it is the whole anti-cry-wolf
// rule. An Edit/Write `file_path` is unambiguously a path, so a file that does not exist yet
// is a creation worth refusing. A Bash operand is NOT: `chmod +x f` and `sed -i s/a/b/ f`
// both hand us junk tokens (`+x`, `s/a/b`) alongside the real path, and treating those as
// "would create" produced a refusal with a nonsense reason. So for Bash we assert only on
// what git already knows — a path it tracks — and let the junk fall through.
function classify(raw, cwd, allowCreate) {
  if (!raw) return null;
  if (raw === "/dev/null" || raw.startsWith("/dev/")) return null;
  let abs;
  try {
    abs = path.resolve(cwd || TOP, raw);
  } catch {
    return null;
  }
  // Outside the worktree — the scratchpad, /tmp, the sessions store — is free.
  if (abs !== TOP && !abs.startsWith(TOP + path.sep)) return null;
  const rel = path.relative(TOP, abs) || ".";

  if (gitOk(["ls-files", "--error-unmatch", "--", abs])) {
    return "targets the tracked file `" + rel + "`";
  }
  let st = null;
  try {
    st = fs.statSync(abs);
  } catch {
    st = null;
  }
  if (st && st.isDirectory()) {
    if (gitOut(["ls-files", "--", abs]).trim() !== "") {
      return "targets `" + rel + "`, which holds tracked files";
    }
    return null;
  }
  // Does not exist yet. Creating it inside the tree lands it in this card's diff, unless git
  // is already told to ignore it.
  if (allowCreate && !st && !gitOk(["check-ignore", "-q", "--", abs])) {
    return "would create `" + rel + "` inside the tree, where it lands in this card's diff";
  }
  return null;
}

function bashCandidates(command) {
  const text = stripHeredocs(command);
  const out = [];

  for (const m of text.matchAll(/(?<!&)>>?\s*(?!&)("[^"]+"|'[^']+'|[^\s;&|<>()]+)/g)) {
    out.push(unquote(m[1]));
  }

  for (const verb of PATH_VERBS) {
    verb.lastIndex = 0;
    for (const m of text.matchAll(verb)) {
      const rest = text.slice(m.index + m[0].length).split(/[;|&\n]/)[0];
      for (const tok of rest.match(/("[^"]+"|'[^']+'|[^\s]+)/g) || []) {
        const t = unquote(tok);
        if (t.startsWith("-")) continue;
        out.push(t);
      }
    }
  }
  return out.slice(0, MAX_CANDIDATES);
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

  // The execution sub-agent. Implementation is precisely its job.
  if (p.agent_id) return say("ALLOW");
  // Another session standing in the same worktree — a human rescuing it, say. Not our driver.
  if (!DRIVER_SID || p.session_id !== DRIVER_SID) return say("ALLOW");

  const tool = p.tool_name || "";
  const ti = p.tool_input || {};
  const cwd = p.cwd || TOP;

  if (tool === "Edit" || tool === "Write" || tool === "NotebookEdit") {
    return say(classify(ti.file_path || ti.notebook_path || "", cwd, true) || "ALLOW");
  }

  if (tool === "Bash") {
    const command = typeof ti.command === "string" ? ti.command : "";
    if (!command) return say("ALLOW");
    if (command.includes(OVERRIDE)) return say("ALLOW");
    const text = stripHeredocs(command);
    for (const [re, reason] of ALWAYS) if (re.test(text)) return say(reason);
    for (const cand of bashCandidates(command)) {
      const why = classify(cand, cwd, false);
      if (why) return say(why);
    }
  }

  return say("ALLOW");
});
