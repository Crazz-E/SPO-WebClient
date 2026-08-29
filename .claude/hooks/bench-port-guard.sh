#!/usr/bin/env bash
# PreToolUse(Bash) — keeps the live bench single-owner.
#
# doc/bench-worker.md. Port 8080, the LOCKED accounts and the Helartia world state belong
# to ONE process: the bench worker. Several sessions and worktrees run on this machine at
# once, and the worker SIGKILLs whatever it finds listening on the bench port before a job
# (`clearPort`, src/e2e/bench/gateway.ts) — its comment says "never a live session's
# server, because sessions no longer start one". That was prose in CLAUDE.md, advisory to
# a model. It has been broken: a session trying to verify its own change starts a gateway,
# the default port is 8080 (src/shared/config.ts:23), and then either
#
#   - the bind fails, because the worker already holds the port, or
#   - the worker kills the session's gateway mid-debug, or
#   - the session's gateway survives long enough to be a listener the worker cannot
#     attribute, and EVERY session's gate is blocked until a human frees the port.
#
# So the rule is mechanical here, not advisory. Two families are refused:
#
#   1. starting a gateway on the bench port — `npm start`, `npm run dev:local`,
#      `node dist/server/server.js`, with PORT unset or set to 8080;
#   2. driving the live world outside the worker — `npm run test:live:local`,
#      `node dist/e2e/run.js`: they use the LOCKED accounts and mutate Helartia with no
#      world lock, so a concurrent worker job and they can collide in the same town.
#
# Both have a sanctioned form, and the message names it. Exit 0 = allow, exit 2 = block
# with the reason fed back to the model.

set -uo pipefail

payload="$(cat)"

BENCH_PORT="${SPO_BENCH_PORT:-8080}"

# A deliberate, human-typed override. Documented in doc/bench-worker.md; a session must
# not reach for it — if the bench is in the way, the answer is `npm run dev`, which asks
# the worker for the port instead of taking it.
case "$payload" in
  *SPO_BENCH_PORT_OVERRIDE=i-own-the-bench*) exit 0 ;;
esac

# The port a gateway binds when nobody says otherwise (src/shared/config.ts:23). It is the
# bench port today, which is the whole problem; they are two different facts and the guard
# keeps them apart, so moving the bench does not turn every `npm start` into a refusal.
DEFAULT_PORT="${SPO_DEFAULT_PORT:-8080}"

verdict="$(printf '%s' "$payload" | BENCH_PORT="$BENCH_PORT" DEFAULT_PORT="$DEFAULT_PORT" node -e "
  let raw = '';
  process.stdin.on('data', c => (raw += c));
  process.stdin.on('end', () => {
    let command = '';
    try { command = JSON.parse(raw)?.tool_input?.command ?? ''; } catch { command = ''; }

    // A heredoc body is text, not commands — a doc that quotes \`npm start\` is not a run.
    const lines = command.split('\n');
    const kept = [];
    let terminator = null;
    for (const line of lines) {
      if (terminator !== null) {
        if (line.trim() === terminator) terminator = null;
        continue;
      }
      kept.push(line);
      const heredoc = line.match(/<<-?\s*[\"']?([A-Za-z_][A-Za-z0-9_]*)[\"']?/);
      if (heredoc) terminator = heredoc[1];
    }
    const text = kept.join('\n');
    const segments = text.split(/\n|;|&&|\|\||\||\(/);

    // A command that only READS a line of script — grep, cat, sed -n — mentions the verb
    // without invoking it. Only an invocation at the head of a segment counts.
    const strip = s => s.replace(/^\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]*\s+)*/, '');

    // \`npm start\` and the server entry take PORT as they find it — unset means 8080.
    // \`npm run dev:local\` picks its own free port off the bench (scripts/dev-local.sh),
    // so it is only a problem when a PORT=8080 is typed in front of it.
    const startsGateway = s => {
      const c = strip(s);
      return /^npm\s+(?:run\s+)?start(\s|$)/.test(c)
        || /^(?:npx\s+)?node\s+(?:--[^\s]+\s+)*dist\/server\/server\.js(\s|$)/.test(c);
    };
    const startsLocalGateway = s => /^npm\s+run\s+dev:local(\s|$)/.test(strip(s));
    const drivesLiveWorld = s => {
      const c = strip(s);
      return /^npm\s+run\s+test:live:local(\s|$)/.test(c)
        || /^(?:npx\s+)?node\s+(?:--[^\s]+\s+)*dist\/e2e\/run\.js(\s|$)/.test(c);
    };

    // The port the gateway would actually bind: the last PORT= assignment anywhere in the
    // command (\`export PORT=8081; npm start\` and \`PORT=8081 npm start\` both count), else
    // the default from src/shared/config.ts.
    const bench = Number(process.env.BENCH_PORT);
    const fallback = Number(process.env.DEFAULT_PORT);
    const assignments = [...text.matchAll(/(?:^|[\s;&|])(?:export\s+)?PORT=(\d+)/g)];
    const explicit = assignments.length ? Number(assignments[assignments.length - 1][1]) : null;
    const port = explicit ?? fallback;

    let reason = 'ok';
    if (segments.some(drivesLiveWorld)) reason = 'live';
    else if (segments.some(startsGateway) && port === bench) reason = 'port';
    else if (explicit === bench && segments.some(startsLocalGateway)) reason = 'port';
    process.stdout.write(reason);
  });
" 2>/dev/null)"

case "${verdict:-ok}" in
  port)
    echo "BLOCKED: that would start a gateway on the bench port (${BENCH_PORT})." >&2
    echo "" >&2
    echo "The live bench has one owner: the bench worker (doc/bench-worker.md). It kills" >&2
    echo "whatever it finds on ${BENCH_PORT} before every job, so a session's gateway there is" >&2
    echo "either killed mid-run or blocks every other session's gate." >&2
    echo "" >&2
    echo "  npm run dev                  ask the worker for a gateway on ${BENCH_PORT} (a LEASE)" >&2
    echo "  PORT=8081 npm run dev:local  your own gateway, off the bench — debugging only," >&2
    echo "                               its results attest nothing" >&2
    echo "" >&2
    echo "To PROVE a change: npm run gate — only the worker attests." >&2
    exit 2
    ;;
  live)
    echo "BLOCKED: that drives the live world outside the bench worker." >&2
    echo "" >&2
    echo "test:live:local / dist/e2e/run.js use the LOCKED accounts and mutate Helartia with" >&2
    echo "no world lock — a worker job running at the same time lands in the same town." >&2
    echo "" >&2
    echo "  npm run test:live   the L2 drive as a bench job (queued, serialized, attested)" >&2
    echo "  npm run gate        the full pre-push gate" >&2
    exit 2
    ;;
  *)
    exit 0
    ;;
esac
