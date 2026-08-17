# Remédiation transport C — session 7B-1 : `profile-finance` + `auto-connection`

Date : 2026-08-17 · Branche : `fix/rdo-pool-lifecycle-timeouts-probe`
Source de vérité : `C:\Users\Robin Aleman\Documents\SPO\IIS_ROOT` (lecture seule, non touché)
Entrée : [audit-transport-c-asp.md](audit-transport-c-asp.md) · [analyse-ecarts-voyager-2026-08-16.md](analyse-ecarts-voyager-2026-08-16.md) §2

**Première session qui écrit en production depuis le lot 0.** Chaque correctif cite `Fichier.asp:Ligne`
en commentaire dans le code, et chaque test qui figeait l'ancien comportement dit désormais ce qui
échouait et pourquoi.

---

## 0. Résultats

| Critère | État |
|---|---|
| `npm test` | **6 076 tests verts**, 5 skipped, 238/239 suites (1 skipped) |
| `npm run typecheck` | vert (les deux tsconfigs) |
| `profile-finance-handler.ts` | **100 % lignes · 100 % fonctions** · 98,31 % branches · 105 tests |
| `auto-connection-handler.ts` | **100 % lignes · 100 % fonctions · 100 % branches** · 93 tests |
| 9 fichiers de référence | **9/9 suites, 229 tests verts**, couverture inchangée |
| `/* istanbul ignore */` | **0 posé** — budget intact (0 sur 10 après huit lots) |
| `any` · trame RDO manuelle · CRLF · commit | aucun |

Les 4 branches non couvertes de `profile-finance-handler.ts` sont des replis défensifs
structurellement inatteignables (`|| 'Unknown'` sur un nom de niveau déjà non vide,
`?? '0'` sur une regex qui vient de matcher un montant, `if (!parent.children)` sur un
tableau initialisé au constructeur). Aucune n'a été neutralisée par un `ignore`.

---

## 1. Correctifs appliqués

### 1.1 `profile-finance-handler.ts`

