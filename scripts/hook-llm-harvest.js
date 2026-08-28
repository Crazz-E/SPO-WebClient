#!/usr/bin/env node
// npm run hook:harvest -- --take
// npm run hook:harvest -- --resolve <signature> --verdict FILED|DO-NOT-FILE|ABANDONED [--issue <n>]
//
// The local half of the self-learning loop `.claude/hooks/uncovered-command-guard.sh` feeds.
// That hook journals every LLM-fallback verdict to
// ${SPO_BENCH_DIR:-$HOME/.spo-bench}/hook-llm/journal.jsonl and never touches GitHub. This
// script reads that journal, groups it into candidate patterns, and — for one recurring or
// classifier-flagged candidate per call — writes a draft card the calling session (normally
// `/next-task § 0.5`) can hand to `card-reviewer` and file exactly the way every other card
// in this repo is filed: no GitHub read here, ever (doc/kanban-workflow.md § GitHub API
// discipline — this script is the "local surface" that rule wants).
//
// Dedup is a local marker file, filed.jsonl, never a GitHub query: a signature moves through
// CLAIMED (this call, --take) -> FILED / DO-NOT-FILE / ABANDONED (the calling session,
// --resolve). A stale CLAIMED (older than one hour — a session that crashed mid-harvest)
// is reclaimable, so one dead session can never permanently block a real candidate.
//
// Exit codes ARE the verdict, like everything else in this repo:
//   --take     0 = a candidate was drafted (stdout: "candidate: <sig>" then "draft: <path>")
//              1 = no eligible candidate
//   --resolve  0 = recorded
//   either     2 = usage error, before anything is read or written

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const BENCH_DIR = process.env.SPO_BENCH_DIR || path.join(os.homedir(), ".spo-bench");
const DIR = path.join(BENCH_DIR, "hook-llm");
const JOURNAL = path.join(DIR, "journal.jsonl");
const FILED = path.join(DIR, "filed.jsonl");
const DRAFTS_DIR = path.join(DIR, "drafts");

const CLAIM_STALE_MS = 60 * 60 * 1000; // 1 hour
const RECURRENCE_THRESHOLD = 3;
const VERDICTS_COUNTED = new Set(["guide", "gap", "out-of-scope"]);
const RESOLVE_VERDICTS = new Set(["FILED", "DO-NOT-FILE", "ABANDONED"]);

const TARGET_TO_AREA = { guard: "bench", allowlist: "ci", docs: "docs", none: "ci" };

function readJsonl(file) {
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // one corrupt line must never take down the whole harvest
    }
  }
  return out;
}

function appendJsonl(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(obj) + "\n");
}

function sanitizeSlug(raw, fallbackSeed) {
  const slug = String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug) return slug.slice(0, 60);
  // No slug from the classifier — fall back to a short hash of the command so the entry is
  // still grouped consistently across repeat sightings, rather than dropped.
  const crypto = require("crypto");
  return "unslugged-" + crypto.createHash("sha1").update(fallbackSeed || "").digest("hex").slice(0, 8);
}

/** The latest terminal-or-claim state for a signature, or null if it has none. */
function latestFiledState(filedEntries, signature) {
  let latest = null;
  for (const e of filedEntries) {
    if (e.signature !== signature) continue;
    if (!latest || Date.parse(e.ts) > Date.parse(latest.ts)) latest = e;
  }
  return latest;
}

function isBlocked(filedEntries, signature, now) {
  const latest = latestFiledState(filedEntries, signature);
  if (!latest) return false;
  if (RESOLVE_VERDICTS.has(latest.verdict)) return true; // terminal, forever
  if (latest.verdict === "CLAIMED") {
    const age = now - Date.parse(latest.ts);
    return !(Number.isNaN(age) || age > CLAIM_STALE_MS); // fresh claim blocks, stale reclaims
  }
  return false;
}

function groupCandidates(journalEntries) {
  const groups = new Map();
  for (const e of journalEntries) {
    if (!VERDICTS_COUNTED.has(e.verdict)) continue;
    const signature = sanitizeSlug(e.rule_slug, e.command);
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(e);
  }
  return groups;
}

function pickCandidate(groups, filedEntries) {
  const now = Date.now();
  let best = null;
  for (const [signature, entries] of groups) {
    if (isBlocked(filedEntries, signature, now)) continue;
    const worthHardening = entries.some((e) => e.worth_hardening === true);
    if (!worthHardening && entries.length < RECURRENCE_THRESHOLD) continue;
    const firstTs = entries.reduce(
      (min, e) => Math.min(min, Date.parse(e.ts) || Infinity),
      Infinity
    );
    if (!best || firstTs < best.firstTs) best = { signature, entries, firstTs };
  }
  return best;
}

