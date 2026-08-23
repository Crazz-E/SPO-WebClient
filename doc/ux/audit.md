# Audit de l'interface existante — phase 0 de la refonte

Audit **sur le code** (pas sur pixels) du client `src/client/`, réalisé le 2026-08-23 par trois
passes parallèles : système de design / CSS, accessibilité WCAG 2.1 AA, parcours utilisateur.
Chaque constat cite `fichier:ligne`. Ce document alimente le brief ([brief.md](brief.md)) et la
liste des flux à maquetter ; il n'est pas un backlog de correctifs — les défauts listés ici se
règlent **par le portage de la nouvelle interface**, flux par flux, pas par rustines.

Légende de gravité : 🔴 casse un parcours · 🟠 friction forte ou incohérence systémique ·
🟡 à traiter dans le portage.

---

## 1. Parcours utilisateur — ce qui gêne vraiment

### 1.1 Impasses et défauts bloquants 🔴

| # | Constat | Où |
|---|---|---|
| P1 | **Répondre à un mail envoie un message sans destinataire** : le formulaire de composition lit le store une seule fois au montage, `startReply` écrit dans le store après → champs vides | `components/mail/MailPanel.tsx:70-72` |
| P2 | **Mail supprimé reste dans la liste** (pas de refetch), suppression sans confirmation ; **échec d'envoi silencieux** alors que le brouillon est déjà effacé | `bridge/client-bridge.ts:646-653`, `:638-644` |
| P3 | **« Capitol / Politics » sur mobile ouvre une feuille vide** — `SheetContent` n'a pas de branche `politics` | `components/mobile/MobileMenu.tsx:64` vs `MobileShell.tsx:49-77` |
| P4 | **`rightPanel: 'politics'` est une branche morte sur desktop** — ni contenu ni titre | `layouts/GameScreen.tsx:53-74` |
| P5 | **Aucun point d'entrée « fiscalité d'une ville »** : le bouton Capitol ouvre le Capitole (pas de taxes) ; il faut *trouver* l'hôtel de ville sur la carte. La recherche « Towns » déplace la caméra sans ouvrir le bâtiment | `components/hud/LeftRail.tsx:114-118`, `search/SearchPanel.tsx` |
| P6 | **Ouvrir un picker depuis l'inspecteur civique détruit l'inspecteur** — `modalBeneath` n'est écrit que par `requestConfirm/Prompt` ; tout autre `openModal` remplace | `store/ui-store.ts:24-32`, `:150-157` |
| P7 | **Command Palette** : « Find Building by Name » / « Find Player » ouvrent le même panneau de recherche qui **n'a pas de recherche de bâtiment** ; sélection clavier par mutation DOM qui se désynchronise | `components/command-palette/CommandPalette.tsx:126-146` |
| P8 | **Mobile : le panneau Profil/Empire est inaccessible** (Auto-Connections, fournisseurs initiaux, changement de compagnie) | `components/mobile/*` — aucun appelant de `toggleLeftPanel('empire')` |
| P9 | **Raccourcis clavier sans test de modificateur** : Ctrl/Cmd+R rafraîchit la carte au lieu de la page ; Escape fire avant le garde « je tape dans un champ » | `hooks/useKeyboardShortcuts.ts:31,45` |

### 1.2 Frictions structurelles 🟠

