# Couverture de test RDO à 100 % — rapport de mission

**Mission :** [doc/prompts/rdo-test-coverage-mission.md](../doc/prompts/rdo-test-coverage-mission.md)
· **Plan :** [plan-couverture-rdo-100.md](plan-couverture-rdo-100.md)
· **Motivation :** [analyse-ecarts-voyager-2026-08-16.md](analyse-ecarts-voyager-2026-08-16.md) §8

**Exécution :** 2026-08-17, sept sessions (lots 0 à 6), une par lot, points d'étape entre chacune.
**État :** **mission terminée.** Lots 0 à 6 faits, rapport complet.

> **Sections 1 à 5** avaient été pré-remplies à partir des comptes rendus de lot. Le lot 6 les a
> **vérifiées par un run complet à lui** (`npx jest --coverage`, 2026-08-17) : deux valeurs de
> branches corrigées, tout le reste confirmé au chiffre près. Détail des écarts en §6.

**Run de référence du lot 6** — `npx jest --coverage`, 2026-08-17, sortie 0 :
**239 suites (238 passées, 1 sautée) · 6 016 tests (6 011 passés, 5 sautés)** ·
lignes **58,49 %** · statements 57,97 % · branches 54,24 % · fonctions 53,50 %.
L'échec connu de `auth.validation.test.ts:51` sous instrumentation **ne s'est pas produit** sur ce
run (167 s au total) ; il reste à surveiller, voir §9.

---

## 1. Couverture avant / après — les 21 fichiers du périmètre

Toutes les mesures sont **en pleine suite** (`npx jest --coverage`). La mesure par fichier isolé
donne des valeurs très inférieures — plusieurs fichiers sont couverts incidemment par d'autres
suites (constaté au lot 3 : `building-management` 20,7 % isolé contre 57,75 % en pleine suite).

### Lot 1 — couche protocole

| Fichier | Lignes | Fonctions | Branches | Statements |
|---|---|---|---|---|
| `session/rdo-connection-pool.ts` | 61,53 → **100** (117/117) | 58,62 → **100** | 46,34 → 97,56 (40/41) | 57,36 → **100** |
| `shared/proxy-utils.ts` | 25 → **100** (16/16) | 0 → **100** (3/3) | 0 → **100** (9/9) | 25 → **100** |
| `shared/error-codes.ts` | 51,68 → **100** (89/89) | 100 → 100 | 2,27 → **100** (44/44) | 51,68 → **100** |
| `server/rdo-helpers.ts` | 90,14 → **100** (71/71) | 100 → 100 | 89,18 → **100** (37/37) | 90,41 → **100** |
| `shared/rdo-types.ts` *(protégé)* | 96,81 → 99,36 (156/157) | 100 → 100 | 89,55 → 98,50 (66/67) | 96,83 → 99,36 |
| `server/rdo.ts` *(protégé)* | 97,44 → 98,97 (194/196) | 100 → 100 | 90,96 → 98,70 (153/155) | 97,52 → 99,00 |

Les deux fichiers qui n'atteignent pas 100 % sont les deux fichiers **protégés** : il n'y reste que
du code mort, ni couvrable ni annotable sans modifier la production (§4).

### Lot 2 — le cœur du risque de trame

| Fichier | Lignes | Fonctions | Branches | Statements |
|---|---|---|---|---|
| `session/push-dispatcher.ts` | 27,74 → **100** (155/155) | 50 → **100** | 15,87 → **100** (126/126) | 27,56 → **100** |
| `session/building-property-handler.ts` | 27,30 → 99,63 (270/271) | 72,72 → **100** | 13,87 → 98,77 (242/245) | 27,69 → 99,64 |

### Lot 3 — handlers de bâtiment

| Fichier | Lignes | Fonctions | Branches | Statements |
|---|---|---|---|---|
| `session/building-management-handler.ts` | 57,75 → **100** (116/116) | 69,2 → **100** (13/13) | ~34 → 98,27 (57/58) | → **100** (121/121) |
| `session/building-templates-handler.ts` | 16,59 → **100** (235/235) | 20 → **100** (10/10) | 7,24 → 97,82 (135/138) | → **100** |
| `session/building-details-handler.ts` | 10,35 → 99,81 (540/541) | 23,5 → **100** (68/68) | 2 → 99,23 (389/392) | → 99,83 (593/594) |

### Lot 4 — handlers de domaine

| Fichier | Lignes avant | L / F / S / B après |
|---|---|---|
| `session/zone-surface-handler.ts` | 9,25 % | 100 / 100 / 100 / 100 |
| `session/research-handler.ts` | 12,50 % | 100 / 100 / 100 / 100 |
| `session/chat-handler.ts` | 53,96 % | 100 / 100 / 100 / 100 |
| `session/road-handler.ts` | 6,97 % | 100 / 100 / 100 / 95,23 |
| `session/mail-handler.ts` | 11,72 % | 100 / 100 / 100 / 100 |
| `session/politics-handler.ts` | 27,71 % | 100 / 100 / 100 / 100 |
| `session/auto-connection-handler.ts` | 5,45 % | 100 / 100 / 100 / **99,42** (174/175) |
| `session/profile-finance-handler.ts` | 3,71 % | 100 / 100 / 99,65 / **98,57** (207/210) |

*(Deux valeurs de branches corrigées par le run du lot 6 : le compte rendu du lot 4 annonçait 99,41
et 98,55. Écart de rapportage, pas de régression — les compteurs couverts/total sont inchangés.)*

### Lot 5 — session

| Fichier | Lignes | Fonctions | Branches | Statements |
|---|---|---|---|---|
| `session/login-handler.ts` | 76,38 → **100** | 69,23 → **100** | 57,06 → 98,91 | 75,59 → **100** |
| `server/spo_session.ts` *(protégé)* | 60,12 → **100** | 49,38 → **100** | 46,61 → 98,56 | 58,79 → 99,91 |

### Les 9 fichiers déjà à 100 % — non-régression

`timeout-categories.ts` · `cp1252.ts` · `rdo-error-classifier.ts` · `rdo-error-contract.ts` ·
`rdo-request-guards.ts` · `session-utils.ts` · `construction-lock.ts` ·
`property-fallback-census.ts` · `diagnostics-readouts.ts`
→ relancés à chaque fin de lot, **tous encore à 100 % sur les quatre métriques**.

---

## 2. Tests ajoutés, par lot

| Lot | Tests | Détail |
|---|---|---|
| 0-1 | **244** | helper 20 · pool +29 · proxy-utils 16 · error-codes 98 · rdo-helpers +29 · rdo.ts +24 · rdo-types +28 |
| 2 | **244** | push-dispatcher 78 · building-property 166 (dont une matrice `it.each` de **42** entrées — le plan en annonçait 41) |
| 3 | **232 nets** | management 46 · templates 52 · details +134 · **−7 supprimés** (voir ci-dessous) |
| 4 | **357 nouveaux** (369 au total) | zone-surface 18 · research 18 · chat 34 · road 44 · mail 60 · politics 62 (12 existants + 50) · auto-connection 62 · profile-finance 71 |
| 5 | **320** | login-handler 84 · spo-session-surface 112 · spo-session-lifecycle 118 · helper +6 |
| 6 | **24** | `capability-inventory.test.ts` — 5 contrôles, **aucune couverture ajoutée** (§8) |

