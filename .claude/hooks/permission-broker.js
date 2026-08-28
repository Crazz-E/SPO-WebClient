// The decision core of the permission broker — doc/permission-policy.md, compiled.
//
// WHY THIS FILE EXISTS. doc/haiku-permission-analysis.md measured 43 permission interruptions
// in one day of Haiku-driven sessions; doc/haiku-permission-plan.md removed ~25-29 of them by
// deleting their upstream cause. What is left is the long tail: shapes nobody has enumerated,
// each of which stops a session dead until a human answers. This program answers them — either
// from a written rule, or by telling the wrapper to ask the arbiter agent (permission-broker.sh).
//
// It owns CLASSIFICATION AND LOOKUP ONLY. It never calls a model, never touches the network,
// never writes a file. stdin is the PreToolUse payload, stdout is one JSON verdict line, the
// exit code is always 0 — the wrapper decides what to do with the verdict. That split is what
// makes the whole ladder testable without an API key.
//
// Reads only the environment it is handed, so the tests drive it with temp directories:
//   SPO_TOP            this session's worktree root (the frontier of policy §1)
//   SPO_PERM_RULES     path to .claude/permissions/rules.json
//   SPO_PERM_SETTINGS  colon-separated settings.json paths, read for allow/deny only
//   SPO_PERM_DIR       state root, default ~/.spo-perm (provisional/ is read here)
//
// The one safety property to preserve when changing this file: **every misclassification must
// cost coverage or money, never safety**. Reading a call as narrower than it is means an extra
// arbiter call; reading it as wider means an interruption survives. Neither widens what a
// session may do. Nothing here may ever turn an undecided call into a silent allow by default —
// policy §1: the unclassifiable is `external-effect`.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { statements, splitOutsideQuotes, unquote, bashCandidates } = require("./bash-command-parse.js");

const SIG_VERSION = "v1";

// ---------------------------------------------------------------------------
// Read-only surfaces
// ---------------------------------------------------------------------------

// Heads with no effect anywhere, whatever their arguments. `cat`/`grep`/`find` sit here even
// though CLAUDE.md § Environment keeps them off the allowlist: this list answers "does it
// change anything", not "is it the sanctioned form". The guards answer the second question and
// they run in parallel, so a shape this list calls harmless can still be refused by them.
const READ_ONLY_HEADS = new Set([
  "ls", "pwd", "wc", "tree", "which", "type", "file", "stat", "date", "echo", "printf",
  "basename", "dirname", "realpath", "readlink", "cat", "head", "tail", "less", "more",
  "grep", "egrep", "fgrep", "rg", "ugrep", "ag", "find", "jq", "sort", "uniq", "cut", "diff",
  "cmp", "md5sum", "sha1sum", "sha256sum", "env", "id", "whoami", "hostname", "uname", "df",
  "du", "ps", "true", "false", "test", "sleep",
  // Shell state, not system state. `cd` earned its place the hard way: the first live firing of
  // this broker refused `cd <this worktree>; wc -l …` because `cd` was in no list, so the whole
  // command fell to external-effect — and the arbiter, handed that domain, wrote a fluent
  // justification for it instead of challenging it. A wrong domain is not caught downstream; it
  // is rationalised. That is the reason this list has to be right rather than merely cautious.
  // `source` and `.` are deliberately ABSENT: they execute a script.
  "cd", "export", "unset", "set", "alias", "unalias", "shift", "pushd", "popd", ":",
]);

// Second-token gates: a head that is read-only only for some subcommands.
const READ_ONLY_SUBCOMMANDS = {
  git: new Set([
    "status", "log", "diff", "show", "blame", "grep", "ls-files", "ls-tree", "rev-parse",
    "describe", "cat-file", "shortlog", "whatchanged", "count-objects", "verify-commit",
  ]),
  gh: new Set([]), // handled by gh-specific logic below (verb + subverb)
  npm: new Set(["ls", "outdated", "view", "why", "explain", "root", "prefix", "config"]),
  cargo: new Set([]),
};

// `gh <noun> <verb>` read-only pairs, plus the bare GET form of `gh api`.
const GH_READ_VERBS = new Set(["view", "list", "checks", "diff", "status"]);

// Heads whose mutation is confined to the paths they name — so if every path they name is
// inside this worktree, the whole statement is `in-worktree`. A head absent from this list and
// from the read-only lists is `external-effect`, however innocent its arguments look: policy §1
// gives the unknown no benefit of the doubt.
const LOCAL_MUTATION_HEADS = new Set([
  "rm", "mv", "cp", "mkdir", "rmdir", "touch", "tee", "ln", "chmod", "chown", "sed", "truncate",
  "dd", "tar", "unzip", "zip", "gzip", "gunzip", "patch", "install",
]);

