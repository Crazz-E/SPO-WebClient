# SPO-Original Delphi Reference Index

> **Source path:** See `delphi-archaeologist` skill for current codebase path
>
> Pre-indexed reference for RDO conformity checking. Consult this before implementing any RDO request.
> The 8-step conformity checklist is in the `rdo-protocol` skill (auto-loads for RDO work).

## RDO Dispatch Rules (from RDOObjectServer.pas)

| Delphi declaration | RDO verb | Separator | Response |
|--------------------|----------|-----------|----------|
| `published property Foo : type read Get write Set` | `get` / `set` | *(none)* | `res=<prefix><value>` |
| Synchronous call (with RID, expects response) | `call` | `^` (VariantId) | `res=<prefix><value>` or `res=*` |
| Fire-and-forget (no RID, no response expected) | `call` | `*` (VoidId) | *(no response)* |

**Separator rule:** The `^` vs `*` separator does NOT distinguish function/procedure or parameterized/parameterless.
Both separators parse parameters identically (RDOQueryServer.pas:425-454). The separator controls
whether the server captures the return value (`^`) or discards it (`*`). Using `^` without a RID
crashes the Delphi server — it tries to route a response to a non-existent query.
Live capture confirms: `RDODisconnectInput "*" "%Plastics","%706,436,"` (params after `*`).

**TRAP:** `get` on a `function` works (falls through to `CallMethod` at line 115 of RDOObjectServer.pas) but is **semantically wrong** and may behave differently under edge cases.

## Delphi Type -> RDO Prefix Mapping

| Delphi type | RDO prefix | Example | Notes |
|-------------|-----------|---------|-------|
| `integer` | `#` | `#42` | Ordinal |
| `wordbool` / `boolean` | `#` | `#-1` (true), `#0` (false) | Delphi `true` = -1 |
| `widestring` | `%` | `%Hello` | OLE string |
| `double` / `TDateTime` | `@` | `@3.14159` | 8-byte float |
| `single` | `!` | `!3.14` | 4-byte float |
| `currency` | `@` | `@123.45` | Stored as double |
| `string` (short) | `$` | `$ID` | Short string |
| `olevariant` (return) | varies | depends on content | Auto-marshaled |
| *(void / procedure)* | `*` | `*` | No return value |

## RDO Error Codes (ErrorCodes.pas)

| Code | Constant | Meaning |
|------|----------|---------|
| 0 | `errNoError` | Success |
| 1 | `errMalformedQuery` | Bad query syntax |
| 2 | `errIllegalObject` | Invalid object ID |
| 3 | `errUnexistentProperty` | Property not found |
| 5 | `errUnexistentMethod` | Method not found |
| 6 | `errIllegalParamList` | Wrong parameters |
| 8 | `errQueryTimedOut` | Timeout |
| 17 | `errServerBusy` | Server busy |

---

## TDirectoryServer (DServer/DirectoryServer.pas:136)

**Resolved via:** `idof "DirectoryServer"`

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `RDOOpenSession` | function | `get` | `()` | `#sessionId` | 143 | Returns TDirectorySession object ID. Zero-arg function — legacy Voyager sends `get` via COM late-binding (server GET fallthrough dispatches to function). Response format: `RDOOpenSession="#id"` |

## TDirectorySession (DServer/DirectoryServer.pas:15)

**Resolved via:** Object ID returned from `RDOOpenSession`

### Core session

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `RDOEndSession` | procedure | `call` | `()` | void | 31 | Decrements refcount |
| `RDOCurrentKey` | property | `get`/`set` | widestring | `%path` | 33 | Read/write current directory key |
| `RDOGetCurrentKey` | function | `call` | `()` | `%path` | 35 | |
| `RDOSetCurrentKey` | function | `call` | `(%FullPathKey)` | olevariant | 36 | |
| `KeepAlive` | procedure | `call` | `()` | void | 123 | Heartbeat |

### Authentication & account

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `RDOLogonUser` | function | `call` | `(%Alias, %Password)` | `#errorCode` | 92 | 0=success |
| `RDOMapSegaUser` | function | `call` | `(%Alias)` | olevariant | 93 | |
| `RDOGenAccountId` | function | `call` | `(#FamilyId)` | olevariant | 87 | |
| `RDONewUserId` | function | `call` | `(%Alias, %Password, %AccountId, #FamilyId)` | olevariant | 91 | |
| `RDOIsValidAlias` | function | `call` | `(%Alias)` | olevariant | 112 | |
| `RDOGetAliasId` | function | `call` | `(%Alias)` | olevariant | 113 | |
| `RDOGetUserPath` | function | `call` | `(%Alias)` | olevariant | 114 | |
| `RDOCanJoinNewWorld` | function | `call` | `(%Alias)` | olevariant | 116 | |
| `RDOGenSessionKey` | function | `call` | `(#len)` | olevariant | 118 | |
| `RDOEncryptText` | function | `call` | `(%text)` | olevariant | 119 | |

