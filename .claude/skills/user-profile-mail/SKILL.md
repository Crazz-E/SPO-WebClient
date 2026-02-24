---
name: user-profile-mail
description: "User profile and mail system: profile tab protocol, mail folder structure, mail server RDO methods, message composition flow."
user-invokable: false
disable-model-invocation: false
---

# User Profile & Mail

Auto-loaded when working on profile panel, mail system, mail UI, or mail/profile RDO methods.

## Architecture

```
Client  --RDO-->  Interface Server  --RDO-->  Directory Server (account/profile)
                                    --RDO-->  Model Server (TTycoon world data)
                                    --RDO-->  Mail Server (FIVEMailServer)
```

- **Directory Server**: Persistent accounts, authentication, profile metadata (NobPoints, trial)
- **Interface Server**: Gateway, session management, profile assembly, mail event routing
- **Model Server**: World simulation, TTycoon objects, budget, rankings, companies
- **Mail Server**: Full mail system — accounts, folders, messages, forwarding, notifications

## Profile Data Flow

1. Client authenticates via `RDOLogonUser(%Alias, %Password)` on Directory Session
2. Interface Server creates session, fetches profile from Directory + Model servers
3. Profile tabs assembled from multiple sources (6 tabs: General, Curriculum, Bank, P&L, etc.)
4. Client receives assembled profile data via WebSocket push

## Mail Server RDO Methods (14 published)

| Method | Parameters | Return | Purpose |
|--------|-----------|--------|---------|
| `RegisterWorld` | `%WorldName` | int ptr | Register world |
| `LogServerOn` | `%WorldName` | int ptr | Server login |
| `LogServerOff` | `#Id` | bool | Server logout |
| `NewMailAccount` | `#ServerId, %Account, %Alias, %FwdAddr, #KeepMsg` | int | Create account |
| `DeleteAccount` | `#ServerId, %Account` | int | Delete account |
| **`CheckNewMail`** | `#ServerId, %Account` | int count | Count unread |
| `SetForwardRule` | `#ServerId, %Account, %FwdAddr, #KeepMsg` | bool | Set forwarding |
| **`NewMail`** | `%From, %To, %Subject` | int MsgId | Start composing |
| **`OpenMessage`** | `%WorldName, %Account, %Folder, %MessageId` | int MsgId | Read message |
| `DeleteMessage` | `%WorldName, %Account, %Folder, %MessageId` | void | Delete message |
| **`Post`** | `%WorldName, #Id` | bool | Send message |
| `Save` | `%WorldName, #Id` | bool | Save draft |
| `CloseMessage` | `#Id` | void | Close message |
| `Spam` | `%WorldName, %From, %Subject, %Password, %Msg` | void | Broadcast |

## Critical Finding

**There is NO method that returns a list of messages or message IDs for a folder.**
- `CheckNewMail` only returns a count, not message IDs
- `OpenMessage` reads a single message by known ID
- Folder enumeration was done by the COM-based TMailBrowser reading local filesystem only

## Mail Folder Structure

Folders: `Inbox`, `Sent`, `Drafts` (stored as filesystem directories on the server).

## Key Gotcha

- `worldContextId` = world operations (map focus, queries)
- `interfaceServerId` = building operations AND mail/profile operations
- Mail methods route through the Interface Server, not direct to Mail Server

## Deep-Dive References

- [User Profile & Mail Service](../../../doc/USER_PROFILE_AND_MAIL_SERVICE.md) — Full architecture, logon flow, profile tabs, database schema
- [Mail System Analysis](../../../doc/MAIL_SYSTEM_ANALYSIS.md) — TMailServer methods, TMailBrowser internals, notification flow