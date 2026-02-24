# RDO Protocol Architecture — Server & Client Perspectives

> **Source path:** `C:\Users\RobinALEMAN\Documents\SPO\SPO-Original\Rdo\`
> **Generated:** 2026-02-24 by delphi-archaeologist skill
> **Evidence confidence:** HIGH — all claims cite Delphi source line numbers
> **Variants:** 3 parallel implementations (`Rdo/`, `Rdo.IS/`, `Rdo.BIN/`) share identical structure; this doc references the base `Rdo/` variant.

## Overview

RDO (Remote Data Objects) is SPO's custom text-based RPC protocol. It exposes Delphi `published` members (properties, functions, procedures) over TCP sockets, using Delphi's RTTI (Run-Time Type Information) for dynamic dispatch. The protocol is **bidirectional** — both sides of a TCP connection can send queries and receive responses.

**Related docs:**
- [RDO Typing System (TypeScript API)](rdo_typing_system.md) — WebClient's type-safe builder classes
- [SPO-Original Reference Index](spo-original-reference.md) — Per-object RDO member tables
- [Building Details Protocol](building_details_protocol.md) — Building property queries

---

## 1. Protocol Fundamentals

### 1.1 Wire Framing

Messages are **semicolon-terminated text strings** over raw TCP. There are no length prefixes, no binary headers — just UTF-8/ANSI text delimited by `;`.

```
┌─────────────────────────────────────────────────────────┐
│ Frame = <MessageType> <SP> [<QueryId> <SP>] <Body> ";"  │
└─────────────────────────────────────────────────────────┘
```

| Field | Format | Required | Description |
|-------|--------|----------|-------------|
| MessageType | `C` or `A` | Yes | `C` = Call (query), `A` = Answer (response) |
| QueryId | Decimal integer (0–65535) | Only for `SendReceive` | Correlation ID for request-response matching |
| Body | Text | Yes | The RDO query or result |
| `;` | Literal semicolon | Yes | Frame terminator |

**Evidence:** `RDOProtocol.pas:47-48` — `CallID = 'C'`, `AnswerID = 'A'`; `RDOProtocol.pas:25` — `QueryTerm = ';'`

**Key behaviors:**
- Semicolons inside `"..."` literal delimiters are **not** treated as terminators [RDOUtils.pas:`KeyWordPos`, line 13]
- TCP stream reassembly: incoming data is appended to a buffer; `GetQueryText()` extracts complete `;`-terminated messages [RDOUtils.pas:469-482]
- Fire-and-forget calls (via `Send()`) omit the QueryId entirely: `C <body>;` [WinSockRDOConnection.pas:692-703]
- Synchronous calls (via `SendReceive()`) include the QueryId: `C <queryId> <body>;` [WinSockRDOConnection.pas:600-690]

### 1.2 Message Examples

```
Client → Server (synchronous get):
  C 17 sel 42 get Population;

Server → Client (response):
  A 17 Population="#1500000";

Client → Server (method call with return):
  C 23 sel 42 call RDOSetPrice "^" "#5","@3.14";

Server → Client (response):
  A 23 res="#1";

Client → Server (fire-and-forget, no QueryId):
  C sel 42 set Name="%Hello World";

Server → Client (push, no QueryId):
  C sel 100 call RefreshArea "^" "#10","#20","#5","#5";
```

### 1.3 Query Grammar

A query body follows this grammar:

```
Query       := <Sel> | <IdOf>
Sel         := "sel" <SP> <ObjectId> <SP> <SubCmd> { <SP> <SubCmd> }
SubCmd      := <Get> | <Set> | <Call>
Get         := "get" <SP> <PropName> { "," <PropName> }
Set         := "set" <SP> <PropName> "=" <Literal> { "," <PropName> "=" <Literal> }
Call        := "call" <SP> <MethodName> <SP> <ReturnMarker> { <SP> <Param> { "," <Param> } }
IdOf        := "idof" <SP> <Literal>
Literal     := '"' <TypePrefix> <Value> '"'
ReturnMarker := '"^"' | '"*"'
Param       := '"' <TypePrefix> <Value> '"'
```

**Evidence:** `RDOProtocol.pas:8-12` (commands), `RDOQueryServer.pas:76-179` (parser)

**Multiple sub-commands** can follow a single `sel`, and results are concatenated:

```
sel 42 get Name, get Population, call RDOGetStatus "^";
→ Name="%Shamba" Population="#1500000" res="#0"
```

### 1.4 Response Grammar

```
Response  := <Success> | <Error>
Success   := { <PropResult> | <CallResult> | <IdResult> }
PropResult := <PropName> "=" <Literal>
CallResult := "res" "=" <Literal> { <SP> "bref" <N> "=" <Literal> }
IdResult  := "objid" "=" <Literal>
Error     := "error" <SP> <ErrorCode>
```

**Evidence:** `RDOProtocol.pas:15-18` — `ResultVarName='res'`, `ByRefParName='bref'`, `ObjIdVarName='objid'`, `ErrorKeyWord='error'`

---

## 2. Type System

### 2.1 Type Prefixes

Every value in the protocol is prefixed with a single character identifying its type.

| Prefix | Constant | Delphi VarType(s) | Delphi Type(s) | Example |
|--------|----------|-------------------|----------------|---------|
| `#` | `OrdinalId` | `varSmallint, varInteger, varError, varBoolean, varByte` | `integer, wordbool, boolean, byte` | `#42`, `#-1` |
| `!` | `SingleId` | `varSingle` | `single` | `!3.14` |
| `@` | `DoubleId` | `varDouble, varDate, varCurrency` | `double, TDateTime, currency` | `@3.14159` |
| `$` | `StringId` | `varString` | `string` (short/Ansi) | `$ID123` |
| `%` | `OLEStringId` | `varOleStr` | `widestring` | `%Hello World` |
| `^` | `VariantId` | `varVariant` | by-reference parameter | `^` |
| `*` | `VoidId` | `varEmpty` | void (procedure) | `*` |