- **Construire = 5–6 interactions + 2 attentes réseau** (rail → catégorie → bâtiment → « Place Building » → clic carte) ; le menu est re-demandé au serveur à chaque ouverture ; aucun rappel « coût vs trésorerie » ; **pas de rotation ni d'indicateur persistant de mode placement sur desktop** (le toast expire à 15 s) ; le mode reste actif après une pose réussie sans que rien ne le montre (`handlers/build-menu-handler.ts:234-342`). Le mobile fait mieux (PlacementHUD : Annuler / Tourner / Confirmer).
- **Connecter un fournisseur = 8–10 interactions sur 3 surfaces imbriquées** (overlay → panneau → tiroir → porte → modale) et 4 lectures serveur ; pas de recherche à l'Entrée, filtres réinitialisés à chaque ouverture, aucun retour de succès ; **Fire / touche Suppr déconnectent sans confirmation** (`building/SuppliesGroup.tsx:183-189`). Deux modales visuellement identiques (`ConnectionPickerModal`, `SupplierSearchModal`) pour deux sens différents.
- **Exclusivité des panneaux < 1200 px** : ouvrir les overlays ferme l'inspecteur, sans prévenir ni restaurer (`store/ui-store.ts:132-135`). Trois systèmes de breakpoints coexistent : 768 (`useResponsive`), 1200 (store), 767/1023 (CSS).
- **L'inspecteur civique (modale) et l'inspecteur standard (panneau) ont un chrome, un bouton fermer et un bouton rafraîchir différents** ; le panneau bâtiment n'a pas de scrim, tous les autres panneaux droits en ont un → même conteneur, comportement différent.
- **Overlays** : le placement force ZONES et coupe l'overlay actif sans explication (restauré à l'annulation) ; l'annulation de la peinture de zones **coupe ZONES même s'il était actif avant** — asymétrie (`handlers/zone-handler.ts:54-68` vs `build-menu-handler.ts:369-384`).
- **Recherche** : 4 cartes (Towns, People, Rankings, Banks), Banks est une impasse ; un seul `isLoading` blanchit tout le panneau ; deux boutons « retour » de portée différente dans Rankings.
- **Mail** : pas d'état de chargement au clic sur un message ; Mail est à 3 taps sur mobile (More → Communication → Mail) ; pas de brouillons réels, pas de recherche/tri.
- **Login** : pas de retour vers l'authentification après la zone ; spinners plein écran sans timeout ni annulation sur zone/monde/compagnie ; validation par toast, pas par champ.
- **Mobile** : `MobileInfoBar` perd sparkline, rôle, niveau, noblesse, compagnie, jauge bâtiments, alerte dette ; zoomer de 3 crans = 9 taps (chaque action ferme la feuille) ; les modales desktop s'affichent telles quelles au-dessus de la feuille ; **tap simple retardé de 300 ms** (`renderer/touch-handler-2d.ts:162-165`) ; pinch quantifié (1.3×/0.7×).
- **Écriture sans filet** : aucune confirmation ni annulation sur les dépenses (construction, routes, zones, taxes), sauf le `SaveIndicator` de TaxesTab — le seul retour d'écriture honnête du client.
- **Deux systèmes d'Escape indépendants** (`dismissTopmost` du store vs `setupEscapeHandler` par mode) — un Escape en placement avec un panneau ouvert déclenche les deux.

### 1.3 Ce qui marche et doit être conservé ✅

- Carte plein écran, HUD en superposition, `InfoWidget` compact et lisible.
- `InspectorMenu` master/détail avec `aria-expanded`/`aria-current` (`building/InspectorMenu.tsx:34-42`).
- `TaxesTab` : `SaveIndicator`, « prend effet demain », subvention = mode, couleur + mot (`politics/TaxesTab.tsx:143-153`).
- `IconButton` impose un `label` ; 13 boutons fermer sont nommés ; `TrendIndicator` double la couleur par un glyphe.
- `PlacementHUD` mobile (cible 44 px, confirmer désactivé tant que la pose est invalide).
- Reset `:focus-visible` global et bloc `prefers-reduced-motion` global (`styles/reset.css:72-78`, `styles/animations.css:226-235`).

---

## 2. Système de design — dérive et incohérences

### 2.1 Bugs visuels réels (tokens inexistants) 🔴

25 `var(--x)` référencés **jamais définis** ; sans fallback la déclaration tombe :

- `--z-bottomnav` → **PlacementHUD mobile sans ordre d'empilement** (`mobile/PlacementHUD.module.css:9`) ; `--z-ticker` (`mobile/ChatBanner.module.css:9`)
- `--sai-bottom`, `--content-top` → safe-area et position du ChatBanner invalides (`PlacementHUD.module.css:14`, `ChatBanner.module.css:6`) — jamais posés en TS non plus
- `--accent-blue` (`hud/OverlayMenu.module.css:44-58`), `--status-error/-success` (`empire/ProfilePanel.module.css:732,742,894`, `politics/PoliticsPanel.module.css:214`), `--surface-elevated/-hover`, `--border-default` (`building/BuildingInspector.module.css:115-125`), `--text-xxs` (vrai nom `--text-2xs` ; `CompanyCreationModal`, `ConnectionPickerModal`), `--accent-gold-hover`, `--accent`, `--accent-primary/-danger/-success/-warm` (`PropertyGroup`, `PoliticsPanel`)
- Fallbacks faux : `--radius-md, 8px` (réel 6), `--radius-xl, 16px` (réel 12), `--text-2xs, 0.65rem` ×9 (réel 0.6875), `--text-muted, #4ADE80` (gris → vert)
- **Ancienne palette teal/bleue encore rendue** via fallbacks dans `PoliticsPanel`, `NewspaperModal`, `LoadingSpinner`, `ReconnectingOverlay` (`#4a7a6a`, `rgba(52,89,80)`, `#3b82f6`…)

