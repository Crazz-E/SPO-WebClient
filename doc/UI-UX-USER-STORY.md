# UI/UX User Story — Starpeace Online WebClient

**Date:** 2026-02-25
**Goal:** Replicate the legacy Voyager (Delphi 5) client's UI/UX in the browser-based WebClient
**Method:** Cross-reference of SPO-Original Delphi source (forms, handlers, viewers) against current WebClient implementation

---

## 1. Application Shell & Layout

### 1.1 Legacy (Voyager)

The Voyager client is a **full-screen borderless window** (`TVoyagerWin`, `BorderStyle: bsNone`) running at 1024x768+. It uses a **frame-based architecture** (`TFrameSet`) where each major UI area is a frame managed by a registered URL handler. Frames are created, shown, hidden, and routed via an internal URL protocol.

**Layout regions:**
```
┌─────────────────────────────────────────────────────────┐
│                    [WinBtns: _ X]              (top-right)│
├─────────────────────────────────────────────────────────┤
│                                          │              │
│                                          │  Right Panel │
│          MapIsoView (alClient)           │  (alRight)   │
│          Isometric game map              │  Hidden by   │
│          DEFAULT view                    │  default.    │
│                                          │  Shows:      │
│                                          │  • BuildView │
│                                          │  • MailView  │
│                                          │  • Directory │
│                                          │              │
├─────────────────────────────────────────────────────────┤
│  ToolbarView (alBottom)                                  │
│  [Buttons...] [UserName] [Company] [Money] [Date] [LEDs]│
│  [BlockTicker — scrolling news]              [Ads area]  │
└─────────────────────────────────────────────────────────┘
```

**Mutual exclusion rules** prevent UI conflicts — only one right-panel frame shows at a time:
- Building Inspector ↔ Chat, Mail, Directory
- Mail ↔ Chat, Messages, Directory
- Directory ↔ Build, Mail, Messages

### 1.2 WebClient (Current)

The WebClient uses a **full-viewport HTML/CSS layout** with a glassmorphic design system. Components are **free-floating draggable panels** rather than docked frames.

**Layout regions:**
```
┌─────────────────────────────────────────────────────────┐
│ ToolbarUI (top)  [Build][Road][Demolish][Search]...     │
│ TycoonStatsUI    [Cash: $X] [Income: $Y/hr] [Rank: #Z] │
├─────────────────────────────────────────────────────────┤
│                                                          │
│        Canvas (full viewport)                            │
│        Isometric map renderer                            │
│                                                          │
│   ┌──────────┐                      ┌──────────────┐    │
│   │ Minimap  │                      │ Floating     │    │
│   │ (toggle) │                      │ Panel        │    │
│   └──────────┘                      │ (draggable)  │    │
│                                     └──────────────┘    │
│                                                          │
├─────────────────────────────────────────────────────────┤
│                    (no bottom toolbar)                    │
└─────────────────────────────────────────────────────────┘
```

### 1.3 Gap & Action Items

| Area | Legacy | WebClient | Status | Action |
|------|--------|-----------|--------|--------|
| Window chrome | Custom borderless + WinBtns | Browser chrome | N/A (browser) | No action |
| Toolbar position | Bottom | Top | **DIVERGENCE** | Move to bottom or keep top (design decision) |
| Right panel docking | Docked alRight, mutual exclusion | Free-floating, no exclusion | **DIVERGENCE** | Implement mutual-exclusion logic for panels |
| News ticker | `BlockTicker` scrolling text | Not implemented | **MISSING** | Implement ticker component |
| Status LEDs | 4 LED pairs (mail, companion, server busy, online) | Not implemented | **MISSING** | Implement status indicators |
| Ads container | Banner area in toolbar | Not implemented | N/A (not needed) | Skip |
| Busy indicator | `BusyPlayer` animated GIF | Not implemented | **MISSING** | Add loading/busy spinner |

---

## 2. Login & World Selection Flow

### 2.1 Legacy (Voyager)

Login is an **HTML-based form** embedded in a `TWebBrowser` (IE) control, handled by `LogonHandler`. After authentication, the frame system transitions to the game view.

**Flow:**
1. LogonHandler displays HTML login form
2. User enters credentials → `RDOLogonUser(alias, password)`
3. On success → World list populated from Directory Server
4. User selects world → Company selection
5. On company selection → MapIsoView created, ToolbarView shown, game begins
6. Background: MP3Handler plays intro music during login

### 2.2 WebClient (Current)

