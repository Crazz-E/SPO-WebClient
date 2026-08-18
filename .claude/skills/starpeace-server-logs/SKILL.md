---
name: starpeace-server-logs
description: "TRIGGER: When reading the Delphi servers' public logs at http://158.69.153.134/logs/ — diagnosing a server incident, deciding whether a world is alive or frozen, attributing a freeze or a corruption to us or to a third party, correlating a conformance run or an E2E session with what the Interface Server actually wrote. Covers the UTC trap, the never-load-a-whole-log rule, the signature table, and the two opposite failure modes."
user-invokable: true
disable-model-invocation: false
---

# Starpeace Server Logs

The four Delphi servers publish their logs over plain HTTP. They are the **second evidence
stream** of every live run — the only one that says what the *server* experienced. They are also
the fastest way to reach a confident wrong conclusion, which is what this skill exists to prevent.

This skill teaches the **manual investigation** — reading the logs by hand when you do not yet
know what you are looking for. The **automated** path, which correlates one known session end to
end, is [`src/tools/conformance/server-logs.ts`](../../../src/tools/conformance/server-logs.ts);
see §9. The category inventory and the campaign correlation model live in
[doc/E2E-LIVE-CAMPAIGN.md §2.2–§3](../../../doc/E2E-LIVE-CAMPAIGN.md). Do not duplicate either
here — read them.

---

## 0. THE LOGS ARE UTC. YOUR CLOCK IS NOT. CONVERT BEFORE YOU CONCLUDE.

> **Server logs — file contents *and* IIS directory listing — are UTC.
> The development machine is Europe/Paris, UTC+2 in summer.
> Convert, or reason entirely in UTC on both sides, BEFORE concluding anything about how fresh a
> log is.**

**The mistake, 2026-08-18.** The IIS listing showed `Survival 26-08-18.log … 11:37 AM`. The local
clock read 13:37. Conclusion: *"the log stopped two hours ago, the process is dead."* It was being
written at that very second — 11:37 UTC **is** 13:37 Paris. The false conclusion "the server
crashed" was written into `CLAUDE.md` and `doc/rdo-protocol-architecture.md` before being caught.

