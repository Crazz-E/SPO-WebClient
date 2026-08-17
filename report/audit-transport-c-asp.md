# Audit transport C — confrontation des parseurs à la source ASP réelle

**Session 7A — audit seul, aucune écriture dans `src/`.**
Date : 2026-08-17 · Source : `C:\Users\Robin Aleman\Documents\SPO\IIS_ROOT` (lecture seule)
Branche : `fix/rdo-pool-lifecycle-timeouts-probe`

---

## 0. Cadre de preuve — règle appliquée et consignée

L'ASP est du **source**, pas une capture. Il se range **avec** le source Delphi, donc **sous** les
captures live. Ordre retenu et appliqué dans tout ce document :

```
capture live  >  source ASP  ≈  source Delphi  >  [INFERRED]
```

Toute forme établie ici depuis un `.asp` est marquée **« établie par source ASP »**, jamais
« prouvée ». Une page rendue capturée l'emporte : les `#include` et la langue active peuvent
changer le rendu.

**Résolution de la langue — établie.** `Five/0/Includes/language.inc:1-3` contient exactement
`LangId = 0`. Le segment d'URL `0` que notre code construit **est** l'identifiant de langue, et
`Five/0` est l'anglais. Les libellés cités ci-dessous viennent de `Five/0/language/eNewTycon.lng`
et `Five/0/language/ePolitics.lng`, résolus include par include. Les six arbres `Five/0` à `Five/5`
sont des copies par langue ; notre passerelle n'interroge que `Five/0`.

**Includes suivis.** `language.inc`, `Protocol.inc` (codes `ERROR_*`), `CacheObject.inc`,
`CacheObjectEx.inc`, `eNewTycon.lng`, `ePolitics.lng`, `NewLogon.lng`, `Voyager.lng`.
Non résolus : `URLUtils.inc`, `FrameButtons.js`, `GenericCacheObject.inc` — ils ne portent que du
comportement client (fonctions JS), aucun balisage lu par nos parseurs. Aucun impact sur les verdicts.

**Fait structurant, valable pour tout le rapport.**

> `grep -rn "Response.Status"` sur les **298 pages `.asp` de `Five/0/Visual/Voyager`** → **0 occurrence.**
> `grep -rln "On Error"` → **0 fichier.**
> Trois `Response.Redirect` seulement (`rdoResetTycoon.asp:18`, `chooseCompany.asp:40, :42`).

Le serveur ASP **ne produit jamais de code HTTP d'erreur applicatif**. Tout refus métier, tout
échec de bind RDO, toute authentification ratée sort en **HTTP 200** avec un corps différent.
Le correctif **A-9** (`if (!resp.ok)`) ne couvre donc que l'erreur d'infrastructure — voir §5.

---

## 1. Périmètre — dérivé du code, pas supposé

`grep -rhoiE "[A-Za-z0-9_/.-]+\.asp" src/server --include=*.ts` (hors `*.test.ts`), puis
localisation de chaque page dans `IIS_ROOT`. Douze fichiers de `src/server` référencent des `.asp`.

