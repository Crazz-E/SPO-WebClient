# Remédiation transport C — session 7B-2 : `politics` + `building-templates`

Date : 2026-08-17 · Branche : `fix/rdo-pool-lifecycle-timeouts-probe`
Source de vérité : `C:\Users\Robin Aleman\Documents\SPO\IIS_ROOT` (lecture seule, non touché)
Entrée : [audit-transport-c-asp.md](audit-transport-c-asp.md) **et son addendum** ·
[remediation-transport-c-7B-1.md](remediation-transport-c-7B-1.md) ·
[analyse-ecarts-voyager-2026-08-16.md](analyse-ecarts-voyager-2026-08-16.md) §2

Chaque correctif cite `Fichier.asp:Ligne` en commentaire dans le code. Chaque test qui figeait
l'ancien comportement dit désormais ce qui échouait et pourquoi.

---

## 0. Résultats

| Critère | État |
|---|---|
| `npm test` | **6 112 tests verts**, 5 skipped, 238/239 suites (1 skipped) |
| `npm run typecheck` | vert (les deux tsconfigs) |
| `npm run build` | vert (serveur + client + terrain-test) |
| `politics-handler.ts` | **100 % lignes · fonctions · branches · statements** · 84 tests |
| `building-templates-handler.ts` | **100 % lignes · fonctions · branches · statements** · 76 tests |
| 9 fichiers de référence | **9/9 suites, 229 tests verts**, inchangés |
| `/* istanbul ignore */` | **0 posé** — budget intact (0 sur 10 après neuf lots) |
| `any` · trame RDO manuelle · CRLF · commit | aucun |

Les deux fichiers étaient à 100 % lignes/fonctions en entrée ; ils y restent, **et gagnent les
branches** (`building-templates` était à 96,5 %). Aucune branche n'a été neutralisée : les trois
branches mortes trouvées ont été **supprimées** parce que la page prouve qu'elles sont
inatteignables (§4).

---

## 1. Correctifs appliqués — `politics-handler.ts`

