---
name: zustand-store-ts
description: "TRIGGER: When creating or modifying a Zustand store in src/client/store/. Covers subscribeWithSelector, state/action separation, and the selector-stability rules that prevent React error #185."
user-invokable: false
disable-model-invocation: false
---

# Zustand Stores

Stores live in `src/client/store/` — one file per domain:
`building`, `chat`, `empire`, `game`, `log`, `mail`, `politics`, `profile`, `search`,
`transport`, `ui`. Tests sit beside them as `<name>-store.test.ts`.

## Selector stability comes first

This is the highest-frequency real bug in the client, not a style preference. A selector
that builds a new reference on every call causes React error #185 (maximum update depth
exceeded) — an infinite re-render loop, not a warning.

| Wrong | Right | Why |
|-------|-------|-----|
| `useStore((s) => s.data?.items ?? [])` | `useStore((s) => s.data?.items) ?? []` | Fallback **inside** the selector returns a fresh `[]` every render |
| `useStore((s) => s.data?.obj ?? {})` | `useStore((s) => s.data?.obj) ?? {}` | Same, with `{}` |
| `useStore((s) => s.items.filter(...))` | select `s.items`, then `useMemo` | `.filter()` allocates a new array every render |
| `useStore((s) => ({ a: s.a, b: s.b }))` | two separate selector calls | Object literal is a new reference every time |

**Rule:** never write `?? []`, `?? {}`, or `|| []` inside a selector body. Move the
fallback outside the call.

## Always wrap in subscribeWithSelector

```typescript
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set, get) => ({
    // state and actions
  }))
);
```

Non-React code (the renderer, the WebSocket bridge) subscribes to slices directly, which
requires this middleware:

```typescript
useGameStore.subscribe(
  (state) => state.selectedBuildingId,
  (id) => renderer.highlight(id)
);
```

## Separate state from actions

```typescript
export interface BuildingState {
  buildings: Building[];
  isLoading: boolean;
}

export interface BuildingActions {
  addBuilding: (b: Building) => void;
  loadBuildings: () => Promise<void>;
}

export type BuildingStore = BuildingState & BuildingActions;
```

## Actions that reach the server

A store action that mutates game state does not write to the socket itself — it goes
through the bridge, which owns RDO framing and the request lifecycle. The full chain must
be complete before the UI element ships:

```
onClick → store action → bridge method → RDO command → response handler → store update → UI
```

Never leave an action that only sets local state when the server also needs to know.

## Checklist

- [ ] No `??`/`||` fallback inside any selector
- [ ] `subscribeWithSelector` applied
- [ ] State and action interfaces declared separately
- [ ] No `any` — `unknown` in catch blocks, `toErrorMessage(err)` from `@/shared/error-utils`
- [ ] Test added at `src/client/store/<name>-store.test.ts` (coverage floor 93%)
