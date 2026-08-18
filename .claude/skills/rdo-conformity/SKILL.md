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
| QueryId + `"*"` / `set` on a **`procedure`** | yes | empty ack `A<id> ;` | ✅ **REQUIRED** for void members — the reference client's own form. `VOID_MEMBERS` is the whitelist, each entry with its Pascal declaration. |
| QueryId + `"*"` on a **`function`** | parses, but | **ARBITRARY MEMORY WRITE** in the server | 🚫 **MUST NOT — live-proven 2026-08-18.** Blocked by `assertNotVoidPush`, a **safety guard** since that date, which takes **no opt-in**. |
| no QueryId + `"*"` | yes | silence | ✅ `writeRdoFrame(socket, cmd)` — canonical fire-and-forget |
| no QueryId + `"^"` | **NO** | reply built with no destination — **crashes the server** | 🚫 MUST NOT. No capture contains it. |

**There are three crash risks, not one — and two of them are the same mistake mirrored.**

| Mistake | Mechanism | Proven |
|---|---|---|
| `"^"` on a **`procedure`**, 2 register args | hidden result pointer pushed on the stack (`RDOObjectServer.pas:292`), never popped → **freeze** | 2026-08-14, `SayThis` |
| `"*"` on a **`function`** | **no** hidden result pointer passed — `@ResParam` sees `Res.VType = varEmpty` and jumps straight to `@DoCall` (`RDOObjectServer.pas:281-283`) — but the compiled function writes its `OleVariant` through the register its own ABI reserves (`EDX`), left holding whatever was there → **16-byte write to an arbitrary address** | 2026-08-18, `GetUserList` |
| no QueryId + `"^"` | reply built with no destination | live incident |

> **⚠ CORRECTION 2026-08-18 — read this before trusting any older revision of this file.**
> This section used to say *"the only real crash risk is row 4"*, that `assertNotVoidPush` was a
> consistency guard rather than a safety one, and that the 2026-07-02 retirement had disproved the
> danger. **All three statements were wrong**, and the last one instructed readers not to revisit it.
>
> The 2026-07-02 retirement **over-generalised**: every capture behind it shows `"*"` on a
> `procedure` or a property — `AddLine`, `CloseMessage`, `RDOEndSession`, `set EnableEvents`. **None
> shows `"*"` on a `function`**, which is the case the original claim described. On 2026-08-18 a
> certification sweep emitted five of them; the shared production Interface Server then answered
> `errMalformedQuery` to **every** query on **every** connection — including the Model Server's own
> `RefreshArea` pushes — for over three hours, without crashing and without restarting.
>
> Corrected reading: `"*"` + QueryId is **safe on a `procedure`** and an **arbitrary memory write on
> a `function`**. Full account: `doc/rdo-protocol-architecture.md` §8.5.

> **There is therefore no safe frame for a member whose declaration nobody has.** Its kind comes from
> the Pascal source, never from probing the server to see what happens.

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