// Path fragments that make a READ itself a decision worth arbitrating — credentials are the one
// thing a read alone can leak. Matched case-insensitively against the whole path.
const SENSITIVE_READ = [
  /(^|\/)\.env(\.|$)/i, /(^|\/)\.ssh(\/|$)/i, /id_[rd]sa/i, /(^|\/)\.netrc$/i,
  /(^|\/)\.aws(\/|$)/i, /(^|\/)\.npmrc$/i, /credential/i, /secret/i, /(^|\/)\.git-credentials$/i,
];

const READ_ONLY_TOOLS = new Set(["Read", "Grep", "Glob", "NotebookRead"]);
const WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);
// Spawning is itself confined: whatever the spawned agent then does arrives here as its own
// PreToolUse call, and .claude/hooks/spawn-path-guard.sh already judges the payload's paths.
const LOCAL_TOOLS = new Set(["Agent", "Task", "TodoWrite", "ExitPlanMode", "EnterPlanMode", "Skill", "ToolSearch"]);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** Head token of a statement, with leading env assignments, redirections and openers removed. */
function headOf(statement) {
  const stripped = statement
    .replace(/^[\s(){`]*/, "")
    .replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]*)\s+)*/, "")
    .trim();
  const first = stripped.split(/\s+/)[0] || "";
  // `/usr/bin/node` and `./scripts/x.sh` are their basenames for classification purposes.
  return unquote(first).replace(/^.*\//, "");
}

/** Non-flag tokens of a statement, after the head. */
function operandsOf(statement) {
  const stripped = statement
    .replace(/^[\s(){`]*/, "")
    .replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]*)\s+)*/, "")
    .trim();
  const toks = stripped.match(/("[^"]*"|'[^']*'|[^\s]+)/g) || [];
  return toks.slice(1).map(unquote).filter(t => !t.startsWith("-"));
}

function isUnder(child, parent) {
  if (!parent) return false;
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Resolve a path token the way the shell would, relative to the call's cwd. */
function resolveToken(token, cwd) {
  let t = token;
  if (t.startsWith("~")) t = path.join(os.homedir(), t.slice(1));
  if (t.startsWith("$HOME")) t = path.join(os.homedir(), t.slice(5));
  return path.resolve(cwd || process.cwd(), t);
}

// ---------------------------------------------------------------------------
// Domain classification — policy §1
// ---------------------------------------------------------------------------

function statementIsReadOnly(statement) {
  const head = headOf(statement);
  if (!head) return true; // an empty fragment does nothing
  if (READ_ONLY_HEADS.has(head)) {
    // `sed -i` edits in place; every other sed reads. Same for `find -delete`/`-exec`.
    if (head === "sed" && /\s-[a-zA-Z]*i\b|--in-place/.test(statement)) return false;
    if (head === "find" && /-delete\b|-exec\b|-execdir\b|-ok\b/.test(statement)) return false;
    if (head === "tee") return false;
    return true;
  }
  if (head === "gh") {
    const ops = operandsOf(statement);
    if (ops[0] === "api") return !/\s-(?:X|-method|f|F|-field|-raw-field|-input)\b/.test(statement);
    if (ops[0] === "auth" && ops[1] === "status") return true;
    return GH_READ_VERBS.has(ops[1] || "");
  }
  const subs = READ_ONLY_SUBCOMMANDS[head];
  if (subs) {
    const ops = operandsOf(statement);
    return subs.has(ops[0] || "");
  }
  return false;
}

/**
 * Domain of one Bash statement, given the worktree root and the local-effect roots.
 * A redirection target counts as a written path even when the head is read-only:
 * `git status > /home/crazz/SPO-WebClient/out.txt` leaves this worktree.
 */
function bashStatementDomain(statement, cwd, localRoots) {
  const targets = bashCandidates(statement, [], 40).map(t => resolveToken(t, cwd));
  const redirectionsLeave = targets.some(t => !localRoots.some(r => isUnder(t, r)));

  if (statementIsReadOnly(statement)) {
    return redirectionsLeave ? "external-effect" : "read-only";
  }

  const head = headOf(statement);
  if (!LOCAL_MUTATION_HEADS.has(head)) return "external-effect";

  const named = operandsOf(statement).map(t => resolveToken(t, cwd)).concat(targets);
  if (named.length === 0) return "external-effect";
  return named.every(t => localRoots.some(r => isUnder(t, r))) ? "in-worktree" : "external-effect";
}

/**
 * Does this call name a credential file? Answered separately from the domain because it is the
 * one question that outranks a settings `allow` entry — see decide().
 */
function touchesSecret(toolName, toolInput, cwd) {
  const named = [];
  for (const k of ["file_path", "path", "notebook_path"]) {
    if (toolInput[k]) named.push(String(toolInput[k]));
  }
  if (toolName === "Bash") {
    const command = String(toolInput.command || "");
    for (const s of statements(command)) {
      named.push(...operandsOf(s));
      named.push(...bashCandidates(s, [], 40));
    }
  }
  return named.some(p => SENSITIVE_READ.some(re => re.test(resolveToken(p, cwd))));
}

const SEVERITY = { "read-only": 0, "in-worktree": 1, "external-effect": 2 };
const worst = domains => domains.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a), "read-only");

