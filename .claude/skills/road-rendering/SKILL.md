---
name: road-rendering
description: "Road rendering: topology detection, texture mapping, INI loading, and the critical code-variable vs screen-direction gotcha."
user-invokable: false
disable-model-invocation: false
---

# Road Rendering

Auto-loaded when working on `road-texture-system.ts`, `road-renderer-system.ts`, `road-topology-analyzer.ts`, or road rendering tasks.

## CRITICAL: Code Variables vs Screen Directions

**The code uses N/S/E/W variable names that do NOT match visual screen directions!**

| Code Variable | Array Offset | Actual Screen Position |
|---------------|-------------|------------------------|
| `hasN` (i-1) | row above | **SOUTH-EAST** (right-down) |
| `hasS` (i+1) | row below | **NORTH-WEST** (left-up) |
| `hasE` (j+1) | col right | **NORTH-EAST** (right-up) |
| `hasW` (j-1) | col left | **SOUTH-WEST** (left-down) |

This is because the isometric projection rotates the coordinate system. Always verify against `doc/ROAD-TEXTURE-MAPPING.md` when touching topology code.

## Architecture

```
RoadRendererSystem (Main Entry Point)
├── RoadGrid (Road tile storage + neighbor lookups)
├── RoadTerrainData (Water + Concrete grids)
├── RoadTopologyAnalyzer (16 topology types + state transitions)
├── RoadSurfaceDetector (11 surface types)
└── RoadTextureMapper (BMP filename generation)
```

## Topology Types (16)

| Type | Texture | Connect |
|------|---------|---------|
| NS_START/END/MIDDLE | Roadvert.bmp | SE ↔ NW (diagonal `/`) |
| WE_START/END/MIDDLE | Roadhorz.bmp | NE ↔ SW (diagonal `\`) |
| CORNER_W / CORNER_E / CORNER_N / CORNER_S | RoadcornerX.bmp | 2-way turns |
| T_N / T_E / T_S / T_W | RoadTX.bmp | 3-way T-junctions |
| XCROSS | Roadcross.bmp | 4-way intersection |

## Surface Types (11)

| Type | Texture Prefix | Condition |
|------|---------------|-----------|
| LAND | `Road*.bmp` | Default |
| URBAN | `ConcreteRoad*.bmp` | Near urban buildings |
| BRIDGE_* (9) | `*Bridge*.bmp` | Over water |

## Key Gotchas

- `ROAD_TYPE` constants are `as const` — use explicit `number` type annotation for local variables
- Water detection: BMP palette `cPlatformFlag = 0x80`, use `isWater()` function
- Road tiles stored as `"${x},${y}"` (col,row) — same as concrete coordinate convention

## INI Format

```ini
[General]
Id = 3
[Images]
64X32 = RoadcornerW.bmp
```

## Tests (153 total, 100% passing)

```bash
npm test -- road-topology-analyzer    # 57 tests
npm test -- road-terrain-grid         # 22 tests
npm test -- road-surface-detector     # 14 tests
npm test -- road-texture-mapper       # 33 tests
npm test -- road-renderer-system      # 27 tests
```

## Deep-Dive References

- [Road Rendering System](../../../doc/road_rendering.md) — API, quick start, data types
- [Road Rendering Reference](../../../doc/road_rendering_reference.md) — Reverse-engineered algorithms, state transitions
- [Road Texture Mapping](../../../doc/ROAD-TEXTURE-MAPPING.md) — Definitive texture↔topology mapping with ASCII art