**Suite complète : 4 595 → 6 011 tests passés · 222 → 238 suites passées · couverture globale
46,81 % → 58,49 % lignes.** `src/server/session/` est passé de 31,4 % à
**99,93 % lignes (3 050/3 052) / 100 % fonctions / 99,04 % branches / 99,91 % statements**.

> Précision de comptage vérifiée au lot 6 : les chiffres ci-dessus sont des **tests passés**. Le
> total inclut 5 tests et 1 suite sautés — soit **6 016 tests / 239 suites** au compteur brut.
> Avant le lot 6 : 5 987 passés / 5 992 au total.

**7 tests supprimés au lot 3, à dessein :** le bloc `filterByGateMap` de
`building-details-handler.test.ts` réimplémentait le filtre en local puis l'assertait — l'anti-patron
que le §6 du prompt interdit. Les mêmes cas, dont le GateMap réel d'Import Storage (bits 0/11/24),
sont désormais pilotés à travers `getBuildingTabData`. Décision validée en revue de lot.

**Un helper partagé créé**, seul fichier non-test autorisé :
`src/server/__tests__/session/fake-session-context.ts` — `makeSessionCtx`, `makePushCtx`,
`makeLoginCtx`, `FAKE_CONTEXT_IDS`, plus son propre fichier de test.

---

## 3. Bugs trouvés

La couverture était le proxy ; **ces trouvailles étaient la cible**. Celles qui portent une référence
`A-n` sont consignées dans [analyse-ecarts-voyager-2026-08-16.md](analyse-ecarts-voyager-2026-08-16.md) §2.

### Corrigés pendant la mission

| Réf | Fichier:ligne | Effet |
|---|---|---|
| **A-9** | `profile-finance-handler.ts:499` · `auto-connection-handler.ts:233, :349` · `politics-handler.ts:357, :383` | `response.status` jamais lu sur 5 sites de mutation. Une page 500 renvoyait `{ success: true }` — **y compris sur `executeBankAction`, donc sur de l'argent réel** (borrow / send / payoff), avec un solde affiché resté périmé. **Corrigé le 2026-08-17** hors mission, garde `if (!resp.ok)` alignée sur le modèle existant `executeCurriculumAction` (`:466`). Les 4 tests qui figeaient le défaut sont devenus des garde-fous. |

### Ouverts — divergences de trame ou de cible

| Réf | Fichier:ligne | Effet |
|---|---|---|
| **A-2** | `template-groups.ts:314` | Écrit `Comercials` (un « m ») ; la propriété publiée Delphi est `Commercials` (`StdBlocks/Broadcast.pas:53`). Le réglage publicité d'une TV ne part jamais. `it.failing` posé. |
| **A-5** | `template-groups.ts:630` | `RDOAutoRelease` **n'existe dans aucun `.pas`** du legacy. Le studio publie 4 membres (`StdBlocks/MovieStudios.pas:104-107`) ; l'auto-release voyage dans le bitmask `AutoInfo` de `RDOLaunchMovie`. Défaut **depuis l'intérieur de `KNOWN_RDO_COMMANDS`**. |
| **A-6** | `building-property-handler.ts:150-154` | `RDOSetInputSortMode` et `RDOSelSelected` partent sur `CurrBlock` ; Voyager fait un `BindTo(ObjectId)` explicite (`SupplySheetForm.pas`). Écart visible sur les entrepôts uniquement. **Question ouverte :** lequel des deux ObjectId (façade ou porte). |
| — | `building-property-handler.ts` (matrice) | `RDOSetBuyingStatus` : aucune déclaration serveur trouvée ; seul appelant legacy `SupplySheetForm.pas:728-741`, où `ObjId` est déclaré et **jamais assigné**. `[UNKNOWN]`, sonde live requise. |

### Ouverts — succès rapportés sans preuve

| Réf | Fichier:ligne | Effet |
|---|---|---|
| **A-10** | `spo_session.ts:1475-1477` *(protégé)* | `cacherGetPropertyList` : la branche de repli détruit l'alignement positionnel que son propre commentaire (`:1464`) déclare critique. Un `[]` serait moins nocif. **Tout le chemin de lecture de l'inspecteur** y passe. |
| — | `building-property-handler.ts:259` | `success: true` inconditionnel même quand `confirmed === false`. (M-E, le réécho de la valeur demandée, est corrigé par ailleurs.) |
| — | `auto-connection-handler.ts:233` etc. | *voir A-9, corrigé.* |

### Ouverts — code mort et chemins injoignables

| Réf | Fichier:ligne | Effet |
|---|---|---|
| **A-8** | `building-details-handler.ts:923-953` | `enrichVotesTab` exige `CurrBlock`, présent seulement dans `GENERIC_GROUP`, dont le template n'a pas d'onglet `votes`. **`RDOVoteOf` n'est jamais émis** : l'onglet Votes n'affiche jamais le vote du joueur. |
| **A-7** | `building-details-handler.ts:1492-1505` | Le commentaire promet que `batchedParallel` est gardé par le sémaphore. Il ne l'est pas : jusqu'à 9 requêtes en vol contre `MAX_GLOBAL_CONCURRENT_RDO = 4`. **Dette de doc associée :** `rdo-session-lifecycle.md` §9 D2 justifie sa borne par une constante Delphi `MAX_BUFFER_SIZE=5` **qui n'existe pas** — à reclasser `[UNKNOWN]`. |
| — | `rdo.ts:267-276, :314-315` *(protégé)* | Deux blocs morts : les « versions quotées » refont les `indexOf` déjà tentés ; le `else if (packet.payload)` de `parseCommand` pousse dans un tableau d'entrée sans effet sur le retour. |
| — | `login-handler.ts:860-891` → `:489` | `realContextId` est parsé (URL de redirection ou corps) puis **jeté** : `loginWorld` ne déstructure que `{ companies }`. Soit la valeur compte, soit le parsing est du poids mort. |
| — | `building-details-handler.ts:283-287` | `getWarehouseWareNames` avale toutes les erreurs et rend `[]`. Catch mort. |

### Ouverts — défauts silencieux et messages faux