`LoginUI` provides a native DOM form with zone/world/company selection.

**Flow:**
1. Login form: username, password, zone dropdown (BETA/GAMMA/ALPHA)
2. World list populated from `connectDirectory()`
3. World status indicators (online/offline)
4. Company selection after login
5. Transition to game view

### 2.3 Gap & Action Items

| Area | Legacy | WebClient | Status | Action |
|------|--------|-----------|--------|--------|
| Login form | HTML in WebBrowser | Native DOM form | OK | Equivalent |
| Zone selection | Implicit (per-zone servers) | Dropdown | OK | Equivalent |
| World list | Dynamic from Directory | Dynamic from Directory | OK | Equivalent |
| Company selection | Post-login step | Post-login step | OK | Equivalent |
| Intro music | MP3Handler + JukeBox | Not implemented | **MISSING** | Add background music (Phase 4) |
| Connection progress | `ConnectingWin` modal | Not implemented | **MISSING** | Add connection progress dialog |

---

## 3. Isometric Map View

### 3.1 Legacy (Voyager)

`TMapIsoViewer` is the core game view (MapIsoHandler, `alClient`). Features:

- Isometric tile grid with seasonal terrain textures
- Building sprites with animations
- Road/railroad rendering
- Zoom levels (multiple)
- Pan/scroll via edge-scrolling (mouse at screen edges)
- Building selection (click → ObjectInspector)
- Keyboard shortcuts: F1-F4 (seasons), F5 (restore), F11 (fullscreen)

### 3.2 WebClient (Current)

`MapNavigationUI` wraps the Canvas 2D isometric renderer. Features:

- Isometric tile grid with seasonal terrain textures
- Building rendering (static sprites)
- Road/concrete rendering with topology detection
- Single zoom level (planned: multi-zoom)
- Pan via mouse drag
- Building click → BuildingDetailsPanel
- Debug overlay toggles (D, 3, 4, 5 keys)
- Vegetation display controls

### 3.3 Gap & Action Items

| Area | Legacy | WebClient | Status | Action |
|------|--------|-----------|--------|--------|
| Terrain rendering | Seasonal textures | Seasonal textures + atlas | OK | Equivalent |
| Building sprites | Animated | Static | **PARTIAL** | Add sprite animations |
| Roads | Full topology | Full topology | OK | Equivalent |
| Zoom | Multiple levels | Single level | **PARTIAL** | Implement zoom levels |
| Pan/scroll | Edge-scroll (mouse at edges) | Mouse drag | **DIVERGENCE** | Add edge-scrolling option |
| Building click | Opens ObjectInspector | Opens BuildingDetailsPanel | OK | Equivalent |
| Season toggle | F1-F4 keys | Not implemented | **MISSING** | Add season keyboard shortcuts |
| Vehicle animations | Cars/trucks on roads | Toggle exists, no animation | **MISSING** | Implement vehicle system |

---

## 4. Toolbar / Action Bar

### 4.1 Legacy (Voyager)

`TToolbarHandlerView` — **bottom-aligned** bar with:

**Left section:**
- Navigation buttons (HTML-driven dynamic content)

**Center section:**
- `Container` panel with context-sensitive buttons

**Right section (fixed):**
- `UserName` label — Tycoon name
- `CompanyName` label — Current company
- `Money` label — Cash balance
- `MoneyDelta` label — Recent change (+/- indicator)
- `Date` label — Game date (virtual calendar)
- `FacIcon` + `FacCounter` — Building under construction count
- `BlockTicker` — Scrolling news/event ticker
- `LedsPanel` — 4 LED pairs:
  - Mail notification (on/off)
  - Companionship notification (on/off)
  - Server busy (on/off)
  - Server online/offline (on/off)
- `BusyPlayer` — Animated loading indicator

**Window controls:**
- `MinimizeBtn` / `CloseBtn` — Top-right corner (separate `WinBtns` form)

**Timers:**
- `LEDsTimer` (500ms) — Blink status LEDs
- `TickerTimer` — Scroll news text

### 4.2 WebClient (Current)

`ToolbarUI` — **top-aligned** bar with 9 buttons:

| Button | Icon | Action |
|--------|------|--------|
| Build | (emoji) | Opens BuildMenuUI |
| Road | (emoji) | Toggles road placement mode |
| Demolish | (emoji) | Toggles demolish mode |
| Search | (emoji) | Opens SearchMenuPanel |
| Company | (emoji) | Opens ProfilePanel |
| Mail | (emoji) | Opens MailPanel |
| Settings | (emoji) | Opens SettingsPanel |
| Refresh | (emoji) | Refreshes map data |
| Logout | (emoji) | Logs out |

