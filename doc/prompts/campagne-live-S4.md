# ⛔ PÉRIMÉ — Lot S4, le balayage live

> **NE PAS EXÉCUTER CE PROMPT.** Il décrit la campagne qui a **cassé le serveur de production
> partagé** le 2026-08-18 : cinq `function` appelées sous `"*"`, écriture mémoire arbitraire dans le
> processus de l'Interface Server, puis `errMalformedQuery` sur toute requête pendant 3 h 42.
>
> Le balayage est **supprimé du dépôt** (lot R1) et sa prémisse est morte : il n'existe **aucune trame
> sûre pour un membre dont personne n'a la déclaration**. Le raisonnement était circulaire — le genre
> du membre est précisément ce que le balayage prétendait découvrir.
>
> **Plan en vigueur :** [plan-certification-rdo-rev4.md](../../report/plan-certification-rdo-rev4.md).
> **Compte rendu de l'incident :** [lot-S4-balayage-live.md](../../report/lot-S4-balayage-live.md).
>
> Conservé **uniquement** comme pièce du dossier d'incident.

---

# Lot S4 — Le balayage live

**Session neuve. Modèle : Opus 5. Effort : `xhigh`.** Aucun agent à lancer.

> L'effort est relevé d'un cran par rapport à S2, qui tournait en `high`. S2 appliquait neuf éditions
> localisées avec le corps de la principale fourni mot pour mot ; **S4 conçoit** les quatre vagues,
> résout un `targetBinding` sale, et **émet en une seule fois sur un serveur partagé en production,
> avec droit de mutation**. Une erreur n'y est pas rattrapable par un `npm test`.

Tu exécutes le lot qui **produit l'information** de toute la campagne : classer les 217 membres RDO
par ce que le serveur répond, au lieu d'adjuger 175 déclarations Pascal à la main.

**Cadre :** [report/plan-campagne-live-rdo.md](../../report/plan-campagne-live-rdo.md) **révision 3**
— §3 (les vagues), §4 bis (le GO et la liste de refus), §5 (les trois réserves). Lis-le avant de
commencer. Le harnais a été déverrouillé par **S2**, livré et accepté le 2026-08-18.

---

## 1. Ce que le développeur a autorisé, et ce qu'il a exclu

**GO donné le 2026-08-18** : *« Pas de problème pour une altération du compte. »* La campagne de
mutation sur le compte vivant `SPO_test3` est autorisée — 41 installations. Le crash serveur est
assumé : *« si le serveur crash ce n'est pas GRAVE »*.

Et sur les inconnues que tu vas rencontrer : *« ne t'inquiète pas pour les éléments que tu
découvriras en LIVE — c'est le but. »* **Ne bloque pas sur une surprise live. Enregistre-la et
continue.**

### Trois exclusions, et elles doivent être COMPILÉES

Motif du développeur, opérationnel et non prudentiel : elles *« détruiraient tout le contenu du compte
de test et empêcheraient de nouveaux tests »*.

1. suppression du compte ;
2. suppression d'une compagnie ;
3. régression de niveau.

**Le balayage est aveugle par construction** — il émet sur des membres qu'il n'a pas identifiés,
c'est son objet même. Il ne peut pas *savoir* qu'il vient d'appeler `RDODelCompany`. Une exclusion
qui repose sur « le balayage ne devrait pas y aller » n'en est pas une. Elle entre dans la garde.

---

## 2. Édition 0 et édition 1 — avant la moindre trame

### Édition 0 — le message de refus resté faux dans `cli.ts`

`cli.ts:137-138` affirme encore :

> *« the step is settled (error 9, live 2026-08-16) and re-running it must be a decision, not a
> default »*

C'est le raisonnement `ClientAware`-seulement que l'édition 8 de S2 a retiré de `runner.ts`, et qui a
survécu dans son jumeau parce que le prompt S2 bornait l'édition à `runner.ts:61-66`. **Défaut du
prompt, pas du lot.**