| Fichier:ligne | Effet |
|---|---|
| `rdo-helpers.ts:247-255` | `parseIdOfResponse('objid=""')` rend la chaîne `objid=`, que `RdoCommand.sel()` accepte (non vide, ≠ `'0'`). Un id vide peut atteindre la trame. Le cas symétrique (payload vide) lève, lui. |
| `mail-handler.ts:301-304` | `readMailMessage` : `msgId` vide après `OpenMessage` non gardé → `GetHeaders`/`GetLines`/`GetAttachmentCount` partent sur une cible `''`, et le `CloseMessage` du `finally` meurt sur `RdoValue.int(NaN)`, avalé en warning : **rien n'est libéré côté serveur**. |
| `mail-handler.ts:391` | `deleteMailMessage` : id vide → trame émise quand même. |
| `building-property-handler.ts` (matrice) | Défauts d'identifiants silencieux : `RDOBanMinister` sans `ministryId` bannit le ministère 0 ; idem `RDOSitMinister`/`RDOSitMayor`/`RDOVote` (nom vide), `RDOSetTaxValue` (taxe 0). Contraste avec `RDOSetSalaries`, qui refuse. |
| `building-management-handler.ts:238` | `upgradeBuildingAction` interpole le `count` brut dans le message alors que la trame utilise `count \|\| 1` : « Upgrade started (undefined levels) » pour un upgrade correct. |
| `building-management-handler.ts:26-30` | `parseBooleanCacheValue` n'accepte que `1`/`-1`/`true` : tout autre ordinal non nul est lu faux, contre la règle « tout ordinal non nul est vrai ». Insensible aux préfixes (`#1` lu faux). Latent — `TObjectCache.WriteBoolean` n'écrit que 1/0 (`Cache/CacheAgent.pas:143-153`). |
| `building-templates-handler.ts:225` | La regex `ref=(["']?)…\1` prétend accepter un `ref` non quoté ; `[^"']*` déborde alors du `>` et la ligne est silencieusement jetée. |
| `profile-finance-handler.ts:100` | `parseCurriculumHtml` : la regex exige `class=value` non précédé de `<tag` → un `<span class=value>` bien formé ne matche jamais. `prestige`, `facPrestige`, `researchPrestige`, `area`, `nobPoints` restent à 0. `it.failing`, `[INFERRED]`. |
| `profile-finance-handler.ts:564` | `ChartInfo` cherché sur 500 caractères **vers l'avant** → le graphique de la ligne suivante fuit sur la précédente. |
| `push-dispatcher.ts` | Un membre inconnu **n'est pas journalisé** — il est relayé brut en `EVENT_RDO_PUSH`. Rien n'est perdu, rien n'est visible : une régression serveur passerait inaperçue. |
| `spo_session.ts:2829` *(protégé)* | `loggedOff` n'est ré-armé que par `cleanupWorldSession` : ni `switchCompany` ni `loginWorld` ne le remettent à `false`. Une session revenue par `switchCompany` après un `endSession()` a un socket monde dont la fermeture ne déclenchera jamais l'auto-reconnexion. Latent. |
| `login-handler.ts` (`connectDirectory`) | Quand `RDOOpenSession` répond vide, `RdoCommand.sel('')` jette : bon comportement (aucune trame à pointeur nul), mais l'erreur remontée est un message d'encodeur, pas « le directory n'a pas ouvert de session ». |

### Ouverts — violations de convention

| Fichier:ligne | Effet |
|---|---|
| `road-handler.ts:182-190, 339-344, 411-418` | Arguments `#N` construits par template string au lieu de `RdoValue.int()`. Octets identiques, mais viole « never construct RDO strings manually » (CLAUDE.md). |
| `chat-handler.ts:125, :147` | Séparateur `'^'` non quoté (déjà signalé `WARN` dans la source). |
| `building-property-handler.ts` (commentaire) | Cite `Kernel.pas:1304` pour `RDOAcceptCloning` ; la déclaration réelle est **`Kernel.pas:1347`**. Affirmation juste, ligne périmée. |
| `mail-handler.ts:9-10` (commentaire) | Annonce `AddLine`/`CloseMessage` en `"^"` ; le code émet `"*"` (correct). Doc périmée. |
| `rdo-helpers.test.ts:293-301` | Dette **pré-existante** : `expect('' !== 'error').toBe(true)` — ne touche aucun code de production. Exactement l'anti-patron du §6. Laissée en l'état (hors périmètre). |
| `building-mutations.test.ts` | Dette : pas de fake timers, ses 5 mutations paient 200 ms chacune. |
| `mail-handler-emission.test.ts` | Dette : `write: () => true` — jette les trames, donc aveugle au canal fire-and-forget `"*"`. |

### Ce que le lot 6 a ajouté — et ce qu'il n'a pas trouvé

**Le résultat honnête : l'inventaire n'a découvert aucun défaut que les six lots avaient manqué.**
Sur ses cinq contrôles, quatre sont sortis verts du premier coup avec des exemptions qui pointent
toutes vers des écarts **déjà consignés** (A-6, A-8, analyse §7 F-1/F-2). C'est la mesure réelle de
sa valeur : il ne trouve rien de neuf parce qu'il n'y avait plus rien à trouver dans son périmètre
dérivable. Ce qu'il apporte est le **cliquet** — la garantie que ces écarts ne peuvent pas se
multiplier en silence.

Trois choses qu'il a tout de même établies, et qui n'existaient nulle part :

| Point | Effet |
|---|---|
| **Le contrôle 3 du prompt était faux** | Il exigeait « aucun `"^"` » sur `CONNECTION_BOUND_MEMBERS`. `RDOCnntId` est une **lecture** : `"^"` est sa forme correcte et celle du client de référence. Appliquer la règle telle qu'écrite aurait cassé la trame. L'invariant réel est la socket, pas le séparateur — voir §8.3. |
| **22 membres RDO sont hors de toute couverture live** | Ni dans les 13 suites de conformité, ni dans les 78 lignes de la matrice de mutation. Dont `RDOSearchKey` (P-M1, OLEString obligatoire) et trois membres dont la forme attendue n'est même pas établie. Lignes prêtes en §7. |
| **`RDOCacncelTransc` n'est pas notre faute de frappe** | Vérifié : `procedure RDOCacncelTransc` — `StdBlocks/TranscendBlock.pas:50`. La faute est celle du Delphi original et notre reprise verbatim est **correcte**. À ne pas « corriger » : contrairement à `Comercials` (A-2), où c'est nous qui divergeons de la propriété publiée. |

**Une exemption datée du 2026-08-16 périmée ? Aucune.** Les 9 exemptions `REQ_*` du §7 de l'analyse
d'écarts ont été re-dérivées contre le code du 2026-08-17 et sont toutes exactes, ni en trop ni en
moins. Le décompte des pushes du lot 2 (24 / 15 / 2 en amont / 6 famille B / 2 hors `TISEvents`)
tient également.

### Divergences avec `doc/rdo-session-lifecycle.md`

| Point | État |
|---|---|
| **Nouvelle, non consignée** | `switchCompany` (`login-handler.ts:727-739`) détruit la session monde **sans la séquence §4.4** (`ClientNotAware` → `get Logoff` 5 s → close). Le serveur nettoie au disconnect et O-H1 dit que `TInterfaceServer.Logoff` fuit le ClientView de toute façon — donc probablement sans conséquence, **mais c'est une décision à arbitrer, pas un état de fait documenté**. |
| §4.1 | Le `Logoff` préventif à 5 s avant un `Logon` frais (`ServerCnxHandler.pas:1027, :2730`) n'est fait nulle part dans le WebClient. Même famille. |
| §9 D2 | Justifie sa borne par `MAX_BUFFER_SIZE=5` côté Delphi — **constante inexistante**. À reclasser `[UNKNOWN]` ou à sourcer. Voir A-7. |
| §9 D4 | Dit « lit `DAPort` au lieu de `DSArea` » ; le code lit `DAPort` **et** `DALockPort` (10 GETs, cohérent avec §4.1). Cosmétique. |
| §9 D1, D3 | Vérifiés et épinglés, **conformes** (`RDOEndSession` sans RID ; 3 rapides + 20 lentes = 23). |