**Evidence:** `RDOProtocol.pas:29-35`, `RDOUtils.pas:319-393` (serialization/deserialization)

### 2.2 Boolean Encoding

Delphi `wordbool` and `boolean` values are marshaled as ordinals:

| Value | Wire Encoding | Notes |
|-------|---------------|-------|
| `true` | `#-1` | Delphi OLE convention: `true = -1` (all bits set) |
| `false` | `#0` | Standard zero |

**TRAP:** Using `#1` for `true` will NOT work correctly in Delphi — it must be `#-1`.

### 2.3 String Escaping

Double-quote characters (`"`) inside string values are escaped by doubling:

```
Input:  Hello "World"
Encoded: %Hello ""World""
Wire:   "%Hello ""World"""
```

**Evidence:** `RDOUtils.pas:246-264` — `RDOStrEncode` doubles `"`, `RDOStrDecode` collapses `""` pairs.

### 2.4 By-Reference Parameters

The `^` prefix marks a by-reference parameter slot. The called method can write a value back into this slot:

```
Call:     call SomeMethod "^" "#5","^";
                                  ↑ by-ref param (empty slot)
Response: res="#1" bref1="%output_value";
                   ↑ by-ref result filled by the method
```

Memory is allocated for each `^` param (`GetMem` for a variant pointer) and freed after the result is read back [RDOQueryServer.pas:441-468].

---

## 3. Server Architecture

### 3.1 Component Stack

```
┌──────────────────────────────────────────────────────┐
│  TRDOServer (RDOServer.pas)                          │
│  ┌──────────────────────────────────────────────────┐│
│  │ TRDOObjectsRegistry — name→ID mapping            ││
│  ├──────────────────────────────────────────────────┤│
│  │ TRDOQueryServer (RDOQueryServer.pas)              ││
│  │   Parses text → dispatches to:                    ││
│  │ ┌──────────────────────────────────────────────┐ ││
│  │ │ TRDOObjectServer (RDOObjectServer.pas)        │ ││
│  │ │   RTTI-based dispatch:                        │ ││
│  │ │   • GetProperty — GetPropInfo() → GetOrdProp  │ ││
│  │ │   • SetProperty — GetPropInfo() → SetOrdProp  │ ││
│  │ │   • CallMethod  — MethodAddress() → x86 ASM   │ ││
│  │ └──────────────────────────────────────────────┘ ││
│  ├──────────────────────────────────────────────────┤│
│  │ TWinSockRDOConnection (transport layer)           ││
│  │   Thread pool of TQueryThread workers             ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

### 3.2 Object Registration

At server startup, Delphi objects are registered by name and memory address:

```delphi
// InterfaceServer.pas:2630
fClientsRDO.RegisterObject( 'InterfaceServer', integer(self) );

