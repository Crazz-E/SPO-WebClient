# The Bench Worker — single owner of the live test bench

**Status:** Adopted 2026-08-22 · Companion to [E2E-POLICY.md](E2E-POLICY.md) (the rules)
**Code:** `src/e2e/bench/` · **Client scripts:** `scripts/bench-*.sh` · **Hook:** `.claude/hooks/pre-push-gate.sh`

## 1. Why

The live layer (L2 drive, L3 browser smoke) is **not parallelizable**: it shares three
unique mutable resources — the gateway port (8080), the LOCKED account `SPO_test3`, and
the Helartia world state on planitia. Two sessions testing at once produce mutually
polluted evidence: a `FIVEMODELSERVER/Survival` line can no longer be attributed to a run.
Port-shifting (`PORT=8081`) never solved this — two gateways still write into the same
world with the same account — and it leaked orphaned gateways.

**The principle: bench ownership is never transferred.** Sessions do not start gateways,
do not kill processes, do not hold locks. They deposit a request and wait for a report.
Serialization is a mechanical consequence — one worker, one job at a time — not a
discipline rule.

## 2. The pieces

```
~/.spo-bench/                       fixed, ext4, outside every worktree, never /mnt/c
├── worker.json                     pid, repo, port — who the worker is
├── heartbeat                       touched every 5 s; its mtime IS the sign of life
├── spool/job-<epochms>-<rand>.json deposits; filename order = queue order
├── running/                        the one claimed job
├── done/<jobid>.json + .log        reports, purged after 24 h
├── verdicts/<sha>.json             per-HEAD attestations — what the push hook reads
└── world/                          world-lock.json + run-history.json — finally GLOBAL
```

Every hand-off is a same-filesystem `rename(2)`: atomic, no locks needed, because exactly
one process (the worker) consumes the spool.

| Piece | File | Role |
|---|---|---|
| Worker | `src/e2e/bench/worker.ts` | the permanent loop — claims, builds, drives, reports |
| Client | `src/e2e/bench/cli.ts` | `submit` / `wait` / `status` (wrapped by `scripts/bench-*.sh`) |
| Fingerprint | `src/e2e/bench/fingerprint.ts` | moving-target detector (HEAD + diff + status + untracked content) and the clean-tree test a gate requires |
| Gateway | `src/e2e/bench/gateway.ts` | clean-port guarantee, per-job gateway start/stop |
| Attestations | `src/e2e/bench/verdict.ts` | `verdicts/<sha>.json` + `bench/gate` GitHub commit status |
| Supervision | `scripts/bench-install.sh` | systemd --user unit, `Restart=always`, linger |

## 3. A job's life

1. **Deposit** (`npm run gate` / `test:live` / `dev`): the client checks the worker is
   alive (pid + heartbeat < 20 s) — **a dead worker is exit 3, immediately, at deposit
   time**. It fingerprints the tree, writes the request, returns the job id. `--wait`
   folds into the wait loop so the whole round trip is one background shell command —
   a queued session spends **zero tokens** waiting.
2. **Claim**: the worker takes the oldest deposit. If the depositing session's pid is
   dead → report `ABANDONED`, nothing runs, the queue cleans itself.
3. **Clean bench**: kill anything on 8080 (safe — only the worker starts gateways there),
   verify the port is free.
4. **Fingerprint `atStart`**, compare with `atSubmit`. A **gate on a dirty tree is `DIRTY`**
   — nothing runs, nothing is attested: the attestation names a sha, so the tested tree
   must be exactly that commit (the client already refuses it at deposit, exit 2; the
   worker enforces it again). Then `git fetch origin main` (best-effort)
   so verify-gate routes the diff against the real `origin/main`, not a lagging local one.
5. **Build**: `npm run build` in the job's worktree — always. A stale `dist/` runs
   yesterday's code and produces a silently wrong PASS; ~16 s is the price of never
   finding out the hard way.
6. **Gateway** from that worktree, wait for `phase=ready`.
7. **Body**, with `E2E_WORLD_STATE_DIR=~/.spo-bench/world`:
   - `gate` → `node scripts/verify-gate.js` (static replay, President exclusion, routing,
     live drive) — exit 0 PASS / 2 BLOCKED / else FAIL
   - `live` → `node dist/e2e/run.js [flags]`
   - `lease` → report `LEASED` **immediately** (that is what the waiting session unblocks
     on), then hold the gateway until the lease expires or the session releases it
     (`npm run dev:release` drops a marker the hold loop watches). No pid watching: the
     waiting CLI exits the moment the report lands, and a session has no longer-lived pid
     to offer — so a session killed mid-lease simply lets the lease run to its expiry
     (30 min default, 120 max); the worker tears the gateway down then, never later
8. **Teardown**: stop the gateway, re-verify 8080 is free. **No gateway survives between
   two jobs.**
9. **Fingerprint `atEnd`**; if the three differ → verdict **`STALE`, never PASS** — the
   report says so plainly and carries all three fingerprints.
10. **Report** to `done/`, **attestation** to `verdicts/<sha>.json` (gate jobs), running
    slot released, next job.

Verdicts: `PASS` · `FAIL` · `BLOCKED` (President members — a human verifies, §7 of the
policy) · `ENVIRONMENT` (does not consume an attempt) · `STALE` · `DIRTY` (gate on
uncommitted changes — commit first) · `ABANDONED` ·
`INTERRUPTED` (worker died mid-job — check the world lock before resubmitting) · `LEASED`.