---

## 4. Branches et lignes déclarées inatteignables

**Aucune n'est masquée** : voir §5.

| Fichier:ligne | Raison |
|---|---|
| `rdo-connection-pool.ts:263` | `if (!connected)` du timer de connexion : `clearTimeout` est appelé dans le callback de `connect`, le timer ne peut jamais tirer avec `connected === true`. Garde défensive. |
| `rdo-types.ts:473-474` *(protégé)* | `default:` du switch sur les 7 préfixes : `RdoParser.extract` ne renvoie qu'une valeur de `Object.values(RdoTypePrefix)`, et les 7 ont un `case`. Switch exhaustif. |
| `rdo.ts:284-289` *(protégé)* | Branche « séparateur non quoté » : `METHOD_SEPARATOR`/`PUSH_SEPARATOR` valent déjà `"^"`/`"*"` guillemets compris. Corollaire : `:267-276` sont morts aussi. |
| `rdo.ts:314-315` *(protégé)* | `else if (packet.payload)` de `parseCommand` : `packet` est construit sans payload et `parts` est le tableau d'entrée. Copié-collé de `format()`. |
| `building-property-handler.ts:193` | Bras `: currBlock` mort — `SYNCHRONOUS_RDO_COMMANDS ⊂ RDO_OBJECTID_COMMANDS`. Assertion posée pour qu'il redevienne vivant visiblement. |
| `building-property-handler.ts:716-722` | `if (fluidId) return 'PricePc'; return 'PricePc';` — les deux bras rendent la même valeur, et `buildRdoCommandArgs:385-388` jette sans `fluidId`. Supprimer le `if` mettrait le fichier à 100 % statements. |
| `building-property-handler.ts:797` | `\|\| rdoCommand` : atteindre `case 'property'` suppose d'être passé par `:182`, qui exige `additionalParams.propertyName` non vide. |
| `building-management-handler.ts:242` | `result.error \|\| 'Operation failed'` : tout retour ERROR porte un `error`. |
| `building-templates-handler.ts:264` | `urlParams.get('Kind') \|\| ''` — gardé par `if (kindName && urlParams.get('Kind'))`. |
| `building-templates-handler.ts:392, :425` | `if (cellAnchor >= 0)` : la chaîne `Cell_<n>` est celle qui a produit `n` par regex, `indexOf` ne peut pas rendre −1. |
| `building-details-handler.ts:286` | Catch mort (voir §3). Seule ligne non couverte du fichier. |
| `building-details-handler.ts:769` | `indexedByCount.get(countProp) \|\| []` — clé présente par construction. |
| `building-details-handler.ts:1276, :1459` | `cnxProps[0] \|\| ''` — `cleanPayload` fait `trim()`, la première colonne tabulée ne peut être vide. |
| `road-handler.ts:77` | `else if (remainingY > 0)` faux impossible : la condition de boucle et `moveX` faux impliquent `remainingY > 0`. |
| `road-handler.ts:248-249` | Fallbacks exigeant 0 segment, refusé en amont (`:117`). |
| `auto-connection-handler.ts:287` | `?? 1` : la regex `[ANE]/i` garantit une clé du map. |
| `profile-finance-handler.ts:205` | `if (nextMatch)` faux : ré-exécution de la même regex sur sa propre correspondance. |
| `profile-finance-handler.ts:282` | `\|\| 'Unknown'` : `level = min(licenceLevel, 6)`, `levelNames[level]` toujours défini. |
| `profile-finance-handler.ts:603` | `parent.children = []` — tout nœud est créé avec `children: []` (`:548`, `:580`). Code mort. |
| `spo_session.ts:2054` *(protégé)* | `if (!request) break;` : la condition `while` garantit `length > 0` et il n'y a aucun `await` avant le `shift()`. **1 statement + 1 branche** — le seul statement non couvert du lot 5. |
| `spo_session.ts:2312-2314` *(protégé)* | `&& !this.isClosing` : `sendRdoRequest` rejette avant d'atteindre `executeRdoRequest`. |
| `spo_session.ts:2396` *(protégé)* | `if (entry && entry.state === 'pending')` (branche fausse) : tout chemin qui supprime ou transitionne appelle `clearTimeout` d'abord. |
| `spo_session.ts:2523` *(protégé)* | `entry.member ?? 'unknown'` : déjà défauté à `'unknown'` en `:2390`. |
| `spo_session.ts:2545, :2550, :2567` *(protégé)* | `(raw \|\| '')` : `raw` vient de `RdoFramer.ingest`, qui ne produit jamais de chaîne vide. |
| `login-handler.ts:809, :817` | `if (ctx.currentWorldInfo)` : `loginWorld` vient d'assigner `setCurrentWorldInfo(world)` trois instructions plus haut, avec son propre paramètre non-null. |

**Lecture d'ensemble :** une part notable de ces « inatteignables » est du **code mort réel**, pas de
la garde défensive — `rdo.ts:267-276`, `building-property-handler.ts:716-722`,
`profile-finance-handler.ts:603`, `spo_session.ts:2054`. C'est une trouvaille en soi.

**Lot 6 : aucune ligne ajoutée à ce tableau.** Le test d'inventaire n'exécute aucun chemin de
production, donc il ne rencontre aucune branche. La liste ci-dessus est close.

---

## 5. `/* istanbul ignore */` posés

**Aucun. 0 sur un budget de 10, sur l'ensemble des six lots.**

Chaque zone non couvrable a été **déclarée au rapport** avec sa raison plutôt que masquée — c'était
la consigne (§7 du prompt) et elle a tenu de bout en bout. C'est ce qui rend le §4 exploitable :
la liste des inatteignables est une liste de trouvailles, pas une liste d'exemptions.

---

## 6. Couverture globale et seuils `jest.config.js`

### 6.1 Mesure finale — run du lot 6, 2026-08-17

| Périmètre | Lignes | Fonctions | Branches | Statements |
|---|---|---|---|---|
| **Global** | **58,49 %** (13 002/22 227) | 53,50 % (2 223/4 155) | 54,24 % (7 041/12 981) | 57,97 % (14 121/24 355) |
| `src/server/session/` | **99,93 %** (3 050/3 052) | **100 %** | 99,04 % | 99,91 % |
| `src/server/` | 76,25 % (5 512/7 229) | 72,69 % | 80,18 % | 76,42 % |
| `src/shared/` | 94,50 % (1 134/1 200) | 91,48 % | 82,98 % | 93,80 % |
| `src/shared/building-details/` | 97,13 % | 100 % | 89,06 % | 96,23 % |
| `src/shared/types/` | 100 % (276/276) | 89,66 % | 96,43 % | 100 % |
| `src/tools/` | 98,47 % | 95,93 % | 92,44 % | 97,39 % |
| `src/client/` | 39,39 % (4 696/11 923) | 38,38 % | 32,44 % | 39,13 % |