function classifyDomain(toolName, toolInput, cwd, top) {
  const scratch = process.env.SCRATCHPAD_DIR || "";
  const localRoots = [top, os.tmpdir(), scratch].filter(Boolean);

  if (READ_ONLY_TOOLS.has(toolName)) {
    const p = String(toolInput.file_path || toolInput.path || toolInput.notebook_path || "");
    if (p && SENSITIVE_READ.some(re => re.test(p))) return "external-effect";
    return "read-only";
  }

  if (WRITE_TOOLS.has(toolName)) {
    const p = String(toolInput.file_path || toolInput.notebook_path || "");
    if (!p) return "external-effect";
    const abs = resolveToken(p, cwd);
    if (SENSITIVE_READ.some(re => re.test(abs))) return "external-effect";
    return localRoots.some(r => isUnder(abs, r)) ? "in-worktree" : "external-effect";
  }

  if (LOCAL_TOOLS.has(toolName)) return "in-worktree";

  if (toolName === "Bash") {
    const command = String(toolInput.command || "");
    // A credential path makes the whole command external-effect whatever its verb is. It has to
    // live HERE and not only in the settings override, because the domain is inside the
    // signature: without this, `cat ~/.aws/credentials` keys to `read-only:cat` and is answered
    // by the catalogue's ordinary `cat` rule. Caught by the smoke test, not by reading the code.
    if (touchesSecret(toolName, toolInput, cwd)) return "external-effect";
    const parts = statements(command).filter(s => s.trim() !== "");
    if (parts.length === 0) return "read-only";
    return worst(parts.map(s => bashStatementDomain(s, cwd, localRoots)));
  }

  // WebFetch, WebSearch, every MCP tool, and anything this file has never heard of.
  return "external-effect";
}

// ---------------------------------------------------------------------------
// Signature — what makes "the same request" the same, policy §5
// ---------------------------------------------------------------------------

/** The shape of one Bash statement: its head, plus the subcommand for the multiplexer tools. */
function statementShape(statement) {
  const head = headOf(statement).toLowerCase();
  if (!head) return "";
  if (["git", "gh", "npm", "npx", "node", "docker", "systemctl"].includes(head)) {
    const ops = operandsOf(statement);
    const sub = (ops[0] || "").toLowerCase().replace(/[^a-z0-9:._-]/g, "");
    // `npm run <alias>` is three levels deep before it means anything.
    if ((head === "npm" || head === "npx") && sub === "run") {
      const alias = (ops[1] || "").toLowerCase().replace(/[^a-z0-9:._-]/g, "");
      return `${head}-run-${alias}`;
    }
    return sub ? `${head}-${sub}` : head;
  }
  return head;
}

