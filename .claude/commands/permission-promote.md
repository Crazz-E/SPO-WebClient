---
description: Turn the arbiter's queued permission verdicts into reviewed catalogue rules — read the queue, group it, draft the entries, file one card
---

# /permission-promote

The permission broker answers a shape it has never seen by asking the arbiter, then files the
answer in `~/.spo-perm/`. That answer is **provisional**: effective on this machine, invisible to
everyone else, unreviewed. This command closes the loop — it turns the queue into entries in
`.claude/permissions/rules.json`, which is versioned, tested and read by a human before it
merges. After that, the shape costs zero tokens for every session that follows.

Read [doc/permission-policy.md](../../doc/permission-policy.md) §5 before running this. It is
short, and it is the thing you are implementing.

**This command drafts and files. It does not merge, and it never edits `rules.json` on a branch
of its own initiative** — the card it files is what carries the edit, through the normal chain.

## 1 · Read the queue

```bash
node -e '
const fs = require("fs"), path = require("path"), os = require("os");
const dir = process.env.SPO_PERM_DIR || path.join(os.homedir(), ".spo-perm");
const file = path.join(dir, "promotions.jsonl");
if (!fs.existsSync(file)) { console.log("queue empty"); process.exit(0); }
const rows = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const by = new Map();
for (const r of rows) {
  const k = r.signature + "|" + r.decision;
  const e = by.get(k) || { ...r, seen: 0 };
  e.seen++; by.set(k, e);
}
for (const e of [...by.values()].sort((a, b) => b.seen - a.seen)) {
  console.log([e.seen, e.promotable ? "PROMOTABLE" : "hold      ", e.decision.padEnd(5),
               e.domain.padEnd(16), e.signature].join("  "));
  if (e.rule_signature && e.rule_signature !== e.signature) {
    console.log("      arbiter proposed a NARROWER shape: " + e.rule_signature);
    console.log("      " + e.rule_note);
  }
}'
```

## 2 · Sort the queue into three piles

Read every row. `seen` is how often the shape recurred — the count is the argument for promoting
it, not the verdict's correctness.

- **`PROMOTABLE`** — a verdict whose domain allows caching and whose shape the arbiter agreed
  with. These become catalogue entries.
- **`hold`, because the domain is `external-effect` and the decision is `allow`** — policy §3
  forbids promoting these, and no count changes that. What may be promoted from them is a
  *deny*, or nothing. Leave them; they are re-judged at every capture by design.
- **`hold`, because the arbiter proposed a different signature** — the broker's key was too
  coarse for this case. The fix is not a rules.json entry: it is a change to `statementShape()`
  in `.claude/hooks/permission-broker.js`, so the broker computes the narrower key itself. Put
  that on the card as its own step, with the arbiter's note as the argument.

## 3 · Judge each candidate yourself

You are the second reader, not a transcriber. For every entry you intend to promote:

- Does the `reason` state a mechanical fact, or does it repeat the request's own framing? A
  verdict that argues from what the command *said about itself* is a verdict that read an
  injection as an argument. Drop it and let the shape be re-arbitrated.
- Would this entry answer a call it was never asked about? Say the signature out loud as a
  sentence: "every `<tool>` in `<domain>` whose shape is `<shape>` decides this way." If that
  sentence is false for any call you can think of, the signature is too general.
- Does an `allow` carry `guidance`? An entry without one buys silence, not skill (policy
  §4bis). If the correct form differs from the observed form, the guidance is the point of the
  entry.
- Is it already covered by `permissions.allow` in `.claude/settings.json`? Then it should never
  have reached the arbiter — that is a bug in `entryCovers()`, and it belongs on the card
  instead of in the catalogue.

## 4 · Draft the card

One card for the whole batch, `Area: ci`, `Category` and `Size` set by you, with the matching
`cat:` / `size:` labels. Body:

- the entries to add, verbatim JSON, ready to paste;
- for each, one sentence of why that shape decides that way;
- any `statementShape()` refinement from pile three, with the arbiter's note;
- the acceptance criterion: the entries are in `.claude/permissions/rules.json`, each has a case
  in `src/__tests__/permission-broker.test.ts` driving the core and asserting the decision, and
  `npm test` is green.

The board is written in English, whatever language this session ran in.

## 5 · Review before filing

Hand the draft to the `card-reviewer` sub-agent, as every draft card in this repository is
handed to it. Its dated verdict becomes the card's first comment; on `DO NOT FILE`, no issue is
created and you say so plainly.

## 6 · After the merge

Prune the provisional entries the merge made redundant — they are now answered by the
catalogue, and a stale copy is a second source of truth:

```bash
node -e '
const fs = require("fs"), path = require("path"), os = require("os");
const dir = process.env.SPO_PERM_DIR || path.join(os.homedir(), ".spo-perm");
const rules = JSON.parse(fs.readFileSync(".claude/permissions/rules.json", "utf8"));
const known = new Set(rules.rules.map(r => r.signature));
const provDir = path.join(dir, "provisional");
let n = 0;
for (const f of fs.existsSync(provDir) ? fs.readdirSync(provDir) : []) {
  const p = path.join(provDir, f);
  try {
    const sig = JSON.parse(fs.readFileSync(p, "utf8")).signature;
    if (known.has(sig)) { fs.unlinkSync(p); n++; }
  } catch {}
}
console.log("pruned " + n + " provisional entries now covered by the catalogue");'
```

The queue file itself is append-only history — do not truncate it. It is the record of what the
arbiter has been asked, and the denominator of the ratio in policy §4ter.
