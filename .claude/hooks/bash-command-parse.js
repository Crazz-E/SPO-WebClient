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

// Quote-aware split: masks every quoted span ('...' or "...") before applying `pattern`, then
// slices the ORIGINAL text at the boundaries found in the masked copy — so a delimiter INSIDE
// a quoted span (the `|` in `grep "foo|bar"`, the `(` in `grep -rn "= class("`) is invisible to
// the split, while the same delimiter between quotes still splits, and the quoted text itself
// reaches the caller untouched (sliced from the original, not rebuilt from the mask).
//
// Falls back to a plain, non-quote-aware `text.split(pattern)` on unbalanced quotes — safety
// first: that is exactly what verdict-pipe-guard.sh's split did before this helper existed, so
// a command whose quoting this function cannot make sense of is read no worse than before, only
// better once the quotes balance.
function splitOutsideQuotes(text, pattern) {
  let mask = "";
  let quote = null;
  for (const ch of text) {
    if (quote) {
      mask += ch === quote ? ch : "\0";
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      mask += ch;
    } else {
      mask += ch;
    }
  }
  if (quote !== null) return text.split(pattern);

  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  const re = new RegExp(pattern.source, flags);
  const parts = [];
  let last = 0;
  let m;
  while ((m = re.exec(mask)) !== null) {
    parts.push(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  parts.push(text.slice(last));
  return parts;
}

// The statement boundary verdict-pipe-guard.sh has used since it existed: a newline, `;`,
// `&&`, `||`, a backtick or `$(` opening a substitution, or a bare `(` opening a subshell.
// Heredoc-stripped first (a heredoc body is text, not commands) and quote-aware (a `(` or `;`
// quoted inside a pattern argument no longer looks like it opens a subshell or ends a
// statement) — the fix investigation-form-guard.js needs for `grep -rn "= class("` and the fix
// verdict-pipe-guard.sh gets for free by depending on this instead of its own inline copy.
const STATEMENT_SPLIT = /\n|;|&&|\|\||`|\$\(|\(/;

function statements(command) {
  return splitOutsideQuotes(stripHeredocs(command), STATEMENT_SPLIT);
}

module.exports = { unquote, stripHeredocs, bashCandidates, splitOutsideQuotes, statements };
