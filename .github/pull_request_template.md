## Summary
<!-- Brief description of what this PR does and why -->

## Changes
<!-- Bullet list of key changes -->
-

## Checklist

<!-- The items marked (CI) are verified mechanically by the `typecheck + tests` check —
     ticking them changes nothing. The unmarked ones are the ones that still rest on your
     word, so read those twice. -->

- [ ] Tests pass (`npm test`) *(CI)*
- [ ] Coverage >= 93% on new/modified lines (`npm run coverage:changed`) *(CI)*
- [ ] TypeScript compiles cleanly (`npm run typecheck`) *(CI)*
- [ ] Conventional commit format (`type: summary`) — the PR title is the squash commit and the changelog line
- [ ] **Bench attestation**: `npm run gate` PASS for the pushed HEAD (job id: `…`); `bench/gate` status will turn green once the worker sees the push
- [ ] **`main` moved after the gate?** — not required to be up to date; if it touches the
      same ground as this PR, the branch was merged with `origin/main` and gated again,
      otherwise it was left as is
- [ ] **L3 owed?** — if the diff touches pixels (renderer, layout, CSS), the browser smoke (`/e2e`) ran or is listed under Test Plan
- [ ] **RDO changes**: Verified against Delphi source using `delphi-archaeologist` — a change to
      `rdo-members.ts` needs a `File.pas:Line` citation **in this body** (CI checks it)
- [ ] No `any` types — used `unknown` for catch blocks
- [ ] Every new UI element is fully wired (not just visible)

## Test Plan
<!-- How was this tested? -->
-

## Screenshots
<!-- If UI changes, add before/after screenshots -->
