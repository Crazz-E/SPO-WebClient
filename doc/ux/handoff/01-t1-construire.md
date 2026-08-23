# Handoff 01 — T1 Construire un bâtiment

Canevas : https://claude.ai/code/artifact/845491f3-837c-466d-a813-d262863c1b31 (planches T1-1 → T1-5,
T1-Mobile ; sources `doc/ux/design/flows/gen.py`). Dépend du socle ([00-socle.md](00-socle.md)).
Code actuel : `components/modals/BuildMenu.tsx`, `handlers/build-menu-handler.ts`,
`renderer/isometric-map-renderer.ts` (placement, `:5000-5008`, `:5100-5104`), `mobile/PlacementHUD.tsx`.

## Objectif mesurable

Construire = **tuile → catégorie → bâtiment → « Placer » → clic carte → Confirmer** (6
interactions, comme aujourd'hui) mais : menu en cache de session (1 requête au lieu de 2 à chaque
ouverture), coût et trésorerie après visibles avant le clic, mode visible tant qu'il dure,
confirmation sur la dépense, rien d'invisible. **Aucun appel RDO nouveau.**

## Données et appels (inchangés)

| Étape | Appel | Quand |
|---|---|---|
| Catégories | `client.onRequestBuildingCategories()` | à la **première** ouverture de la session, puis cache (`build-store`) ; « Actualiser » dans l'en-tête relance |
| Liste d'une catégorie | `client.onRequestBuildingFacilities(kind)` | au clic sur la catégorie, **une fois par catégorie et par session** |
| Placer | `client.onPlaceBuilding(facilityClass, visualClassId)` | clic « Placer sur la carte » |
| Poser | `placeBuilding(x, y)` (`client.ts:783`) | clic carte **après** `Dialog kind=spend` (sauf « ne plus demander ») |
| Coût / après | `facility.cost`, `tycoonStats.cash` | calcul local |
| Verrou | `facility.available`, `category.tycoonLevel` | local |

