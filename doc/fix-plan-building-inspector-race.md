# Fix Plan: Building Inspector RDO Data Not Always Displaying

**Date:** 2026-04-04
**Status:** Analysis complete, implementation pending
**Skills used:** code-guardian, building-inspector, rdo-protocol (analysis phase)

## Root Cause

**Server-side race condition between `refreshBuildingProperties()` and `getBuildingTabData()`** in
`src/server/session/building-details-handler.ts`.

### The Race

1. User opens building inspector → `getBuildingBasicDetails()` creates an `ActiveInspector`
   with a Delphi temp object pointing at the building root. Properties read correctly.

2. User clicks a lazy tab (Supplies/Products) → `getBuildingTabData()`:
   - Acquires the inspector's **AsyncMutex**
   - Calls `SetPath('input.xxx\folder\...')` on the inspector's temp object
   - Reads supply/product properties from the supply gate context
   - Releases the mutex
   - **The temp object is LEFT pointing at the last supply gate path, NOT the building root**

3. `EVENT_BUILDING_REFRESH` fires (~5s interval) → `refreshBuildingProperties()`:
   - Finds the ActiveInspector ✓
   - **Does NOT acquire the mutex** (bug #1)
   - **Does NOT reset the object to building root** via `cacherSetObject` (bug #2)
   - Calls `fetchPropertiesAndGroups()` → `cacherGetPropertyList('Workers0', 'Revenue', ...)`
   - **Reads from the supply gate context** → building-level properties return empty/wrong values
   - Returns response with **corrupted/empty groups**

4. Client receives the refresh response → `updateBuildingDetails()` → `setDetails()`:
   - `isSameBuilding = true` → **overwrites good initial groups with corrupted data**
   - The safety check `!hasAnyGroupData && current?.groups` doesn't catch partial corruption
     (some groups may have accidental data if property names overlap)

5. **User sees empty/wrong property values**. Manual refresh works because
   `refreshBuildingDetails()` → `requestBuildingDetails()` → server's `getBuildingBasicDetails()`
   releases the old inspector and creates a **fresh temp object from scratch**.

### Key Evidence

- `SetPath` comment at line 1154: *"SetPath fully resets TCachedObjectWrap internal state"*
- `refreshBuildingProperties()` (line 451-526): no mutex, no `cacherSetObject`
- `getBuildingTabData()` (line 348): acquires mutex, does `SetPath` on shared temp object
- Single-worker path (≤3 supply/product paths, most buildings) uses the inspector's
  own temp object for `SetPath`, leaving it in a modified state

### Why It's Intermittent

The race only triggers when:
- A lazy tab (Supplies/Products) was loaded **before** the next `EVENT_BUILDING_REFRESH`
- The refresh fires while the temp object's path is still set to a supply/product sub-path
- With the ~5s refresh interval and tab loading taking 1-8s, this is frequent but not guaranteed

## Fix Plan

### Fix 1: Acquire mutex + reset object in `refreshBuildingProperties()` (CRITICAL)

**File:** `src/server/session/building-details-handler.ts`, function `refreshBuildingProperties()`

```typescript
export async function refreshBuildingProperties(
  ctx: SessionContext,
  x: number,
  y: number,
  visualClass: string,
): Promise<BuildingDetailsResponse> {
  const inspector = getActiveInspector(ctx, x, y);

  if (!inspector) {
    ctx.log.debug(`[BuildingDetails] No active inspector for (${x},${y}), falling back to full fetch`);
    return getBuildingBasicDetails(ctx, x, y, visualClass);
  }

  ctx.log.debug(`[BuildingDetails] Refreshing properties on existing inspector obj=${inspector.tempObjectId} at (${x},${y})`);

  const template = getTemplateForVisualClass(visualClass);
  const { tempObjectId, mutex } = inspector;  // ← destructure mutex

  // FIX: Acquire the inspector's mutex to prevent concurrent SetPath from
  // getBuildingTabData() corrupting the temp object's path context.
  const release = await mutex.acquire();

  try {
    // FIX: Reset the temp object back to building root. A previous tab data
    // request (supplies/products) may have called SetPath, leaving the object
    // pointed at a supply gate sub-path. Without this reset, GetPropertyList
    // reads from the wrong context and returns empty/wrong building properties.
    await ctx.cacherSetObject(tempObjectId, x, y);

    const { allValues, groups, moneyGraph } = await fetchPropertiesAndGroups(ctx, tempObjectId, template);

    // ... rest of the function stays the same ...

    return response;
  } catch (e: unknown) {
    ctx.log.warn(`[BuildingDetails] Refresh failed on existing object, falling back to full create:`, toErrorMessage(e));
    releaseInspector(ctx);
    return getBuildingBasicDetails(ctx, x, y, visualClass);
  } finally {
    release();  // ← release mutex
  }
}
```

### Fix 2 (Optional hardening): Strengthen `updateBuildingDetails` safety check

**File:** `src/client/bridge/client-bridge.ts`, function `updateBuildingDetails()`

Currently: rejects only when ALL groups are empty.
Better: also reject when group count dropped significantly (partial corruption).

```typescript
updateBuildingDetails(details: BuildingDetailsResponse): void {
    const current = useBuildingStore.getState().details;
    if (current && (current.x !== details.x || current.y !== details.y)) return;

    const hasAnyGroupData = Object.values(details.groups).some(props => props.length > 0);
    if (!hasAnyGroupData && current?.groups) {
      ClientBridge.log('Building', 'Rejected refresh with empty property groups (corrupted response)');
      return;
    }

    // NEW: Reject refresh if most groups lost their data (partial corruption from SetPath race)
    if (current?.groups) {
      const currentNonEmpty = Object.values(current.groups).filter(p => p.length > 0).length;
      const newNonEmpty = Object.values(details.groups).filter(p => p.length > 0).length;
      if (currentNonEmpty > 0 && newNonEmpty < currentNonEmpty * 0.5) {
        ClientBridge.log('Building', `Rejected refresh: group count dropped from ${currentNonEmpty} to ${newNonEmpty} (possible corruption)`);
        return;
      }
    }

    useBuildingStore.getState().setDetails(details);
}
```

## Files to Modify

| File | Change |
|------|--------|
| `src/server/session/building-details-handler.ts` | Add mutex + `cacherSetObject` in `refreshBuildingProperties()` |
| `src/client/bridge/client-bridge.ts` | (Optional) Strengthen `updateBuildingDetails` safety check |

## Testing

1. Unit test: mock concurrent `getBuildingTabData` + `refreshBuildingProperties` on same inspector
2. E2E: open building, click Supplies tab, wait for periodic refresh → verify properties don't disappear
3. Regression: verify manual refresh still works, verify lazy tab loading still works
