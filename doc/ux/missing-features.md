# Fonctionnalités supposées par l'ergonomie — état dans le WebClient, référence Voyager

Règle posée le 2026-08-23 : **toute fonctionnalité supposée par la refonte est vérifiée dans le
WebClient** ; si elle n'existe pas, on regarde si le client Voyager l'offrait (`../SPO-Original`,
cité `File.pas:Ligne`) — auquel cas elle est à implémenter et listée ici. Ce fichier est la liste
de travail du portage ; il complète [audit.md](audit.md) (défauts de l'existant) et
[brief.md](brief.md) (objectifs).

Légende : ✅ existe · 🟡 partiel · ❌ manquant · **V** = Voyager l'avait (référence citée) ·
**—** = Voyager ne l'avait pas non plus (proposition nouvelle, à décider).

---

## 1. Carte et navigation

| # | Fonction supposée | WebClient | Voyager | À implémenter |
|---|---|---|---|---|
| N1 | **Vue « Carte » de données** (bâtiments par classe, mes bâtiments, déficitaires en rouge, brouillard sur l'inexploré, rectangle de vue, clic = sauter, zoom propre) | 🟡 `ui/minimap-ui.ts` — colormap **terrain seul** + rectangle de vue + clic = recentrer ; taille en 3 presets, pas de zoom propre ; mobile = plein écran seulement | **V** `Map.pas:3512-3626` (couleur par classe `GetBuildingColor`, `cLoosingColor` rouge, `fSeen` → brouillard), `IsometricMap.pas:438-451` (clic → `MoveTo`), `FiveIsometricMap.pas:12,44-62` (zoom 1–100 %) | Dessiner bâtiments / mes bâtiments / déficitaires / brouillard sur la minicarte ; zoom molette sur la minicarte ; feuille « Carte » desktop + mobile |
| N2 | **Retour / Suivant** (historique de positions) | ❌ aucun historique caméra (le seul `goBack` est celui du panneau Recherche, `search-store.ts:68`) | **V** `MapIsoView.pas:1009-1036` (100 entrées, seuil selon le zoom), boutons `btBack`/`btNext` | Pile de positions dans le renderer/store + 2 boutons dans la feuille Carte |
| N3 | **Aller à l'hôtel de ville le plus proche** | ❌ pas de membre RDO `GetNearestTownHall` catalogué ; seulement `onOpenCapitol` (`build-menu-handler.ts:108`) | **V** `MapIsoView.pas:978-1007` (`GetNearestTownHall(x,y)` puis `MoveAndSelect`) | **Sans nouveau RDO** : la liste des villes (`search-menu-service.ts`, `TownInfo.x/y`) + tri par distance côté client. Le membre RDO d'origine reste à vérifier avec `delphi-archaeologist` si on veut la parité exacte |
| N4 | **Favoris de position** (ajouter / renommer / supprimer / aller) | 🟡 l'arbre RDO des favoris **est** lu (`RDOFavoritesGetSubItems`, `session-utils.ts:13,35` — liens `nom,x,y`) et affiché comme « My Facilities » ; **pas d'ajout / suppression / dossiers** | **V** `MapIsoView.pas:683-716` (LINKS en cookies serveur), `:882-924` (ADD), `:1064-1076` (aller) | Ajout / suppression / renommage ; décider du stockage (RDO favoris — membre d'écriture à cataloguer via `delphi-archaeologist` — ou local) |
| N5 | **Aller à des coordonnées** (palette « x,y », coordonnées cliquables dans le chat) | 🟡 `onNavigateToBuilding(x,y)` existe (`client-bridge.ts:181`) ; **pas** de saisie libre dans la palette (`CommandPalette.tsx:32-96`, 9 commandes statiques), **pas** de lien dans le chat | **V** URL `MoveTo`/`Select x,y` (`MapIsoHandler.pas:240-254`), liens dans le chat (`ChatHandler.pas:96`) | Palette : saisie `x,y` ; chat : linkification des coordonnées |
| N6 | **Déplacement** : glisser au clic gauche, bords d'écran, flèches | 🟡 glisser = **clic droit seulement** (`isometric-map-renderer.ts:4960`), tactile ok ; **pas** de défilement au bord, **pas** de flèches | **V** glisser gauche (`GameControl.pas:508-538`), bords (`VoyagerWindow.pas:684-771`) ; flèches **commentées** (`VoyagerWindow.pas:657-666`) | Glisser au clic gauche hors mode, défilement au bord (option), flèches (nouveau, à décider) |
| N7 | **Rotation de la vue sur desktop** | 🟡 renderer ok (`rotateCW/CCW`, `:723-727`), touche **Q** seule (`:621`), **aucun bouton desktop** ; `key-binding-registry.ts` (Q/E, rebind, persistance) est **du code mort** | **V** 2 boutons rotate (`FiveControl.pas:665-693`) | Bouton + touches Q/E ; brancher `key-binding-registry` |
| N8 | **Zoom** | ✅ 4 niveaux, +/−, molette zoom-vers-curseur (`:5176-5204`), pinch | **V** 4 niveaux (`GameTypes.pas:24`), pas de molette | — |
| N9 | **« Voir sur la carte »** depuis l'inspecteur | 🟡 recentrage implicite via `focusBuilding` ; **aucun bouton** explicite (`BuildingInspector.tsx:260-280` : Actualiser + Fermer) | **V** `MoveAndSelect` depuis les fiches (`ProdSheetForm.pas:761`) | Bouton dans le pied de la feuille |
| N10 | **Choisir sur la carte** depuis un dialogue (pick-on-map) | 🟡 un seul flux : `connectMap` (`building-action-handler.ts:603`) ; pas dans les pickers de fournisseurs | **V** `PICKONMAP` (`MapIsoHandler.pas:277-285`) | Ajouter au flux « Trouver un fournisseur » |

## 2. Bâtiment et inspecteur

| # | Fonction supposée | WebClient | Voyager | À implémenter |
|---|---|---|---|---|
| B1 | Renommer | ✅ `BuildingInspector.tsx:328-332`, `set Name` catalogué | V | — |
| B2 | Bloc Inspect (« Storing », ventes, hints) poussé en continu | ✅ `map-parsers.ts:170,257-266`, push `RefreshObject` ~5 s, texte mis à jour à chaque push (`event-handler.ts:141`) ; **deux parseurs** (`RichDetails.tsx:124`, `QuickStats.tsx:123`) | V | Filtre + tri locaux sur le bloc ; fusionner les deux parseurs au portage |
| B3 | Onglets Approvisionnements / Produits : noms à l'ouverture de l'onglet, détail à l'ouverture de la ligne | ✅ déjà ainsi — 1 RDO (`GetInputNames`/`GetOutputNames`) à l'ouverture, puis `SetPath` + `GetPropertyList` + `GetSubObjectProps` ×connexions (max 20, 3 à la fois) à l'ouverture (`building-details-handler.ts:364,1264`) | V | **Ne rien ajouter** sur les lignes repliées ; filtre de noms local |
| B4 | Recherche fournisseur : Entrée lance, filtres conservés | ❌ Entrée ne fait rien (`ConnectionPickerModal.tsx:124-131`), filtres réinitialisés à chaque ouverture (`:44-53`) | — | Entrée + mémoire des filtres (store) |
| B5 | Confirmation des actions destructives / coûteuses | 🟡 `requestConfirm` : **démolir seulement** (`building-action-handler.ts:462`) ; rien sur déconnexion, démolition de route, rétrogradation, dépense | — | Dialogue de confirmation généralisé (planche Surfaces) |
| B6 | SaveIndicator sur toute écriture | 🟡 `PropertyInputs`, `WorkforceTable`, `TaxesTab`, `MinistriesTab`, `JobsTab`, `TownsTab` ; **pas** sur renommer, connexions, curseurs fournisseurs | — | Généraliser ; ajouter l'état « en attente de relecture » (OB-29) |
| B7 | Diagnostic en tête (« Production arrêtée — il manque du coton ») | 🟡 `hintsText` brut affiché (`StatusOverlay.tsx:443`, `RichDetails.tsx:532`), sans sévérité ni action | V (texte brut aussi) | Parser les hints connus → sévérité + action (« Trouver un fournisseur ») ; fallback texte brut |
| B8 | Bouton « Trouver un fournisseur » depuis une porte vide | ✅ Hire → `ConnectionPickerModal` | V | — (le placer aussi dans le diagnostic) |

## 3. HUD et modes

| # | Fonction supposée | WebClient | Voyager | À implémenter |
|---|---|---|---|---|
| H1 | Indicateur de mode persistant (placement / route / zone) sur desktop | ❌ rien (`isPlacingBuilding` lu par `MobileShell` seulement) ; route/zone = bouton surligné | — | Barre de mode (planche HUD) |
| H2 | Confirmer / annuler la pose sur desktop | ❌ clic gauche pose, clic droit annule, Échap — non affiché | — | Boutons dans la barre de mode ; le mobile a déjà `PlacementHUD` |
| H3 | **« Tourner » en placement** | ⚠️ **tourne la carte**, pas le bâtiment (`MobileShell.tsx:136` → `rotateCW`) ; **aucune orientation de bâtiment** n'existe | **V** idem : pas d'orientation de bâtiment | Libeller « Tourner la vue » ; ne pas promettre une rotation de bâtiment |
| H4 | Coût vs trésorerie avant la pose, trésorerie après | ❌ coût affiché (`BuildMenu.tsx:115`), jamais comparé au cash ; aucune désactivation | — | Comparaison locale (`tycoonStats.cash`) dans la barre de mode et le dialogue |
| H5 | Liste des raccourcis à jour | 🟡 `SettingsDialog.tsx:136-145` (B E M R ⌘K Esc D) ; Q, +/−, 1–5 absents ; collision M (mail vs minimap dans le registre mort) | — | Générer la liste depuis le registre ; réattribuer M = Carte, L = Courrier |
| H6 | Pastille d'état avec alertes cliquables (bâtiments en difficulté) | 🟡 `InfoWidget` a la teinte dette (`failureLevel`) ; **pas de liste** des bâtiments en difficulté | — | Liste dérivée des `hintsText` / revenus négatifs déjà reçus (pas de RDO en plus) |

## 4. Politique et points d'entrée

| # | Fonction supposée | WebClient | Voyager | À implémenter |
|---|---|---|---|---|
| P1 | Politique depuis le HUD / la feuille (desktop **et** mobile) | ❌ `rightPanel: 'politics'` déclaré (`ui-store.ts:12`) mais **rendu nulle part** : feuille vide sur mobile (`MobileShell.tsx:47-73`), panneau sans contenu sur desktop (`GameScreen.tsx:63-74`) ; la politique n'existe que dans la **modale civique** | V (fiches civiques) | Brancher le contenu civique dans la feuille universelle |
| P2 | Ouvrir l'hôtel de ville de **ma** ville / les taxes directement | ❌ seul `onOpenCapitol` ; hôtel de ville = clic sur la carte ou Recherche › Villes (recentre sans ouvrir) | **V** GO TOWN HALL (`MapIsoView.pas:978`) | N3 + ouverture de l'inspecteur à l'arrivée |

## 5. Courrier, recherche, palette

| # | Fonction supposée | WebClient | Voyager | À implémenter |
|---|---|---|---|---|
| M1 | Répondre pré-remplit le destinataire | ❌ **bug** : `MailPanel.tsx:70-72` lit le store une fois au montage | V | Synchroniser store → local (ou contrôler les champs par le store) |
| M2 | Suppression avec confirmation + refetch | ❌ `client-bridge.ts:646-653` | — | Confirmation + rafraîchir le dossier |
| M3 | Échec d'envoi visible, brouillon conservé | ❌ branche `success: false` vide, brouillon effacé avant réponse (`:638-644`) | — | Toast `alert` + conservation |
| S1 | **Recherche de bâtiment par nom** | ❌ aucun membre RDO ni route ; la palette « Find Building by Name » ouvre le panneau Recherche qui ne le fait pas | — (Voyager : pas de recherche générale ; `FindSuppliers`/`FindClients` filtrent par nom mais par fluide et autour d'un bâtiment) | Décider : recherche **locale** dans « Mes bâtiments » (favoris déjà lus) + villes + joueurs ; pas de nouveau RDO tant que non justifié |
| S2 | Palette sur mobile | ❌ montée mais sans déclencheur tactile (`useKeyboardShortcuts.ts:25-29` seulement) | — | Champ de recherche de la barre de commande (planche HUD / Mobile) |

## 6. Empire

| # | Fonction supposée | WebClient | Voyager | À implémenter |
|---|---|---|---|---|
| E1 | Profil / auto-connexions sur mobile | ❌ tous les appelants de `toggleLeftPanel('empire')` sont cachés < 768 px ; `MobileMenu` ne l'ouvre pas ; `LeftPanel.module.css:93-97` a pourtant un style mobile | V | Tuile « Empire » de la barre de commande → feuille |
| E2 | Épingler la feuille (rester ouverte en cliquant d'autres bâtiments) | 🟡 implicite : `noScrim` sur le panneau bâtiment seulement (`GameScreen.tsx:114`) ; pas de contrôle, pas pour mail/recherche | — | Bouton « Épingler » ; pas de scrim sur la feuille en général |

---

## 7. Ce qui est confirmé présent (pas de travail)

Zoom (N8), renommer (B1), bloc Inspect poussé en continu (B2), régime de lecture des onglets
(B3), « Trouver un fournisseur » depuis une porte (B8), `SaveIndicator` sur les taxes et
ministères, `requestPrompt` pour les nominations, favoris lus, `PlacementHUD` mobile, minicarte
plein écran mobile.

## 8. Ce que l'ergonomie retire de ses promesses

- **Rotation de bâtiment** : n'existe nulle part — les boutons disent « Tourner la vue ».
- **Catégories de produits** : n'existent nulle part (`Kernel/Kernel.pas:743-798`) — tri par nom seulement.
- **Données sur une ligne repliée** des onglets : jamais (budget RDO).

---

*Sources : agent de vérification sur le code du WebClient (2026-08-23) ; archéologie Voyager
`Voyager.1/Components/MapIsoView/*`, `VoyagerWindow.pas`, `URLHandlers/MapIsoHandler.pas`,
`Kernel/Kernel.pas`, `StdBlocks/StdFluids.pas`, `Class Storage/NativeClassStorage.pas`.*