function draftBody(signature, entries) {
  const last = entries[entries.length - 1];
  const target = TARGET_TO_AREA[last.harden_target] ? last.harden_target : "allowlist";
  const area = TARGET_TO_AREA[target] || "ci";
  const samples = entries
    .slice(-3)
    .map((e) => `- \`${e.command}\` (${e.ts})`)
    .join("\n");
  const first = entries[0];
  const lastSeen = entries[entries.length - 1];
  const correctedLine = last.corrected_command
    ? `Proposed corrected form seen by the classifier: \`${last.corrected_command}\``
    : "No corrected form exists yet — this is a genuine capability gap.";

  const lines = [
    `# Hook hardening: ${signature}`,
    "",
    "Filed by the hook-LLM self-learning loop (`.claude/hooks/uncovered-command-guard.sh` ->",
    "`scripts/hook-llm-harvest.js`), never by a human or a claimed session noticing something",
    "in passing. Source: doc/hook-llm-layer.md.",
    "",
    "## What happened",
    "",
    `The scripted hook layer does not cover this shape of Bash command. Every sighting fell`,
    `through to the LLM fallback layer, which denied it with guidance rather than letting it`,
    `run or asking a human. Sighted ${entries.length} time(s), ${first.ts} through ${lastSeen.ts}.`,
    "",
    "Sample commands:",
    "",
    samples,
    "",
    "## The classifier's read",
    "",
    `- reason: ${last.reason || "(none recorded)"}`,
    `- ${correctedLine}`,
    `- harden_target: ${target}`,
    "",
    "## What this card is",
    "",
    target === "allowlist"
      ? "Add a `Bash(...)` prefix to `.claude/settings.json` for this shape, scoped as narrowly as the samples above allow — this is a permission change and needs the same care as any other."
      : target === "guard"
        ? "Extend an existing `.claude/hooks/*.sh` guard, or add a new one, so this shape is caught by the scripted layer instead of paying for an LLM call."
        : "Add the missing sentence to CLAUDE.md or a skill so this shape has a documented sanctioned form.",
    "",
    "A durable capability change (an allowlist entry) still needs the maintainer's review, same",
    "as always — this card proposes it, it does not grant it.",
    "",
    "## Fields",
    "",
    "Category: 🟡 Feature/Gap (`cat:feature`)",
    "Size: S (`size:S`)",
    `Area: ${area}`,
  ];
  return lines.join("\n");
}

function cmdTake() {
  const journalEntries = readJsonl(JOURNAL);
  const filedEntries = readJsonl(FILED);
  const groups = groupCandidates(journalEntries);
  const best = pickCandidate(groups, filedEntries);

  if (!best) {
    process.stdout.write("candidates: none\n");
    process.exit(1);
  }

  appendJsonl(FILED, { signature: best.signature, verdict: "CLAIMED", ts: new Date().toISOString() });

  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  const draftPath = path.join(DRAFTS_DIR, `${best.signature}.md`);
  fs.writeFileSync(draftPath, draftBody(best.signature, best.entries));

  process.stdout.write(`candidate: ${best.signature}\n`);
  process.stdout.write(`draft: ${draftPath}\n`);
  process.exit(0);
}

function cmdResolve(args) {
  let signature = null;
  let verdict = null;
  let issue = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--verdict") verdict = args[++i];
    else if (args[i] === "--issue") issue = args[++i];
    else if (!signature && !args[i].startsWith("--")) signature = args[i];
  }
  if (!signature || !verdict) {
    process.stderr.write("usage: hook-llm-harvest.js --resolve <signature> --verdict FILED|DO-NOT-FILE|ABANDONED [--issue <n>]\n");
    process.exit(2);
  }
  if (!RESOLVE_VERDICTS.has(verdict)) {
    process.stderr.write(`unknown verdict: ${verdict} (expected one of ${[...RESOLVE_VERDICTS].join(", ")})\n`);
    process.exit(2);
  }
  const entry = { signature, verdict, ts: new Date().toISOString() };
  if (issue) entry.issue = Number(issue) || issue;
  appendJsonl(FILED, entry);
  process.stdout.write(`resolved: ${signature} -> ${verdict}\n`);
  process.exit(0);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--resolve")) {
    cmdResolve(args.filter((a) => a !== "--resolve"));
    return;
  }
  if (args.includes("--take") || args.length === 0) {
    cmdTake();
    return;
  }
  process.stderr.write("usage: hook-llm-harvest.js --take | --resolve <signature> --verdict <V> [--issue <n>]\n");
  process.exit(2);
}

main();

module.exports = { sanitizeSlug, groupCandidates, pickCandidate, isBlocked, draftBody };