// InterfaceServer.pas:2670
fDAEventsRDO.RegisterObject( 'InterfaceEvents', integer(fModelEvents) );
```

**The ObjectId IS the raw memory address** of a Delphi `TObject`, cast to `integer`. There is no indirection table — the integer IS a pointer. [RDOServer.pas:107-110, RDOObjectRegistry.pas]

| Well-Known Hook Name | Class | Server | Protocol.pas Constant |
|---------------------|-------|--------|----------------------|
| `'DirectoryServer'` | `TDirectoryServer` | Directory Server | `tidRDOHook_DirectoryServer` |
| `'InterfaceServer'` | `TInterfaceServer` | Interface Server | `tidRDOHook_InterfaceServer` |
| `'InterfaceEvents'` | `TModelEvents` | Interface Server (events port) | `tidRDOHook_InterfaceEvents` |
| `'SessionServer'` | `TSessionServer` | Interface Server (client port + 1) | `tidRDOHook_SessionServer` |
| `'SessionEvents'` | (client-side handler) | Client | `tidRDOHook_SessionEvents` |

### 3.3 Query Dispatch Flow

When a query arrives:

```
1. Socket thread receives TCP data
2. Append to buffer, extract complete ";" messages via GetQueryText()
3. Strip 'C' prefix, extract QueryId
4. Queue to TQueryThread worker pool
5. Worker calls TRDOQueryServer.ExecQuery(queryText, connId)
6. ExecQuery parses:
   a. Optional priority char → SetThreadPriority()
   b. "sel <ObjectId>" → cast integer to TObject pointer
   c. For each sub-command:
      "get <Name>"  → TRDOObjectServer.GetProperty()
      "set <Name>"  → TRDOObjectServer.SetProperty()
      "call <Name>" → TRDOObjectServer.CallMethod()
      "idof <Name>" → TRDOObjectServer.GetIdOf()
7. Format response: "<QueryId> <Result>;"
8. Prepend 'A' prefix, send back on same socket
```

**Evidence:** `RDOQueryServer.pas:76-179` (ExecQuery), `WinSockRDOConnection.pas:705-813` (DoRead)

### 3.4 RTTI Dispatch (RDOObjectServer.pas)

#### GetProperty (line 67)

```
1. theObject := TObject(ObjectId)     — raw pointer cast
2. Lock global critical section
3. thePropInfo := GetPropInfo(theObject.ClassInfo, PropName)
4. IF property found:
   - tkInteger/tkChar/tkEnum → GetOrdProp()
   - tkString/tkWString      → GetStrProp()
   - tkFloat                 → GetFloatProp()
   - tkVariant               → GetVariantProp()
5. IF property NOT found:
   ⚠️ FALLS THROUGH to CallMethod(same name)
6. Unlock
```

**CRITICAL: GET fallthrough** — When `GetPropInfo` returns nil, `GetProperty` silently falls through to `CallMethod` with the same name. This means `get SomeFunction` works on published functions (by accident), but is **semantically wrong**. [RDOObjectServer.pas:112-116]

#### SetProperty (line 129)

```
1. theObject := TObject(ObjectId)
2. Lock global critical section
3. thePropInfo := GetPropInfo(theObject.ClassInfo, PropName)
4. IF property found:
   - SetOrdProp / SetStrProp / SetFloatProp / SetVariantProp
5. IF NOT found → errUnexistentProperty (NO fallthrough)
6. Unlock
```

**SetProperty does NOT fall through** to CallMethod, unlike GetProperty. [RDOObjectServer.pas:176]

#### CallMethod (line 190)

```
1. theObject := TObject(ObjectId)
2. MethodAddr := theObject.MethodAddress(MethodName)   — Delphi RTTI lookup
3. IF nil → errUnexistentMethod
4. Lock variant array of Params
5. Check for ILockObject interface on target, acquire if available
6. Lock global critical section
7. InterlockedIncrement(RDOCallCounter)
8. x86 INLINE ASSEMBLY dispatch:
   - EAX = Self (object pointer)
   - EDX = first param or result pointer
   - ECX = second param or result pointer
   - Stack = remaining params (doubles/singles always on stack)
   - CALL MethodAddr
