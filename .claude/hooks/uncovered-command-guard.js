// Logic for .claude/hooks/uncovered-command-guard.sh — the LLM fallback layer.
//
// Three modes, selected by argv[2], payload/data always on stdin:
//
//   trigger   PreToolUse(Bash) payload in -> "SKIP" | "COVERED" | "UNCOVERED\t<json>"
//   prompt    the UNCOVERED json in -> the classifier's user-turn prompt text out
//   parse     the raw `claude -p --output-format json` envelope in -> a TSV verdict line,
//             or the literal string "ERROR"
//
// `trigger` decides "does the scripted layer already cover this?" WITHOUT ever paying for an
// LLM call: it merges the Bash(...) prefix/exact patterns out of every settings file the
// harness itself reads (repo settings.json, the gitignored repo settings.local.json, the
// user's ~/.claude/settings.json), splits the command into top-level statements the same way
// verdict-pipe-guard.sh and investigation-form-guard.js do (bash-command-parse.js, heredoc- and
// quote-aware), and requires EVERY statement to match some pattern before calling it COVERED.
//
// The bias is deliberately asymmetric, and that asymmetry is the whole point of this file:
//   - a false COVERED costs a human a permission prompt (visible immediately; fix the matcher) —
//     this can only happen if the local pattern list under-approximates what the harness itself
//     allows, i.e. never, by construction, since it reads the exact same files;
//   - a false UNCOVERED costs one Haiku call and, usually, a deny whose corrected form IS the
//     already-allowlisted equivalent — one extra turn, and no human is ever involved.
// So this file is written to never claim COVERED unless a statement provably matches a pattern
// the harness itself would have matched; anything it isn't sure about falls to the LLM.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { statements } = require("./bash-command-parse");

const MAX_COMMAND_CHARS = 2000;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// Every `Bash(...)` entry in `permissions.allow` / `permissions.deny` across the files the
// harness itself layers, merged into one flat pattern list. A file that is missing or fails to
// parse contributes nothing — more patterns only ever means fewer LLM calls, never a wrong
// COVERED, so a read failure here must never become a hard error.
function loadBashPatterns(top, userSettingsPath) {
  const files = [
    path.join(top, ".claude", "settings.json"),
    path.join(top, ".claude", "settings.local.json"),
    userSettingsPath,
  ];
  const patterns = [];
  for (const file of files) {
    const config = readJson(file);
    if (!config || typeof config !== "object") continue;
    const perms = config.permissions;
    if (!perms || typeof perms !== "object") continue;
    for (const list of [perms.allow, perms.deny]) {
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        if (typeof entry !== "string") continue;
        const m = entry.match(/^Bash\((.*)\)$/s);
        if (!m) continue;
        const body = m[1];
        if (body.endsWith("*")) {
          patterns.push({ prefix: body.slice(0, -1) });
        } else {
          patterns.push({ exact: body });
        }
      }
    }
  }
  return patterns;
}

function matchesAny(text, patterns) {
  for (const p of patterns) {
    if (p.prefix !== undefined && text.startsWith(p.prefix)) return true;
    if (p.exact !== undefined && text === p.exact) return true;
  }
  return false;
}

// A leading run of `VAR=value` shell assignments in front of the real command — the same
// concern verdictInNonFinalPosition's own `strip` handles, kept local because that helper's
// stripping is bundled with logic this file does not want (query detection, position tracking).
function stripLeadingAssignments(statement) {
  return statement.replace(
    /^\s*(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+)*/,
    ""
  );
}

function isCovered(command, patterns) {
  const trimmed = command.trim();
  if (!trimmed) return true; // nothing to classify
  if (matchesAny(trimmed, patterns)) return true; // whole-command fast path

  const parts = statements(command)
    .map((s) => stripLeadingAssignments(s.trim()).trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return true;

  return parts.every((s) => matchesAny(s, patterns));
}

function runTrigger(payload, env) {
  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    return "COVERED"; // unparseable payload — nothing this layer can safely act on
  }
  if (!data || typeof data !== "object") return "COVERED";

  if (data.permission_mode === "bypassPermissions") return "SKIP";

  const command = (data.tool_input && data.tool_input.command) || "";
  if (typeof command !== "string" || !command.trim()) return "COVERED";

  const top = env.SPO_TOP || process.cwd();
  const userSettingsPath =
    env.SPO_USER_SETTINGS || path.join(os.homedir(), ".claude", "settings.json");
  const patterns = loadBashPatterns(top, userSettingsPath);

  if (isCovered(command, patterns)) return "COVERED";

  const out = {
    command: command.length > MAX_COMMAND_CHARS ? command.slice(0, MAX_COMMAND_CHARS) + "…[truncated]" : command,
    cwd: data.cwd || "",
    agent: data.agent_id ? "subagent" : "driver",
    permission_mode: data.permission_mode || "",
  };
  return "UNCOVERED\t" + JSON.stringify(out);
}

