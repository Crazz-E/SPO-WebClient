#!/usr/bin/env bash
# PreToolUse(Bash) — the LLM fallback layer. Fires on every Bash call; for the vast majority
# (already allowlisted, already deny-listed, or already caught by one of the nine scripted
# guards) it costs one Node startup and exits 0 in milliseconds. For the residual — a command
# that matches no allow pattern and no deny pattern, exactly the shape that today stops and
# asks a human — it makes ONE tool-less, budget-capped `claude -p` call and turns the answer
# into a deny with an exact corrected form, in this repo's own house style.
#
# THE INCIDENT THIS CLOSES. doc/haiku-permission-analysis.md: a human collected 43 stopped
# tool calls across Haiku-4.5-driven /next-task sessions on 2026-08-27, by hand, and measured
# the one fact this hook exists to act on: a refusal that renders the corrected command is
# followed correctly on the FIRST try; a refusal that doesn't is replayed identically (R9). Nine
# guards already do this for the shapes someone had already seen and written down. This one
# does it for a shape nobody has written down yet — the alternative is either a human being
# asked (this repo's answer: never), or the command silently running unexamined.
#
# THE CONSTRAINT, ON RECORD. This hook can only ever emit exit 0 (no objection — the harness's
# own allow/deny/ask machinery still decides) or exit 2 (deny, reason on stderr). It NEVER
# prints a `permissionDecision` JSON block and NEVER grants a capability this repo has not
# already sanctioned in `.claude/settings.json` — even though the current hooks reference
# documents `permissionDecision:"allow"` as a real, standing mechanism, using it here would let
# an unattended LLM call silently widen its own session's permissions, which is a bigger trust
# delegation than anything this repo's hooks do today and was not asked for: the maintainer's
# own description of this layer's job is "explain what was wrong, guide to the right syntax" —
# never "grant it anyway". A durable new capability is still only ever added by a
# human-reviewed PR to `.claude/settings.json`; the self-learning loop this hook feeds
# (scripts/hook-llm-harvest.js) proposes exactly that PR as a normal kanban card, it never
# grants it live. `src/__tests__/uncovered-command-guard.test.ts` pins this mechanically: no
# `permissionDecision` string anywhere in this file or its `.js`, and every case in the suite
# exits 0 or 2 with empty stdout.
#
# THE BIAS. Coverage is decided by uncovered-command-guard.js's own header: a false COVERED
# costs a human a prompt and can only happen if the local pattern read under-approximates the
# exact files the harness itself reads — structurally excluded, not just unlikely; a false
# UNCOVERED costs one Haiku call and, almost always, a deny whose corrected form IS the already
# -sanctioned equivalent. Conservative toward the LLM, never toward the human.
#
# TRIAGE STAYS WHERE IT IS. This hook never decides that a card is stuck. An unrecoverable gap
# gets an honest `capability-gap` deny plus a journal line; `next-task.md § 4`'s existing
# three-attempts-then-Needs-triage rule is the only thing that ever moves a card, unchanged.
#
# THREE INDEPENDENT RECURSION GUARDS on the nested `claude -p` call, any ONE of which alone
# would prevent this hook from ever calling itself: (1) SPO_HOOK_LLM_ACTIVE, set before the
# call and checked on entry, below; (2) --tools "" on the nested call — it can invoke no tool,
# so it can never reach a Bash PreToolUse event at all; (3) --setting-sources "" — the nested
# call loads no hooks block from any settings file (verified 2026-08-28: ~/.claude/settings.json
# on this machine carries zero `hooks` entries, and the nested call does not read this repo's
# `.claude/settings.json` at all under `--setting-sources ""`).
#
# SPIKE FINDINGS (2026-08-28, this machine, this build) that fixed the exact flags below:
#   - auth inherits from the parent session's OAuth/keychain with no extra flag — confirmed by
#     a clean run; `--bare` is BANNED here specifically because its own --help text says bare
#     mode reads only ANTHROPIC_API_KEY/apiKeyHelper and never OAuth/keychain, and this
#     repo/machine has no ANTHROPIC_API_KEY (.github/workflows/claude-review.yml's own header:
#     deliberately no API key, Max-subscription OAuth token instead).
#   - `--setting-sources ""` is accepted (no error).
#   - a custom `--system-prompt-file` (this repo's own hook-llm-rules.md, versioned) instead of
#     the default agentic system prompt is real savings on a MINIMAL prompt (measured: $0.0196
#     -> $0.0039, 9.2s -> 4.5s on a 2-field toy schema) — always pass it regardless.
#   - the structured verdict lands at the JSON envelope's top-level `.structured_output` field,
#     already parsed — `.result` is the same content re-serialised as a string; prefer the
#     former, fall back to the latter (uncovered-command-guard.js `runParse`).
#   - REAL latency, dogfooded on this hook's own first live trigger (the full rules file, the
#     7-field schema below, an actual uncovered command): 40-60s and ~$0.03-0.035, an order of
#     magnitude past the toy-schema spike — `--effort low` did NOT reduce it (thinking tokens
#     went UP, 3191 vs 281-658 on the toy schema; not used here). The internal timeout below is
#     set from this real number, not the toy one — a hook that reliably calls this shape
#     "cheap" is describing the mechanism, not this specific prompt's cost. Both are still
#     trivial next to a human being asked, and the throttle below is what bounds the total.
#
# Exit 0 = allow (no objection from this layer), exit 2 = block, reason on stderr.
# No heartbeat stamp here — bench-port-guard.sh already stamps every Bash call.