**La règle reste, sa justification tombe.** L'objet réel de la règle — « re-lancer doit être une
décision, pas un défaut » — survit intact à la découverte ; nommer explicitement la suite pour la
vague 2 est sain. Réécris le motif, garde le refus. (`--allow-variant-on-procedure` n'est jamais
combiné à `--suite all` : c'est aussi une règle `CLAUDE.md`.)

### Édition 1 — la liste de refus, compilée à côté de `VOID_MEMBERS`

Sept membres, tous `published` dans `SPO-Original/Kernel/World.pas`, tous atteignables par une trame.
Chaque entrée porte sa déclaration citée, comme `VOID_MEMBERS` :

| Ligne | Membre | Exclusion |
|---|---|---|
| :367 | `function RDODelTycoon( name, password : widestring ) : OleVariant` | 1 |
| :368 | `function RDOResetTycoon( name : widestring ) : OleVariant` | 1 — **sans mot de passe, 1 paramètre : le plus exposé des sept** |
| :369 | `function RDOResetTycoonEx( name, password : widestring ) : OleVariant` | 1 |
| :372 | `function RDODelCompany( name : widestring ) : OleVariant` | 2 — 1 paramètre |
| :373 | `function RDOGetRidOfCompany( cpnName, tycoonName, password : widestring ) : OleVariant` | 2 |
| :402 | `function RDOAssignLevel( tycoonName, sysPassword, Level : widestring ) : OleVariant` | 3 |
| :415 | `procedure RDOResetTournament( password : widestring )` | ajouté par le pilote — même famille, même irréversibilité |

**Ce refus n'est levé par aucun drapeau.** Ni `--allow-mutations`, ni `--target dedicated`, ni
`--allow-variant-on-procedure`. Ce n'est pas une classe de risque, c'est une interdiction. Écris-le
comme tel, et donne-lui son test.

**Deux faits vérifiés qui bornent la portée — ne les re-dérive pas :**

- **Aucun des sept n'est dans `.rdo-live/inventory.ndjson`.** Les 217 membres sont la surface que
  notre client appelle ; l'outillage d'administration de `World.pas` n'en fait pas partie. Le
  balayage tel que décrit ci-dessous ne les atteint pas. **La garde est là pour le jour où le
  dénominateur s'élargit** — l'extraction de S1 donne 548 membres atteignables, et ils y sont.
- `TWorld.DeleteTycoon` / `DeleteCompany` (`World.pas:567-571`) et `TTycoon.ResetLevel`
  (`Kernel.pas:2594`) sont **`public`, pas `published`** → `MethodAddress` ne les voit pas →
  `error 5`. Non atteignables.

⚠ **Erreur d'attribution déjà évitée par le pilote, ne la refais pas.** `RDODowngrade` /
`RDODowngradeMany` (`Kernel.pas:1094-1095`) ne sont **pas** l'exclusion 3. Leur bloc `published`
contient `RDOConnectInput`, `RDOStartUpgrade`, `RDOStopUpgrade` : c'est la classe **bâtiment**, et ce
`Downgrade` rétrograde le niveau technologique d'un bâtiment, réversible par `RDOStartUpgrade`. La
vraie exclusion 3 est `RDOAssignLevel`.

---

## 3. Le dénominateur — il existe déjà, ne le reconstruis pas

**`.rdo-live/inventory.ndjson`** — 298 lignes, **217 membres distincts**, livré par le lot A. Une
ligne par scénario, en JSON, avec les champs qui t'intéressent :

`member` · `object` (classe déclarante) · `targetBinding` (l'adressage) · `verb` · `separatorEmitted`
· `paramCountHint` · `pascalKindHint` · `transport` · `status` · `tier`.

Profil mesuré, qui dit où est le travail :

| Champ | Distribution sur les 217 |
|---|---|
| `pascalKindHint` | **`unknown` 98** · `procedure` 61 · `function` 54 · `property` 4 |
| `paramCountHint` | `null` 89 · `1` 57 · `2` 42 · `0` 10 · `3+` 19 |

**Les 98 `unknown` sont la cible réelle du balayage.** Les 61 `procedure` et 54 `function` déjà
connus servent de **témoins** : le balayage doit les reclasser correctement, sinon c'est la méthode
qui est fausse, pas l'inventaire. Mets-en une poignée dans chaque vague et compare.

⚠ **`targetBinding` est sale et tu vas le découvrir en l'utilisant.** Il mélange de vrais
identifiants d'adressage (`ClientViewId` 87, `cacheObjectId` 41, `CurrBlock` 30, `worldContextId` 13,
`objectId` 14) et des **noms de classe** (`TBlock`, `TClientView`, `TInterfaceServer`,
`TCachedObjectWrap`, `TMailServer`…) qui ne sont pas des cibles. Une ligne `unknown` : 27. **Ne
corrige pas l'inventaire** — c'est un livrable d'un autre lot. Résous ce que tu peux, et remonte en
CR ce que tu n'as pas su adresser, avec le compte.

---

## 4. Les quatre vagues

La classification vient de la réponse, et elle est sans ambiguïté :

| Réponse | Verdict |
|---|---|
| `res="…"` | **function** |
| ack vide sous `"^"` | function renvoyant un variant vide (`RDOQueryServer.pas:478-482`) |
| `error 9` | **procedure** |
| `error 5` | non **publié** — **jamais « inexistant »** (`MethodAddress` ne voit que le `published`) |
| `error 6` | liste de paramètres refusée |
| **silence** | **gel** |

**L'ordre des vagues est un ordre de risque résiduel croissant**, et il a une raison mécanique : un
gel à la position *k* confisque toute la queue, parce que `runSuite` casse au premier silence
(`runner.ts:262-273`). On trie pour que la queue confisquée par la sonde la plus risquée soit vide.

- **Vague 0 — `get <prop>` sur les propriétés.** Aucun appel de méthode : `RDOObjectServer.pas:119`
  ne passe pas par `call MethodAddr`. Risque nul. C'est aussi ton canari de liveness.
- **Vague 1 — `call M "*"` à 0 argument sur les 217.** Partition *existe* / `error 5`. Le void ne
  demande pas de résultat, donc aucun pointeur caché nulle part.
- **Vague 2 — `call M "^"` à 0 argument sur les survivants.** **C'est la vague qui classe
  function vs procedure**, et c'est le cœur du lot. Elle est entièrement en
  `risk: 'variant-on-procedure'`, donc elle **doit nommer sa suite** (cf. édition 0).
- **Vague 3 — `call M "^"` à 1 argument bien typé**, là où la vague 2 a rendu `error 6`.

Intra-vague : `paramCount = 0` d'abord, puis les inconnus, puis `≥ 1` en dernier.

### Pourquoi 0 et 1 argument ne peuvent pas geler — vérifié dans l'assembleur

`Rdo/Server/RDOObjectServer.pas`, relu et confirmé par le pilote au branchement près :

- `MaxRegs = 3` (:192), `JustEAX = 1` (:193) ;
- `ParamCount := VarArrayHighBound( Params, 1 )` (:218) — le tableau **reçu**, jamais la déclaration ;
- `RegsUsed := 1` (:223). Arg 1 → `EDX`, `RegsUsed` 1→2. Arg 2 → `ECX`, 2→3 ;
- `@ResParam` (:281) route le pointeur de résultat : `RegsUsed=1` → `mov edx` · `=2` → `mov ecx`
  (:288) · `=MaxRegs` → **`push edi`** (:292), que la `procedure` en convention `register` ne dépile
  jamais. C'est le gel du 2026-08-14.

Trois bords live-prouvés, et **la capture prime sur la source** : `ClientAware` 0 arg → `error 9` en
91 ms · `CloseMessage` 1 arg → `error 9` sans gel
(`mail-read-captured.scenario.ts:1011-1012`) · `SayThis` 2 args → gel de 12 h 41.

⚠ **`paramCountHint` surestime pour les flottants** : `@CheckIfSingle` (:255) et `@CheckIfDouble`
(:259) poussent **sans toucher `RegsUsed`**. La garde refuse donc des cas qui ne gèleraient pas —
conservatrice dans le bon sens, jamais l'inverse.

⚠ **« 0 argument » protège du GEL, pas de l'EFFET.** À 0 argument émis sous `"^"`, `@ResParam` met le
pointeur du variant de résultat dans `EDX` — c'est-à-dire **dans le premier paramètre** d'une méthode
en convention `register`. Une méthode déclarée à 1 paramètre appelée à 0 argument reçoit donc une
adresse comme argument. Ça ne gèle pas ; ça exécute le corps avec une valeur arbitraire. C'est
exactement pourquoi l'édition 1 existe.

---

## 5. La séquence bâtiment — dictée par le développeur

> **« Pour la destruction de bâtiment : détruire un parc. Et pour la construction, reconstruire le
> parc au même endroit (comme ça on règle le défi des coordonnées). »**

La démolition **produit** le couple `(x, y)` que la construction consomme : le choix des coordonnées
n'a plus à être tranché. C'est la chaîne `ctx.state` que le harnais fait déjà en production
(`scenario-suites.ts` : `objects-in-area` → `state.set` → `switch-focus` → `property-list-at`).

Forme attendue :

1. `fetchOwnedFacilities` — trouver un parc parmi les 41 installations, poser `(x, y)` et la classe
   dans `ctx.state` ;
2. démolir — `RDODelFacility( x, y )` (`World.pas:354`) ;
3. reconstruire au même `(x, y)`, même classe.

`RDODelFacility` est une **`function`** : `"^"` est sa forme juste, et ses deux arguments entiers ne
gèlent pas — une `function` dépile bien le pointeur de résultat caché. **Le gel ne vise que `"^"` sur
une `procedure`.**

**Le pilote n'a pas vérifié que `SPO_test3` possède un parc**, ni sous quel nom de classe. Si le
compte n'en a pas : la séquence se déclare **impossible avec sa raison typée** et le run continue.
C'est la règle du développeur — *« tente tout à chaque fois et SEULEMENT si c'est impossible alors le
processus doit avertir l'utilisateur »*. Une impossibilité n'existe **qu'après une tentative
échouée**, et elle remonte.

Utilise `TimeoutCategory.NORMAL`/`SLOW` sur ces steps : une construction franchit légitimement un tic
de simulation, et un step déclaré `fail` sur une expiration à 60 s est un faux négatif, pas un
constat.

---

## 6. Ce que le harnais sait déjà faire — ne le re-dérive pas

Livré par S2, vérifié, vert (16 suites, 279 tests) :

- **`ctx.emit(target, packet, category?)`** — requête avec QueryId, passe par `sendRdoRequest`, donc
  par le formateur, les gardes, les délais et le contrat `errorCode`. `category` par défaut `FAST`.
- **`ctx.state`** — `Map` partagée par toutes les étapes du run. C'est le chaînage de séquence.
- **`ctx.wire.mark()` / `derived()`** — juger plusieurs trames d'une même séquence **sans rien
  réémettre**, en rejouant le segment marqué. Une séquence s'exerce une fois, s'assertent en
  plusieurs points.
- **`need()`** — lève `StepSkip` si le maillon amont manque : l'étape est **sautée avec sa raison**,
  ni échec ni faux vert.
- **`StepTarget` accepte `{ objectId }`** — une étape peut adresser un objet dont l'id vient de
  l'étape précédente.
- **`SessionDriver`** est élargi à 49 membres (mutations monde, scratch Cache Server, mail/ASP, et
  les lectures qui sont des préconditions).
- **`--allow-mutations`** déclare l'intention dans la ligne de commande et dans le rapport.
- **`DEFAULT_FRAME_BUDGET = 3000`** — le balayage tient dedans.
- **L'attribution d'un gel est automatique** : `SuiteReport.halt` porte le `HaltRecord`,
  `RunnerHooks.onHalt` le remonte à l'instant du silence, `formatSilenceAttribution` l'imprime en
  quatre lignes `[silence]` sur stderr. **La dernière trame émise est le suspect, directement.**

**Rien n'écrit `.rdo-live/HALT`.** Le frein est **manuel**, par décision du développeur du
2026-08-18 : `halt.ts:8-32` porte les quatre raisons du retrait du déclenchement automatique, et
`halt.test.ts` épingle « exposes no way to write the file ». **Ne réintroduis pas de déclencheur.**

---

## 7. Pièges relevés, à ne pas redécouvrir

- **`assertSuitesSafe` s'exécute à l'import** (`suites.ts:386`). Une suite portant un step
  `risk:'mutation'` **sans champ `reset`** fait exploser le CLI **avant le parsing des arguments**.
  Écris le `reset` en même temps que le step, jamais après.
- **`ctx.push` ne traverse AUCUNE garde** (`runner.ts` → `writeRdoFrame`) — ni `assertNotVoidPush`,
  ni `assertNotVariantOnVoidMember`. Et il n'émet **pas de QueryId**, donc aucune réponse corrélée :
  **il n'apprend rien à un balayage.** La vague 1 en `"*"` doit passer par `ctx.emit`, pas par
  `ctx.push` — void + QueryId est wire-légal, le serveur acquitte `A<id> ;` (prouvé en capture).
- **`error 5` se lit « non publié »**, jamais « inexistant ». Ne ferme pas une ligne d'inventaire sur
  ce seul signal.
- **La polarité de `assertPacketSafe` est encore ouverte** : `if (!proc) return` laisse passer `"^"`
  sur tout membre inconnu dans la bande de danger. **C'est délibéré, c'est ce qui rend le balayage
  possible, et c'est S5 qui la ferme** — avec la liste de `function` prouvées que TU produis. Ne
  l'anticipe pas.
- **Ne déguise jamais une mutation en `risk:'read'`** pour passer le gate. Ce serait un mensonge au
  gate et ça corromprait la comptabilité de la suite qu'on construit. Le chemin est
  `--allow-mutations`.
- **Le gate de conformité** réclamera rejeu puis live avant le prochain `git commit`. Attendu.

---

## 8. Contraintes

- Couverture **≥ 93 %** sur les lignes touchées ; tests co-localisés.
- `jest.config.js`, `rdo-types.ts`, `rdo.ts`, `spo_session.ts` sont **protégés** — si tu crois devoir
  les modifier, arrête-toi et explique.
- `npm run typecheck` et `npx jest --testPathPatterns conformance` **verts avant de rendre**.
- Ne commit pas, ne push pas. LF. Rapport **en français**, sous `report/`.
- Le run live vise **`planitia`**, compte `SPO_test3` / `test3`, compagnie `SPO_test3 - Green`.
  **Ne change jamais ces identifiants.**
- Enregistre le run (`--recording`) : sans enregistrement, le balayage n'est pas rejouable et S6 n'a
  pas de baseline.

---

## 9. Définition de « terminé »

- [ ] Édition 0 appliquée — le motif de `cli.ts` ne dit plus quelque chose de faux
- [ ] Édition 1 appliquée — les 7 membres refusés **quel que soit le drapeau**, avec test
- [ ] Les 4 vagues écrites, dans l'ordre de risque, avec leur `reset` quand elles mutent
- [ ] Les témoins (`procedure` / `function` déjà connus) sont reclassés correctement par la méthode
- [ ] Le run live a tourné et est **enregistré**
- [ ] Un verdict par membre atteint, avec la trame et la réponse ; les non-atteints ont une **raison
      typée**
- [ ] La séquence parc a été **tentée** — réussie, ou impossible avec sa raison
- [ ] typecheck + suites conformance verts

## 10. Compte rendu attendu

**(1)** les éditions 0 et 1, et leurs tests ; **(2)** le tableau des verdicts — combien de `function`,
de `procedure`, d'`error 5`, d'`error 6`, de gels ; **(3)** les témoins : la méthode les a-t-elle
reclassés juste ? **(4)** ce que tu n'as pas su adresser (`targetBinding` sale) avec le compte ;
**(5)** tout gel, avec son attribution — c'est un **résultat de test**, pas un incident ; **(6)** ce
qui bloque S5.

**Si quelque chose te paraît faux ici, dis-le plutôt que de l'appliquer.** Le lot L0 a corrigé deux
inexactitudes du sien, un panel de 11 agents a réfuté la révision 1 du plan, le lot A a invalidé trois
de ses chiffres, un panel de 5 agents a rendu la révision 2 obsolète, et le lot S2 a eu raison de
refuser l'édition 7 telle qu'elle était écrite.