Champs de `BuildingInfo` utilisés : `name, cost, description, zoneRequirement, xsize, ysize,
available, iconPath`. **Pas** d'emplois ni d'entrées (n'existent pas).

## Surfaces

### T1-1 — contenu `build`, vue catégories
- Feuille (472), jeton « Construire », pas d'épingle.
- En-tête : `h2` Construire + `Field` filtre (« Filtrer les bâtiments par nom… », `/`) — filtre
  **local** sur toutes les listes déjà en cache ; si une catégorie n'est pas chargée, elle
  affiche « n bâtiments » sans filtrer (pas de requête déclenchée par la frappe).
- Corps : grille 2 colonnes de cartes 12 px padding, icône or 22 px (`iconPath` ou lucide
  par `kind`), nom 13/600, « n bâtiments » 11 `--text-muted` (n connu après chargement, sinon
  rien). Squelettes 6 cartes pendant la première requête.
- Pied : « Niveau Entrepreneur · 14 / 50 bâtiments » (`tycoonStats`) + Fermer.

### T1-2 — vue liste
- En-tête : `IconButton back` + `h2` nom de la catégorie + compte ; `Field` filtre.
- Lignes 40 px, grille `1.6fr 1fr 1fr 24px` : nom (13/500), coût mono or, empreinte
  `xsize × ysize`, chevron. Verrouillé : cadenas 14 px + nom `--text-muted`, coût
  `--text-muted`, raison à la place de l'empreinte (« Niveau Magnat » depuis `tycoonLevel`),
  `aria-disabled`, clic → toast info « Disponible au niveau Magnat ».
- Sélection (clic ou ↑/↓ + Entrée) : ligne `--bg-tertiary` + focus or −2 px ; panneau de
  détail **collant en bas du corps** : nom 15/600, coût 15 mono or, description 12, ligne
  « Trésorerie après : $ » (vert si ≥ 0, rouge si < 0 → « Placer » désactivé avec `title`
  « Trésorerie insuffisante »).
- Pied : « Sélection : … » + `Button primary` « Placer sur la carte ».

### T1-3 — placement
- La feuille se **réduit** à 300 px (même composant, prop `compact`) : jetons, nom + coût,
  encart info « Le calque Zones est affiché pendant le placement ; votre calque précédent
  revient à la fin », jetons des autres bâtiments de la catégorie (clic = change le fantôme
  sans quitter le mode). Fermer = Terminer.
- Barre de mode (socle §4.2) : PLACEMENT · nom · coût · après · « Cliquez sur la carte pour
  poser » · Tourner la vue `R` · Terminer `Échap`.
- Fantôme : valide = or pointillé (`placementValid`), invalide = rouge pointillé + indication
  `--error` « Hors zone industrielle » (raison fournie par `placementValid` si le renderer la
  connaît ; sinon « Emplacement invalide »). **Aucun clic invalide ne part au serveur.**
- Calque Zones : `enableCityZonesForPlacement` inchangé, mais l'encart le dit.
- Desktop : clic gauche = poser, clic droit sans glisser = Terminer, Échap = Terminer ; tous
  **affichés** dans la barre.

### T1-4 — confirmation
`Dialog kind=spend` : titre « Construire une {nom} ? », description « À {ville}, {x} × {y}
tuiles, zone {zone}. », lignes Coût (or) / Trésorerie après (vert), primaire « Construire »
(focus initial), « Annuler ». Case « Ne plus demander pour les constructions de cette session »
(`dontAskAgainKey='build'`, `sessionStorage`). Centré sur la zone libre, scrim `--scrim`.

### T1-5 — posée
- `Toast ok` « Construit — {nom} posée à {ville}. » action « Voir » → `focusBuilding(x, y)` +
  `push({kind:'building'})`.
- Barre de mode : « Posée · encore une ? » ; le mode **reste actif** (comportement actuel
  `build-menu-handler.ts:326-342`) ; Terminer le quitte.
- Échec serveur : `Toast err` « Échec — {message serveur} » + Réessayer (rejoue `placeBuilding`
  au même x,y), le mode reste actif.

### Mobile (T1-Mobile)
- Feuille basse à `half` (560 px) : filtre 44 px, cartes de catégories 2 colonnes, liste
  ensuite ; « Placer » ferme la feuille et ouvre la barre de mode mobile (52 px : point or,
  nom + coût, `IconButton rotate` 44 « Tourner la vue », `IconButton x` 44 « Annuler »,
  `Button lg primary` « Poser ») qui remplace la ligne recherche ; les 5 tuiles restent.
- `PlacementHUD` actuel est remplacé par cette barre ; tap carte ignoré en placement (inchangé),
  « Poser » désactivé si `!placementValid`.

## États

| Élément | État | Comportement |
|---|---|---|
| Grille catégories | chargement | 6 squelettes, annonce « Chargement des catégories » |
| Grille catégories | erreur | `ErrorState` dans le corps + Réessayer |
| Liste | vide (filtre) | « Aucun bâtiment ne correspond à « … » » + Effacer le filtre |
| Ligne | verrouillée | cadenas, raison, `aria-disabled`, toast info au clic |
| « Placer » | trésorerie < coût | désactivé + `title` ; la ligne « après » en `--money-negative` |
| Fantôme | invalide | rouge + raison dans la barre |
| Pose | en attente serveur | barre : « Pose en cours… » (spinner 14 px), clics ignorés |

## Accessibilité
- Feuille : focus sur `h2` à l'ouverture ; liste = `role="listbox"` + `aria-activedescendant`,
  ↑/↓, Entrée sélectionne, Échap ferme (si pas de mode).
- Barre de mode : `role="status"` annonçant le changement de mode (« Mode placement : Usine
  textile ») ; boutons nommés avec leur raccourci.
- Dialogue : socle §2.8. Toasts : socle §2.9.

## Ferme dans missing-features
H1, H2, H4 (partiel : comparaison locale), H8 ; B5 (dépense).

## Hors périmètre
Rotation de bâtiment (n'existe pas — H3), coût des routes (H7), recherche de bâtiment (S1).