**`TycoonStatsUI`** — Alongside toolbar, displays:
- Cash balance
- Income/hour
- Ranking
- Building count
- Extended: prestige, level, area, failure status

### 4.3 Gap & Action Items

| Area | Legacy | WebClient | Status | Action |
|------|--------|-----------|--------|--------|
| Position | Bottom | Top | **DIVERGENCE** | Design decision needed |
| Build button | Yes | Yes | OK | Equivalent |
| Road button | Yes (context) | Yes | OK | Equivalent |
| Demolish button | Yes (context) | Yes | OK | Equivalent |
| Search/Directory | Yes | Yes | OK | Equivalent |
| Company/Profile | Yes | Yes | OK | Equivalent |
| Mail | Yes | Yes | OK | Equivalent |
| Settings/Options | Yes | Yes | OK | Equivalent |
| Username display | Label in toolbar | In TycoonStatsUI | OK | Equivalent |
| Company name | Label in toolbar | Not shown separately | **MISSING** | Add company name display |
| Money | Label in toolbar | In TycoonStatsUI | OK | Equivalent |
| Money delta (+/-) | `MoneyDelta` label | Not implemented | **MISSING** | Add cash change indicator |
| Game date | `Date` label | Not implemented | **MISSING** | Add virtual date display |
| News ticker | `BlockTicker` scrolling | Not implemented | **MISSING** | Implement ticker |
| Status LEDs | 4 LED pairs (mail, server, etc.) | Mail badge only | **PARTIAL** | Add server status indicators |
| Busy indicator | Animated GIF player | Not implemented | **MISSING** | Add loading spinner |
| Building-in-progress | `FacIcon` + `FacCounter` | Building count in stats | **PARTIAL** | Add construction-specific counter |
| Favorites button | `FavoritesHandler` | Not implemented | **MISSING** | Implement favorites system |
| Train management | `TransportHandler` | Not implemented | **MISSING** | Implement transport UI |

---

## 5. Building Inspector (Object Inspector)

### 5.1 Legacy (Voyager)

`TObjectInspectorHandlerViewer` — Right-docked panel with **dynamic property sheets** loaded per building class. Tabs determined by `CLASSES.BIN [InspectorInfo]` configuration.

**27 registered sheet handlers**, each with a specialized Delphi form:

| Category | Handlers | Key Features |
|----------|----------|--------------|
| **General** | IndGeneral, SrvGeneral, ResGeneral, HqGeneral, BankGeneral, WHGeneral, TVGeneral, capitolGeneral, townGeneral, unkGeneral | Name (editable), cost, ROI, production/trade mode, status |
| **Supply Chain** | Supplies, Products, compInputs | FingerTabs per fluid, price sliders, sort mode, auto-buy, connect/disconnect |
| **Workforce** | Workforce | 3-column table (Professional/High/Low), salary sliders, WorkersCap greying |
| **Financial** | Chart, BankLoans | Sparkline graphs, loan tables |
| **Infrastructure** | Antennas, Films, Mausoleum | Station signal, movie launch/cancel/release, memorial display |
| **Government** | capitolTowns, Ministeries, Votes, townJobs, townRes, townServices, townTaxes | Budget sliders, tax rates, election voting, minister management |
| **Management** | facManagement (upgrade) | Upgrade/downgrade/stop/clone actions |

**Key UX patterns from legacy:**
- **FingerTabs**: Side-tabs for switching between supply/product fluid types
- **Read-only for non-owners**: All edit controls hidden when inspecting other players' buildings
- **Asynchronous property refresh**: Background thread fetches, UI thread renders
- **Threaded property setting**: `StartSettingProperties()` / `StopSettingProperties()` with locking

### 5.2 WebClient (Current)

`BuildingDetailsPanel` — Draggable floating panel with tab navigation.

- **27/27 handlers mapped** to PropertyGroups
- **25/32 RDO SET commands** fully implemented
- **17/27 handlers COMPLETE**, 10 PARTIAL (see [FACILITY-INSPECTOR-GAP-ANALYSIS.md](FACILITY-INSPECTOR-GAP-ANALYSIS.md))
- Auto-refresh every 20 seconds with smart-refresh (pauses during interaction)
- Owner check gates edit controls
- Connection picker dialog for supply/product linking