set -uo pipefail

HOOKS_DIR="$(cd "$(dirname "$0")" && pwd)"
BENCH_DIR="${SPO_BENCH_DIR:-$HOME/.spo-bench}"
JOURNAL_DIR="$BENCH_DIR/hook-llm"
JOURNAL="$JOURNAL_DIR/journal.jsonl"

# Guard 1 of 3 against recursion — see header. Checked before Node even starts.
if [ -n "${SPO_HOOK_LLM_ACTIVE:-}" ]; then
  exit 0
fi

payload="$(cat)"

# A deliberate, human-typed override — same shape and doctrine as SPO_ITEM_LIST_OVERRIDE
# (item-list-guard.sh) and SPO_BENCH_PORT_OVERRIDE (bench-port-guard.sh): a session must not
# type it itself.
case "$payload" in
  *SPO_HOOK_LLM_OVERRIDE=*) exit 0 ;;
esac

top="$(git rev-parse --show-toplevel 2>/dev/null)" || top=""
[ -n "$top" ] || exit 0
top="$(readlink -f "$top" 2>/dev/null)" || exit 0

trigger="$(printf '%s' "$payload" | SPO_TOP="$top" node "$HOOKS_DIR/uncovered-command-guard.js" trigger 2>/dev/null)" || exit 0

case "$trigger" in
  SKIP|COVERED) exit 0 ;;
esac

case "$trigger" in
  UNCOVERED*) ;;
  *) exit 0 ;; # unrecognised trigger output — fail open on THIS layer, never invent a new block
esac

case_json="${trigger#UNCOVERED$'\t'}"

mkdir -p "$JOURNAL_DIR" 2>/dev/null || true

session_key="$(printf '%s' "$top" | sha1sum | cut -c1-16)"
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" || branch=""

# Guard 3 of 3 in spirit (not recursion, but the same "never let this layer runs away" family):
# a session must not be able to turn the fallback into an unbounded spend loop.
MAX_PER_HOUR="${SPO_HOOK_LLM_MAX_PER_HOUR:-30}"
seen="$(node "$HOOKS_DIR/uncovered-command-guard.js" throttle "$JOURNAL" "$session_key" 3600 2>/dev/null)" || seen=0
case "$seen" in ''|*[!0-9]*) seen=0 ;; esac

journal_line() {
  # $1=verdict $2=classification $3=reason $4=corrected $5=worth_hardening $6=rule_slug
  # $7=harden_target $8=model $9=latency_ms
  node -e '
    const [verdict, classification, reason, corrected, worth, slug, target, model, latency,
           sessionKey, branch, agent, command] = process.argv.slice(1);
    process.stdout.write(JSON.stringify({
      ts: new Date().toISOString(), session_key: sessionKey, branch, agent,
      command: command.slice(0, 500), verdict, classification, reason, corrected_command: corrected,
      worth_hardening: worth === "true", rule_slug: slug, harden_target: target, model,
      latency_ms: Number(latency) || null,
    }) + "\n");
  ' "$1" "$2" "$3" "$4" "$5" "$6" "$7" "$8" "$9" "$session_key" "$branch" "$agent" "$command" \
    >> "$JOURNAL" 2>/dev/null || true
}

agent="$(printf '%s' "$case_json" | node -e "let r='';process.stdin.on('data',c=>r+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(r).agent||'driver')}catch{process.stdout.write('driver')}})" 2>/dev/null)" || agent="driver"
command="$(printf '%s' "$case_json" | node -e "let r='';process.stdin.on('data',c=>r+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(r).command||'')}catch{process.stdout.write('')}})" 2>/dev/null)" || command=""

GENERIC_MSG='BLOCKED: this command matches no allowlisted pattern, and the hook'"'"'s advisory
layer could not produce a verdict. Compose the goal from the sanctioned forms instead — the
npm aliases in CLAUDE.md § Commands, and next-task'"'"'s own scripted steps. Logged for the
maintainer'"'"'s hardening loop; no action needed from you beyond retrying with a known form.'