9. Post-call: detect if critical section was mutated (safety check)
10. Unlock all, release variant array
```

**Evidence:** `RDOObjectServer.pas:190-332` — includes full x86 `asm` block for register allocation.

### 3.5 Thread Safety Model

**Two-level locking:**

| Level | Mechanism | Scope | Evidence |
|-------|-----------|-------|----------|
| Global | `fCriticalSection` on `TRDOObjectServer` | All RDO operations | `RDOObjectServer.pas:79` |
| Per-Object | `ILockObject` interface (optional) | Individual target objects | `RDOObjectServer.pas:88-91` |

Lock ordering: **Global first, then per-object** (inside global lock).

**Atomic call counter:** `Windows.InterlockedIncrement(RDOCallCounter)` provides a monotonic sequence number for debugging [RDOObjectServer.pas:231].

### 3.6 Thread Priority

Queries can carry a priority hint character, parsed before the `sel` command:

| Char | Constant | Windows Priority | Evidence |
|------|----------|-----------------|----------|
| `N` | `NormPrio` | `THREAD_PRIORITY_NORMAL` | `RDOProtocol.pas:38` |
| `A` | `AboveNormPrio` | `THREAD_PRIORITY_ABOVE_NORMAL` | `:39` |
| `B` | `BelowNormPrio` | `THREAD_PRIORITY_BELOW_NORMAL` | `:40` |
| `H` | `HighestPrio` | `THREAD_PRIORITY_HIGHEST` | `:41` |
| `I` | `IdlePrio` | `THREAD_PRIORITY_IDLE` | `:42` |
| `L` | `LowestPrio` | `THREAD_PRIORITY_LOWEST` | `:43` |
| `C` | `TimeCritPrio` | `THREAD_PRIORITY_TIME_CRITICAL` | `:44` |

**Default:** If no priority char is present, the worker thread defaults to `THREAD_PRIORITY_HIGHEST` [RDOQueryServer.pas:107].

---

## 4. Client Architecture

### 4.1 Component Stack

```
┌──────────────────────────────────────────────────────┐
│  Application Code (e.g., Voyager)                     │
│     uses late-bound IDispatch calls                   │
│  ┌──────────────────────────────────────────────────┐│
│  │ TRDOObjectProxy (RDOObjectProxy.pas)              ││
│  │   COM IDispatch → marshaling                      ││
│  │ ┌──────────────────────────────────────────────┐ ││
│  │ │ RDOMarshalers.pas                             │ ││
│  │ │   Builds protocol text strings                │ ││
│  │ │ ┌──────────────────────────────────────────┐ │ ││
│  │ │ │ TWinSockRDOConnection                     │ │ ││
│  │ │ │   TCP socket transport                    │ │ ││
│  │ │ │   Query ID correlation                    │ │ ││
│  │ │ │   Win32 event-based blocking              │ │ ││
│  │ │ └──────────────────────────────────────────┘ │ ││
│  │ └──────────────────────────────────────────────┘ ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

### 4.2 TRDOObjectProxy — COM/IDispatch Proxy

The proxy uses COM's `IDispatch` interface for late-bound calls. Method names are resolved dynamically at runtime. [RDOObjectProxy.pas:17-57]

**Key fields:**
- `fObjectId: integer` — currently bound server object ID
- `fRDOConnection: IRDOConnection` — transport connection
- `fTimeOut: integer` — default 60000ms
- `fWaitForAnswer: boolean` — fire-and-forget vs synchronous
- `fPriority: integer` — thread priority hint
- `fDispIds: TStringList` — name-to-DispID cache

**Built-in dispatch IDs (DispID 1001-1009):**

| DispID | Name | Purpose |
|--------|------|---------|
| 1001 | `BindTo` | Bind proxy to server object (by name or ID) |
| 1002 | `SetConnection` | Assign transport connection |
| 1003 | `WaitForAnswer` | Get/set synchronous mode |
| 1004 | `TimeOut` | Get/set timeout |
| 1005 | `Priority` | Get/set priority |
| 1006 | `ErrorCode` | Get last error code |
| 1009 | `RemoteObjectId` | Get current object ID |

**Remote dispatch (DispID ≥ 1010):** All other names are assumed to be remote server methods/properties.

**Routing logic in `Invoke()` (line 228):**

| COM Flags | Condition | Action |
|-----------|-----------|--------|
| `DISPATCH_PROPERTYGET` + 0 args | Property read | `MarshalPropertyGet(objectId, name, conn, ...)` |
| `DISPATCH_METHOD` | Method call | `MarshalMethodCall(objectId, name, params, conn, ...)` |
| Not METHOD + 1 named arg = PROPERTYPUT | Property write | `MarshalPropertySet(objectId, name, value, conn, ...)` |

### 4.3 Marshaling Layer (RDOMarshalers.pas)

Four functions build protocol strings from typed parameters:

#### MarshalPropertyGet (line 122)

```
Input:  objectId=42, propName="Population"
Output: "sel 42 get Population;"
→ SendReceive → parse "Population=""#1500000"""
→ GetVariantFromStr("#1500000") → integer 1500000
```

#### MarshalPropertySet (line 159)

```
Input:  objectId=42, propName="Name", value="Hello"
Output: "sel 42 set Name=""%Hello"";"
→ SendReceive (if timeout > 0) or Send (fire-and-forget)
```

#### MarshalMethodCall (line 194)

```
Input:  objectId=42, method="RDOSetPrice", params=[int(5), double(3.14)], expectReturn=true
Output: "sel 42 call RDOSetPrice ""^"" ""#5"",""@3.14"";"

Return marker: "^" = expects return value, "*" = void (no return)
```

After the call, by-ref results are extracted from `bref1=`, `bref2=`, etc. in the response. [RDOMarshalers.pas:289-313]

#### MarshalObjIdGet (line 321)

```
Input:  objectName="World"
Output: "idof ""World"";"
→ parse "objid=""#12345"""
→ return integer 12345
```