### 2.2 Valeurs en dur (78 fichiers CSS, 13 756 lignes)

| Catégorie | Nombre | Principaux fichiers |
|---|---|---|
| hex bruts | 46 (28 distincts) | `PoliticsPanel` 12, `ReconnectingOverlay` 9 |
| `rgba()` bruts | 223 (~90 distincts) | `PropertyGroup` 57, `PoliticsPanel` 29, `ProfilePanel` 25 |
| `font-size` px | 19 | `PropertyGroup` 12, `StatCard` 3 |
| padding/margin/gap px | 170 | `PropertyGroup` 34, `PoliticsPanel` 17, `StatusOverlay` 17 |
| `border-radius` px hors échelle | 18 | 2 / 3 / 10 px |
| z-index numériques | 12 | dont `PropertyGroup:901,906` (50/51, sous tout panneau) |
| durées brutes | ~40 | 250 ms partout pour les panneaux alors que `--duration-panel: 300ms` existe et n'est pas utilisé |

Deux fichiers concentrent la moitié de la dette : `building/PropertyGroup.module.css` (~1 900 l.)
et `politics/PoliticsPanel.module.css`.

### 2.3 N façons de faire la même chose

- **Pas de composant Button partagé** : `.closeBtn` ×22 (4 conventions de taille : 32, 28, padding 4 px, IconButton), `.retryBtn` ×8, `.actionBtn` ×8… ; trois recettes de CTA primaire différentes (`ConfirmDialog:81`, `ConnectionPickerModal:242`, `AuthStage:101`).
- **60 blocs `*Header`** sans classe partagée ; `LeftPanel:26` et `RightPanel:41` sont identiques octet pour octet.
- **15 backdrops, 6 alphas** (0.25 → 0.75), trois noms (`.backdrop`, `.overlay`, `.scrim`), pas de token `--scrim`.
- **Scrollbars** : global webkit 8 px + 18 modules en `scrollbar-width: thin` (Firefox seulement).
- **Focus : cinq conventions** (or + offset, teal via token mort, bordure seule, vert `--primary`, box-shadow de deux ors différents) ; 6 `outline: none` sans remplacement (`PropertyGroup:99,349`, `CommandPalette:27`, `EmpireOverview:45`, `SettingsDialog:145`, `PoliticsPanel:295`).
- **8 `.input` locaux**, aucun champ partagé.
- **`styles/typography.css` est du code mort** : 10 classes documentées « à utiliser », 0 référence, 0 `composes:` ; la recette « label majuscule » est retapée dans 29 fichiers.
- 17 keyframes globales + 17 locales dupliquées ; 9 valeurs de `letter-spacing` ; breakpoints 640 / 768 / 900 hors échelle.

### 2.4 Lisibilité et cibles

- **Sur mobile les tokens eux-mêmes passent sous 12 px** : `--text-xs` = 11 px, `--text-2xs` = 10 px (`styles/design-tokens.css:167-169`) ; `--text-xs` est utilisé 208 fois.
- Raw 10 px dans des primitives partagées : `common/DataTable.module.css:17` (tous les `th`), `common/StatCard.module.css:15` ; 8 px `PropertyGroup:1729`.
- **Cibles < 44 px** : fermeture du BottomSheet 32 px, onglets MobileBuildContent ~31 px, MobileInfoBar 36 px, `RightRail` 40 px (visible tablette), fermeture des panneaux 32 px (plein écran sur mobile), fermeture ZoneTypePicker 28 px, 8 modales ≈ 24 px ; `BottomNav` : safe-area appliquée au `nav`, pas aux onglets.

---

## 3. Accessibilité (WCAG 2.1 AA)

### 3.1 Structurel 🔴