Départ 2026-08-16 : 46,81 % lignes global, `src/server/session/` 31,4 %.

### 6.2 Valeurs auxquelles les seuils POURRAIENT monter — **non appliquées**

`jest.config.js` est un fichier protégé. Ce tableau est une proposition, pas un changement.
Chaque valeur est le réel **arrondi vers le bas à l'entier**, ce qui laisse une marge de 0,1 à 1
point : assez pour absorber le bruit d'une suite qui bouge, assez peu pour que le cliquet serve.

| Entrée | Aujourd'hui (L/F/B/S) | Réel mesuré | Proposé |
|---|---|---|---|
| `global` | 38 / 39 / 29 / 38 | 58,49 / 53,50 / 54,24 / 57,97 | **58 / 53 / 54 / 57** |
| `./src/shared/` | 54 / 65 / 37 / 54 | 94,50 / 91,48 / 82,98 / 93,80 | **94 / 91 / 82 / 93** |
| `./src/shared/building-details/` | 92 / 100 / 80 / 91 | 97,13 / 100 / 89,06 / 96,23 | **97 / 100 / 89 / 96** |
| `./src/shared/types/` | 96 / 73 / 90 / 96 | 100 / 89,66 / 96,43 / 100 | **99 / 89 / 96 / 99** |
| **`./src/server/session/`** *(nouvelle)* | — | 99,93 / 100 / 99,04 / 99,91 | **99 / 100 / 99 / 99** |
| `./src/server/` *(nouvelle, optionnelle)* | — | 76,25 / 72,69 / 80,18 / 76,42 | **76 / 72 / 80 / 76** |
| `./src/tools/` *(nouvelle, optionnelle)* | — | 98,47 / 95,93 / 92,44 / 97,39 | **98 / 95 / 92 / 97** |

**Trois avertissements avant d'appliquer :**

1. **`./src/server/session/` fonctions à 100 est exact, pas arrondi.** C'est le verrou le plus utile
   de la mission — une fonction ajoutée sans test casse le build — mais il n'a aucune marge. Le
   poser à 100 est un choix d'exigence ; le poser à 99 le rend indolore et presque aussi utile.
   Même remarque pour `./src/shared/types/` lignes et statements, d'où la proposition à 99.
2. **`./src/shared/` est un préfixe**, donc il englobe `building-details/` et `types/`. Les trois
   entrées cohabitent déjà ainsi ; rien à changer, mais la valeur globale de `shared/` est tirée
   vers le haut par ses sous-répertoires.
3. **Le plancher machine se mesure sur la suite complète.** Les mesures ci-dessus viennent d'un
   `npx jest --coverage` complet. Une exécution partielle donnera moins et fera échouer le seuil :
   c'est attendu, pas une régression (voir §8 du prompt de mission).

---

## 7. Membres RDO exercés en Jest et absents des suites de conformité live

### 7.1 Le décompte, dérivé au lot 6

Les 118 membres RDO que `src/server/session/` et `spo_session.ts` peuvent émettre — extraits par
les quatre formes littérales décrites en §8 — croisés avec `src/tools/conformance/` (les 13 suites)
et avec [campaign/coverage-matrix.md](campaign/coverage-matrix.md) (les 78 lignes de mutation) :

| État | Nombre |
|---|---|
| Couverts par une suite de conformité (rejoués ou live) | **45** |
| Uniquement planifiés dans la matrice de mutation (aucune suite ne les émet) | **51** |
| **Absents des deux** | **22** |

### 7.2 Les 22 absents — lignes prêtes à ajouter à `campaign/coverage-matrix.md`

Format de la matrice : `# | Mutation | Tr | RDO member (target) | Unlock | Variants | Status`.
Les lectures ne sont pas des mutations : elles ouvrent une **Famille 9 — lectures non couvertes**,
que la matrice n'a pas aujourd'hui. Numérotation à partir de 79 pour ne pas heurter les 78 existantes.

#### Famille 9 — lectures et cycle de vie non couverts (nouvelle)

| # | Lecture | Tr | RDO member (target) | Unlock | Variants | Status |
|---|---|---|---|---|---|---|
| 79 | Statut de compte IS | A | `AccountStatus` (interfaceServerId) — `login-handler.ts:369`, `"^"` par défaut | LIVE | V0 | todo |
| 80 | KeepAlive périodique | B | `KeepAlive` (tempObjectId) — `spo_session.ts:2024`, `"*"` | LIVE | V0 + O6 (session longue) | todo |
| 81 | Fin de session directory | B | `RDOEndSession` (sessionId) — `login-handler.ts:219, :260, :313`, `"*"` | LIVE | V0 | todo |
| 82 | Logon directory (Sega) | A | `RDOMapSegaUser` (sessionId) — `login-handler.ts:200` | LIVE | V0 | todo |
| 83 | Logon directory (utilisateur) | A | `RDOLogonUser` (sessionId) — `login-handler.ts:208` | LIVE | V0,V2 | todo |
| 84 | Logon client monde | B | `RDOLogonClient` (worldId) — `spo_session.ts:1014`, `"*"` | LIVE | V0 | todo |
| 85 | Requête de clé directory | A | `RDOQueryKey` (sessionId) — `login-handler.ts:244` | LIVE | V0,V2 | todo |
| 86 | Positionnement de clé | A | `RDOSetCurrentKey` (sessionId) — `login-handler.ts:292` | LIVE | V0 | todo |
| 87 | Recherche de joueurs | A | `RDOSearchKey` (sessionId) — `login-handler.ts:304` — **OLEString obligatoire, P-M1** | LIVE | V0,**V2** | todo |
| 88 | Enregistrement des pushes | A | `RegisterEventsById` (contextId) — `login-handler.ts:437, :1109` | LIVE | V0 | todo |
| 89 | Statut de composition chat | B | `MsgCompositionChanged` (worldContextId) — `chat-handler.ts:195`, `"*"` | LIVE — ⚠ **`REQ_CHAT_TYPING_STATUS` n'est jamais émis par le client** (§8, UNWIRED) | V0 | todo |
| 90 | Pièce jointe de courrier | A | `GetAttachment` (msgId) — `mail-handler.ts:338` | #71 | V0 | todo |
| 91 | Brouillon de courrier | A | `Save` (mailServerId) — `mail-handler.ts:241` | LIVE | V0 — ⚠ **`REQ_MAIL_SAVE_DRAFT` jamais émis** (§8) | todo |
| 92 | Description d'invention | A | `RDOGetInvDescEx` (CurrBlock) — `research-handler.ts:131`, `"^"` | OWN:hq | V0 | todo |
| 93 | Propriétés d'invention | A | `RDOGetInvPropsByLang` (CurrBlock) — `research-handler.ts:120`, `"^"` | OWN:hq | V0 | todo |
| 94 | Vote du joueur (lecture) | A | `RDOVoteOf` (CurrBlock) — `building-details-handler.ts:938`, `"^"` | ROLE/LIVE — ⚠ **jamais émis en pratique, A-8** | V0 | **bug:A-8** |

