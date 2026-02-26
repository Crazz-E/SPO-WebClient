# Proposition de Refactorisation du Moteur Graphique

**Date:** Février 2026
**Statut:** Proposition d'architecture - En attente de validation
**Portée:** Remplacement complet du pipeline de rendu client

---

## Table des matières

1. [Résumé exécutif](#1-résumé-exécutif)
2. [Analyse de l'existant](#2-analyse-de-lexistant)
3. [Objectifs de la refactorisation](#3-objectifs-de-la-refactorisation)
4. [Architecture proposée](#4-architecture-proposée)
5. [Couche d'abstraction des assets](#5-couche-dabstraction-des-assets)
6. [Système de rendu 3D](#6-système-de-rendu-3d)
7. [Système de terrain](#7-système-de-terrain)
8. [Système de bâtiments](#8-système-de-bâtiments)
9. [Système de routes](#9-système-de-routes)
10. [Système de béton](#10-système-de-béton)
11. [Animations de véhicules](#11-animations-de-véhicules)
12. [Interactions utilisateur](#12-interactions-utilisateur)
13. [Overlays et UI in-world](#13-overlays-et-ui-in-world)
14. [Optimisations mobile](#14-optimisations-mobile)
15. [Pipeline de migration des assets](#15-pipeline-de-migration-des-assets)
16. [Plan de migration par phases](#16-plan-de-migration-par-phases)
17. [Risques et mitigations](#17-risques-et-mitigations)
18. [Décisions ouvertes](#18-décisions-ouvertes)

---

## 1. Résumé exécutif

### Constat

Le moteur graphique actuel repose sur trois renderers (Canvas2D, Three.js, PixiJS) qui partagent une projection isométrique fixe à 4 angles de rotation discrète et 4 niveaux de zoom fixes. Les textures sont des BMP/GIF hérités du client Delphi original (64×32 pixels, transparence par color-key). La rotation à 360° n'est pas supportée et le style visuel est daté.

### Proposition

Refactoriser vers un moteur unique basé sur **Three.js** avec :
- Une **vraie scène 3D** permettant rotation libre à 360°, zoom continu et inclinaison
- Un **nouveau style visuel city-builder** avec des assets modernes (modèles 3D low-poly ou sprites haute résolution)
- Un **système de mapping** qui conserve les fichiers INI/CSV du serveur comme source de vérité unique et les mappe vers de nouveaux assets
- Des **animations côté client** de véhicules (voitures, camions, avions, bateaux)
- Une **optimisation mobile-first** avec LOD, instancing et culling spatial

### Pourquoi Three.js

| Critère | PixiJS (actuel) | Three.js (proposé) |
|---------|-----------------|---------------------|
| Rotation 360° | Impossible (2D) | Natif (caméra orbitale) |
| Zoom continu | Limitée (scale) | Natif (caméra perspective/ortho) |
| Modèles 3D | Non | Natif (glTF, instancing) |
| Shaders custom | Limité | Complet (GLSL) |
| LOD intégré | Non | Oui (`THREE.LOD`) |
| Instanced rendering | Non | Oui (`InstancedMesh`) |
| Mobile WebGL | Oui | Oui |
| Maturité | Excellente (2D) | Excellente (3D) |

---

## 2. Analyse de l'existant

### 2.1 Architecture actuelle du rendu

```
src/client/renderer/
├── Shared (cross-renderer)
│   ├── painter-algorithm.ts      # Tri par (i+j) descendant
│   ├── coordinate-mapper.ts      # Lander.pas: (i,j) ↔ screen (x,y)
│   ├── terrain-loader.ts         # Parse BMP 8-bit → Uint8Array de landId
│   ├── texture-cache.ts          # LRU cache ImageBitmap (200 max)
│   ├── chunk-cache.ts            # Pré-rendu 32×32 tuiles → OffscreenCanvas
│   ├── game-object-texture-cache.ts  # Cache routes/bâtiments/béton
│   ├── road-texture-system.ts    # Topologie routes → fichier texture INI
│   └── concrete-texture-system.ts # Voisins béton → fichier texture INI
│
├── pixi/ (renderer par défaut)
│   ├── pixi-renderer.ts          # Orchestrateur principal (44KB)
│   ├── sprite-pool.ts            # Pool de sprites réutilisables
│   ├── texture-atlas-manager.ts  # Atlas GPU PixiJS
│   └── layers/                   # Couches de rendu
│       ├── pixi-terrain-layer.ts
│       ├── pixi-building-layer.ts
│       ├── pixi-road-layer.ts
│       ├── pixi-concrete-layer.ts
│       └── pixi-overlay-layer.ts
│
├── three/ (renderer alternatif)
│   ├── IsometricThreeRenderer.ts # Orchestrateur (43KB)
│   ├── CameraController.ts       # Caméra orthographique pan/zoom
│   └── ... (8 fichiers)
│
└── isometric-map-renderer.ts     # Canvas2D legacy (84KB)
```

### 2.2 Format des données terrain

Chaque tuile est un octet (landId) dans un BMP 8-bit :

```
Bit:  7   6 │ 5   4   3   2 │ 1   0
      └─────┴───────────────┴─────┘
      LandClass  LandType    LandVar
      (2 bits)   (4 bits)    (2 bits)
```

- **LandClass** (0-3) : Grass / MidGrass / DryGround / Water
- **LandType** (0-13) : Center / Edges N/E/S/W / Corners (inner+outer) / Special
- **LandVar** (0-3) : Variation visuelle

Ce format **ne change pas** — c'est notre source de vérité serveur.

### 2.3 Mapping INI existant

| Catégorie | Fichiers INI | Format ID | Exemple texture |
|-----------|-------------|-----------|-----------------|
| Terrain | `LandClasses/*.ini` (162) | Palette index (0-255) | `land.128.DryGroundCenter0.bmp` |
| Routes | `RoadBlockClasses/*.ini` (60) | Topologie + surface | `CountryRoadvert.bmp` |
| Béton | `ConcreteClasses/*.ini` (13) | Config voisins | `Conc4.bmp` |
| Bâtiments | `facility_db.csv` (339) | Visual class string | `MapDissOfficeBuildingA64x32x0.gif` |

### 2.4 Ce qu'on conserve

- Le serveur de jeu, le protocole RDO et toutes les API WebSocket
- Le format BMP terrain (Uint8Array de landId)
- Les fichiers INI/CSV comme identifiants logiques
- `land-utils.ts` (décodage landId)
- Les handlers client-serveur (`client.ts`, messages WS)
- Les systèmes de topologie (`road-texture-system.ts`, `concrete-texture-system.ts`) — leur logique de calcul des voisins/topologie, pas leur résolution de texture

### 2.5 Ce qu'on retire

- Les trois renderers actuels (Canvas2D, Three.js existant, PixiJS)
- Le pipeline de textures BMP/GIF (texture-cache, game-object-texture-cache)
- La projection isométrique Lander.pas (remplacée par une vraie scène 3D)
- Le painter's algorithm manuel (remplacé par le z-buffer GPU natif)
- Le chunk-cache OffscreenCanvas (remplacé par l'instancing GPU)

---

## 3. Objectifs de la refactorisation

### 3.1 Fonctionnels

| # | Objectif | Priorité |
|---|----------|----------|
| F1 | Rotation 360° libre par glissé (touch + souris) | P0 |
| F2 | Zoom continu (pinch-to-zoom + molette) | P0 |
| F3 | Déplacement par glissé (pan) | P0 |
| F4 | Nouveau style visuel city-builder | P0 |
| F5 | Animations véhicules (voitures, camions, avions, bateaux) | P1 |
| F6 | Sélection de bâtiment (click/tap) | P0 |
| F7 | Construction/destruction de bâtiment avec prévisualisation | P0 |
| F8 | Construction de routes avec prévisualisation staircase | P0 |
| F9 | Overlays d'information (zones, pollution, ...) | P1 |
| F10 | Affichage synthétique au-dessus des bâtiments (soft select) | P2 |
| F11 | Support multi-terrain (Earth, Alien Swamp) + saisons | P1 |

### 3.2 Non-fonctionnels

| # | Objectif | Cible |
|---|----------|-------|
| NF1 | 60 FPS sur mobile milieu de gamme | Snapdragon 7xx / A15+ |
| NF2 | Temps de chargement initial < 5s (hors réseau) | Après cache |
| NF3 | Mémoire GPU < 256 MB | Mobile constraint |
| NF4 | 0 changement côté serveur | Compatibilité totale |
| NF5 | Tests >= 93% coverage maintenus | CI/CD |

---

## 4. Architecture proposée

### 4.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Browser                           │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────────┐   │
│  │  UI Layer     │   │ Game Logic   │   │ Asset Mapping     │   │
│  │  (HTML/CSS)   │   │ (client.ts)  │   │ Layer             │   │
│  │              │   │              │   │ (INI→new assets)  │   │
│  └──────┬───────┘   └──────┬───────┘   └────────┬──────────┘   │
│         │                  │                     │              │
│  ┌──────┴──────────────────┴─────────────────────┴──────────┐   │
│  │                    Renderer Interface                      │   │
│  │               (IGameRenderer contract)                     │   │
│  └──────────────────────┬────────────────────────────────────┘   │
│                         │                                        │
│  ┌──────────────────────┴────────────────────────────────────┐   │
│  │                  Three.js Game Engine                       │   │
│  │                                                            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │   │
│  │  │ Camera   │ │ Scene    │ │ Lighting │ │ PostProcess │  │   │
│  │  │ System   │ │ Graph    │ │ System   │ │ Pipeline    │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └─────────────┘  │   │
│  │                                                            │   │
│  │  ┌───────────────── Render Layers ──────────────────────┐  │   │
│  │  │                                                      │  │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │  │   │
│  │  │  │ Terrain  │ │ Roads &  │ │ Building │            │  │   │
│  │  │  │ Layer    │ │ Concrete │ │ Layer    │            │  │   │
│  │  │  │(Instanced│ │ Layer    │ │(Instanced│            │  │   │
│  │  │  │ Mesh)    │ │(Instanced│ │ Mesh/LOD)│            │  │   │
│  │  │  └──────────┘ │ Mesh)    │ └──────────┘            │  │   │
│  │  │               └──────────┘                          │  │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │  │   │
│  │  │  │ Vehicle  │ │ Overlay  │ │ Preview  │            │  │   │
│  │  │  │ Animation│ │ Layer    │ │ Layer    │            │  │   │
│  │  │  │ System   │ │(Zones,   │ │(Ghost    │            │  │   │
│  │  │  │          │ │ Info)    │ │ builds)  │            │  │   │
│  │  │  └──────────┘ └──────────┘ └──────────┘            │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                  Spatial Index (QuadTree)                    │   │
│  │        Click detection, culling, LOD, zone queries          │   │
│  └────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

### 4.2 Structure de fichiers proposée

```
src/client/renderer/
├── core/                          # Noyau du moteur (framework-agnostic logic)
│   ├── IGameRenderer.ts           # Interface/contrat du renderer
│   ├── coordinate-system.ts       # Conversion (i,j) ↔ world 3D
│   ├── spatial-index.ts           # QuadTree pour culling + hit-test
│   └── camera-state.ts            # État caméra sérialisable
│
├── engine/                        # Three.js engine
│   ├── GameEngine.ts              # Point d'entrée principal
│   ├── SceneManager.ts            # Gestion scene graph
│   ├── CameraSystem.ts            # Orbital camera (rotation, zoom, pan)
│   ├── LightingSystem.ts          # Éclairage dynamique (jour/nuit, saisons)
│   ├── RenderPipeline.ts          # Post-processing (SSAO, bloom, fog)
│   └── InputManager.ts            # Souris, touch, clavier unifiés
│
├── layers/                        # Couches de rendu
│   ├── TerrainLayer.ts            # Heightmap mesh + materials
│   ├── RoadLayer.ts               # Routes instancées
│   ├── ConcreteLayer.ts           # Béton instancé
│   ├── BuildingLayer.ts           # Bâtiments LOD + instancing
│   ├── VehicleLayer.ts            # Animations véhicules
│   ├── WaterLayer.ts              # Surface d'eau animée (shader)
│   ├── OverlayLayer.ts            # Zones, pollution, données
│   └── PreviewLayer.ts            # Prévisualisation construction
│
├── assets/                        # Pipeline de chargement
│   ├── AssetMapper.ts             # INI/CSV ID → nouveau asset
│   ├── AssetManifest.ts           # Registre de tous les assets
│   ├── TerrainMaterialFactory.ts  # Matériaux terrain par biome/saison
│   ├── BuildingModelLoader.ts     # Chargement modèles 3D bâtiments
│   ├── RoadModelFactory.ts        # Génération meshes routes
│   └── VehicleModelLoader.ts      # Modèles véhicules animés
│
├── systems/                       # Systèmes logiques
│   ├── road-topology.ts           # CONSERVÉ: logique topologie routes
│   ├── concrete-neighbors.ts      # CONSERVÉ: logique voisins béton
│   ├── placement-validator.ts     # Validation placement bâtiments
│   ├── road-path-builder.ts       # Algorithme staircase routes
│   └── vehicle-traffic.ts         # Simulation trafic client-side
│
└── legacy/                        # Adaptateurs legacy (transition)
    ├── terrain-loader.ts          # CONSERVÉ: parse BMP terrain
    └── land-utils.ts              # CONSERVÉ: décodage landId (shared)
```

### 4.3 Interface du renderer (contrat)

```typescript
/**
 * Contrat stable entre la logique de jeu et le moteur de rendu.
 * Toute implémentation de renderer doit respecter cette interface.
 */
interface IGameRenderer {
  // === Lifecycle ===
  initialize(container: HTMLElement, mapData: TerrainData): Promise<void>;
  dispose(): void;
  resize(width: number, height: number): void;

  // === Camera ===
  setCamera(params: CameraParams): void;
  getCamera(): CameraParams;
  centerOn(mapI: number, mapJ: number): void;
  screenToMap(screenX: number, screenY: number): MapCoord | null;

  // === Game Objects ===
  setBuildings(buildings: MapBuilding[]): void;
  setRoadSegments(segments: MapSegment[]): void;

  // === Terrain & Season ===
  setSeason(season: Season): void;
  setTerrainStyle(style: string): void;

  // === Interactions ===
  setPlacementMode(enabled: boolean, config?: PlacementConfig): void;
  setRoadDrawingMode(enabled: boolean): void;
  setZoneOverlay(enabled: boolean, data?: SurfaceData, x?: number, y?: number): void;

  // === Events (callbacks) ===
  onBuildingClick: (x: number, y: number, visualClass: string) => void;
  onRoadSegmentComplete: (x1: number, y1: number, x2: number, y2: number) => void;
  onCameraChange: (params: CameraParams) => void;
  onLoadZone: (x: number, y: number, w: number, h: number) => void;
}

interface CameraParams {
  // Position sur la carte (coordonnées map i,j)
  targetI: number;
  targetJ: number;
  // Orbite
  azimuth: number;      // 0-360° rotation horizontale
  elevation: number;    // 20-80° angle vertical
  distance: number;     // Distance zoom (continu)
}

interface MapCoord {
  i: number;
  j: number;
}
```

---

## 5. Couche d'abstraction des assets

### 5.1 Principe fondamental

**Le serveur ne change pas.** Tous les identifiants (landId, road topology, concrete ID, visual class) restent identiques. La couche d'abstraction traduit ces identifiants vers de nouveaux assets visuels.

```
Serveur (inchangé)                     Client (nouveau)
┌─────────────────┐                    ┌──────────────────────┐
│ landId = 0x84   │───── parse ───────>│ LandClass: DryGround │
│ (DryGround,     │                    │ LandType: N (edge)   │
│  North edge,    │                    │ LandVar: 0           │
│  var 0)         │                    └──────────┬───────────┘
│                 │                               │
│ INI: Id=132     │                    ┌──────────▼───────────┐
│ 64x32=land.132  │                    │    AssetMapper        │
│  .DryGroundN0   │                    │                      │
│  .bmp           │                    │ OLD: land.132.bmp    │
└─────────────────┘                    │ NEW: terrain material│
                                       │      "arid_edge_N"  │
                                       │      with normal map │
                                       └──────────────────────┘
```

### 5.2 Fichier de mapping (asset-manifest.json)

```jsonc
{
  "version": 1,
  "style": "modern-citybuilder",

  // Terrain: LandClass + LandType → matériau 3D
  "terrain": {
    "materials": {
      "grass": {
        "diffuse": "textures/terrain/grass_diffuse.webp",
        "normal": "textures/terrain/grass_normal.webp",
        "variants": 4,
        "seasons": {
          "winter": { "diffuse": "textures/terrain/grass_winter.webp" },
          "spring": { "diffuse": "textures/terrain/grass_spring.webp" },
          "summer": { "diffuse": "textures/terrain/grass_summer.webp" },
          "autumn": { "diffuse": "textures/terrain/grass_autumn.webp" }
        }
      },
      "midgrass": { /* ... */ },
      "dryground": { /* ... */ },
      "water": {
        "shader": "water-animated",
        "color": "#1a6b8a",
        "waveSpeed": 0.5
      }
    },
    // LandClass → material name
    "classMapping": {
      "ZoneA": "grass",
      "ZoneB": "midgrass",
      "ZoneC": "dryground",
      "ZoneD": "water"
    },
    // LandType → mesh deformation ou edge blending
    "edgeBlending": {
      "mode": "shader",  // "shader" ou "mesh"
      "transitionWidth": 0.3
    }
  },

  // Routes: topology ID → modèle 3D
  "roads": {
    "land": {
      "straight_NS": "models/roads/road_straight.glb",
      "straight_WE": "models/roads/road_straight.glb",  // rotation 90°
      "corner_N": "models/roads/road_corner.glb",
      "t_junction": "models/roads/road_t.glb",
      "crossroads": "models/roads/road_cross.glb"
    },
    "urban": {
      "straight_NS": "models/roads/urban_straight.glb"
      // ... variantes urbaines
    },
    "bridge": {
      "straight_NS": "models/roads/bridge_ns.glb"
    }
  },

  // Bâtiments: visualClass → modèle 3D avec LOD
  "buildings": {
    // Mapping par visualClass (identifiant serveur)
    "2951": {
      "name": "Office Building A",
      "model": "models/buildings/office_a.glb",
      "lod": [
        { "distance": 50, "model": "models/buildings/office_a_lod1.glb" },
        { "distance": 150, "model": "models/buildings/office_a_lod2.glb" },
        { "distance": 400, "simplify": "billboard" }
      ],
      "footprint": { "x": 2, "y": 2 },
      "height": 3.5,
      "animations": ["idle", "active"]
    },
    // Fallback par catégorie pour les bâtiments sans modèle custom
    "_fallback_residential": {
      "model": "models/buildings/generic_residential.glb"
    },
    "_fallback_commercial": {
      "model": "models/buildings/generic_commercial.glb"
    },
    "_fallback_industrial": {
      "model": "models/buildings/generic_industrial.glb"
    }
  },

  // Béton: concrete ID → material/mesh
  "concrete": {
    "land": {
      "center": "textures/concrete/pavement.webp",
      "edge_N": "textures/concrete/pavement_edge.webp"
    },
    "water_platform": {
      "center": "models/platforms/dock_center.glb",
      "edge": "models/platforms/dock_edge.glb"
    }
  },

  // Véhicules
  "vehicles": {
    "car_small": {
      "model": "models/vehicles/car_small.glb",
      "speed": 2.0,
      "scale": 0.3
    },
    "truck": {
      "model": "models/vehicles/truck.glb",
      "speed": 1.5,
      "scale": 0.4
    },
    "airplane": {
      "model": "models/vehicles/airplane.glb",
      "speed": 8.0,
      "altitude": 5.0,
      "scale": 0.6
    },
    "boat": {
      "model": "models/vehicles/boat.glb",
      "speed": 1.0,
      "waterOnly": true,
      "scale": 0.5
    }
  }
}
```

### 5.3 Classe AssetMapper

```typescript
/**
 * Traduit les identifiants serveur (landId, topology, visualClass)
 * vers les assets du nouveau moteur graphique.
 *
 * Source de vérité: les INI/CSV du serveur
 * Sortie: chemins vers les nouveaux assets 3D/textures
 */
class AssetMapper {
  private manifest: AssetManifest;

  /**
   * Map un landId (8-bit) vers un matériau terrain.
   * Utilise land-utils.ts pour décoder, puis le manifest pour résoudre.
   */
  getTerrainMaterial(landId: number, season: Season): TerrainMaterialConfig {
    const decoded = decodeLandId(landId);
    const className = this.manifest.terrain.classMapping[decoded.landClass];
    const material = this.manifest.terrain.materials[className];

    return {
      baseMaterial: material,
      season: material.seasons?.[season] ?? material,
      landType: decoded.landType,  // Pour edge blending
      variation: decoded.landVar,
    };
  }

  /**
   * Map une topologie de route vers un modèle 3D.
   * Réutilise la logique existante de road-texture-system.ts
   * pour calculer la topologie, mais résout vers un nouveau modèle.
   */
  getRoadModel(topology: RoadTopology, surface: RoadSurface): RoadModelConfig {
    const surfaceKey = surface === 'urban' ? 'urban'
                     : surface === 'bridge' ? 'bridge'
                     : 'land';
    return this.manifest.roads[surfaceKey][topology];
  }

  /**
   * Map un visualClass de bâtiment vers un modèle 3D avec LOD.
   * Fallback vers un modèle générique par catégorie si pas de modèle custom.
   */
  getBuildingModel(visualClass: string): BuildingModelConfig {
    return this.manifest.buildings[visualClass]
        ?? this.manifest.buildings[`_fallback_${this.getCategoryFallback(visualClass)}`];
  }
}
```

### 5.4 Stratégie de transition des textures

Pour une migration progressive, deux approches sont possibles en parallèle :

**Approche A — Sprites 2D projetés (court terme)**
- Conserver temporairement les BMP/GIF existants
- Les appliquer comme textures sur des quads 3D dans la scène Three.js
- Permet d'avoir la rotation/zoom 3D immédiatement avec le style visuel actuel

**Approche B — Modèles 3D low-poly (cible)**
- Remplacer progressivement chaque catégorie par des modèles glTF
- Terrain → mesh avec heightmap + matériaux PBR
- Bâtiments → modèles 3D low-poly par visualClass
- Routes → modèles 3D extrudés selon la topologie
- Avantage : le rendu reste correct à tout angle de rotation

La recommandation est de démarrer par l'approche A pour le terrain et les routes (garantir la compatibilité) puis migrer vers B progressivement, en commençant par les bâtiments qui bénéficient le plus du 3D.

---

## 6. Système de rendu 3D

### 6.1 Scène Three.js

```typescript
class GameEngine implements IGameRenderer {
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private cameraSystem: CameraSystem;

  async initialize(container: HTMLElement, mapData: TerrainData): Promise<void> {
    // WebGL2 avec fallback WebGL1
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,           // Désactivé pour mobile, FXAA en post-process
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap à 2x
    this.renderer.shadowMap.enabled = false; // Pas d'ombres dynamiques (mobile)

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.002); // Brouillard distance

    this.cameraSystem = new CameraSystem(container);

    // Initialiser les couches
    await this.terrainLayer.build(mapData);
    // ...
  }
}
```

### 6.2 Système de caméra orbitale

```typescript
/**
 * Caméra city-builder avec contrôles tactiles et souris.
 *
 * Modes:
 * - Souris: clic-gauche glissé = pan, clic-droit glissé = rotation,
 *           molette = zoom
 * - Tactile: 1 doigt = pan, 2 doigts = rotation + zoom (pinch)
 * - Clavier: WASD = pan, Q/E = rotation, +/- = zoom
 */
class CameraSystem {
  private camera: THREE.PerspectiveCamera;
  private target: THREE.Vector3;  // Point de focus sur la carte

  // Paramètres de l'orbite
  private azimuth: number = 225;       // Angle horizontal (0-360°), par défaut: isométrique classique
  private elevation: number = 45;      // Angle vertical (20-80°)
  private distance: number = 100;      // Distance au target (zoom)

  // Limites
  private readonly MIN_ELEVATION = 20;  // Pas complètement horizontal
  private readonly MAX_ELEVATION = 80;  // Pas complètement vertical
  private readonly MIN_DISTANCE = 10;   // Zoom max (très proche)
  private readonly MAX_DISTANCE = 500;  // Zoom min (vue d'ensemble)

  // Inertie pour fluidité
  private panVelocity = new THREE.Vector2();
  private rotateVelocity = new THREE.Vector2();
  private zoomVelocity = 0;
  private readonly DAMPING = 0.92;

  updateCamera(): void {
    // Convertir coordonnées sphériques → position caméra
    const phi = THREE.MathUtils.degToRad(90 - this.elevation);
    const theta = THREE.MathUtils.degToRad(this.azimuth);

    this.camera.position.set(
      this.target.x + this.distance * Math.sin(phi) * Math.cos(theta),
      this.target.y + this.distance * Math.cos(phi),
      this.target.z + this.distance * Math.sin(phi) * Math.sin(theta),
    );
    this.camera.lookAt(this.target);
  }
}
```

### 6.3 Conversion coordonnées map ↔ world 3D

```typescript
/**
 * Conversion entre les coordonnées de la grille (i, j)
 * et les coordonnées monde 3D.
 *
 * La grille reste carrée (pas de projection isométrique manuelle).
 * La caméra orbitale crée l'effet isométrique naturellement.
 */
class CoordinateSystem3D {
  private readonly TILE_SIZE = 1.0;  // 1 unité monde = 1 tuile

  /**
   * (i, j) map → (x, y, z) world
   * Le terrain est un plan XZ, Y = altitude
   */
  mapToWorld(i: number, j: number, altitude: number = 0): THREE.Vector3 {
    return new THREE.Vector3(
      j * this.TILE_SIZE,       // X = colonne
      altitude,                  // Y = hauteur
      i * this.TILE_SIZE        // Z = ligne
    );
  }

  /**
   * Raycasting depuis l'écran vers le plan du terrain.
   * Utilisé pour la sélection, le placement, etc.
   */
  screenToMap(
    screenX: number, screenY: number,
    camera: THREE.Camera, renderer: THREE.WebGLRenderer
  ): MapCoord | null {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
      (screenX / renderer.domElement.clientWidth) * 2 - 1,
      -(screenY / renderer.domElement.clientHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);

    // Intersection avec le plan Y=0
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, intersection)) {
      return {
        i: Math.floor(intersection.z / this.TILE_SIZE),
        j: Math.floor(intersection.x / this.TILE_SIZE),
      };
    }
    return null;
  }
}
```

---

## 7. Système de terrain

### 7.1 Approche recommandée : Mesh unique avec splatmap

Au lieu de rendre chaque tuile individuellement (actuel: 65K+ sprites), le terrain est un **seul mesh plan** avec des **matériaux procéduraux**.

```
TerrainData (Uint8Array de landId)
          │
          ▼
    ┌─────────────┐
    │ Decode       │  land-utils.ts (conservé)
    │ landId bytes │
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ Generate     │  Convertir LandClass → splatmap RGBA
    │ Splatmap     │  R = grass, G = midgrass, B = dryground, A = water
    │ (DataTexture)│
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ Custom       │  Shader qui blend les textures terrain
    │ Shader       │  selon les poids de la splatmap
    │ Material     │
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ PlaneGeometry│  Mesh unique pour tout le terrain visible
    │ (chunked)    │  Découpé en chunks de 64×64 pour le frustum culling
    └─────────────┘
```

### 7.2 Shader de terrain (GLSL simplifié)

```glsl
// Vertex shader
varying vec2 vUv;
varying vec2 vWorldPos;

void main() {
  vUv = uv;
  vWorldPos = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// Fragment shader
uniform sampler2D splatMap;        // R=grass, G=midgrass, B=dry, A=water
uniform sampler2D grassTexture;
uniform sampler2D midgrassTexture;
uniform sampler2D drygroundTexture;
uniform sampler2D waterTexture;
uniform float tileScale;           // Répétition texture (tiling)

varying vec2 vUv;
varying vec2 vWorldPos;

void main() {
  vec4 splat = texture2D(splatMap, vUv);

  // Échantillonner chaque texture terrain avec tiling
  vec2 tiledUv = vWorldPos * tileScale;
  vec4 grass = texture2D(grassTexture, tiledUv) * splat.r;
  vec4 midgrass = texture2D(midgrassTexture, tiledUv) * splat.g;
  vec4 dryground = texture2D(drygroundTexture, tiledUv) * splat.b;
  vec4 water = texture2D(waterTexture, tiledUv) * splat.a;

  gl_FragColor = grass + midgrass + dryground + water;
}
```

### 7.3 Gestion des transitions (edge blending)

Les LandType (edges, corners) du BMP original encodent les transitions entre biomes. Le shader utilise ces informations pour un blending naturel :

```typescript
function generateSplatmap(terrain: TerrainData): THREE.DataTexture {
  const data = new Uint8Array(terrain.width * terrain.height * 4);

  for (let i = 0; i < terrain.height; i++) {
    for (let j = 0; j < terrain.width; j++) {
      const idx = (i * terrain.width + j) * 4;
      const landId = terrain.pixelData[i * terrain.width + j];
      const decoded = decodeLandId(landId);

      // Poids bruts par zone
      const weights = [0, 0, 0, 0]; // grass, midgrass, dry, water
      weights[decoded.landClass] = 255;

      // Pour les edges/corners: mélanger avec les voisins
      if (decoded.landType !== LandType.Center &&
          decoded.landType !== LandType.Special) {
        // Réduire le poids principal, ajouter transition
        weights[decoded.landClass] = 180;
        // Le voisin est la zone "d'en dessous" dans la hiérarchie
        const neighborClass = getNeighborClass(decoded);
        if (neighborClass >= 0) {
          weights[neighborClass] = 75;
        }
      }

      data[idx]     = weights[0]; // R = grass
      data[idx + 1] = weights[1]; // G = midgrass
      data[idx + 2] = weights[2]; // B = dryground
      data[idx + 3] = weights[3]; // A = water
    }
  }

  return new THREE.DataTexture(data, terrain.width, terrain.height, THREE.RGBAFormat);
}
```

### 7.4 Eau animée

L'eau n'est pas un simple terrain texturé — c'est une couche séparée avec un shader d'animation :

```typescript
class WaterLayer {
  private waterMesh: THREE.Mesh;

  build(terrain: TerrainData): void {
    // Générer un mesh uniquement pour les tuiles water
    const geometry = this.buildWaterGeometry(terrain);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        waterColor: { value: new THREE.Color(0x1a6b8a) },
        foamColor: { value: new THREE.Color(0xffffff) },
        waveFrequency: { value: 2.0 },
        waveAmplitude: { value: 0.05 },
      },
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      transparent: true,
    });
    this.waterMesh = new THREE.Mesh(geometry, material);
  }

  update(dt: number): void {
    this.waterMesh.material.uniforms.time.value += dt;
  }
}
```

### 7.5 Tuiles spéciales (arbres, décorations)

`LandType.Special` (13) = éléments décoratifs. Dans le nouveau moteur, ce sont des **modèles 3D instancés** placés sur la tuile :

```typescript
// Instanced rendering pour les arbres (un seul draw call)
const treeGeometry = loadModel('models/decoration/tree.glb');
const treeMaterial = new THREE.MeshBasicMaterial({ map: treeTexture });
const treeInstances = new THREE.InstancedMesh(treeGeometry, treeMaterial, treeCount);

// Positionner chaque instance
specialTiles.forEach((tile, index) => {
  const matrix = new THREE.Matrix4();
  matrix.setPosition(tile.j, 0, tile.i);
  matrix.multiply(new THREE.Matrix4().makeRotationY(
    Math.random() * Math.PI * 2  // Rotation aléatoire pour variété
  ));
  treeInstances.setMatrixAt(index, matrix);
});
```

---

## 8. Système de bâtiments

### 8.1 Architecture

```
MapBuilding (du serveur RDO)
    │
    ├── visualClass: "2951"
    ├── x, y: position map
    ├── tycoonId: propriétaire
    └── options: niveau, état
          │
          ▼
    ┌─────────────┐
    │ AssetMapper  │  Traduit visualClass → modèle 3D
    │              │  + configuration LOD
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ BuildingLayer│  THREE.InstancedMesh par type de bâtiment
    │              │  + THREE.LOD pour la distance
    └──────┬──────┘
           │
    ┌──────▼──────────────────────────────┐
    │ LOD 0 (proche): Modèle 3D détaillé  │
    │ LOD 1 (moyen): Modèle simplifié     │
    │ LOD 2 (loin): Billboard sprite      │
    │ LOD 3 (très loin): Colored cube     │
    └─────────────────────────────────────┘
```

### 8.2 Instanced rendering par type

Les bâtiments du même `visualClass` partagent le même mesh via `InstancedMesh` :

```typescript
class BuildingLayer {
  // Map: visualClass → InstancedMesh
  private buildingInstances = new Map<string, THREE.InstancedMesh>();

  setBuildings(buildings: MapBuilding[]): void {
    // Grouper par visualClass
    const grouped = groupBy(buildings, b => b.visualClass);

    for (const [visualClass, instances] of grouped) {
      const config = this.assetMapper.getBuildingModel(visualClass);
      const geometry = this.modelCache.get(config.model);
      const material = this.materialCache.get(visualClass);

      const mesh = new THREE.InstancedMesh(geometry, material, instances.length);

      instances.forEach((building, idx) => {
        const matrix = new THREE.Matrix4();
        const pos = this.coords.mapToWorld(building.y, building.x);
        matrix.setPosition(pos);
        // La rotation du bâtiment dépend de l'angle caméra ?
        // Non — les bâtiments sont fixes dans le monde 3D
        mesh.setMatrixAt(idx, matrix);
      });

      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
      this.buildingInstances.set(visualClass, mesh);
    }
  }
}
```

### 8.3 LOD (Level of Detail)

```typescript
function createBuildingLOD(config: BuildingModelConfig): THREE.LOD {
  const lod = new THREE.LOD();

  // LOD 0: modèle complet
  const detailed = loadGLTF(config.model);
  lod.addLevel(detailed, 0);

  // LOD 1: modèle simplifié (50% polygones)
  if (config.lod?.[0]) {
    const medium = loadGLTF(config.lod[0].model);
    lod.addLevel(medium, config.lod[0].distance);
  }

  // LOD 2: billboard (sprite qui fait face à la caméra)
  if (config.lod?.[1]) {
    const billboard = createBillboard(config);
    lod.addLevel(billboard, config.lod[1].distance);
  }

  // LOD 3: simple cube coloré
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(config.footprint.x, config.height, config.footprint.y),
    new THREE.MeshBasicMaterial({ color: getCategoryColor(config) })
  );
  lod.addLevel(cube, 400);

  return lod;
}
```

### 8.4 Sélection de bâtiment (raycasting)

```typescript
class BuildingLayer {
  /**
   * Détection de clic sur un bâtiment par raycasting GPU.
   * Remplace le hit-test basé sur les coordonnées isométriques.
   */
  handleClick(event: PointerEvent): MapBuilding | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(this.mouse, this.camera);

    // Test d'intersection avec tous les InstancedMesh de bâtiments
    const intersects = raycaster.intersectObjects(
      Array.from(this.buildingInstances.values()),
      true
    );

    if (intersects.length > 0) {
      const hit = intersects[0];
      const instanceId = hit.instanceId;
      const visualClass = this.getVisualClassFromMesh(hit.object);
      return this.buildingLookup.get(visualClass)?.[instanceId] ?? null;
    }
    return null;
  }
}
```

---

## 9. Système de routes

### 9.1 Conservation de la logique existante

La logique de topologie des routes (`road-texture-system.ts`) est **conservée intégralement**. Seule la sortie change : au lieu de résoudre un chemin de fichier BMP, elle résout un modèle 3D.

```
road-texture-system.ts (CONSERVÉ)
    │
    ├── analyzeTopology(x, y, neighbors) → RoadTopology
    ├── getSurface(x, y, terrain) → RoadSurface (land/urban/bridge)
    └── [Supprimé: getTexturePath() → BMP filename]
          │
          ▼ Remplacé par:
    AssetMapper.getRoadModel(topology, surface) → GLB model + rotation
```

### 9.2 Rendu des routes

```typescript
class RoadLayer {
  // Routes instancées par type (straight, corner, T, cross)
  private roadInstances = new Map<string, THREE.InstancedMesh>();

  setRoadSegments(segments: MapSegment[]): void {
    // 1. Construire la grille de routes (logique existante conservée)
    const roadGrid = buildRoadGrid(segments, this.mapWidth, this.mapHeight);

    // 2. Pour chaque tuile route, calculer la topologie (logique existante)
    const roadTiles: RoadTileInfo[] = [];
    for (const segment of segments) {
      forEachTileInSegment(segment, (x, y) => {
        const topology = analyzeTopology(x, y, roadGrid);
        const surface = getSurface(x, y, this.terrainData);
        const rotation = getRotationForTopology(topology);
        roadTiles.push({ x, y, topology, surface, rotation });
      });
    }

    // 3. Grouper par (topology + surface) pour l'instancing
    const grouped = groupBy(roadTiles, t => `${t.topology}_${t.surface}`);

    for (const [key, tiles] of grouped) {
      const model = this.assetMapper.getRoadModel(tiles[0].topology, tiles[0].surface);
      const geometry = this.modelCache.get(model);
      const mesh = new THREE.InstancedMesh(geometry, roadMaterial, tiles.length);

      tiles.forEach((tile, idx) => {
        const matrix = new THREE.Matrix4();
        const pos = this.coords.mapToWorld(tile.y, tile.x);
        matrix.setPosition(pos);
        matrix.multiply(new THREE.Matrix4().makeRotationY(tile.rotation));
        mesh.setMatrixAt(idx, matrix);
      });

      this.roadInstances.set(key, mesh);
      this.scene.add(mesh);
    }
  }
}
```

### 9.3 Prévisualisation de route (staircase)

L'algorithme staircase est conservé. L'affichage utilise des meshes semi-transparents :

```typescript
class PreviewLayer {
  private previewMeshes: THREE.Mesh[] = [];

  showRoadPreview(path: MapCoord[], valid: boolean[]): void {
    this.clearPreview();

    const color = new THREE.Color(valid.every(v => v) ? 0x00ff00 : 0xff0000);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
    });

    path.forEach((coord, idx) => {
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.material.color = valid[idx] ? new THREE.Color(0x00ff00) : new THREE.Color(0xff0000);
      mesh.position.copy(this.coords.mapToWorld(coord.i, coord.j));
      mesh.position.y = 0.01; // Juste au-dessus du terrain
      this.previewMeshes.push(mesh);
      this.scene.add(mesh);
    });
  }
}
```

---

## 10. Système de béton

### 10.1 Même principe que les routes

La logique de `concrete-texture-system.ts` (calcul des 8 voisins) est conservée. Le rendu passe de sprites BMP à des meshs 3D :

```typescript
class ConcreteLayer {
  setConcreteAreas(buildings: MapBuilding[], roadGrid: boolean[][]): void {
    // 1. Calculer les tuiles béton (logique existante conservée)
    const concreteTiles = calculateConcreteTiles(buildings, roadGrid, this.terrainData);

    // 2. Pour chaque tuile, calculer le concreteId via les voisins
    const tileInfos = concreteTiles.map(tile => ({
      ...tile,
      concreteId: getConcreteId(tile.x, tile.y, concreteTiles, this.terrainData),
    }));

    // 3. Rendu: un seul mesh plan avec texture béton et UV mapping
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);

    // Instancing par type de concrete
    const grouped = groupBy(tileInfos, t => t.concreteId);
    for (const [id, tiles] of grouped) {
      const material = this.assetMapper.getConcreteMaterial(id);
      const mesh = new THREE.InstancedMesh(geometry, material, tiles.length);
      // ... positionner les instances
    }
  }
}
```

---

## 11. Animations de véhicules

### 11.1 Système de trafic client-side

Les véhicules sont **purement cosmétiques** — aucune donnée serveur. Le client les génère et les anime le long du réseau routier.

```
┌─────────────────────────────────────────┐
│           Vehicle Traffic System         │
│                                         │
│  ┌───────────┐     ┌────────────────┐   │
│  │ RoadGraph  │────>│ PathFinder     │   │
│  │ (from road │     │ (A* sur le     │   │
│  │  segments) │     │  graphe routes)│   │
│  └───────────┘     └───────┬────────┘   │
│                            │             │
│  ┌─────────────────────────▼──────────┐  │
│  │ VehicleSpawner                     │  │
│  │                                    │  │
│  │ - Densité basée sur la zone        │  │
│  │   (résidentiel→voitures,           │  │
│  │    industriel→camions)             │  │
│  │ - Max véhicules visible: 50-100    │  │
│  │ - Spawn/despawn hors viewport      │  │
│  └─────────────────────────┬──────────┘  │
│                            │             │
│  ┌─────────────────────────▼──────────┐  │
│  │ VehicleAnimator                    │  │
│  │                                    │  │
│  │ - Déplacement le long du chemin    │  │
│  │ - Interpolation position + rotation│  │
│  │ - Vitesse variable par type        │  │
│  │ - Bateaux: uniquement sur eau      │  │
│  │ - Avions: altitude + trajectoire   │  │
│  └────────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### 11.2 Graphe routier pour le pathfinding

```typescript
/**
 * Construit un graphe navigable à partir des segments de route.
 * Les nœuds sont les tuiles route, les arêtes sont les connexions cardinales.
 */
class RoadGraph {
  private nodes = new Map<string, RoadNode>();
  private edges = new Map<string, RoadNode[]>();

  buildFromSegments(segments: MapSegment[]): void {
    // Parcourir tous les segments, créer un nœud par tuile route
    for (const segment of segments) {
      forEachTileInSegment(segment, (x, y) => {
        const key = `${x},${y}`;
        this.nodes.set(key, { x, y, isIntersection: false });
      });
    }

    // Construire les arêtes (connexions N/S/E/W entre tuiles adjacentes)
    for (const [key, node] of this.nodes) {
      const neighbors: RoadNode[] = [];
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nKey = `${node.x + dx},${node.y + dy}`;
        if (this.nodes.has(nKey)) {
          neighbors.push(this.nodes.get(nKey)!);
        }
      }
      this.edges.set(key, neighbors);
      node.isIntersection = neighbors.length > 2;
    }
  }

  /**
   * Trouve un chemin aléatoire pour un véhicule.
   * Pas de A* complet : on navigue au hasard aux intersections
   * pour un comportement organique.
   */
  getRandomPath(startX: number, startY: number, maxLength: number): MapCoord[] {
    const path: MapCoord[] = [{ i: startY, j: startX }];
    let current = `${startX},${startY}`;
    let prev = '';

    for (let step = 0; step < maxLength; step++) {
      const neighbors = (this.edges.get(current) ?? [])
        .filter(n => `${n.x},${n.y}` !== prev);
      if (neighbors.length === 0) break;

      const next = neighbors[Math.floor(Math.random() * neighbors.length)];
      prev = current;
      current = `${next.x},${next.y}`;
      path.push({ i: next.y, j: next.x });
    }
    return path;
  }
}
```

### 11.3 Types de véhicules

| Type | Où | Vitesse | Spawn condition | Modèle |
|------|-----|---------|-----------------|--------|
| Voiture | Routes terrestres | 2-4 u/s | Zone résidentielle/commerciale | `car_small.glb` |
| Camion | Routes terrestres | 1-2 u/s | Zone industrielle | `truck.glb` |
| Bus | Routes urbaines | 1.5 u/s | Zone commerciale | `bus.glb` |
| Bateau | Eau | 0.5-1 u/s | Côte avec port | `boat.glb` |
| Avion | Au-dessus (altitude) | 5-10 u/s | Aéroport présent | `airplane.glb` |

### 11.4 Animation des véhicules

```typescript
class VehicleAnimator {
  private vehicles: Vehicle[] = [];
  private readonly MAX_VISIBLE = 80;

  update(dt: number, viewBounds: TileBounds): void {
    // 1. Despawn les véhicules hors viewport
    this.vehicles = this.vehicles.filter(v => isInBounds(v, viewBounds));

    // 2. Spawn de nouveaux véhicules si sous la limite
    while (this.vehicles.length < this.MAX_VISIBLE) {
      const spawned = this.spawner.trySpawn(viewBounds);
      if (!spawned) break;
      this.vehicles.push(spawned);
    }

    // 3. Animer chaque véhicule
    for (const vehicle of this.vehicles) {
      vehicle.progress += dt * vehicle.speed;

      if (vehicle.progress >= 1.0) {
        // Passer au segment suivant du chemin
        vehicle.pathIndex++;
        vehicle.progress -= 1.0;

        if (vehicle.pathIndex >= vehicle.path.length - 1) {
          // Fin du chemin: étendre ou supprimer
          const extended = this.roadGraph.extendPath(vehicle);
          if (!extended) {
            vehicle.alive = false;
            continue;
          }
        }
      }

      // Interpolation position
      const from = vehicle.path[vehicle.pathIndex];
      const to = vehicle.path[vehicle.pathIndex + 1];
      const pos = this.coords.mapToWorld(
        lerp(from.i, to.i, vehicle.progress),
        lerp(from.j, to.j, vehicle.progress)
      );
      pos.y = vehicle.altitude; // 0 pour terrestre, >0 pour avions

      vehicle.mesh.position.copy(pos);

      // Rotation vers la direction de déplacement
      const angle = Math.atan2(to.j - from.j, to.i - from.i);
      vehicle.mesh.rotation.y = -angle;
    }

    // 4. Nettoyer les véhicules morts
    this.vehicles = this.vehicles.filter(v => v.alive);
  }
}
```

---

## 12. Interactions utilisateur

### 12.1 Gestion unifiée des entrées

```typescript
/**
 * Gestion centralisée des entrées souris/touch/clavier.
 * Distribue les événements vers les systèmes appropriés.
 */
class InputManager {
  private mode: InteractionMode = 'navigate';

  // Modes d'interaction:
  // - 'navigate': pan/zoom/rotate la caméra (défaut)
  // - 'select': cliquer sur un bâtiment
  // - 'place_building': prévisualiser et placer un bâtiment
  // - 'draw_road': dessiner une route (staircase)
  // - 'delete': détruire un bâtiment/route

  handlePointerDown(e: PointerEvent): void {
    switch (this.mode) {
      case 'navigate':
      case 'select':
        // Début de pan (ou sélection si clic court)
        this.dragStart = { x: e.clientX, y: e.clientY, time: Date.now() };
        break;

      case 'place_building':
        // Placer le bâtiment à la position courante
        this.placementSystem.confirm();
        break;

      case 'draw_road':
        // Début du tracé de route
        const mapCoord = this.coords.screenToMap(e.clientX, e.clientY);
        this.roadBuilder.startDrawing(mapCoord);
        break;
    }
  }

  handlePointerUp(e: PointerEvent): void {
    if (this.mode === 'navigate' || this.mode === 'select') {
      const dt = Date.now() - this.dragStart.time;
      const dist = distance(this.dragStart, { x: e.clientX, y: e.clientY });

      if (dt < 300 && dist < 10) {
        // Clic court = sélection
        this.handleClick(e);
      }
      // Sinon c'était un pan, déjà géré par handlePointerMove
    }

    if (this.mode === 'draw_road') {
      this.roadBuilder.endDrawing();
    }
  }

  handleClick(e: PointerEvent): void {
    // Raycasting pour trouver le bâtiment cliqué
    const building = this.buildingLayer.handleClick(e);
    if (building) {
      this.onBuildingClick(building.x, building.y, building.visualClass);
    }
  }

  // === Touch-specific ===
  handleTouchGesture(gesture: TouchGesture): void {
    switch (gesture.type) {
      case 'pan':
        this.cameraSystem.pan(gesture.deltaX, gesture.deltaY);
        break;
      case 'pinch':
        this.cameraSystem.zoom(gesture.scale);
        break;
      case 'rotate':
        this.cameraSystem.rotate(gesture.angle);
        break;
      case 'tap':
        this.handleClick(gesture.event);
        break;
    }
  }
}
```

### 12.2 Prévisualisation de construction

```typescript
class PlacementSystem {
  private ghostMesh: THREE.Group | null = null;
  private valid = false;

  startPlacement(buildingConfig: PlacementConfig): void {
    const model = this.assetMapper.getBuildingModel(buildingConfig.visualClass);
    this.ghostMesh = loadGLTF(model.model).clone();

    // Appliquer un matériau semi-transparent
    this.ghostMesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.6;
      }
    });

    this.scene.add(this.ghostMesh);
  }

  updatePosition(mapI: number, mapJ: number): void {
    if (!this.ghostMesh) return;

    const pos = this.coords.mapToWorld(mapI, mapJ);
    this.ghostMesh.position.copy(pos);

    // Validation de placement
    this.valid = this.validator.canPlace(mapI, mapJ, this.config);

    // Couleur: vert = valide, rouge = invalide
    const color = this.valid ? 0x00ff88 : 0xff4444;
    this.ghostMesh.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.material.color.setHex(color);
      }
    });

    // Afficher le footprint sur le sol
    this.showFootprintOutline(mapI, mapJ, this.config.xsize, this.config.ysize, this.valid);
  }
}
```

---

## 13. Overlays et UI in-world

### 13.1 Overlays de zones

Les overlays (zones, pollution, QoL, ...) sont rendus comme un **plan semi-transparent** au-dessus du terrain :

```typescript
class OverlayLayer {
  private overlayMesh: THREE.Mesh | null = null;

  setZoneOverlay(enabled: boolean, data?: SurfaceData, x?: number, y?: number): void {
    if (!enabled) {
      this.removeOverlay();
      return;
    }

    // Générer une DataTexture depuis les données de surface
    const texture = this.generateOverlayTexture(data!);

    const geometry = new THREE.PlaneGeometry(data!.width, data!.height);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });

    this.overlayMesh = new THREE.Mesh(geometry, material);
    this.overlayMesh.position.set(
      x! + data!.width / 2,
      0.05,  // Juste au-dessus du terrain
      y! + data!.height / 2
    );
    this.scene.add(this.overlayMesh);
  }

  private generateOverlayTexture(data: SurfaceData): THREE.DataTexture {
    const pixels = new Uint8Array(data.width * data.height * 4);

    for (let row = 0; row < data.height; row++) {
      for (let col = 0; col < data.width; col++) {
        const idx = (row * data.width + col) * 4;
        const value = data.rows[row][col];
        const color = ZONE_COLORS[Math.floor(value / 1000) * 1000] ?? { r: 128, g: 128, b: 128 };

        pixels[idx]     = color.r;
        pixels[idx + 1] = color.g;
        pixels[idx + 2] = color.b;
        pixels[idx + 3] = value > 0 ? 160 : 0;  // Transparent si pas de zone
      }
    }

    return new THREE.DataTexture(pixels, data.width, data.height, THREE.RGBAFormat);
  }
}
```

### 13.2 UI au-dessus des bâtiments (soft select)

Informations flottantes au-dessus des bâtiments sélectionnés, rendues en **CSS3D** ou **HTML overlay** (pas dans la scène 3D pour la netteté du texte) :

```typescript
class BuildingInfoOverlay {
  private overlays = new Map<string, HTMLElement>();

  showInfo(building: MapBuilding, info: BuildingFocusInfo): void {
    const div = document.createElement('div');
    div.className = 'building-info-overlay';
    div.innerHTML = `
      <div class="building-name">${info.buildingName}</div>
      <div class="building-owner">${info.ownerName}</div>
      <div class="building-revenue">${info.revenue}</div>
    `;
    document.body.appendChild(div);

    this.overlays.set(`${building.x},${building.y}`, div);
  }

  // Appelé chaque frame pour repositionner les overlays HTML
  updatePositions(camera: THREE.Camera, renderer: THREE.WebGLRenderer): void {
    for (const [key, div] of this.overlays) {
      const [x, y] = key.split(',').map(Number);
      const worldPos = this.coords.mapToWorld(y, x);
      worldPos.y += 2; // Au-dessus du bâtiment

      // Projeter position 3D → position écran
      const screenPos = worldPos.project(camera);
      const halfWidth = renderer.domElement.clientWidth / 2;
      const halfHeight = renderer.domElement.clientHeight / 2;

      div.style.left = `${(screenPos.x * halfWidth) + halfWidth}px`;
      div.style.top = `${-(screenPos.y * halfHeight) + halfHeight}px`;
    }
  }
}
```

---

## 14. Optimisations mobile

### 14.1 Stratégie globale

```
┌────────────────────────────────────────────────┐
│              Mobile Optimization Stack          │
│                                                │
│  ┌──────────────────┐ ┌─────────────────────┐  │
│  │ Draw Call Budget │ │ Memory Budget       │  │
│  │ < 100 per frame  │ │ < 256 MB GPU        │  │
│  └──────────────────┘ └─────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ 1. InstancedMesh (batching par type)     │  │
│  │    → 1 draw call par type de bâtiment    │  │
│  │    → 1 draw call par type de route       │  │
│  │    → 1 draw call pour le terrain chunk   │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ 2. LOD agressif                          │  │
│  │    → Distance proche: modèle 3D complet  │  │
│  │    → Distance moyenne: modèle simplifié  │  │
│  │    → Distance loin: billboard sprite     │  │
│  │    → Très loin: cube coloré              │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ 3. Frustum culling spatial (QuadTree)    │  │
│  │    → Terrain: chunks 64×64              │  │
│  │    → Bâtiments: spatial index            │  │
│  │    → Routes: par chunk                   │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ 4. Texture compression                   │  │
│  │    → WebP pour les textures diffuse      │  │
│  │    → Basis Universal / KTX2 si supporté  │  │
│  │    → Max texture 1024×1024 sur mobile    │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ 5. Render pipeline adaptatif             │  │
│  │    → Désactiver les ombres               │  │
│  │    → Désactiver le post-processing       │  │
│  │    → Réduire le pixel ratio à 1x         │  │
│  │    → Limiter les véhicules (20 sur mobile│  │
│  │      vs 80 sur desktop)                  │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ 6. Chargement progressif                 │  │
│  │    → Terrain visible en premier          │  │
│  │    → Bâtiments LOD3 immédiat, détail     │  │
│  │      chargé en background                │  │
│  │    → Textures low-res d'abord, hi-res    │  │
│  │      ensuite                             │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

### 14.2 Détection des capacités

```typescript
class DeviceCapabilities {
  readonly isMobile: boolean;
  readonly maxTextureSize: number;
  readonly supportsCompressedTextures: boolean;
  readonly estimatedGPUTier: 'low' | 'mid' | 'high';

  static detect(gl: WebGLRenderingContext): DeviceCapabilities {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuRenderer = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : 'unknown';

    return {
      isMobile,
      maxTextureSize,
      supportsCompressedTextures: !!gl.getExtension('WEBGL_compressed_texture_astc'),
      estimatedGPUTier: estimateGPUTier(gpuRenderer, isMobile),
    };
  }
}

function getQualityPreset(caps: DeviceCapabilities): QualitySettings {
  if (caps.estimatedGPUTier === 'low' || caps.isMobile) {
    return {
      maxVisibleTiles: 4096,       // 64×64
      buildingLODDistances: [30, 80, 200],
      maxVehicles: 20,
      terrainChunkSize: 32,
      enablePostProcessing: false,
      enableShadows: false,
      pixelRatio: 1,
      maxTextureRes: 512,
      enableWaterAnimation: false,
    };
  }
  if (caps.estimatedGPUTier === 'mid') {
    return {
      maxVisibleTiles: 16384,      // 128×128
      buildingLODDistances: [50, 150, 400],
      maxVehicles: 50,
      terrainChunkSize: 64,
      enablePostProcessing: true,
      enableShadows: false,
      pixelRatio: Math.min(window.devicePixelRatio, 1.5),
      maxTextureRes: 1024,
      enableWaterAnimation: true,
    };
  }
  // high
  return {
    maxVisibleTiles: 65536,        // 256×256
    buildingLODDistances: [80, 200, 500],
    maxVehicles: 80,
    terrainChunkSize: 64,
    enablePostProcessing: true,
    enableShadows: true,
    pixelRatio: Math.min(window.devicePixelRatio, 2),
    maxTextureRes: 2048,
    enableWaterAnimation: true,
  };
}
```

### 14.3 Touch controls

```typescript
class TouchController {
  private touches = new Map<number, Touch>();

  handleTouchStart(e: TouchEvent): void {
    for (const touch of e.changedTouches) {
      this.touches.set(touch.identifier, touch);
    }
  }

  handleTouchMove(e: TouchEvent): void {
    e.preventDefault(); // Empêcher le scroll du navigateur

    if (this.touches.size === 1) {
      // 1 doigt: PAN
      const touch = e.changedTouches[0];
      const prev = this.touches.get(touch.identifier)!;
      const dx = touch.clientX - prev.clientX;
      const dy = touch.clientY - prev.clientY;
      this.cameraSystem.pan(dx, dy);
    }

    if (this.touches.size === 2) {
      const [t1, t2] = Array.from(e.touches);

      // Distance entre les 2 doigts (pinch-to-zoom)
      const currDist = distance(t1, t2);
      const prevDist = this.lastPinchDistance;
      if (prevDist > 0) {
        const scale = currDist / prevDist;
        this.cameraSystem.zoom(scale);
      }
      this.lastPinchDistance = currDist;

      // Angle entre les 2 doigts (rotation)
      const currAngle = angle(t1, t2);
      const prevAngle = this.lastPinchAngle;
      if (prevAngle !== null) {
        const deltaAngle = currAngle - prevAngle;
        this.cameraSystem.rotate(deltaAngle);
      }
      this.lastPinchAngle = currAngle;
    }
  }
}
```

---

## 15. Pipeline de migration des assets

### 15.1 Stratégie "mapping bridge"

Le nouveau moteur ne dépend **jamais** des fichiers BMP/GIF directement. Un "mapping bridge" traduit les identifiants serveur vers les nouveaux assets :

```
                      ┌──────────────────────────────────┐
                      │     Asset Mapping Bridge          │
                      │                                  │
┌───────────┐         │  ┌────────────────────────────┐  │     ┌──────────────┐
│ Serveur   │         │  │ Terrain Mapper              │  │     │ Nouveaux     │
│ (inchangé)│──landId─┼─>│ LandClass → material name  │──┼────>│ Assets       │
│           │         │  │ LandType → edge blending    │  │     │              │
│           │         │  └────────────────────────────┘  │     │ models/      │
│  INI/CSV  │         │                                  │     │ textures/    │
│  files    │         │  ┌────────────────────────────┐  │     │ shaders/     │
│           │─topology┼─>│ Road Mapper                 │──┼────>│              │
│           │         │  │ topology + surface → model  │  │     │              │
│           │         │  └────────────────────────────┘  │     │              │
│           │         │                                  │     │              │
│           │─vClass──┼─>│ Building Mapper              │──┼────>│              │
│           │         │  │ visualClass → model + LOD   │  │     │              │
│           │         │  └────────────────────────────┘  │     │              │
│           │         │                                  │     │              │
│           │─concId──┼─>│ Concrete Mapper              │──┼────>│              │
│           │         │  │ concreteId → material       │  │     │              │
│           │         │  └────────────────────────────┘  │     └──────────────┘
└───────────┘         └──────────────────────────────────┘
```

### 15.2 Format des nouveaux assets

| Catégorie | Format | Raison |
|-----------|--------|--------|
| Modèles 3D | glTF 2.0 (.glb) | Standard web, compression Draco, animations |
| Textures | WebP + KTX2 (fallback PNG) | Taille réduite, compression GPU |
| Shaders | GLSL inline dans Three.js | Pas de fichiers séparés à charger |
| Manifest | JSON | Déclaratif, versionné, modifiable sans code |

### 15.3 Outil de correspondance INI → manifest

Un script utilitaire qui lit les INI existants et génère un squelette de manifest :

```typescript
/**
 * Lit tous les INI du serveur et génère un asset-manifest.json
 * avec des entrées placeholder pour chaque identifiant.
 *
 * Workflow:
 * 1. npm run generate-manifest → crée manifest avec placeholders
 * 2. Un artiste remplace les placeholders par de vrais assets
 * 3. L'AssetMapper charge le manifest et résout au runtime
 */
async function generateManifest(): Promise<AssetManifest> {
  // Lire les LandClasses INI → terrain entries
  const landClasses = await parseLandClassINIs('cache/LandClasses/');

  // Lire les RoadBlockClasses INI → road entries
  const roadBlocks = await parseRoadBlockINIs('cache/RoadBlockClasses/');

  // Lire facility_db.csv → building entries
  const buildings = await parseFacilityCSV('BuildingClasses/facility_db.csv');

  // Lire les ConcreteClasses INI → concrete entries
  const concrete = await parseConcreteINIs('cache/ConcreteClasses/');

  return {
    version: 1,
    style: 'modern-citybuilder',
    terrain: buildTerrainMapping(landClasses),
    roads: buildRoadMapping(roadBlocks),
    buildings: buildBuildingMapping(buildings),
    concrete: buildConcreteMapping(concrete),
    vehicles: defaultVehicleConfig(),
  };
}
```

---

## 16. Plan de migration par phases

### Phase 0 — Fondations (architecture)

**Objectif:** Poser le cadre du nouveau moteur sans casser l'existant.

| Tâche | Fichiers | Détail |
|-------|----------|--------|
| Définir `IGameRenderer` | `core/IGameRenderer.ts` | Interface contrat stable |
| Implémenter `CoordinateSystem3D` | `core/coordinate-system.ts` | (i,j) ↔ world 3D |
| Implémenter `SpatialIndex` (QuadTree) | `core/spatial-index.ts` | Culling + hit-test |
| Créer le squelette `GameEngine` | `engine/GameEngine.ts` | Scène Three.js vide |
| Implémenter `CameraSystem` orbital | `engine/CameraSystem.ts` | Pan/zoom/rotate |
| Implémenter `InputManager` | `engine/InputManager.ts` | Souris + touch + clavier |
| Implémenter `DeviceCapabilities` | `engine/DeviceCapabilities.ts` | Détection mobile/GPU |
| **Tests** | `*.test.ts` | Coord conversion, spatial index, camera math |

### Phase 1 — Terrain

**Objectif:** Rendu du terrain avec le nouveau moteur.

| Tâche | Fichiers | Détail |
|-------|----------|--------|
| `TerrainLayer` avec splatmap | `layers/TerrainLayer.ts` | Terrain en mesh unique |
| Shader terrain multi-texture | Inline GLSL | Blending par LandClass |
| Gestion saisons | `assets/TerrainMaterialFactory.ts` | Swap textures par saison |
| `WaterLayer` animé | `layers/WaterLayer.ts` | Shader eau |
| Tuiles spéciales (arbres) | Dans `TerrainLayer.ts` | InstancedMesh |
| Chunking + frustum culling | Dans `TerrainLayer.ts` | 64×64 chunks |
| `AssetMapper` terrain | `assets/AssetMapper.ts` | landId → material |
| **Tests** | `*.test.ts` | Splatmap generation, chunk bounds |

### Phase 2 — Bâtiments

**Objectif:** Affichage et interaction avec les bâtiments.

| Tâche | Fichiers | Détail |
|-------|----------|--------|
| `BuildingLayer` instancé | `layers/BuildingLayer.ts` | InstancedMesh par type |
| Système LOD | Dans `BuildingLayer.ts` | 4 niveaux de détail |
| Raycasting sélection | Dans `BuildingLayer.ts` | Click → building |
| `PlacementSystem` preview | `systems/placement-validator.ts` | Ghost + validation |
| `AssetMapper` bâtiments | `assets/AssetMapper.ts` | visualClass → model |
| Fallback modèles génériques | Dans `AssetMapper.ts` | Cubes colorés par catégorie |
| **Tests** | `*.test.ts` | Raycasting, placement validation |

### Phase 3 — Routes et béton

**Objectif:** Routes dynamiques avec prévisualisation.

| Tâche | Fichiers | Détail |
|-------|----------|--------|
| `RoadLayer` instancé | `layers/RoadLayer.ts` | Conservation logique topologie |
| `ConcreteLayer` instancé | `layers/ConcreteLayer.ts` | Conservation logique voisins |
| Preview staircase | `layers/PreviewLayer.ts` | Semi-transparent |
| `AssetMapper` routes/béton | `assets/AssetMapper.ts` | topology → model |
| **Tests** | `*.test.ts` | Topologie, staircase path |

### Phase 4 — Overlays et UI

**Objectif:** Informations visuelles et UI in-world.

| Tâche | Fichiers | Détail |
|-------|----------|--------|
| `OverlayLayer` zones | `layers/OverlayLayer.ts` | DataTexture semi-transparente |
| Building info overlay (HTML) | `ui/BuildingInfoOverlay.ts` | Projection 3D→2D |
| Soft-select overlay | `ui/SoftSelectOverlay.ts` | Icônes au-dessus des bâtiments |
| **Tests** | `*.test.ts` | Zone color mapping |

### Phase 5 — Véhicules et polish

**Objectif:** Animations d'ambiance et finitions.

| Tâche | Fichiers | Détail |
|-------|----------|--------|
| `RoadGraph` | `systems/vehicle-traffic.ts` | Graphe navigable |
| `VehicleSpawner` | `layers/VehicleLayer.ts` | Spawn contextualisé |
| `VehicleAnimator` | `layers/VehicleLayer.ts` | Déplacement + rotation |
| Modèles véhicules | `assets/VehicleModelLoader.ts` | glTF chargement |
| Bateaux (eau) + avions (altitude) | Dans `VehicleLayer.ts` | Logique séparée |
| **Tests** | `*.test.ts` | Road graph, pathfinding |

### Phase 6 — Optimisation et suppression legacy

**Objectif:** Performance mobile et nettoyage.

| Tâche | Détail |
|-------|--------|
| Profiling mobile | Chrome DevTools, WebGL Inspector |
| Texture compression (KTX2) | Three.js KTX2Loader |
| LOD tuning | Distances par preset qualité |
| Supprimer Canvas2D renderer | `isometric-map-renderer.ts` |
| Supprimer Three.js renderer v1 | `three/` directory |
| Supprimer PixiJS renderer | `pixi/` directory |
| Supprimer texture caches legacy | `texture-cache.ts`, `game-object-texture-cache.ts` |
| Supprimer chunk-cache | `chunk-cache.ts` |
| **Tests** | Performance benchmarks, regression tests |

---

## 17. Risques et mitigations

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| **Performance mobile insuffisante** | Utilisabilité | Moyen | LOD agressif, profiling précoce, preset qualité low |
| **339 bâtiments × 4 LOD = 1356 modèles** | Production art | Élevé | Fallback génériques par catégorie, migration progressive |
| **Rotation 360° casse les sprites 2D** | Visuel | Élevé | Utiliser des modèles 3D dès le départ, ou billboard qui font face à la caméra |
| **Perte de tests coverage** | Qualité | Moyen | Écrire les tests en parallèle de chaque phase |
| **Compatibilité WebGL sur vieux devices** | Accessibilité | Faible | Three.js gère WebGL1 fallback, vérification `isWebGLAvailable()` |
| **Taille du bundle Three.js** | Chargement | Faible | Tree-shaking, import sélectif (`three/addons/`) |
| **Mémoire GPU sur mobile** | Crash | Moyen | Budget 256MB strict, LOD, texture downscale |

---

## 18. Décisions ouvertes

Les points suivants nécessitent une décision avant de commencer l'implémentation :

### D1. Style visuel des bâtiments

| Option | Description | Effort art | Rendu rotation |
|--------|-------------|------------|----------------|
| **A. Modèles 3D low-poly** | Modèles glTF pour chaque visualClass | Très élevé (339×) | Parfait |
| **B. Billboards rotatifs** | Sprites 2D qui font face à la caméra | Moyen (réutilise GIF existants) | Correct à petit angle |
| **C. Voxel art** | Modèles voxels auto-générés | Moyen (procédural) | Parfait |
| **D. Hybride** | 3D pour les top-50 bâtiments, billboards pour le reste | Modéré | Bon |

**Recommandation :** Option D (hybride) pour un bon équilibre effort/résultat. Les bâtiments les plus courants (HQ, bureaux, usines) en 3D, le reste en billboard avec un shader qui ajuste la perspective.

### D2. Perspective caméra

| Option | Description | Avantage | Inconvénient |
|--------|-------------|----------|--------------|
| **A. Perspective** | Caméra perspective classique | Réalisme, profondeur | Les bâtiments lointains sont petits |
| **B. Orthographique** | Caméra orthographique (comme l'actuel) | Cohérence avec l'original | Moins immersif |

**Recommandation :** Option A (perspective) avec un FOV faible (30-40°) pour un look quasi-isométrique avec de la profondeur.

### D3. Éclairage

| Option | Description | Performance |
|--------|-------------|-------------|
| **A. Flat/unlit** | Pas d'éclairage, couleurs plates | Excellent |
| **B. Ambient + Directional** | Éclairage basique jour/nuit | Bon |
| **C. Ombres dynamiques** | Shadow maps | Coûteux (desktop only) |

**Recommandation :** Option B par défaut, avec C optionnel pour desktop haute performance.

### D4. Hébergement des nouveaux assets

Les nouveaux modèles 3D et textures haute résolution doivent être distribués. Options :

| Option | Description |
|--------|-------------|
| **A. Bundled** | Inclus dans le build client (augmente la taille du bundle) |
| **B. CDN séparé** | Assets sur un CDN, chargés à la demande |
| **C. Serveur gateway** | Le serveur Node.js existant les sert depuis un dossier |

**Recommandation :** Option C pour démarrer (simple), migration vers B pour la production à grande échelle.

### D5. Format des modèles de terrain

| Option | Description |
|--------|-------------|
| **A. Mesh plat + splatmap** | Terrain complètement plat, shader de mélange | Simple, performant |
| **B. Heightmap** | Terrain avec relief (collines, vallées) | Plus immersif, données supplémentaires |

**Recommandation :** Option A pour respecter le jeu original (terrain plat). Option B pourrait être ajoutée plus tard si des données d'altitude sont ajoutées côté serveur.

---

## Annexe A : Estimations de budget GPU (mobile)

| Élément | Draw calls | Triangles | Textures |
|---------|-----------|-----------|----------|
| Terrain (64×64 chunk) | 1 | 8192 | 4 × 512×512 |
| Routes (par chunk) | ~5 | ~500 | 1 atlas 1024×1024 |
| Béton (par chunk) | ~3 | ~300 | 1 atlas 512×512 |
| Bâtiments LOD0 (proches, ~20) | ~20 | ~10000 | 20 × 256×256 |
| Bâtiments LOD1 (moyens, ~50) | ~10 | ~5000 | 10 × 128×128 |
| Bâtiments LOD2 (loin, ~200) | 1 | ~800 | 1 atlas |
| Véhicules | ~5 | ~500 | 1 atlas |
| Eau | 1 | ~2000 | 2 × 256×256 |
| Overlays | 1-2 | ~100 | 1 DataTexture |
| **Total** | **~50** | **~27000** | **~40 MB** |

Ce budget est confortablement dans les limites d'un mobile milieu de gamme (Snapdragon 7 Gen 1 : ~100 draw calls, ~500K triangles, ~512 MB GPU).

---

## Annexe B : Comparaison avec l'existant

| Aspect | Actuel (PixiJS) | Proposé (Three.js 3D) |
|--------|-----------------|----------------------|
| Rotation | Fixe (4 angles, non implémenté) | 360° libre |
| Zoom | 4 niveaux discrets | Continu |
| Projection | Isométrique 2D manuelle | Perspective/ortho 3D |
| Terrain | 65K+ sprites individuels | 1 mesh + shader splatmap |
| Bâtiments | Sprites 2D plaqués | Modèles 3D + LOD |
| Routes | Sprites 2D par topologie | Modèles 3D instancés |
| Painter's algo | Manuel par zIndex | Z-buffer GPU natif |
| Véhicules | Aucun | Animations client-side |
| Eau | Texture statique | Shader animé |
| Overlays | Graphics API + sprites | DataTexture projetée |
| Draw calls/frame | 6-12 (PixiJS batch) | ~50 (instancing) |
| Mobile perf | 40-50 FPS | Cible 60 FPS |
| Textures source | BMP/GIF legacy | WebP/glTF modernes |
| Taille assets | ~8 MB (BMP+GIF) | ~20-40 MB (modèles+textures HD) |

---

**Fin du document**
