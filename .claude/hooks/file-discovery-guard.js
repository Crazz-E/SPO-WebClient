// The decision half of .claude/hooks/file-discovery-guard.sh — see that file for WHY.
//
// Reads a PreToolUse payload on stdin, prints one line-or-more to stdout: the literal string
// "ALLOW", or a full BLOCKED explanation (reason, corrected command, override). It lives in
// its own file for the same reason driver-scope-guard.js does: a hook is a program with an
// exit-code contract, so it can be tested directly — src/__tests__/file-discovery-guard.test.ts
// drives this file with crafted payloads. Always exits 0; the wrapper turns "not ALLOW" into
// exit 2, so a defect here fails the build loudly instead of ever blocking a session's turn.
//
// Card #398. Detects two shell forms that should route through the Glob and Grep tools instead:
//
//   1. `find` commands with glob patterns (-name, -path, -iname, -ipath with wildcards)
//   2. `grep` commands searching files (single file or -r recursive)
//
// Both forms work, but the tools provide structured output and better integration with the
// Claude Code harness (cwd awareness, error handling, cancellation). Scope is deliberately
// narrow: a command that reads files via find/grep is in scope; other forms pass through.

"use strict";

const path = require("path");
const { statements, unquote } = require("./bash-command-parse");

function say(v) {
  process.stdout.write(v);
  process.exit(0);
}

// Whitespace-delimited tokens, preserving a single- or double-quoted span as one token so its
// interior (spaces, parens, pipes) survives intact.
function tokenize(s) {
  return s.match(/"[^"]*"|'[^']*'|\S+/g) || [];
}

function isFlag(tok) {
  return tok.startsWith("-") && tok !== "-";
}

// Detects glob metacharacters in a pattern string: *, ?, [], etc.
function hasGlobChars(s) {
  return /[*?\[\]]/.test(s);
}

// Analyze a statement for find commands with glob patterns.
function analyzeFindStatement(text, tokens) {
  // Find the `find` or `fd` token (skip variable assignments)
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  if (!tokens[i] || (tokens[i] !== "find" && tokens[i] !== "fd")) return null;

  const findCmd = tokens[i];
  i++;

  // Special handling for `fd` — first positional argument is the pattern
  if (findCmd === "fd" && i < tokens.length) {
    const arg = tokens[i];
    if (!isFlag(arg)) {
      const unquoted = unquote(arg);
      if (hasGlobChars(unquoted)) {
        return { type: "find", text, pattern: unquoted, flag: "fd", cmd: findCmd };
      }
    }
  }

  // Look for glob pattern flags: -name, -path, -iname, -ipath (and their negations: ! -name, etc.)
  let pattern = null;
  let flag = null;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === "|" || tok === ";" || tok === "&&" || tok === "||") break;

    // -name, -iname, -path, -ipath take the next token as a pattern
    if ((tok === "-name" || tok === "-iname" || tok === "-path" || tok === "-ipath") && i + 1 < tokens.length) {
      const patternTok = tokens[i + 1];
      if (!isFlag(patternTok)) {
        const unquoted = unquote(patternTok);
        if (hasGlobChars(unquoted)) {
          pattern = unquoted;
          flag = tok;
          break;
        }
      }
    }

    // ! (negation) in front of a flag: ! -name
    if (tok === "!" && i + 1 < tokens.length) {
      const nextTok = tokens[i + 1];
      if ((nextTok === "-name" || nextTok === "-iname" || nextTok === "-path" || nextTok === "-ipath") && i + 2 < tokens.length) {
        const patternTok = tokens[i + 2];
        if (!isFlag(patternTok)) {
          const unquoted = unquote(patternTok);
          if (hasGlobChars(unquoted)) {
            pattern = unquoted;
            flag = nextTok;
            break;
          }
        }
      }
    }

    i++;
  }

  if (!pattern) return null;

  return { type: "find", text, pattern, flag, cmd: findCmd };
}