### 4.4 Transport Layer (WinSockRDOConnection.pas)

**Architecture:** Non-blocking sockets with a dedicated Windows message loop thread.

```
┌─────────────────────────────────────────────┐
│ Calling Thread (Application)                 │
│   SendReceive() blocks on Win32 Event        │
├─────────────────────────────────────────────┤
│ TMsgLoopThread (Windows Message Loop)        │
│   Handles async socket events:               │
│   • OnConnect → signal ConnectionEvent       │
│   • OnRead (DoRead) → correlate QueryId      │
│   • OnDisconnect → fire callback             │
│   • OnError → suppress + log                 │
└─────────────────────────────────────────────┘
```

**Default port:** 5000 [WinSockRDOConnection.pas:132]

**Query correlation:** Each synchronous query gets a unique 16-bit cycling ID (0–65535). A `TQueryToSend` record tracks:

```delphi
TQueryToSend = record
  Id          : word;       // Unique query ID
  Text        : string;     // Query text
  WaitForAnsw : boolean;    // Synchronous?
  Result      : string;     // Response (filled by DoRead)
  Event       : THandle;    // Win32 event signaled on response arrival
  ErrorCode   : integer;    // Error code
end;
```

**Evidence:** `WinSockRDOConnection.pas:147-157`

**Send path:**
1. Allocate `TQueryToSend` with cycling ID
2. Create Win32 event
3. Add to `fSentQueries` list
4. Send over TCP: `"C " + IntToStr(Id) + " " + QueryText`
5. `WaitForMultipleObjects(Event, TerminateEvent, timeout)`
6. On wakeup: read `Result` and `ErrorCode`

**Receive path (DoRead, line 705):**
1. Append incoming data to `fReceivedText` buffer
2. Loop: `GetQueryText(fReceivedText)` extracts complete `;` messages
3. First char = `A` → response: find matching query by ID in `fSentQueries`, copy result, signal event
4. First char = `C` → incoming call (push): enqueue for worker thread processing

**No automatic reconnection.** On disconnect, the caller must explicitly re-call `Connect()`. [WinSockRDOConnection.pas:570-574]

### 4.5 Connection Pool (RDOConnectionPool.pas)

Optional pooling with least-loaded selection:

```delphi
TRDOConnectionPool.GetConnection → returns connection with minimum fRefCount
```

Each connection tracks `fRefCount` (number of proxies using it) and `fTimeOuts` (timeout counter, tracked but unused). [RDOConnectionPool.pas:78-120]

---

## 5. Session Management

### 5.1 Object ID Resolution

There are two mechanisms for resolving object IDs:

| Mechanism | Command | When Used |
|-----------|---------|-----------|
| Name resolution | `idof "ObjectName"` | Well-known server objects (e.g., `"DirectoryServer"`, `"InterfaceServer"`) |
| Direct ID | `sel <integer>` | Dynamic objects (e.g., `TClientView` returned by `Logon()`) |

**`BindTo` on the proxy (DispID 1001):** Accepts either a string (→ `idof`) or integer (→ direct). [RDOObjectProxy.pas:256-292]

**Special built-in:** `get RDOCnntId` returns the server-side connection ID for the current socket — this is handled directly in `TRDOQueryServer.GetCommand` without touching the object server [RDOQueryServer.pas:269].

### 5.2 Complete Login Sequence

```
┌─────────────┐        ┌──────────────────┐        ┌──────────────┐
│   Client     │        │ Interface Server  │        │ Model Server │
│  (Voyager)   │        │    (IS)           │        │    (MS)      │
└──────┬───────┘        └────────┬─────────┘        └──────┬───────┘
       │                         │                          │
  1. Connect TCP ──────────────►│                          │
       │                         │                          │
  2. idof "InterfaceServer" ───►│                          │
       │◄── objid=<ISId> ───────│                          │
       │                         │                          │
  3. sel <ISId> get WorldName ─►│                          │
       │◄── WorldName="%Shamba" │                          │
       │                         │                          │
  4. sel <ISId> call            │                          │
     AccountStatus "^"          │                          │
     "%user","%pass" ─────────►│                          │
       │◄── res="#0" ───────────│ (0 = ACCOUNT_Valid)      │
       │                         │                          │
  5. sel <ISId> call            │                          │
     Logon "^" "%user","%pass" ►│                          │
       │                         │── RDOGetTycoon ────────►│
       │                         │◄── tycoon proxy ────────│
       │◄── res="#<CVId>" ──────│ (CVId = TClientView ptr) │
       │                         │                          │
  6. sel <CVId> get TycoonId ──►│                          │
       │◄── TycoonId="#123" ────│                          │
       │                         │                          │
  7. sel <CVId> get RDOCnntId ─►│                          │
       │◄── RDOCnntId="#7" ─────│ (connection ID)          │
       │                         │                          │
  8. Register local              │                          │
     'InterfaceEvents' handler   │                          │
     (TRDOServer on same socket) │                          │
       │                         │                          │
  9. sel <CVId> call             │                          │
     RegisterEventsById "^"      │                          │
     "#7" ─────────────────────►│                          │
       │                         │  Creates push proxy      │
       │                         │  bound to client's       │
       │◄── PUSH: InitClient ───│  'InterfaceEvents' hook  │
       │◄── PUSH: NewMail ──────│                          │
       │◄── res="#0" ───────────│                          │
       │                         │                          │
 10. sel <CVId> call             │                          │
     SetViewedArea "^"           │                          │
     "#x","#y","#dx","#dy" ────►│                          │
       │                         │                          │
       │ ── game loop ──────────│                          │
       │                         │                          │
```