### Registry operations (key/value store)

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `RDOCreateFullPathKey` | function | `call` | `(%FullPathKey, #ForcePath)` | olevariant | 38 | ForcePath is wordbool |
| `RDOCreateKey` | function | `call` | `(%KeyName)` | olevariant | 39 | |
| `RDOFullPathKeyExists` | function | `call` | `(%FullPathKey)` | olevariant | 41 | |
| `RDOKeyExists` | function | `call` | `(%KeyName)` | olevariant | 42 | |
| `RDOKeysCount` | function | `call` | `()` | olevariant | 44 | |
| `RDOValuesCount` | function | `call` | `()` | olevariant | 45 | |
| `RDOGetKeyNames` | function | `call` | `()` | olevariant | 47 | Returns `<nothing>` if not secure |
| `RDOGetValueNames` | function | `call` | `()` | olevariant | 48 | Returns `<empty>` if not secure |
| `RDOQueryKey` | function | `call` | `(%FullKeyName, %ValueNameList)` | `%resultBlock` | 83 | Multi-line result, tab-separated |
| `RDOSearchKey` | function | `call` | `(%SearchPattern, %ValueNameList)` | olevariant | 84 | |
| `RDODeleteFullPathNode` | function | `call` | `(%FullPathNode)` | olevariant | 71 | |
| `RDODeleteNode` | function | `call` | `(%NodeName)` | olevariant | 72 | |

### Read/Write typed values

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `RDOReadString` | function | `call` | `(%Name)` | `%value` | 63 | Returns `''` on exception |
| `RDOReadInteger` | function | `call` | `(%Name)` | `#value` | 61 | Returns `0` on exception |
| `RDOReadBoolean` | function | `call` | `(%Name)` | olevariant | 60 | Returns `false` on exception |
| `RDOReadFloat` | function | `call` | `(%Name)` | olevariant | 62 | Returns `0` on exception |
| `RDOReadDate` | function | `call` | `(%Name)` | olevariant | 64 | Returns `0` on exception |
| `RDOReadDateAsStr` | function | `call` | `(%Name)` | olevariant | 65 | Returns `''` on exception |
| `RDOReadCurrency` | function | `call` | `(%Name)` | olevariant | 66 | Returns `0` on exception |
| `RDOWriteString` | procedure | `call` | `(%Name, %Value)` | void | 55 | |
| `RDOWriteInteger` | procedure | `call` | `(%Name, #Value)` | void | 53 | |
| `RDOWriteBoolean` | procedure | `call` | `(%Name, #Value)` | void | 52 | Value is wordbool |
| `RDOWriteFloat` | procedure | `call` | `(%Name, @Value)` | void | 54 | Value is double |
| `RDOWriteDate` | procedure | `call` | `(%Name, @Value)` | void | 56 | Value is TDateTime |
| `RDOWriteDateFromStr` | procedure | `call` | `(%Name, %Value)` | void | 57 | |
| `RDOWriteCurrency` | procedure | `call` | `(%Name, @Value)` | void | 58 | Value is currency |

### Security

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `RDOSetSecurityLevel` | function | `call` | `(#secLevel)` | olevariant | 50 | secLevel is wordbool |
| `RDOIsSecureKey` | function | `call` | `(%FullKeyName)` | olevariant | 74 | |
| `RDOSetSecurityOfKey` | function | `call` | `(%FullKeyName, #Security)` | olevariant | 75 | Security is wordbool |
| `RDOIsSecureValue` | function | `call` | `(%FullPathName)` | olevariant | 77 | |
| `RDOSetSecurityOfValue` | function | `call` | `(%FullPathName, #Security)` | olevariant | 78 | Security is wordbool |

### Subscription & billing (rarely used by WebClient)

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `RDOGenSubscriptionId` | function | `call` | `(%Alias)` | olevariant | 88 | |
| `RDOGenTransactionId` | function | `call` | `(%Alias)` | olevariant | 89 | |
| `RDONewAccount` | function | `call` | `(%AccountId, #FamilyId)` | olevariant | 90 | |
| `RDOExtendTrial` | function | `call` | `(%Alias, #days)` | olevariant | 95 | |
| `RDOIsOnTrial` | function | `call` | `(%Alias)` | olevariant | 96 | |
| `RDONextChargeDate` | function | `call` | `(%Alias)` | olevariant | 97 | |
| `RDORecordSubscriptionInfo` | function | `call` | `(%SubscriptionId, %Data)` | olevariant | 99 | |
| `RDORecordExtraInfo` | function | `call` | `(%Alias, %Data)` | olevariant | 100 | |
| `RDONotifyCharge` | function | `call` | `(%subsid, %pnref, %resp_code, %resp_msg)` | olevariant | 101 | |
| `RDONotifyMoneyTransfer` | function | `call` | `(%subsid, %ttype, %tinfo, %months)` | olevariant | 102 | |
| `RDOUnsubscribe` | function | `call` | `(%alias, %subsid)` | olevariant | 103 | |
| `RDOUpdateSubs` | function | `call` | `(%alias, #valid)` | olevariant | 104 | valid is wordbool |
| `RDOUpdateAccount` | function | `call` | `(%alias, %expDate)` | olevariant | 105 | |
| `RDOGetExpDays` | function | `call` | `(%alias)` | olevariant | 106 | |
| `RDOStoreKey` | function | `call` | `(%key)` | olevariant | 108 | |
| `RDORetrieveKey` | function | `call` | `(#index)` | olevariant | 109 | |
| `RDOLastKey` | function | `call` | `()` | olevariant | 110 | |
| `RDOGetSecureTransId` | function | `call` | `()` | olevariant | 120 | |
| `RDOValidateTransId` | function | `call` | `(%id, #mins)` | olevariant | 121 | |
| `RDOSetExpires` | procedure | `call` | `(#value)` | void | 124 | value is WordBool |
| `RDOEditKey` | function | `call` | `(%FullPathKey, %newName, %oldName, #Security)` | olevariant | 85 | Security is byte |
| `RDOTypeOf` | function | `call` | `(%FullPathNode)` | olevariant | 80 | |
| `RDOIntegrateValues` | function | `call` | `(%RelValuePath)` | olevariant | 82 | |
| `RDOFullPathValueExists` | function | `call` | `(%FullPathName)` | olevariant | 68 | |
| `RDOValueExists` | function | `call` | `(%Name)` | olevariant | 69 | |

