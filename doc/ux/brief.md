# Brief d'ergonomie — refonte de l'interface du WebClient

**Statut : v1 — cadrage validé, socle et flux T1/T3 livrés** (2026-08-23). Tiré du code et de l'[audit](audit.md), pas encore
d'entretiens joueurs. Les lignes marquées **[À CONFIRMER]** sont des hypothèses du rédacteur à
valider par le porteur du projet ; les autres découlent de faits du code ou du dépôt.

---

## 1. Qui joue

| Profil | Ce qu'il fait surtout | Ce qu'il attend de l'interface |
|---|---|---|
| **Le tycoon** (cas général) | Construire, raccorder ses usines à des fournisseurs, surveiller trésorerie et production, lire le courrier | Construire et connecter vite, voir d'un coup d'œil ce qui ne tourne pas, ne pas perdre sa place |
| **Le gouvernant** (maire, ministre, président — cf. `doc/civic-roles-reference.md`) | Taxes, budgets, nominations, zones, campagnes | Atteindre *sa* ville ou *son* ministère en un geste, écrire sans se tromper, être sûr que ça a pris |
| **L'ancien de Voyager** **[À CONFIRMER]** | Retrouve ses repères du client Delphi | Le vocabulaire et l'ordre des informations de Voyager (`doc/voyager-inspector-architecture.md`), pas une réinvention |
| **Le joueur mobile** **[À CONFIRMER : part réelle ?]** | Surveiller, répondre au courrier, ajuster ; construit moins | Les mêmes capacités qu'au bureau, dans une main, sans modale desktop posée sur une feuille |

## 2. Les tâches clés et leur friction actuelle

Chiffres = interactions minimales aujourd'hui (audit §1). Priorité : **P1** premier lot, **P2** second, **P3** ensuite.

