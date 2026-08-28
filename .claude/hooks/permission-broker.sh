#!/usr/bin/env bash
# PreToolUse(*) — the permission broker. doc/permission-policy.md is the logic; this is the
# half that acts on it.
#
# WHY THIS FILE EXISTS. The nine guards next to it each answer ONE question and stay silent on
# everything else; what they stay silent on is what stops a session and waits for a human.
# doc/haiku-permission-analysis.md counted 43 such stops in one day. This hook answers all of
# them: from the catalogue when the shape is known, from the arbiter agent when it is not, and
# it turns the arbiter's answer into a catalogue entry so the shape is known next time.
#
# It cannot widen anything. Claude Code evaluates `permissions.deny` AFTER a hook decision and a
# hook `allow` never overrides it; the other guards run in parallel and `deny` beats `allow`, so
# any refusal of theirs stands whatever is decided here. The worst this file can do is cost a
# model call, or leave an interruption in place.
#
# Three programs, one each for a reason:
#   permission-broker.js        classify + look up. No model, no network, no writes.
#   permission-broker-emit.js   the single exit: hook response, refusal text, audit line.
#   this file                   the plumbing between them, and the arbiter call.
#
# The fast path — every call the catalogue already answers, which is meant to be all of them
# eventually — is exactly two node processes and no network.

set -uo pipefail

# Kill switch, for a human debugging the broker itself.
[ "${SPO_PERM_BROKER:-on}" = "off" ] && exit 0
# The arbiter runs with no tools, so no PreToolUse can fire inside it. This is the belt to that
# pair of braces, and it costs one comparison.
[ "${SPO_PERM_ARBITER:-0}" = "1" ] && exit 0

payload="$(cat)"

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE="$HOOK_DIR/permission-broker.js"
EMIT="$HOOK_DIR/permission-broker-emit.js"
[ -f "$CORE" ] && [ -f "$EMIT" ] || exit 0

top="$(git rev-parse --show-toplevel 2>/dev/null || true)"
PERM_DIR="${SPO_PERM_DIR:-$HOME/.spo-perm}"
RULES="${SPO_PERM_RULES:-$HOOK_DIR/../permissions/rules.json}"
SETTINGS="${SPO_PERM_SETTINGS:-$HOOK_DIR/../settings.json:$HOOK_DIR/../settings.local.json:$HOME/.claude/settings.json}"

export SPO_TOP="$top" SPO_PERM_DIR="$PERM_DIR" SPO_PERM_RULES="$RULES" SPO_PERM_SETTINGS="$SETTINGS"

verdict="$(printf '%s' "$payload" | node "$CORE" 2>/dev/null)"
# A core that crashed or printed nothing means no opinion — today's behaviour, never a widening.
[ -z "$verdict" ] && exit 0

read -r outcome domain tool signature <<<"$(printf '%s' "$verdict" | node -e '
  let raw = "";
  process.stdin.on("data", c => (raw += c));
  process.stdin.on("end", () => {
    let v = {};
    try { v = JSON.parse(raw) || {}; } catch {}
    process.stdout.write([v.outcome || "silent", v.domain || "-", v.tool || "-", v.signature || "-"].join(" "));
  });' 2>/dev/null)"

case "${outcome:-silent}" in
  silent) exit 0 ;;
  allow|ask|deny)
    # Decided without a model. The emitter writes the audit line and owns the exit code.
    printf '%s' "$verdict" | node "$EMIT"
    exit $?
    ;;
esac

[ "$outcome" = "arbitrate" ] || exit 0

# ---------------------------------------------------------------------------
# The arbiter — one headless call, no tools, the policy as its system prompt
# ---------------------------------------------------------------------------

ARBITER_MD="$HOOK_DIR/../agents/permission-arbiter.md"
POLICY="$HOOK_DIR/../../doc/permission-policy.md"

# policy §6: when the arbiter cannot answer, the answer is still deterministic. A read-only call
# runs; anything else is escalated to the human. That is exactly today's behaviour for the
# second case and strictly better for the first — never a widening.
fallback() {
  local dec reason
  if [ "$domain" = "read-only" ]; then
    dec="allow"; reason="arbiter unavailable — read-only call, allowed by policy §6"
  else
    dec="ask"; reason="arbiter unavailable — policy §6 escalates anything that is not read-only"
  fi
  DEC="$dec" REASON="$reason" SIG="$signature" DOMAIN="$domain" node -e '
    process.stdout.write(JSON.stringify({
      decision: process.env.DEC, reason: process.env.REASON,
      signature: process.env.SIG, domain: process.env.DOMAIN, source: "fallback",
    }));' 2>/dev/null | node "$EMIT"
  exit $?
}

command -v claude >/dev/null 2>&1 || fallback
[ -f "$ARBITER_MD" ] && [ -f "$POLICY" ] || fallback

# The agent file ALONE is the system prompt — it is the policy's operative form, and it must
# stay self-contained for that reason (src/__tests__/permission-broker.test.ts asserts it names
# every domain and every outcome). Concatenating doc/permission-policy.md, which is written for
# a human reader, tripled the prompt to 17 KB and the verdict went from 7 s to 25-34 s: the cost
# is cache creation on a fresh session every call, not deliberation. The policy file is still
# required to exist above, because a missing one means this checkout is broken, not that the
# arbiter should improvise.
sysprompt="$(cat "$ARBITER_MD" 2>/dev/null)"
[ -n "$sysprompt" ] || fallback