---

## TInterfaceServer (Interface Server/InterfaceServer.pas:306)

**Resolved via:** `idof "InterfaceServer"`

### Properties (read-only unless noted)

| Member | Kind | Verb | Type | Line | Notes |
|--------|------|------|------|------|-------|
| `WorldName` | property | `get` | string | 406 | |
| `WorldURL` | property | `get` | string | 407 | |
| `WorldXSize` | property | `get` | integer | 408 | |
| `WorldYSize` | property | `get` | integer | 409 | |
| `WorldYear` | property | `get` | integer | 410 | |
| `WorldPopulation` | property | `get` | integer | 411 | |
| `WorldSeason` | property | `get` | integer | 412 | |
| `UserCount` | property | `get` | integer | 413 | |
| `DAAddr` | property | `get` | string | 415 | Model server address |
| `DAPort` | property | `get` | integer | 416 | |
| `DALockPort` | property | `get` | integer | 417 | |
| `DSAddr` | property | `get` | string | 418 | Directory server address |
| `DSPort` | property | `get` | integer | 419 | |
| `DSArea` | property | `get` | string | 420 | |
| `GMAddr` | property | `get` | string | 421 | Game Master server address |
| `GMPort` | property | `get` | integer | 422 | |
| `MailAddr` | property | `get` | string | 423 | |
| `MailPort` | property | `get` | integer | 424 | |
| `ForceCommand` | property | `set` | integer | 425 | Write-only |
| `MSDown` | property | `get` | boolean | 426 | |
| `MinNobility` | property | `get` | integer | 427 | |
| `ServerBusy` | property | `get` | boolean | 428 | |

### Methods

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `AccountStatus` | function | `call` | `(%UserName, %Password)` | olevariant | 433 | |
| `Logon` | function | `call` | `(%UserName, %Password)` | `#clientViewId` | 434 | Returns TClientView object ID |
| `Logoff` | function | `call` | `(TClientView)` | olevariant | 435 | |
| `CanJoinWorld` | function | `call` | `(%Name)` | olevariant | 440 | |
| `CanJoinWorldEx` | function | `call` | `(%Name)` | olevariant | 441 | |
| `GetClientView` | function | `call` | `(%Name)` | olevariant | 439 | |
| `GetUserList` | function | `call` | `(TChannel)` | olevariant | 436 | |
| `GetChannelList` | function | `call` | `()` | olevariant | 437 | |
| `GetChannelInfo` | function | `call` | `(%Name, %langid)` | olevariant | 438 | |
| `BanPlayer` | procedure | `call` | `(%Name)` | void | 442 | |
| `ReportNewMail` | procedure | `call` | `(%Account, %From, %Subject, %MsgId)` | void | 485 | Server-to-server |
| `GameMasterMsg` | function | `call` | `(#ClientId, %Msg, #Info)` | olevariant | 523 | |
| `GMNotify` | procedure | `call` | `(#ClientId, #notID, %Info)` | void | 524 | |
| `GetConfigParm` | function | `call` | `(%name, %def)` | olevariant | 528 | |

---

## TClientView (Interface Server/InterfaceServer.pas:91)

**Resolved via:** Object ID returned from `TInterfaceServer.Logon`

### Properties

| Member | Kind | Verb | Type | Line | Notes |
|--------|------|------|------|------|-------|
| `UserName` | property | `get` | string | 126 | Read-only |
| `CompositeName` | property | `get` | string | 127 | Read-only, `"user (realName)"` |
| `TycoonId` | property | `get` | integer | 128 | Read-only |
| `AccountDesc` | property | `get` | integer | 129 | Read-only |
| `AFK` | property | `get`/`set` | boolean | 130 | |
| `x1` | property | `get`/`set` | integer | 132 | Viewport |
| `y1` | property | `get`/`set` | integer | 133 | Viewport |
| `x2` | property | `get`/`set` | integer | 134 | Viewport |
| `y2` | property | `get`/`set` | integer | 135 | Viewport |
| `MailAccount` | property | `get` | string | 141 | Read-only, `"user@world.net"` |
| `EnableEvents` | property | `get`/`set` | boolean | 142 | Protected by critical section |
| `ServerBusy` | property | `get` | boolean | 272 | Read-only |

### Core operations

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `SetViewedArea` | procedure | `call` | `(#x, #y, #dx, #dy)` | void | 144 | |
| `ObjectsInArea` | function | `call` | `(#x, #y, #dx, #dy)` | `%data` | 145 | Multi-line building list |
| `ObjectAt` | function | `call` | `(#x, #y)` | olevariant | 146 | |
| `ObjectStatusText` | function | `call` | `(#kind, #Id, #TycoonId)` | olevariant | 147 | kind=TStatusKind |
| `AllObjectStatusText` | function | `call` | `(#Id, #TycoonId)` | olevariant | 148 | |
| `ContextStatusText` | function | `call` | `(#x, #y)` | olevariant | 149 | Skipped if ServerBusy |
| `ObjectConnections` | function | `call` | `(#Id)` | olevariant | 150 | Skipped if ServerBusy |
| `FocusObject` | procedure | `call` | `(#Id)` | void | 151 | |
| `UnfocusObject` | procedure | `call` | `(#Id)` | void | 152 | |
| `SwitchFocus` | function | `call` | `(#From, #toX, #toY)` | olevariant | 153 | |
| `SwitchFocusEx` | function | `call` | `(#From, #toX, #toY)` | olevariant | 154 | Extended version |
| `ConnectFacilities` | function | `call` | `(#Facility1, #Facility2)` | olevariant | 155 | Skipped if ServerBusy |
| `PickEvent` | function | `call` | `(#TycoonId)` | olevariant | 166 | |
| `GetUserName` | function | `call` | `()` | olevariant | 167 | |
| `ISStatus` | function | `call` | `()` | olevariant | 194 | |
| `ClientViewId` | function | `call` | `()` | olevariant | 195 | |
| `ClientAware` | procedure | `call` | `()` | void | 196 | |
| `ClientNotAware` | procedure | `call` | `()` | void | 197 | |
| `SetLanguage` | procedure | `call` | `(%langid)` | void | 198 | |

