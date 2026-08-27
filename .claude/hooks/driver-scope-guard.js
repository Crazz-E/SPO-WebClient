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
const { stripHeredocs, bashCandidates: bashCandidatesGeneric } = require("./bash-command-parse");

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

// Card #325. The driver never reads the legacy Delphi trees itself — that read belongs to
// `delphi-archaeologist` (CLAUDE.md § Legacy Delphi source, § Legacy web source), which cites
// `File.pas:Line` and knows the ISO-8859 / xargs-null traps investigation-form-guard.js already
// guards the SHAPE of. This guard is about WHO reads, not how: any of these verbs, pointed at
// either legacy tree, is refused for the driver's own hand — same two-doors, same `agent_id`
// discriminator as the write half above. `sed` is read-only here on purpose: `sed -i` is
// already a write, caught by PATH_VERBS above, so the negative lookahead below excludes it to
// avoid a doubled reason on the same command.
const READ_VERBS = [
  ["grep", /\bgrep\s+/g],
  ["cat", /\bcat\s+/g],
  ["head", /\bhead\s+/g],
  ["tail", /\btail\s+/g],
  ["file", /\bfile\s+/g],
  ["wc", /\bwc\s+/g],
  ["strings", /\bstrings\s+/g],
  ["awk", /\bawk\s+/g],
  ["sed", /\bsed\s+(?![^\n;|&]*-[a-zA-Z]*i)/g],
  ["cut", /\bcut\s+/g],
  ["sort", /\bsort\s+/g],
  ["uniq", /\buniq\s+/g],
  ["less", /\bless\s+/g],
  ["more", /\bmore\s+/g],
];

const LEGACY_TREE_NAMES = ["SPO-Original", "SPO-ASP"];

function say(v) {
  process.stdout.write(v + "\n");
  process.exit(0);
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

// Thin wrapper: the token-extraction algorithm itself lives in bash-command-parse.js, shared
// with worktree-scope-guard.js. This guard's contribution is its own PATH_VERBS list and the
// MAX_CANDIDATES it has always used — the parsing behaviour is unchanged from before the split.
function bashCandidates(command) {
  return bashCandidatesGeneric(command, PATH_VERBS, MAX_CANDIDATES);
}

// Memoized on the last worktreeRoot seen — the guard runs as a fresh process per hook call, so
// this saves nothing across invocations, but it does mean a single invocation that checks
// several candidates against the same worktree walks the filesystem once, not once per token.
let _repoRootCacheKey;
let _repoRootCacheVal;

// Walks up from worktreeRoot looking for `.git`. In a session worktree that entry is a FILE —
// "gitdir: <repo>/.git/worktrees/<name>" — not a directory, because the worktree shares the
// main repo's object store (verified against this repo's own `.claude/worktrees/*/.git`). The
// repo root a relative `../SPO-Original` means (CLAUDE.md § Legacy Delphi source) is the parent
// of THAT real `.git`, never the worktree's own parent — `..` from inside
// `.claude/worktrees/<name>` lands back inside `.claude/worktrees/`, not the repo root.
function findRepoRoot(worktreeRoot) {
  if (_repoRootCacheKey === worktreeRoot) return _repoRootCacheVal;
  _repoRootCacheKey = worktreeRoot;
  _repoRootCacheVal = computeRepoRoot(worktreeRoot);
  return _repoRootCacheVal;
}

function computeRepoRoot(worktreeRoot) {
  if (!worktreeRoot) return null;
  let dir;
  try {
    dir = path.resolve(worktreeRoot);
  } catch {
    return null;
  }
  for (;;) {
    const gitPath = path.join(dir, ".git");
    let st = null;
    try {
      st = fs.statSync(gitPath);
    } catch {
      st = null;
    }
    if (st) {
      if (st.isDirectory()) return path.dirname(gitPath);
      let content = "";
      try {
        content = fs.readFileSync(gitPath, "utf8");
      } catch {
        content = "";
      }
      const m = content.match(/gitdir:\s*(\S.*)\s*$/m);
      if (!m) return null;
      let gitdir = m[1].trim();
      if (!path.isAbsolute(gitdir)) gitdir = path.resolve(dir, gitdir);
      // A SESSION worktree's gitdir is `<repo>/.git/worktrees/<name>` — cut back to the `.git`
      // that precedes `worktrees/` to get the real repo `.git`, then its parent is repoRoot.
      const marker = path.sep + ".git" + path.sep + "worktrees" + path.sep;
      const idx = gitdir.indexOf(marker);
      if (idx === -1) return path.dirname(gitdir);
      const realGitDir = gitdir.slice(0, idx + (path.sep + ".git").length);
      return path.dirname(realGitDir);
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null; // reached the filesystem root, never found a .git
    dir = parent;
  }
}

// The two legacy trees are siblings of the repo root (CLAUDE.md § Legacy Delphi/web source):
// `${repoRoot}/../SPO-Original`, `${repoRoot}/../SPO-ASP`.
function legacyTreeRoots(repoRoot) {
  if (!repoRoot) return [];
  const parent = path.dirname(repoRoot);
  return LEGACY_TREE_NAMES.map((name) => ({ name, dir: path.resolve(parent, name) }));
}

function isLegacyTreePath(absPath, repoRoot) {
  return legacyTreeRoots(repoRoot).some(({ dir }) => absPath === dir || absPath.startsWith(dir + path.sep));
}

function legacyTreeName(absPath, repoRoot) {
  const hit = legacyTreeRoots(repoRoot).find(({ dir }) => absPath === dir || absPath.startsWith(dir + path.sep));
  return hit ? hit.name : null;
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

    const repoRoot = findRepoRoot(TOP);
    for (const [verb, re] of READ_VERBS) {
      for (const tok of bashCandidatesGeneric(text, [re], MAX_CANDIDATES)) {
        if (!tok || tok.startsWith("-")) continue;
        let abs;
        try {
          abs = path.resolve(cwd || TOP, tok);
        } catch {
          continue;
        }
        if (!isLegacyTreePath(abs, repoRoot)) continue;
        const legacyName = legacyTreeName(abs, repoRoot);
        return say(
          "reads the legacy tree " +
            legacyName +
            " via " +
            verb +
            ", which the driver delegates to delphi-archaeologist"
        );
      }
    }
  }

  return say("ALLOW");
});