#### Famille 2 (existante) — six lignes de mutation à ajouter

Toutes transport **B**, `"*"`, cible `CurrBlock` sauf indication — dispatch dynamique par
`KNOWN_RDO_COMMANDS` (`building-property-handler.ts`), donc **O1 indisponible, O2 obligatoire**.

| # | Mutation | Tr | RDO member (target) | Unlock | Variants | Status |
|---|---|---|---|---|---|---|
| 95 | Annuler la transcendance | B | `RDOCacncelTransc` (CurrBlock) — la faute de frappe est **celle du Delphi**, `StdBlocks/TranscendBlock.pas:50` | OWN:mausoleum | V0 | todo |
| 96 | Mots de sagesse (mausolée) | B | `RDOSetWordsOfWisdom %texte` (CurrBlock) | OWN:mausoleum | V0,**V2** | todo |
| 97 | Répartition d'un input en % | B | `RDOSetInputFluidPerc` (CurrBlock) | OWN:consumer | V0,V1 | todo |
| 98 | Tri des fournisseurs | B | `RDOSetInputSortMode` (**CurrBlock chez nous ; Voyager lie un ObjectId**) | OWN:warehouse | V0 — ⚠ **écart de cible A-6** | **bug:A-6** |
| 99 | Sélection d'une ligne d'appro | B | `RDOSelSelected` (**idem A-6**) | OWN:warehouse | V0 | **bug:A-6** |
| 100 | Statut d'achat | B | `RDOSetBuyingStatus` (CurrBlock) | OWN:warehouse | V0 — ⚠ **`[UNKNOWN]` : aucune déclaration serveur trouvée** | todo |

> Les lignes 98/99/100 sont exactement les trois sondes prioritaires de la §7.3 ci-dessous : elles
> ne sont pas seulement non couvertes, leur forme attendue n'est pas établie.

### 7.3 Oracles `[INFERRED]` — relevé pendant les lots

- **Les 42 commandes de la matrice `building-property-handler` sont `[INFERRED]`** :
  `doc/Mock_Server_scenarios_captures.md` ne contient aucune trame `RDOSet*`/`RDOConnect*`/`RDODisconnect*`.
  Les formes viennent des déclarations Delphi et des sites d'appel Voyager. Seule exception prouvée :
  `RDODisconnectInput "*" "%Plastics","%706,436,"`.
- Priorités de sonde : `RDOAutoRelease` (probablement inexistant), `RDOSetBuyingStatus` (`[UNKNOWN]`),
  `RDOSetInputSortMode`/`RDOSelSelected` (cible ObjectId vs CurrBlock sur entrepôt).
- `[INFERRED]` supplémentaires (lot 4) : `RDOGetInvPropsByLang`, `RDOGetInvDescEx`,
  `MsgCompositionChanged`, `Save` (brouillon), `GetAttachment`, `FindSuppliers`/`FindClients`.