### 5.3 Gap & Action Items

| Area | Legacy | WebClient | Status | Action |
|------|--------|-----------|--------|--------|
| Tab system | Dynamic from CLASSES.BIN | Dynamic from CLASSES.BIN | OK | Equivalent |
| 27 handler types | All 27 | All 27 mapped | OK | Equivalent |
| ResGeneral props | Quality, Population, Crime, Pollution, Occupancy | Only Rent/Maintenance sliders | **PARTIAL** | Add 5 missing properties |
| Supplies sort/buy | SortMode toggle, Selected checkbox, BuyingStatus | Fetched read-only, no UI controls | **MISSING** | Add sort/buy toggle UI |
| Products price slider | Inline in FingerTabs | Limited UX | **PARTIAL** | Improve price slider in tabs |
| Workforce WorkersCap | Greyed-out cells for unsupported levels | Shows 0/0 | **MISSING** | Add WorkersCap + MinSalaries |
| Films buttons | Launch/Cancel/Release dispatch | Arg builders exist, no dispatch | **MISSING** | Wire action button dispatch |
| Votes button | RDOVote dispatch | Not implemented | **MISSING** | Implement RDOVote command |
| Ministeries buttons | Ban/Sit dispatch | Arg builders exist, no dispatch | **MISSING** | Wire action button dispatch |
| TV read-back | HoursOnAir/Comercials | Wrong property name in read-back | **BUG** | Fix mapRdoCommandToPropertyName |
| Clone dialog | Town/company filtering | No param collection dialog | **PARTIAL** | Add clone dialog with filters |
| hdqInventions | R&D/invention tab on HQ | Not mapped (unused in CLASSES.BIN) | **LOW** | Verify against live server |
| Tab name i18n | Localized via tabNamesMLS | Raw English keys | **LOW** | Future i18n work |

---

## 6. Search / Directory Panel

### 6.1 Legacy (Voyager)

Two handlers work together:
- **InputSearchHandler** — Search input controls (filters, text entry)
- **OutputSearchHandler** — Search results display (lists, navigation)

Right-docked panel (`DirectoryView`) with company/tycoon directory, town browser, and ranking tables.

### 6.2 WebClient (Current)

`SearchMenuPanel` — Draggable glassmorphic panel with 6 pages:

| Page | Content | Navigation |
|------|---------|------------|
| `home` | Quick-access grid | Entry point |
| `towns` | Town listing with details | From home |
| `profile` | Tycoon profile viewer | From people/rankings |
| `people` | Player search/listing | From home |
| `rankings` | Category rankings | From home |
| `ranking-detail` | Specific ranking table | From rankings |
| `banks` | Bank listing | From home |

Features: Page history with back button, responsive grid layouts, server search integration.

### 6.3 Gap & Action Items

| Area | Legacy | WebClient | Status | Action |
|------|--------|-----------|--------|--------|
| Town browser | Yes | `towns` page | OK | Equivalent |
| Player search | Yes | `people` page | OK | Equivalent |
| Rankings | Yes | `rankings` + `ranking-detail` | OK | Equivalent |
| Bank listing | Yes | `banks` page | OK | Equivalent |
| Company directory | Full company browser | Limited (via profile) | **PARTIAL** | Add dedicated company page |
| Facility search | By type/town/owner | Not implemented | **MISSING** | Add facility search page |
| Map navigation | Click result → map focus | Partially wired | **PARTIAL** | Verify map focus on result click |

---

## 7. Mail System

### 7.1 Legacy (Voyager)

**MsgComposerHandler** — Right-docked HTML-based mail interface. Mutually exclusive with Chat, Directory, Building Inspector.

**Features:**
- Folder structure: Inbox, Sent, Deleted, Drafts
- Compose / Reply / Forward
- Recipient autocomplete from Directory
- Attachment support (via Voyager HTML system)
- Save = Draft folder, Post = Send to recipients

### 7.2 WebClient (Current)

`MailPanel` — Draggable glassmorphic panel (732 lines).

**States:** `'folder-list' | 'message-view' | 'compose'`

**Features:**
- Folder navigation: Inbox, Sent, Deleted, Drafts
- Message viewer with read/unread state
- Compose / Reply / Forward modes
- Draft saving
- RDO protocol: `MsgCompositionNew`, `MsgCompositionSetField`, `MsgCompositionSave`, `MsgCompositionPost`

### 7.3 Gap & Action Items

