# SPO-Original Service Map

> **Root:** `C:\Users\RobinALEMAN\Documents\SPO\SPO-Original`
> **Generated:** 2026-02-24 from verified directory survey
> **Total:** 67 directories, ~1751 .pas, ~256 .dpr, ~380 .dfm (recursive)

## Quick Index by Service

### Core Servers (the 4 pillars)

| Server | Entry Point (.dpr) | Main Unit | Key Class |
|--------|-------------------|-----------|-----------|
| **Model Server** | `Model Server/FIVEModelServer.dpr` | `Model Server/FIVEModelServer.dpr` (130+ uses) | `TModelServerReport` |
| **Interface Server** | `Interface Server/FIVEInterfaceServer.dpr` | `Interface Server/InterfaceServer.pas` | `TInterfaceServer`, `TClientView`, `TModelEvents` |
| **Directory Server** | `Directory Server/FIVEDirectoryServer.dpr` | `DServer/DirectoryServer.pas` | `TDirectoryServer`, `TDirectorySession` |
| **Voyager (Client)** | `Voyager/FIVEVoyager.dpr` | `Voyager/VoyagerWindow.pas` | `TVoyagerWin` (230+ units) |

---

### Model Server Domain (Game Simulation Engine)

| Directory | .pas | .dpr | Purpose | Key Files |
|-----------|------|------|---------|-----------|
| **Kernel/** | 93 | 2 | Core simulation: worlds, populations, facilities, trade, politics, taxes, rankings | `Kernel.pas`, `World.pas`, `Population.pas`, `Trade.pas`, `Collection.pas`, `Persistent.pas`, `Headquarters.pas`, `Politics.pas`, `Taxes.pas`, `Rankings.pas`, `Events.pas`, `Disasters.pas`, `Inventions.pas`, `TycoonLevels.pas` |
| **StdBlocks/** | 81 | 0 | All standard facility types: factories, shops, services, farms, banks, offices, media | `Construction.pas`, `OfficeBlock.pas`, `Banks.pas`, `Broadcast.pas`, `ServiceBlock.pas`, `Environmental.pas`, `EvaluatedBlock.pas`, `StdFluids.pas`, `WorkCenterBlock.pas`, `ResearchCenter.pas`, `PublicFacility.pas`, `ConnectedBlock.pas`, `PopulatedBlock.pas` |
| **Model Extensions/** | 28 | 12 | Region-specific facility packs | Subdirs: `Dissidents/`, `Mariko/`, `Moab/`, `PGI/`, `UW/`, `Magna/`, `Ib/`, `General/`, `Trains/`. Each has `Standards.pas`, `FacIds.pas`, `CommonFacs.pas` |
| **Circuits/** | 5 | 0 | Fluid circuits (input/output connections) | `Circuits.pas`, `CircuitEquivalences.pas`, `ReachMatrix.pas` |
| **Surfaces/** | 2 | 0 | Environmental surface modifiers (beauty, pollution, crime, QOL) | `Surfaces.pas`, `PyramidalModifier.pas` |
| **Actors/** | 5 | 0 | AI actor system (state machines) | `ActorTypes.pas`, `ActorPool.pas`, `Automaton.pas`, `StateEngine.pas`, `DistributedStates.pas` |
| **Tasks/** | 29 | 0 | Tutorial system and automated player tasks | `Tasks.pas`, `Tutorial.pas`, `CommonTasks.pas`, `MakeProfitTask.pas`, `DissidentTutorial.pas` |
| **Transport/** | 4 | 1 | Road/rail transport simulation layer | `Transport.pas`, `TransportInterfaces.pas`, `MatrixLayer.pas` |
| **Land/** | 8 | 5 | Land/terrain generation and classification | `Land.pas`, `LandInfo.pas`, `LandMapGenerator.dpr`, `LandViewer.dpr` |
| **NewLand/** | 6 | 3 | Newer land generation variant | Same structure as Land/ |
| **Economics/** | 5 | 2 | Economic study/test tools | `FIVEStudy.dpr`, `test.dpr` (subdirs: `Data/`) |
| **Inventions/** | 2 | 2 | Research/invention system tools | `InvComp.dpr`, `InvMaker.dpr` |
| **Model Server/** | 2 | 2 | Server entry point + film name generator | `FIVEModelServer.dpr`, `FilmNameGen.dpr` |

### Interface Server Domain (Client Session Manager)

| Directory | .pas | .dpr | Purpose | Key Files |
|-----------|------|------|---------|-----------|
| **Interface Server/** | 8 | 2 | Client sessions, RDO bridge to Model Server | `InterfaceServer.pas` (TInterfaceServer, TClientView, TModelEvents), `Sessions.pas`, `SessionInterfaces.pas`, `ISMLS.pas`, `FIVEInterfaceServer_TLB.pas` |
| **Gm/** | 22 | 7 | Game Master tools, GM kernel, GM visual UI | `GMKernel.pas`, `GameMaster.pas`, `GMServer.pas`. Subdir: `GM Visual/` |

### Directory Server Domain (Registry & Authentication)

| Directory | .pas | .dpr | Purpose | Key Files |
|-----------|------|------|---------|-----------|
| **Directory Server/** | 9 | 4 | Authentication, user accounts, world registry | `FIVEDirectoryServer.dpr`, `DirectoryServer.pas`, `DirectoryRegistry.pas`, `DirectoryManager.pas`, `ODM.dpr`, `SerialGenerator.dpr` |
| **DServer/** | 10 | 1 | Directory server protocol and management UI | `DirectoryServerProtocol.pas` (error codes, account types), `DirectoryServer.pas`, `DirectoryRegistry.pas` |
| **DSZip/** | 9 | 1 | Alternative directory server build (zipped) | `FIVEDirectoryServer.dpr` (variant) |

### Voyager Domain (Client UI)

| Directory | .pas | .dpr | .dfm | Purpose | Key Files |
|-----------|------|------|------|---------|-----------|
| **Voyager/** | 82 | 2 | 58 | Client application: sheets, URL handlers, forms | See sub-structure below |
| **Voyager.1/** | 64 | 2 | 45 | Older Voyager version (backup/reference only) | Same structure |

#### Voyager Sub-Structure (in `Voyager/`)

| Subdirectory | Purpose | Key Files |
|-------------|---------|-----------|
| `Components/MapIsoView/` | Isometric map renderer | `Map.pas`, `MapIsoView.pas`, `GameControl.pas`, `FiveControl.pas`, `Roads.pas`, `Concrete.pas`, `BuildClasses.pas`, `Circuits.pas`, `ImageCache.pas`, `Lander.pas`, `Sound*.pas` |
| `Components/IsometricMap/` | Isometric map types | `IsometricMap.pas`, `FiveIsometricMap.pas`, `IsometricMapTypes.pas` |
| `Components/WebBrowser/` | Embedded web browser | `CustomWebBrowser.pas`, `InternetSecurityManager.pas` |
| `Components/` (root) | Reusable UI controls | `VisualControls.pas`, `PlotterGrid.pas`, `ChatRenderer.pas`, `InternationalizerComponent.pas` |
| `URLHandlers/` | URL-based navigation | `ServerCnxHandler.pas`, `MapIsoHandler.pas`, `ObjectInspectorHandler.pas`, `ToolbarHandler.pas`, `LogonHandler.pas`, `ChatHandler.pas`, `ConfigHandler.pas` |
| Root `.pas` files | Facility inspector sheets (~50+ forms) | `IndustryGeneralSheet.pas`, `SupplySheetForm.pas`, `ResidentialSheet.pas`, `TownHallSheet.pas`, `BankGeneralSheet.pas`, `CapitolSheet.pas`, `ProdSheetForm.pas`, `SrvGeneralSheetForm.pas` |

### RDO Protocol (3 variants — same structure, different optimizations)

| Directory | .pas | Structure | Purpose | Key Differences |
|-----------|------|-----------|---------|-----------------|
| **Rdo/** | 26 | `Client/`, `Server/`, `Common/` | Base RDO implementation (text protocol) | Standard text-based marshaling |
| **Rdo.IS/** | 26 | `Client/`, `Server/`, `Common/` | Interface Server variant | Specialized for IS thread pool (ISMaxThreads=24) |
| **Rdo.BIN/** | 26 | `Client/`, `Server/`, `Common/` | Binary protocol variant | Has `RDOQueries.pas`, `RDOVariantUtils.pas`, thread cache experiments |

**Common files across all 3 variants:**
- `Common/RDOProtocol.pas` — Protocol constants (sel, get, set, call, type prefixes)
- `Common/RDOInterfaces.pas` — COM/OLE interfaces (IRDOConnection, IRDOQueryServer)
- `Common/ErrorCodes.pas` — Standard error codes
- `Common/RDOUtils.pas` — Helper utilities
- `Common/RDOChannelCodec.pas` — Message encoding/decoding
- `Server/RDOObjectServer.pas` — Core dispatch (GetProperty, SetProperty, CallMethod)
- `Server/RDOQueryServer.pas` — Query queue + thread pool
- `Server/RDOServer.pas` — Main server class
- `Client/RDOObjectProxy.pas` — OLE proxy for remote objects
- `Client/WinSockRDOConnection.pas` — WinSocket transport

### Cache System

| Directory | .pas | .dpr | Purpose | Key Files |
|-----------|------|------|---------|-----------|
| **Cache/** | 49 | 7 | Object caching, visual classes, model server cache | `CacheAgent.pas`, `CacheCommon.pas`, `ModelServerCache.pas`, `VisualClasses.pas`, `IniClasses.pas`, `CacheRegistryData.pas`, `FIVECacheServer.dpr`, `CacheManager.dpr` |
| **Cache Server/** | 12 | 1 | Standalone cache server | `FIVECacheServer.dpr` |
| **Class Packer/** | 5 | 2 | Visual class compilation tool (CLASSES.BIN) | `VisualClassManager.pas`, `VCLOrg.dpr`, `VCP.dpr` |
| **Class Storage/** | 2 | 1 | Class storage interface | `ClassStorageInt.pas`, `ClassStorage.dpr` |

### Communication Services

| Directory | .pas | .dpr | Purpose | Key Files |
|-----------|------|------|---------|-----------|
| **Mail/** | 12 | 3 | Mail protocol and interfaces | `MailProtocol.pas`, `MailConsts.pas`, `MailServerInterfaces.pas` |
| **Mail Server/** | 5 | 1 | Mail server | `FIVEMailServer.dpr` |
| **Mail Spam/** | 1 | 1 | Spam management tool | `SPMailSpam.dpr` |
| **News Server/** | 14 | 3 | News/bulletin board server | `FIVENewsServer.dpr`, `NewsServerInterfaces.pas`, `NewsBoard.dpr` |
| **NewsLetters/** | 2 | 2 | Newsletter system | `NewsLetter.dpr` |
| **Communities/** | 4 | 3 | Community bulletin boards | `community.dpr`, `BBTest.dpr` |

### Persistence & Backup

| Directory | .pas | .dpr | Purpose | Key Files |
|-----------|------|------|---------|-----------|
| **Persistence/** | 15 | 3 | Serialization, backup/restore, stream utilities | `BackupInterfaces.pas`, `BackupObjects.pas`, `Streams.pas`, `DelphiStreamUtils.pas`, `VCLBackup.pas` |
| **Memory/** | 3 | 1 | Memory management + DLL persistence | `DllPersistent.dpr` |

### Utility Libraries (Utils/ — 414 .pas recursive)

| Subdirectory | .pas (approx) | Purpose | Key Files |
|-------------|--------------|---------|-----------|
| `Misc/` | ~33 | Math, matrices, string parsing | `LargeMatrix.pas`, `Matrix.pas`, `CompStringsParser.pas` |
| `CodeLib/` | ~15 | Core types, threads, warnings | `Threads.pas`, `CoreTypes.pas`, `Warnings.pas` |
| `Graphics/` | ~54 | DirectX display, rendering | `Display.pas` |
| `Vcl/` | ~107 | VCL overrides and extensions | Various |
| `Network/` | ~16 | WinSocket utilities, proxies | `HostNames.pas`, `ProxyInit.pas` |
| `Serial/` | ~4 | Serialization, CRC, ID generation | `GenIdd.pas`, `CRC32.pas` |
| `Synchro/` | ~6 | Synchronization, compression, CAB | `Synchro.pas`, `CabUtils.pas` |
| `Voice/` | ~20 | Voice chat system | Voice chat components |
| `SoundLib/` | ~3 | Audio playback | Sound utilities |
| `GameAPI/` | ~28 | Game API bindings | Various |
| `WinUtils/` | ~21 | Windows utilities | Various |
| `Debug/` | ~8 | Debug tools | Various |
| `Archive/`, `DXMedia/`, `Experts/`, `MP3/`, `MP3Play/`, `SPFeedback/`, `Tlbs/`, `Packages/` | misc | Specialized/archived | Various |

**Note:** `CodeLib.1/` and `Copy of Synchro/` are backups — ignore.

### Shared Protocol

| Directory | .pas | Purpose | Key Files |
|-----------|------|---------|-----------|
| **Protocol/** | 2 | Shared protocol constants used by all services | `Protocol.pas` (error codes, circuit IDs, separators), `RankProtocol.pas` |

### Supporting Tools & Services

| Directory | .pas | .dpr | Purpose |
|-----------|------|------|---------|
| **Daemon Scheduler/** | 8 | 5 | Background tasks: rankings, world status, subscriptions |
| **Remote Admin/** | 8 | 6 | Remote server administration (backup, launch, reboot, rename) |
| **Logs/** | 5 | 1 | Logging framework (`Logs.pas`, `FIVELogs.dpr`) |
| **Billing/** | 0 | 2 | Subscription billing (`lola.dpr`, `lolup.dpr`) |
| **crypto/** | 4 | 2 | Encryption utilities (`Greed.dpr`, `spcrypt.dpr`) |
| **Explorer/** | 7 | 1 | File/data explorer tool |
| **Installer/** | 4 | 3 | Client installer |
| **InstallerSplash/** | 2 | 2 | Installer splash screen |
| **sponlinemon/** | 3 | 2 | Server monitoring tool |
| **StatsPlot/** | 1 | 1 | Statistics plotting |
| **Maint_Service/** | 4 | 3 | Maintenance service (process watcher) |
| **GreedyWork/** | 9 | 2 | Greedy work/API system |
| **CGI/** | 3 | 4 | CGI web interfaces |
| **WebService/** | 0 | 0 | Web service (empty/placeholder) |
| **Projects/** | 0 | 1 | Proxy config tool |

### Game Content Extensions

| Directory | .pas | .dpr | Purpose |
|-----------|------|------|---------|
| **IB/** | 28 | 2 | Internet Business extension (missions, kernel) |
| **Illegal/** | 12 | 2 | Crime/illegal activities gameplay system |
| **Lotto/** | 1 | 0 | Lottery system |

### Reference Only (do not modify)

| Directory | Purpose |
|-----------|---------|
| **Borland/** | Borland VCL runtime source (Vcl/, VclPatch/) |
| **DirectX Sources/** | DirectX API headers (12 .pas) |
| **VBTools/** | Visual Basic interop tools |
| **Bins/** | Compiled binaries |
| **Cluster Servers/** | Empty/placeholder |
| **Database/** | Empty/placeholder |
| **log2/** | Single logging utility |
| **Registry/** | Empty/placeholder |
| **Link Buster/** | Compiled release only |
| **Resource/** | Resource launcher |

### Tests (39 test projects)

`Tests/` contains 43 .pas and 39 .dpr files — small standalone test apps for individual subsystems (RDO, cache, circuits, surfaces, mail, etc.).

---

## Duplicate/Version File Warnings

Many directories contain copy/backup files. **Always prefer the file listed in the `.dpr` uses clause.**

| Pattern | Meaning | Action |
|---------|---------|--------|
| `Copy of X.pas` | Manual backup (e.g., in Rdo.BIN/) | Ignore unless .dpr references it |
| `X.~pas` | Delphi auto-backup | Always ignore |
| `X1.pas` alongside `X.pas` | Numbered version (e.g., `WinSockRDOServerClientConnection1.pas`) | Check .dpr for which is active |
| `Voyager.1/` | Older Voyager version | Reference only — prefer `Voyager/` |
| `CodeLib.1/`, `Vcl.3/`, `Ib.new/` | Numbered backup directories | Ignore |
| `Copy of Synchro/`, `Copy of Illegal Kernel/` | Directory-level backups | Ignore |
| `xX.pas` | Experimental/disabled | Ignore |

## Service Communication Map

```
                    ┌─────────────────────────────────┐
                    │      Directory Server            │
                    │  (Auth, Registry, World List)     │
                    └──────────┬──────────────────────┘
                               │ RDO
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │ Interface    │   │ Cache        │   │ Mail         │
    │ Server       │   │ Server       │   │ Server       │
    │ (Sessions)   │   │ (Assets)     │   │ (Messages)   │
    └──────┬───────┘   └──────────────┘   └──────────────┘
           │ RDO
           ▼
    ┌──────────────┐
    │ Model Server │ ← Kernel + StdBlocks + Model Extensions
    │ (Simulation) │    + Circuits + Surfaces + Tasks
    └──────────────┘
           │
    ┌──────┴───────┐
    │ Daemon       │ (Rankings, WorldStatus, Subscriptions)
    │ Scheduler    │
    └──────────────┘

    Voyager (Client) ──RDO──> Interface Server ──RDO──> Model Server
                     ──RDO──> Directory Server (auth)
                     ──RDO──> Cache Server (assets)
```