### Circuit (road/pipe) operations

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `CreateCircuitSeg` | function | `call` | `(#CircuitId, #OwnerId, #x1, #y1, #x2, #y2, #cost)` | olevariant | 156 | **7 integer params** |
| `BreakCircuitAt` | function | `call` | `(#CircuitId, #OwnerId, #x, #y)` | olevariant | 157 | |
| `WipeCircuit` | function | `call` | `(#CircuitId, #OwnerId, #x1, #y1, #x2, #y2)` | olevariant | 158 | |
| `SegmentsInArea` | function | `call` | `(#CircuitId, #x1, #y1, #x2, #y2)` | olevariant | 159 | |

### Surface & zone operations

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `GetSurface` | function | `call` | `(%SurfaceId, #x1, #y1, #x2, #y2)` | olevariant | 160 | |
| `DefineZone` | function | `call` | `(#TycoonId, #ZoneId, #x1, #y1, #x2, #y2)` | olevariant | 161 | |

### Tycoon cookies

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `GetTycoonCookie` | function | `call` | `(#TycoonId, %CookieId)` | olevariant | 162 | |
| `SetTycoonCookie` | procedure | `call` | `(#TycoonId, %CookieId, %CookieValue)` | void | 163 | |

### Company operations

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `GetCompanyList` | function | `call` | `()` | olevariant | 168 | |
| `GetCompanyCount` | function | `call` | `()` | olevariant | 175 | |
| `GetCompanyName` | function | `call` | `(#index)` | olevariant | 170 | |
| `GetCompanyId` | function | `call` | `(#index)` | olevariant | 172 | |
| `GetCompanyOwnerRole` | function | `call` | `(#index)` | olevariant | 169 | |
| `GetCompanyCluster` | function | `call` | `(#index)` | olevariant | 171 | |
| `GetCompanyFacilityCount` | function | `call` | `(#index)` | olevariant | 173 | |
| `GetCompanyProfit` | function | `call` | `(#index)` | olevariant | 174 | |
| `NewCompany` | function | `call` | `(%name, %cluster)` | olevariant | 176 | |
| `NewFacility` | function | `call` | `(%FacilityId, #CompanyId, #x, #y)` | olevariant | 178 | |
| `CloneFacility` | procedure | `call` | `(#x, #y, #LimitToTown, #LimitToCompany, #TycoonId)` | void | 164 | |
| `GetNearestTownHall` | function | `call` | `(#x, #y)` | olevariant | 165 | |

### Events & session

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `RegisterEvents` | function | `call` | `(%ClientAddress, #ClientPort)` | olevariant | 218 | Legacy |
| `RegisterEventsById` | function | `call` | `(#ClientId)` | olevariant | 219 | **Fires InitClient push BEFORE returning** |
| `SetClientData` | procedure | `call` | `(%data)` | void | 220 | |
| `Logoff` | function | `call` | `()` | olevariant | 221 | |

### Chat & social

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `SayThis` | procedure | `call` | `(%Dest, %Msg)` | void | 179 | Chat message |
| `VoiceThis` | procedure | `call` | `(%Msg, #TxId, #NewTx)` | void | 180 | |
| `VoiceRequest` | function | `call` | `(#RequestId)` | olevariant | 181 | |
| `CancelVoiceRequest` | procedure | `call` | `(#RequestId)` | void | 182 | |
| `VoiceTxOver` | procedure | `call` | `(#RequestId)` | void | 183 | |
| `VoiceStatusChanged` | procedure | `call` | `(#Status)` | void | 184 | |
| `MsgCompositionChanged` | procedure | `call` | `(#State)` | void | 185 | TMsgCompositionState |
| `Chase` | function | `call` | `(%UserName)` | olevariant | 189 | |
| `StopChase` | function | `call` | `()` | olevariant | 190 | |
| `GetUserList` | function | `call` | `()` | olevariant | 191 | |
| `GetChannelList` | function | `call` | `(%Root)` | olevariant | 192 | |
| `GetChannelInfo` | function | `call` | `(%Name)` | olevariant | 193 | |
| `CreateChannel` | function | `call` | `(%ChannelName, %Password, %aSessionApp, %aSessionAppId, #anUserLimit)` | olevariant | 186 | |
| `JoinChannel` | function | `call` | `(%ChannelName, %Password)` | olevariant | 187 | |
| `LaunchChannelSession` | function | `call` | `(%ChannelName)` | olevariant | 188 | |

### Favorites

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `RDOFavoritesNewItem` | function | `call` | `(%Location, #Kind, %Name, %Info)` | olevariant | 200 | |
| `RDOFavoritesDelItem` | function | `call` | `(%Location)` | olevariant | 201 | |
| `RDOFavoritesMoveItem` | function | `call` | `(%ItemLoc, %Dest)` | olevariant | 202 | |
| `RDOFavoritesRenameItem` | function | `call` | `(%ItemLoc, %Name)` | olevariant | 203 | |
| `RDOFavoritesGetSubItems` | function | `call` | `(%ItemLoc)` | olevariant | 204 | |

