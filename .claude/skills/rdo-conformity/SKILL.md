---
name: rdo-conformity
description: "TRIGGER: Before writing or modifying ANY RDO code — new RDO calls, changed calls, push handlers, anything touching sendRdoRequest(), writeRdoFrame() or RdoCommand. Pre-flight checklist for wire conformity, verb choice, separator matrix, and the evidence hierarchy that settles conflicts."
user-invokable: true
disable-model-invocation: false
---

# RDO Conformity

The conformity target is **the exact bytes the original Voyager client put on the wire**,
recorded live against the production server (`User-Agent: FIVEVoyager`, Feb 2026).
Not "what the Delphi server accepts" — what the reference client actually sent.

This skill is the pre-flight checklist. The canonical references are
[doc/rdo-protocol-architecture.md](../../../doc/rdo-protocol-architecture.md) (wire, dispatch,
push filtering) and [doc/rdo-session-lifecycle.md](../../../doc/rdo-session-lifecycle.md)
(sessions, timers, reconnection). **Do not duplicate them here — read them.**

## Evidence hierarchy — settles every conflict

Ranked. When two sources disagree, the higher rank wins.

1. **Live captures** — [doc/Mock_Server_scenarios_captures.md](../../../doc/Mock_Server_scenarios_captures.md)
   (14 scenarios) and `doc/building_details_rdo.txt`. Byte sequences that demonstrably worked
   in production. Citations read `[capture :N]` = line N.
2. **Legacy client source** — `../SPO-Original/Voyager/` + `Rdo/Client/`. Explains *why* the
   captured bytes look that way (COM late-binding marshaling).
3. **Server RTTI classification is NOT the reference for verb choice.** The client's COM
   dispatch picks the verb; the server tolerates it via GET fallthrough.
4. **Absence from a capture is NOT negative evidence.** Captures have QueryId gaps where
   frames were elided. Presence proves; absence proves nothing.
5. **On conflict, captures win.** First explain from server source *why* the captured form
   works, then align docs and code with the capture — never the reverse.

Never silently "fix" code to match the Delphi source against a capture. Document the
reasoning, then follow the capture.

## Pre-flight checklist

Before writing the first line of RDO code:

- [ ] Read `doc/rdo-protocol-architecture.md` §0 (evidence), §1 (framing), §8 (edge cases)
- [ ] Session/timer/reconnect work? Read `doc/rdo-session-lifecycle.md` too
- [ ] Found the member in a live capture, or in `doc/spo-original-reference.md`?
- [ ] Verified the signature against `../SPO-Original` via the `delphi-archaeologist` skill?
- [ ] Verb, separator and QueryId chosen from the tables below — not by analogy?
- [ ] Building via `RdoValue`/`RdoCommand` from `@/shared/rdo-types` — never a hand-built string?

## Verb choice — mirror the client, not the server

`GetProperty` falls through to `CallMethod` when no published property matches
[`RDOObjectServer.pas:112-116`]. The legacy client *relies* on this.

| Situation | Verb | Example |
|-----------|------|---------|
| 0-arg member read for its value | **`get`** | `get RDOOpenSession` [capture :10], `get ServerBusy` [:993] |
| Member invoked with arguments | **`call`** | `call SetPrice` |
| Assignment | **`set`** | `set EnableEvents="#-1"` [:978] |

`get` on a Delphi *function* is correct — it is what the reference client emits.
The conformity bug is **inventing `call` frames the reference client never produced**.

`set` has **no** fallthrough: on a non-existent property it returns `errUnexistentProperty`
[`RDOObjectServer.pas:176`].

## QueryId × separator matrix

Two independent axes. QueryId decides *whether the server replies*; the separator decides
*whether the reply carries `res=`*. Both separators parse arguments identically
[`RDOQueryServer.pas:419-424`].

| Form | Wire-legal | Server behaviour | Project policy |
|------|-----------|------------------|----------------|
| QueryId + `"^"` | yes | `A<id> res="…"` | ✅ `sendRdoRequest()` — canonical synchronous form |
| QueryId + `"*"` / `set` | yes | empty ack `A<id> ;` | ⛔ Forbidden **by convention** (`assertNotVoidPush`) — one form per intent. Not a crash risk. |
| no QueryId + `"*"` | yes | silence | ✅ `writeRdoFrame(socket, cmd)` — canonical fire-and-forget |
| no QueryId + `"^"` | **NO** | reply built with no destination — **crashes the server** | 🚫 MUST NOT. No capture contains it. |

**The only real crash risk is row 4.** Row 2 is a consistency guard, not a safety one — an
earlier revision of the docs claimed it crashed the server; that claim was **retired
2026-07-02** and disproved by capture. Do not reintroduce it.

Gateway decision (settled 2026-07-02): the WebClient uses QueryId + response for **every**
request, reads and mutations alike, where the legacy client fired many mutations blind.
Wire-legal, gives error detection, and pairs with **never auto-retry CALL/SET**.

## Non-negotiables

| Rule | Why |
|------|-----|
| All socket writes via `writeRdoFrame()` | Latin-1 encoding; Node's UTF-8 default corrupts bytes ≥ 0x80. Enforced by `no-raw-rdo-writes.test.ts`. |
| Never hand-build a protocol string | Use `RdoValue`/`RdoCommand` from `@/shared/rdo-types` (protected file). |
| Booleans emit `#-1`/`#0`, parse any non-zero as true | Byte-identical to the legacy client. Never normalise `#-1` to `#1`. |
| Never auto-retry CALL/SET | No server-side idempotency. A retried mutation can place a building twice. Delphi pattern: `try→except→RenewWorldProxy→return ERROR`. |
| Sequential by default | Not because the server serialises (it does not — 24-thread queue, §3.5) but because same-world reads serialise on the IS→Model path anyway and `SwitchFocusEx` is stateful. |
| `worldContextId` vs `interfaceServerId` | World ops vs building ops. Mixing them targets the wrong server object. |
| Every `sendRdoRequest()` names a `TimeoutCategory` | FAST 60 s (legacy `DefTimeOut`); NORMAL/SLOW/VERY_SLOW 180 s (`ISProxyTimeOut`). |

## When a capture and the Delphi source disagree

1. Re-read the capture frame in full context — check for elided QueryIds around it.
2. Find the client-side code path in `../SPO-Original/Rdo/Client/RDOObjectProxy.pas` that
   would produce those bytes. Marshaling usually explains the surprise.
3. Write down *why* the captured form works, citing `File.pas:Line`.
4. Align the code and the doc with the capture. Add a dated "retired claim" note if you are
   overturning something previously documented — the docs already do this, follow the pattern.
5. Promote the exchange into a replayable scenario (`src/mock-server/scenarios/captured/`)
   via `npm run capture:convert`. See `src/mock-server/CLAUDE.md` — never hand-edit generated
   scenarios.

## Verification

```bash
npm test -- rdo                 # framer, protocol parsing
npm test -- rdo-types           # type system
npm test -- spo_session         # session lifecycle
npm test -- rdo-request-guards  # void-push and buffer guards
npm run typecheck
```

Related skills: `rdo-network-resilience` (reconnect, timeouts, ServerBusy),
`delphi-archaeologist` (evidence from `../SPO-Original`), `code-guardian` §A (crash traps).
