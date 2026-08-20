# Contributing

## Before anything

Read [CLAUDE.md](CLAUDE.md). It carries the rules this project actually enforces, and four
nested `CLAUDE.md` files cover `src/server`, `src/shared`, `src/mock-server` and `src/client`.

## Setup

```bash
npm ci
npm run dev      # build + start on port 8080
```

Node.js 22 or newer, npm 10 or newer.

## The one rule that matters

**The RDO protocol is the project.** A wire divergence is not a normal bug — it can freeze or
crash a live server. So:

- never build protocol strings by hand — use `rdoCall` / `rdoGet` / `rdoSet` from
  `@/shared/rdo-frame`, with `RdoValue` arguments;
- a new member goes in the catalogue `src/shared/rdo-members.ts`, with its **kind** and
  **arity** taken from the server-side declaration in `../SPO-Original`, cited as `File.pas:Line`;
- never probe a live server to find out.

`src/shared/rdo-types.ts`, `src/server/rdo.ts`, `src/__fixtures__/` and `jest.config.js` are
not modified without discussion.

## Tests

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage
```

New or modified lines must reach **93 % coverage**. Jest thresholds only go up, never down.
Never change a test to make it pass: a red test means the code is wrong, or the criterion was
badly stated — in that case, ask.

## Branches and commits

Branches: `feature/`, `fix/`, `refactor/`, `doc/` + a short description.

Commits: `type: short summary`, where type is `feat`, `fix`, `refactor`, `perf`, `docs`,
`test`, `chore` or `build`.

## Pull requests

CI runs typecheck and the full suite on every pull request; both must be green. Fill in
[the PR template](.github/pull_request_template.md), and say which RDO members the change
touches, if any.

## Style

TypeScript strict. No `any` — `unknown` in catch blocks with `toErrorMessage(err)`. camelCase
for variables and methods, PascalCase for classes and interfaces. JSDoc on public API only.
LF line endings everywhere except `.bat` and `.cmd` — `.gitattributes` and `.editorconfig`
enforce it.

`npm run lint` must report **zero errors**; warnings are a known backlog. Prettier is
configured but not enforced over the existing tree — format the code you touch
(`npx prettier --write <file>`), do not sweep the repository in a feature branch.