### Game Master

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `ConnectToGameMaster` | function | `call` | `(#ClientId, %UserInfo, %GameMasters)` | olevariant | 260 | |
| `SendGMMessage` | function | `call` | `(#ClientId, #GMId, %Msg)` | olevariant | 261 | |
| `DisconnectUser` | procedure | `call` | `(#ClientId, #GMId)` | void | 262 | |

---

## TModelEvents (Interface Server/InterfaceServer.pas:541)

**Server-to-server push callbacks (Model Server -> Interface Server). These generate client pushes.**

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `RefreshArea` | procedure | `call` | `(#x, #y, #dx, #dy)` | void | 548 | |
| `RefreshObject` | procedure | `call` | `(#ObjId, #KindOfChange)` | void | 549 | Triggers client-side RefreshObject push |
| `RefreshTycoons` | procedure | `call` | `(#useless)` | void | 550 | Dummy param for RDO compat |
| `RefreshDate` | procedure | `call` | `(@Date)` | void | 551 | TDateTime |
| `RefreshSeason` | procedure | `call` | `(#Season)` | void | 552 | |
| `EndOfPeriod` | procedure | `call` | `(#useless)` | void | 553 | Dummy param for RDO compat |
| `TycoonRetired` | procedure | `call` | `(%name)` | void | 554 | |
| `SendTickData` | procedure | `call` | `(#PoolId, #ViewerId, #TickCount, %TickDataStr)` | void | 555 | |
| `SendNotification` | procedure | `call` | `(#TycoonId, #Kind, %Title, %Body, #Options)` | void | 556 | |
| `ModelStatusChanged` | procedure | `call` | `(#Status)` | void | 557 | |
| `ReportMaintenance` | procedure | `call` | `(@eta, #LastDowntime)` | void | 558 | eta is TDateTime |

---

## TMailServer (Mail Server/MailServer.pas:80)

**Resolved via:** `idof "MailServer"` (on mail socket)

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `RegisterWorld` | function | `call` | `(%WorldName)` | olevariant | 98 | Server-to-server |
| `LogServerOn` | function | `call` | `(%WorldName)` | olevariant | 100 | Server-to-server |
| `LogServerOff` | function | `call` | `(#Id)` | olevariant | 101 | |
| `NewMailAccount` | function | `call` | `(#ServerId, %Account, %Alias, %FwdAddr, #KeepMsg)` | olevariant | 102 | KeepMsg is WordBool |
| `DeleteAccount` | function | `call` | `(#ServerId, %Account)` | olevariant | 103 | |
| `CheckNewMail` | function | `call` | `(#ServerId, %Account)` | olevariant | 104 | |
| `SetForwardRule` | function | `call` | `(#ServerId, %Account, %FwdAddr, #KeepMsg)` | olevariant | 105 | KeepMsg is WordBool |
| `NewMail` | function | `call` | `(%aFrom, %aTo, %aSubject)` | `#messageId` | 107 | Returns TMailMessage obj ID |
| `OpenMessage` | function | `call` | `(%WorldName, %Account, %Folder, %MessageId)` | olevariant | 108 | Returns TMailMessage obj ID |
| `DeleteMessage` | procedure | `call` | `(%WorldName, %Account, %Folder, %MessageId)` | void | 109 | |
| `Post` | function | `call` | `(%WorldName, #Id)` | olevariant | 110 | **Sends** message to recipients |
| `Save` | function | `call` | `(%WorldName, #Id)` | olevariant | 111 | **Saves** to Draft folder only |
| `CloseMessage` | procedure | `call` | `(#Id)` | void | 112 | |
| `Spam` | procedure | `call` | `(%WorldName, %From, %Subject, %Password, %Msg)` | void | 114 | Broadcast |

## TMailMessage (Mail Server/MailServer.pas:128)

**Resolved via:** Object ID returned from `NewMail` or `OpenMessage`

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `AddLine` | procedure | `call` | `(%line)` | void | 140 | Add body line |
| `AddHeaders` | procedure | `call` | `(%headers)` | void | 141 | |
| `AttachObject` | procedure | `call` | `(%Info)` | void | 142 | |
| `GetHeaders` | function | `call` | `(#void)` | olevariant | 143 | **Dummy int param** (RDO quirk) |
| `GetLines` | function | `call` | `(#void)` | olevariant | 144 | **Dummy int param** (RDO quirk) |
| `GetAttachmentCount` | function | `call` | `(#void)` | olevariant | 145 | **Dummy int param** (RDO quirk) |
| `GetAttachment` | function | `call` | `(#index)` | olevariant | 146 | |
| `KeepAlive` | procedure | `call` | `()` | void | 147 | Resets timestamp |

---

## Building/Facility Object Methods (via MSProxy, BindTo CurrBlock)

**Target:** Building object (resolved via `CurrBlock` property from map service)

### Supply management (SupplySheetForm.pas)