| # | Tâche | Aujourd'hui | Friction principale | Prio |
|---|---|---|---|---|
| T1 | Construire un bâtiment | 5–6 interactions, 2 attentes | Pas de rotation ni d'indicateur de mode sur desktop, menu rechargé à chaque fois, aucun rappel coût/trésorerie, pas de confirmation | P1 |
| T2 | Inspecter un bâtiment, comprendre pourquoi il ne produit pas | 2 clics + choisir une section (rien d'ouvert par défaut) | Pas de « diagnostic » en tête ; sections à charger une par une | P1 |
| T3 | Raccorder un fournisseur | 8–10 interactions, 3 surfaces imbriquées | Modale sur tiroir sur panneau, pas d'Entrée, filtres perdus, déconnexion sans confirmation | P1 |
| T4 | Savoir où j'en suis (cash, revenu, alertes, bâtiments) | HUD permanent — bon | Mobile perd 8 informations sur 12 ; dette/alerte invisible sur mobile | P1 |
| T5 | Régler les taxes d'une ville | 5–8, dont trouver l'hôtel de ville à la main | **Pas de point d'entrée** ; mobile : feuille vide | P2 |
| T6 | Lire et répondre à un mail | 3 + compose | Réponse sans destinataire (bug), suppression sans confirmation, 3 taps sur mobile | P2 |
| T7 | Trouver un bâtiment / un joueur / une ville | 2–4 | Pas de recherche de bâtiment, palette qui promet ce que la recherche n'a pas, pas de palette sur mobile | P2 |
| T8 | Changer d'overlay, peindre une zone, tracer une route | 2–3 | Overlay coupé sans explication, feuille/panneau qui se chevauchent sur mobile, pas d'aperçu de coût | P2 |
| T9 | Se connecter et entrer dans un monde | 4 étapes | Pas de retour à l'auth, spinners sans timeout, validation par toast | P3 |
| T10 | Gouverner (ministères, budgets, nominations, campagne) | modale civique | Tout picker détruit l'inspecteur civique | P3 |
| T11 | Régler ses préférences | 1 | Settings inutilisable au clavier | P3 |

## 2bis. Contraintes de données à prendre en compte

- **La liste longue, c'est le bloc Inspect.** L'aperçu (`StatusOverlay`) et l'en-tête de
  l'inspecteur rendent un **bloc unique** (`detailsText` / `salesInfo` / `hintsText`) que le serveur
  pousse en continu ; pour un entrepôt (« Storing: … » × dizaines de produits) ou un supermarché
  Magna (lignes de vente), il est très long. Comme les données sont déjà là, la réponse est
  **locale et gratuite** : filtre toujours visible, tri par nom affiché, lignes compactes,
  défilement interne, compteur.
- **Les onglets Approvisionnements / Produits / Services ne changent pas côté requêtes.** Une
  ligne repliée ne montre **rien de plus que le code actuel** (le nom) ; c'est **l'ouverture du
  dépliant qui déclenche la lecture** (quantités, nombre de fournisseurs, liste, curseurs). Le
  nombre de requêtes RDO est une contrainte dure — chaque lecture par ligne coûte au joueur.
  Le filtre s'applique aux noms ; aucun regroupement ne nécessite de lecture supplémentaire.
- **Aucune catégorie de produit n'existe dans le jeu** : `TMetaFluid` (`Kernel/Kernel.pas:743-798`)
  n'a que nom, unité, prix, poids et un *set* de flags de capacité jamais sérialisé vers le
  client ; l'ordre des portes d'un entrepôt est l'ordre ASCII des ids internes
  (`Class Storage/NativeClassStorage.pas:133-152`, `StdBlocks/MegaWarehouse.pas:53-88`). Donc pas
  de groupes par famille ; le tri par nom affiché est la seule classification honnête. Une table
  éditoriale côté client reste possible mais c'est une décision à prendre, pas une hypothèse.
- Les valeurs techniques (coordonnées, ids, classes, bitmasks) restent disponibles mais ne se
  rendent jamais dans le flux nominal ([audit §5](audit.md)).
- **Toute fonctionnalité supposée par l'ergonomie est vérifiée** dans le WebClient ; ce qui
  manque — et existe dans Voyager — est listé dans [missing-features.md](missing-features.md).

## 3. Ce qui ne bouge pas

- La **carte isométrique plein écran** reste le fond ; l'interface est une superposition.
- La **palette « Corporate Empire »** (fonds neutres sombres, vert `--primary`, or `--accent-gold`) et `lucide-react` — la refonte est **ergonomique, pas identitaire**. **[À CONFIRMER]**
- La **Command Palette** (Cmd+K) et les raccourcis B / E / M / R / D / Échap — mais corrigés (modificateurs, champ actif) et **disponibles sur mobile** via un bouton.
- Les **noms d'écrans et l'ordre des informations de Voyager** là où ils existent (inspecteur, onglets civiques).
- La **pile technique** : React, Zustand, CSS Modules, tokens — aucune lib UI ajoutée sans accord.
- Le **protocole RDO** et le serveur : hors périmètre. Une donnée manquante = ticket séparé.

## 4. Objectifs mesurables

| Objectif | Cible | Mesure |
|---|---|---|
| Profondeur d'action | Toute tâche P1 démarrable en **≤ 2 interactions** depuis le HUD ; T3 en **≤ 5** | Compte dans les maquettes puis dans le code |
| Retour d'écriture | **100 %** des écritures (dépense, destruction, réglage) ont un état *en cours / confirmé / échoué* visible **et annoncé**, les destructions et dépenses ont une confirmation | Revue par flux |
| Pas de perte de contexte | Ouvrir une surface depuis une autre **ne la détruit jamais** sans retour | Revue du store |
| Lisibilité | Aucun texte **< 12 px** (desktop et mobile) | Tokens + lint CSS |
| Tactile | Toute cible **≥ 44 × 44 px** sur mobile et tablette | CSS + revue |
| Accessibilité | **WCAG 2.1 AA** : dialogues avec trap/restore/labelledby, champs labellisés, tabs au clavier, live regions permanentes, focus visible unique (or, 2 px, offset 2 px) | `design:accessibility-review` par flux |
| Parité mobile | Profil, politique, palette, zoom continu **disponibles** ; aucune modale desktop au-dessus de la feuille | Inventaire des surfaces |
| Système | **0 token inconnu**, 0 `outline:none` sans remplacement, un seul système de breakpoints | Lint `custom-property-pattern` + grep |
| Performance | Le HUD n'entame pas le budget de frame du renderer (`web-games`) | `performance-analyzer` si doute |

## 5. Plateformes

- **Desktop ≥ 1200 px** : référence, deux panneaux simultanés possibles.
- **Tablette 768–1199 px** : un panneau à la fois **avec** un chemin de retour explicite.
- **Mobile < 768 px** : feuille basse + barre d'onglets ; toutes les surfaces desktop ont un équivalent.
- Un **seul** système de breakpoints (proposition : 768 / 1200, soit les deux seuils réellement utilisés par le comportement) **[À CONFIRMER]**.

## 6. Décisions prises pour avancer (modifiables)

| Question | Choix retenu pour démarrer | Pourquoi |
|---|---|---|
| Maquettes statiques ou prototype cliquable ? | **Statiques** pour la direction et le système ; cliquable seulement pour T1 et T3 (transitions de surfaces) **[À CONFIRMER]** | La friction de ces deux flux est dans les transitions, pas dans les écrans |
| Premier lot | **Cœur de jeu** : HUD (T4) + construction (T1) + inspecteur & fournisseurs (T2, T3) **[À CONFIRMER]** | C'est là que passe le temps de jeu et là que se concentrent les défauts 🔴/🟠 |
| Thème clair | **Plus tard** **[À CONFIRMER]** | Double les états à maquetter ; les tokens sont mono-thème aujourd'hui |

## 6bis. Avancement du portage (main, 2026-08-23)

| PR | Contenu | Ferme |
|---|---|---|
| #55 | cadrage + **socle-1** tokens (garde-fou Jest, 0 token inconnu, focus or, 12 px mobile) | audit §2.1, §2.3 focus |
| #56 | **socle-2** composants : Button, Dialog (focus trap/restore), Toast, SaveIndicator, Field, Chip, Switch/Checkbox/Radio, Tabs APG, Empty/Error | audit §3 (Settings au clavier, dialogues) |
| #57 | **socle-3** pile de surfaces + feuille universelle + surface Government + civique dans la feuille | P1, P2, P6, E1, E2 |
| #58 | **socle-4** raccourcis, StatusPill, CommandBar + barre de mode, menu mobile | H1, H5, S2, P9 |
| #59 | **T1 Construire** | H2, H4, H8, B5 dépense |
| #60 | **T3 Fournisseur** | B4, N9, B5 déconnexion |
| #63 | **T2 Diagnostic** — parseur des hints serveur (sévérité + action) ; bandeau dans l'inspecteur et l'aperçu | B7 |
| #62 | **T6 Courrier** — réponse pré-remplie (bug), brouillon conservé jusqu'à la réponse, suppression confirmée et retrait local, état de chargement | M1, M2, M3 |
| #64 | **T7 Recherche** — palette : mes bâtiments (favoris lus une fois), villes, coordonnées « x,y » ; commandes mortes retirées | S1 (local), N5 (palette) |
| #65 | **T5 Taxes** — entrée « Taxes » par ville dans Government (hôtel de ville ouvert sur Administration) ; lignes du tableau des taxes atteignables au clavier | P2 (complément), audit §3 (lignes cliquables non-boutons) |
| #66 | **T8 Modes carte** — overlay Zones : même entrée/sortie pour placement et zonage, expliqué dans la barre de mode ; route : tarif dans la barre de mode, Dialog de dépense à la relâche, démolition confirmée | B5 (routes), H7, audit « Overlays » |

Restent (dans l'ordre proposé) : vue Carte (N1–N4), mobile : barre de commande complète, feuille flottante 472 px.

## 7. Livrables attendus de la phase Design

1. **Canevas « Direction »** — 3 artboards low-fi du HUD de jeu sur des axes nommés, un choix.
   **Fait (v1)** : https://claude.ai/code/artifact/b7719533-668e-46c6-97a0-aca177da9af1 — sources dans
   [design/direction/](design/direction/). Options : **A** HUD flottant consolidé · **B** cockpit
   ancré · **C** carte pure + feuille universelle. **Décision (2026-08-23) : Option C, sans hésiter.**
2. **Canevas « Système »** — Button, Field, Dialog/Sheet, PanelHeader, Tabs, DataTable, StatCard, Toast, SaveIndicator, dans leurs états (repos / hover / focus / désactivé / chargement / vide / erreur), desktop et mobile.
   **Fait (v1)** : https://claude.ai/code/artifact/41b437c4-2db5-4ccf-b4f7-0512d23e10db — sources dans
   [design/system/](design/system/) : Fondations · Contrôles · Surfaces (feuille universelle, dialogue, toasts, SaveIndicator) · Listes (**liste longue** entrepôt / Magna) · Mobile. **À valider.**
3. **Canevas par flux** P1 puis P2 : écrans desktop et mobile côte à côte, états réels (données du mock server), copy finale (`design:ux-copy`).
   **Fait (v1) — T1 Construire + T3 Raccorder un fournisseur** : https://claude.ai/code/artifact/845491f3-837c-466d-a813-d262863c1b31 — 15 planches
   (T1-1…T1-5 + mobile, T3-1…T3-5 + mobile), générées par [design/flows/gen.py](design/flows/gen.py). Audit de
   branchement de chaque élément visuel : [missing-features.md §9](missing-features.md). **À valider.**
4. **Handoff par flux** (`doc/ux/handoff/<flux>.md`) : tokens, composants, props, états, breakpoints, animations, cas limites.
   **Fait (v1)** : [handoff/00-socle.md](handoff/00-socle.md) (tokens, composants partagés, feuille universelle + pile, HUD, ordre des 4 PR socle), [handoff/01-t1-construire.md](handoff/01-t1-construire.md), [handoff/02-t3-fournisseur.md](handoff/02-t3-fournisseur.md).

---

*Skills utilisés : `product-management:write-spec` (structure), `design:user-research` (grille
des profils et tâches) ; faits tirés de [audit.md](audit.md).*
