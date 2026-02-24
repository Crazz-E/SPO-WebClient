# SPO-Original Delphi Reference Index

> **Source path:** See `delphi-archaeologist` skill for current codebase path
>
> Pre-indexed reference for RDO conformity checking. Consult this before implementing any RDO request.
> The 8-step conformity checklist is in the `rdo-protocol` skill (auto-loads for RDO work).

## RDO Dispatch Rules (from RDOObjectServer.pas)

| Delphi declaration | RDO verb | Separator | Response |
|--------------------|----------|-----------|----------|
| `published property Foo : type read Get write Set` | `get` / `set` | *(none)* | `res=<prefix><value>` |
| `published function Foo(params) : olevariant` | `call` | `^` between args | `res=<prefix><value>` |
| `published procedure Foo(params)` | `call` | `^` between args | `res=*` (void) |
| `published procedure Foo` (no params) | `call` | `*` | `res=*` (void) |

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