| Member | Kind | Verb | Signature | Return | Source Line | Notes |
|--------|------|------|-----------|--------|-------------|-------|
| `RDOConnectInput` | function | `call` | `(%fluidId, %cnxList)` | olevariant | 295 | cnxList="x1,y1,x2,y2,..."; WaitForAnswer=true |
| `RDODisconnectInput` | function | `call` | `(%fluidId, %cnxList)` | olevariant | 418 | cnxList="x1,y1,x2,y2,..."; WaitForAnswer=false |
| `RDOSetInputOverPrice` | function | `call` | `(%fluidId, #index, #overprice)` | olevariant | 435 | Uses MSProxy directly |
| `RDOSetInputMinK` | function | `call` | `(%fluidId, #value)` | olevariant | 653 | BindTo(ObjectId) |
| `RDOSetInputMaxPrice` | function | `call` | `(%fluidId, #value)` | olevariant | 676 | BindTo(ObjectId) |
| `RDOSelSelected` | function | `call` | `(#boolVal)` | olevariant | 699 | BindTo(ObjectId); WordBool: -1=true, 0=false |
| `RDOSetInputSortMode` | function | `call` | `(%fluidId, #mode)` | olevariant | 722 | BindTo(ObjectId); 0=cost, 1=quality |
| `RDOSetBuyingStatus` | function | `call` | `(#fingerIndex, #boolVal)` | olevariant | 741 | BindTo(ObjectId); WordBool |

### Product management (ProdSheetForm.pas)

| Member | Kind | Verb | Signature | Return | Source Line | Notes |
|--------|------|------|-----------|--------|-------------|-------|
| `RDOConnectOutput` | function | `call` | `(%fluidId, %cnxList)` | olevariant | 265 | cnxList="x1,y1,x2,y2,..."; WaitForAnswer=true |
| `RDODisconnectOutput` | function | `call` | `(%fluidId, %cnxList)` | olevariant | 363 | cnxList="x1,y1,x2,y2,..."; WaitForAnswer=false+true |
| `RDOSetOutputPrice` | function | `call` | `(%fluidId, #price)` | olevariant | 567 | WaitForAnswer=false |

### Industry general (IndustryGeneralSheet.pas)

| Member | Kind | Verb | Signature | Return | Source Line | Notes |
|--------|------|------|-----------|--------|-------------|-------|
| `Stopped` | property | `set` | `#boolVal` | — | 379/384 | WordBool: -1=true, 0=false |
| `RDOConnectToTycoon` | function | `call` | `(#tycoonId, #kind, #flag)` | olevariant | 345 | kind=button.Tag; flag=WordBool(-1) |
| `RDODisconnectFromTycoon` | function | `call` | `(#tycoonId, #kind, #flag)` | olevariant | 357 | kind=button.Tag; flag=WordBool(-1) |

### Company inputs — compInputs tab (CompanyServicesSheetForm.pas)

**Handler:** `compInputs` → `ADVERTISEMENT_GROUP` (special: 'compInputs') → `fetchCompInputData()`

**Buildings using this tab:** Config 3 factory, Config 4 service, Config 8 HQ variant, Config 9 media.
Tab name in CLASSES.BIN: `SERVICES` (TabName=SERVICES, TabHandler=compInputs).

> **Note on SERVICES tab name reuse:** The tab name "SERVICES" appears with TWO different handlers:
> - `compInputs` (most factories/service buildings) — uses `cInputCount` + indexed `cInput{i}.*` protocol
> - `Supplies` (Config 6 HQ buildings only) — uses `GetInputNames` + `SetPath` + per-gate `GetPropertyList`
> These are completely different sheets in the Delphi source. `ADVERTISEMENT_GROUP` (compInputs) is NOT the same as `SUPPLIES_GROUP` (Supplies).

**RDO fetch protocol (2-phase batch):**

```
// Phase 1 — get count
C sel <id> call GetPropertyList "^" "%SecurityId\tCurrBlock\tcInputCount\t";
A res="%...\t...\t3\t";  // count=3

// Phase 2 — batch all 7 properties per input (max 49 props per GetPropertyList call)
C sel <id> call GetPropertyList "^" "%cInput0.0\tcInputSup0\tcInputDem0\tcInputRatio0\tcInputMax0\tcEditable0\tcUnits0.0\tcInput1.0\tcInputSup1\tcInputDem1\tcInputRatio1\tcInputMax1\tcEditable1\tcUnits1.0\tcInput2.0\tcInputSup2\tcInputDem2\tcInputRatio2\tcInputMax2\tcEditable2\tcUnits2.0\t";
A res="%Advertisement\t0\t0\t0\t1680\tyes\thits\tComputer Services\t1\t1\t100\t2\t\thours\tLegal Services\t0\t0\t50\t1680\tno\thours\t";
```

**Property meanings (per input `i`):**

| RDO property | Field | Delphi type | Notes |
|---|---|---|---|
| `cInput{i}.0` | name | widestring | Input name (language suffix `.0`) |
| `cInputSup{i}` | supplied | integer | Current supply volume |
| `cInputDem{i}` | demanded | integer | Current demand volume |
| `cInputRatio{i}` | ratio | integer 0-100 | Demand ratio (% of max capacity) |
| `cInputMax{i}` | maxDemand | integer | Maximum demand capacity |
| `cEditable{i}` | editable | string `'yes'/'no'` | Whether player can adjust demand |
| `cUnits{i}.0` | units | widestring | Unit label (e.g., 'hits', 'hours') |

**SET command:**

| Member | Kind | Verb | Signature | Return | Notes |
|--------|------|------|-----------|--------|-------|
| `RDOSetCompanyInputDemand` | procedure | `call` | `(#tabIndex, #percValue)` | void (`*`) | tabIndex = 0-based position in cInputCount list; percValue = 0-100 |

### Trade / Role / Loan (TBlock / TWarehouse / TBankBlock)

