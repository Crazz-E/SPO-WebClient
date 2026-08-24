---
description: Take the next unowned Todo item from the GitHub Projects kanban and drive it end-to-end (dev → gate → PR → merge → finish), updating the board at each milestone
argument-hint: "[issue number or OB-N to take a specific item]"
---

# Next task

**The rulebook is [doc/kanban-workflow.md](../../doc/kanban-workflow.md)** — columns,
ownership law, board writes, model routing. Do not restate or reinvent it; follow it.
Board: [github.com/users/Crazz-E/projects/2](https://github.com/users/Crazz-E/projects/2).

## 1 · Pick

List the board (`gh project item-list 2 --owner Crazz-E --format json`). Candidates:
Status = **Todo** and `Session` **empty**. Take the **topmost** (list order is the human's
priority) — or the item named in `$ARGUMENTS` if given and unowned. If an argued item is
owned, stop and say so: ownership is sacred.

## 2 · Claim (handshake)

Write `Session` = `<branch> @ <YYYY-MM-DD>`, move Status → **En cours**, then **re-read**
`Session`. Not your identity → you lost the race: take the next candidate. One card at a
time.

## 3 · Work the lot end-to-end

The repo process applies unchanged — this command adds nothing to it:

- Branch, implement, tests (≥ 93 % on new/modified lines), typecheck, lint.
- **Model routing** (kanban-workflow § Model routing): plan/analysis on **Fable 5**,
  execution on **Opus 5** — via sub-agents if the session cannot switch itself.
- **Context discipline**: stay under ~250k, delegate heavy reads to sub-agents, compact
  after exploration.
- Gate deposited (`npm run gate`, background) → Status → **Gate**.
- Gate PASS → push, PR with **`Closes #<issue>`** in the body → Status → **PR**.
- Checks green → merge, `npm run finish` → Status → **Done** + one final comment
  (2–4 lines: what changed, PR number, anything the human should know).

## 4 · If it fails

Three gate attempts max, each naming a different root cause — as ever. If the task cannot
land (blocked, out of reach, wrongly scoped): Status → **À reclasser**, keep `Session`
filled, post one comment **in simple, non-technical French** explaining what was attempted
and what blocked it. Never leave the card in En cours/Gate/PR at session end — close your
ownership, one way or the other.

## 5 · Findings along the way

Anything discovered out of scope: new issue, added to the board in Todo (bottom), `Catégorie`
**and the matching `cat:` / `size:` labels** set (kanban-workflow § Feeding rule — the project
field is not queryable, the label is), synthetic body — then back to the task. Never expand
your own scope with it.
