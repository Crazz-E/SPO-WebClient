# src/client/ — Browser Client (React + Canvas 2D)

## Zustand Stores

All stores in `store/`. Created with `create()` and `subscribeWithSelector` middleware.

Patterns:
- **Map-based caches** for keyed data (buildings, research categories)
- **Optimistic updates**: `PendingUpdate` -> confirmed/failed with `ConfirmedUpdate`/`FailedUpdate` tracking timestamps
- **Tab load state**: `'idle' | 'loading' | 'loaded' | 'error'` for lazy-loaded tab data
- Always unsubscribe in cleanup (`useEffect` return)

Main store: `useGameStore` (connection status, server startup state).
Building store: `useBuildingStore` (focus, details panel, overlays, research).

## CSS Modules

All styles use `.module.css` with scoped class names. No CSS-in-JS.

```tsx
import styles from './MyComponent.module.css';
```

## Canvas Renderer

Custom 2D isometric engine in `renderer/`. The main file is `isometric-map-renderer.ts` (~195KB monolith).

Render layers (back to front): terrain base -> vegetation -> concrete -> roads -> buildings -> zone overlay -> placement preview -> road preview -> UI overlays.

Uses chunk caching and texture atlases. No Three.js. Performance-critical code -- profile before optimizing.

Input handling: `renderer/touch-handler-2d.ts` for canvas mouse/touch events.

## Component Structure

Each component folder contains: main component + optional `.module.css` + optional utils + optional `__tests__/` + `index.ts` barrel export.

## ClientContext

`useClient()` hook (from `context/ClientContext.tsx`) provides server communication callbacks. Components must use this hook -- never import the bridge module directly.

## Handlers

`handlers/` directory maps incoming WS messages to store updates. Key files: `auth-handler`, `map-handler`, `building-focus-handler`, `chat-handler`, `road-handler`, `zone-handler`, `build-menu-handler`, `event-handler`, `building-action-handler`.

Reconnection logic in `handlers/reconnect-utils.ts`. Handler utilities in `handlers/handler-utils.ts`.

New message types need a handler registered in `handlers/index.ts`.

## Lazy Loading

Modals (e.g., `CompanyCreationModal`) and research inventory tabs load on demand via `React.lazy()`. Do not eagerly fetch data for tabs/panels not yet visible.

## Keyboard Shortcuts

Global shortcuts registered in `hooks/useKeyboardShortcuts.ts` (B, E, M, R, D, Escape, Cmd+K). Canvas-specific input in the renderer's touch handler.

## App Entry Point

`App.tsx` routes between `LoginScreen` and `GameScreen` based on `useGameStore.status`. Shows `ServerStartupScreen` until backend is ready.