function signature(toolName, toolInput, domain, cwd, top) {
  if (toolName === "Bash") {
    const parts = statements(String(toolInput.command || ""))
      .map(statementShape)
      .filter(Boolean);
    const shape = [...new Set(parts)].sort().join("+") || "empty";
    // The domain belongs IN the key, not beside it. Without it, `rm` inside this worktree and
    // `rm` against ~/SPO-Original share one signature, and a rule promoted for the first would
    // silently answer for the second — a widening, which nothing else in this file can produce.
    return `${SIG_VERSION}:bash:${domain}:${shape}`;
  }
  if (READ_ONLY_TOOLS.has(toolName) || WRITE_TOOLS.has(toolName)) {
    const p = String(toolInput.file_path || toolInput.path || toolInput.notebook_path || "");
    let where = "outside";
    if (p) {
      const abs = resolveToken(p, cwd);
      if (top && isUnder(abs, top)) {
        const rel = path.relative(top, abs);
        where = rel.split(path.sep).slice(0, 2).join("/") || ".";
      }
    }
    return `${SIG_VERSION}:${toolName.toLowerCase()}:${domain}:${where}`;
  }
  return `${SIG_VERSION}:${toolName.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// settings.json allow/deny — ladder steps 1 and 3
// ---------------------------------------------------------------------------

/**
 * Does `entry` (a settings permission string) cover this call?
 *
 * Deliberately conservative: it re-implements enough of Claude Code's matching to recognise the
 * shapes this repository actually uses — a bare tool name, `Tool(prefix *)`, `Tool(exact)` and
 * `Read(//abs/**)`. Getting it too strict costs one arbiter call; getting it too loose lets an
 * interruption survive. Neither widens anything, which is why the approximation is acceptable
 * here and would not be inside a guard.
 */
function entryCovers(entry, toolName, toolInput) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:\((.*)\))?$/s.exec(entry.trim());
  if (!m) return false;
  const [, tool, pattern] = m;
  if (tool !== toolName) return false;
  if (pattern === undefined) return true; // bare `Read`, `Write`, `Bash` — the whole tool

  if (toolName === "Bash") {
    // Single-entry answer, kept for the tests and for callers asking about one entry. The real
    // question for a compound command is asked in settingsVerdict(): `npm run lint; gh pr list`
    // is covered by two DIFFERENT entries and by neither alone.
    const parts = statements(String(toolInput.command || "")).map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return false;
    return parts.every(s => bashPatternCovers(pattern, s));
  }

  const p = String(toolInput.file_path || toolInput.path || toolInput.notebook_path || "");
  if (!p) return false;
  const glob = pattern.replace(/^\/\//, "/");
  const re = new RegExp("^" + glob.split("**").map(seg =>
    seg.split("*").map(x => x.replace(/[.+^${}()|[\]\\]/g, "\\$&")).join("[^/]*")
  ).join(".*") + "$");
  return re.test(p);
}

function bashPatternCovers(pattern, statement) {
  const s = statement.replace(/^[\s(){`]*/, "").trim();
  if (pattern === "*") return true;
  const star = pattern.indexOf("*");
  if (star === -1) return s === pattern;
  const prefix = pattern.slice(0, star);
  return s.startsWith(prefix);
}

function settingsVerdict(settingsFiles, toolName, toolInput) {
  const allow = [];
  const deny = [];
  for (const file of settingsFiles) {
    const data = readJson(file);
    const perms = data && data.permissions;
    if (!perms) continue;
    if (Array.isArray(perms.allow)) allow.push(...perms.allow);
    if (Array.isArray(perms.deny)) deny.push(...perms.deny);
  }
  if (toolName === "Bash") {
    const parts = statements(String(toolInput.command || "")).map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    const patterns = list => list
      .map(e => /^Bash(?:\((.*)\))?$/s.exec(e.trim()))
      .filter(Boolean)
      .map(m => (m[1] === undefined ? "*" : m[1]));
    const denyPats = patterns(deny);
    const allowPats = patterns(allow);
    // One denied segment denies the command — the shell runs them all.
    if (parts.some(s => denyPats.some(p => bashPatternCovers(p, s)))) return "deny";
    // Every segment must be covered, but not by the same entry: `npm run lint; gh pr list` is
    // two entries' worth of permission and Claude Code judges it segment by segment.
    if (parts.every(s => allowPats.some(p => bashPatternCovers(p, s)))) return "allow";
    return null;
  }

  if (deny.some(e => entryCovers(e, toolName, toolInput))) return "deny";
  if (allow.some(e => entryCovers(e, toolName, toolInput))) return "allow";
  return null;
}

// ---------------------------------------------------------------------------
// Catalogue and provisional lookup — ladder steps 4 and 5
// ---------------------------------------------------------------------------

function catalogueLookup(rulesFile, sig) {
  const data = readJson(rulesFile);
  if (!data || !Array.isArray(data.rules)) return null;
  const hit = data.rules.find(r => r && r.signature === sig);
  return hit || null;
}

function provisionalLookup(permDir, sig) {
  const file = path.join(permDir, "provisional", sig.replace(/[^A-Za-z0-9._+:-]/g, "_") + ".json");
  const data = readJson(file);
  if (!data || !data.decision) return null;
  if (data.expires_at && Date.parse(data.expires_at) < Date.now()) return null;
  return data;
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

function decide(payload, env) {
  const out = sig => ({ signature: sig });

  // Re-entrancy: the arbiter itself runs with no tools, so no PreToolUse can fire inside it —
  // this marker is the belt to that braces, and costs one string compare.
  if (env.SPO_PERM_ARBITER === "1") return { outcome: "silent", why: "arbiter subprocess" };

  if (payload.hook_event_name && payload.hook_event_name !== "PreToolUse") {
    return { outcome: "silent", why: "not PreToolUse" };
  }

  const toolName = String(payload.tool_name || "");
  const toolInput = (payload.tool_input && typeof payload.tool_input === "object") ? payload.tool_input : {};
  const cwd = String(payload.cwd || process.cwd());
  const top = env.SPO_TOP || "";

  // Modes where nothing would have prompted: there is no interruption to remove, so the broker
  // has no work and must not invent any. `acceptEdits` covers the write tools only.
  const mode = String(payload.permission_mode || "");
  if (mode === "bypassPermissions" || mode === "dontAsk") {
    return { outcome: "silent", why: `permission_mode=${mode}` };
  }
  if (mode === "acceptEdits" && WRITE_TOOLS.has(toolName)) {
    return { outcome: "silent", why: "permission_mode=acceptEdits" };
  }

  const domain = classifyDomain(toolName, toolInput, cwd, top);
  const sig = signature(toolName, toolInput, domain, cwd, top);
  const base = { ...out(sig), domain, tool: toolName };

  const settingsFiles = (env.SPO_PERM_SETTINGS || "").split(":").filter(Boolean);
  const fromSettings = settingsVerdict(settingsFiles, toolName, toolInput);
  if (fromSettings === "deny") {
    // Claude Code enforces this itself, after any hook decision. Saying nothing keeps one
    // authority for it and keeps the refusal text the maintainer's, not ours.
    return { ...base, outcome: "silent", why: "settings deny — Claude Code enforces it" };
  }
  if (fromSettings === "allow" && !touchesSecret(toolName, toolInput, cwd)) {
    return { ...base, outcome: "silent", why: "settings allow — already a promoted decision" };
  }
  // The one place the broker does NOT stand down in front of an allow entry. `permissions.allow`
  // here contains bare `Read`, `Write` and `Edit` — the widest entries in the whole config, and
  // they cover the entire disk, so a private key reads today with no prompt at all. `ask` beats
  // `allow` in Claude Code's own precedence, so escalating here NARROWS, which is the only
  // direction this file is ever allowed to move (policy §4). It does not second-guess the
  // maintainer's intent for anything else.

  const rule = catalogueLookup(env.SPO_PERM_RULES || "", sig);
  if (rule) {
    return {
      ...base,
      outcome: rule.decision,
      reason: rule.reason,
      corrected_form: rule.corrected_form,
      // policy §4bis: an allow can still teach. The guidance rides back as additionalContext,
      // which is what makes the hundredth malformed corpus search cost a file read, not a call.
      guidance: rule.guidance,
      source: `rules.json#${rule.id}`,
    };
  }

  // policy §3: an external effect is re-judged on every capture, so a cached ALLOW is never
  // read back for it. A cached deny is, because a deny only narrows.
  const prov = provisionalLookup(env.SPO_PERM_DIR || path.join(os.homedir(), ".spo-perm"), sig);
  if (prov && (prov.decision !== "allow" || domain !== "external-effect")) {
    return {
      ...base,
      outcome: prov.decision,
      reason: prov.reason,
      corrected_form: prov.corrected_form,
      guidance: prov.guidance,
      source: "provisional",
    };
  }

  return { ...base, outcome: "arbitrate", why: prov ? "external effect — never cached" : "no rule" };
}

// ---------------------------------------------------------------------------

function main() {
  let raw = "";
  process.stdin.on("data", c => (raw += c));
  process.stdin.on("end", () => {
    let payload = {};
    try {
      payload = JSON.parse(raw) || {};
    } catch {
      payload = {};
    }
    let verdict;
    try {
      verdict = decide(payload, process.env);
    } catch (err) {
      // A crash here must not block a session: the wrapper reads `silent` and the normal
      // permission flow resumes, which is exactly today's behaviour.
      verdict = { outcome: "silent", why: "broker error: " + String(err && err.message) };
    }
    process.stdout.write(JSON.stringify(verdict) + "\n");
  });
}

if (require.main === module) main();

module.exports = {
  decide,
  classifyDomain,
  signature,
  entryCovers,
  settingsVerdict,
  statementIsReadOnly,
  touchesSecret,
  headOf,
};