**It had already bitten once**, on a different subject:
[`halt.ts:51`](../../../src/tools/conformance/halt.ts#L51) carries the scar —
*"UTC, ISO 8601. Server logs are read as UTC; a local stamp has already cost one investigation."*
Two bites, two subjects. Assume it will try a third time.

### The gesture

Print both clocks before you read anything. Compare only UTC to UTC.

```bash
echo "local=$(date +%T)  utc=$(date -u +%T)"
curl -s -I --max-time 30 "http://158.69.153.134/logs/" | grep -i '^Date:'   # the server's own clock, GMT
```

In code, never build a comparison out of `getHours()`. The two helpers exist for this:

| helper | file | does |
|---|---|---|
| `parseClock(text)` | [server-logs.ts:66](../../../src/tools/conformance/server-logs.ts#L66) | `H:MM:SS AM` → seconds since **server** midnight |
| `utcSecondsOfDay(date)` | [server-logs.ts:75](../../../src/tools/conformance/server-logs.ts#L75) | a JS `Date` → seconds since **UTC** midnight |

Both sides land in the same unit, and `correlateSession` still *measures* the residual offset from
the `LOGON SUCCESS` line rather than assuming it
([server-logs.ts:429-430](../../../src/tools/conformance/server-logs.ts#L429)). Measure; never assume.

### Both timezones confirmed, listing and content

Verified 2026-08-18, one observation, three clocks:

```
local = 16:09:20      utc = 14:09:20
IIS listing:   8/18/2026  2:09 PM      1765704 Survival 26-08-18.log
last line:     2:09:09 PM SIM-Facs
```

The listing mtime, the file's last line and `date -u` agree to the minute; all three are two hours
behind the dev machine. **The directory listing is in the same timezone as the file contents, and
that timezone is UTC.** The mtime also tracks live appends, so it is a valid freshness signal —
once converted.

---

## 1. NEVER LOAD A WHOLE LOG INTO CONTEXT

`Population 26-08-18.log` was **59.7 MB** (and 98 MB the day before). `FIVEMODELSERVER/Survival`
runs 2–3 MB a day, and `FIVEINTERFACESERVER/Survival` — normally 5–80 KB — reached **1.87 MB** on
2026-08-18 because the server was writing an error per frame.

Download to the scratchpad, then work with `grep` / `sed` / `tail` / `wc`. **Never `cat` a log.**

```bash
SP="<scratchpad>"
curl -s --max-time 180 -o "$SP/is.log" \
  "http://158.69.153.134/logs/FIVEINTERFACESERVER/Survival%2026-08-18.log"

grep -c "" "$SP/is.log"                 # how many lines
tail -20 "$SP/is.log"                   # the current state
grep -n "LOGON SUCCESS" "$SP/is.log"    # anchors, with line numbers
grep -c "Malformed query" "$SP/is.log"  # density of a signature
```

Check the size in the listing **before** downloading. If it is tens of MB and you only need a
signature count, prefer `curl -s <url> | grep -c '<pattern>'` — the bytes stream through the pipe
and never reach a file or your context.

Two mechanical notes: the space in the file name must be `%20` in the URL, and **the log files are
CRLF** — harmless to `grep`, but strip `\r` before comparing a trailing field.

---

## 2. The endpoint

- Root: `http://158.69.153.134/logs/` — an IIS **HTML directory listing**.
- **Plain HTTP, no TLS.** `curl` only; `WebFetch`-style clients try to upgrade and fail. This is
  also why [`fetchText`](../../../src/tools/conformance/server-logs.ts#L45) uses `http.get`
  directly and decodes `latin1`.
- Four servers: `FIVEINTERFACESERVER`, `FIVEMODELSERVER`, `FIVECACHESERVER`, `FIVEMAILSERVER`.
- Naming: `<Category> <YY-MM-DD>.log`, one file per day, appended (rotation never truncates).

Strip the listing to plain text:

```bash
curl -s --max-time 60 "http://158.69.153.134/logs/FIVEINTERFACESERVER/" \
  | sed -e 's/<br>/\n/g' -e 's/<[^>]*>//g' | sed '/^\s*$/d'
```

### Categories are per server, not a common pool

Enumerated 2026-08-18 across all four directories (file counts):

| server | categories present |
|---|---|
| `FIVEINTERFACESERVER` | `Survival` (46), `Clients` (46), `Chat` (11), `Demolition` (1) |
| `FIVEMODELSERVER` | `Survival` (47), `Population` (47), `Office` (47), `EOY` (47), `favorites` (46), `Demolition` (23), `ClassInfo` (3), `Money` (2), `TimeWarp` (1), `Excentric` (1) |
| `FIVECACHESERVER` | `Survival` (9) |
| `FIVEMAILSERVER` | `Survival` (2) |

Asking the Interface Server for `Population` returns 404 — the category lives on the Model Server.
Re-enumerate rather than trusting this table; categories appear when something first writes one.
What each one is *for* is [E2E-LIVE-CAMPAIGN.md §2.2](../../../doc/E2E-LIVE-CAMPAIGN.md), including
the three corrections that table carries (notably: **`Demolition` is a generic destructor trace,
not a demolition log** — a false friend for correlation).

---

## 3. Line formats, and the three parsing traps

Real lines, sampled 2026-08-18:

```
2026-08-18 10:22:57 AMMalformed query in TRDOQueryServer.ExecQuery line (160)  1068 sel 29983712 call GetUserList "*";
2026-08-18 10:22:57 AM Error at: TRDOObjectServer.CallMethod "RDODowngrade" (326)
2026-08-18 10:22:55 AMError at: TRDOObjectServer.GetProperty (126)
10:22:57 AM - Error in GetChannelList
10:22:48 AM - LOGON ATTEMPT: User=SPO_test3
10:22:50 AM - LOGON SUCCESS: ClientViewId=29983712
10:22:51 AM SPO_test3.IP = 88.167.51.32
11:39:22 AMSIM-Facs
(7)
```

1. **The `AM`/`PM` separator is inconsistent.** Sometimes glued to the message (`AMMalformed`),
   sometimes one space, sometimes ` - `. Cause: two logging idioms in the Delphi source —
   `DateTimeToStr(Now) + 'msg'` (no separator, full date) versus `TimeToStr(Now) + ' - msg'`.
   `parseSurvival` tolerates all three
   ([server-logs.ts:94](../../../src/tools/conformance/server-logs.ts#L94)).
2. **Some lines carry the full date, most carry only the clock.** Dated lines come from
   `DateTimeToStr` — the RDO layer (`RDOObjectServer`, `RDOQueryServer`, socket errors, `<ISCnx>`).
   Undated lines come from `TimeToStr` — the application layer (logon, disconnect, `SIM-*`).
   **Consequence:** `parseSurvival` returns `at: null` for every dated line, so anything that walks
   timestamps (`heartbeatGaps`, `lastStampOf`) silently ignores the entire RDO error channel. On
   2026-08-18 that meant 13 506 of 13 654 lines had no parsed clock.
3. **Bare `(1)`…`(11)` lines.** Not error counters and not noise — they are the **step trace of
   `TClientView.DoLogOff`** (`InterfaceServer.pas:1976-2010`, one `Logs.Log('Survival', '(n)')` per
   step). A complete logoff prints `(1)` through `(11)` between `Start Disconnecting <user>` and
   `End Disconnecting`. **A truncated run tells you which step killed the logoff** — a diagnostic,
   not a nuisance.

---

## 4. A method that failed vs a server that is broken

The single most important distinction in these logs. The two look alike and mean nothing alike.
Every signature below is quoted from the Delphi source, so the semantics are not inferred.

| signature | Delphi origin | what it means | wire result | severity |
|---|---|---|---|---|
| `Error at: TRDOObjectServer.GetProperty (126)` | `Rdo.IS/Server/RDOObjectServer.pas:129` | exception caught reading a property; the server resumed | `errIllegalObject` | normal |
| `Error at: TRDOObjectServer.CallMethod "<m>" (319)` | `Rdo.IS/Server/RDOObjectServer.pas:338` | exception **inside the call** — marshalling or the method body | `errIllegalParamList` | normal |
| `Error at: TRDOObjectServer.CallMethod "<m>" (326)` | `Rdo.IS/Server/RDOObjectServer.pas:348` | exception **around** the call — object or method resolution failed (`theObject.MethodAddress`) | `errIllegalObject` | normal |
| `- Error in <Member>` | the member's own `except` in `InterfaceServer.pas` | the application handled its own failure | member-defined | normal |
| `Malformed query in TRDOQueryServer.ExecQuery line (160) <query>` | `Rdo.IS/Server/RDOQueryServer.pas:160` | the **outer** `except` of `ExecQuery` — an exception escaped the whole get/set/call dispatch loop | **`error 1`** (`errMalformedQuery`) | see below |
| `<label> Cannot connect to Server: <host> Port: <n>` | `Rdo.IS/Client/WinSockRDOConnection.pas:805` | an **outbound** RDO connection from inside the server failed; `<label>` names it (`GM`, `DA<n>`, `ISCnx`) | — | context |
| `Access violation` | Delphi runtime | the process touched memory it does not own | — | **critical** |

Two things the table makes precise that a quick read gets wrong:

- **The number in the message is a source-line *tag*, not a runtime line number**, and it is
  already stale: the string says `(126)` but the statement now sits at line 129. Never chase it as
  a line number; treat it as an opaque handler id.
- **`Malformed query` is not a syntax error.** `ExecQuery` returns `errMalformedQuery` *without
  logging* when it merely fails to recognise a command token
  (`Rdo.IS/Server/RDOQueryServer.pas:148-152`). The log line is written **only from the `except`
  block** — so it means *an exception escaped the dispatcher*, which is a far stronger statement.

### The decisive test: density, not presence

A single `Malformed query` is one bad frame. Judge it by **rate** and by **whose traffic it hits**:

```bash
echo "$(grep -c 'Malformed query' is.log) / $(grep -c '' is.log) lines"
grep "Malformed query" is.log | grep -oE 'call [A-Za-z]+ ' | sort | uniq -c | sort -rn | head
```

If the rejected calls include the Model Server's **own internal pushes** — `RefreshArea`,
`RefreshTycoons`, `RefreshDate`, `ModelStatusChanged` on a `sel <id>` that is not your ClientView —
the Interface Server is rejecting its own operator. **It is broken for everyone, not for you.**

`FATAL_SIGNATURES` ([server-logs.ts:210](../../../src/tools/conformance/server-logs.ts#L210)) encodes
exactly the two entries above that are proof rather than noise, and `fatalAnomalies`
([:230](../../../src/tools/conformance/server-logs.ts#L230)) deliberately reads the **raw** bracket
lines instead of the pre-filtered `troubleLines`
([:183](../../../src/tools/conformance/server-logs.ts#L183)) — because `Malformed query` contains
none of the words `TROUBLE` looks for, and went invisible for exactly that reason until 2026-08-18.
A fatal signature must be its own oracle.

---

## 5. Two failure modes with opposite signatures

Read this twice; it is counter-intuitive and it decides where you look.

| failure mode | what the log does | how you detect it |
|---|---|---|
| **Interface Server frozen** | writes **nothing**. No exception, no `Start Disconnecting`, **no `Clients` row at all**. The file simply stops mid-session. | the **silence** — plus the external `<ISCnx>` witness (§6) |
| **Interface Server corrupted** | writes **enormously** — thousands of `Malformed query` per hour, one per frame, on every connection | the **noise** — signature density (§4) |

The 2026-08-14 freeze ended `IS/Survival` on `LOGON SUCCESS: ClientViewId=7272232` and that was the
last line for 12 h 41 min. The 2026-08-18 corruption produced 13 506 lines in under four hours.
Same server, same symptom class from the client's point of view ("nothing works"), opposite log
evidence. Looking for noise during a freeze finds nothing and reads as health.

**A `Clients` exit row does not detect a freeze**, and cannot: a frozen `DoLogOff` never runs, so
the row is *absent*, never wrong. Absence, not value.

---

## 6. Liveness oracles, cheapest first

### O1 — the free heartbeat (seconds)

The Model Server pushes `RefreshTycoons` and `RefreshArea` to the Interface Server once per
simulation tick, with no involvement from us. **Measured 2026-08-18 over 984 intervals: median
13 s** (min 12, max 30) — the same cadence as the MS's own `SIM-*` phases (median 13 s, n = 3 771),
because they are emitted from the same tick. `RefreshDate` follows at median 58 s.

Those pushes appear in `IS/Survival` **only when they fail**. So:

- pushes visible as `Malformed query` → the dispatcher is broken **now**;
- pushes not visible at all → nothing to conclude from this channel alone (they are simply working,
  or nobody is connected — the IS logs success nowhere).

The pushes carry `"*"` legitimately: `RefreshArea` and `RefreshTycoons` are declared `procedure`
(`Interface Server/InterfaceServer.pas:451,453,548,550`). Seeing the Model Server use `"*"` is
**not** evidence that `"*"` is safe in general — see `CLAUDE.md` and
[rdo-protocol-architecture.md §8.5](../../../doc/rdo-protocol-architecture.md).

### O2 — `<ISCnx>` in `FIVEMODELSERVER/Survival` (~47 min)

The only channel that sees an IS **freeze**. The Model Server probes the Interface Server twice per
binary-backup cycle and logs each unanswered push. Three shapes, all carrying a **full date**:

```
2026-08-14 9:29:58 PM <ISCnx> (10)- Query timed out sel 6944144 call ModelStatusChanged "*" "#1"; Time: 10000
2026-08-15 10:10:09 AM ISCnx Error writing to socket
Start disconnecting: (ISCnx) 2026-08-18 2:05:29 PM
```

Probe interval `ISCNX_PROBE_INTERVAL_SEC = 2798` s plus a 10 s query timeout
([server-logs.ts:281-283](../../../src/tools/conformance/server-logs.ts#L281)) — confirmed
independently on 2026-08-18: `ModelStatusChanged` pushes arrive in pairs 2–3 s apart, ~2 774 s
between pairs.

**Therefore the oracle concludes only after ~47 min.** A campaign wave lasting minutes normally
contains **zero** probes. Silence at the end of a wave is *absence of evidence*, not evidence of
health — which is what `livenessConclusive` reports, and why it is deliberately not a failure
([server-logs.ts:475-481](../../../src/tools/conformance/server-logs.ts#L475)). Use `<ISCnx>` for
**a posteriori attribution**, never as a gate.

### O3 — did the process restart?

**There is no startup banner in `IS/Survival`.** The `====================` line is a *per-logon*
separator (91 occurrences for 91 logon attempts across the sampled corpus), not a boot marker.
**Absence of a banner therefore proves nothing** — a restart appends silently to the same file.

Two indirect markers, both verified, neither conclusive alone:

- **`GM Cannot connect to Server: dir.starpeaceonline.com Port: 2222`** — the Game Manager's
  outbound registration to the (dead) directory server, attempted at start-up. It appears at both
  restart boundaries we can date independently: the first line of `Survival 26-08-15.log` (after the
  08-14 freeze), and `2026-08-18 2:06:02 PM` — the exact line between the last `Malformed query`
  (2:05:23 PM) and the first healthy logon (2:06:05 PM). Rare: six `GM` lines over eight sampled
  days.
- **The `DA<n>` counter resets.** The DA-pool connection labels are monotonic per process lifetime
  (`DA1`…`DA123` on 08-17, max 9 on 08-16). A drop back toward `DA1` means a new process.

Corroborate with the Model Server: `Start disconnecting: (ISCnx) <date>` marks the moment the MS
lost its socket to the IS, which is what a restart looks like from outside.

---

## 7. Finding our own session

The Interface Server's logon bracket, verbatim:

```
====================================
LOGON ATTEMPT: User=SPO_test3
fDAOK=TRUE / WorldProxy is OK
(Logon.3) Calling WorldProxy.RDOGetTycoon...
(Logon.4) TycoonProxyId=…
TycoonProxyId<>0, existing tycoon found
(Logon.7) Creating ClientView...
Getting connection from DA pool... / Connection obtained, binding TycoonProxy...
Validating account... / ValidAccount=FALSE / IsRole=FALSE
CheckUserAccount RDOLogonUser result: 0 / CheckUserAccount final result: TRUE
Account validation PASSED
LOGON SUCCESS: ClientViewId=29983712
SPO_test3.IP = 88.167.51.32
…
Start Disconnecting SPO_test3 … (1)…(11) … End Disconnecting
```

**The join key is `ClientViewId`** — the very object id our own `Logon` returned. It is exact and
not time-based. Never join on the account name: `SPO_test3` is **not ours alone** (a third party
logged in as `SPO_test3` from another IP on 2026-08-17, and their freeze was nearly attributed to
us). Attribution needs `ClientViewId` **plus** the egress IP.
`findLogonBlocks` ([server-logs.ts:140](../../../src/tools/conformance/server-logs.ts#L140)) slices
the file into blocks; `correlateSession` picks ours by id.

`IS/Clients` is written **at logout**, from the first statement of `DoLogOff`
(`InterfaceServer.pas:1974`), TSV, CRLF:

```
SPO_test3 ⇥ 88.167.51.32 ⇥ 10:22:51 AM ⇥ 10:23:11 AM ⇥ 0
lord kaio ⇥ 200.161.218.116 ⇥ 11:51:56 PM ⇥ 12:04:52 AM ⇥ 1777182823
```

Correlate on tycoon + login time, ±2 s
([server-logs.ts:442](../../../src/tools/conformance/server-logs.ts#L442)).

> **The fifth column is NOT an exit code.** It is `fClientData.Values['CRC']` — the CRC of the
> **client executable**, sent by the Voyager client through `SetClientData`
> (`Voyager/URLHandlers/ServerCnxHandler.pas:2998`), and initialised to the literal string `CRC=0`
> when the client never sends one (`InterfaceServer.pas:646`). `1777182823` is the genuine Voyager
> binary's fingerprint, not an error. Our gateway never calls `SetClientData`, so our rows always
> read `0` — which is why the misreading has never fired. `server-logs.ts` names this field
> `exitCode` and fails a run when it is non-zero (§10.1).

---

## 8. Case study — 2026-08-18, as a method

Sources: [report/lot-S4-balayage-live.md](../../../report/lot-S4-balayage-live.md),
[report/plan-certification-rdo-rev4.md](../../../report/plan-certification-rdo-rev4.md) §1. Every
number below was re-verified against the live log while writing this skill.

**1 — The symptom.** From 10:22:57 UTC, every query on every connection answered `error 1`.

**2 — Find the first occurrence, with its line number.**

```bash
grep -n "Malformed query" is.log | head -1
# 136:2026-08-18 10:22:57 AMMalformed query in … 1068 sel 29983712 call GetUserList "*";
```

**3 — Read *backwards* from it, not forwards.** The rid in the frame (`1068`) indexes our own
recording, so the sweep's own history is readable:

| rid | member | outcome |
|---|---|---|
| 1060 | `GetCompanyCount` | empty ack — no symptom |
| 1061 | `GetUserName` | empty ack — no symptom |
| 1066 | `GetChannelInfo` | empty ack — no symptom |
| 1067 | `GetChannelList` | empty ack, but wrote `- Error in GetChannelList` |
| 1068 | `GetUserList` | `error 1` — and every frame after it |

Five `function`s called under `"*"`. **The frame where the damage becomes visible is not the frame
that caused it.** Three of the five left no trace at all.

**4 — The mechanism.** Under `"*"` the dispatcher passes no result pointer: `@ResParam` sees
`Res.VType = varEmpty` and jumps straight to `@DoCall`
(`Rdo/Server/RDOObjectServer.pas:281-283`, and the same code at
`Rdo.IS/Server/RDOObjectServer.pas:294-296`). The compiled `function` — `GetUserList` is
`function GetUserList : OleVariant`, `Interface Server/InterfaceServer.pas:191` — writes its
`OleVariant` result through `EDX` anyway, which the dispatcher left at whatever value the argument
loop happened to leave there. An arbitrary memory write.

**5 — Measure the density.** Re-read at 14:03 UTC: **13 506 `Malformed query` out of 13 654 lines**,
and exactly **13** non-malformed lines after line 136 — our own `Start Disconnecting` at 10:23:11
and its eleven `DoLogOff` steps. The rest of the file is the Model Server's `RefreshArea` /
`RefreshTycoons` / `RefreshDate` pushes being refused. *The server was rejecting its own operator.*

**6 — Measure the duration, and check for a restart.** 10:22:57 → 14:05:23 UTC, **3 h 42 min**, with
no `GM` line, no `DA` counter reset and no `<ISCnx>` event in between: **the process never
restarted.** It was alive and broken — which is *worse* than a crash, because a crash cures itself
by coming back up.

**7 — The recovery, caught live.** At `2026-08-18 2:06:02 PM` a `GM Cannot connect to Server:
dir.starpeaceonline.com` appeared, immediately followed by a clean logon for an unrelated player
(`danieleder`, 2:06:05 → 2:07:07 PM, `Clients` row present). The Model Server logged
`Start disconnecting: (ISCnx) 2026-08-18 2:05:29 PM` 33 s earlier. Three independent traces, one
conclusion: the Interface Server was restarted at ~14:05:30 UTC.

**8 — The error not to repeat.** Concluding "the process crashed" without looking. Twice on the same
day: once from an unconverted timestamp (§0), once from assuming a silent log meant a dead process.
**Neither the freshness of a file nor the absence of a banner is evidence on its own.**

---

## 9. Manual reading vs `server-logs.ts`

| use | reach for |
|---|---|
| One known session — you have the `ClientViewId`, the login and logoff instants, and want a verdict | **`server-logs.ts`**: `fetchDayLogs` → `correlateSession` → `formatServerLogVerdict`. This is what `--server-logs` runs after a live conformance run. |
| An incident with no known session; "is the world alive right now?"; a signature you have never seen; anything before you know what to grep for | **this skill, by hand.** |

`server-logs.ts` already implements `logUrl`, `fetchText`, `parseClock`, `utcSecondsOfDay`,
`parseSurvival`, `parseClients`, `findLogonBlocks`, `troubleLines`, `FATAL_SIGNATURES`,
`fatalAnomalies`, `parseIsCnxEvents`, `heartbeatGaps`, `lastStampOf`, `correlateSession`,
`fetchDayLogs`, `formatServerLogVerdict`. **Read it before writing a parser** — do not reimplement
any of it here or in a scratch script.

Its one structural limit, by design: it answers *"was **our** session clean?"*. It cannot answer
*"is the server healthy?"*, because it only ever looks inside our own bracket — a deliberate choice,
since attributing someone else's pathology to our run is the mistake the pre-flight probe exists to
avoid. When the question is about the server rather than about us, read by hand.

---

## 10. A caveat on the Delphi citations

The archived source in `../SPO-Original` is **close to, but not identical with, the deployed
binary**. The IS writes `LOGON ATTEMPT:`, `(Logon.3)` and `(Logon.7)` lines that exist nowhere in
the archive — at `Interface Server/InterfaceServer.pas:3195,3222` the equivalent calls are
**commented out**. The deployed build is therefore later than the archive.

So: cite the archive for *mechanism* (what an `except` block does, what a field holds), and the
**live log** for *behaviour*. When the two disagree, the log wins, and say so — the same evidence
hierarchy the [`rdo-conformity`](../rdo-conformity/SKILL.md) skill applies to the wire.

---

## 11. Gaps in `server-logs.ts` — suggestions only, do not implement from here

1. **`ClientsRow.exitCode` is a misnomer** and its failure rule is wrong. The field is the client
   executable's CRC (§7), not an exit status. `failures.push('Clients exit code N (expected 0)')`
   ([server-logs.ts:445](../../../src/tools/conformance/server-logs.ts#L445)) would fail a
   perfectly clean run the day our gateway starts sending `SetClientData`. Rename to `clientCrc`
   and drop the failure, or replace it with the real cleanliness test — that the `(1)`…`(11)`
   `DoLogOff` trace is complete.
2. **No parser for the `DoLogOff` step trace.** `(1)`…`(11)` is the only in-log evidence of *how far*
   a logoff got. A truncated trace is a stronger and much earlier distress signal than anything
   currently checked.
3. **Dated lines never get a clock.** `parseSurvival` leaves `at: null` for every
   `DateTimeToStr`-formatted line — i.e. the whole RDO error channel, 99 % of the 2026-08-18 file.
   Nothing that reasons over time can see them. A second regex accepting a leading `YYYY-MM-DD`
   would close it.
4. **No signature-density measure.** `fatalAnomalies` fires on the *first* match. The rate — matches
   per line, and whether the Model Server's own pushes are among them — is what separates "one bad
   frame" from "the dispatcher is gone" (§4), and it is not computed anywhere.
5. **No restart detector.** `GM Cannot connect to Server: dir.…` plus the `DA<n>` counter reset (§6,
   O3) would let a run state *"the server restarted mid-window"* instead of leaving a human to
   notice it.

Anything acted on here goes through the normal route: read the file, discuss, test, coverage.
