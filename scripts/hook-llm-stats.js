#!/usr/bin/env node
// npm run hook:stats
//
// Reads ONLY the local hook-LLM journal (${SPO_BENCH_DIR:-$HOME/.spo-bench}/hook-llm/) —
// zero GitHub calls, zero LLM calls. This is how the claim "the LLM layer's usage trends
// toward zero as the scripted layer absorbs more of its findings" is checked, not asserted:
// a weekly invocation count that should fall as `scripts/hook-llm-harvest.js`'s filed cards
// land, and the top recurring shapes, each next to whether it has already been filed.
//
// Always exits 0 — this is a read, not a verdict.

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const BENCH_DIR = process.env.SPO_BENCH_DIR || path.join(os.homedir(), ".spo-bench");
const DIR = path.join(BENCH_DIR, "hook-llm");
const JOURNAL = path.join(DIR, "journal.jsonl");
const FILED = path.join(DIR, "filed.jsonl");

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
      // skip
    }
  }
  return out;
}

// ISO 8601 week key, e.g. "2026-W35".
function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const weekNum =
    1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function latestFiledState(filedEntries, signature) {
  let latest = null;
  for (const e of filedEntries) {
    if (e.signature !== signature) continue;
    if (!latest || Date.parse(e.ts) > Date.parse(latest.ts)) latest = e;
  }
  return latest;
}

function filedStatusLabel(filedEntries, signature) {
  const latest = latestFiledState(filedEntries, signature);
  if (!latest) return "unfiled";
  if (latest.verdict === "FILED") return latest.issue ? `filed (#${latest.issue})` : "filed";
  if (latest.verdict === "CLAIMED") return "claimed";
  if (latest.verdict === "DO-NOT-FILE") return "do-not-file";
  if (latest.verdict === "ABANDONED") return "abandoned";
  return "unfiled";
}

function main() {
  const entries = readJsonl(JOURNAL);
  const filedEntries = readJsonl(FILED);

  if (entries.length === 0) {
    process.stdout.write("hook-llm journal: empty — the LLM fallback layer has not fired yet.\n");
    process.exit(0);
  }

  const byWeek = new Map();
  const byVerdict = { guide: 0, gap: 0, "out-of-scope": 0, error: 0, throttled: 0 };
  const bySlug = new Map();
  let errorCount = 0;

  for (const e of entries) {
    const t = Date.parse(e.ts);
    const week = Number.isNaN(t) ? "unknown" : isoWeekKey(new Date(t));
    if (!byWeek.has(week)) byWeek.set(week, { guide: 0, gap: 0, "out-of-scope": 0, error: 0, throttled: 0 });
    const wk = byWeek.get(week);
    if (Object.prototype.hasOwnProperty.call(wk, e.verdict)) wk[e.verdict]++;
    if (Object.prototype.hasOwnProperty.call(byVerdict, e.verdict)) byVerdict[e.verdict]++;
    if (e.verdict === "error") errorCount++;

    if (e.rule_slug) {
      bySlug.set(e.rule_slug, (bySlug.get(e.rule_slug) || 0) + 1);
    }
  }

  const lines = [];
  lines.push(`hook-llm journal: ${entries.length} invocation(s).`);
  lines.push("");
  lines.push("Weekly invocation trend:");
  for (const week of [...byWeek.keys()].sort()) {
    const wk = byWeek.get(week);
    const total = wk.guide + wk.gap + wk["out-of-scope"] + wk.error + wk.throttled;
    lines.push(
      `  ${week}: ${total} (guide ${wk.guide}, gap ${wk.gap}, out-of-scope ${wk["out-of-scope"]}, error ${wk.error}, throttled ${wk.throttled})`
    );
  }
  lines.push("");
  lines.push("Top uncovered shapes:");
  const topSlugs = [...bySlug.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (topSlugs.length === 0) {
    lines.push("  (none)");
  } else {
    for (const [slug, count] of topSlugs) {
      lines.push(`  ${slug}  ${count}  ${filedStatusLabel(filedEntries, slug)}`);
    }
  }
  lines.push("");
  lines.push(`Error rate: ${errorCount}/${entries.length} (${((errorCount / entries.length) * 100).toFixed(1)}%)`);

  process.stdout.write(lines.join("\n") + "\n");
  process.exit(0);
}

main();

module.exports = { isoWeekKey, filedStatusLabel };