| Area | Legacy | WebClient | Status | Action |
|------|--------|-----------|--------|--------|
| Folder system | 4 folders | 4 folders | OK | Equivalent |
| Read/unread | Yes | Yes | OK | Equivalent |
| Compose | Yes | Yes | OK | Equivalent |
| Reply/Forward | Yes | Yes | OK | Equivalent |
| Draft saving | Yes (Save) | Yes | OK | Equivalent |
| Recipient autocomplete | From Directory | Not implemented | **MISSING** | Add autocomplete from player list |
| Mutual exclusion | With Chat/Directory | Free-floating, no exclusion | **DIVERGENCE** | Implement panel exclusion |
| Unread count badge | LED indicator | Toolbar badge | OK | Equivalent |
| Message deletion | Move to Deleted folder | Implemented | OK | Equivalent |

---

## 8. Chat System

### 8.1 Legacy (Voyager)

Two handlers:
- **ChatHandler** (`TChatHandlerViewer`) — Message display + text input, real-time messaging
- **ChatListHandler** (`TChatListHandlerViewer`) — Channel/room browser, user list, room creation

Mutually exclusive with Mail, Messages, Directory.

**Features:**
- Multi-channel support
- User list per channel with online status
- Room/channel creation
- GM Chat variant (`GMChatHandler`) for game master communication
- Chat log window (`ChatLogWindow`) for history

### 8.2 WebClient (Current)

`ChatUI` — Draggable modal (928 lines).

**Features:**
- Channel tabs
- Message history (localStorage, max 100 messages)
- User list with online status
- Typing indicators
- Channel switching
- Collapse/expand
- Message persistence across sessions

### 8.3 Gap & Action Items

| Area | Legacy | WebClient | Status | Action |
|------|--------|-----------|--------|--------|
| Real-time messages | Yes | Yes | OK | Equivalent |
| Multi-channel | Yes | Yes | OK | Equivalent |
| User list | Yes | Yes | OK | Equivalent |
| Channel creation | NewChannelForm dialog | Not implemented | **MISSING** | Add channel creation |
| GM Chat | Separate GMChatHandler | Not implemented | **MISSING** | Add GM chat (admin feature) |
| Chat log/history | ChatLogWindow | localStorage history | OK | Equivalent |
| Mutual exclusion | With Mail/Directory | Free-floating | **DIVERGENCE** | Panel exclusion logic |

---

## 9. Profile / Tycoon Options Panel

### 9.1 Legacy (Voyager)

`OptionsHandler` (`TMetaOptionsHandler`) — Usually hidden, activates on demand. Manages tycoon preferences and company overview.

Additional profile UI served via HTML frames in the Directory system:
- Tycoon profile page
- Company details
- Financial history
- Rankings and prestige

### 9.2 WebClient (Current)

`ProfilePanel` — Draggable panel (1,179 lines) with sidebar + content layout.

**Tabs:**

| Tab | Data | Features |
|-----|------|----------|
| Curriculum | Prestige, rankings, achievements | Tycoon level progression (6 levels) |
| Bank | Balance, transactions | Deposit/withdraw/transfer operations |
| Profit/Loss | Recursive tree structure | Expandable financial breakdown |
| Suppliers | Supplier list | Connection overview |
| Companies | Company overview | Company switching (multi-company) |
| Strategy | Policy settings | Auto-connections (fluid policies), ally/neutral/enemy ratings |

### 9.3 Gap & Action Items

| Area | Legacy | WebClient | Status | Action |
|------|--------|-----------|--------|--------|
| Tycoon profile | HTML-based | Native panel | OK | Equivalent |
| Bank operations | Yes | Yes (deposit/withdraw/transfer) | OK | Equivalent |
| Profit/Loss tree | Via HTML | Recursive tree | OK | Equivalent |
| Company switching | Yes | Yes | OK | Equivalent |
| Auto-connections | Yes | Yes (fluid policies) | OK | Equivalent |
| Policy ratings | Yes | Yes (ally/neutral/enemy) | OK | Equivalent |
| Picture selection | PictureShopViewer dialog | Not implemented | **MISSING** | Add avatar/picture selector |
| Prestige system | Full prestige display | Yes | OK | Equivalent |
| Level progression | Yes | 6 levels (Apprentice→Legend) | OK | Equivalent |

---

## 10. Politics Panel

### 10.1 Legacy (Voyager)

`TPoliticSheetViewer` — Accessed from Town Hall building inspector or dedicated politics URL. Features mayor info, campaigns, voting, budget allocation.