**Evidence:**
- `Logon()`: `InterfaceServer.pas:3179-3294` — creates `TClientView`, returns `integer(ClientView)`
- `RegisterEventsById()`: `InterfaceServer.pas:1891` — creates push proxy, sends `InitClient`
- Login sequence: reconstructed from Voyager's `ServerCnxHandler.pas` URL handler flow

### 5.3 Directory Server Session

The Directory Server uses a separate session pattern — `RDOOpenSession` returns a `TDirectorySession` object ID:

```
Client → DS: idof "DirectoryServer"        → objid=<DSId>
Client → DS: sel <DSId> call RDOOpenSession → res=#<SessionId>
Client → DS: sel <SessionId> call RDOLogonUser "%user","%pass" → res=#0
Client → DS: sel <SessionId> call RDOEndSession
```

**Evidence:** `DServer/DirectoryServer.pas:143` (`RDOOpenSession`), `:1452` (creates `TDirectorySession`), `:92` (`RDOLogonUser`), `:31` (`RDOEndSession`)

---

## 6. Push Mechanism (Server → Client)

### 6.1 Architecture: Bidirectional RDO

The push system reuses the **same TCP connection** the client established. Both sides run RDO servers:

```
┌─────────────────────────────────────────────────────────────┐
│                   Single TCP Socket                          │
│                                                              │
│  Client Side                    │     Server Side            │
│  ┌────────────────────────┐    │  ┌────────────────────┐    │
│  │ TRDOObjectProxy        │◄───┤──│ TRDOServer          │    │
│  │ (sends queries to IS)  │    │  │ (IS query handler)  │    │
│  ├────────────────────────┤    │  ├────────────────────┤    │
│  │ TRDOServer             │────┤►─│ TRDOObjectProxy     │    │
│  │ (receives pushes)      │    │  │ (sends pushes)      │    │
│  │ Hook: 'InterfaceEvents'│    │  │ fClientEventsProxy   │    │
│  └────────────────────────┘    │  └────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Setup flow:**
1. Client creates `TRDOServer` on its existing IS connection
2. Client registers its events handler under `'InterfaceEvents'` hook name
3. Client calls `RegisterEventsById(ConnectionId)` on its `TClientView`
4. IS creates `TRDOObjectProxy` on the client's connection, bound to `'InterfaceEvents'`
5. IS calls methods on this proxy → they travel as `C` messages to the client

**Evidence:** `InterfaceServer.pas:1891` — `RegisterEventsById` creates `fClientEventsProxy` and calls `BindTo('InterfaceEvents')`

### 6.2 Push Event Chain

```
Model Server ──[RDO call]──► TModelEvents (on IS events port)
    ──► TInterfaceServer method (acquires lock, iterates clients)
        ──► TClientView method (checks: connected? events enabled? in viewport?)
            ──► fClientEventsProxy.{Method}(args)  (RDO call back to client)
