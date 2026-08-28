#!/usr/bin/env node
// Refusal ledger — counts, per session and per guard, how many times a blocking guard has
// refused the SAME driver in a row this session, so a guard's escalation paragraph (card #369)
// can tell "first refusal" from "the fourth attempt at a different spelling of the same thing".
//
// WHY THIS EXISTS. The six blocking guards (verdict-pipe, poll-loop, worktree-scope,
// driver-scope, bench-port, item-list) each refuse a shape and name the sanctioned form — but
// a refusal has no memory of its own. A driver that reads a refusal, composes a slightly
// different command, gets refused again, and repeats is workaround-hunting: the fix was never
// "find a shape the guard does not catch", it was "run the form the guard already named, or
// stop and escalate". Nothing before this counted how many times that had already happened.
//
// USAGE. `node refusal-ledger.js <guard-name>` — reads the session's ledger file, increments
// the count for `<guard-name>`, writes it back, and prints the NEW count (an integer) to
// stdout. Always exits 0: a ledger that cannot be read or written must never be the reason a
// guard fails to block the thing it was already refusing.
//
// SESSION KEY. Same derivation as session-heartbeat.sh and driver-scope-guard.sh: the git
// top-level directory's absolute path, sha1sum'd, first 16 hex chars — so all three name the
// same session the same way without sharing a process.
//
// STORAGE. One file per session, `~/.spo-bench/sessions/<key>.refusals`, JSON Lines: one line
// per (guard, count-at-time-of-write) — `{"guard":"<name>","count":<n>,"timestamp":<ms>}`. A
// new count for a guard is APPENDED, not rewritten in place — the file is a log, and only the
// LAST line for a given guard is authoritative. Corrupt or missing lines are skipped, never
// fatal: a fresh session (no file), a truncated write, a hand-edited line all just read as "no
// prior count for this guard", never as an error that blocks the caller.

"use strict";

const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

function say(count) {
  process.stdout.write(String(count) + "\n");
  process.exit(0);
}

function fail(count) {
  // Never let a ledger failure block the guard that called us — worst case, report 0 (this
  // guard's escalation never fires, which is the safe direction to fail in).
  say(count);
}

const guard = process.argv[2];
if (!guard || typeof guard !== "string") {
  fail(0);
}

let top;
try {
  top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  fail(0);
}
if (!top) fail(0);

try {
  top = fs.realpathSync(top);
} catch {
  // realpath failing on a path git itself just returned is unexpected but not fatal — fall
  // back to the unresolved form rather than give up the whole call.
}

const key = crypto.createHash("sha1").update(top).digest("hex").slice(0, 16);

const store = process.env.SPO_SESSION_DIR || path.join(os.homedir(), ".spo-bench", "sessions");
const ledgerPath = path.join(store, `${key}.refusals`);

try {
  fs.mkdirSync(store, { recursive: true });
} catch {
  fail(0);
}

// Read the existing ledger, if any, and find the last recorded count for this guard.
let priorCount = 0;
try {
  const raw = fs.readFileSync(ledgerPath, "utf8");
  const lines = raw.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue; // a corrupt line is skipped, never fatal — keep reading the rest
    }
    if (entry && typeof entry === "object" && entry.guard === guard && typeof entry.count === "number") {
      priorCount = entry.count;
    }
  }
} catch {
  // Missing or unreadable file — a fresh session, treated as count 0.
  priorCount = 0;
}

const newCount = priorCount + 1;
const entry = JSON.stringify({ guard, count: newCount, timestamp: Date.now() });

try {
  fs.appendFileSync(ledgerPath, entry + "\n");
} catch {
  // The write failed (disk full, permissions, a racing writer) — still report the count we
  // computed, so the calling guard's escalation logic sees the truth about THIS refusal even
  // if it could not be persisted for the next one.
  fail(newCount);
}

say(newCount);