- **Aucune modale n'a `aria-modal`, de focus trap, ni de restauration du focus** ; `aria-labelledby` : 0 ; `ConfirmDialog`, `PromptDialog`, `AuthErrorModal`, `ServerSwitchOverlay`, `LeftPanel`/`RightPanel` n'ont même pas `role="dialog"`. Tab sort dans la carte.
- **Formulaires** : 1 seul `htmlFor` dans tout l'arbre (`politics/TaxesTab.tsx:272`) ; login, création de compagnie, settings, prompt, mail, profil, recherche, palette — tout est « placeholder only » ; `aria-describedby` / `aria-required` / `required` : 0 ; erreurs = toast ou bordure rouge seule.
- **Tabs** : `role=tablist/tab` partout mais `aria-controls`, `role=tabpanel`, roving tabindex, flèches : 0 (seule la palette gère ↑↓).
- **Pas de `<main>`, pas de skip link** ; le `<canvas>` créé hors React n'a ni rôle ni alternative — la surface principale du jeu est inaccessible au clavier / lecteur d'écran.

### 3.2 Composants

- Contrôles cliquables non-boutons : toggles `ProfilePanel.tsx:700,709` et `SettingsDialog.tsx:184` (×4, **toute la page Settings est inutilisable au clavier**), `InfoWidget.tsx:147`, lignes de tableau (`DataTable.tsx:87`, `ProductsGroup:192`, `SuppliesGroup:296`, `TaxesTab:136` — `aria-selected` sur `<tr>` sans grille).
- Boutons icône sans nom : `BuildMenu.tsx:264,346`, `SearchPanel.tsx:93`, `MailPanel.tsx:164,167` (répondre / **supprimer**), steppers `PropertyActions.tsx:69,78` ; dropdown canal chat sans `aria-expanded`/`menu` (`ChatStrip.tsx:129,141`).
- Live regions : Toast et ReconnectingOverlay montent la région en même temps que le contenu (pas annoncé) ; `SaveIndicator` n'annonce que le message, **pas l'échec** (`building/SaveIndicator.tsx:84`) ; chat sans `role="log"` ; écrans de chargement muets.
- Couleur seule : `Badge` mode `dot`, sévérité des toasts, `StatCard` profit/perte, prestige, statut en ligne du chat, sélection dans Settings (`aria-pressed`/`aria-checked` absents).
- Mouvement : `BottomSheet` (transform inline), `LoginBackground` (rAF permanent), barre de progression des toasts ignorent `prefers-reduced-motion`.

---

## 4. Ce que l'audit impose à la refonte

1. **Une navigation avec un chemin de retour** : remplacer « un panneau droit, un gauche, une modale, remplacement destructif » par une pile de surfaces explicite (ou des surfaces ancrées), le même chrome pour l'inspecteur civique et standard, un indicateur persistant du mode actif (placement / route / zone) sur desktop.
2. **Un accès direct aux tâches de gouvernance** : Politique/Capitole/Hôtel de ville joignables depuis le HUD et la recherche, sur desktop et mobile (P3, P4, P5).
3. **Un filet d'écriture uniforme** : confirmation sur les dépenses et destructions, `SaveIndicator` généralisé, retour d'échec toujours visible et annoncé.
4. **Un socle de composants partagés** (Button, Field, Dialog, PanelHeader, Scrim, Tabs conformes APG, DataTable accessible) qui règle en une fois les cinq conventions de focus, les 60 headers et les 22 boutons fermer.
5. **Des tokens assainis** : 25 tokens morts créés ou supprimés, `--scrim`, `--z-backdrop/-bottomnav/-ticker`, `--duration-panel` appliqué, `--text-xs` ≥ 12 px sur mobile, un seul système de breakpoints (à trancher : 768 / 1024 / 1200).
6. **Mobile au même niveau** : profil, politique, palette de commandes et zoom continu accessibles ; modales redessinées en feuilles ; cibles ≥ 44 px ; tap sans délai de 300 ms.
7. **Accessibilité par construction** : `Dialog` avec trap + restore, champs labellisés, tabs au clavier, live regions montées en permanence, un rôle et une alternative texte pour la carte.

Les écrans et flux concernés sont repris, par priorité, dans [brief.md](brief.md) §4.

---

*Skills utilisés : `design:design-critique`, `design:accessibility-review`, `web-accessibility`,
`design:design-system`, `mobile-ux-optimizer` (grilles de lecture) ; trois agents `Explore` en
parallèle pour la collecte.*