// Analyze a statement for grep commands searching files.
function analyzeGrepStatement(text, tokens) {
  // Find the `grep` token (skip variable assignments and ensure it's not preceded by git)
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;

  const grepIdx = tokens.findIndex((t, idx) => {
    if (idx === i) return t === "grep";
    return false;
  });

  if (grepIdx === -1) return null;
  if (grepIdx > 0 && tokens[grepIdx - 1] === "git") return null; // git grep passes through

  i = grepIdx + 1;

  // Collect flags and arguments up to the next pipe or end
  const flags = [];
  let isRecursive = false;
  let pattern = null;
  let files = [];

  let recursivePath = null;

  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === "|" || tok === ";" || tok === "&&" || tok === "||") break;

    if (isFlag(tok)) {
      // -r or --recursive
      if (tok === "-r" || tok === "--recursive" || /^-[^-]*r/.test(tok)) {
        isRecursive = true;
      }
      // Flags that take an argument: -e <pattern>, -f <file>, etc.
      if ((tok === "-e" || tok === "--regexp" || tok === "-f" || tok === "--file") && i + 1 < tokens.length) {
        const next = tokens[i + 1];
        if (!isFlag(next)) {
          if (tok === "-e" || tok === "--regexp") pattern = unquote(next);
          i++; // skip the argument
        }
      }
      flags.push(tok);
    } else {
      // Non-flag token: this is the pattern (if not set) or a file/path
      if (!pattern) {
        pattern = unquote(tok);
      } else if (isRecursive) {
        // The trailing argument to `grep -r` is the search root, not a single file — keep it
        // so the corrected Grep() call can carry the same path instead of defaulting to ".".
        recursivePath = unquote(tok);
      } else {
        files.push(unquote(tok));
      }
    }
    i++;
  }

  // Grep needs a pattern and either a file or -r flag
  if (!pattern) return null;
  if (files.length === 0 && !isRecursive) return null;

  return { type: "grep", text, pattern, file: files[0] || null, isRecursive, recursivePath };
}

// Renders the corrected find command using Glob tool call.
function buildCorrectedFind(pattern, flag, cmd) {
  // Map flag to glob pattern prefix
  let globPattern = pattern;

  // For -path patterns, ensure they can match at any depth if needed
  if ((flag === "-path" || flag === "-ipath") && !globPattern.startsWith("/")) {
    if (globPattern.startsWith("*/")) {
      // In find, a bare `*` already crosses `/` boundaries, so `*/foo` matches `foo` at any
      // depth. A glob's `*` does not cross `/` — only `**` does — so the prefix has to be
      // promoted to keep the same depth-agnostic match.
      globPattern = "**/" + globPattern.slice(2);
    } else if (!globPattern.startsWith("*") && !globPattern.startsWith(".")) {
      // Don't prefix if it already starts with * or is a relative path starting with ./
      globPattern = "**/" + globPattern;
    }
  }

  const call = `Glob(pattern="${globPattern}", path=".")`;

  // -iname/-ipath are case-insensitive in find; Glob patterns are matched case-sensitively,
  // so that distinction has no direct equivalent — flag it rather than silently dropping it.
  if (flag === "-iname" || flag === "-ipath") {
    return `${call}  # note: ${flag} was case-insensitive; Glob matches case-sensitively`;
  }

  return call;
}

// Renders the corrected grep command using Grep tool call.
function buildCorrectedGrep(pattern, file, isRecursive, recursivePath) {
  if (isRecursive) {
    const searchPath = recursivePath || ".";
    return `Grep(pattern="${pattern.replace(/"/g, '\\"')}", path="${searchPath}", glob="*")`;
  } else if (file) {
    return `Grep(pattern="${pattern.replace(/"/g, '\\"')}", path="${file}")`;
  }
  return `Grep(pattern="${pattern.replace(/"/g, '\\"')}", path=".")`;
}

function buildMessage(type, corrected) {
  const tool = type === "find" ? "Glob" : "Grep";
  const lines = [
    `BLOCKED: that searches for files using \`${type}\`. Use the ${tool} tool instead for better integration.`,
    "",
    `The Claude Code harness provides structured ${tool}() calls that integrate seamlessly with your`,
    `working directory, error handling, and other tools. They are more reliable than shell invocations.`,
    "",
    "Corrected form:",
    "",
    "  " + corrected,
    "",
    "Human override, on explicit instruction only (a session must not type this):",
    `  SPO_FILE_DISCOVERY_GUARD_OVERRIDE=i-mean-it <the original command>`,
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
  if (command.includes("SPO_FILE_DISCOVERY_GUARD_OVERRIDE=")) return say("ALLOW");

  // Quick gate: neither find nor grep in the command
  if (!/(^|\s|\|)find\s|\bfd\s|\bgrep\s/.test(command)) return say("ALLOW");

  const cwd = p.cwd || process.cwd();

  for (const stmt of statements(command)) {
    const text = stmt.trim();
    if (!text) continue;

    const tokens = tokenize(text);
    if (!tokens.length) continue;

    // Check for find with glob patterns
    let hit = analyzeFindStatement(text, tokens);
    if (hit) {
      const corrected = buildCorrectedFind(hit.pattern, hit.flag, hit.cmd);
      return say(buildMessage("find", corrected));
    }

    // Check for grep searching files
    hit = analyzeGrepStatement(text, tokens);
    if (hit) {
      const corrected = buildCorrectedGrep(hit.pattern, hit.file, hit.isRecursive, hit.recursivePath);
      return say(buildMessage("grep", corrected));
    }
  }

  return say("ALLOW");
});
