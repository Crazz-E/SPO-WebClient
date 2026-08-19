---
name: spo-testing
description: "TRIGGER: When writing or fixing tests, chasing coverage, or adding fixtures. Jest projects layout, the coverage ratchet, the 7 custom RDO matchers, and the mock server. Replaces the generic jest-testing skill."
user-invokable: true
disable-model-invocation: false
---

# Testing

Jest + ts-jest. Convention: `module.ts` → `module.test.ts` **in the same directory**.

## Two Jest projects

| Project | Env | Matches | Setup |
|---------|-----|---------|-------|
| `unit` | node | `**/*.test.ts` | `src/server/__tests__/setup/jest-setup.ts` |
| `component` | jsdom | `**/*.test.tsx` | + `src/client/__tests__/setup/component-setup.ts` |

```bash
npm test                              # everything
npm test -- rdo-types                 # one file/pattern
npm test -- --testNamePattern="X"     # one suite
npm run test:changed                  # --onlyChanged --bail
npm run test:smoke                    # component project only
npm run test:coverage
```

Path aliases resolve in tests: `@/`, `@shared/`, `@server/`, `@client/`.

## Coverage — two different numbers, do not conflate them

**Project convention:** new or modified lines must be ≥ **93 %** covered. This is a review
standard, not machine-enforced — meeting the jest thresholds is not sufficient.

**Machine floor** (`jest.config.js`, ratchet baseline 2026-03-11) — thresholds **only go UP**:

| Scope | lines | functions | branches | statements |
|-------|------:|----------:|---------:|-----------:|
| global | 38 | 39 | 29 | 38 |
| `src/shared/` | 54 | 65 | 37 | 54 |
| `src/shared/building-details/` | 92 | 100 | 80 | 91 |
| `src/shared/types/` | 96 | 73 | 90 | 96 |

`jest.config.js` is a **protected file**. Never lower a threshold to make a change pass —
add tests. Raising one after a genuine improvement is encouraged; do it in its own commit.

## Custom RDO matchers

Defined in `src/server/__tests__/matchers/rdo-matchers.ts`, typed in the sibling `.d.ts`:

```
toContainRdoCommand(method, args?)     toMatchRdoResponse(requestId?)
toMatchRdoCallFormat(method)           toMatchRdoFormat()
toMatchRdoSetFormat(property)          toPassStrictRdoValidation(config?)
toHaveRdoTypePrefix(prefix)
```

Prefer these over hand-rolled string assertions on RDO frames — they encode the wire rules
and fail with a protocol-aware message.

```ts
expect(frame).toMatchRdoCallFormat('SetPrice');
expect(frame).toHaveRdoTypePrefix('#');
expect(frame).toPassStrictRdoValidation();
```

## Mock server, not hand-written frames

Protocol tests replay real captured exchanges rather than invented strings. See
`src/mock-server/CLAUDE.md` for the full API and `doc/mock-server-guide.md` for the
step-by-step.

```ts
const mock = new RdoMock();
mock.addScenario(createAuthScenario());
expect(mock.match('C 0 idof "DirectoryServer"')).not.toBeNull();
```

## Fixtures

`src/__fixtures__/` is a **protected directory** — it holds real server responses. Do not
edit or regenerate without discussion. Parsing tests must run against these, not against
simplified mock HTML: the classic silent-truncation bug (`[A-Za-z0-9]` clipping
`PGISRVCOMMON_AlienParkA` to `PGISRVCOMMON`) only reproduces on real payloads.

## Traps that produce green-but-wrong suites

| Trap | Fix |
|------|-----|
| `ClientFacilityDimensionsCache` is a singleton | `clear()` then `initialize()` in `beforeEach`, or tests contaminate each other |
| Regex asserted only on shape | Also assert result **length/format** — silent truncation passes a shape check |
| Mock HTML that is too clean | Use `__fixtures__/` captures |
| Testing only level 1 of property resolution | Cover all three: direct → indexed (`Price0`) → columnSuffix (`Tax0Percent`) |
| Async RDO test without timeout category | `testTimeout` is 10 s; a VERY_SLOW category call will hang the suite |

## Before declaring done

```bash
npm run typecheck    # auto-enforced by the Stop hook when .ts/.tsx changed
npm test
npm run build
```
