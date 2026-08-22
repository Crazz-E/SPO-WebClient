## Summary
<!-- Brief description of what this PR does and why -->

## Changes
<!-- Bullet list of key changes -->
-

## Checklist

- [ ] Tests pass (`npm test`)
- [ ] Coverage >= 93% on new/modified lines (`npm run test:coverage`)
- [ ] TypeScript compiles cleanly (`npx tsc --noEmit`)
- [ ] Conventional commit format (`type: summary`) — the PR title is the squash commit and the changelog line
- [ ] **Bench attestation**: `npm run gate` PASS for the pushed HEAD (job id: `…`); `bench/gate` status will turn green once the worker sees the push
- [ ] **Up to date with `main`** — if `main` moved after the gate, the branch was updated and gated again
- [ ] **L3 owed?** — if the diff touches pixels (renderer, layout, CSS), the browser smoke (`/e2e`) ran or is listed under Test Plan
- [ ] **RDO changes**: Verified against Delphi source using `delphi-archaeologist`
- [ ] **Protected files**: Did NOT modify `rdo-types.ts`, `rdo.ts`, or `jest.config.js` without discussion
- [ ] No `any` types — used `unknown` for catch blocks
- [ ] Every new UI element is fully wired (not just visible)

## Test Plan
<!-- How was this tested? -->
-

## Screenshots
<!-- If UI changes, add before/after screenshots -->
