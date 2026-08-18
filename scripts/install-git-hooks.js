/**
 * install-git-hooks — write the native git hooks this repo relies on.
 *
 *   npm run hooks:install
 *
 * `.git/hooks/` is not versioned, so it does not survive a clone. This script is
 * the versioned source of truth; run it once per clone.
 *
 * ## Why a native hook and not the Claude Code PreToolUse hook
 *
 * The PreToolUse hook only fires when Claude runs git. A commit from the VS Code
 * UI, from a plain terminal, or from any other tool went completely ungated
 * (found 2026-08-18). A native hook fires for all of them.
 *
 * ## Why pre-push and not pre-commit
 *
 * Commits are cheap and frequent; a 40 s check on each one would be abandoned
 * within a day. The push is the boundary that matters — it is what leaves the
 * machine and reaches GitHub.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');

function gitDir() {
  try {
    const out = execFileSync('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf-8' }).trim();
    return path.isAbsolute(out) ? out : path.join(root, out);
  } catch {
    return null;
  }
}

const PRE_PUSH = `#!/bin/sh
# RDO protocol regression check — installed by "npm run hooks:install".
# Source of truth: scripts/install-git-hooks.js. Do not edit here; edit there.
#
# Replays the last live recording offline and compares it to its baseline, byte
# for byte. Catches a protocol regression in the WebClient before it reaches
# GitHub. No server, no credentials, deterministic.
#
# Bypass, deliberately, for a work-in-progress push:  git push --no-verify

set -e

RECORDING="report/campaign/rec/planitia-2026-08-17.ndjson"
BASELINE="report/campaign/rec/planitia-2026-08-17-baseline.json"

if [ ! -f "$RECORDING" ] || [ ! -f "$BASELINE" ]; then
  echo "[pre-push] recording or baseline missing — cannot check the protocol." >&2
  echo "[pre-push]   $RECORDING" >&2
  echo "[pre-push]   $BASELINE" >&2
  exit 1
fi

echo "[pre-push] RDO protocol regression check (offline replay)..."

if npm run --silent conformance -- \\
     --suite all \\
     --transport replay \\
     --recording "$RECORDING" \\
     --diff-baseline "$BASELINE"; then
  echo "[pre-push] protocol OK — push allowed."
  exit 0
fi

cat >&2 <<'EOF'

[pre-push] PUSH REFUSED — the protocol replay is not clean.

  A FAIL means the WebClient no longer produces what it used to on the wire.
  A baseline drift (~ lines) means the bytes changed.

  If the change is INTENDED, accept it explicitly by re-recording the baseline:

    npm run conformance -- --suite all --transport replay \\
      --recording report/campaign/rec/planitia-2026-08-17.ndjson \\
      --record-baseline report/campaign/rec/planitia-2026-08-17-baseline.json

  then re-read the diff and push again. Re-recording without reading the diff
  defeats the whole point.

  To push anyway (work in progress):  git push --no-verify
EOF
exit 1
`;

const dir = gitDir();
if (!dir) {
  console.error('[hooks:install] not a git repository — nothing to do.');
  process.exit(1);
}

const hooksDir = path.join(dir, 'hooks');
fs.mkdirSync(hooksDir, { recursive: true });

const target = path.join(hooksDir, 'pre-push');
fs.writeFileSync(target, PRE_PUSH, { encoding: 'utf-8' });
try {
  fs.chmodSync(target, 0o755); // no-op on Windows, required elsewhere
} catch { /* ignore */ }

console.log(`[hooks:install] pre-push written to ${path.relative(root, target).split(path.sep).join('/')}`);
console.log('[hooks:install] it replays the last recording against its baseline before every push.');
console.log('[hooks:install] bypass for a WIP push: git push --no-verify');