| Réf | Site | Citation ASP | Avant → après |
|---|---|---|---|
| **B-4** *(1ʳᵉ moitié)* · **A-12** | `:417` | le fichier est `Politics/tycoonratings.asp` — **tycoon au singulier** ; la forme plurielle n'existe pas parmi les 2 774 `.asp` | `tycoonsratings.asp` → **404 à chaque appel**. Le corps du 404 étant du HTML, rien n'était levé et le `catch` ne se déclenchait pas : onglet vide, **zéro log**, sur toute la vie du fichier. Chemin corrigé |
| **B-4** *(2ᵉ moitié)* | `:101` `parsePoliticsRatings` | `tycoonratings.asp:136-139` : `<td class=label` suivi de **trois gestionnaires d'événements** sur des lignes séparées, pas d'un `>` immédiat ; `:146-148` : la valeur est un `<span id=Value_X>` imbriqué à deux niveaux | L'ancien motif exigeait `<td\s+class=label>` avec `>` **immédiat** : **aucune ligne de `tycoonratings.asp` n'aurait matché même avec le bon nom de page.** Le second défaut aurait survécu au premier correctif |
| **B-18** | `:101` | `popularratings.asp:66-77` — une ligne = un `<tr>`, suivie d'un séparateur 1 px | `[\s\S]*?` traversait les frontières de ligne : une valeur rendue vide appariait **le libellé N avec la valeur N+1** et décalait tout le tableau, sans erreur. Appariement borné au `<tr>…</tr>` |
| **A-12** *(le silence)* | `:133` `fetchRatingsPage` | §0 de l'audit : 0 `Response.Status` sur 298 pages → `status` ne dit qu'une chose, « le serveur n'a pas servi la page » | Les trois `fetch` ignoraient `response.status`. Un 404/500 était parsé comme de la donnée. Garde + `log.warn` nommant la page et le code. Un dossier `Ratings\` absent reste un 200 à table vide (`popularratings.asp:60`), donc légitimement `[]` |
| **B-5** ① | `:275` `parseCampaignResponse` | `tycooncampaign.asp:48` (`FullAccess`), `:50`/`:67` (l'appel RDO est sous `FullAccess`), `:401` (`if FullAccess` **intérieur**) | **Mot de passe faux → `<div class=label>` vide → rapporté succès.** L'opération n'avait même pas été tentée |
| **B-5** ② | idem | `:402-411` — `select case LaunchError` **sans `case else`** | Un code hors {100, 101, 102} rendait le même div vide → **rapporté succès** |
| **B-5** ③ | idem | `:91-96` (`CacheObjectValid` faux après annulation) → `:362-388` (invitation à lancer) | **Une annulation réussie était rapportée en échec.** Le chemin nominal était le chemin fautif |
| **B-5** *(oracle)* | `:236-243`, `:275` | `:233` (`Cancel=TRUE`, seul émis si la campagne existe) ; `:380` (`Launch=TRUE`, seul émis si elle n'existe pas) ; `:339` (3ᵉ bouton, ne porte ni l'un ni l'autre) | Le verdict est un **changement d'état** : après un lancement le bouton « Withdraw », après un retrait l'invitation « Launch ». Les codes `RDOLaunchCampaign` 100/101/102 (`:59`, `:403-410`) fournissent le message ; `RDOCancelCampaign` n'en fournit aucun — `:76` l'appelle **sans affecter** le résultat, contrairement à `:59` |
| **fraîcheur du cache** | `:197` `buildCampaignParams` | `:12` lit `Recache`, `:29` et `:90` le poussent dans `Town.Recache` et `CacheObject.Recache` | **Voir §5 — l'`[INFERRED]` le plus important de 7B-1 est levé pour cette page.** L'oracle d'état y est sain par construction, pas par espoir |

---

## 2. Correctifs appliqués — `building-templates-handler.ts`

| Réf | Site | Citation ASP / capture | Avant → après |
|---|---|---|---|
| **B-10** | `:96` `parseClusterInfo` | `info.asp:53` **et** `:60` — le `<script>` du `<head>` construit `"facilityList.asp?Cluster=" + ClusterName + "&Folder=" + td.folder`, **avant** le `<table id="main" cluster="…">` de `:95` | Pas de guillemet après `Cluster=` : la capture courait jusqu'au `"` fermant de la chaîne JS → **`displayName = "PGI&Folder="`**, visible dans l'UI. Motif ancré sur `<table id="main" … cluster="…">` |
| **B-12** | `:206`, `:220` `parseClusterFacilities` + `ClusterFacilityPreview` | `NewLogon/FacilityList.asp:227` `<nobr><%=CacheClass.Size%></nobr>` — **la même expression** que `Build/FacilityList.asp:248`, lue en `area` par le parseur voisin ; la capture la rend `3600 m.` à côté de `$8,000K` (`Mock_Server_scenarios_captures.md:3173-3176`) | Le champ s'appelait `buildTime` et s'affichait comme une durée : « 3600 m. » de temps de construction. Renommé `area` dans le type, le parseur, le store et `CompanyCreationModal.tsx` |
| **B-19** *(mécanisme corrigé — voir §4)* | `:556` `parseBuildingFacilities` | `Build/FacilityList.asp:283` (le `</tr>` intérieur où s'arrête `cellRegex`) vs `:288` (`Requires`, indisponible seulement) et `:292` (`infoBlock_<i>`, `Desc`, toujours émis) ; capture `:3181` vs `:3186` | La description n'était pas « les prérequis à la place » : **elle était toujours vide.** Les deux `<div class="description">` sont hors de `cellContent`. Lue dans la fenêtre de cellule, ancrée sur `infoBlock_<i>`, ce qui évite aussi le div `Requires` antérieur |
| **B-15** | `:498` | `Build/FacilityList.asp:300-314` — toute la cellule « Build now », donc le **seul** `info=`, donc le seul `CacheClass.Id`, est sous `if Available` ; capture `:3163` (icône `MapPGIHQ1.gif`) vs `:3201` (classe `PGIGeneralHeadquarterSTA`) | Le repli « nom de fichier d'icône » s'appliquait aussi à une installation **disponible** : une classe fabriquée sur une carte cliquable, donc envoyable à `NewFacility`. Repli restreint aux indisponibles (identité d'une carte grisée, non constructible — `BuildMenu.tsx:68`, `:75`) ; une disponible sans `info=` est **écartée** avec un `warn`. Le message du warn dit désormais que c'est un nom d'actif visuel |
| **§5 audit** | `:41` `fetchVoyagerPage` | §0 de l'audit : aucun `Response.Status` sur les 298 pages | Les **quatre** scrapers ignoraient `response.status`. Une page d'erreur IIS était parsée comme de la donnée et le caller voyait une liste vide sans erreur — le mécanisme même qui a caché A-12 côté politique. Garde unique + `log.error` nommant la page |
| **§5 audit** | `:292` | `KindList.asp:12-19` puis `:211-214` — chemin de compagnie illisible → `Error="Couldn't open the path…"` rendu en **texte brut** à la place du tableau | Indiscernable d'un cluster vide. Marqueur détecté et journalisé |
| **champ 76** | `:198` (inchangé, documenté) | `KindList.asp:11-14` — `ClusterName` vient de `CompanyProxy.Cluster`, la page ne lit **jamais** `Request("Cluster")` | Notre `Cluster: ''` est inerte et sans danger. Consigné pour qu'on ne le « corrige » pas |

### Code mort supprimé (aucun `istanbul ignore`)

| Site | Pourquoi la page prouve qu'il est inatteignable |
|---|---|
| `parseBuildingCategories` — repli « attribut `title` » | `KindList.asp:181` interpole `CacheClass.Name(LangId)` dans ce `title` — **la même expression** qu'en `:185` dans le `<div class=link>`. Le repli ne pouvait pas fournir un nom que le div n'avait pas déjà ; quand la classe est sans nom, les deux sont vides |
| `kind: urlParams.get('Kind') \|\| ''` | Le `\|\| ''` est sous une garde qui vient de tester la même valeur |
| `cellWindow` — garde `anchor < 0` | `cellIndex` sort toujours d'un `Cell_(\d+)` matché sur **ce** document |

---

## 3. Fixtures re-dérivées

Toutes instanciées **depuis la page** (ou depuis la capture), tabulations, attributs non quotés,
lignes vides des blocs `<% %>` et coquilles de la source comprises. Constructeurs paramétrés :
`ratingsPage()`, `tycoonRatingsPage()`, `campaignPage()`, `infoPage()`, `clusterFacilityPage()`,
`kindListPage()`, `buildFacilityListPage()`, plus la capture `CAPTURED_FACILITY_LIST_HTML`.

| Fixture | Fragment source | Branche ouverte |
|---|---|---|
| `ratingsPage()` | `popularratings.asp:54-86` (= `ifelratings.asp:52-84` au nom de propriété près) | — |
| `tycoonRatingsPage()` | `tycoonratings.asp:123-194` | **jamais testée** — la page n'avait jamais été instanciée, et pour cause : le parseur ne l'avait jamais lue |
| idem, `<select>` d'opinion | `:153-159` | **jamais testée** — cinq `<option>` en pourcentage dans la **même cellule** que la valeur |
| idem, note finale | `:181-187` | **jamais testée** — une cellule `class=label` **sans** cellule de valeur |
| `ratingsPage([['Crime','']])` | `:71` avec une propriété vide | **jamais testée** — la désynchronisation B-18, reproduite puis corrigée |
| `campaignPage({view:'running'})` | `:224-360` | — |
| `campaignPage({view:'invite'})` | `:362-389` | **jamais testée** — c'est l'état d'après une **annulation réussie** |
| `campaignPage({view:'ruler'})` | `:390-397` | **jamais testée** — `IsMayor` |
| `campaignPage({view:'silent'})` | `:399-414`, avec et sans `LaunchError` | **jamais testée** — le div **vide** du mot de passe faux et du code inconnu |
| `campaignPage({capitol:true})` | `:369`, `:395`, `:406` | **jamais testée** — les seuils 1000/`President` du Capitole |
| `infoPage()` **avec son `<head>`** | `info.asp:37-177` | **jamais testée** — l'ancienne fixture n'avait pas de `<head>`, or B-10 vit exactement là |
| `infoPage({cluster:'IFEL'})` | `:103-114` | **jamais testée** — un cluster hors des cinq du `select case` : description vide, et c'est la page |
| `clusterFacilityPage()` | `NewLogon/FacilityList.asp:181-236` | Desc + Requires dans **un seul** div (`:233`) ; `ZoneType` hors 3..9 |
| `kindListPage()` | `Build/KindList.asp:96-218` | **[INFERRED] levé** — voir §6 |
| idem, `roads`/`mayor` | `:98-120`, `:121-152` | **jamais testée** — les deux cellules de tête, qui ne sont **pas** des kinds (`ref="RoadOptions.asp"`, `ref="MayorOptions.asp"`), et la coquille `<td>` imbriqué de `:113-114` |
| idem, kind `enabled:false` | `:189-199` | **jamais testée** — un kind rendu **sans `ref`**, donc inatteignable dans Voyager aussi |
| idem, `error` | `:211-214` | **jamais testée** — `Couldn't open the path` |
| `CAPTURED_FACILITY_LIST_HTML` | capture `:3056-3087` + `:3138-3252`, **verbatim** | remplace une réécriture allégée ; inclut le script `document.all["Cell_" + i]`, qui ne doit pas être pris pour une ancre de cellule |
| `buildFacilityListPage({available:false})` | `Build/FacilityList.asp:217-345` | **jamais testée** — pas d'`info=`, bloc rouge `NOT AVAILABLE` (`:242-244`), **second** div `class="description"` portant `Requires` (`:288`) |

**11 branches jamais testées** avant ce lot.

---

## 4. Où l'ASP ou la capture contredit l'audit

Comme en 7B-1, la page a raison contre la table. Ces corrections priment sur les §2 correspondants.

### C-4 · Champ 87 / B-19 — le diagnostic décrivait le mauvais défaut

L'audit écrit : « **deux** `<div class="description">` possibles […] La regex `:455` prend le
premier : sur un bâtiment indisponible on remonte les **prérequis** au lieu de la description. »

La page dit autre chose. `cellRegex` s'arrête au **premier `</tr>` intérieur**, `Build/FacilityList.asp:283`
— et l'audit le sait, il l'écrit lui-même au champ 84 pour justifier le pré-scan de `VisualClassId`.
Les **deux** divs de description (`:288` et `:292`) sont **après** ce `</tr>`. La capture le confirme :
`</tr>` en `:3181`, `infoBlock_0` en `:3186`.

→ **`description` était toujours vide en production**, disponible ou non. Jamais « les prérequis ».
Le correctif est donc différent de celui que l'audit appelait : ce n'est pas un problème de choix
entre deux divs, c'est un problème de **fenêtre de lecture**. Les deux sont réglés au passage :
l'ancrage sur `infoBlock_<i>` évite aussi le div `Requires`.

### C-5 · `parseBuildingCategories` — un repli mort que l'audit n'a pas vu

Le §2.14 ne mentionne que le défaut de `ref` non quoté (« inoffensif »). Il ne relève pas que le
repli « attribut `title` » (ancien `:249-255`) est **mort par construction** : `KindList.asp:181`
et `:185` interpolent **la même expression**, `CacheClass.Name(LangId)`. Supprimé.

### C-6 · Fraîcheur du cache COM — l'addendum le donnait `[INFERRED]`, `tycooncampaign.asp` le tranche

L'addendum de 7B-1 classe la fraîcheur du cache après mutation comme « **le point le plus
important** » resté sans preuve, en notant que `CacheObject.inc` **ne force pas** `Recache`.

C'est exact en général — et faux pour cette page. `tycooncampaign.asp:12` lit `Recache = Request("Recache") = "YES"`,
puis `:29` fait `Town.Recache = Recache` et `:90` `CacheObject.Recache = Recache`. Or
`buildCampaignParams` envoie `Recache=YES` **depuis toujours**, exactement comme les boutons de la
page (`:233`, `:380`).

→ Pour `tycooncampaign.asp`, l'oracle d'état est **sain par construction, établi par source** :
la réponse est rendue depuis une relecture fraîche. Le risque de faux négatif signalé par
l'addendum ne s'applique pas ici. Il reste entier pour `TycoonBankAccount.asp`,
`TycoonAutoConnections.asp` et `TycoonPolicy.asp`, dont les `InitCacheObject` ne passent pas de
drapeau `Recache`.

### C-7 · Les formats `ImportPrice` et `Size` ne sont plus `[INFERRED]`

Le §7.3 de l'audit liste « format de `CacheClass.ImportPrice` » et « format de `CacheClass.Size` »
comme exigeant une capture live. **La capture existe déjà** et elle était citée deux tables plus
haut : `Mock_Server_scenarios_captures.md:3174` rend `$8,000K` et `:3175` rend `3600 m.`.
Voir §6.

---

## 5. Hors périmètre — signalé, non corrigé

### `mail-list-parser.ts` (§2.16, champ 94) — deux défauts confirmés

Vérifiés sur la page, **non corrigés** conformément au périmètre :

1. `mail-list-parser.ts:72-74` teste trois motifs pour le statut « non lu ».
   `MessageList.asp:199-201` n'émet que `<img src="images/UnreadMsg.gif">` sous
   `if Browser.Header("Read") <> "1"`. **`mailFolderItemBold` et `newmail` sont deux branches
   mortes** ; seul `/unread/i` accroche, et par coïncidence de nommage de fichier.
2. `MsgCount` (`MessageList.asp:244`) donne le nombre de messages attendu et offre un contrôle
   croisé gratuit. Il n'apparaît dans `mail-list-parser.ts` que dans un **commentaire de doc**
   (`:18`), jamais dans le code.

### Moitié cliente du champ 52 (`storable`)

Dette de 7B-1, toujours ouverte : 1 ligne dans `ProfilePanel.tsx:653-660`.

### `kindName` non localisé (champ 75) — divergence connue et acceptée

`KindList.asp:178` met `KindName=<%=CacheClass.Name%>` (**non localisé**) dans le `ref` tandis que
`:185` affiche `<%=CacheClass.Name(LangId)%>` (**localisé**). Nous lisons l'affiché et le renvoyons
en paramètre `KindName`. Non corrigé, et documenté dans le code : `Build/FacilityList.asp:364`
se contente de **ré-afficher** ce paramètre en légende, rien en aval ne s'en sert, et
`Five/0/Includes/language.inc` fixe `LangId = 0`, où les deux formes coïncident. Seul un arbre
`Five/1..5` — que la passerelle n'interroge jamais — les distinguerait. Corriger exigerait un champ
supplémentaire dans `BuildingCategory`, le message WS et le client, pour un gain nul.

---

## 6. `[INFERRED]` du §7 de `couverture-rdo-100.md` — levés et restants

### Levés par ce lot

| `[INFERRED]` | Statut | Preuve |
|---|---|---|
| « corps de réponse `Build/KindList.asp` jamais capturé » (§7.1, annoncé levé par l'audit) | **effectivement levé** — la fixture `[INFERRED]` de `building-templates-handler.test.ts:509-510` est remplacée par une instanciation de `KindList.asp:96-218` | `KindList.asp:96-218`, et le `ref` produit reproduit paramètre pour paramètre la requête capturée (`Mock_Server_scenarios_captures.md:2992`) |
| **format de `CacheClass.ImportPrice`** (champs 71, 85) | **LEVÉ — par capture live**, pas par source | `Mock_Server_scenarios_captures.md:3174` → `$8,000K` |
| **format de `CacheClass.Size`** (champs 72, 86) | **LEVÉ — par capture live** | `:3175` → `3600 m.` ; et c'est bien une surface (B-12) |
| **fraîcheur du cache COM après mutation**, pour `tycooncampaign.asp` seulement | **LEVÉ — établi par source ASP** | `tycooncampaign.asp:12`, `:29`, `:90` — voir C-6 |

### Restants

| `[INFERRED]` / `[UNKNOWN]` | Ce qu'il faudrait |
|---|---|
| **Fraîcheur du cache COM** pour `TycoonBankAccount.asp`, `TycoonAutoConnections.asp`, `TycoonPolicy.asp` | Leurs `InitCacheObject` ne passent aucun drapeau `Recache`. Une **capture live d'un aller-retour mutation → relecture** sur l'une d'elles. Risque = faux **négatif**, jamais faux positif sur de l'argent |
| Format de `Obj.AccountHistory(i)` → `ChartInfo` (champ 37) | Capture live de `TycoonProfitAndLoses.asp` — hors périmètre 7B-2 |
| `FormatCurrency` négatif : `-$1,234` ou `($1,234)` | Capture live d'un P&L en perte. Non bloquant, `parseAspMoney` accepte les deux |
| **`RenderStatus` numérique vs option chaîne** (`TycoonPolicy.asp:68` vs `:92`, C-2 de 7B-1) | Capture live. Le parseur lit les deux formes |
| `util/links.asp` | `[UNKNOWN]` — `IIS_ROOT` est un instantané |
| Refus de `rdoResetTycoon` | `[UNKNOWN]` par construction — la page n'émet aucun signal |
| **Le type de `CacheObj.TycoonsRating` vide** (`tycoonratings.asp:147`) | `[INFERRED]` : nous rendons `0` pour une valeur non numérique, cohérent avec l'ancien comportement sur une valeur invalide. Une capture live d'une note absente dirait si la page rend `%` seul ou rien du tout. **Non bloquant** : quoi qu'elle rende, la ligne ne décale plus les suivantes |
| **Codes `RDOCancelCampaign`** | `[UNKNOWN]`, et **définitivement, côté web** : `tycooncampaign.asp:76` appelle le membre sans affecter le résultat. Seule une déclaration Pascal + une sonde live diraient s'il en renvoie un |

---

## 7. État des lieux du transport C après ce lot

**Les quatre handlers du périmètre audité sont traités.** Sur les 20 correctifs estimés par l'audit
(§10) : 7B-1 en a livré 20 sur ses deux fichiers, 7B-2 en livre 13 sur les siens, plus 3 défauts que
l'audit n'avait pas vus (C-4 dans son mécanisme réel, C-5, et le silence de `fetchVoyagerPage`).

Ce qui reste ouvert :

| Point | Statut |
|---|---|
| `mail-list-parser.ts` (§2.16) | **non traité** — 2 défauts confirmés ci-dessus (§5), aucun n'est de gravité 1 |
| `search-menu-service.ts` → `New Directory/*` | **jamais audité** — l'audit 7A l'a explicitement laissé hors périmètre (§1, dernière ligne). Cinq pages : `DirectoryMain.asp`, `Towns.asp`, `foundtycoons.asp`, `Rankings.asp`, `Banks.asp` |
| Moitié cliente de `storable` | 1 ligne, `ProfilePanel.tsx` |
| Fraîcheur du cache sur les 3 pages restantes | 1 capture live tranche les trois |
| Les 4 oracles `[UNKNOWN]` par construction | `payoff` (B-1), `rdoResetTycoon`, `RDOCancelCampaign`, `TycoonPolicy` — le serveur ne publie rien. L'oracle d'état est le seul possible, et il est en place partout |

**Aucune page d'action du transport C ne rapporte plus un succès sans preuve d'état.** C'est ce que
A-9 prétendait avoir fermé et ne fermait pas ; c'est fermé maintenant, page par page, pour les
quatre handlers audités.

---

## 8. Compétences utilisées

- **Lecture directe** (Read / Grep / Glob / Bash + `node -e` pour lire les octets exacts des pages)
  sur `IIS_ROOT` — aucun sous-agent, conformément à la consigne de session.
- **`CLAUDE.md` racine** + **`src/server/CLAUDE.md`** + **`src/shared/CLAUDE.md`** (mémoires de
  répertoire, chargées automatiquement) — hiérarchie de preuve, fichiers protégés, co-localisation
  des tests, `unknown` en catch.
- **`spo-testing`** — fixtures dérivées de la source et non écrites à la main, ratchet de couverture,
  budget `istanbul ignore`.
- **`code-guardian`** (auto-chargée sur toute écriture dans `src/`) — pas d'`any`, pas de coercition
  de type silencieuse, et sa §E est ce qui a fait sortir la moitié cliente de B-12
  (`CompanyCreationModal.tsx`) comme un correctif à appliquer plutôt qu'une dette.
- **`rdo-conformity` : NON invoquée.** Aucun octet RDO n'est écrit ni modifié ici — le transport C
  passe par le proxy COM du serveur ASP, pas par notre socket. Sa règle centrale est en revanche
  **appliquée** au §6 pour refuser de conclure quoi que ce soit sur les codes de retour de
  `RDOCancelCampaign` depuis l'ASP seul.
- **`delphi-archaeologist` : NON invoquée.** Aucune trouvaille de ce rapport ne dépend de
  `../SPO-Original` ; toutes citent `Fichier.asp:Ligne` ou une ligne de capture.

**Aucun commit, aucun push. `IIS_ROOT` non touché.**