- `[INFERRED]` supplémentaires (lot 3) : corps de réponse `Build/KindList.asp` jamais capturé ;
  `get RDOAcceptCloning` (la trame d'écriture est prouvée, la lecture non) ; `GetInputNames`/
  `GetOutputNames` ; `GetSubObjectProps` (11 colonnes pour un input, 7 pour un output — non validé live).
  `FacilityList.asp` est capturé et sert de fixture.
- **Correction à porter à la matrice :** sa ligne 52 « Cast vote » est marquée transport **A** ;
  le code émet en **B** (`writeRdoFrame`, sans QueryId).

---

## 8. Le test d'inventaire (lot 6) et ses exemptions

Fichier unique : [`src/server/__tests__/rdo/capability-inventory.test.ts`](../src/server/__tests__/rdo/capability-inventory.test.ts)
— **24 tests, verts, aucune couverture ajoutée** (il n'exécute aucun chemin de handler). Forme
reprise de `no-raw-rdo-writes.test.ts` : lectures `fs` en chemins relatifs à `__dirname`, aucune
table `REQ_* → membre → séparateur` maintenue à la main. Le seul contrôle qui importe des modules de
production est le 5, parce que la collecte de propriétés qu'il vérifie **est** une fonction de
production (`collectTemplatePropertyNamesStructured`).

Chaque contrôle porte, en plus de son assertion, un test « **the ratchet must have teeth** » : il
échoue si la regex d'extraction cesse de matcher. Sans lui, un refactor rendrait les assertions
vraies parce que vides — le mode de défaillance des tests d'inventaire.

### 8.1 Contrôle 1 — pas de capacité orpheline

78 `REQ_*` déclarés · 76 routés par `wsHandlerRegistry` · 69 émis par `src/client/`.
**Les 9 exemptions du 2026-08-16 ont été re-vérifiées une par une contre le code du 2026-08-17 :
aucune n'est périmée, aucune ne manque.**

`UNROUTED` — déclarés, aucun handler (analyse §7 F-1) :

| Type | Raison |
|---|---|
| `REQ_TRANSPORT_DATA` | Ni handler ni émetteur. Le remplir suppose d'abord le push `ActorPoolModified` (famille B) ; `TransportPanel` est mort. |
| `REQ_SEARCH_MENU_PEOPLE` | Vestige. `REQ_SEARCH_MENU_PEOPLE_SEARCH`, type distinct, est routé **et** émis. |

`UNWIRED` — jamais émis par le client (analyse §7 F-2) :

| Type | Raison |
|---|---|
| `REQ_TRANSPORT_DATA` | Même trou que ci-dessus, des deux côtés. |
| `REQ_SEARCH_MENU_PEOPLE` | Idem. |
| `REQ_CHAT_GET_CHANNEL_INFO` | `handleChatGetChannelInfo` existe ; l'UI ne demande jamais d'info de canal. |
| `REQ_CHAT_TYPING_STATUS` | `handleChatTypingStatus` existe. `ChatStrip` **affiche** les « X is typing » reçus et n'émet jamais le sien. |
| `REQ_GET_ROAD_COST` | `handleGetRoadCost` existe ; aucune estimation de coût n'est montrée avant de construire (Voyager en montre une). |
| `REQ_MAIL_GET_UNREAD_COUNT` | `handleMailGetUnreadCount` existe ; le badge n'est alimenté que par le push `NewMail`, donc faux au premier chargement. |
| `REQ_MAIL_SAVE_DRAFT` | `handleMailSaveDraft` existe ; `MailPanel` a un onglet Drafts sans moyen d'y écrire. |
| `REQ_MANAGE_CONSTRUCTION` | `handleManageConstruction` existe ; non exposé dans l'UI. |
| `REQ_RDO_DIRECT` | Outil de debug. Volontairement serveur seul — **exemption permanente**, le client ne doit pas pouvoir l'atteindre. |

### 8.2 Contrôle 2 — pas de membre RDO sans test

118 membres extraits, par **quatre formes littérales**, chacune avec son ancre dans le test de dents :

| Source | Forme | Ancre |
|---|---|---|
| S1 | `member: 'X'` — paquet `sendRdoRequest` | `RDOCnntId` |
| S2 | `RdoCommand….call/set/get/idof('X')` — chaîne `writeRdoFrame` | `CreateCircuitSeg` |
| S3 | `…FireAndForget(ctx, id, 'X', …)` — l'indirection nommée de `mail-handler` | `DeleteMessage` |
| S4 | `KNOWN_RDO_COMMANDS` — allowlist de dispatch dynamique ; le membre est une chaîne d'exécution, l'allowlist est le seul endroit où il apparaît littéralement | `RDOSetPrice` |

**Liste d'exemptions : VIDE.** Les lots 1 à 5 ont fermé les 118. C'est le résultat le plus fort que
ce contrôle puisse produire, et c'est la ligne qui piégera le prochain membre ajouté sans test.

Deux ajustements ont été nécessaires pour y arriver, tous deux dans **l'heuristique du test**, pas
dans le code de production :

- `CloneFacility` est nommé sur la **ligne de continuation** d'un `.toContain(…)`
  (`spo-session-lifecycle.test.ts:903`) → fenêtre de ±3 lignes autour d'une ligne d'assertion.
- `RDOSearchKey` / `RDOSetCurrentKey` apparaissent en littéral une ligne **au-dessus** de leur
  `expect` (`login-handler.test.ts:344, :356`) → seconde heuristique, littéral cité hors commentaire
  dans un fichier de test qui assert.

L'heuristique prouve qu'un membre est **nommé**, pas que l'assertion porte sur lui. Ce qui attrape
une assertion vide est le §6 du prompt de mission, pas ce contrôle.

### 8.3 Contrôle 3 — séparateurs et sockets

Les deux `ReadonlyMap` de `rdo-request-guards.ts` sont **importées**, jamais recopiées.

- **`VOID_MEMBERS` : aucun site n'émet `"^"`.** 97 sites d'émission littéraux scannés ; les 6 sites
  de membres void (`SayThis` ×1, `AddLine` ×2, `CloseMessage` ×3) sont tous en `"*"`.
- **Chemin de dispatch dynamique.** `RDOConnectInput`/`RDOConnectOutput` sont des `VOID_MEMBERS`
  atteints par une chaîne d'exécution : aucun scan statique ne peut leur attribuer un séparateur.
  La règle est donc portée au fichier — tout fichier qui teste `KNOWN_RDO_COMMANDS.has(…)`
  (`building-property-handler.ts`) ne doit contenir **aucun** `"^"` ni `.variant()`. Vert.
- **Helpers fire-and-forget.** `mailFireAndForget` prend le membre en paramètre et deux de ses
  appelants sont des `VOID_MEMBERS` : son corps doit construire en `.push()`, jamais `.variant()`. Vert.
- **Les 5 `VOID_MEMBERS` sont pilotés par au moins un test** (croisement avec le contrôle 2).

**Une exemption de spécification, pas de code — le §10 du prompt du lot 6 était faux sur ce point.**
Il demandait « aucun site d'émission n'utilise `"^"` » pour `CONNECTION_BOUND_MEMBERS` **et**
`VOID_MEMBERS`. Or `CONNECTION_BOUND_MEMBERS` ne contient que `RDOCnntId`, qui est une **lecture**
(`RdoAction.GET`) : `"^"` est sa forme correcte et obligatoire, et c'est celle du client de
référence. Appliquer la règle telle qu'écrite aurait exigé de casser la trame. L'invariant réel de
cette map est la **socket**, pas le séparateur — l'id renvoyé est l'adresse de la connexion porteuse
(`RDOQueryServer.pas:269-274`, `WinSockRDOConnectionsServer.pas:664-668`), donc le lire sur une
connexion du pool lie le `TClientView` serveur à une socket que le pool peut détruire. Le contrôle
implémenté vérifie donc :

  1. tout site littéral d'un `CONNECTION_BOUND_MEMBER` part sur la socket `world` ; **et**
  2. la garde `isConnectionBoundMember(packetData)` est toujours câblée dans `sendRdoRequest`
     (`spo_session.ts:2296`) — c'est elle qui l'impose à l'exécution.

### 8.4 Contrôle 4 — pushes : **décision de ne pas dupliquer**

Le lot 2 a déjà écrit l'inventaire `TISEvents` complet dans
[`push-dispatcher.test.ts:1087-1254`](../src/server/session/push-dispatcher.test.ts) — 24 méthodes
publiées avec leur ligne, 9 exemptions raisonnées, 2 membres hors `TISEvents` documentés, et son
propre test de dents. **Il reste où il est.** Deux raisons :

- la convention du dépôt est `module.ts → module.test.ts`, et cet inventaire garde `push-dispatcher.ts` ;
- le recopier ici créerait exactement la seconde source de vérité que ce fichier existe pour éviter.

Ce que le contrôle 4 ajoute est un **garde-fou contre sa suppression silencieuse** : il vérifie que
`push-dispatcher.test.ts` porte toujours la citation `ServerCnxHandler.pas:469-505`, les trois
tables (`TIS_EVENTS`, `PUSH_EXEMPTIONS`, `NON_TIS_MEMBERS`) et **exactement 24** méthodes publiées.
Sans lui, effacer le cliquet laisserait l'inventaire parapluie vert.

Le décompte du lot 2 a été re-vérifié et tient : 15 membres traités par le dispatcher ·
`RefreshArea`/`RefreshObject` interceptés en amont · `AnswerStatus` (seule `function`) répondu
ailleurs · 6 non implémentés (famille B) · 2 membres traités hors `TISEvents`.

### 8.5 Contrôle 5 — ce qu'un onglet lit doit être collecté (issu de A-8)

Templates atteignables **dérivés, pas listés** : le template de repli rendu par
`getTemplateForVisualClass` pour une classe non enregistrée, et le template maximal obtenu en
enregistrant d'un coup tous les handlers de `HANDLER_TO_GROUP`. `registerInspectorTabs` ne puise
nulle part ailleurs — c'est ce qui rend l'énumération exhaustive.

Deux vérifications : les lectures **hors garde d'onglet** (`GateMap`, `CurrBlock`, `ObjectId`,
`SecurityId`, `MoneyGraphInfo`) doivent être collectées par au moins un template — vert ; et les
lectures **d'une fonction `enrich…Tab`** doivent être collectées par un template qui porte cet onglet.

Une exemption :

| Fonction · onglet · propriété | Raison |
|---|---|
| `enrichVotesTab` · `votes` · `CurrBlock` | **A-8.** `CurrBlock` n'est déclaré que par `GENERIC_GROUP` (`template-groups.ts:25`), atteignable uniquement par le template de repli — qui n'a pas d'onglet `votes`. Aucune registration CLASSES.BIN ne produit les deux. `RDOVoteOf` n'est donc jamais émis. |

**Vérifié par retrait :** exemption enlevée, le test échoue en nommant exactement
`enrichVotesTab reads CurrBlock but no template with a 'votes' tab collects it`. Le cliquet mord.

### 8.6 Ce que le contrôle 5 **ne** fait **pas** — correction d'une prévision du prompt

Le prompt du lot 6 annonçait que ce contrôle « ferait probablement remonter aussi A-1/A-3/A-4 »
(`HoursOnAir`, `Comercials`, `BudgetPerc`, `Interest`, `Term`, `EstLoan`). **Il ne le fait pas, et
il ne le peut pas.** Ces six propriétés *sont* collectées : elles sont déclarées par
`TV_GENERAL_GROUP` / `BANK_GENERAL_GROUP` et `collectTemplatePropertyNames*` les demande bien au
cache. Le défaut est de l'autre côté du fil — le serveur Delphi ne les **écrit** jamais dans le
cache (`Broadcast.pas:431-453`, `Banks.pas:188-206`).

Rien dans ce dépôt ne connaît le contenu du cache serveur. Les attraper mécaniquement demande le
test §8.3-1 de l'analyse d'écarts : extraire les `Cache.Write*('X', …)` de `../SPO-Original/StdBlocks/*.pas`,
en faire une fixture, et vérifier chaque `rdoName` contre elle. C'est un autre test, qui lit un dépôt
externe — donc à décider (voir §9).

---

## 9. Dette laissée

- Les 4 fabriques `makeCtx()` locales pré-existantes non rétrofitées — `building-mutations`,
  `mail-handler-emission` (**aveugle au canal `"*"`**), `building-templates-handler`,
  `login-handler-reconnect`.
- Le test tautologique `rdo-helpers.test.ts:293-301`.
- `building-mutations.test.ts` sans fake timers.
- **Contention sous instrumentation :** sur un run complet avec couverture, une suite « vraie
  session » dépasse parfois 10 s, jamais la même (`server-busy-reconnect.test.ts:104`,
  `auth.validation.test.ts:51`, `logoff.validation.test.ts`), et passe seule. Contention, pas
  régression — mais à surveiller avant de brancher la couverture en CI.
  **Run du lot 6 (2026-08-17) : aucun dépassement, 167 s au total, sortie 0.** L'aléa n'est donc
  pas systématique ; il n'est pas non plus refermé.
- **`A worker process has failed to exit gracefully`** apparaît sur le run complet, avec et sans
  couverture. Fuite de handle ou de timer quelque part dans la suite ; Jest force la sortie et le
  code de retour reste 0. Non diagnostiqué — même famille que le point précédent, et le vrai
  préalable à une CI qui bloque sur la couverture.
- **Le contrôle 2 de l'inventaire est une heuristique de nommage, pas de vérification.** Il prouve
  qu'un membre est cité près d'une assertion, pas que l'assertion porte sur lui. Le durcir demanderait
  d'analyser l'AST des tests — coût élevé, gain incertain. Consigné pour que personne ne le prenne
  pour plus qu'il n'est.
- **Le test d'inventaire du cache Delphi n'existe toujours pas** (analyse §8.3-1). C'est le seul
  moyen mécanique d'attraper A-1/A-3/A-4, et le contrôle 5 ne s'y substitue pas (§8.6). Il suppose
  de lire `../SPO-Original`, dépôt externe : à arbitrer avant d'être écrit.

---

## 10. Compétences utilisées

`spo-testing` (conventions Jest, matchers, ratchet, deux nombres de couverture) · `rdo-conformity`
(verbes, séparateurs, `VOID_MEMBERS`, hiérarchie de preuve) · `rdo-network-resilience` (lot 5, cycle
de vie de session) · `delphi-archaeologist` (vérification membre par membre dans `Kernel/`,
`StdBlocks/`, `Protocol/`, `Cache/`, `Voyager/` ; au lot 6, `TranscendBlock.pas` pour
`RDOCacncelTransc`) · `code-guardian` (fichiers protégés, ratchet) · `typescript`.

---

## 11. État final — ce qui reste ouvert, et par quoi commencer

**La mission est terminée.** Les 21 fichiers du périmètre sont à 100 % lignes / fonctions /
statements, sauf les quatre écarts justifiés en §4 ; les branches sont à 100 % ou consignées ;
aucun `/* istanbul ignore */` posé sur un budget de 10 ; aucun fichier de production modifié.

Vérifications de fin, toutes du 2026-08-17 :

| Contrôle | Résultat |
|---|---|
| `capability-inventory.test.ts` | **24 tests verts** |
| `npm test` | **238 suites passées, 1 sautée · 6 011 tests passés, 5 sautés · sortie 0** |
| `npx jest --coverage` | idem, **seuils actifs, sortie 0**, 58,49 % lignes |
| `npm run typecheck` | **vert** (les deux `tsconfig`) |
| 9 fichiers de référence relancés | **229 tests verts, 9/9 suites, 100 % sur les quatre métriques** |

Trois fichiers de production sont modifiés dans l'arbre — `profile-finance-handler.ts`,
`auto-connection-handler.ts`, `politics-handler.ts`. C'est le correctif **A-9** appliqué hors mission
le 2026-08-17 à la demande du développeur ; **la mission n'y a pas touché**.

### Ordre recommandé pour la suite

1. **Monter les seuils de `jest.config.js`** (§6.2). C'est le seul geste qui transforme le travail en
   protection permanente, il coûte une édition, et le gain reste acquis sinon par accident.
   Décision développeur, fichier protégé. Commencer par `./src/server/session/`.
2. **Trancher les deux écarts de trame ouverts** : A-2 (`Comercials` → `Commercials`,
   `Broadcast.pas:53`) et A-5 (`RDOAutoRelease`, membre inexistant). Ce sont deux réglages qui ne
   partent jamais, et le correctif est d'une ligne chacun. A-6 en revanche a besoin d'une **sonde
   live sur un entrepôt** avant toute correction — les deux sites Voyager ne lisent pas le même ObjectId.
3. **Ajouter les 22 lignes de §7 à `campaign/coverage-matrix.md`.** Elles sont rédigées au format de
   la matrice ; elles ouvrent une famille 9 (lectures) que la matrice n'avait pas.
4. **Arbitrer le test d'inventaire du cache Delphi** (§8.6, analyse §8.3-1) — le seul moyen mécanique
   d'attraper la famille A-1/A-3/A-4, au prix d'une dépendance de test sur `../SPO-Original`.
5. **Diagnostiquer la fuite de handle** (§9) avant de brancher la couverture en CI.

Ce qui **ne** doit **pas** être fait tout de suite : rétrofiter les 4 fabriques `makeCtx()` locales
(§9). Elles sont vertes, et `mail-handler-emission.test.ts` — le plus gênant, aveugle au canal `"*"`
— est déjà doublé par `mail-handler.test.ts` du lot 4, qui capture les deux canaux.