| Member | Kind | Verb | Signature | Return | Source Line | Notes |
|--------|------|------|-----------|--------|-------------|-------|
| `RDOSetTradeLevel` | procedure | `call` | `(#aTradeLevel)` | void (`*`) | Kernel.pas:6408 | TBlock published method |
| `RDOSetRole` | procedure | `call` | `(#aRole)` | void (`*`) | Warehouses.pas:527 | TWarehouse published method |
| `RDOSetLoanPerc` | procedure | `call` | `(#Percent)` | void (`*`) | Banks.pas:173 | TBankBlock published method |
| `RDOSetTaxValue` | procedure | `call` | `(#TaxId, %Value)` | void (`*`) | Population.pas:1250 | TTownHall; WebClient sends as RDOSetTaxPercent |

### Facility management (ManagementSheet.pas / TClientView)

| Member | Kind | Verb | Signature | Return | Source Line | Notes |
|--------|------|------|-----------|--------|-------------|-------|
| `RDOAcceptCloning` | property | `set/get` | `#boolVal` | — | — | Toggle cloning acceptance |

### Film production (FilmsSheet.pas)

| Member | Kind | Verb | Signature | Return | Source Line | Notes |
|--------|------|------|-----------|--------|-------------|-------|
| `RDOAutoProduce` | procedure | `call` | `(#boolVal)` | void (`*`) | 372 | WordBool: #-1=true, #0=false |
| `RDOAutoRelease` | procedure | `call` | `(#boolVal)` | void (`*`) | — | Same pattern as RDOAutoProduce |
| `RDOLaunchMovie` | procedure | `call` | `(%name, @budget, #months, #autoRel)` | void (`*`) | 311 | autoRel is WordBool |
| `RDOCancelMovie` | procedure | `call` | `(#0)` | void (`*`) | 330 | Dummy integer param |
| `RDOReleaseMovie` | procedure | `call` | `(#0)` | void (`*`) | 350 | Dummy integer param |

### Town hall (TownHallJobsSheet.pas / MinisteriesSheet.pas / VotesSheet.pas)

| Member | Kind | Verb | Signature | Return | Source Line | Notes |
|--------|------|------|-----------|--------|-------------|-------|
| `RDOSetMinSalaryValue` | procedure | `call` | `(#levelIndex, #value)` | void (`*`) | 253 | levelIndex: 0=hi, 1=mid, 2=lo |
| `RDOSetMinistryBudget` | procedure | `call` | `(#MinId, %Budget)` | void (`*`) | 251 | Budget sent as widestring |
| `RDOBanMinister` | procedure | `call` | `(#MinId)` | void (`*`) | 271 | Depose a minister |
| `RDOSitMinister` | procedure | `call` | `(#MinId, %MinName)` | void (`*`) | 293 | Appoint a minister |
| `RDOVote` | procedure | `call` | `(%voter, %votee)` | void (`*`) | 259 | voter=tycoon name, votee=candidate |
| `RDOVoteOf` | function | `call` | `(%voter)` | olevariant (`%name`) | 276 | Returns current vote target |

---

## Scenario-to-Source Cross-Reference

| WebClient Scenario | Delphi Source File | Key Methods |
|--------------------|-------------------|-------------|
| `auth-scenario` | DirectoryServer.pas | `RDOOpenSession`, `RDOMapSegaUser`, `RDOLogonUser`, `RDOEndSession` |
| `world-list-scenario` | DirectoryServer.pas | `RDOSetCurrentKey`, `RDOQueryKey` |
| `company-list-scenario` | InterfaceServer.pas | `GetCompanyList`, `GetCompanyCount`, `GetCompanyName`, `GetCompanyId` |
| `select-company-scenario` | InterfaceServer.pas | `Logon`, `MailAccount`, `TycoonId`, `RegisterEventsById`, `EnableEvents` |
| `map-data-scenario` | InterfaceServer.pas | `SetViewedArea`, `ObjectsInArea`, `SegmentsInArea` |
| `server-busy-scenario` | InterfaceServer.pas | `ServerBusy` (property) |
| `switch-focus-scenario` | InterfaceServer.pas | `SwitchFocus` / `SwitchFocusEx` |
| `refresh-object-scenario` | InterfaceServer.pas | `RefreshObject` (via TModelEvents push) |
| `set-viewed-area-scenario` | InterfaceServer.pas | `SetViewedArea` |
| `pick-event-scenario` | InterfaceServer.pas | `PickEvent` |
| `overlays-scenario` | InterfaceServer.pas | `GetSurface` |
| `build-menu-scenario` | InterfaceServer.pas | `NewFacility` |
| `build-roads-scenario` | InterfaceServer.pas | `CreateCircuitSeg`, `BreakCircuitAt`, `WipeCircuit` |
| `mail-scenario` | MailServer.pas | `NewMail`, `Save`, `Post`, `AddLine`, `GetLines` |

## TResearchCenter (`Kernel/ResearchCenter.pas:57`)

**Resolved via:** BindTo(blockObjectId) — the HQ/Research Center building block ID from the map

**See also:** [Research System Reference](research-system-reference.md) for full architecture documentation.

### Research operations

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| `RDOQueueResearch` | procedure | `call` | `(%inventionId, #priority)` | void (`*`) | 73 | Priority=10 from client. Validates auth + prereqs + budget |
| `RDOCancelResearch` | procedure | `call` | `(%inventionId)` | void (`*`) | 74 | Cancels queued/active OR sells completed (cascade retirement) |
| `RDOGetInvProps` | function | `call` | `(%inventionId)` | `%string` | 75 | Properties text in owner's language |
| `RDOGetInvPropsByLang` | function | `call` | `(%inventionId, %lang)` | `%string` | 76 | Properties text in specified language |
| `RDOGetInvDesc` | function | `call` | `(%inventionId)` | `%string` | 77 | Description + prerequisites in default language |
| `RDOGetInvDescEx` | function | `call` | `(%inventionId, %langId)` | `%string` | 78 | Description in specified language |

