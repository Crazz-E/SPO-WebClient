# Analyse d'écarts WebClient ↔ Voyager — 2026-08-16

**Contexte :** run de conformité du 2026-08-16 vert (55 PASS · 0 FAIL · 1 UNKNOWN · 3 SKIP, sortie 0,
TycoonId 36, Green Inc #43, 215 frames, logs serveur propres). Le protocole est conforme *sur ce qui
est implémenté* ; ce document recense ce qui **ne l'est pas**.

**Méthode :** inventaire croisé des membres RDO et des surfaces fonctionnelles entre
`src/` (WebClient) et `../SPO-Original/Voyager` + le modèle Delphi (`Kernel/`, `StdBlocks/`).
Chaque écart cite `Fichier.pas:Ligne` ou un chemin `src/`. Couverture mesurée par un run complet
(`npx jest --coverage`, 222 suites, 4 595 tests).

**Compagnon :** [campaign/coverage-matrix.md](campaign/coverage-matrix.md) (plan de campagne mutation),
[../doc/voyager-handler-reference.md](../doc/voyager-handler-reference.md) (table des 33 handlers).

---

## 1. Synthèse

| Famille | Écarts | Gravité |
|---|---|---|
| A. Cibles et noms de membres faux (lecture **et** écriture cassées) | 5 propriétés · 2 onglets · 1 membre inexistant · 2 cibles fausses | **haute** — bug silencieux en prod |
| B. Pushes serveur non traités | 7 méthodes publiées | haute (dont `ActorPoolModified`) |
| C. Membres de session IS jamais appelés | 8 membres | moyenne |
| D. Commandes RDO de façade absentes | 4 commandes | moyenne |
| E. Sous-systèmes entiers absents | 3 (Illegal Business, Favoris CRUD, News) | à arbitrer (périmètre) |
| F. Câblage WS mort (handler sans émetteur, ou type sans handler) | 9 types `REQ_*` | moyenne |
| G. Tests manquants | voir §8 | haute |

Le protocole n'est **pas** en cause : aucun de ces écarts n'est une divergence de trame. Ce sont des
membres non implémentés, des noms de propriété inventés, et du câblage inachevé.

---

## 2. Famille A — noms de propriétés faux

C'est la catégorie la plus coûteuse, parce qu'elle **passe la suite de conformité** : la trame est
bien formée, le serveur répond, mais la valeur est vide et l'écriture ne touche rien.

### A-1 · TV — `HoursOnAir` et `Comercials` ne sont pas dans le cache

`TV_GENERAL_GROUP` ([template-groups.ts:307-308](../src/shared/building-details/template-groups.ts#L307-L308))
déclare les deux comme propriétés de cache, lues par `GetPropertyList`.

Or `TBroadcaster.StoreToCache` (`StdBlocks/Broadcast.pas:431-453`) n'écrit **que** `antName{i}`,
`antX{i}`, `antY{i}`, `antTown{i}`, `antViewers{i}`, `antActive{i}`, `antCount`. Ni `HoursOnAir`,
ni `Comercials`.

Voyager le sait : `TVGeneralSheet.pas:271-275` les récupère par **GET direct sur le bloc**
(`MSProxy.HoursOnAir`, `MSProxy.Commercials`), pas par le cache.

→ **Les deux curseurs de l'onglet TV affichent toujours 0.**

### A-2 · TV — l'écriture vise `Comercials`, la propriété publiée est `Commercials`

`template-groups.ts:314` mappe `'Comercials': { command: 'property' }`. Le chemin générique
([building-property-handler.ts:184-185](../src/server/session/building-property-handler.ts#L184-L185))
transmet le nom verbatim → `sel <CurrBlock> set Comercials`.

La propriété publiée est `property Commercials : TPercent` (`StdBlocks/Broadcast.pas:53`), avec deux `m`.
Voyager écrit d'ailleurs correctement `Proxy.Commercials := parms[1].vInteger` (`TVGeneralSheet.pas:322`)
tout en lisant la clé cache mal orthographiée `tidComercials = 'Comercials'` (`TVGeneralSheet.pas:15`).
Le WebClient a repris la faute de frappe **des deux côtés**.

→ **Le réglage « publicité » d'une TV ne part jamais** (RTTI en échec côté serveur).

### A-3 · Banque — `BudgetPerc`, `Interest`, `Term` ne sont pas dans le cache

`BANK_GENERAL_GROUP` ([template-groups.ts:246-248](../src/shared/building-details/template-groups.ts#L246-L248))
les lit via `GetPropertyList`. Ce sont des propriétés **publiées** de `TBankBlock`
(`StdBlocks/Banks.pas:39-41`, accesseurs `GetBudgetPerc`/`GetInterest`/`GetTerm`).

`TBankBlock.StoreToCache` (`Banks.pas:188-206`) n'écrit que les prêts indexés — `LoanCount`,
`Debtor{i}`, `Interest{i}`, `Amount{i}`, `Slice{i}`, `Term{i}` — et la ligne `BankBudget` y est
**commentée** (`Banks.pas:193`).

→ **Les trois curseurs de l'onglet Banque affichent toujours 0.** L'écriture, elle, fonctionne
(`set Interest` / `set Term` visent bien les propriétés publiées, `BudgetPerc` passe par `RDOSetLoanPerc`).
Asymétrie : on peut écrire mais pas relire — donc l'oracle O2 de la campagne mutation
(re-lecture) est inopérant sur ces trois lignes.

### A-4 · Banque — `EstLoan` n'existe nulle part

`template-groups.ts:245` déclare `EstLoan` en propriété de cache. Aucune écriture cache correspondante
dans `Banks.pas`. Dans Voyager la valeur vient d'un appel : `EstLoan := MSProxy.RDOEstimateLoan(getTycoonId)`
(`BankGeneralSheet.pas:261`). Voir D-1.

### A-9 · L'oracle HTTP n'est jamais consulté — ajouté le 2026-08-17 (lot 4) · **le plus grave**

> **CORRIGÉ le 2026-08-17** sur les 5 sites de **mutation** (voir la fin de cette section pour ce qui
> reste ouvert). Chacun porte désormais la même garde que le modèle déjà présent dans le dépôt,
> `executeCurriculumAction` (`auto-connection-handler.ts:466`) :
> `if (!resp.ok) return { success: false, message: '… failed: HTTP <status>' }`.
> Les 4 tests qui figeaient le comportement fautif sont devenus des garde-fous de non-régression.
> Vérifié : 195 tests verts sur les 3 fichiers, couverture inchangée, typecheck vert.
>
> **⚠ CADRAGE CORRIGÉ le 2026-08-17** par l'audit de la source ASP réelle
> ([audit-transport-c-asp.md](audit-transport-c-asp.md)). Fait établi par recherche sur les
> **298 pages Voyager de `Five/0`** : **0 occurrence de `Response.Status`, 0 fichier avec `On Error`.**
> Le serveur **ne produit jamais de code HTTP d'erreur applicatif**. La garde `if (!resp.ok)` ne
> couvre donc que la **page absente et la panne IIS** — elle reste nécessaire (elle attrape déjà un
> 404 réel, voir A-12) mais elle **ne ferme pas le sujet** : sur les 5 sites, **aucun n'a d'oracle
> suffisant**. Le vrai signal est dans le corps, et il faut l'écrire page par page. A-9 passe donc
> de « corrigé » à **« garde posée, oracle à construire »**.

### A-13 · Le transport C rendait des données fausses, pas seulement des succès faux — 2026-08-17 (7B-1)

L'audit 7A comptait **18 champs NE MATCHE PAS et 22 FRAGILE sur 94**. La remédiation 7B-1 a corrigé
20 sites sur `profile-finance-handler` et `auto-connection-handler`, chacun cité `Fichier.asp:Ligne`.
Détail : [audit-transport-c-asp.md](audit-transport-c-asp.md) et
[remediation-transport-c-7B-1.md](remediation-transport-c-7B-1.md). Les quatre qui comptent :

| Défaut | Effet observable |
|---|---|
| **Le signe des montants était perdu** (B-7, B-20) | `FormatValue = FormatCurrency(v, 0, 0, 0, -1)` rend `-$1,234` — le signe précède le `$`. Notre regex s'ancrait sur `$` et laissait `[\s\S]*?` avaler le signe : **toutes les pertes étaient affichées positives**, dans le profit & loss comme dans le compte bancaire. Un déficit se lisait comme un bénéfice. |
| **L'ajout de fournisseur n'a jamais fonctionné** (B-3) | `AddDefaultSupplier.asp` **n'existe pas** parmi les 2 774 pages. La bonne forme est une re-requête de `TycoonAutoConnections.asp?Connect=YES&Fluid=&Suppliers=`, qui pilote `RDOAddAutoConnection`. L'ancienne cible renvoyait un 404 — la fonction n'a **pas marché une seule fois**. |
| **Un mot de passe faux rapportait un succès** | Les 4 pages d'action en texte brut gardent leur appel RDO derrière `FullAccess` et répondent `ERROR: Cannot perform operation`. Seul `resp.ok` était lu : un refus d'authentification passait pour une réussite. |
| **L'avatar n'était jamais affiché** (B-11) | `RenderTycoon.asp:58` émet un `src` **racine-relatif** ; on le concaténait au répertoire de la page, produisant `…/new%20directory//fivedata/…` — un 404 garanti. |

Plus : `onAdvanceClick` déclarée dans le `<head>` rendait `canUpgrade` **toujours vrai** (B-9) ;
`abandonRole.asp` est une page de **confirmation en deux temps** avec paramètre `RN` (B-2) ; les
cellules de prêt étaient lues **par position** au lieu de leur `id` (B-16).

**La leçon de méthode :** aucun de ces défauts n'était détectable avant l'arrivée de `IIS_ROOT`,
parce que les fixtures de test étaient dérivées de nos propres parseurs. Les tests étaient verts et
la production fausse. C'est une tautologie plus subtile que celle du §6 du prompt de mission, et
elle a survécu à sept lots.

**Risque résiduel, à trancher par capture live :** tous les oracles de mutation de 7B-1 comparent
l'état d'avant à la page re-rendue. La **fraîcheur du cache COM** après mutation est `[INFERRED]` —
`CacheObject.inc` ne force pas `Recache`. Le risque est un **faux négatif**, jamais un faux positif
sur de l'argent : la direction est la bonne, mais elle mérite une capture.

### A-11 · `executeBankAction('payoff')` ne peut structurellement jamais échouer — 2026-08-17 (audit 7A) · **le plus grave**

`TycoonBankAccount.asp:111` calcule `payoff_error` — **et ne le rend jamais**. `loan_error` et
`send_error` ont chacun leur `select case` qui émet un `<div class=errorText>` ; le chemin payoff
n'en a aucun.

→ Un remboursement raté renvoie un **200 sans aucun marqueur d'erreur**. Le joueur lit
« payoff completed successfully ». **Aucun correctif côté client ne peut détecter ce cas** : le
serveur n'émet pas le signal.

C'est une **omission côté serveur**, pas un défaut de parsing — la première de cette nature dans
tout l'audit, et elle est sur de l'argent réel.

> **DÉCISION DÉVELOPPEUR, 2026-08-17 — reproduire Voyager.** Dans le client de référence, rembourser
> un prêt **rafraîchit la liste** : le joueur voit le prêt disparaître, **sans message de
> confirmation**. C'est ce comportement qu'on retient pour cette version.
>
> **Conséquence, et elle est gratuite :** la réponse de l'action **est déjà** la page
> `TycoonBankAccount.asp` re-rendue — c'est précisément pourquoi `var budget` y est lu aujourd'hui
> (`profile-finance-handler.ts:509`). L'état d'après y figure donc **déjà**, et on le jette. Aucune
> requête supplémentaire n'est nécessaire : il suffit de re-parser la réponse avec
> `parseBankAccountHtml` et de comparer (prêt disparu à `loanIndex`, `LoanCount` décrémenté, solde).
>
> **Principe généralisable aux 7 familles d'oracles :** ces pages ASP d'action renvoient la page
> rafraîchie. **L'état d'après est l'oracle** — bien meilleur que la recherche d'un marqueur d'erreur,
> parce qu'il prouve le changement au lieu de constater l'absence de refus.

### A-12 · `tycoonsratings.asp` n'existe pas : le fichier est `tycoonratings.asp` — 2026-08-17 (audit 7A)

`politics-handler.ts:255` interroge `tycoonsratings.asp` (avec un `s`). La page réelle est
**`tycoonratings.asp`**, au singulier. L'appel est enveloppé dans un `try/catch` qui avale l'échec
(`:260-262`) → `tycoonsRatings` est **toujours vide**, sans le moindre log.

Même famille que A-2 (`Comercials`) et A-5 (`RDOAutoRelease`) : un identifiant faux qu'aucun test ne
pouvait attraper, puisque la fixture était dérivée de notre propre code.

**Également constaté :** `util/links.asp` (appelé par `rebuildLinks`, auto-connection) n'existe nulle
part dans `IIS_ROOT`, ni le répertoire `util`. À marquer `[UNKNOWN]` plutôt que « mort » : ce root est
un instantané, la page peut exister sur le serveur exploité. La garde A-9 fait au moins que l'appel
échoue proprement au lieu de rapporter un succès.

Aucun des points d'entrée `fetch` directs ne lit `response.status`. Une page d'erreur serveur est
parsée comme de la donnée, et l'absence de marqueur d'erreur dans le HTML est interprétée comme un
succès. La garde existe pourtant : tout ce qui passe par `ctx.fetchAspPage` est vérifié par la
session (`spo_session.ts:960`). Ce sont les appels qui la contournent qui sont nus.

| Site | Effet |
|---|---|
| **`profile-finance-handler.ts:499-514`** `executeBankAction` | **ARGENT RÉEL.** Un 500 sans `class=errorText` ni `var budget` renvoie `{ success: true, message: '<action> completed successfully' }` — sur `borrow`, `send` ET `payoff`. Et comme `setAccountMoney` n'est appelé que si `budgetMatch`, le solde affiché reste périmé au moment même où l'on annonce le succès. |
| `auto-connection-handler.ts:233` `executeAutoConnectionAction`, `:349` `setPolicyStatus` | résultat jamais lu, `success: true` inconditionnel |
| `politics-handler.ts:357` / `:383` lancement et annulation de campagne | une page 500 = « pas de div de refus » = succès |
| `politics-handler.ts:241-259` `getPoliticsData` | 500 → ratings vides, aucun log |
| `profile-finance-handler.ts:66` `RenderTycoon.asp` | photo seule, impact faible |

Contre-exemples corrects, à prendre comme modèle : `executeCurriculumAction` (`:466`) et
`getMailFolder` (`:463`) vérifient `ok`.

C'est exactement le mode de défaillance M-D relevé par la campagne mutation
([campaign/coverage-matrix.md](campaign/coverage-matrix.md) §2.1) — « la passerelle rapporte un
succès sans avoir établi que quoi que ce soit s'est produit » — mais sur le transport C, où il
n'avait pas encore été cherché.

### A-10 · `cacherGetPropertyList` rend un tableau désaligné au lieu de rien — ajouté le 2026-08-17 (lot 5)

`spo_session.ts:1462-1465` déclare dans son propre commentaire que **« positional alignment is
critical »** : le serveur de cache Delphi renvoie une valeur par propriété demandée, chaîne vide
comprise, et tous les appelants indexent positionnellement.

Or la branche de repli `:1475-1477` — empruntée dès que la charge utile n'a pas la forme
`res="…"` — passe par `cleanPayloadHelper`, qui se contente de retirer la ponctuation. Une réponse
`Member="%valeur` ressort comme **une seule valeur**, et l'appelant qui attendait N valeurs lit la
mauvaise propriété à chaque position.

C'est la même famille que A-9 et que M-D de la campagne mutation : on renvoie quelque chose qui a
la forme d'une donnée valide alors qu'on n'a rien établi. Un `[]` serait strictement moins nocif —
l'appelant verrait l'absence au lieu de consommer un décalage silencieux.

Rayon de souffle : **tout le chemin de lecture de l'inspecteur** passe par cette fonction.
Fichier protégé (`spo_session.ts`) — correctif à décider, pas à appliquer au fil de l'eau.
Comportement actuel épinglé par un test du lot 5.

### A-7 · Le plafond de concurrence RDO n'est pas tenu — ajouté le 2026-08-17 (lot 3)

`building-details-handler.ts:1492-1505` affirme en commentaire que les lectures de connexions sont
« gated by the same semaphore to respect Delphi MAX_BUFFER_SIZE ». **Elles ne le sont pas.** Le permis
est pris une fois autour du slot entier, puis `batchedParallel` émet jusqu'à
`MAX_CONCURRENT_CONNECTIONS = 3` (`:1078`) `GetSubObjectProps` concurrents *à l'intérieur* du permis.
Avec 3 workers : jusqu'à **9 requêtes simultanées** sur la socket `map`, contre
`MAX_GLOBAL_CONCURRENT_RDO = 4` (`:1137`) que le code prétend respecter. Mesuré par pic en vol.

**Gravité — à ne pas surestimer.** La première formulation de cette trouvaille parlait de dépasser
« `MAX_BUFFER_SIZE = 5` côté Delphi ». Vérification faite le 2026-08-17 : **cette constante n'existe
dans aucun `.pas` de `../SPO-Original`**. Ce qui existe porte le même nom et n'a pas le même sens —
`rdo.ts:38` est un plafond d'**octets** (5 Mio, le framer) et `spo_session.ts:350` est notre propre
file de requêtes, fixée à **20**, avec le commentaire « Delphi queues far more; 5 was too aggressive ».

Donc : ce qui est dépassé est **notre borne documentée**, pas une limite serveur prouvée. Le défaut
reste réel et à corriger — un commentaire qui décrit une garantie inexistante est pire que pas de
commentaire — mais il ne constitue pas un risque établi pour le serveur partagé.

**Dette de documentation à traiter séparément :** [rdo-session-lifecycle.md](rdo-session-lifecycle.md)
§9 divergence **D2** justifie sa borne par « cap 3 < Delphi `MAX_BUFFER_SIZE=5` » **sans citation
`Fichier.pas:Ligne`**. C'est l'origine de la croyance, et CLAUDE.md exige que toute affirmation
tirée du legacy soit citée ou marquée `[INFERRED]`/`[UNKNOWN]`. À reclasser en `[UNKNOWN]` tant que
la vraie limite de file du serveur RDO n'est pas établie — ou à sourcer.

### A-8 · `enrichVotesTab` est injoignable — ajouté le 2026-08-17 (lot 3)

`building-details-handler.ts:923-953` exige `CurrBlock` parmi les valeurs collectées. Or `CurrBlock`
n'est déclaré que dans `GENERIC_GROUP` (`template-groups.ts:25`), atteignable uniquement par le
`GENERIC_TEMPLATE` de repli — **qui ne comporte pas d'onglet `votes`**. Aucune registration
CLASSES.BIN ne peut produire les deux à la fois.

→ `RDOVoteOf` n'est **jamais émis** : l'onglet Votes n'affiche jamais pour qui le joueur a voté.
Le vote lui-même (`RDOVote`) fonctionne. Épinglé par un test sur le vrai template d'hôtel de ville.

Même famille que A-1/A-3 : une propriété demandée là où elle n'est jamais fournie. La règle
d'inventaire dérivable qui l'aurait attrapée est notée pour le LOT 6 (§5 du plan).

### A-5 · `RDOAutoRelease` n'existe pas — ajouté le 2026-08-17 (lot 2)

`template-groups.ts:630` câble un toggle « auto-release » sur la commande `RDOAutoRelease`, présente
dans `KNOWN_RDO_COMMANDS` — donc acceptée par la passerelle, qui émet la trame.

**Le membre n'existe dans aucun `.pas` de `../SPO-Original`** (recherche sur tout le dépôt legacy,
zéro occurrence). Le studio de cinéma publie exactement quatre membres —
`RDOLaunchMovie`, `RDOCancelMovie`, `RDOReleaseMovie`, `RDOAutoProduce`
(`StdBlocks/MovieStudios.pas:104-107`). L'auto-release voyage dans le **bitmask `AutoInfo` du
4ᵉ argument de `RDOLaunchMovie`** (bit 0 = auto-release, bit 1 = auto-production).

→ Le toggle part dans le vide. Même classe que A-2, mais cette fois depuis l'intérieur de
l'allowlist : c'est précisément le mode de défaillance que `KNOWN_RDO_COMMANDS` était censé fermer.

### A-6 · `RDOSetInputSortMode` et `RDOSelSelected` visent la mauvaise cible — ajouté le 2026-08-17 (lot 2)

Les deux membres partent sur `CurrBlock` chez nous : ils ne figurent pas dans
`RDO_OBJECTID_COMMANDS` (`building-property-handler.ts:150-154`), donc ils tombent dans la branche
par défaut.

Voyager fait un `BindTo` explicite sur un **ObjectId** avant chacun (vérifié 2026-08-17) :

| Membre | Site Voyager | Cible liée |
|---|---|---|
| `RDOSetInputSortMode(Fluid, mode)` | `SupplySheetForm.pas` — `threadedChgSortMode` | `Proxy.BindTo(ObjId)` où `ObjId = fContainer.getObjectId` |
| `RDOSelSelected(Selec)` | `SupplySheetForm.pas` — `threadedSetSelect` | `Proxy.BindTo(ObjId)` où `ObjId = fHandler.fObjectId` |

Aucun des deux ne vise `CurrBlock`. L'écart n'est **observable que sur les entrepôts**, où
`CurrBlock ≠ ObjectId` ; ailleurs les deux valeurs coïncident et la trame est fortuitement correcte.

**Question ouverte, à trancher avant correction :** les deux sites ne lisent pas le même ObjectId
(`fContainer.getObjectId` vs `fHandler.fObjectId`), et
[voyager-handler-reference.md](voyager-handler-reference.md) qualifie la cible de `RDOSelSelected` de
« gate ObjectId ». Il faut établir lequel des deux — ObjectId de façade ou ObjectId de porte — avant
de les ajouter à `RDO_OBJECTID_COMMANDS`. Sonde live requise sur un entrepôt.

**Correctif structurel proposé pour A-1/A-3/A-4 :** un type `PropertySource` (`cache` | `directGet` | `rdoCall`)
dans `property-definitions.ts`, et un chemin de lecture `sel <CurrBlock> get <Prop>` dans
`building-details-handler.ts`. Le chemin GET direct existe déjà côté session
(`RdoAction.GET`, cf. `building-management-handler.ts:117`), il n'est simplement pas exposé à l'inspecteur.

---

## 3. Famille B — pushes serveur non traités

`TISEvents` (l'objet RDO que le client publie et que le serveur appelle) déclare 24 méthodes
(`Voyager/URLHandlers/ServerCnxHandler.pas:469-505`).

> **Correction 2026-08-17** (établie en écrivant `push-dispatcher.test.ts`, lot 2). La première
> rédaction disait « `push-dispatcher.ts` en traite 17 » — le compte était juste par coïncidence et
> le mécanisme faux. Le décompte exact :
> — **15** membres `TISEvents` sont traités par `push-dispatcher.ts` ;
> — **`RefreshArea` et `RefreshObject` ne passent PAS par le dispatcher** : `spo_session.processSingleCommand`
>   les intercepte en amont (`isRefreshAreaPush` :824, `isRefreshObjectPush` :814) et sort avant `dispatchPush`.
>   Ils sont donc bien traités, mais ailleurs ;
> — le dispatcher traite en plus **2 membres qui ne sont pas des `TISEvents`** : `SetLanguage`
>   (écho du push client, `login-handler.ts:465`) et `Refresh` (invalidation du cache proxy,
>   `Cache/CachedObjectWrap.pas:34`).
> La conclusion du tableau ci-dessous est inchangée : les 6 membres listés restent non traités,
> vérifié par recherche du nom sur tout `src/`.

| Méthode publiée | Déclaration | Traitée ? | Conséquence |
|---|---|---|---|
| `ActorPoolModified(ActorPoolId, Data)` | `ServerCnxHandler.pas:496` | ❌ | **Aucun véhicule serveur n'est reçu.** Les trains/voitures affichés sont synthétisés côté client (`renderer/vehicle-animation-system.ts`). C'est la cause racine du panneau Transport mort (§7). |
| `GameMasterMsg(Msg, Info)` | `:503` | ❌ | Les messages GM émis par le serveur n'arrivent jamais. |
| `GMNotify(notID, Info)` | `:504` | ❌ | Notifications GM ignorées. |
| `NotifyCompanionship(Names)` | `:490` | ❌ | Liste des « compagnons » (alliés en vue) jamais reçue. |
| `VoiceMsg(From, Msg, TxId, NewTx)` | `:486` | ❌ | Chat vocal — hors périmètre probable, à acter. |
| `VoiceRequestGranted(RequestId)` | `:487` | ❌ | idem. |

Les autres sont bien câblés : `InitClient`, `RefreshTycoon`, `RefreshDate`, `RefreshSeason`,
`EndOfPeriod`, `TycoonRetired`, `ChatMsg`, `NewMail`, `MoveTo`, `NotifyUserListChange`,
`NotifyChannelListChange`, `NotifyChannelChange`, `NotifyMsgCompositionState`, `ShowNotification`,
`ModelStatusChanged` par le dispatcher ; `RefreshArea`/`RefreshObject` en amont dans `spo_session` ;
`AnswerStatus` répondu dans `spo_session` (c'est la seule `function` de l'interface — elle arrive
en REQUEST avec QueryId, ce n'est pas un push).

**Risque protocole — réponse apportée le 2026-08-17.** La question posée ici (« vérifier que
`push-dispatcher.ts` journalise les membres inconnus ») a été tranchée en écrivant les tests :
**il ne les journalise pas**. Un membre inconnu est relayé brut au client en `EVENT_RDO_PUSH`.
Rien n'est perdu, mais rien n'est visible non plus côté passerelle : une régression serveur, ou
l'apparition d'un membre `TISEvents` jusqu'ici muet, passerait inaperçue. Le comportement est
désormais épinglé par un test — le changer est une décision, plus un accident.

---

## 4. Famille C — membres de session IS jamais appelés

Inventaire pris sur `ServerCnxHandler.pas` (tous les `fISProxy.*` / `fDSProxy.*`) confronté aux
membres réellement émis par `src/server/`.

| Membre | Rôle dans Voyager | Absent du WebClient |
|---|---|---|
| `ObjectConnections` | liste les connexions d'un objet (tracé des liaisons commerciales sur la carte) | ✅ |
| `GetNearestTownHall` | ville de rattachement d'une case | ✅ |
| `ContextStatusText` | texte de statut au survol d'un objet | ✅ |
| `AllObjectStatusText` | idem, en lot | ✅ |
| `Chase` / `StopChase` | caméra qui suit un objet mobile | ✅ |
| `CreateChannel` | création d'un canal de chat (`JoinChannel`/`GetChannelList`/`GetChannelInfo` sont, eux, implémentés) | ✅ |
| `SendGMMessage` | diffusion GM **via le serveur** | ✅ |
| `GetCompanyList` | liste des compagnies en un appel (le WebClient boucle sur `GetCompanyCount` + `GetCompanyName`/`Id`) | ✅ — équivalent fonctionnel, non bloquant |

**Le cas `SendGMMessage` est un vrai écart de comportement**, pas seulement une absence :
`handleGmChatSend` ([chat-handlers.ts:80-96](../src/server/ws-handlers/chat-handlers.ts#L80-L96))
diffuse le message **localement, entre clients WebSocket de la passerelle**, sans jamais toucher
le serveur Delphi. Un message GM n'atteint donc aucun client Voyager legacy, ni aucun joueur
connecté par une autre passerelle.

---

## 5. Famille D — commandes RDO de façade absentes

| Commande | Déclaration Delphi | Usage Voyager | État WebClient |
|---|---|---|---|
| `RDOEstimateLoan(ClientId: integer) : olevariant` | `StdBlocks/Banks.pas:45` | `BankGeneralSheet.pas:261` — alimente `EstLoan` | **absente** (0 occurrence dans `src/`) |
| `RDOAskLoan(ClientId: integer; Amount: widestring)` sur `TBankBlock` | `StdBlocks/Banks.pas:46` | `BankGeneralSheet.pas:439` — emprunt auprès de la banque *d'un autre joueur* | **absente**. À ne pas confondre avec `TTycoon.RDOAskLoan(AmountStr)` (`Kernel/Kernel.pas:2522`, 1 seul argument) que l'onglet Banque du profil utilise correctement. |
| `RDOGetDemand(finger)` / `RDOGetSupply(finger)` | — | `SrvGeneralSheetForm.pas:411-413`, sondés sur timer | **absentes** |
| `RDOGetWorkers(tier)` | — | `WorkforceSheet.pas`, sondé sur timer | **présente dans les tests et les mocks uniquement** — aucun appel en production (`grep` hors `*.test.ts`/`__tests__`/`mock-server` : 0 résultat) |

Pour `RDOGetDemand`/`RDOGetSupply`/`RDOGetWorkers`, l'inspecteur du WebClient rafraîchit à la place
tout le `GetPropertyList` toutes les *N* ms
([BuildingInspector.tsx:135-153](../src/client/components/building/BuildingInspector.tsx#L135-L153)).
C'est fonctionnellement proche mais plus coûteux et plus latent (les compteurs vivants passent par
le cache, donc au rythme de `StoreToCache`). Écart à acter plutôt qu'à corriger d'urgence.

**Permission `Votes` :** Voyager calcule `fOwnsFacility` mais **ne s'en sert pas** pour verrouiller le
bouton de vote (`VotesSheet.pas`, cf. [voyager-handler-reference.md:849](../doc/voyager-handler-reference.md)).
Vérifier que le WebClient ne l'a pas verrouillé par excès de zèle.

---

## 6. Famille E — sous-systèmes entiers absents

### E-1 · Illegal Business (crime) — **absent en totalité**

Voyager ouvre une **seconde connexion RDO** vers un serveur dédié :
`TWinSockRDOConnection.Create('Illegal Business Component')`, `BindTo(tidRDOHook_IB)`
(`URLHandlers/CrimeHandler.pas:888-898`, 916 lignes).

12 méthodes, toutes absentes de `src/` :

| Méthode | Source |
|---|---|
| `RDOFindLeaderName`, `RDOFindLeader`, `RDOCreateLeader` | `CrimeMainViewer.pas:219,225,305` |
| `RDOGetTeams`, `RDOFindTeam`, `RDOCreateTeam` | `CrimeMainViewer.pas:233,372` · `NewTeamDialog.pas:71` · `TrainingDialog.pas:67` |
| `RDOGetCriminalNames`, `RDOFindCriminal` | `CriminalRosterViewer.pas:107,112` |
| `RDOHireCriminal`, `RDOFireCriminal`, `RDOChangeRole` | `CriminalRosterViewer.pas:177` · `CriminalViewer.pas:290,311` |
| `RDOGetCriminalTrainingInfo`, `RDOCriminalTraining` | `CrimeTrainingDialog.pas:92,237` |
| `RDORecoveryHistoryItem` | `HistoryDialog.pas:61` |

**Décision développeur requise :** ce sous-système est-il dans le périmètre du WebClient ? Il suppose
que le serveur IB tourne encore sur l'infra live. Si non → à marquer explicitement `hors-périmètre`
dans `doc/BACKLOG.md`, pour ne pas le re-découvrir à chaque audit.

### E-2 · Favoris — lecture seule

`RDOFavoritesGetSubItems` est implémenté (parseur dans
[session-utils.ts:22](../src/server/session/session-utils.ts#L22), constantes `FavProtocol.pas` correctes).
Les quatre mutations manquent :

| Méthode | Source |
|---|---|
| `RDOFavoritesNewItem(Location, Kind, Name, Info)` | `ServerCnxHandler.pas:2347` |
| `RDOFavoritesDelItem(Location)` | `:2355` |
| `RDOFavoritesMoveItem(ItemLoc, Dest)` | `:2363` |
| `RDOFavoritesRenameItem(ItemLoc, Name)` | `:2371` |

→ On affiche les favoris, on ne peut **ni en créer, ni en supprimer, ni en renommer, ni en déplacer**.
C'est le plus petit lot à forte valeur d'usage de tout ce document.

### E-3 · News / journal municipal — absent

`townGeneral` expose dans Voyager `NewspaperName` et deux URL ASP :
`Visual/News/boardreader.asp` (noter le maire) et `Visual/News/newsreader.asp` (lire les news)
(cf. [voyager-handler-reference.md:409-413](../doc/voyager-handler-reference.md)).
Aucune occurrence de `boardreader` / `newsreader` dans `src/`. Le transport C (ASP proxifié) existe
déjà pour le courrier et le profil — le coût est faible.

---

## 7. Famille F — câblage WebSocket mort

### F-1 · Types `REQ_*` déclarés sans handler serveur

| Type | État |
|---|---|
| `REQ_TRANSPORT_DATA` | déclaré ([message-types.ts:271](../src/shared/types/message-types.ts#L271)), **absent** de `wsHandlerRegistry`, **jamais émis** par le client. |
| `REQ_SEARCH_MENU_PEOPLE` | déclaré, aucun handler, jamais émis. `REQ_SEARCH_MENU_PEOPLE_SEARCH` (distinct) est, lui, complet. Vestige. |

**`TransportPanel` est un panneau mort** ([TransportPanel.tsx](../src/client/components/transport/TransportPanel.tsx)) :
`transport-store` n'est jamais alimenté que par `RESP_TRANSPORT_DATA`, qu'aucun handler n'émet.
Le panneau affiche donc invariablement « No trains available », et il est accessible depuis
`CommandPalette`, `MobileMenu` et `MobileShell` — soit trois points d'entrée vers du vide.
Violation de `code-guardian` §E (pas d'élément d'UI sans action). Le remplir suppose d'abord de
traiter `ActorPoolModified` (§3).

### F-2 · Handlers serveur implémentés que le client n'appelle jamais

| Type | Handler | Conséquence fonctionnelle |
|---|---|---|
| `REQ_CHAT_TYPING_STATUS` | `handleChatTypingStatus` → `MsgCompositionChanged` | **Asymétrie** : `ChatStrip` *affiche* les « X is typing » reçus ([ChatStrip.tsx:107-110,258](../src/client/components/chat/ChatStrip.tsx#L107-L110)) mais n'émet jamais le sien. Les autres joueurs ne nous voient jamais écrire. |
| `REQ_MAIL_SAVE_DRAFT` | `handleMailSaveDraft` | Onglet « Drafts » présent ([MailPanel.tsx:21](../src/client/components/mail/MailPanel.tsx#L21)) sans aucun moyen d'y écrire. |
| `REQ_MAIL_GET_UNREAD_COUNT` | `handleMailGetUnreadCount` | Badge non-lus alimenté seulement par le push `NewMail` → faux au premier chargement. |
| `REQ_GET_ROAD_COST` | `handleGetRoadCost` | Pas d'estimation de coût avant construction (Voyager l'affiche). |
| `REQ_CHAT_GET_CHANNEL_INFO` | `handleChatGetChannelInfo` | Infos de canal jamais demandées. |
| `REQ_MANAGE_CONSTRUCTION` | `handleManageConstruction` | Non exposé dans l'UI. |
| `REQ_RDO_DIRECT` | `handleRdoDirect` | Outil de debug — normal. |

Six fonctionnalités déjà payées côté serveur, à un appel près.

---

## 8. Tests manquants

Run complet : **222 suites, 4 595 tests, 4 589 PASS, 1 FAIL, 5 skip.**

```
Statements  46.63 %   Branches  39.07 %   Functions  46.90 %   Lines  46.81 %
```

Le plancher machine de `jest.config.js` est à **38 %** global, sans aucun seuil sur `src/server/` ni
`src/client/`. Le réel étant à 46,8 %, il y a **8,8 points de marge à cliquer immédiatement**
(les seuils ne montent jamais que vers le haut — CLAUDE.md).

### 8.0 Le déséquilibre central : protocole vs sites d'appel

Le chiffre global ci-dessus mélange le rendu, les composants et le protocole. Découpé, il dit
tout autre chose :

| Couche | Couverture lignes |
|---|---|
| **Protocole RDO** — encodage, framing, garde-fous, classifieur d'erreurs | **87,4 %** (726/831) |
| **Sites d'appel RDO** — les handlers qui *construisent* les commandes | **35,6 %** (1 370/3 844) |

Couche protocole, détail : `rdo.ts` 97,4 % · `rdo-types.ts` 96,8 % · `rdo-helpers.ts` 90,1 % ·
`rdo-request-guards.ts`, `rdo-error-contract.ts`, `rdo-error-classifier.ts`, `cp1252.ts`,
`timeout-categories.ts`, `session-utils.ts` à 100 % · `tools/conformance/` 98,5 %.
Deux creux : **`error-codes.ts` 51,7 %** et **`rdo-connection-pool.ts` 61,5 %** — ce dernier étant
le sujet de la branche courante `fix/rdo-pool-lifecycle-timeouts-probe`.

Sites d'appel, détail : `profile-finance-handler.ts` 3,7 % · `auto-connection-handler.ts` 5,5 % ·
`road-handler.ts` 7,0 % · `zone-surface-handler.ts` 9,3 % · `building-details-handler.ts` 10,4 % ·
`mail-handler.ts` 11,7 % · `research-handler.ts` 12,5 % · `building-templates-handler.ts` 16,6 % ·
`building-property-handler.ts` 27,3 % · `politics-handler.ts` 27,7 % · `push-dispatcher.ts` 27,7 % ·
`chat-handler.ts` 54,0 % · `building-management-handler.ts` 57,8 % · `spo_session.ts` 60,1 % ·
`login-handler.ts` 76,4 %.

**La forme des tests confirme le déséquilibre.** Sur 45 fichiers de test RDO
(`__tests__/rdo/`, `__tests__/protocol-validation/`, `__tests__/matchers/`) :
**21 construisent la trame en local** (`RdoProtocol.format()` / `RdoCommand.sel()`) contre
**16 qui pilotent du code de production** (`harness.session.*`, appel direct de handler).

Conséquence à retenir : la suite de conformité prouve que les trames émises sont **bien formées** ;
presque rien ne prouve qu'on émet les **bonnes**. Les trois matrices qui portent tout le risque de
cible et de séparateur — `RDO_OBJECTID_COMMANDS`, `SYNCHRONOUS_RDO_COMMANDS`, `RDO_SET_PROPERTIES`
([building-property-handler.ts:136-172](../src/server/session/building-property-handler.ts#L136-L172))
— vivent dans un fichier à 27 %. C'est ce trou-là qui a laissé passer `Comercials` (§2).

### 8.1 Couverture par répertoire (lignes)

| Couverture | Lignes | Répertoire | Commentaire |
|---|---|---|---|
| **0 %** | 720 | `server/server.ts` | point d'entrée passerelle, auth WS, routage |
| **0 %** | 529 | `client/client.ts` | orchestrateur client |
| **18,5 %** | 595 | `server/ws-handlers/` | **toute la couche de routage WS** |
| **20,3 %** | 1 488 | `client/handlers/` | |
| **23,0 %** | 248 | `client/bridge/` | |
| **31,4 %** | 3 042 | `server/session/` | **le cœur RDO applicatif** |
| **32,7 %** | 171 | `client/hooks/` | |
| **38,3 %** | 4 763 | `client/renderer/` | dont `isometric-map-renderer.ts` à 5,45 % / 2 402 lignes |
| **48,1 %** | 3 581 | `client/components/` | |
| 79,5 % | 322 | `client/store/` | |
| 95,1 % | 244 | `shared/building-details/` | conforme au seuil 92 % |
| 98,5 % | 845 | `tools/conformance/` | exemplaire |

### 8.2 Fichiers critiques les moins couverts

| Couv. | Lignes | Fichier | Pourquoi c'est grave |
|---|---|---|---|
| 3,71 % | 269 | `session/profile-finance-handler.ts` | `executeBankAction` — **mutations d'argent réel** (`RDOAskLoan`, `RDOSendMoney`, `RDOPayOff`) quasi non testées |
| 5,45 % | 165 | `session/auto-connection-handler.ts` | auto-connexions + politique commerciale |
| 6,97 % | 129 | `session/road-handler.ts` | `CreateCircuitSeg` / `BreakCircuitAt` / `WipeCircuit` |
| 7,67 % | 430 | `client/handlers/building-action-handler.ts` | toutes les actions d'inspecteur |
| 10,35 % | 541 | `session/building-details-handler.ts` | `SetPath`, `GetPropertyList`, fingers |
| 11,72 % | 145 | `session/mail-handler.ts` | |
| 16,59 % | 235 | `session/building-templates-handler.ts` | |
| 24,77 % | 113 | `ws-handlers/building-handlers.ts` | |
| **27,30 %** | 271 | `session/building-property-handler.ts` | **le goulot de toutes les mutations de bâtiment** — matrices `RDO_OBJECTID_COMMANDS`, `SYNCHRONOUS_RDO_COMMANDS`, `RDO_SET_PROPERTIES`, séparateurs |
| **27,74 %** | 155 | `session/push-dispatcher.ts` | **le point d'entrée de tous les pushes serveur** |
| 27,71 % | 166 | `session/politics-handler.ts` | |

`building-property-handler.ts` et `push-dispatcher.ts` sont les deux fichiers où un défaut se paie en
divergence de trame ou en push perdu. À 27 %, ils sont les moins bien protégés du dépôt au regard
de leur criticité.

### 8.3 Classes de tests absentes

1. **Aucun test ne valide les noms de propriétés contre le Delphi.**
   `rdo-command-coverage.test.ts` garde le vocabulaire de *commandes* (UI ↔ `KNOWN_RDO_COMMANDS`) —
   c'est bien fait, mais rien n'équivaut pour les `rdoName`. C'est exactement le trou par lequel
   A-1…A-4 sont passés. **Test à écrire :** extraire les `Cache.Write*('X', …)` de `StdBlocks/*.pas`
   et les `published property` des blocs, en faire une fixture, et vérifier que chaque `rdoName` de
   `template-groups.ts` y figure — avec la bonne source (cache vs GET direct).

2. **Pas de test d'exhaustivité du dispatcher de push.** Rien ne compare les 24 méthodes de
   `TISEvents` (`ServerCnxHandler.pas:476-504`) aux membres traités. Un test-liste rendrait la
   famille B visible en CI.

3. **Pas de test « pas de type WS orphelin ».** Les 9 écarts du §7 se détectent en trois lignes :
   comparer les `REQ_*` de `message-types.ts` aux clés de `wsHandlerRegistry` **et** aux émissions
   dans `src/client/`. Un test d'inventaire avec liste d'exemptions explicite (`REQ_RDO_DIRECT`).

4. **Tests tautologiques.** `profile-tabs.validation.test.ts:61-79` construit une commande
   `RDOAskLoan` avec `RdoProtocol.format()` puis vérifie… le résultat de `RdoProtocol.format()`.
   Il ne touche à aucun code de production (`RDOAskLoan` n'apparaît nulle part hors tests). Ces tests
   gonflent le compteur sans rien garder. À réécrire pour partir de `executeBankAction()`.

5. **`client/handlers/` (1 488 lignes, 20 %)** — `build-menu-handler.ts`, `map-handler.ts`,
   `road-handler.ts` sont à **0 %**. Ce sont les traducteurs geste-utilisateur → message WS.

6. **1 test en échec sous instrumentation :**
   `protocol-validation/auth.validation.test.ts:51` dépasse le timeout de 10 s (91 s observées).
   Vert hors couverture — donc soit un test trop lent à borner, soit une fuite de timer
   (Jest signale « open handles » sur ce run). À traiter avant de brancher la couverture en CI.

---

## 9. Lots proposés, par rapport valeur/coût

| Lot | Contenu | Coût | Effet |
|---|---|---|---|
| **L1** | Corriger A-1…A-4 : source `directGet` pour `HoursOnAir`/`Commercials`/`BudgetPerc`/`Interest`/`Term`, `RDOEstimateLoan` pour `EstLoan`, orthographe `Commercials` à l'écriture | S | 2 onglets d'inspecteur passent de faux à justes |
| **L2** | Les 3 tests d'inventaire du §8.3 (1, 2, 3) | S | rend A, B et F **impossibles à réintroduire** |
| **L3** | Câbler les 6 handlers orphelins du §7 F-2 (typing, brouillons, non-lus, coût route, infos canal, construction) | S | 6 fonctions livrées côté serveur, activées côté client |
| **L4** | Favoris CRUD (E-2) — 4 méthodes, protocole déjà décodé | S/M | supprime la principale frustration d'usage |
| **L5** | Couvrir `building-property-handler.ts` + `push-dispatcher.ts` à ≥ 80 %, puis monter le plancher global de 38 % à 46 % | M | protège les deux fichiers les plus critiques |
| **L6** | `ActorPoolModified` + `REQ_TRANSPORT_DATA` → panneau Transport réel (ou retrait du panneau et de ses 3 points d'entrée) | M/L | supprime une violation `code-guardian` §E |
| **L7** | `SendGMMessage` réel (§4) | S | les messages GM atteignent enfin les clients legacy |
| **L8** | Arbitrage périmètre : Illegal Business (E-1), News (E-3), Voice (B) — décider et inscrire dans `BACKLOG.md` | — | arrête de repayer l'audit |

---

## 10. Décisions développeur attendues

1. **Illegal Business** — dans le périmètre ou non ? Le serveur IB tourne-t-il encore sur l'infra live ?
2. **Chat vocal** (`VoiceMsg`, `VoiceRequestGranted`, `VoiceThis`, …) — abandonné définitivement ?
3. **Panneau Transport** — implémenter `ActorPoolModified`, ou retirer le panneau ?
4. **Plancher de couverture** — d'accord pour passer le global de 38 % à 46 % dès maintenant, et
   ajouter des seuils par répertoire sur `src/server/session/` et `src/server/ws-handlers/` ?

---

**Compétences employées :** `delphi-archaeologist` (traçage `StdBlocks/Broadcast.pas`, `StdBlocks/Banks.pas`,
`Kernel/Kernel.pas`, `Voyager/URLHandlers/*`), `rdo-conformity` (hiérarchie de preuve, matrice des
séparateurs), `spo-testing` (deux nombres de couverture, ratchet), `code-guardian` (§E éléments d'UI
sans action).