| Réf | Site | Citation ASP | Avant → après |
|---|---|---|---|
| **B-8** | `:100` `kvPattern` | `TycoonCurriculum.asp:142-147` : le libellé et le `<span class=value>` vivent dans le **même** `<div class=label>`, rien ne se ferme entre les deux | La regex exigeait un `</span>`/`</div>` après le libellé → **aucune paire n'était jamais extraite** sur une page réelle. Motif corrigé ; `prestige` et `nobPoints` sont lus |
| **B-8** *(2ᵉ défaut)* | `:106` `switch` | libellé réel `strTotalPrestige = "Total Prestige"` (`eNewTycon.lng:124`), pas `prestige` | Clé `total prestige`. Réparer la seule regex n'aurait rien donné |
| **B-8** *(3ᵉ défaut)* | `:107-118` | aucun libellé `Facility prestige` / `Research prestige` / `Buildings` / `Area` dans la page **ni dans `eNewTycon.lng`** | Les 4 branches mortes du `switch` supprimées — voir §3 pour la décision |
| **champ 1** | `:124-127` `levelTiers` | `TycoonCurriculum.asp:235` rend `images/levelLegendX.gif` si `CurrLevel > 5` | `legendx: 6` ajouté ; un tycoon Legend+ retombait en tier 0 |
| **B-11** | `:71-72` | `RenderTycoon.asp:58` : `src="/fivedata/userinfo/…"` — **absolu depuis la racine** | Concaténé au répertoire de page → `…/new%20directory//fivedata/…`, 404 systématique. Résolu contre l'hôte |
| **B-20** | `:183` `fortune` | `TycoonCurriculum.asp:17-23` `FormatCurrency(v,0,0,0,-1)` → 4ᵉ argument `0` = pas de parenthèses → `-$1,234` | Ancrage sur `$` : le `-` était avalé. Helper `parseAspMoney` (accepte `-$1,234` **et** `($1,234)`) |
| **champ 10** | `:185` `averageProfit` | `:138` `<%= FormatValue(...) %>/h` | Le `/h` reste (c'est ce qu'affiche Voyager) mais le signe est conservé |
| **champ 11** | `:191` | `:218` + `:242-244` ; branches `:245`, `:250`, `:262` | Le `\s*(?:<div\|$)` obligatoire faisait backtracker vers un `<div class=label>` plus loin → **description du niveau suivant remontée comme celle du niveau courant**. Contrainte retirée |
| **B-9** | `:232` `canUpgrade` | `:91` `function onAdvanceClick()` déclarée **inconditionnellement** dans le `<head>` ; la vraie condition est `:250-260` | `/onAdvanceClick/` était **toujours vrai**. On teste maintenant la présence de l'`<input type="checkbox" … onClick="onAdvanceClick()">` de `:257`, rendu exactement sous `FullAccess and NextLevelName <> "" and Demo <> 1` |
| **B-16** | `:373-378` | `TycoonBankAccount.asp:551-566` ; ids `r<i>Bank…Slice`, ceux-là même qu'utilise `onRowClick()` (`:260-265`) | Découpage positionnel avec `if (val) push` : une `LoanBankName` vide décalait les 6 champs d'une colonne, en silence. Lecture par id, cellule par cellule (`<td …>…</td>`, pas de saut de balises entre cellules) |
| **B-17** | `:394-396` | `:573-581` — la page **publie** `FormatValue(TotalPayment)` | `totalNextPayment` lu au serveur ; la somme reste le repli quand `LoanCount = 0` (`:525`) |
| **B-17** | `:402-403` | `computeLoanInfo:227-232` — `if (term < 5) term = 5` **puis** `Math.round` | On arrondissait avant de borner : 1 an d'écart sur les fractions `.5`. Ordre rétabli |
| **B-1 / A-11** | `:502-524` `executeBankAction` | `:111` `payoff_error` calculé et **jamais rendu** (aucun `select case`, contrairement à `:330` et `:403`) ; `:95` + `:320` mot de passe faux = page normale sans marqueur | Le verdict est un **changement d'état** : instantané avant l'action (`fetchBankAccount`), re-parse de la réponse (qui EST la page re-rendue après `InitCacheObject`, `:102/:107/:112`), comparaison. borrow = solde ou dette bougés ; send = solde bougé ; payoff = **une ligne de prêt en moins**. Une réponse sans `var budget` (`:163`, émis inconditionnellement) n'est pas cette page → refus |
| **B-7** | `:563` | `TycoonProfitAndLoses.asp:16-22` + `:135-136` (la page colore ces lignes en `#ff7700` parce qu'elles sont négatives) | `\$([0-9,.-]+)` : **tous les postes en perte remontaient positifs**. `parseAspMoney` |
| **nouveau** | `:563` | `:94-105` / `:206-224` vs `:119` | Les lignes de **flush** de niveau 2 (`<div class=labelAccountLevel2 style="color: …">`) étaient parsées comme des comptes dont le libellé était leur propre montant. Discriminant : `style="margin-left:` (`:119`) |
| **nouveau** | `:582` `isHeader` | `:99` / `:216` `FormatValue(PrevValue)` | Le total d'un poste de niveau 2 **est publié** par la ligne de flush et était jeté (le nœud affichait `$0`). Il est rattaché à son en-tête ; `isHeader` devient `level === 2` (`:121-124` rend tout niveau 2 en en-tête majuscule) |
| **champ 37** | `:574` | `:151-153`, un `<tr>` par compte (`:109-195`) | Fenêtre de 500 caractères **vers l'avant** → le graphique de la ligne suivante était attribué à la précédente. Recherche bornée au `</tr>` de la ligne |
| **B-13** | `:691` | `chooseCompany.asp:193-197` : le `<nobr>` contient `strPrivate` **ou le rôle complet** | `(Mayor\|Minister\|…)\s*</nobr>` échouait sur « Mayor of Rome » et retombait sur `'Private'` — inversion sémantique. Lecture du 1ᵉʳ `<nobr>` de `<div class=data>` |

### 1.2 `auto-connection-handler.ts`

| Réf | Site | Citation ASP | Avant → après |
|---|---|---|---|
| **B-14** | `:100-101` | `TycoonAutoConnections.asp:89-91` : `id` = identifiant interne, corps du `<div>` = `Obj.Properties("AutoConnection<Fluid>Name<LangId>")` | Le nom localisé était capturé **puis jeté** : l'utilisateur lisait `PGIPlastics`. `fluidName` = nom affiché, `fluidId` = id |
| **champ 52** | `:96-97` | `:103-104` — l'`<input …HireWH>` n'existe **que** sous `Storable` | Absence = `false`, indistinguable de « stockable mais décoché ». Nouveau champ `storable` (voir §5 pour la moitié cliente) |
| **B-3** | `:181` | `AddDefaultSupplier.asp` **inexistant** ; le vrai flux est `TycoonAutoConnections.asp?Connect=YES&Fluid=&Suppliers=` (`:18-33`) | 404 systématique — la fonction n'a jamais marché. Cible corrigée, avec les paramètres qu'exige `FullAccess` (`:16`). Oracle : la réponse **est** la page re-rendue (`InitCacheObject`, `:29`), le fournisseur y figure ou l'ajout n'a pas eu lieu |
| **§5** | `:233-239` | `DeleteDefaultSupplier.asp:13-21`, `ModifyTradeCenterStatus.asp:26-43`, `ModifyWarehouseStatus.asp:25-42` | Seul `resp.ok` était lu, or ces pages répondent **200 en texte brut** : `OK.` au succès, `Security Failed.` / `ERROR: Couldn't bind to Tycoon` / `Operation Failed` à l'échec. Oracle de corps `readActionOutcome()` ; **un mot de passe faux rapportait succès** |
| **champ 54** | `:285` | `:78-81` (`labelspan<i>`) vs `:91-99` (l'option `value="0"` **commentée** quand `AlliesPageOn` est faux) | Lecture du `labelspan<i>` d'abord, option `selected` en repli — voir §4, l'ASP contredit l'audit |
| **champ 55** | `:289` | `:311` | `id=otherspan1[^>]*>` accrochait aussi `otherspan10`. Frontière `(?![0-9])` + appariement par l'attribut `index="<%= i %>"` de `:87` |
| **§5** | `:299` | cohérence avec les deux autres parseurs | `extractAllActionUrls` tournait même avec un `baseUrl` vide, ce qui met en cache des URL relatives non résolues. Gardé par `if (baseUrl)` |
| **§5** | `:362-366` `setPolicyStatus` | `:27`, `:38` `call RDOSetPolicyStatus` — résultat **jamais capturé** ; `:243` la cible du POST est la page elle-même ; `:49-50` cache relu après le bloc modify | La page ne publie **rien**. Le corps de la réponse est la table à jour : on y relit le statut demandé. C'est gratuit — aucune requête supplémentaire |
| **B-2** | `:434` | `abandonRole.asp` = **page de confirmation** (`:71-137`, « WARNING! Are you sure… ») ; l'action est `rdoAbandonRole.asp` + paramètre **`RN`** = `Obj.RealName` (`:15`, `:47`) | `{ success: true }` sur une page de confirmation : **le rôle n'était jamais abandonné**. Deux temps, exactement comme le client de référence : on récupère la page, on en extrait l'URL `rdoAbandonRole.asp` (seule source de `RN`), on l'appelle. Oracle d'état : `TycoonCurriculum.asp:175-211` rend `command="abandon"` tant que `SuperRole <> 0`, `command="reset"` après |
| **§5** | `:479` `resetAccount` | `rdoResetTycoon.asp:18` redirige vers `TycoonCurriculum.asp` (suivie par `redirect: 'follow'`) | Oracle partiel : le corps est la page curriculum, on y détecte `StrTycoonCurriculum_14` (`:417-420`). Un refus reste `[UNKNOWN]` — `res` (`:13`) est affecté puis jeté |
| **B-6** | `:463` `rebuildLinks` | `util/links.asp` introuvable dans les 2 774 `.asp` | **Laissé en place** et marqué `[UNKNOWN]` : ce root est un instantané. Le 404 sort proprement via `!resp.ok`, vérifié par un test |

---

## 2. Fixtures re-dérivées

24 fixtures instanciées **depuis l'ASP** (tabulations, attributs non quotés, coquilles de la source
comprises — `<td id="r0Bank"class=value` sans espace `:551`, `break;7` d'`abandonRole.asp:51`),
regroupées en constructeurs paramétrés : `curriculumPage()`, `bankPage()`, `plRow()`/`plFlush()`,
`companyCell()`, `autoConnectionsPage()`, `policyPage()`, `abandonRolePage()`, plus les huit corps
texte des pages d'action.

**Branches jamais testées avant, atteintes par ces fixtures — 9 :**

| Branche | Fixture | Ce qu'elle a révélé |
|---|---|---|
| `FullAccess = false` (banque) | `bankPage({fullAccess:false})` | Le tableau des prêts est rendu **hors** du garde `:320` — seul le panneau emprunt/envoi disparaît. C'est ce qui rend l'oracle payoff utilisable même sans mot de passe valide |
| `FullAccess = false` (curriculum) | `curriculumPage({fullAccess:false})` | Ni bouton reset ni bouton abandon → l'oracle d'`abandonRole` doit distinguer « rôle encore tenu » de « rien de vérifiable » |
| `SuperRole <> 0` (maire) | `curriculumPage({superRole:1})` | **Aucune image de niveau** sur la page : `levelName = ''`, tier 0. Confirme le champ 8 de l'audit |
| `CurrLevel > 5` | `curriculumPage({currLevel:6})` | `levelLegendX.gif` — a fait apparaître le trou du mapping (champ 1) |
| Banque de prêt vide | `bankPage({loans:[{bank:''}]})` | Le décalage B-16, reproduit puis corrigé |
| `FormatValue` négatif | fortune, P&L, average profit | B-7 et B-20, dans les deux rendus possibles |
| Total de niveau 2 flushé | `plFlush()` | **Deux défauts que l'audit n'avait pas vus** : la ligne de flush parsée comme un compte, et son montant jeté |
| `Storable = false` | `autoConnectionsPage([SERVICES])` | Le champ 52 |
| `AlliesPage = false` | `policyPage({alliesPage:false})` | L'option `value="0"` **et son `selected`** rendus dans un commentaire HTML |

À quoi s'ajoutent les quatre sorties de chaque page d'action (`OK.`, bind raté, connexion ratée,
sécurité ratée), jamais exercées : c'est là que se cachait le « mot de passe faux = succès ».

---

## 3. Décision — les 4 champs curriculum inexistants

`facPrestige`, `researchPrestige`, `area`, `facCount`/`facMax` (clé `buildings`).

**Décision : les branches du `switch` sont supprimées, les champs du modèle sont conservés.**

Justification, dans cet ordre :

1. **La page ne les porte pas.** Ni `TycoonCurriculum.asp` ni `eNewTycon.lng` ne contiennent ces
   libellés — vérifié par grep, et le test
   `'the page carries no Buildings / Area / Facility prestige / Research prestige label at all'`
   l'assied sur la fixture. Réparer la regex ne les remplira jamais : c'est une correction du
   **modèle de données**, pas du parsing, exactement comme l'annonçait l'audit.
2. **Deux d'entre eux ont une autre source, qui marche.** `facCount`/`facMax` sont alimentés par les
   pushes RDO (`ctx.lastBuildingCount`, `ctx.lastMaxBuildings`) et étaient déjà justes ; la branche
   `buildings` ne pouvait que les écraser. La supprimer **protège** une donnée correcte.
3. **Trois n'ont aucune source dans le transport C.** `facPrestige`, `researchPrestige`, `area`
   restent à 0. Les retirer du type casserait le contrat WS et le client pour un gain nul ; les
   laisser optionnels ne dirait rien de plus que 0. Ils sont conservés **et documentés** dans le
   JSDoc de `parseCurriculumHtml` comme sans source transport C.
4. **Le code mort disparaît quand même.** Quatre branches inatteignables en moins, sans
   `istanbul ignore`, et la couverture du fichier passe à 100 % lignes/fonctions sans artifice.

Reste ouvert pour le développeur : si ces trois champs doivent réellement s'afficher, leur source
est le socket RDO (propriétés `TTycoon`), pas le web — donc une sonde live, pas une page ASP.

---

## 4. Où l'ASP contredit l'audit 7A

C'est la page qui a raison ; ces trois points doivent être corrigés dans
`audit-transport-c-asp.md` avant 7B-2.

| Entrée d'audit | Ce que dit la page |
|---|---|
| **B-17** — « `defaultInterest`/`defaultTerm` recalculés alors que le serveur les publie (`:354-355`) ; nous ré-implémentons `:226` au lieu de lire » | **Le client de référence recalcule aussi.** `onLoad()` (`:246-251`) appelle `computeLoanInfo(round(Obj.IFELLoanEstimated))` dès que `FullAccess`, et cette fonction **écrase** les spans `#interest`/`#term` du serveur (`:231-232`). Ce que voit le joueur est donc la valeur calculée. Le vrai défaut n'est pas « on recalcule » mais **l'ordre** : l'ASP borne puis arrondit (`:227-232`), nous faisions l'inverse. Corrigé comme tel. En revanche `totalNextPayment` (`:579-581`), lui, **est** publié et n'est jamais recalculé côté client : corrigé en lecture |
| **Champ 54** — « le résultat reste juste par accident d'ordre » | Plus grave que ça. `RenderStatus` fait `select case status` avec `case 0 :` (**numérique**, `:68`) tandis que les options comparent `if status = "0"` (**chaîne**, `:92`). En VBScript une comparaison numérique/chaîne n'est jamais vraie : **exactement un des deux mécanismes est rendu**, selon le type que renvoie `Obj.PolTo(i)` — et lequel est `[INFERRED]`. Le parseur lit désormais les deux (span d'abord, option en repli). À trancher par une capture live |
| **Champ 38 / §2.5** — « `isHeader` MATCHE » | Le parsing était juste, la **sémantique** ne l'était pas : le montant d'un poste de niveau 2 est publié par la ligne de flush (`:99`, `:216`) et était jeté ; le nœud affichait `$0`. Et les lignes de flush elles-mêmes étaient parsées comme des comptes. À ajouter à la table §2.5 |

---

## 5. Non fait, et ce qu'il faudrait pour trancher

| Point | Statut | Ce qu'il faut |
|---|---|---|
| `util/links.asp` | **`[UNKNOWN]`** — l'appel est conservé, l'échec est propre | Une capture live d'un serveur exploité, ou la confirmation du développeur que le bouton est mort. Ne pas conclure depuis cet instantané |
| Refus de `rdoResetTycoon` | **`[UNKNOWN]`** par construction | La page affecte `res` (`:13`) puis le jette. Aucun oracle possible côté web ; il faudrait la déclaration Pascal de `RDOResetTycoonEx` et une sonde live |
| Fraîcheur du cache COM après mutation | **`[INFERRED]`** | Tous les oracles d'état supposent que le `InitCacheObject` d'après mutation (`TycoonBankAccount.asp:102/107/112`, `TycoonAutoConnections.asp:29`, `TycoonPolicy.asp:49-50`) relit bien l'état neuf. L'intention de l'auteur est explicite — sinon ces appels ne serviraient à rien — mais `CacheObject.inc:16-25` ne force pas `Recache`. **Une capture live d'un aller-retour mutation → relecture le confirmerait.** En attendant, le risque est un faux **négatif** (« non appliqué » alors que ça a marché), jamais un faux positif sur de l'argent |
| Format de `FormatCurrency` négatif | `[INFERRED]`, non bloquant | `parseAspMoney` accepte `-$1,234` **et** `($1,234)`. Une capture live d'un P&L en perte fixerait la forme réelle |
| Champ 52, moitié cliente | **Hors périmètre** | Le serveur publie maintenant `storable`. Il reste à conditionner la bascule « Auto-include only warehouses » de `ProfilePanel.tsx:653-660` à ce drapeau — 1 ligne, mais dans `src/client/`, hors des deux handlers de cette session |
| `state` rafraîchi renvoyé à l'UI | **Déjà câblé, rien à faire** | Vérification faite : `client-bridge.ts:694-717` appelle `profile.incrementRefresh()` sur succès pour les quatre actions. Le joueur voit donc bien la liste rafraîchie, sans message de confirmation — le comportement Voyager retenu. Ce qui manquait n'était pas le retour visuel mais un **verdict de succès véridique** ; c'est ce que corrige cette session |

---

## 6. Ce que 7B-2 doit reprendre

- Les trois corrections d'audit du §4 ci-dessus.
- `politics-handler` : B-4 (`tycoonsratings.asp` → `tycoonratings.asp` **et** balisage
  `<td class=label OnMouseOver=…>` incompatible), B-5 (`parseCampaignResponse`, faux dans les deux
  sens), B-18 (désynchronisation sur une valeur vide).
- `building-templates-handler` : B-10 (`displayName` = `"PGI&Folder="`), B-12
  (`buildTime` contient une surface), B-15 (`facilityClass` deviné pour l'indisponible), B-19
  (description = prérequis).
- Le helper `parseAspMoney` de `profile-finance-handler.ts:32-46` est réutilisable tel quel :
  `FormatValue` est identique sur toutes ces pages.
- Le patron d'oracle de cette session — **instantané avant / re-parse de la réponse / comparaison** —
  s'applique tel quel à `tycooncampaign.asp`, où l'annulation réussie est aujourd'hui rapportée
  en échec.

---

## 7. Compétences utilisées

- **Lecture directe** (Read / Grep / Glob / Bash) sur `IIS_ROOT` — aucun sous-agent, conformément à
  la consigne de session.
- **`CLAUDE.md` racine** + **`src/server/CLAUDE.md`** (mémoire de répertoire) — hiérarchie de preuve,
  fichiers protégés, convention de co-localisation des tests.
- **`spo-testing`** — fixtures dérivées et non écrites à la main, ratchet de couverture, budget
  `istanbul ignore`.
- **`code-guardian`** (auto-chargée sur toute écriture dans `src/`) — pas d'`any`, `unknown` en catch,
  pas d'élément d'UI sans action câblée (§E) : c'est ce qui a fait sortir la moitié cliente du
  champ `storable` en point ouvert plutôt qu'en dette silencieuse.
- **`rdo-conformity` : NON invoquée.** Aucun octet RDO n'est écrit ni modifié ici — le transport C
  passe par le proxy COM du serveur ASP, pas par notre socket. Sa règle centrale (vérifier la
  déclaration Pascal avant de conclure) est en revanche **appliquée** au §5 pour refuser de
  conclure quoi que ce soit sur `RDOResetTycoonEx` depuis l'ASP seul.

**Aucun commit, aucun push. `IIS_ROOT` non touché.**