---

## TBlock / TFacility (Kernel/Kernel.pas)

**Resolved via:** `CurrBlock` object ID returned in `GetPropertyList` Phase 1 response.

> `TBlock` is the base class for all placeable game objects. Facility-specific subclasses
> (`TConnectedBlock`, `TEvaluatedBlock`, etc.) inherit these properties.
> Target object for facility inspector SET commands is always `CurrBlock`, NOT the world ID.

### Published properties (building inspector — Phase 1 fetch)

| Member | Kind | Verb | Delphi Type | RDO Prefix | Notes |
|--------|------|------|------------|------------|-------|
| `Name` | property | `get`/`set` | `widestring` | `%` | Editable name. SET: `C sel <CurrBlock> set Name "%NewName"` |
| `Creator` | property | `get` | `widestring` | `%` | Owner alias, read-only |
| `Cost` | property | `get` | `currency` | `@` | Construction cost, marshaled as double |
| `ROI` | property | `get` | `single` | `!` | Return on investment percentage |
| `Years` | property | `get` | `integer` | `#` | Facility age in game years |
| `CurrBlock` | property | `get` | `integer` | `#` | Object ID of the block itself (self-referential) |
| `SecurityId` | property | `get` | `widestring` | `%` | Owner security token; used to check ownership |
| `Stopped` | property | `get`/`set` | `wordbool` | `#` | Facility paused state. true=-1 (stopped), false=0 (running). |
| `Trouble` | property | `get` | `integer` | `#` | Trouble/issue code. 0=none; non-zero=issue code. |
| `ObjectId` | property | `get` | `integer` | `#` | Global object ID (same as CurrBlock for facilities) |

### Stopped property — wire format (Batch 2 — G1)

**Archaeology checklist result (rdo-archaeology-checklist.md):**
1. **Server object:** `TBlock` (base class) in `Kernel/Kernel.pas`
2. **Member kind:** `published property Stopped: wordbool read GetStopped write SetStopped` → verb: `set`
3. **Parameter types:** Single `wordbool` value → RDO prefix `#`. Delphi wordbool: `true = -1`, `false = 0`
4. **Separator:** N/A (property set, no separator token)
5. **Return type:** N/A (property set returns nothing)
6. **Push behaviors:** Server may push `RefreshObject` to nearby clients after state change
7. **TypeScript command:**
   ```typescript
   // Close (stop building operations):
   RdoCommand.sel(currBlockId).set('Stopped').args(RdoValue.int(-1)).build();
   // Open (resume building operations):
   RdoCommand.sel(currBlockId).set('Stopped').args(RdoValue.int(0)).build();
   ```
8. **Wire format verified from RDO trace:**
   - `C sel 128629248 set Stopped="#-1"` — Close action
   - `C sel 128629248 set Stopped="#0"` — Open action
   - Object ID is `CurrBlock` (facility block), NOT `worldContextId`

### RDODelFacility — wire format (Batch 3 — G2)

**Archaeology checklist result (rdo-archaeology-checklist.md):**
1. **Server object:** `TWorldView` (or `TClientView`) in `InterfaceServer.pas` — the **world** object, NOT the facility block
2. **Member kind:** `published function RDODelFacility(const aX, aY: integer): OleVariant` → verb: `call`, separator: `"^"` (function, returns value)
3. **Parameter types:** Two `integer` params → RDO prefix `#`. Args are world coordinates of the building
4. **Separator:** `"^"` — function call that returns a value (OleVariant)
5. **Return type:** `OleVariant` containing `integer` — `Result := 0` on success, non-zero on failure. Response: `A<id> res="#0"`
6. **Push behaviors:** Server sends `RefreshObject` push to nearby clients after deletion; triggers map refresh
7. **TypeScript command:**
   ```typescript
   // Demolish building at world coordinates (x, y):
   RdoCommand.sel(worldContextId).call('RDODelFacility').method()
     .args(RdoValue.int(buildingX), RdoValue.int(buildingY)).build();
   ```
8. **Wire format verified from RDO trace:**
   - `C sel 109319792 call RDODelFacility "^" "#459","#389"` — request
   - `A123 res="#0"` — success response
   - Object ID is `worldContextId` (world view), NOT `CurrBlock` or `interfaceServerId`

**Critical distinction:** `RDODelFacility` targets the **world** object (worldContextId), while all other building inspector commands (SET Stopped, RDOSetPrice, etc.) target the **facility block** (CurrBlock / interfaceServerId).

---

## Quick-Find Paths (for methods not in this index)

When a method is not found above, search in this order:

1. **InterfaceServer.pas** — most game operations (TClientView has 78 published members)
   ```
   Grep "function\|procedure" in "SPO-Original/Interface Server/InterfaceServer.pas"
   ```
2. **DirectoryServer.pas** — auth & registry (TDirectorySession has 71 published members)
   ```
   Grep "function\|procedure" in "SPO-Original/DServer/DirectoryServer.pas"
   ```
3. **MailServer.pas** — mail operations
   ```
   Grep "function\|procedure" in "SPO-Original/Mail Server/MailServer.pas"
   ```
4. **Kernel.pas** — game object properties
   ```
   Grep "published" sections in "SPO-Original/Kernel/Kernel.pas"
   ```

After finding the method, **add it to the appropriate table above** so future lookups are instant.