function runPrompt(payload) {
  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    data = {};
  }
  const command = data.command || "";
  const cwd = data.cwd || "(unknown)";
  const agent = data.agent || "driver";
  const permissionMode = data.permission_mode || "(unset)";
  return [
    "Classify this Bash command. It reached you because no allowlisted pattern, deny pattern,",
    "or existing scripted guard already covers it — that check already ran, cheaply, before you",
    "were invoked. Follow the rules and the output contract given in your system prompt exactly.",
    "",
    `command: ${command}`,
    `cwd: ${cwd}`,
    `invoked_by: ${agent}`,
    `permission_mode: ${permissionMode}`,
  ].join("\n");
}

const REQUIRED_FIELDS = ["classification", "reason", "worth_hardening", "rule_slug", "harden_target"];
const VALID_CLASSIFICATIONS = new Set(["needs-form", "capability-gap", "out-of-scope"]);
const VALID_TARGETS = new Set(["allowlist", "guard", "docs", "none"]);

function tsvEscape(v) {
  return String(v == null ? "" : v).replace(/[\t\n\r]+/g, " ").trim();
}

function runParse(raw) {
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return "ERROR";
  }
  if (!envelope || typeof envelope !== "object") return "ERROR";

  let structured = envelope.structured_output;
  if (!structured && typeof envelope.result === "string") {
    try {
      structured = JSON.parse(envelope.result);
    } catch {
      structured = null;
    }
  }
  if (!structured || typeof structured !== "object") return "ERROR";

  for (const field of REQUIRED_FIELDS) {
    if (!(field in structured)) return "ERROR";
  }
  if (!VALID_CLASSIFICATIONS.has(structured.classification)) return "ERROR";
  if (!VALID_TARGETS.has(structured.harden_target)) return "ERROR";
  if (typeof structured.worth_hardening !== "boolean") return "ERROR";

  return [
    tsvEscape(structured.classification),
    tsvEscape(structured.reason),
    tsvEscape(structured.explanation),
    tsvEscape(structured.corrected_command),
    structured.worth_hardening ? "true" : "false",
    tsvEscape(structured.rule_slug),
    tsvEscape(structured.harden_target),
  ].join("\t");
}

function runThrottle(journalPath, sessionKey, maxAgeSeconds) {
  let content;
  try {
    content = fs.readFileSync(journalPath, "utf8");
  } catch {
    return 0;
  }
  const cutoff = Date.now() - maxAgeSeconds * 1000;
  let count = 0;
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.session_key !== sessionKey) continue;
    const t = Date.parse(entry.ts);
    if (!Number.isNaN(t) && t >= cutoff) count++;
  }
  return count;
}

function readStdin() {
  return fs.readFileSync(0, "utf8");
}

function main() {
  const mode = process.argv[2];
  if (mode === "trigger") {
    process.stdout.write(runTrigger(readStdin(), process.env) + "\n");
  } else if (mode === "prompt") {
    process.stdout.write(runPrompt(readStdin()) + "\n");
  } else if (mode === "parse") {
    process.stdout.write(runParse(readStdin()) + "\n");
  } else if (mode === "throttle") {
    const journalPath = process.argv[3];
    const sessionKey = process.argv[4];
    const maxAge = Number(process.argv[5]) || 3600;
    process.stdout.write(String(runThrottle(journalPath, sessionKey, maxAge)) + "\n");
  } else {
    process.stderr.write("usage: uncovered-command-guard.js <trigger|prompt|parse|throttle>\n");
    process.exit(64);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadBashPatterns,
  matchesAny,
  stripLeadingAssignments,
  isCovered,
  runTrigger,
  runPrompt,
  runParse,
  runThrottle,
};