```

### 6.3 Push Events (Client-Side Interface)

These are the published methods the IS calls on the client's `'InterfaceEvents'` handler:

| Push Method | Parameters | Trigger | Filter |
|-------------|------------|---------|--------|
| `InitClient` | `(Date: TDateTime, Money: widestring, FailureLevel: integer, TycoonId: integer)` | After `RegisterEventsById` | Target client only |
| `RefreshArea` | `(x, y, dx, dy: integer, ExtraInfo: widestring)` | Building placed/demolished | Viewport intersection test |
| `RefreshObject` | `(ObjId, KindOfChange: integer, ExtraInfo: widestring)` | Focused facility state change | Client must have called `FocusObject(Id)` |
| `RefreshTycoon` | `(Money, NetProfit: widestring, Ranking, FacCount, FacMax: integer)` | Period end | Target tycoon's client only |
| `RefreshDate` | `(Date: TDateTime)` | Game time advance | Broadcast to all |
| `RefreshSeason` | `(Season: integer)` | Season change (0–3) | Broadcast to all |
| `EndOfPeriod` | `(FailureLevel: integer)` | Economic period end | Broadcast to all |
| `TycoonRetired` | `(FailureLevel: integer)` | Bankruptcy | Target client only |
| `ChatMsg` | `(From, Msg: widestring)` | Chat message | Channel members |
| `NewMail` | `(MsgCount: integer)` | New mail arrived | Target client only |
| `MoveTo` | `(x, y: integer)` | Server commands viewport move | Target client only |
| `ShowNotification` | `(Kind: integer, Title, Body: widestring, Options: integer)` | Server notification | Target tycoon via `GetClientByTycoonId` |
| `ModelStatusChanged` | `(Status: integer)` | Server busy/not busy/error | Broadcast to all |
| `NotifyCompanionship` | `(Names: widestring)` | Users viewing same area | Target client only |
| `AnswerStatus` | `()` → returns `OleVariant` | Heartbeat/alive check | Target client only |

**Evidence:** `InterfaceServer.pas:541-559` (TModelEvents), Protocol.pas push interface (lines 196-222)

### 6.4 Push Filtering Rules

| Event | Filter Logic | Evidence |
|-------|-------------|----------|
| `RefreshArea` | `IntersectRect(clientViewport, dirtyArea)` — only pushed if viewports overlap | `InterfaceServer.pas:4873` |
| `RefreshObject` | Only if `ObjId ∈ client.fFocused` (client called `FocusObject`) | `InterfaceServer.pas:4885` |
| `RefreshObject` (orphan) | If NO client has the object focused → IS tells MS to release: `WorldProxy.RDOFacilityLostFocus(ObjId)` | `InterfaceServer.pas:3637` |
| `RefreshTycoon` | Per-client, using own tycoon data | `InterfaceServer.pas:4897` |
| All date/season/period | Broadcast to all connected clients with `fEnableEvents = true` | Various |

---

## 7. Error Handling

### 7.1 Error Codes

| Code | Constant | Meaning | Typical Cause |
|------|----------|---------|---------------|
| 0 | `errNoError` | Success | — |
| 1 | `errMalformedQuery` | Syntax error in query text | Invalid command, missing separator |
| 2 | `errIllegalObject` | Object pointer is invalid/nil | Stale object ID, freed object |
| 3 | `errUnexistentProperty` | Property not found on object | Typo in property name |
| 4 | `errIllegalPropValue` | Value type mismatch for property | Wrong type prefix |
| 5 | `errUnexistentMethod` | Published method not found | Typo in method name, method not published |
| 6 | `errIllegalParamList` | Wrong parameter count or types | Missing/extra params |
| 7 | `errIllegalPropType` | Property type not supported by RDO | e.g., `tkClass` property |
| 8 | `errQueryTimedOut` | Response not received within timeout | Server too busy, network issue |
| 9 | `errIllegalFunctionRes` | Return value cannot be serialized | Non-variant return type |
| 10 | `errSendError` | TCP send failure | Socket closed |
| 11 | `errReceiveError` | TCP receive failure | Socket closed |
| 12 | `errMalformedResult` | Response string is unparseable | Corrupted response |
| 13 | `errQueryQueueOverflow` | Server query queue is full | Server overloaded |
| 14 | `errRDOServerNotInitialized` | Server not started | Push to uninitialized client |
| 15 | `errUnknownError` | Catch-all | Internal server error |
| 16 | `errNoResult` | Empty response | Server returned nothing |
| 17 | `errServerBusy` | Server in busy state | Maintenance, shutdown |

**Evidence:** `ErrorCodes.pas:6-23`

**Wire format:** Errors are returned as `error <code>` (e.g., `error 5`). The `CreateErrorMessage` function produces this string [ErrorCodes.pas:32-38].

### 7.2 Server-Side Error Handling

- Access violations from bad ObjectIds are caught by `try/except` in `GetProperty`/`SetProperty`/`CallMethod` → returns `errIllegalObject` [RDOObjectServer.pas:118-126]
- The CallMethod assembly dispatch has a post-call safety check: if the called method mutated `fCriticalSection`, it is restored to the saved reference [RDOObjectServer.pas:302-312]
- Socket errors are suppressed in `HandleError` (ErrorCode set to 0) to prevent Delphi socket exceptions from propagating [WinSockRDOConnection.pas:816-851]

### 7.3 Client-Side Error Handling

- `SendReceive` returns error code from `TQueryToSend.ErrorCode` or `errQueryTimedOut` if the wait timed out
- Orphaned responses (no matching QueryId in `fSentQueries`) are silently dropped [WinSockRDOConnection.pas:707-748 — `FindQuery` returns nil]
- Connection loss fires `OnDisconnect` callback; no automatic reconnection

---

## 8. Behavioral Edge Cases & Gotchas

### 8.1 GET Fallthrough (Critical)

`GetProperty` falls through to `CallMethod` when no published property is found. This means:

```
get SomeFunction     ← works (calls the function via fallthrough)
call SomeFunction    ← also works (direct method call)
```

Both produce the same result, but `get` on a function is **semantically wrong**. The WebClient should always use `call` for published functions and `get`/`set` only for published properties.

**Evidence:** `RDOObjectServer.pas:112-116`

### 8.2 SET Has No Fallthrough

Unlike `get`, `set` on a non-existent property returns `errUnexistentProperty`. It does NOT fall through to `CallMethod`.

**Evidence:** `RDOObjectServer.pas:176`

### 8.3 Boolean True = -1

Delphi `wordbool` true = -1 (all bits set, 0xFFFF), NOT 1. Sending `#1` may cause unexpected behavior.

