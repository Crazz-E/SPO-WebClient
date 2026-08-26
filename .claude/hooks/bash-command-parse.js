// Shared Bash-command parsing for the PreToolUse write guards.
//
// Extracted out of driver-scope-guard.js so that a second guard needing the same "what path
// does this shell command write to" question — worktree-scope-guard.js — does not carry its
// own copy of the heredoc-stripping and token-extraction logic. Two guards independently
// getting this wrong in slightly different ways is worse than one guard depending on the
// other's parsing: a heredoc body that merely mentions `rm` must read as text everywhere, or
// one guard cries wolf while the other stays silent on the identical command.
//
// This module owns PARSING ONLY — turning a command string into a list of candidate path
// tokens. It carries no opinion about which paths are dangerous; each guard supplies its own
// verb list and does its own resolution (driver-scope-guard.js asks "is this tracked?",
// worktree-scope-guard.js asks "is this under another tree?"). Changing this file changes
// both guards, so a change here needs both test suites green, not just one.

"use strict";

/** Strip surrounding matching quotes from a single token. */
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

/**
 * Candidate path tokens a Bash command names: every `>`/`>>` redirection target, plus every
 * bare-word operand following one of the caller-supplied `verbs` regexes (global, matched
 * against the heredoc-stripped command). Order and de-duplication are left to the caller;
 * tokens are unquoted but not resolved to absolute paths.
 *
 * `maxCandidates` bounds pathological input (a command with hundreds of operands) — the same
 * default driver-scope-guard.js has used since it was a single file.
 */
function bashCandidates(command, verbs, maxCandidates = 40) {
  const text = stripHeredocs(command);
  const out = [];

  for (const m of text.matchAll(/(?<!&)>>?\s*(?!&)("[^"]+"|'[^']+'|[^\s;&|<>()]+)/g)) {
    out.push(unquote(m[1]));
  }

  for (const verb of verbs) {
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
  return out.slice(0, maxCandidates);
}

module.exports = { unquote, stripHeredocs, bashCandidates };