if [ "$seen" -ge "$MAX_PER_HOUR" ]; then
  journal_line "throttled" "" "" "" "false" "" "none" "" ""
  echo "$GENERIC_MSG" >&2
  exit 2
fi

MODEL="${SPO_HOOK_LLM_MODEL:-claude-haiku-4-5-20251001}"
INNER_TIMEOUT="${SPO_HOOK_LLM_TIMEOUT:-75}"
BUDGET_USD="${SPO_HOOK_LLM_BUDGET_USD:-0.10}"
RULES_FILE="$HOOKS_DIR/hook-llm-rules.md"

SCHEMA='{"type":"object","properties":{"classification":{"type":"string","enum":["needs-form","capability-gap","out-of-scope"]},"reason":{"type":"string","maxLength":160},"explanation":{"type":"string","maxLength":220},"corrected_command":{"type":"string","maxLength":200},"worth_hardening":{"type":"boolean"},"rule_slug":{"type":"string","maxLength":60},"harden_target":{"type":"string","enum":["allowlist","guard","docs","none"]}},"required":["classification","reason","explanation","corrected_command","worth_hardening","rule_slug","harden_target"]}'

prompt_text="$(printf '%s' "$case_json" | node "$HOOKS_DIR/uncovered-command-guard.js" prompt 2>/dev/null)" || prompt_text=""

tmp_out="$(mktemp "${TMPDIR:-/tmp}/hook-llm-XXXXXX.json")"
trap 'rm -f "$tmp_out"' EXIT

start_ms="$(date +%s%3N)"
( cd /tmp && SPO_HOOK_LLM_ACTIVE=1 timeout "$INNER_TIMEOUT" claude -p \
    --model "$MODEL" \
    --tools "" \
    --setting-sources "" \
    --strict-mcp-config \
    --no-session-persistence \
    --system-prompt-file "$RULES_FILE" \
    --max-budget-usd "$BUDGET_USD" \
    --output-format json \
    --json-schema "$SCHEMA" \
    "$prompt_text" > "$tmp_out" 2>/dev/null )
claude_exit=$?
end_ms="$(date +%s%3N)"
latency_ms=$((end_ms - start_ms))

if [ "$claude_exit" -ne 0 ]; then
  journal_line "error" "" "claude exited $claude_exit" "" "false" "" "none" "$MODEL" "$latency_ms"
  echo "$GENERIC_MSG" >&2
  exit 2
fi

parsed="$(node "$HOOKS_DIR/uncovered-command-guard.js" parse < "$tmp_out" 2>/dev/null)" || parsed="ERROR"

if [ "$parsed" = "ERROR" ] || [ -z "$parsed" ]; then
  journal_line "error" "" "unparseable classifier output" "" "false" "" "none" "$MODEL" "$latency_ms"
  echo "$GENERIC_MSG" >&2
  exit 2
fi

IFS=$'\t' read -r classification reason explanation corrected worth_hardening rule_slug harden_target <<< "$parsed"

case "$classification" in
  needs-form)
    journal_line "guide" "$classification" "$reason" "$corrected" "$worth_hardening" "$rule_slug" "$harden_target" "$MODEL" "$latency_ms"
    {
      echo "BLOCKED: $reason"
      echo
      [ -n "$explanation" ] && { echo "$explanation"; echo; }
      echo "Run this instead:"
      echo
      echo "  $corrected"
      echo
      echo "(Advisory verdict by the hook's LLM layer, $MODEL. This shape has been logged as a"
      echo "candidate for the scripted layer — no action needed from you.)"
    } >&2
    exit 2
    ;;
  capability-gap)
    journal_line "gap" "$classification" "$reason" "" "$worth_hardening" "$rule_slug" "$harden_target" "$MODEL" "$latency_ms"
    {
      echo "BLOCKED: $reason. No allowlisted form reaches this goal today."
      echo
      [ -n "$explanation" ] && { echo "$explanation"; echo; }
      echo "Do not retry the same command, and do not invent a workaround. This gap has been"
      echo "logged as a hardening candidate. If the card cannot advance without it, the normal"
      echo "process applies: three attempts, then Needs triage (next-task.md § 4)."
    } >&2
    exit 2
    ;;
  out-of-scope)
    journal_line "out-of-scope" "$classification" "$reason" "" "$worth_hardening" "$rule_slug" "$harden_target" "$MODEL" "$latency_ms"
    {
      echo "BLOCKED: $reason"
      echo
      [ -n "$explanation" ] && echo "$explanation"
      echo
      echo "(Advisory verdict by the hook's LLM layer, $MODEL. Logged for the maintainer's"
      echo "hardening loop.)"
    } >&2
    exit 2
    ;;
  *)
    journal_line "error" "$classification" "unrecognised classification" "" "false" "" "none" "$MODEL" "$latency_ms"
    echo "$GENERIC_MSG" >&2
    exit 2
    ;;
esac
