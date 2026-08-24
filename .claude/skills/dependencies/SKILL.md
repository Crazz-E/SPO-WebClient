---
name: dependencies
description: "TRIGGER: When auditing dependency vulnerabilities, checking licences, updating packages, or resolving version conflicts in package.json."
user-invokable: true
disable-model-invocation: false
---

# Dependencies

Replaces the former `dependency-audit` + `dependency-updater` pair. Both were generic
multi-language playbooks (Python/Go/Rust branches, `taze`, monorepo tooling) for a repo
that is npm-only. This is the npm-only version, with this project's actual verification gate.

## One package tree

| Tree | Manifest | Notes |
|------|----------|-------|
| WebClient | `package.json` | Server + client + tests. The only manifest in the repo. |

## Runtime surface

Production deps are few and each carries a specific risk profile — know which before proposing an upgrade:

| Package | Role | Upgrade risk |
|---------|------|--------------|
| `ws` | Gateway WebSocket server | **High** — protocol layer. Frame handling changes break the client bridge. |
| `cheerio` | Parses server HTML responses | **High** — `spo_session.ts` regex/selector parsing depends on its DOM semantics. Silent data loss risk. |
| `react`, `react-dom` | UI | Medium — check Zustand selector behaviour after major bumps. |
| `zustand` | Store | Medium — selector equality semantics changed across majors. |
| `7zip-min` | CAB asset extraction | Medium — see `doc/CAB-EXTRACTION.md`. |
| `node-fetch` | HTTP to directory server | Low-medium — ESM/CJS boundary has bitten this package historically. |
| `gifuct-js`, `lucide-react` | Animation decode, icons | Low. |

## Audit

```bash
npm audit --omit=dev              # production surface — what actually ships
npm audit                         # full tree, including build tooling
npm outdated                      # available upgrades
```

Triage by **reachability**, not by CVSS alone. A critical in a build-only devDependency
that never runs against untrusted input outranks nothing. State the reachability
judgement explicitly; do not just relay the severity label.

## Licences

```bash
npm ls --all --json | node -e "…"   # or npx license-checker-rseidelsohn --summary
```

The project ships under its own `LICENSE`. Flag any new **copyleft** (GPL/AGPL/LGPL)
dependency before it lands — an AGPL transitive in the shipped gateway is a real
problem, not a formality.

## Updating

1. **One concern per commit.** Security patches, minor bumps, and majors never share a commit.
2. **Patch/minor:** `npm update <pkg>` then run the gate below.
3. **Major:** read the changelog first. For `ws`, `cheerio` or `zustand`, also re-read the
   relevant `doc/` reference — these three sit on the protocol and parsing paths.
4. **Never** hand-edit `package-lock.json`. Regenerate it.
5. Do not add a dependency to solve something the standard library or an existing dep covers.
   The dependency count is deliberately low.
6. **Dependabot PRs:** `npm run deps:gate` merges main in, installs, gates, pushes and auto-merges
   them one by one. The install step is not optional: a session worktree has no
   `node_modules` of its own — npm and Node resolve up to `~/SPO-WebClient/node_modules` —
   so without an `npm ci` *in the PR's worktree* the bench would build and drive the bump
   against the main checkout's old packages and attest nothing about it.

## Verification gate (mandatory after any change)

```bash
npm run typecheck    # both tsconfigs
npm test             # full suite; coverage thresholds enforced by jest.config.js
npm run build        # tsc + vite + esbuild
```

`jest.config.js` is a protected file — a dependency upgrade that drops coverage below a
threshold is fixed by adding tests, never by lowering the threshold. See `spo-testing`
for the actual numbers.

If the change touches `ws` or `cheerio`, also run the RDO suites:

```bash
npm test -- spo_session
npm test -- rdo
```

## Anti-patterns

| Do NOT | Why |
|--------|-----|
| `npm audit fix --force` | Applies breaking majors silently across the protocol layer. |
| Bump `ws` or `cheerio` inside a feature commit | Buries a protocol-layer risk in unrelated review. |
| Add a package to replace ~20 lines of code | Widens the supply-chain surface for no gain. |
| Lower a coverage threshold to make an upgrade pass | Thresholds only go UP. |
