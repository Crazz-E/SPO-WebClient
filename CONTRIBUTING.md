# Contributing

## Before anything

Read [CLAUDE.md](CLAUDE.md). It carries the rules this project actually enforces, and four
nested `CLAUDE.md` files cover `src/server`, `src/shared`, `src/mock-server` and `src/client`.

## Setup

```bash
npm ci
npm run dev:local   # build + start on the first free port from 8081 up
```

Node.js 22 or newer, npm 10 or newer. On the shared test machine the gateway is **leased
from the bench worker** instead (`npm run dev`) — see [doc/bench-worker.md](doc/bench-worker.md);
a gateway of your own there goes **off 8080**, which `dev:local` now guarantees on its own —
the worker clears that port before every job, and a hook refuses any command that would take it.

## The one rule that matters

**The RDO protocol is the project.** A wire divergence is not a normal bug — it can freeze or
crash a live server. So:

- never build protocol strings by hand — use `rdoCall` / `rdoGet` / `rdoSet` from
  `@/shared/rdo-frame`, with `RdoValue` arguments;
- a new member goes in the catalogue `src/shared/rdo-members.ts`, with its **kind** and
  **arity** taken from the server-side declaration in `../SPO-Original`, cited as `File.pas:Line`;
- never probe a live server to find out.

`src/shared/rdo-types.ts`, `src/shared/rdo-frame.ts`, `src/server/rdo.ts`,
`src/__fixtures__/` and `jest.config.js` are not modified without discussion — and this is
**checked**, not merely stated: `scripts/check-pr-rules.js` runs inside the required
`typecheck + tests` check and fails a pull request that touches one of them without the
**`rdo-approved`** label. Only the maintainer posts that label; the author of a diff cannot
unlock their own change. The same step requires a `File.pas:Line` citation in the PR body
whenever `src/shared/rdo-members.ts` changes.

## Tests

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage
```

New or modified lines must reach **93 % coverage** — enforced by `npm run coverage:changed`
(part of `npm run gate`'s precheck, and run by CI on every pull request); the `jest.config.js`
floor is a separate number and is unchanged by it. Jest thresholds only go up, never down —
`check-pr-rules.js` compares `coverageThreshold` against the base commit and fails on any
value lowered or removed.
Never change a test to make it pass: a red test means the code is wrong, or the criterion was
badly stated — in that case, ask.

## Branches and commits

Branches: `feature/`, `fix/`, `refactor/`, `doc/` + a short description (a Claude session's
worktree branch `claude-<user>/…` is fine too — only `main` is refused).

Commits: `type: short summary`, where type is `feat`, `fix`, `refactor`, `perf`, `docs`,
`test`, `chore` or `build`.

## Pull requests

`main` takes pull requests only — one ruleset, no bypass, binding the owner as well. Two
required checks: **CI** (`typecheck + tests`, GitHub-hosted) and **`bench/gate`** — the live
attestation the bench worker publishes as a commit status once your branch is pushed
([doc/bench-worker.md](doc/bench-worker.md) §5); no approval is required (solo maintainer),
and the branch must be **up to date** with `main`. `git push` itself is blocked locally until
the worker has attested HEAD (`npm run gate`, on a committed tree — a dirty tree is refused).
If `main` moves while your PR is open, update the branch and run `npm run gate` again: the
new sha needs its own attestation. Fill in [the PR template](.github/pull_request_template.md),
and say which RDO members the change touches, if any.

A third job, **`claude review`**, posts a review comment on every PR
([.github/workflows/claude-review.yml](.github/workflows/claude-review.yml)). It is a second
reader with none of the authoring session's context, looking for what the two required checks
cannot see: a hand-built RDO string, an `any`, a UI element whose action is not wired, a test
edited to make it pass, an abstraction built for a need nobody has. It is **not** a required
check and cannot fail your PR — read it, answer it, merge anyway if it is wrong. It stays
silent until `ANTHROPIC_API_KEY` exists on the repository.

**Merge with squash**, and make the PR title a conventional commit (`type: summary`) — it
becomes the one squash commit, and that commit is the changelog line. GitHub deletes the
remote branch at merge; then **`npm run finish`** closes the local side (main fast-forwarded,
refs pruned, worker reinstalled if its sources changed, worktree and branch removed). An
update is done when `main` is the only branch left, locally and on origin. The merge itself
is the release: `release.yml` computes the version from the last `v*` tag and the
commits since it (`feat` → minor, otherwise patch), builds, tags and publishes
it on GitHub Releases — never create `v*` tags by hand.

Dependabot PRs: `npm run deps:gate` merges main in, installs, gates, pushes and auto-merges them
one by one; a lockfile change routes to spine + building-details.

## Changelog

Synthetic, not verbose: one line per `feat` / `fix` / `perf` / `refactor` squash commit
since the last tag, grouped as Added / Fixed / Changed (plus a Documentation section for
`docs`; `test`, `chore`, `build` are dropped), generated by `scripts/changelog.js` at release
time into the GitHub Release notes and the in-app "What's New" (`npm run release:preview`
shows what the next merge would publish). `CHANGELOG.md` is frozen at 1.3.2-beta; nobody
edits it — write a good PR title instead.

## Style

TypeScript strict. No `any` — `unknown` in catch blocks with `toErrorMessage(err)`. camelCase
for variables and methods, PascalCase for classes and interfaces. JSDoc on public API only.
LF line endings everywhere except `.bat` and `.cmd` — `.gitattributes` and `.editorconfig`
enforce it.

`npm run lint` must report **zero errors**; warnings are a known backlog. Prettier is
configured but not enforced over the existing tree — format the code you touch
(`npx prettier --write <file>`), do not sweep the repository in a feature branch.