Town Hall inspector includes dedicated sheets:
- `townGeneral` — Town overview + "Visit Politics" button
- `townPolitics` — Full political interface (handler exists in Voyager but not in CLASSES.BIN)
- `VotesSheet` — Election voting per building

### 10.2 WebClient (Current)

`PoliticsPanel` — Draggable panel (429 lines).

**Features:**
- Mayor info + ratings
- Opposition candidates + campaigns
- Rating tabs: Popular, Tycoons, IFEL, Publicity
- Voting/campaign mechanics (stubbed)

### 10.3 Gap & Action Items

| Area | Legacy | WebClient | Status | Action |
|------|--------|-----------|--------|--------|
| Mayor display | Yes | Yes | OK | Equivalent |
| Rating tabs | Yes | 4 tabs | OK | Equivalent |
| Voting | VotesSheet | Stubbed | **MISSING** | Implement voting RDO |
| Campaign system | Yes | Stubbed | **MISSING** | Implement campaign actions |
| Budget allocation | Town Hall sheets | Via building inspector | OK | Equivalent |

---

## 11. Build Menu / Construction

### 11.1 Legacy (Voyager)

Building construction is handled through the **VisualClassesHandler** (building metadata) combined with map interaction:
1. Player selects building category from toolbar
2. Building list shows available facilities with costs
3. Player clicks map to place building
4. RDO command creates facility at coordinates

### 11.2 WebClient (Current)

`BuildMenuUI` — Modal dialog (464 lines).

**Features:**
- Category browser (two-column grid)
- Facilities list per category with details
- Placement mode activation
- Back button navigation

### 11.3 Gap & Action Items

| Area | Legacy | WebClient | Status | Action |
|------|--------|-----------|--------|--------|
| Category browsing | Yes | Two-column grid | OK | Equivalent |
| Facility list | Yes | Yes | OK | Equivalent |
| Placement mode | Map click | Map click | OK | Equivalent |
| Building cost display | Yes | Yes | OK | Equivalent |
| Building prerequisites | Shown in list | Not shown | **MISSING** | Add prerequisite display |
| Building preview | Ghost sprite on map | Not implemented | **MISSING** | Add placement preview |

---

## 12. Minimap

### 12.1 Legacy (Voyager)

The `UniversalMapHandler` provides a world-level map overview. No dedicated minimap overlay in the main game view — the Voyager client relies on edge-scrolling and keyboard navigation for map movement.

### 12.2 WebClient (Current)

`MinimapUI` — Toggle overlay (280 lines), activated with 'M' key.

**Features:**
- Top-down canvas rendering
- Building/road visualization
- Viewport indicator rectangle
- Click-to-navigate (click minimap → map pans)
- Auto-update every 500ms

### 12.3 Gap & Action Items

| Area | Legacy | WebClient | Status | Action |
|------|--------|-----------|--------|--------|
| Minimap overlay | Not in legacy (UniversalMap was separate) | Canvas overlay | **IMPROVEMENT** | WebClient adds this |
| Click-to-navigate | N/A | Yes | **IMPROVEMENT** | WebClient feature |
| Viewport indicator | N/A | Yes | **IMPROVEMENT** | WebClient feature |

---

## 13. Settings / Options

### 13.1 Legacy (Voyager)

`TMetaOptionsHandler` — Hidden panel that opens on demand. Features:
- Display configuration
- Sound/music settings (MP3Handler integration)
- Network settings
- Key mappings (TTimerKeyMapper)

`ConfigHandler` — Non-visual handler for loading persistent configuration from files.

### 13.2 WebClient (Current)

`SettingsPanel` — Modal dialog (256 lines).

**Toggles:**
- Hide vegetation on move
- Vehicle animations
- Sound (placeholder)
- Debug overlay

Persistence: localStorage (`spo_settings`).

### 13.3 Gap & Action Items

| Area | Legacy | WebClient | Status | Action |
|------|--------|-----------|--------|--------|
| Display settings | Resolution, quality | Vegetation, debug overlay | **PARTIAL** | Add quality settings |
| Sound toggle | Full MP3/SFX control | Placeholder toggle | **MISSING** | Implement sound system |
| Music | JukeBox (MP3 player) | Not implemented | **MISSING** | Add music player |
| Key bindings | TTimerKeyMapper | Not implemented | **MISSING** | Add key rebinding |
| Network settings | Latency/timeout | Not exposed | **LOW** | Not needed for browser |

---

## 14. Auxiliary Systems (Legacy-Only)