A second deposit from a worktree whose first job is still queued is **refused, naming the
queued job** (exit 2) — what a retry-after-edit wants is the newest tree tested once.

## 4. Supervision — the covered failure

systemd (`Restart=always`, `RestartSec=2`, linger enabled) revives a dead worker; the
spool survives; `running/` jobs are reported `INTERRUPTED` at startup. What systemd cannot
see — a worker wedged in a crash loop, deposits silently piling up — is caught by the
**heartbeat**: submitters check its mtime at deposit and during waits, and fail loudly
(`WORKER DOWN`, exit 3) the moment it goes stale. The failure mode "requests accumulate
and nobody notices" is structurally announced at the deposit.

```bash
scripts/bench-install.sh                       # one-time (or after worker changes): build, unit, enable, linger
systemctl --user status spo-bench-worker       # why it stopped
systemctl --user restart spo-bench-worker      # bring it back; the queue resumes
npm run bench:status                           # liveness + queue, from any worktree
```

## 5. The push chain — Claude Code Desktop → this PC → GitHub

```
session edits worktree
  → npm run gate            local precheck (typecheck/lint/tests) — fails free, queues nothing
  → bench job               worker builds THIS tree, drives it live, attests
  → git push                hook reads verdicts/<HEAD>.json: PASS + stable + this worktree + <60 min
  → GitHub PR               CI re-runs L0/L1 (ubuntu, no credentials)
  → bench/gate status       the worker publishes the attestation as a commit status once
                            the sha exists on GitHub (retried on a 30 s cycle until then)
  → merge                   ruleset: PR, CI green AND bench/gate green, up to date, no bypass;
                            GitHub deletes the remote branch
  → npm run finish          main ff'd, refs pruned, worker reinstalled if its sources changed,
                            worktree + branch removed — nothing left but main
```

Only the worker writes attestations. A session cannot unblock its own push, and a PR
cannot merge on CI alone — the live evidence must exist even if the local hook were
sidestepped.

**Dependabot PRs** ride the same chain through `npm run deps:gate`: it merges main in, installs
(`npm ci` *in the PR's worktree* — a worktree has no `node_modules` of its own and would
otherwise build against the main checkout's old packages), gates, pushes and auto-merges
them one by one; a lockfile change routes to spine + building-details.

**One-time GitHub setup (repo admin).** The chain is only deterministic if nobody can
merge around it, so the rule must bind the admin too. On `main`:

- *Require status checks to pass* → **`typecheck + tests`** (CI) **and `bench/gate`**,
  with *require branches to be up to date* — a branch updated after its gate (merge `origin/main` in — never a force push) gets a new
  sha, which needs a new attestation.
- *Require a pull request before merging* with **0 required approvals** — a single
  maintainer cannot approve their own PR, and a 1-approval rule only teaches the admin to
  use the bypass button, which also skips `bench/gate`.
- **No bypass**: *Do not allow bypassing the above settings* on a classic rule, or a ruleset
  with an empty bypass list. Either enforces against the owner; a rule the owner can skip
  attests nothing.

The worker publishes through `gh`, which must be authenticated for the user running the
unit (it is). Publishing cannot be disabled: a gate that ran but left no trace on GitHub
is exactly the silent pass this bench exists to prevent.

## 6. Rate limits (2026-08-22, developer decision)

The bench queue is now the real throttle, so the numeric quotas got out of the way for
the test phase — the servers hold this easily:

| Knob | Was | Is |
|---|---|---|
| gateway auth attempts / min / IP (`server.ts`) | 10 | 1000 |
| gateway proxy-image requests / min / IP | 60 | 1000 |
| gateway concurrent WS connections / IP | 5 | 1000 |
| live-run minimum interval (`E2E_MIN_INTERVAL_MINUTES`) | 10 min | 0 |
| live runs / day (`E2E_MAX_RUNS_PER_DAY`) | 20 | 1000 (backstop) |

The mechanisms all remain (env knobs, injectable limits) — tighten before any public
deployment.

## 7. The conscious exceptions

- `npm run dev:local` — build and run a gateway yourself, **on a port other than 8080**,
  for interactive debugging. Its behaviour attests nothing.
- `npm run gate:local` / `npm run test:live:local` — the drive without the worker.
  Evidence for reading; the push hook does not accept it.

## 8. Acceptance criteria (verified by the test suites)

- Two simultaneous deposits execute one after the other, in deposit order, each with an
  attributable report — `job.test.ts`, `worker.test.ts`.
- A session killed while queued (with `--wait`, the npm default) leaves nothing:
  `ABANDONED`, queue cleaned — no orphan gateway is possible since sessions start none.
  Killed mid-lease: the gateway lives until the lease expires, then the worker tears it
  down. `worker.test.ts`.
- A killed worker restarts (systemd) and resumes the queue; mid-flight jobs are reported
  `INTERRUPTED`. `worker.test.ts`.
- No gateway survives between jobs — teardown re-verifies the port. `gateway.test.ts`.
- A deposit against a dead worker fails immediately with exit 3. `cli.test.ts`, `paths.test.ts`.
- A moved tree yields `STALE`, never PASS; the hook refuses unstable attestations.
  `worker.test.ts`, `pre-push-gate.test.ts`.