### 8.4 Doubles and Singles Always on Stack

The x86 assembly dispatch pushes floating-point parameters onto the stack even when CPU registers are available. Registers are only used for integer/pointer parameters.

**Evidence:** `RDOObjectServer.pas:257-265`

### 8.5 Fire-and-Forget Has No Query ID

`Send()` omits the query ID: `C <body>;`. The server processes it but sends no response. The client cannot detect errors from fire-and-forget calls.

### 8.6 Channel Codec Never Implemented

`RDOChannelCodec.pas` was planned for query compression/aliasing but was never completed. `EncodeQuery` has an empty body. All queries travel as plaintext.

**Evidence:** `RDOChannelCodec.pas:55-71`

### 8.7 Priority Default is HIGHEST

When no priority character is present in the query, the server defaults to `THREAD_PRIORITY_HIGHEST`, not normal. This was an intentional change noted in a comment: "Priority changed by Cepero."

**Evidence:** `RDOQueryServer.pas:107`

---

## 9. RDO Variant Comparison (Three Implementations)

The SPO codebase contains three parallel RDO implementations:

| Directory | Used By | Key Differences |
|-----------|---------|-----------------|
| `Rdo/` | Base implementation | Standard text protocol |
| `Rdo.IS/` | Interface Server | Specialized for IS thread pool (`ISMaxThreads=24`) |
| `Rdo.BIN/` | [UNKNOWN] | Has `RDOQueries.pas`, `RDOVariantUtils.pas`, thread cache experiments |

All three share identical file structure (`Client/`, `Server/`, `Common/`) and the same protocol format. The differences are in threading optimizations and configuration, not protocol syntax.

---

## 10. Quick Reference: Protocol Syntax Cheat Sheet

```
┌─────────────────────────────────────────────────────────────┐
│  VERBS                                                       │
│  sel <ObjectId>               Select object by numeric ID    │
│  idof "<ObjectName>"          Resolve name → numeric ID      │
│  get <PropName>               Read published property        │
│  set <PropName>="<value>"     Write published property       │
│  call <Method> "<ret>" <args> Call published method          │
│                                                              │
│  TYPE PREFIXES                                               │
│  #  integer      !  single     @  double                     │
│  $  short string %  widestring ^  variant/by-ref  *  void    │
│                                                              │
│  FRAMING                                                     │
│  C <queryId> <body>;          Client → Server (synchronous)  │
│  C <body>;                    Client → Server (fire-forget)  │
│  A <queryId> <result>;        Server → Client (response)     │
│  C <body>;                    Server → Client (push)         │
│                                                              │
│  RESPONSE VARIABLES                                          │
│  res=<value>                  Method return value             │
│  objid=<value>                Object ID from idof            │
│  bref1=<value>                By-reference param 1 result    │
│  error <code>                 Error (codes 0-17)             │
│                                                              │
│  SEPARATORS                                                  │
│  =     name-value separator                                  │
│  "     string literal delimiter (escape: "")                 │
│  ,     parameter delimiter                                   │
│  ;     query terminator (frame delimiter)                    │
│  ' '   field separator                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Open Questions

- [ ] `Rdo.BIN/` — Was the binary variant ever deployed in production? Does it use a different wire format?
- [ ] Thread pool sizing — What is the actual `MaxQueryThreads` value used by each server in production?
- [ ] `RDOChannelCodec.pas` — Was there a production plan for query compression, or was it abandoned early?
- [ ] [NEEDS INVESTIGATION] Voice protocol details — The `VoiceMsg`, `VoiceRequest`, `VoiceTxOver` push events suggest a real-time voice system, but the implementation details are in `Utils/Voice/` which was not investigated.