# Only the fields the decision needs. The transcript path is deliberately NOT passed: the
# arbiter judges a call, not a conversation, and must not be talked into a verdict by one.
case_json="$(CASE_PAYLOAD="$payload" CASE_DOMAIN="$domain" CASE_SIG="$signature" node -e '
  let p = {};
  try { p = JSON.parse(process.env.CASE_PAYLOAD) || {}; } catch {}
  process.stdout.write(JSON.stringify({
    tool_name: p.tool_name, tool_input: p.tool_input, cwd: p.cwd,
    agent_type: p.agent_type, is_subagent: Boolean(p.agent_id),
    permission_mode: p.permission_mode,
    domain: process.env.CASE_DOMAIN, signature: process.env.CASE_SIG,
    worktree_root: process.env.SPO_TOP,
  }, null, 1));' 2>/dev/null)"
[ -n "$case_json" ] || fallback

# MAX_THINKING_TOKENS=0 is the single most important flag on this line, and it was measured, not
# assumed. Without it the arbiter spent 5691 thinking tokens on one permission decision: 69 s of
# API time and $0.033 a call, with `--effort low` making no difference at all. With it: 5.9 s,
# $0.0048, 0 thinking tokens, and the same verdict. A permission decision applies a table — it
# does not need to deliberate, and a session is blocked while it does.
#
# The hook's own timeout in settings.json must stay ABOVE the one here: if Claude Code times the
# hook out first, the verdict is discarded and the call falls back to prompting the human,
# losing a refusal that had already been decided. This number is the shorter of the two.
raw="$(SPO_PERM_ARBITER=1 MAX_THINKING_TOKENS=0 timeout "${SPO_PERM_ARBITER_TIMEOUT:-20}" \
  claude -p --model "${SPO_PERM_ARBITER_MODEL:-haiku}" --setting-sources user --tools "" \
    --permission-mode dontAsk --output-format json --system-prompt "$sysprompt" \
    "Decide this tool call. Reply with the verdict JSON object and nothing else.

$case_json" 2>/dev/null)"
[ -n "$raw" ] || fallback

# Parse, record, and hand the emitter a verdict in the same shape the catalogue produces — so
# an arbitrated decision is indistinguishable, to the caller, from a catalogued one.
merged="$(ARB_RAW="$raw" SIG="$signature" DOMAIN="$domain" TOOL="$tool" node -e '
  const fs = require("fs"), path = require("path");
  let outer;
  try { outer = JSON.parse(process.env.ARB_RAW); } catch { process.exit(1); }
  let text = typeof outer.result === "string" ? outer.result : "";
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1];
  const open = text.indexOf("{"), close = text.lastIndexOf("}");
  if (open === -1 || close <= open) process.exit(1);
  let v;
  try { v = JSON.parse(text.slice(open, close + 1)); } catch { process.exit(1); }
  if (!["allow", "deny", "ask"].includes(v.decision)) process.exit(1);

  const sig = process.env.SIG, domain = process.env.DOMAIN;
  const record = {
    decision: v.decision,
    reason: String(v.reason || "").slice(0, 4000),
    corrected_form: String(v.corrected_form || "").slice(0, 1000),
    guidance: String(v.guidance || "").slice(0, 1000),
    class: String(v.class || ""), confidence: String(v.confidence || ""),
    rule_signature: String((v.rule && v.rule.signature) || ""),
    rule_note: String((v.rule && v.rule.note) || ""),
    signature: sig, domain, tool: process.env.TOOL || "",
    decided_at: new Date().toISOString(), source: "arbiter",
  };

  // policy §3: an allow that reaches outside the worktree is honoured for THIS capture and
  // never cached — the argument that made it safe is exactly what changes between two captures.
  const cacheableDomain = record.decision !== "allow" || domain !== "external-effect";

  // The arbiter is asked which SHAPE its verdict belongs to, and a disagreement with the key
  // the broker would file it under is the useful part of the answer, not an error. Measured on
  // the very first end-to-end run: the broker keyed `curl -s … | bash` as `…:curl`, while the
  // arbiter said the shape that decides this way is `…:pipe-curl-to-bash`. Caching the refusal
  // under the coarse key would have refused `curl -o file` too. So when the two disagree, the
  // verdict stands for THIS capture only and the proposal goes to the queue, where a human
  // either refines statementShape() or writes the narrower rule by hand.
  const proposed = String(record.rule_signature || "").trim();
  record.shape_agrees = proposed === "" || proposed === sig;
  record.promotable = cacheableDomain && record.shape_agrees;

  const dir = process.env.SPO_PERM_DIR;
  try {
    fs.mkdirSync(path.join(dir, "provisional"), { recursive: true });
    if (record.promotable) {
      fs.writeFileSync(
        path.join(dir, "provisional", sig.replace(/[^A-Za-z0-9._+:-]/g, "_") + ".json"),
        JSON.stringify(record, null, 2)
      );
    }
    fs.appendFileSync(path.join(dir, "promotions.jsonl"), JSON.stringify(record) + "\n");
  } catch { /* the decision matters more than its bookkeeping */ }

  process.stdout.write(JSON.stringify(record));
' 2>/dev/null)"
[ -n "$merged" ] || fallback

printf '%s' "$merged" | node "$EMIT"
exit $?