These systems exist in the Voyager client but have no WebClient equivalent yet:

### 14.1 Favorites System
- **Handler:** `FavoritesHandler` / `TFavoritesHandler`
- **Purpose:** Bookmark map locations for quick navigation
- **Dialog:** `MoveFavDlg` — Move/rename favorites
- **WebClient status:** **NOT IMPLEMENTED**
- **Priority:** MEDIUM — Quality-of-life feature

### 14.2 Transport / Train Management
- **Handler:** `TransportHandler` / `TPoolIdTrains`
- **Purpose:** Manage train routes between cities
- **WebClient status:** **NOT IMPLEMENTED**
- **Priority:** LOW — Requires game server transport infrastructure

### 14.3 Voice Chat
- **Handler:** `VoiceHandler` / `TVoicePanel`
- **Purpose:** Real-time voice communication (StarVoice multimedia)
- **WebClient status:** **NOT IMPLEMENTED**
- **Priority:** LOW — Modern alternative: integrate browser WebRTC

### 14.4 Economic Charts
- **Dialog:** `ChartWin` / `Plotter` / `PlotterGrid`
- **Purpose:** Detailed economic data visualization (stock-chart style)
- **WebClient status:** Only sparkline graphs in building inspector
- **Priority:** MEDIUM — Useful for advanced players

### 14.5 Changelog / Patch Notes
- **Dialog:** `ChangeLogView`
- **Purpose:** Display game update notes
- **WebClient status:** **NOT IMPLEMENTED**
- **Priority:** LOW

### 14.6 Hint System
- **Dialog:** `HintBoxWindow`
- **Purpose:** Contextual floating tooltips for game elements
- **WebClient status:** Basic button tooltips only
- **Priority:** MEDIUM — Tutorial/onboarding value

---

## 15. Design System Comparison

### 15.1 Legacy Visual Style
- **Era:** Early 2000s Windows application
- **Colors:** Dark blue/gray backgrounds, gold accents
- **Typography:** System fonts (MS Sans Serif / Tahoma)
- **Controls:** Native Win32 components (TButton, TLabel, TListView, TComboBox)
- **Panels:** Standard Delphi TPanel borders, BevelOuter
- **Images:** BMP/ICO resource files, animated GIFs