| Page ASP appelée par notre code | Existe dans `IIS_ROOT` ? | Appelant |
|---|---|---|
| `NewTycoon/TycoonCurriculum.asp` | ✅ | `profile-finance-handler.ts:54, :156` |
| `NewTycoon/TycoonBankAccount.asp` | ✅ | `profile-finance-handler.ts:314, :494` |
| `NewTycoon/TycoonProfitAndLoses.asp` | ✅ | `profile-finance-handler.ts:539` |
| `NewLogon/chooseCompany.asp` | ✅ | `profile-finance-handler.ts:633` |
| `New Directory/RenderTycoon.asp` | ✅ **localisée** | `profile-finance-handler.ts:65` |
| `NewTycoon/TycoonAutoConnections.asp` | ✅ | `auto-connection-handler.ts:30` |
| `NewTycoon/TycoonPolicy.asp` | ✅ | `auto-connection-handler.ts:254, :341` |
| `NewTycoon/DeleteDefaultSupplier.asp` | ✅ | `auto-connection-handler.ts:193` |
| `NewTycoon/ModifyTradeCenterStatus.asp` | ✅ | `auto-connection-handler.ts:208` |
| `NewTycoon/ModifyWarehouseStatus.asp` | ✅ | `auto-connection-handler.ts:223` |
| `NewTycoon/rdoResetTycoon.asp` | ✅ | `auto-connection-handler.ts:422` |
| `NewTycoon/abandonRole.asp` | ✅ *(mais ce n'est pas une action — §3 B-2)* | `auto-connection-handler.ts:434` |
| `NewTycoon/rdoSetAdvanceLevel.asp` | ✅ | `auto-connection-handler.ts:447` |
| **`NewTycoon/AddDefaultSupplier.asp`** | ❌ **INTROUVABLE** | `auto-connection-handler.ts:181` |
| **`util/links.asp`** | ❌ **INTROUVABLE** | `auto-connection-handler.ts:463` |
| `Politics/popularratings.asp` | ✅ | `politics-handler.ts:239` |
| `Politics/ifelratings.asp` | ✅ | `politics-handler.ts:246` |
| **`Politics/tycoonsratings.asp`** | ❌ **le fichier réel est `tycoonratings.asp`** | `politics-handler.ts:255` |
| `Politics/tycooncampaign.asp` | ✅ | `politics-handler.ts:355, :386` |
| `Build/KindList.asp` | ✅ | `building-templates-handler.ts:202` |
| `Build/FacilityList.asp` | ✅ | `building-templates-handler.ts:312` |
| `NewLogon/info.asp` | ✅ | `building-templates-handler.ts:36` |
| `NewLogon/facilityList.asp` | ✅ | `building-templates-handler.ts:106` |
| `Mail/MessageList.asp` | ✅ | `mail-handler.ts:458` |
| `New Directory/DirectoryMain.asp`, `Towns.asp`, `foundtycoons.asp`, `Rankings.asp`, `Banks.asp` | ✅ (dans `New Directory`) | `search-menu-service.ts` — **hors périmètre 7A**, non audité |

**Les trois « introuvables » annoncés par le prompt, tranchés :**

- **`RenderTycoon.asp` existe** — `Five/0/Visual/Voyager/New Directory/RenderTycoon.asp` (et dans
  `Directory/`). Notre URL `.../new%20directory/RenderTycoon.asp` est **la bonne**. Le prompt se
  trompait ; la page a raison.
- **`tycoonsratings.asp` n'existe pas.** Le fichier réel est `Politics/tycoonratings.asp` — *tycoon*
  au singulier. Bug confirmé (§3 B-4).
- **`links.asp` n'existe nulle part** dans les 2 774 `.asp` (`find . -iname "links.asp"` → vide).
  Il n'existe pas non plus de répertoire `util` ni `Other` sous `Visual/Voyager`. Bug confirmé (§3 B-6).

**Remarque sur `RIWS`.** Nous envoyons `RIWS=''` sur les pages `NewTycoon/*`. Aucune de ces pages ne
lit `Request("RIWS")` : le paramètre y est **inerte**. Il est réellement lu par les pages
`New Directory/*` et `Visual/News/*`. `TycoonProfitAndLoses.asp:100, :149, :217` lit
`Request("RunningInTheWebSite")` — nom complet, pas l'abréviation. Comme nous ne l'envoyons pas, les
liens `ChartInfo` **sont** émis, ce qui est ce que notre parseur veut. Aucune action requise ;
consigné pour éviter qu'on « corrige » `RIWS` en `RunningInTheWebSite` et casse les graphiques.

---

## 2. Table par page — verdict par champ

**94 champs audités · 54 MATCHE · 18 NE MATCHE PAS · 22 FRAGILE.**

Convention : **MATCHE** = la regex accroche le balisage réel · **NE MATCHE PAS** = bug de production
· **FRAGILE** = matche aujourd'hui, casse au premier changement de balisage, de valeur ou de branche
conditionnelle.

### 2.1 `NewTycoon/TycoonCurriculum.asp` → `parseCurriculumHtml` (`profile-finance-handler.ts:92`)

Balisage réel, invariant sur toute la page :

```html
<div class=label style="margin-left: 20px; margin-top: 20px">
    Personal Fortune:
    <span class=value>
        $1,234,567
    </span>
</div>
```

Le libellé **précède** le `<span class=value>` et vit dans le **même** `<div class=label>`.
La regex `kvPattern` (`:100`) exige, après le libellé et son `:`, un `</span>` ou `</div>` fermant
avant d'atteindre `class=value`. Il n'y en a aucun. **Aucune paire clé/valeur n'est jamais extraite.**

> Précision par rapport à `couverture-rdo-100.md` §3, qui écrit « la regex exige `class=value` non
> précédé de `<tag` ». La cause exacte est le **`</(?:span|div)>` obligatoire** après le libellé,
> pas le `(?:<[^>]*>\s*)*?` qui suit. La conséquence est identique.

| # | Champ | Verdict | Citation ASP |
|---|---|---|---|
| 1 | `levelName` | FRAGILE | `TycoonCurriculum.asp:229` `images/level<%= Obj.LevelName(0) %>.gif`. Accroche. Mais `:235` rend `images/levelLegendX.gif` si `CurrLevel > 5` → `levelName = "LegendX"`, absent du mapping `levelTiers` (`:124-127`) → `levelTier` retombe à 0 |
| 2 | `prestige` | **NE MATCHE PAS** | `:142-147`. Double défaut : la regex n'accroche pas **et** le libellé est `strTotalPrestige = "Total Prestige"` (`eNewTycon.lng:124`), tandis que le `switch` (`:106`) attend la clé `prestige`. Corriger la regex seule ne suffira pas |
| 3 | `facPrestige` | **NE MATCHE PAS** | **Le champ n'existe pas sur la page.** Aucun libellé « Facility prestige » dans `TycoonCurriculum.asp` ni dans `eNewTycon.lng` |
| 4 | `researchPrestige` | **NE MATCHE PAS** | Idem — champ absent de la page |
| 5 | `facCount` / `facMax` (clé `buildings`) | **NE MATCHE PAS** | Idem — aucun libellé « Buildings » sur la page |
| 6 | `area` | **NE MATCHE PAS** | Idem — aucun libellé « Area » sur la page |
| 7 | `nobPoints` | **NE MATCHE PAS** | `:153-160`, libellé `strNobPoints = "Nobility"` (`eNewTycon.lng:125`). C'est **le seul des cinq** dont la clé correspondrait au `switch` (`:119`) si la regex était réparée |
| 8 | `levelTier` / `licenceLevel` | FRAGILE | Dérivés de 1. Le bloc niveau entier est sous `if (Obj.SuperRole = 0)` (`:215`) : pour un maire/ministre/président, **aucune image de niveau n'est rendue** → `levelName = ''`, `levelTier = 0` |

### 2.2 `NewTycoon/TycoonCurriculum.asp` → `parseCurriculumDetails` (`:172`)

| # | Champ | Verdict | Citation ASP |
|---|---|---|---|
| 9 | `fortune` | FRAGILE | `:128-133` + `strPersonalFortune = "Personal Fortune"` (`eNewTycon.lng:122`). La regex `:183` accroche `Personal\s+Fortune:` puis `(?:<[^>]*>\s*)*\$`. **Mais `FormatValue` (`:17-23`) appelle `FormatCurrency(v,0,0,0,-1)` — 4ᵉ argument `0` = pas de parenthèses → un solde négatif rend `-$1,234`.** Le `-` précède le `$`, la regex exige `$` juste après les balises → **fortune négative jamais lue**, on garde `profile.budget` |
| 10 | `averageProfit` | FRAGILE | `:135-140`, `strAverageProfit = "Average Profit (this year)"` (`:123`). Le `[^:]*` absorbe ` (this year)` ✅. Mais `:138` rend `<%= FormatValue(...) %>/h` : la capture `([^<]+)` remonte `1,234/h`, donc `averageProfit = "$1,234/h"` — le suffixe `/h` est embarqué dans la valeur |
| 11 | `currentLevelDescription` | FRAGILE | `:218` `<td valign="top" align="left" width=190>` puis `:242-244` `<div class=label>`. Le motif `:191` exige `\s*(?:<div\|$)` après le `</div>` fermant : si `FullAccess=false`, pas de niveau suivant et pas de `LevelReqStatus`, le prochain jeton est `</td>` → le moteur backtracke vers un `<div class=label>` plus loin et remonte **la mauvaise description** |
| 12 | `nextLevelName` | MATCHE | `:222` et `:282-284`. Exactement deux `<div class=header1>` sur la page ; le second est `Obj.NextLevelName(LangId)` |
| 13 | `nextLevelDescription` | MATCHE | `:304-306`, ancré sur `StrTycoonCurriculum_9 = "Next Level"` (`eNewTycon.lng:77`). Les `<td class=label>` de `:231, :237` ne sont pas des `<div>` et n'interfèrent pas |
| 14 | `nextLevelRequirements` | MATCHE | `:307-312`, ancré sur `StrTycoonCurriculum_10 = "Requires"` (`:78`), rendu `Requires:` |
| 15 | `canUpgrade` | **NE MATCHE PAS** | `:91` — `function onAdvanceClick()` est déclarée **inconditionnellement dans le `<script>` du `<head>`**. Le test `/onAdvanceClick/i` (`:232`) est donc **toujours vrai**. La vraie condition est `FullAccess and (Obj.NextLevelName(LangId) <> "") and Demo <> 1` (`:250-260`). **Le bouton « monter de niveau » est proposé à des joueurs qui ne peuvent pas monter** |
| 16 | `isUpgradeRequested` | MATCHE | `:257` `<input type="checkbox" <% if Obj.AdvanceToNextLevel then %>checked<% end if%> onClick=...>` |
| 17 | `rankings[]` | MATCHE | `:321` (`StrTycoonCurriculum_11 = "in the rankings"`, `:79`), table `:323-344`, cellules `<td class=label>` / `<td align=right class=value>` `:328-337` |
| 18 | `curriculumItems[]` | MATCHE | `:369-371` (`strCurriculumItems = "Curriculum items"`, `:130`), lignes `<td class=value>` × 2 `:396-409` |

### 2.3 `New Directory/RenderTycoon.asp` → photo de profil (`profile-finance-handler.ts:60-78`)

| # | Champ | Verdict | Citation ASP |
|---|---|---|---|
| 19 | `photoUrl` | **NE MATCHE PAS** | `RenderTycoon.asp:58` : `<img id=picture src="/fivedata/userinfo/<WorldName>/<Tycoon>/largephoto.jpg" ...>`. La **regex accroche** (`:67`), mais la résolution d'URL (`:71-72`) est fausse : `rawUrl` commence par `/`, donc `startsWith('http')` est faux, et on concatène `baseUrl + '/' + rawUrl` → `http://ip/five/0/visual/voyager/new%20directory//fivedata/...` au lieu de `http://ip/fivedata/...`. **La photo est toujours un 404.** Une URL absolue depuis la racine doit se résoudre contre l'hôte, pas contre le répertoire. Note : `RenderTycoon.asp:46-47` fournit un repli `images/nopicture.jpg` côté client que nous ne reproduisons pas |

### 2.4 `NewTycoon/TycoonBankAccount.asp` → `parseBankAccountHtml` (`:331`)

| # | Champ | Verdict | Citation ASP |
|---|---|---|---|
| 20 | `balance` | MATCHE | `:163` `var budget = <%= round(Obj.Budget) %>;` |
| 21 | `maxLoan` | MATCHE | `:222` `var maxVal = new Number(<%= round(Obj.IFELLoanEstimated) %>);` — dans `computeLoanInfo`, toujours émis |
| 22 | `totalLoans` | MATCHE | `:223` `var loans = new Number(<%= round(Obj.LoanAmount) %>);` |
| 23 | `maxTransfer` | MATCHE | `:438` `Replace(strYouCanTransferX, "%1", FormatValue(TransferMoney))` + `strYouCanTransferX = "You can transfer up to %1"` (`eNewTycon.lng:145`). Rendu seulement si `FullAccess and SendingMoneyOn and TransferMoney > 0` (`:320, :424, :427`) — sinon `'0'`, ce qui est correct |
| 24 | lignes de prêt | MATCHE | `:550` `<tr id="r<%=i%>" lid="<%=i%>" onClick="onRowClick()">` |
| 25 | `loan.bank` | FRAGILE | `:551-553`. Le découpage cellule (`:373-378`) **ignore les cellules vides** (`if (val) cellValues.push(val)`) : si `Obj.LoanBankName(i)` est vide, tout le tableau se décale d'un cran et les six champs du prêt partent en vrille sans erreur |
| 26 | `loan.date` | FRAGILE | `:554-556` — même mécanisme de décalage |
| 27 | `loan.amount` | MATCHE | `:557-559` `FormatValue(Obj.LoanAmount(i))` |
| 28 | `loan.interest` | MATCHE | `:560-562` `<%= Obj.LoanInterest(i) %>%` |
| 29 | `loan.term` | MATCHE | `:563-565` `<%= Obj.LoanTerm(i) %> years` — `parseInt("23 years")` = 23 |
| 30 | `loan.slice` | MATCHE | `:566-570` `Payment = LoanSlice(i) + LoanInterest(i)*LoanAmount(i)/100` |
| 31 | `totalNextPayment` | FRAGILE | Recalculé par somme (`:394-396`) alors que **la page publie le total** en `:579-581` (`FormatValue(TotalPayment)`). Toute divergence d'arrondi nous éloigne de l'affichage de référence |
| 32 | `defaultInterest` | FRAGILE | Recalculé (`:401`) alors que **la valeur serveur est dans la page** : `:354` `<span id=interest class="value"><%= Obj.IFELoanInterest %>%</span>`. Nous ré-implémentons `:226` au lieu de lire |
| 33 | `defaultTerm` | FRAGILE | Idem, valeur serveur en `:355`. Et l'ordre diverge : l'ASP fait `Math.round(200 - x)` puis borne à 5 **avant** l'arrondi (`:227-232`) ; nous faisons `200 - Math.round(x)` puis bornons **après** (`:402-403`). Écart de 1 an sur les fractions `.5` |

### 2.5 `NewTycoon/TycoonProfitAndLoses.asp` → `parseProfitLossHtml` (`:553`)

| # | Champ | Verdict | Citation ASP |
|---|---|---|---|
| 34 | `level` | MATCHE | `:119` `<div class=labelAccountLevel<%= Obj.AccountLevel(i) %> ...>` |
| 35 | `label` | MATCHE | `:119-129`, `<nobr>` avec `Obj.AccountName(LangId, i)` |
| 36 | `amount` | **NE MATCHE PAS** | `:135-146` + `FormatValue` (`:16-22`) = `FormatCurrency(v,0,0,0,-1)`. **La regex `:563` capture `\$([0-9,.-]+)` : le signe négatif précède le `$` et est avalé par le `[\s\S]*?`.** Tous les postes en perte sont remontés **en positif**. Sur un compte de résultat, c'est le champ qui compte. La page les colore d'ailleurs en `#ff7700` précisément parce qu'ils sont négatifs (`:135-136`) |
| 37 | `chartData` | FRAGILE | `:101` et `:151-153`. Confirme le défaut déjà consigné (`couverture-rdo-100.md` §3, `:564`) : fenêtre de 500 caractères **vers l'avant** ; le balisage réel entre le montant et son `<a href=...ChartInfo=>` fait plus que cela pour les niveaux 2 (le lien de `:218` appartient à la ligne de flush précédente). Le **format** de `Obj.AccountHistory(i)` reste `[INFERRED]` : l'ASP ne le révèle pas |
| 38 | `isHeader` | MATCHE | `:158-163` — pour `AccountLevel = 2` la valeur n'est pas rendue (stockée dans `PrevValue`), le `<td>` ne contient qu'un `</nobr>` : l'alternance `(?:\$…\|</nobr>)` retombe bien sur la branche vide |

### 2.6 `NewLogon/chooseCompany.asp` → `parseCompaniesHtml` (`:658`)

| # | Champ | Verdict | Citation ASP |
|---|---|---|---|
| 39 | `companyId` | MATCHE | `:182` `companyId="<%= CompanyId %>"` |
| 40 | `name` | MATCHE | `:181` `companyName="<%= CompanyName %>"` |
| 41 | `ownerRole` | MATCHE | `:180` `companyOwnerRole="<%= CompanyOwnerRole %>"` |
| 42 | `cluster` | MATCHE | `:191` lien « more info » → `&CompanyCluster=<%= CompanyCluster%>` |
| 43 | `facilityCount` | MATCHE | `:198` `Replace(strNFacilities, "%1", CompanyFacCount)` + `strNFacilities = "%1 Facilities"` (`NewLogon.lng:9`) |
| 44 | `companyType` | **NE MATCHE PAS** | `:193-197`. Le `<nobr>` contient `strPrivate = "Private"` (`NewLogon.lng:7`) **ou le rôle propriétaire complet** (« Mayor of Rome », « Minister of Health »). La regex `:691` exige `(Mayor\|Minister\|…)\s*</nobr>` : sur « Mayor of Rome » elle échoue et **retombe sur le défaut `'Private'`**. Une compagnie publique/ministérielle est donc étiquetée « privée » — inversion sémantique |

Note d'entrée : `chooseCompany.asp:25-26` exige `ISAddr` et `ISPort` pour se lier à l'Interface
Server (`CInt(Request("ISPort"))` lèverait sur une chaîne vide). `spo_session.ts:928-929`
(`buildAspBaseParams`) les fournit — `ISAddr = ip du monde`, `ISPort = '8000'`. **Conforme.**

### 2.7 `NewTycoon/TycoonAutoConnections.asp` → `parseAutoConnectionsHtml` (`:46`)

| # | Champ | Verdict | Citation ASP |
|---|---|---|---|
| 45 | `fluidId` | MATCHE | `:89` `<div id="<%= FluidName%>" class=header3 style="color: #EEEECC">` |
| 46 | `fluidName` (affiché) | **NE MATCHE PAS** | `:90` — le **nom localisé** est `Obj.Properties("AutoConnection" & FluidName & "Name" & LangId)`, dans le corps du `<div>`. Notre parseur le capture (`headerMatch[2]`, `:50`) puis **le jette** : `:100-101` affecte l'`id` interne aux **deux** champs `fluidName` et `fluidId`. L'utilisateur voit l'identifiant technique, pas le nom du produit |
| 47 | lignes fournisseur | MATCHE | `:44` `<tr id=<Fluid><i> fluid=<Fluid> onClick="onRowClick()" facilityId="...">` — l'ordre `fluid` avant `facilityId` exigé par la regex `:70` est respecté |
| 48 | `facilityId` | MATCHE | `:44` |
| 49 | `facilityName` | MATCHE | `:46-48` `<div class=value>` |
| 50 | `companyName` | MATCHE | `:51-53` `<div class=value>` |
| 51 | `hireTradeCenter` | MATCHE | `:99` `<input id=<Fluid>HireTC type="checkbox" ... checked >` |
| 52 | `onlyWarehouses` | FRAGILE | `:103-104` — l'`<input …HireWH>` **n'est émis que si** `Obj.Properties(…"Storable")`. Absent ⇒ `false`, indistinguable de « stockable mais décoché ». Le client ne peut pas savoir qu'il ne doit pas proposer la bascule |

### 2.8 `NewTycoon/TycoonPolicy.asp` → `parsePolicyHtml` (`:271`)

| # | Champ | Verdict | Citation ASP |
|---|---|---|---|
| 53 | `tycoonName` | MATCHE | `:88` `tycoon="<%= TycoonName %>"` dans le `<select id=pol<i>`. Le second `<select name="Status">` (`:333`, `:448`) n'a pas d'attribut `tycoon` et n'est pas capté |
| 54 | `yourPolicy` | FRAGILE | `:92-98`. Quand `AlliesPage` est faux (`world.five/AlliesPageOn <> "1"`), **l'option `value="0"` est rendue à l'intérieur d'un commentaire HTML** (`:96`) avec son `selected` éventuel. Notre regex ignore les commentaires et lit la première option `selected` — le résultat reste juste par accident d'ordre, mais le parseur lit du balisage désactivé |
| 55 | `theirPolicy` | FRAGILE | `:64-74` (`RenderStatus`) + `:311`. Deux fragilités : (a) `RenderStatus` **n'émet rien** si `status = ""` (`:66`) → aucun `otherspan<i>`, on retombe silencieusement sur `'N'` (neutre) ; (b) la regex construite `id=otherspan1[^>]*>` accroche aussi `otherspan10` — inoffensif aujourd'hui parce que `exec` rend la première occurrence, mais c'est un couplage à l'ordre du document |

### 2.9 `Politics/popularratings.asp` et `Politics/ifelratings.asp` → `parsePoliticsRatings` (`politics-handler.ts:32`)

| # | Champ | Verdict | Citation ASP |
|---|---|---|---|
| 56 | `name` (popular) | MATCHE | `popularratings.asp:67-69` `<td class=label>` |
| 57 | `value` (popular) | FRAGILE | `:70-72` `<td class=value align="right"><%= CacheObj.PeopleRating %>%</td>`. La regex `:35` exige `([\d.]+)` : si `PeopleRating` rend vide ou négatif, la ligne ne matche pas et le `[\s\S]*?` **apparie le libellé N avec la valeur N+1** — décalage silencieux de tout le tableau |
| 58 | `name` (IFEL) | MATCHE | `ifelratings.asp:65-67` |
| 59 | `value` (IFEL) | FRAGILE | `:68-70` `<%= CacheObj.IFELRating %>%` — même mécanisme de désynchronisation |

Note : `getPoliticsData` n'envoie jamais `Capitol`/`x`/`y`. Les deux pages en tiennent compte
(`popularratings.asp:14-22`) : sans `Capitol=YES` elles lisent `Towns\<TownName>.five\Ratings\`,
ce qui est le chemin voulu pour un hôtel de ville. **Conforme pour l'usage actuel** ; le Capitole
(président) n'est pas atteignable par ce chemin.

### 2.10 `Politics/tycoonratings.asp` — appelée `tycoonsratings.asp`

| # | Champ | Verdict | Citation ASP |
|---|---|---|---|
| 60 | `name` | **NE MATCHE PAS** | **Double défaut.** (a) `politics-handler.ts:255` demande `tycoonsratings.asp` ; le fichier est `Politics/tycoonratings.asp` → **404**. (b) Même avec le bon nom : `tycoonratings.asp:136-141` rend `<td class=label OnMouseOver=… OnMouseOut=… onClick=…>` — la regex `:35` exige `<td\s+class=label>` avec le `>` **immédiat**. Elle n'accrochera jamais |
| 61 | `value` | **NE MATCHE PAS** | `:142-148` — la valeur n'est pas du texte dans le `<td>` mais `<div id=LabelDiv_X class=value><span id=Value_X>42%</span></div>`. La regex attend `<td class=value…>` suivi de chiffres. `tycoonsRatings` est **toujours `[]`** en production, et le `catch` (`:260`) n'attrape rien puisque le 404 renvoie un corps HTML |

### 2.11 `Politics/tycooncampaign.asp` → `parseCampaignResponse` (`politics-handler.ts:124`)

| # | Champ | Verdict | Citation ASP |
|---|---|---|---|
| 62 | `success` | **NE MATCHE PAS** | Voir §3 B-5 — l'oracle est **faux dans les deux sens** |
| 63 | `message` | **NE MATCHE PAS** | Idem |

`buildCampaignParams` (`:99-117`) en revanche **MATCHE exactement** les URL de référence
`tycooncampaign.asp:233, :339, :380` : `WorldName`, `TownName`, `TycoonName`, `Password`, `DAAddr`,
`DAPort`, `Launch`/`Cancel`, `x`, `y`, `Capitol`, `Recache=YES`. Aucun paramètre manquant ni superflu.

### 2.12 `NewLogon/info.asp` → `parseClusterInfo` (`building-templates-handler.ts:58`)

| # | Champ | Verdict | Citation ASP |
|---|---|---|---|
| 64 | `displayName` | **NE MATCHE PAS** | La regex `:60` `/cluster\s*=\s*["']?([^"'\s>]+)/i` vise `info.asp:95` `<table id="main" cluster="<%= ClusterName%>" ...>`. Mais **une occurrence plus précoce existe** : `info.asp:53` (et `:60`), dans le `<script>` du `<head>`, rend `"facilityList.asp?Cluster=PGI&Folder=" + td.folder`. Sans guillemet après `Cluster=`, la capture court jusqu'au `"` fermant → **`displayName = "PGI&Folder="`**. Chaîne visible dans l'UI |
| 65 | `description` | MATCHE | `:101-116` `<div class="sealExpln" style="padding: 20px">`. Réserve : le `select case` (`:103-114`) ne couvre que **cinq** clusters — `Dissidents`, `PGI`, `Moab`, `Mariko`, `Magna`. Pour `IFEL`, `UW`, `Generic`, `Common`, le `<div>` est **vide** ; ce n'est pas un bug du parseur, c'est la page |
| 66 | `categories[].name` | MATCHE | `:22` `<nobr><%=CacheClass.Name(LangId)%></nobr>` |
| 67 | `categories[].folder` | MATCHE | `:20` `folder="<%= FacItr.Current%>"`. Le bloc commenté `:133-162` ne porte pas d'attribut `folder` et n'interfère pas |

`info.asp` ne lit pas `WorldName` — les classes viennent d'un dossier global. Notre URL
(`:36`, `ClusterName` seul) est **conforme**.

### 2.13 `NewLogon/facilityList.asp` → `parseClusterFacilities` (`:135`)

| # | Champ | Verdict | Citation ASP |
|---|---|---|---|
| 68 | `name` | MATCHE | `:182-184` `<div class=comment style="font-size: 11px; …">` |
| 69 | `iconUrl` | MATCHE | `:188` `<img src=<%= GetBlockIcon(...) %> border="0"/>` → `/five/icons/<fichier>` (`:163-165`), attribut **non quoté**, la regex le gère |
| 70 | `zoneType` | MATCHE | `:194-224`, `<img src="images/zone-*.gif" … title="…">` |
| 71 | `cost` | FRAGILE | `:226` `<%=CacheClass.ImportPrice%>`. Le format de rendu (`$8,000K` ?) **n'est pas établissable depuis l'ASP** — c'est une propriété du cache COM. Reste `[INFERRED]`, capture live nécessaire |
| 72 | `buildTime` | **NE MATCHE PAS** | `:227` `<nobr><%=CacheClass.Size%></nobr>`. **La propriété est `Size` — une surface, pas une durée.** Preuve interne : le balisage identique de `Build/FacilityList.asp:248` est lu par `parseBuildingFacilities` (`:451-452`) dans le champ **`area`**. Les deux parseurs donnent deux sens opposés à la même expression ASP. Le champ `ClusterFacilityPreview.buildTime` porte en réalité la superficie |
| 73 | `description` | MATCHE | `:232-234` `<div class="description" …><%=Desc%><br><%=Requires%></div>` |

### 2.14 `Build/KindList.asp` → `parseBuildingCategories` (`:219`)

| # | Champ | Verdict | Citation ASP |
|---|---|---|---|
| 74 | `kind` | MATCHE | `KindList.asp:178` `ref="FacilityList.asp?…&Kind=<%=CacheClass.Id%>&…"` |
| 75 | `kindName` | FRAGILE | `:178` porte `KindName=<%=CacheClass.Name%>` (**non localisé**) tandis que `:185` affiche `<%=CacheClass.Name(LangId)%>` (**localisé**). Notre parseur lit le `<div class=link>` (`:244`), donc la forme localisée, et la renvoie ensuite en paramètre `KindName` à `FacilityList.asp`. Sur `Five/0` (anglais) les deux coïncident ; le jour où l'on interroge `Five/1..5`, la divergence apparaît. La forme de référence est celle du `ref` |
| 76 | `cluster` | MATCHE | `:178` `Cluster=<%=ClusterName%>` — dérivé **côté serveur** de la compagnie (`:14`), pas du paramètre. Notre envoi de `Cluster: ''` (`:198`) est **sans effet et sans danger** : la page ne lit jamais `Request("Cluster")` |
| 77 | `folder` | MATCHE | `:178` `Folder=<%= FacItr.Current%>` |
| 78 | `tycoonLevel` | MATCHE | `:178` `TycoonLevel=<%=TycoonLevel%>`, calculé serveur (`:31, :45-47`) |
| 79 | `iconPath` | MATCHE | `:181` `src="<%= GetKindIcon(CacheClass.Id, "") %>"` = `/Five/Visual/Clusters/<C>/images/FacKind_<Id>.jpg` |

Le défaut déjà consigné dans `couverture-rdo-100.md` §3 (« la regex `ref=(["']?)…\1` prétend accepter
un `ref` non quoté ») est **inoffensif ici** : `KindList.asp:178` quote systématiquement le `ref`.
Le code mort reste du code mort, mais aucune ligne réelle n'est jetée.

### 2.15 `Build/FacilityList.asp` → `parseBuildingFacilities` (`:329`)

| # | Champ | Verdict | Citation ASP |
|---|---|---|---|
| 80 | `name` | MATCHE | `FacilityList.asp:219-221` `<div id="LinkText_<i>" class=listItem available="1" style=… altid="<i>">` |
| 81 | `available` | MATCHE | `:219` — `available="1"` / `available="0"` selon `:208-215` |
| 82 | `iconPath` | MATCHE | `:229` `<img src=<%= GetBlockIcon(...) %>` (non quoté) |
| 83 | `facilityClass` | **NE MATCHE PAS** (cas indisponible) | `:300-307` — **l'attribut `info="…FacilityClass=…&VisualClassId=…"` n'est émis que sous `if Available then`.** Pour toute installation indisponible, aucun `FacilityClass` n'existe dans la page ; notre repli (`:404-409`) devine la classe depuis le **nom du fichier d'icône** (`Map…\.gif`), ce que le code lui-même signale comme « may differ from kernel class ». Le nom de classe exposé au client est donc faux pour les bâtiments verrouillés |
| 84 | `visualClassId` | FRAGILE | `:307` `VisualClassId=<%=CacheClass.TypicalVisualClass%>`. Le pré-scan (`:339`) est **nécessaire et correct** : le `cellRegex` (`:356`) s'arrête au premier `</tr>` (`:283`) alors que l'attribut `info` est en `:307`. Mais l'association passe par `facilityClass`, donc échoue exactement dans le cas 83 |
| 85 | `cost` | FRAGILE | `:246-249` `<div class=comment style="font-size: 9px; …"><%=CacheClass.ImportPrice%>`. Le format d'`ImportPrice` reste `[INFERRED]` |
| 86 | `area` | MATCHE | `:248` `<nobr><%=CacheClass.Size%></nobr>` — lecture **sémantiquement correcte** ici (cf. 72) |
| 87 | `description` | FRAGILE | `:288-294` — **deux** `<div class="description">` possibles : celui de `:288` (`Requires`, rendu **seulement si indisponible**) et celui de `:292` (`Desc`, `id=infoBlock_<i>`, `display: none`). La regex `:455` prend le premier : sur un bâtiment indisponible on remonte les **prérequis** au lieu de la description |
| 88 | `zoneRequirement` | MATCHE | `:251-281`, `<img src="images/zone-*.gif" … title="…">` |

### 2.16 `Mail/MessageList.asp` → `parseMessageListHtml` (`mail-list-parser.ts:27`)

| # | Champ | Verdict | Citation ASP |
|---|---|---|---|
| 89 | `messageId` | MATCHE | `MessageList.asp:198` `<tr id="row_<i>" onClick=… onDblClick=… msgId=<non quoté>>` |
| 90 | `personName` | MATCHE | `:208-218` premier `<span class=mailFolderItem>` |
| 91 | `subject` | MATCHE | `:220-228` second `<span class=mailFolderItem>`, tronqué à 100 caractères côté serveur (`:222-226`) |
| 92 | `dateFmt` | MATCHE | `:231` `<input id="msgDate<i>" … value="<%=Browser.Header("DateFmt")%>">` |
| 93 | `noReply` | MATCHE | `:205` `<input id="msgReply<i>" … value="<%=Browser.Header("NoReply")%>">` |
| 94 | `read` | FRAGILE | `:199-201` `<img src="images/UnreadMsg.gif">` sous `if Browser.Header("Read") <> "1"`. Notre heuristique (`:72-74`) teste trois motifs : **`mailFolderItemBold` n'est jamais émis** (branche morte), `newmail` non plus ; seul `/unread/i` accroche, via le nom de fichier `UnreadMsg.gif`. Correct aujourd'hui, par coïncidence de nommage |

`getMailFolder` envoie `Folder`, `WorldName`, `Account`, `MsgId=''`, `Action=''`.
`MessageList.asp:4-15` : `Folder` est passé à `UCase` côté serveur ✅, et le bloc `DELETE` est bien
inerte avec `Action=''` ✅. **Conforme.**

---

## 3. Bugs de production prouvés — classés par gravité

Chacun s'appuie sur une citation ASP. « Prouvé » ici = **établi par source ASP**, au sens du §0.

### Gravité 1 — perte ou corruption de données financières / mutations muettes

| Réf | Bug | Citation | Effet observable |
|---|---|---|---|
| **B-1** | **`executeBankAction('payoff')` ne peut jamais signaler un échec.** `TycoonBankAccount.asp:111` calcule `payoff_error = CommitPayOffTransaction(...)` — et **la variable n'est jamais rendue** : il n'existe aucun `select case payoff_error` dans la page, contrairement à `loan_error` (`:330-343`) et `send_error` (`:403-423`). | `TycoonBankAccount.asp:111` vs `:330`, `:403` | Un remboursement de prêt qui échoue (bind RDO raté, `LID` invalide) rend un 200 sans `class=errorText` → `profile-finance-handler.ts:524` renvoie `{ success: true, message: "payoff completed successfully" }`. **Le joueur croit avoir remboursé.** |
| **B-2** | **`abandonRole` ne fait rien.** `NewTycoon/abandonRole.asp` est une **page de confirmation** (« WARNING! Are you sure you want to renounce your present political duties? », `strDefaultDupplier_4`, `eNewTycon.lng:150`) avec deux boutons. L'action réelle est `rdoAbandonRole.asp`, qui exige en plus un paramètre **`RN`** (le `Obj.RealName` du tycoon, `abandonRole.asp:15`, `:41`). | `abandonRole.asp:37-48` (bouton `command="abandon"` → `rdoAbandonRole.asp?…&RN=<RealName>`) ; `rdoAbandonRole.asp:1-8` | `executeCurriculumAction('abandonRole')` récupère le HTML de confirmation, `resp.ok` est vrai, et renvoie `{ success: true, message: "abandonRole completed successfully" }`. **Le rôle n'est jamais abandonné.** Aggravant : `abandonRole.asp` **est** dans le cache d'URL (extrait de `TycoonCurriculum.asp:76` par `extractScriptNavigateUrls`), donc la branche « cache chaud » y va aussi. |
| **B-3** | **`executeAutoConnectionAction('add')` vise une page qui n'existe pas.** `AddDefaultSupplier.asp` est absent des 2 774 `.asp`. Le vrai chemin d'ajout est un **re-appel de `TycoonAutoConnections.asp` avec `Connect=YES&Fluid=<f>&Suppliers=<liste>`**, qui déclenche `RDOAddAutoConnection`. | `auto-connection-handler.ts:181` vs `TycoonAutoConnections.asp:18-33` et `:206` (bouton « hire » → cadre `FINDSUPPLIERS`, pas une page d'ajout) | 404. Depuis A-9 le retour est `{ success: false, "HTTP 404" }` — **avant A-9 c'était `success: true`**. La fonctionnalité « ajouter un fournisseur par défaut » n'a jamais fonctionné. |
| **B-4** | **`tycoonsRatings` est structurellement mort.** Le fichier s'appelle `tycoonratings.asp` (singulier) ; et son balisage est incompatible avec `parsePoliticsRatings` de toute façon. | `politics-handler.ts:255` vs `Politics/tycoonratings.asp` (existence) et `:136-148` (balisage) | Onglet « ratings des tycoons » toujours vide. Le 404 renvoie un corps HTML, donc le `catch` (`:260`) ne se déclenche pas : **échec parfaitement silencieux**. |
| **B-5** | **`parseCampaignResponse` est un oracle faux dans les deux sens.** | `tycooncampaign.asp:390-414` | Trois défaillances distinctes : ① **mot de passe faux** → `FullAccess = false` → `:399-413` rend un `<div class=label>` **vide** (le `if FullAccess` intérieur est faux) → `message` vide → `politics-handler.ts:136` retombe sur `{ success: true }`. ② **Annulation réussie** → `CancelError` n'est jamais rendu (`:66-81`, résultat de `RDOCancelCampaign` **non affecté** en `:76`) et `CacheObjectValid` devient faux → `:364` rend le `<div class=label>` « You are not participating… » → **rapporté comme échec**. ③ **`LaunchError` hors {100,101,102}** → `select case` sans branche → `<div>` vide → **rapporté comme succès**. |

### Gravité 2 — données fausses présentées au joueur

| Réf | Bug | Citation | Effet observable |
|---|---|---|---|
| **B-6** | **`rebuildLinks` vise `util/links.asp`, qui n'existe pas** (ni le fichier, ni le répertoire `util`). | `auto-connection-handler.ts:463` ; `find IIS_ROOT -iname "links.asp"` → vide | 404 systématique. Bouton mort. |
| **B-7** | **Tous les montants négatifs du compte de résultat sont affichés positifs.** | `TycoonProfitAndLoses.asp:16-22` (`FormatCurrency(v,0,0,0,-1)`) + `profile-finance-handler.ts:563` (`\$([0-9,.-]+)`) | Une division en perte de −$2 400 000 s'affiche +$2 400 000. Le compte de résultat devient illisible ; la page ASP colore d'ailleurs ces lignes en `#ff7700` pour cette raison précise (`:135-136`). |
| **B-8** | **`parseCurriculumHtml` : cinq champs à zéro.** Confirmé et **complété**. | `TycoonCurriculum.asp:128-161` vs `profile-finance-handler.ts:100` | `prestige`, `nobPoints` : la regex n'accroche pas (§2.1). `facPrestige`, `researchPrestige`, `area`, `facCount`/`facMax` : **ces champs n'existent tout simplement pas sur la page** — réparer la regex ne les fera pas apparaître. Et `prestige` a un second défaut : le libellé réel est `Total Prestige` alors que le `switch` (`:106`) attend `prestige`. |
| **B-9** | **`canUpgrade` est toujours `true`.** | `TycoonCurriculum.asp:91` (`function onAdvanceClick()` déclarée dans le `<head>`, inconditionnellement) | Le bouton « monter de niveau » est proposé à tout joueur, y compris ceux sans niveau suivant, sans `FullAccess`, ou en compte démo (`:250-260`). Cliquer déclenche `rdoSetAdvanceLevel.asp`, qui répond `ERROR: Cannot perform operation` en 200 — non détecté (§5). |
| **B-10** | **`displayName` du cluster vaut `"<Cluster>&Folder="`.** | `info.asp:53` (JS du `<head>`, avant `:95`) | Le nom du cluster affiché dans l'écran de sélection est `PGI&Folder=` au lieu de `PGI`. |
| **B-11** | **La photo de profil est toujours un 404.** | `RenderTycoon.asp:58` (`src="/fivedata/..."`) vs `profile-finance-handler.ts:71-72` | URL absolue depuis la racine concaténée au répertoire → `.../new%20directory//fivedata/...`. |
| **B-12** | **`ClusterFacilityPreview.buildTime` contient une surface, pas une durée.** | `NewLogon/facilityList.asp:227` (`CacheClass.Size`) — même expression que `Build/FacilityList.asp:248`, lue en `area` par `building-templates-handler.ts:451` | « Temps de construction : 3600 m. » |
| **B-13** | **Les compagnies publiques/ministérielles sont étiquetées « Private ».** | `chooseCompany.asp:193-197` vs `profile-finance-handler.ts:691` | Le `<nobr>` contient le rôle complet (« Mayor of Rome ») ; la regex exige le mot seul suivi de `</nobr>` → repli sur `'Private'`. |
| **B-14** | **`fluidName` affiche l'identifiant technique.** | `TycoonAutoConnections.asp:90` (nom localisé capturé puis jeté) vs `auto-connection-handler.ts:100-101` | L'utilisateur voit `PGIPlastics` au lieu de « Plastiques ». |
| **B-15** | **`facilityClass` faux pour toute installation indisponible.** | `Build/FacilityList.asp:300-307` (`info=` sous `if Available`) vs `building-templates-handler.ts:404-409` | Le repli devine la classe depuis le nom d'icône. Le code le sait et le journalise en `warn` — mais la valeur part quand même au client. |

### Gravité 3 — fidélité et robustesse

| Réf | Bug | Citation | Effet |
|---|---|---|---|
| **B-16** | Le découpage des cellules de prêt ignore les cellules vides → décalage silencieux des 6 champs | `profile-finance-handler.ts:377` vs `TycoonBankAccount.asp:551-570` | Prêt affiché avec banque/date/montant décalés d'une colonne |
| **B-17** | `defaultInterest`/`defaultTerm`/`totalNextPayment` recalculés alors que le serveur les publie | `TycoonBankAccount.asp:354, :355, :579-581` | Divergence d'arrondi possible (`Math.round(200-x)` vs `200-Math.round(x)`) |
| **B-18** | `parsePoliticsRatings` se désynchronise si une valeur est vide | `popularratings.asp:70-72` | Libellé N apparié à la valeur N+1, sans erreur |
| **B-19** | `description` d'une installation indisponible remonte les **prérequis** | `Build/FacilityList.asp:288` vs `:292` | Texte incorrect dans l'inspecteur de construction |
| **B-20** | `fortune` négative jamais lue (le `-` précède le `$`) | `TycoonCurriculum.asp:17-23`, `:131` | Même cause racine que B-7, autre page |

### Ce qui, lui, est **conforme** — et mérite d'être écrit

- **`executeBankAction`, chemin de repli.** L'URL reconstruite (`profile-finance-handler.ts:484-494`)
  reproduit **exactement** la forme de référence `TycoonBankAccount.asp:189` : `Tycoon`, `Password`,
  `Company`, `WorldName`, `DAAddr`, `DAPort`, `SecurityId`, `Action`, `LoanValue`. Idem pour `SEND`
  (`:195`) et `PAYOFF` (`:200`).
- **`ModifyTradeCenterStatus` / `ModifyWarehouseStatus`.** Nos huit paramètres de repli
  (`auto-connection-handler.ts:198-207`) sont identiques, nom pour nom, à
  `TycoonAutoConnections.asp:271-283`.
- **`DeleteDefaultSupplier`.** Cinq paramètres (`TycoonId`, `FluidId`, `DAAddr`, `DAPort`,
  `Supplier`) = `TycoonAutoConnections.asp:212-218`.
- **`rdoSetAdvanceLevel`** (`:437-448`) = `TycoonCurriculum.asp:93-101`, y compris la substitution
  `Value=[^&]*` sur l'URL en cache (le `+ event.srcElement.checked` de l'ASP est dynamique, donc
  extrait vide — notre substitution est exactement le bon geste).
- **`rdoResetTycoon`** (`:414-422`) : `rdoResetTycoon.asp` ne lit que `DAAddr`, `DAPort`, `Tycoon`,
  `Password` ; nos paramètres supplémentaires sont inertes, et le `Response.Redirect` final (`:18`)
  est suivi par `redirect: 'follow'`.
- **`buildCampaignParams`** = `tycooncampaign.asp:233/:380`, exactement.
- **`buildAspBaseParams`** fournit `ISAddr`/`ISPort` — sans quoi `chooseCompany.asp:26` lèverait.
- **`getMailFolder`** : `Folder`/`WorldName`/`Account` + `Action=''` neutralise bien le bloc DELETE.

---

## 4. L'état réel du cache d'URL d'action

`extractAllActionUrls` (`asp-url-extractor.ts:303`) agrège quatre extracteurs : formulaires,
`<a href>`, attributs `on*`, et `var URL = …;` dans les `<script>`. Confronté au balisage réel :

| Page → clé cherchée | Le cache peut-il être chaud ? | Citation |
|---|---|---|
| `TycoonBankAccount.asp` → `TycoonBankAccount.asp` | ❌ **JAMAIS.** La page n'a **aucun `<form>`**, aucun `<a href>` vers elle, et ses URL sont construites par `window.navigate("TycoonBankAccount.asp?…")` **directement dans un `switch`**, pas par une affectation `var URL = …;`. Aucun des quatre extracteurs ne l'atteint. | `TycoonBankAccount.asp:189, :192, :195, :200` vs `asp-url-extractor.ts:265` |
| `TycoonCurriculum.asp` → `abandonRole.asp` | ✅ **oui — et c'est le problème** (B-2) | `TycoonCurriculum.asp:76` (`var URL = "abandonRole.asp?…";`) |
| `TycoonCurriculum.asp` → `rdoSetAdvanceLevel.asp` | ✅ oui | `:93-101` |
| `TycoonCurriculum.asp` → `rdoResetTycoon.asp` | ❌ non — la page émet `resetTycoon.asp` (`:72`), pas `rdoResetTycoon.asp`. Repli utilisé, **et il est correct** | `:72` |
| `TycoonCurriculum.asp` → `links.asp` | ❌ non (page inexistante) | — |
| `TycoonAutoConnections.asp` → `DeleteDefaultSupplier.asp` | ✅ oui | `:212-218` |
| `TycoonAutoConnections.asp` → `ModifyTradeCenterStatus.asp` / `ModifyWarehouseStatus.asp` | ✅ oui, **sans le `Hire`** (ajouté après le `;` en `:281-283` / `:299-301`). Notre `searchParams.set('Hire', …)` (`:161-166`) le rajoute — geste correct | `:271-283`, `:289-301` |
| `TycoonAutoConnections.asp` → `AddDefaultSupplier.asp` | ❌ jamais (page inexistante) | — |
| `TycoonPolicy.asp` → `TycoonPolicy.asp` | ✅ oui, via `<form … action="TycoonPolicy.asp?Action=modify&…&TycoonId=<%= Obj.ObjectId%>&…">` — le formulaire est rendu **avant** le test `FullAccess`, donc toujours présent | `TycoonPolicy.asp:243` |

**Conséquence pour la session 7B :** la branche « URL en cache » de `executeBankAction`
(`profile-finance-handler.ts:477-481`) est du **code mort en production**. Son test unitaire
la couvre, mais aucun rendu réel ne peut la déclencher.

**Détail de fidélité à conserver.** `getBaseURL()` (`TycoonCurriculum.asp:82-89`,
`TycoonAutoConnections.asp:169-176`) construit `"http://" + host:port + "/" +
Left(PATH_INFO, InStrRev(PATH_INFO,"/"))`, et `PATH_INFO` **commence déjà par `/`** → l'URL de
référence contient un **double slash** : `http://ip:80//Five/0/Visual/Voyager/NewTycoon/…`.
Notre extracteur reproduit fidèlement ce double slash. Ne pas le « corriger » : c'est la forme
du client de référence.

---

## 5. Table des oracles d'erreur — ce que le serveur renvoie vraiment

**Rappel du §0 : zéro `Response.Status`, zéro `On Error` sur les 298 pages.** Tout est en 200.

| Page | Ce que le serveur renvoie vraiment | Notre détection |
|---|---|---|
| `TycoonCurriculum.asp` | `ObjValid = false` → 200 + `<div class=header2>Sorry, cannot retrieve Tycoon information from server</div>` (`:417-420`, `StrTycoonCurriculum_14`) | **INSUFFISANTE.** `fetchAspPage` ne lève que sur `!ok`. Un cache tycoon absent rend un profil à zéros, indistinguable d'un joueur neuf |
| `TycoonBankAccount.asp` — **LOAN** | 200. `select case loan_error` (`:330-343`) : `ERROR_LoanNotGranted (24)` → `<div class=errorText>The bank rejected your request…`, `ERROR_Unknown (1)` → `ERROR: Cannot perform operation`. Codes dans `Includes/protocol.inc:3-30` | **COMPLÈTE** pour ces deux codes (regex `class=errorText`, `:513`) |
| `TycoonBankAccount.asp` — **SEND** | 200. `select case send_error` (`:403-423`) : `ERROR_UnknownTycoon (7)`, `ERROR_InvalidMoneyValue (25)`, `ERROR_Unknown (1)` | **COMPLÈTE** |
| `TycoonBankAccount.asp` — **PAYOFF** | 200. **Aucun rendu.** `payoff_error` calculé (`:111`) et jamais affiché | **FAUSSE** — B-1 |
| `TycoonBankAccount.asp` — **mot de passe faux** | 200. `FullAccess = false` (`:95`) → le `select case Action` (`:97-114`) exécute la transaction **uniquement sous `if FullAccess`** → **rien ne se passe**, et le bloc `errorText` lui-même est sous `if FullAccess` (`:320`) → **page normale, aucun marqueur** | **FAUSSE.** `{ success: true }` sur une opération jamais tentée |
| `TycoonProfitAndLoses.asp` | `ObjValid = false` → 200 + `StrTycoonPolicy_7` (`:230-233`) | **INSUFFISANTE** — arbre P&L vide |
| `chooseCompany.asp` | Échec de bind IS → `CompanyCount` non défini → boucle `for i = 0 to -1` vide → 200 + page sans compagnie. `CompanyCount = 0` + `Logon=FALSE` → **`Response.Redirect` vers `createCompany.asp`** (`:42`) | **INSUFFISANTE.** `[]` retourné dans les deux cas, plus le corps de `createCompany.asp` |
| `TycoonAutoConnections.asp` | `ObjValid=false` → `StrTyconConnection_8` (`:326-328`). `FullAccess=false` → `Count = 0` (`:72-76`) → **table vide, page normale** | **INSUFFISANTE.** `{ fluids: [] }` = « pas de connexions » = « mauvais mot de passe » |
| `DeleteDefaultSupplier.asp` | 200 texte brut. Succès : `Deleting connection... OK.` (`:12`, `:15`). Bind raté : `ERROR: Couldn't bind to Tycoon` (`StrDefaultDupplier_1`). Connexion ratée : `ERROR: Couldn't connect` (`StrDefaultDupplier_2`) | **INSUFFISANTE.** Seul `resp.ok` est lu. Un marqueur fiable existe pourtant : la chaîne littérale **`OK.`** |
| `ModifyTradeCenterStatus.asp` | 200. Succès : `Setting Hire = true ... OK.`. Échecs : `Operation Failed`, `Connection Failed.`, **`Security Failed.`** (mot de passe faux) | **INSUFFISANTE** — un mot de passe faux rapporte succès |
| `ModifyWarehouseStatus.asp` | Idem, avec `StrDefaultDupplier_1/2` et `StrTyconBank_6` (`ERROR: Cannot perform operation`) pour la sécurité | **INSUFFISANTE** |
| `rdoSetAdvanceLevel.asp` | 200. Succès : `Setting Value = true ... OK.`. Échecs : `StrDefaultDupplier_1`, `StrDefaultDupplier_2`, `StrTyconBank_6` | **INSUFFISANTE** |
| `rdoResetTycoon.asp` | 200 après redirection vers `TycoonCurriculum.asp` (`:18`). **Aucun résultat n'est testé** : `res = pxy_tycoon.RDOResetTycoonEx(...)` (`:14`) est affecté puis jeté | **INSUFFISANTE PAR CONSTRUCTION** — la page ne publie aucun signal. Le seul oracle possible est une relecture du curriculum |
| `abandonRole.asp` | 200 — **page de confirmation**, jamais une action | **FAUSSE** — B-2 |
| `TycoonPolicy.asp` (POST modify) | 200. `RDOSetPolicyStatus` est appelé par `call` **sans capture du résultat** (`:27`, `:38`). Si `Connect` ou `BindTo` échoue, le bloc est sauté **en silence** et la page rend le tableau normal | **INSUFFISANTE PAR CONSTRUCTION.** Le seul oracle possible est une relecture de la page et une comparaison du statut |
| `popularratings.asp` / `ifelratings.asp` | 200. Dossier `Ratings\` absent → `Itr.Empty` → **table vide** | **INSUFFISANTE** |
| `tycoonratings.asp` | 404 (mauvais nom) → corps HTML d'erreur IIS | **FAUSSE** — le 404 n'est même pas remonté, le `catch` ne se déclenche pas |
| `tycooncampaign.asp` | 200. `LaunchError ∈ {100, 101, 102}` (`:402-411`) : `StrCo0nCampaign_9/10/11` — *« already have a public commitment »*, *« prestige should be higher than %1 »*, *« too late to launch »* (`ePolitics.lng:46-48`). Autres codes → `<div class=label>` **vide**. `FullAccess=false` → `<div class=label>` **vide**. Annulation → page sans campagne, rendue comme une invitation à en lancer une | **FAUSSE dans les deux sens** — B-5 |
| `Build/KindList.asp` | 200. Chemin compagnie invalide → `ClusterName = ""`, `Error = "Couldn't open the path…"` rendu en texte brut (`:212-214`) | **INSUFFISANTE.** Marqueur exploitable : `Couldn't open the path` |
| `Build/FacilityList.asp` | 200. Dossier vide → aucune ligne | **INSUFFISANTE** |
| `NewLogon/info.asp` | 200. Cluster inconnu → description vide + aucune catégorie | **INSUFFISANTE** |
| `NewLogon/facilityList.asp` | 200. Dossier vide → corps vide | **INSUFFISANTE** |
| `Mail/MessageList.asp` | 200. `Browser.Empty` → table sans ligne. `<input id="MsgCount" value="<%=i%>">` (`:244`) donne le compte attendu | **INSUFFISANTE** — mais `MsgCount` offre un contrôle croisé gratuit, non exploité |

### Le cadrage d'A-9, revu à la lumière de la source

**A-9 est nécessaire, correctement implémenté, et mal cadré dans sa description.**

`couverture-rdo-100.md` §3 le présente comme le correctif du « succès rapporté sans preuve » sur cinq
sites de mutation. La source ASP montre que `if (!resp.ok)` **ne peut pas** remplir ce rôle : sur ces
pages un refus métier, un `BindTo` raté ou un mot de passe faux sortent tous en **200**. A-9 couvre
exactement deux classes : la page **absente** (B-3 `AddDefaultSupplier.asp`, B-6 `links.asp`) et la
panne IIS (500). Pour tout le reste, **le trou d'origine est encore ouvert**.

Cinq sites A-9, réévalués :

| Site | A-9 suffit ? | Ce qu'il manque |
|---|---|---|
| `profile-finance-handler.ts:508` (bank) | **non** | Le refus `payoff` (B-1) et le mot de passe faux n'ont aucun marqueur |
| `auto-connection-handler.ts:236` | **non** | `OK.` / `Security Failed.` / `ERROR: Couldn't bind…` en 200 |
| `auto-connection-handler.ts:362` (policy) | **non** | La page ne publie **aucun** signal ; oracle = relecture |
| `politics-handler.ts:361` (launch) | **non** | `parseCampaignResponse` est faux par ailleurs (B-5) |
| `politics-handler.ts:392` (cancel) | **non** | Idem, et le cas nominal est rapporté en échec |

Cela **ne remet pas en cause** A-9 : il faut le garder. Cela remet en cause l'affirmation implicite
qu'il a fermé le sujet. Le vrai correctif est un **oracle de corps** par page — §6.

---

## 6. Fixtures à re-dériver en 7B, avec leur fragment ASP source

Les fixtures des lots 3 et 4 ont été écrites d'après nos parseurs : elles valident la lecture des
hypothèses du parseur, pas du serveur. Chaque ligne indique le fragment qui doit **produire** la
fixture. **Aucune de ces fixtures ne doit être écrite à la main : elle doit être la sortie littérale
du fragment ASP, avec ses tabulations, ses attributs non quotés et ses retours à la ligne.**

| Fixture / suite de tests | Fragment ASP source à instancier | Ce que la fixture doit démontrer |
|---|---|---|
| `profile-finance-handler.test.ts` — curriculum | `TycoonCurriculum.asp:128-174` (les 4-5 blocs `<div class=label>…<span class=value>`) | Que `parseCurriculumHtml` ne lit **rien** aujourd'hui — `it.failing` jusqu'au correctif ; puis `prestige` depuis **`Total Prestige`** et `nobPoints` depuis **`Nobility`**, `facPrestige`/`researchPrestige`/`area`/`buildings` **absents de la source** |
| idem — détails curriculum | `TycoonCurriculum.asp:215-344` (bloc niveau + rangs), avec **et sans** `if (Obj.SuperRole = 0)` | `nextLevelName`/`Description`/`Requirements`, `rankings[]` ; et le cas maire où tout le bloc disparaît |
| idem — `canUpgrade` | `TycoonCurriculum.asp:91` **seul**, sans la case à cocher `:257` | Que `canUpgrade` vaut `true` sur une page où la case n'existe pas (B-9) |
| idem — fortune négative | `TycoonCurriculum.asp:128-133` avec `FormatValue(-1234567)` = `-$1,234,567` | B-20 |
| `profile-finance-handler.test.ts` — banque | `TycoonBankAccount.asp:159-292` (bloc `<script>`) + `:549-582` (lignes de prêt **avec le `<td id="r0Bank"class=value` sans espace** de `:551**) + `:344-355` (`interest`/`term` serveur) | Formats `var budget`, `maxVal`, `loans` ; extraction des 6 cellules ; **et le total serveur `:579-581`** qu'on n'utilise pas |
| idem — prêt à banque vide | `TycoonBankAccount.asp:551-553` avec `LoanBankName` vide | B-16, le décalage de colonnes |
| idem — oracle payoff | `TycoonBankAccount.asp:97-114` avec `Action=PAYOFF` et `payoff_error <> 0` | B-1 : page **sans** `errorText` |
| idem — oracle mot de passe faux | `TycoonBankAccount.asp:95` avec `FullAccess=false` → tout le bloc `:320-516` absent | Aucun marqueur d'erreur, aucune transaction |
| `profile-finance-handler.test.ts` — P&L | `TycoonProfitAndLoses.asp:109-195` avec **au moins un `AccountValue(i) < 0`** | B-7 : perte du signe |
| idem — compagnies | `chooseCompany.asp:165-204` avec une compagnie `CompanyOwnerRole = "Mayor of Rome"` **et** une `strPrivate` | B-13 |
| `auto-connection-handler.test.ts` — fluides | `TycoonAutoConnections.asp:78-150` (deux fluides, un `Storable`, un non) | B-14 (nom localisé jeté), champ 52 |
| idem — URL d'action | `TycoonAutoConnections.asp:191-303` (les trois `var URL`) | Ce que `extractAllActionUrls` extrait vraiment, **double slash inclus**, et l'**absence** d'`AddDefaultSupplier.asp` (B-3) |
| idem — politique | `TycoonPolicy.asp:243-315` avec `AlliesPage=true` **et** `false` (option `value="0"` commentée) | Champs 54-55 |
| `auto-connection-handler.test.ts` — `abandonRole` | **`abandonRole.asp` en entier** | B-2 : le corps est une confirmation ; la cible réelle est `rdoAbandonRole.asp` + `RN` |
| idem — pages d'action | `DeleteDefaultSupplier.asp`, `ModifyTradeCenterStatus.asp`, `ModifyWarehouseStatus.asp`, `rdoSetAdvanceLevel.asp` — **les quatre sorties** (`OK.`, bind raté, connexion ratée, sécurité ratée) | L'oracle de corps à construire (§5) |
| `politics-handler.test.ts` — ratings | `popularratings.asp:66-77` avec une valeur vide au milieu | B-18, la désynchronisation |
| idem — tycoonratings | **`tycoonratings.asp:135-166`** (nom réel) | B-4 : le balisage à multi-attributs qui casse `parsePoliticsRatings` |
| idem — campagne | `tycooncampaign.asp:390-414` en **quatre** instances : `LaunchError=101`, `LaunchError=0 & !CacheObjectValid`, `FullAccess=false`, `IsMayor=true` | B-5 : les trois faux positifs/négatifs |
| `building-templates-handler.test.ts` — `KindList` | `KindList.asp:96-218` (route + maire + 2 kinds) — **remplace la fixture `[INFERRED]` de `:509-510`** | Le corps de `KindList.asp` est désormais **établi par source ASP** |
| idem — `FacilityList` | `FacilityList.asp:217-345` avec **une installation `Available=false`** | B-15 (pas d'`info=`), champ 87 (`description` = prérequis) |
| idem — `info.asp` | `info.asp:37-95` **avec le `<script>` du `<head>`** | B-10 : c'est la ligne `:53` qui casse `displayName`, pas `:95` |
| idem — `facilityList.asp` (NewLogon) | `facilityList.asp:181-236` | B-12 : `CacheClass.Size` est une surface |
| `mail-list-parser.test.ts` | `MessageList.asp:198-234` (INBOX lu + non lu, SENT) + `:244` (`MsgCount`) | Champ 94, et le contrôle croisé `MsgCount` non exploité |

---

## 7. `[INFERRED]` du §7 de `couverture-rdo-100.md` — levés et non levés

### 7.1 Levés par la source ASP

| `[INFERRED]` du §7.3 | Statut nouveau | Preuve |
|---|---|---|
| « corps de réponse `Build/KindList.asp` jamais capturé » | **LEVÉ — établi par source ASP.** Balisage complet, attributs quotés, `ref=` avec `Kind`/`Cluster`/`Folder`/`TycoonLevel`, `<div class=link>`, icône `FacKind_<Id>.jpg` | `KindList.asp:173-187`, `:181` |
| — | **NOUVEAU** : `Cluster` est dérivé **côté serveur** de la compagnie, jamais du paramètre | `KindList.asp:11-14` |
| — | **NOUVEAU** : `TycoonLevel` est calculé serveur, et forcé à 0 si `SuperRole <> 0` | `KindList.asp:31, :40-47` |

### 7.2 Membres RDO nouvellement établis — un gisement que le §7 n'avait pas

Ces pages ASP **pilotent le hook RDO côté serveur** via `RDOClient.RDOObjectProxy`. Chaque appel
donne le nom du membre, l'arité, le typage des arguments, la cible de `BindTo` et — décisif pour la
matrice de séparateurs — si `WaitForAnswer` est vrai (donc si le membre est une **fonction** qui
retourne, ce qui autorise `"^"`).

| Membre | Cible du `BindTo` | Signature établie | `WaitForAnswer` | Citation |
|---|---|---|---|---|
| `RDOAskLoan` | `Obj.ObjectId` (tycoon) | `(CStr(value)) → code` | `true` (résultat **capturé**) | `TycoonBankAccount.asp:19-21` |
| `RDOPayLoan` | idem | `(CStr(value)) → code` | `true` (capturé) | `:23` |
| `RDOSendMoney` | idem | `(CStr(dest), CStr(reason), CStr(value)) → code` | `true` (capturé) | `:45` |
| `RDOPayOff` | idem | `(CLng(lidx)) → code` | `true` (capturé, puis **jeté** — B-1) | `:65` |
| `RDOAddAutoConnection` | `Obj.ObjectId` | `(CStr(fluid), CStr(suppliers))` | `true`, résultat non capturé | `TycoonAutoConnections.asp:27-28` |
| `RDODelAutoConnection` | `Request("TycoonId")` | `(CStr(fluidId), CStr(supplier))` | `true`, non capturé | `DeleteDefaultSupplier.asp:12-14` |
| `RDOHireTradeCenter` / `RDODontHireTradeCenter` | `Request("TycoonId")` | `(CStr(fluidId))` | `true`, non capturé | `ModifyTradeCenterStatus.asp` |
| `RDOHireOnlyFromWarehouse` / `RDODontHireOnlyFromWarehouse` | `Request("TycoonId")` | `(CStr(fluidId))` | `true`, non capturé | `ModifyWarehouseStatus.asp` |
| `RDOSetAdvanceToNextLevel` | `Request("TycoonId")` | **`(1)` / `(0)` — entier, pas booléen** | `true`, non capturé | `rdoSetAdvanceLevel.asp` |
| `RDOSetPolicyStatus` | `Request("TycoonId")` | `(CStr(tycoon), CLng(status))` | `true`, non capturé | `TycoonPolicy.asp:27, :38` ; `ModifyPolicyStatus.asp` |
| `RDOResetTycoonEx` | **`"World"`** (pas le tycoon) | `(CStr(tycoon), CStr(password)) → res` | `true`, capturé puis jeté | `rdoResetTycoon.asp:9-14` |
| `RDOAbandonRoles` | **`"World"`** | `(CStr(tycoon), CStr(password)) → res` | `true` | `rdoAbandonRole.asp:16-22` |
| `RDOGetCompanyList` | **`"World"`** | `(CStr(realName)) → "…,…,"` (chaîne à découper sur `,`, cf. `split`/`Right`/`Left`) | `true` | `rdoAbandonRole.asp:19-21` |
| `RDOGetCompanyOwnerRole` | **`"World"`** | `(CStr(realName), companyId)` | `true` | `rdoAbandonRole.asp:22` |
| `RDOLaunchCampaign` | `Town.TownHallId` | `(CStr(tycoon)) → code ∈ {0, 100, 101, 102}` | `true`, **capturé** | `tycooncampaign.asp:57-59` |
| `RDOCancelCampaign` | `Town.TownHallId` | `(CStr(tycoon))` | `true`, **non capturé** | `tycooncampaign.asp:74-76` |
| `RDOModifyRating` (via page) | `Obj.TownHallId` | page `rdoModifyRating.asp?…&RatingId=&Value=` | — | `tycoonratings.asp:96-107` |
| `RDOModifyProject` (via page) | `Town.TownHallId` | page `rdoModifyProject.asp?…&ProjectId=&Data=` | — | `tycooncampaign.asp:183-197` |
| `GetClientView` / `GetCompanyCount` / `GetUserName` / `GetCompanyOwnerRole` / `GetCompanyName` / `GetCompanyId` / `GetCompanyCluster` / `GetCompanyFacilityCount` | `"InterfaceServer"` puis `CLng(ClientViewId)` | séquence complète de sélection de compagnie | `true` | `chooseCompany.asp:31-37, :166-170` |

**Valeur pour la matrice de conformité.** Les codes de retour de `RDOLaunchCampaign`
(100 = engagement public existant, 101 = prestige insuffisant, 102 = trop tard dans la période) sont
**établis par source ASP** — la matrice de mutation peut désormais prévoir des assertions sur ces
trois valeurs sans sonde live. De même, `RDOSetAdvanceToNextLevel` prend un **entier `1`/`0`**, pas
un booléen : à vérifier contre notre encodage.

⚠ **Réserve d'usage.** Ces appels passent par le proxy COM `RDOClient`, pas par notre socket. Ils
donnent le **nom, l'arité et le typage VBScript** des membres, pas les octets de la trame. Le
séparateur (`"^"` vs `"*"`) reste à trancher sur la déclaration Pascal — `WaitForAnswer = true` sur
un membre déclaré `procedure` ne rendrait pas `"^"` légal pour autant. La règle de `CLAUDE.md`
(« vérifier la déclaration Pascal avant de choisir un séparateur ») reste entière.

### 7.3 NON levés par la source ASP — les captures live restent nécessaires

| `[INFERRED]` | Pourquoi l'ASP ne peut pas le lever | Sonde requise |
|---|---|---|
| **Format de `CacheClass.ImportPrice`** (champs 71, 85) | Propriété du composant COM `CacheManager.CachedObject`, rendue telle quelle par `<%= %>`. Le `.asp` ne la formate pas | Capture live de `Build/FacilityList.asp` (déjà capturée d'après §7.3 — à confirmer comme oracle du format) |
| **Format de `CacheClass.Size`** (champs 72, 86) | Idem | Idem |
| **Format de `Obj.AccountHistory(i)`** → `ChartInfo` (champ 37) | Idem — `TycoonProfitAndLoses.asp:101` interpole une chaîne opaque | Capture live de `TycoonProfitAndLoses.asp` |
| **Format de `FormatCurrency` sous la locale IIS réelle** | `-$1,234` ou `($1,234)` ? Dépend de `NegativeCurrencyFormat` du serveur, pas du `.asp`. **Les deux formes cassent notre regex**, donc le correctif B-7 est valide dans les deux cas — mais la fixture doit refléter la vraie | Capture live d'un P&L avec au moins un poste en perte |
| **Les 42 commandes de `building-property-handler`** | **Aucune de ces pages ASP ne les émet.** Le transport C ne les touche pas | Inchangé — sondes live, §7.3 du rapport de mission |
| `RDOSetBuyingStatus`, `RDOSetInputSortMode`, `RDOSelSelected` (`[UNKNOWN]`, A-6) | Aucune page ASP ne les appelle | Inchangé — sondes live prioritaires |
| `RDOAutoRelease` (A-5) | Aucune page ASP | Inchangé |
| `RDOGetInvPropsByLang`, `RDOGetInvDescEx`, `MsgCompositionChanged`, `Save`, `GetAttachment`, `FindSuppliers`/`FindClients` | Aucune page ASP | Inchangé |
| `get RDOAcceptCloning`, `GetInputNames`/`GetOutputNames`, `GetSubObjectProps` | Aucune page ASP | Inchangé |
| **Les 22 membres de la Famille 9** (§7.2 : `AccountStatus`, `KeepAlive`, `RDOLogonUser`, `RegisterEventsById`…) | Cycle de vie RDO direct, hors transport C | Inchangé |

**Bilan.** La source ASP lève **un** `[INFERRED]` de la liste (`KindList.asp`), en ajoute
**quatre** de nature nouvelle (formats de propriétés du cache COM), et **établit dix-neuf membres
RDO** dont la forme n'était documentée nulle part. Elle ne réduit **pas** le besoin de sondes live
sur `building-property-handler` : ces mutations ne passent pas par le web.

---

## 8. Pages introuvables et rendus non résolus

### 8.1 Introuvables

| Chemin demandé par notre code | Statut | Site d'appel |
|---|---|---|
| `NewTycoon/AddDefaultSupplier.asp` | **Inexistant** dans les 2 774 `.asp`. Le flux réel d'ajout est `TycoonAutoConnections.asp?Connect=YES&Fluid=&Suppliers=` (`:18-33`) | `auto-connection-handler.ts:181` |
| `util/links.asp` | **Inexistant**, et il n'y a pas de répertoire `util` sous `Visual/Voyager` | `auto-connection-handler.ts:463` |
| `Politics/tycoonsratings.asp` | **Inexistant** — le fichier réel est `Politics/tycoonratings.asp` | `politics-handler.ts:255` |
| `Other/action.asp` | **Inexistant** (pas de répertoire `Other`). Référencé uniquement dans un test (`asp-url-extractor.test.ts`), pas en production | — |
| `NewTycoon/TycoonReport.asp` | **Inexistant**. Référencé dans `asp-url-extractor.ts` en commentaire de doc uniquement | — |

### 8.2 Rendus dépendant d'un état serveur que la source ne donne pas

Ces branches sont **lisibles** dans le `.asp` mais leur déclenchement dépend d'une donnée du cache
COM ou du fichier `world.five` — je consigne la dépendance, je ne conclus pas.

| Page | Branche | Dépend de |
|---|---|---|
| `TycoonCurriculum.asp:148, :162` | Bloc « Ability points » | `Obj.TournamentOn = "1"` (planète tournoi) |
| `TycoonCurriculum.asp:251` | « DEMO account, you cannot level » vs case à cocher | `Obj.Demo` |
| `TycoonCurriculum.asp:215` | **Tout** le bloc niveau + rangs | `Obj.SuperRole = 0` |
| `TycoonBankAccount.asp:424, :503` | Panneau « Send money » vs `StrTyconBank_28` | `world.five/SendingMoneyOn` |
| `TycoonPolicy.asp:56-60, :91` | Option « Ally » offerte ou **commentée** | `world.five/AlliesPageOn` |
| `Build/FacilityList.asp:208` | `Available` | `CompanyProxy.Technology`, `CacheClass.Uniqueness`, `RequiredLevel` |
| `NewLogon/info.asp:103-114` | Description de cluster — **cinq clusters seulement** | `ClusterName` littéral |

### 8.3 Includes non résolus

`URLUtils.inc`, `FrameButtons.js`, `GenericCacheObject.inc` (`tycooncampaign.asp:103`).
Ils ne portent que du comportement JS côté client (`getBaseURL`, `getCell`, `getRow`). Aucun
balisage lu par nos parseurs n'en dépend. **Aucun verdict de ce rapport n'est suspendu à eux.**

### 8.4 Anomalies dans la source elle-même — à ne pas « corriger » côté client

- `TycoonCurriculum.asp:277` : `<td>` non fermé avant `:278` ; `:292, :298` : `<td class>` sans valeur.
- `TycoonBankAccount.asp:323` : `width="50%>` — guillemet manquant. `:590` : `<table>` ouvert
  directement sous `<tr>` sans `<td>`.
- `KindList.asp:113-114` : deux `<td>` imbriqués dans la branche « route désactivée ».
- `abandonRole.asp` : `break;7` — coquille dans le JS de la source.
- `TycoonPolicy.asp:243` : le `<form>` ouvre **hors** du `if FullAccess` mais ne se ferme
  (`:361`, `:476`) qu'**à l'intérieur** — HTML non balancé quand `FullAccess` est faux.
- `Includes/protocol.inc` : le fichier est nommé en minuscules, les pages l'incluent en
  `Protocol.inc` — IIS/Windows insensible à la casse. Ne pas normaliser côté fixtures.

Ces défauts sont **la vérité terrain**. Les fixtures de 7B doivent les reproduire tels quels ; un
parseur qui n'y résiste pas est un parseur à corriger.

---

## 9. Ce qui remet en cause une conclusion du rapport de mission

| Conclusion de `couverture-rdo-100.md` | Révision |
|---|---|
| **A-9 ferme « le succès rapporté sans preuve » sur 5 sites** (§3, « Corrigés pendant la mission ») | **Mal cadré.** `if (!resp.ok)` ne couvre que la page absente et la panne IIS. Les 298 pages ASP n'ont **aucun `Response.Status`** : refus métier, bind raté et mot de passe faux sortent tous en 200. Sur les 5 sites, **aucun** n'a un oracle suffisant après A-9. Garder A-9, ajouter un oracle de corps par page (§5) |
| **`parseCurriculumHtml` : 5 champs à 0** (§3) | **Confirmé, et aggravé.** Cause exacte : le `</(?:span\|div)>` obligatoire de `:100`, pas le groupe suivant. Et **4 des 5 champs n'existent pas sur la page** (`facPrestige`, `researchPrestige`, `area`, `buildings`) : la regex réparée ne les remplira pas. `prestige` a un défaut supplémentaire — le libellé est `Total Prestige`, le `switch` attend `prestige` |
| **`ChartInfo` cherché sur 500 caractères vers l'avant** (§3) | **Confirmé.** Le balisage réel (`TycoonProfitAndLoses.asp:99-104`, `:149-156`) place le lien du niveau 2 dans un bloc de flush **antérieur** — la fuite décrite se produit bien |
| **`building-templates-handler.ts:225` : la regex `ref` non quoté déborde** (§3) | **Sans effet en production.** `KindList.asp:178` quote systématiquement le `ref`. Le code mort reste à nettoyer, aucune ligne réelle n'est jetée |
| **`FacilityList.asp` « est capturé et sert de fixture »** (§7.3) | **À revalider.** La capture existante ne couvre probablement pas l'installation **indisponible**, où l'attribut `info=` (donc `FacilityClass`) **disparaît** (`:300-307`). C'est le cas qui casse (B-15) |
| **`Build/KindList.asp` : corps jamais capturé, `[INFERRED]`** (§7.3) | **LEVÉ** par la source ASP (§7.1) |
| **La fixture `building-templates-handler.test.ts:509-510` marquée `[INFERRED]`** | À remplacer par une instanciation de `KindList.asp:96-218` |
| **§7 « 22 membres absents des deux »** | Inchangé pour ces 22. Mais **19 membres RDO nouveaux** sont établis par la source ASP (§7.2), dont les **codes de retour** de `RDOLaunchCampaign` — matière à assertions sans sonde live |
| **A-10 (`cacherGetPropertyList`), A-6, A-5, A-2, A-7, A-8** | **Aucun contact avec le transport C.** Ces défauts sont sur le socket RDO direct ; la source ASP ne les touche ni ne les infirme |

---

## 10. Ce que 7B doit corriger — estimation

### Correctifs de production : **20**

- **Gravité 1 — 5** : B-1 (oracle payoff), B-2 (`abandonRole` → `rdoAbandonRole.asp` + `RN`),
  B-3 (`add` → `TycoonAutoConnections.asp?Connect=YES`), B-4 (`tycoonratings.asp` + regex),
  B-5 (`parseCampaignResponse`).
- **Gravité 2 — 10** : B-6 → B-15.
- **Gravité 3 — 5** : B-16 → B-20.

Trois de ces correctifs sont **structurels**, pas des ajustements de regex : B-2 exige d'obtenir le
`RealName` du tycoon ; B-3 change de page cible et de verbe ; B-5 doit remplacer une heuristique de
présence de `<div>` par une lecture des codes `LaunchError` **plus** une relecture pour l'annulation.

### Oracles de corps à écrire : **7 familles**

`OK.` (4 pages d'action), `errorText` complété du cas payoff, `select case LaunchError`,
`Couldn't open the path` (KindList), `ObjValid=false` (4 pages), `MsgCount` (contrôle croisé mail),
et le repli « relecture » pour `TycoonPolicy` et `rdoResetTycoon`, où la page ne publie **rien**.

### Fixtures à re-dériver : **24** (table §6)

dont **9 nouvelles** couvrant des branches jamais testées : `FullAccess=false`, `SuperRole<>0`,
`Available=false`, `AlliesPage=false`, `Storable=false`, valeur de rating vide, banque de prêt vide,
montant négatif, `LaunchError` hors {100,101,102}.

### Ce que 7B ne peut pas faire

Quatre `[INFERRED]` de format (`ImportPrice`, `Size`, `AccountHistory`, `FormatCurrency` négatif)
exigent une **capture live**, pas une lecture de source. Les fixtures correspondantes devront rester
marquées `[INFERRED]` jusqu'à cette capture. Les correctifs B-7 et B-20 sont néanmoins valides dans
les deux formats possibles (`-$1,234` comme `($1,234)`), donc non bloquants.

---

## 11. Compétences utilisées

- **Lecture directe** (Read / Grep / Glob / Bash) sur `IIS_ROOT` en lecture seule — aucun sous-agent :
  la consigne de session interdit `AgentTool` sans demande explicite.
- **`CLAUDE.md` racine** — hiérarchie de preuve, invariants, statut d'artefact historique.
- **`src/server/CLAUDE.md`** (mémoire de répertoire, chargée automatiquement) — règles socket RDO,
  catégories de timeout, fichiers protégés. Consultée pour qualifier le §7.2.
- **`rdo-conformity` : NON invoquée.** La compétence est déclenchée avant *écriture* de code RDO.
  Cette session n'écrit rien. Sa règle centrale — « vérifier la déclaration Pascal avant de choisir
  un séparateur » — est en revanche **appliquée** au §7.2 pour refuser de conclure `"^"` depuis un
  `WaitForAnswer = true` VBScript.
- **`delphi-archaeologist` : NON invoquée.** Aucune trouvaille de ce rapport ne dépend de
  `../SPO-Original` ; toutes citent `Fichier.asp:Ligne`.
- **`spo-testing`** — consultée pour cadrer le §6 (co-localisation `module.test.ts`, fixtures
  dérivées et non écrites à la main).

**Aucune écriture dans `src/`. Aucune fixture modifiée. `IIS_ROOT` non touché. Aucun commit,
aucun push.**

---

## Addendum — corrections établies par la session 7B-1 (2026-08-17)

La remédiation a lu les pages plus finement que l'audit et **contredit trois entrées ci-dessus**.
La page a raison contre la table : ces corrections priment sur les §2 correspondants.

### C-1 · B-17 (prêts) — le diagnostic était à côté

L'audit reprochait au client de recalculer des valeurs que le serveur publie. **Le client de
référence recalcule aussi** : `onLoad()` → `computeLoanInfo` écrase les `<span>` serveur
(`TycoonBankAccount.asp:246-251`). Le recalcul n'est donc pas le défaut.

Le défaut réel est **l'ordre du bornage** — le clamp est appliqué après l'arrondi au lieu d'avant.
Et un seul champ était réellement à lire du serveur : `totalNextPayment`.

### C-2 · Champ 54 (policy) — pas « juste par accident »

L'audit classait ce champ MATCHE par chance. En réalité la page publie le statut par **deux
mécanismes mutuellement exclusifs** : `RenderStatus` teste un **nombre** (`TycoonPolicy.asp:68`),
les options testent une **chaîne** (`:92`). En VBScript un seul des deux est rendu — **lequel reste
`[INFERRED]`**, faute de capture. Le parseur lit désormais les deux formes.

### C-3 · Champ 38 (profit & loss) — défaut NON relevé par l'audit

Le total de niveau 2 est publié par la **ligne de flush**, et il était jeté : le nœud restait à `$0`.
Pire, ces lignes de flush étaient parsées **comme des comptes**. L'audit ne l'avait pas vu.

### Ce qui reste sans preuve après 7B-1

| Point | Statut | Ce qu'il faudrait |
|---|---|---|
| `util/links.asp` (`rebuildLinks`) | `[UNKNOWN]` | `IIS_ROOT` est un instantané — son absence ici ne prouve pas l'absence sur le serveur exploité |
| Refus de `rdoResetTycoon` | `[UNKNOWN]` par construction | la page ne publie aucun signal d'échec |
| **Fraîcheur du cache COM après mutation** | `[INFERRED]` | **le point le plus important.** Tous les oracles de mutation de 7B-1 en dépendent : ils comparent l'état avant à la page re-rendue. L'intention de l'auteur ASP est explicite (`InitCacheObject` avant re-rendu) mais `CacheObject.inc` **ne force pas `Recache`**. Le risque est un **faux négatif** — annoncer un échec sur une réussite — **jamais un faux positif sur de l'argent**, ce qui est la bonne direction. **Une capture live d'un aller-retour mutation → relecture tranche définitivement.** À porter à `report/campaign/coverage-matrix.md`. |
| Moitié cliente du champ 52 (`storable`) | hors périmètre 7B-1 | 1 ligne dans `ProfilePanel.tsx` |