### 15.2 WebClient Visual Style
- **Era:** Modern glassmorphism (2024+ design trend)
- **Colors:** Slate palette (bg: #0F172A, text: #F1F5F9), primary blue (#0EA5E9)
- **Typography:** Inter (sans-serif) + JetBrains Mono (monospace)
- **Controls:** Custom DOM elements with CSS
- **Panels:** Frosted glass (`backdrop-filter: blur(12px)`, semi-transparent backgrounds)
- **Animations:** CSS transitions, ripple effects

### 15.3 Design Decision
The WebClient intentionally modernizes the visual style while preserving the legacy **layout, workflow, and feature set**. The glassmorphic design is a conscious upgrade. The focus of this user story is **functional parity**, not visual cloning.

---

## 16. Keyboard Shortcuts

| Shortcut | Legacy | WebClient | Status |
|----------|--------|-----------|--------|
| F1-F4 | Season selection | Not implemented | **MISSING** |
| F5 | Restore mode | Not implemented | **MISSING** |
| F9 | GM Client toggle | Not implemented | **MISSING** |
| F11 | Fullscreen | Not implemented (browser F11) | N/A |
| F12 | Debug info | Not implemented | **MISSING** |
| ESC | Cancel/close | Settings panel close | **PARTIAL** |
| M | N/A | Minimap toggle | **IMPROVEMENT** |
| D | N/A | Debug overlay | **IMPROVEMENT** |
| 3/4/5 | N/A | Debug layer toggles | **IMPROVEMENT** |

---

## 17. Priority Implementation Roadmap

### Phase 1: Critical Functional Parity (HIGH)

1. **Wire action button dispatch** — Films, Votes, Ministeries buttons → RDO commands
2. **ResGeneral missing properties** — Quality, Population, Crime, Pollution, Occupancy
3. **Workforce WorkersCap/MinSalaries** — Cell greying + minimum salary validation
4. **Fix TV read-back** — `mapRdoCommandToPropertyName()` property case
5. **Supplies sort/buy controls** — SortMode toggle + Selected checkbox UI
6. **Products price slider** — Inline slider in FingerTabs

### Phase 2: Feature Completeness (MEDIUM)

7. **Panel mutual exclusion** — Only one major panel open at a time (or toggle behavior)
8. **Game date display** — Virtual date in toolbar/stats area
9. **Money delta indicator** — Cash change (+/-) display
10. **Company name display** — In toolbar/stats area
11. **Connection progress dialog** — During login/world connection
12. **Recipient autocomplete** — Mail composition from player directory
13. **Channel creation** — Chat room creation dialog
14. **Facility search** — Search panel page for finding buildings by type
15. **Clone dialog params** — Town/company filtering for facility cloning

### Phase 3: Enhanced Experience (MEDIUM-LOW)

16. **Favorites system** — Bookmark map locations
17. **Building placement preview** — Ghost sprite on map during construction
18. **Economic charts** — Detailed chart dialogs (stock-chart style)
19. **Status LED indicators** — Server status, connection quality
20. **Busy/loading indicator** — Animated spinner during long operations
21. **News ticker** — Scrolling game events
22. **Hint/tooltip system** — Contextual help for game elements
23. **Season keyboard shortcuts** — F1-F4 for season cycling

### Phase 4: Polish & Advanced (LOW)

24. **Sound system** — Sound effects + background music
25. **Vehicle animations** — Cars/trucks on roads
26. **Multi-zoom** — Multiple zoom levels for map
27. **Edge-scrolling** — Mouse-at-edge map scrolling
28. **Key rebinding** — Customizable keyboard shortcuts
29. **Avatar/picture selector** — Profile picture from PictureShop
30. **GM Chat** — Game master communication (admin only)
31. **Transport UI** — Train route management

---

## 18. Component Inventory Summary

| Component | Legacy Handler | WebClient Class | Lines | Parity |
|-----------|---------------|-----------------|-------|--------|
| App Shell | TVoyagerWin + TFrameSet | UIManager | 369 | 85% |
| Map View | MapIsoHandler | MapNavigationUI | 161 | 80% |
| Toolbar | ToolbarHandler | ToolbarUI | 464 | 65% |
| Stats | (in toolbar) | TycoonStatsUI | 338 | 70% |
| Building Inspector | ObjectInspectorHandler | BuildingDetailsPanel | 1,128 | 90% |
| Property Renderers | (per SheetHandler form) | property-renderers.ts | 1,134 | 85% |
| Property Tables | (per SheetHandler form) | property-table.ts | 455 | 80% |
| Property Graphs | (Plotter components) | property-graph.ts | 208 | 60% |
| Connection Picker | InputSelectionForm | connection-picker-dialog.ts | 258 | 80% |
| Search | InputSearch + OutputSearch | SearchMenuPanel | 636 | 70% |
| Mail | MsgComposerHandler | MailPanel | 732 | 80% |
| Chat | ChatHandler + ChatListHandler | ChatUI | 928 | 75% |
| Profile | OptionsHandler + HTML | ProfilePanel | 1,179 | 85% |
| Politics | PoliticSheetViewer | PoliticsPanel | 429 | 60% |
| Build Menu | VisualClassesHandler | BuildMenuUI | 464 | 75% |
| Minimap | UniversalMapHandler | MinimapUI | 280 | 100%+ |
| Settings | ConfigHandler + OptionsHandler | SettingsPanel | 256 | 50% |
| Login | LogonHandler | LoginUI | 413 | 85% |
| **TOTAL** | **23 handlers** | **14 components** | **~11,600** | **~77%** |

---

## 19. Testing Strategy

All UI changes must maintain **93%+ test coverage** (project requirement).

**Existing test suites (UI):**
- `building-details-panel.test.ts` — Panel rendering, tab switching, owner checks
- `building-refresh-handler.test.ts` — Auto-refresh, smart refresh timing
- `property-renderers.test.ts` — Property type formatting
- `chat-ui.test.ts` — Message history, channel switching
- `minimap-ui.test.ts` — Rendering, viewport calculation
- `settings-panel.test.ts` — localStorage persistence
- `tycoon-stats-ui.test.ts` — Stats updates

**Test environment:** Node.js (no jsdom). DOM elements mocked as plain objects.

**E2E testing:** Via Playwright MCP server. See [E2E-TESTING.md](E2E-TESTING.md) for credentials and procedures.

---

*This document should be updated as features are implemented. Cross-reference with [FACILITY-INSPECTOR-GAP-ANALYSIS.md](FACILITY-INSPECTOR-GAP-ANALYSIS.md) for building inspector specifics and [BACKLOG.md](BACKLOG.md) for overall project tracking.*