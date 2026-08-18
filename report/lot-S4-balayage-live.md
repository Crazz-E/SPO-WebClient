# Lot S4 — le balayage live : compte rendu

**2026-08-18.** Branche `fix/rdo-pool-lifecycle-timeouts-probe`. Cible : `planitia`, compte
`SPO_test3`, compagnie `SPO_test3 - Green`. Skills : `rdo-conformity`, `delphi-archaeologist`
(lecture directe du dispatcher), `spo-testing`.

---

## 0. À lire en premier — l'Interface Server partagé est cassé, et c'est nous

**Le run de 10:22 a mis l'Interface Server de `planitia` hors d'état.** Depuis 10:22:57 il répond
`error 1` (`errMalformedQuery`) à **toute** requête, sur **toute** connexion, y compris au trafic
interne du Model Server. C'était encore vrai à 11:05:16, dernière vérification.

```
2026-08-18 11:05:16 AM  Malformed query in TRDOQueryServer.ExecQuery line (160)
                        sel 29554264 call RefreshTycoons "*" "#0";
```

`sel 29554264` n'est pas nous : c'est le Model Server qui pousse ses rafraîchissements au serveur
d'interface. Il se les fait refuser aussi.

**La trame responsable, à la seconde près :**

```
C 1068 sel 29983712 call GetUserList "*";
function TClientView.GetUserList : OleVariant   — Interface Server/InterfaceServer.pas:191
```

`FIVEINTERFACESERVER/Survival 26-08-18.log:136` est la première entrée « Malformed query » de la
journée et elle cite cette trame. La trame précédente, `1067`, avait répondu normalement ; la
suivante, `1069`, et toutes les autres, `error 1`. Notre propre `get UserName`, qui répondait aux
rid 1052, 1057 et 1058, répond `error 1` à partir du rid 1157.

**Ce que ça demande au développeur : un redémarrage de l'Interface Server de `planitia`.** Rien
d'autre ne le remettra en état — le processus est vivant, il journalise, il accepte les connexions,
c'est son `ExecQuery` qui est mort.

**`.rdo-live/HALT` a été posé**, avec l'attribution complète et la manœuvre attendue. Aucune trame
live ne partira tant qu'il existe. C'est le frein manuel prévu par `halt.ts` ; je l'ai actionné en
tant qu'opérateur de la campagne, pas par déclenchement automatique.

Le GO couvrait le crash (« si le serveur crash ce n'est pas GRAVE »). Il couvre celui-ci. Mais le
serveur est **partagé** et l'indisponibilité dure ; il fallait le dire avant tout le reste.

---

## 1. Le mécanisme, et pourquoi il renverse la prémisse du plan

### 1.1 Ce qui s'est passé dans le dispatcher

Sous `"*"` (VoidId), `Res` reste `UnAssigned`. `@ResParam` lit `varEmpty` et saute directement à
`@DoCall` (`Rdo/Server/RDOObjectServer.pas:281-283`) : **aucun pointeur de résultat n'est passé.**

La méthode appelée, elle, a été compilée contre sa déclaration. `function GetUserList : OleVariant`
en convention `register` écrit son résultat à travers le registre que son propre ABI réserve —
`EDX` à zéro paramètre déclaré — que le dispatcher a laissé avec ce qui traînait dedans.

C'est une **écriture de 16 octets à une adresse arbitraire dans le processus du serveur.**

Cinq fonctions ont pris ce tir pendant la vague 1 : `GetCompanyCount`, `GetUserName`,
`GetChannelInfo`, `GetChannelList`, `GetUserList`. Quatre ont écrit quelque part d'anodin. La
cinquième a touché quelque chose qui comptait.

### 1.2 La règle, et elle a deux axes, pas un

> **Une trame est sûre si et seulement si le nombre d'arguments émis est égal au nombre déclaré,
> ET le séparateur correspond au genre du membre. Il n'existe aucune trame sûre pour un membre dont
> personne n'a la déclaration.**

| forme | conséquence | preuve |
|---|---|---|
| `"^"`, 2 arguments registre, sur une `procedure` | pointeur de résultat empilé (`:292`), jamais dépilé → **gel** | 2026-08-14, `SayThis` |
| `"*"` sur une **`function`** | aucun pointeur passé, la fonction en écrit un quand même → **écriture arbitraire** | **2026-08-18, `GetUserList`** |
| émis < déclaré, `"^"` | le pointeur de résultat atterrit dans le slot du 1ᵉʳ paramètre, et une fonction écrit son résultat via un `ECX` périmé | même famille |

**Le point le plus important : `GetUserList` était correct sur l'axe de l'arité.** Zéro paramètre
déclaré, zéro argument émis. La faute est entièrement dans le séparateur. Le plan rév. 3 §3 raisonnait
sur le seul axe des arguments — *« le void ne demande pas de résultat, donc aucun pointeur caché nulle
part »* — et c'est cette phrase qui a mis la trame sur le fil. L'appelant n'en demande pas ; l'appelé
en écrit un quand même.

### 1.3 Ce que ça détruit du plan

Plan rév. 3 §1.1 : *« La certification devient un balayage, pas une adjudication. »*

**C'est faux, et la mesure l'a montré.** Le genre d'un membre non adjugé ne peut pas être lu sur le
fil, parce qu'il n'existe pas de trame sûre à lui envoyer tant qu'on ne le connaît pas déjà. Le
balayage ne remplace pas le lot B ; il **valide** ce que l'extraction Pascal donne, sur les deux
cellules où émis = déclaré (0 argument sur un membre à 0 paramètre, 1 argument registre sur un membre
à 1 paramètre). Pour tout le reste, la source est `extract-rdo-arity.js`, c'est-à-dire S1.

Bonne nouvelle attenante : S1 couvre déjà **170 des 217** membres avec une signature unique, et la
résolution par classe adressée (§4.2) en récupère encore 4. Il reste **6 membres** dont personne n'a
l'arité, et ils sont désormais listés comme tels.

---

## 2. Édition 0 — le motif de refus de `cli.ts`

Le refus reste, sa justification est réécrite. `cli.ts:135-160`.

L'ancien texte — *« the step is settled (error 9, live 2026-08-16) and re-running it must be a
decision, not a default »* — était vrai de `ClientAware` et de rien d'autre. Le drapeau ne couvre
plus une étape réglée, il couvre les vagues qui exécutent des corps de méthode sur un compte vivant.
Le message nomme maintenant les suites à lancer explicitement (`separators, sweep-variant,
sweep-arity1`) et dit ce que ces vagues font.

Ce qui survit intact : **lancer ça doit être une décision, pas un défaut.**

Tests : `cli.test.ts` — le refus, et une assertion sur le texte qui vérifie que « settled » et
« 2026-08-16 » n'y sont plus.

**Une conséquence non prévue par le prompt, et elle était nécessaire :** `--suite all` **exclut**
désormais les suites de balayage. `all` est l'étape 1 du gate git, qui rejoue un enregistrement ;
le balayage émet des trames qu'aucun enregistrement ne contient, la première sans réponse est lue
comme un silence et termine le run. Le laisser dans `all` aurait cassé `git commit` pour tout le
monde. Le plan prévoit son entrée dans `all` en S6, quand il aura sa baseline.

---

## 3. Édition 1 — la liste de refus compilée

`FORBIDDEN_MEMBERS` dans `src/server/session/rdo-request-guards.ts`, à côté de `VOID_MEMBERS`,
sept entrées, chacune avec son exclusion et sa déclaration `Kernel/World.pas:Ligne` :

| Ligne | Membre | Exclusion |
|---|---|---|
| :367 | `RDODelTycoon( name, password )` | 1 |
| :368 | `RDOResetTycoon( name )` | 1 |
| :369 | `RDOResetTycoonEx( name, password )` | 1 |
| :372 | `RDODelCompany( name )` | 2 |
| :373 | `RDOGetRidOfCompany( cpnName, tycoonName, password )` | 2 |
| :402 | `RDOAssignLevel( tycoonName, sysPassword, Level )` | 3 |
| :415 | `RDOResetTournament( password )` | 3, même famille |

Les sept déclarations ont été relues à la ligne citée : elles sont exactes.

`assertMemberNotForbidden` est appelée **en tête de `assertPacketSafe`**, avant toute branche : avant
le séparateur, avant le compte d'arguments, hors du drapeau `allowZeroParam`. Elle est aussi appelée
depuis `ctx.push`, qui ne traversait aucune garde. Aucun drapeau ne la lève. La comparaison est
**insensible à la casse** — l'inventaire porte `rdoResetTycoon` avec un `r` minuscule.

### Deux corrections au prompt et au plan §4 bis

**(a) « Aucun des sept n'est dans `.rdo-live/inventory.ndjson` » est faux. Deux y sont.**

- ligne 59 : `rdoResetTycoon`, objet `TWorld`, `status: excluded:out-of-scope` ;
- ligne 188 : `RDOResetTycoonEx`, `targetBinding: ClientViewId`, `status: todo`,
  `reachability: atteignable`.

Le second serait donc parti sur le ClientView si la garde n'existait pas. La garde n'est pas une
précaution pour le jour où le dénominateur s'élargit : elle porte aujourd'hui.

**(b) La séquence parc ouvre elle-même l'accès à `TWorld`.** `deleteFacility` ouvre le socket
construction et résout `idof World` (`building-management-handler.ts:332-345`) — c'est l'objet qui
publie les sept. Le prompt disait que le balayage ne les atteignait pas ; sa propre séquence bâtiment
les met à portée. C'est la seconde raison pour laquelle la garde devait être compilée.

Tests : `rdo-request-guards.test.ts` — les sept refusés, la casse, le message qui dit qu'aucun
drapeau ne lève ; `suites.test.ts` — refus quel que soit le verbe, le séparateur, l'arité et le
drapeau, et une suite qui en porterait un ne peut pas se charger.

---

## 4. Le balayage : ce qui a été construit, ce qui a tourné

### 4.1 La composition, après correction

| Vague | Forme | Membres | État |
|---|---|---|---|
| 0 | `get <prop>` sur les propriétés déclarées | 23 | **a tourné, complète** |
| 1 | `call M "*"` 0 arg | 98 | **9 émises, puis incident — supprimée** |
| 2 | `call M "^"` 0 arg, membres à 0 paramètre déclaré | 15 | émises après l'incident, donc **sans valeur** |
| 3 | `call M "^"` 1 arg registre, membres à 1 paramètre | 36 | idem |
| parc | `RDODelFacility` puis `NewFacility` | 5 étapes | **tentée, impossible** |
| endgame | les 4 membres qui terminent la session | 4 | idem |

La vague 1 n'existe plus. Les 6 membres sans arité connue sont sortis du plan avec la raison
`arity-unknown-no-safe-frame`.

### 4.2 Un choix qui a évité pire, et un qui n'a pas suffi

**Ce qui a tenu :** la vague 2 avait déjà été restreinte, avant le run, aux membres à 0 paramètre
déclaré plus les inconnus — parce que la relecture du dispatcher disait qu'à 0 argument sur un membre
à ≥1 paramètre le pointeur de résultat atterrit dans le slot du premier paramètre. Ça a retiré ~100
trames de la vague la plus dangereuse. Le prompt et le plan les y mettaient toutes.

**Ce qui n'a pas suffi :** la même relecture n'a pas été appliquée au séparateur void. J'ai écrit
noir sur blanc, dans l'en-tête de `sweep.ts` avant le run, que sous `"*"` « aucun pointeur de
résultat n'est passé » — et j'en ai conclu que c'était sûr, au lieu d'en conclure que l'appelé en
écrirait un quand même. Le plan disait la même chose et je l'ai suivi sur ce point précis.

**Résolution de l'ambiguïté par la classe adressée.** `GetUserList` est `function:0` sur
`TClientView` (:191) et `function:1` sur `TInterfaceServer` (:436). Ce n'est pas ambigu une fois la
cible fixée. Le plan résout désormais chaque déclaration **pour la classe qu'on adresse** ; ça a fait
tomber les « ambigus » de 6 à 2, et récupéré 4 membres.

---

## 5. Le tableau des verdicts

**Un seul avertissement, et il est décisif : tout ce qui est postérieur au rid 1068 vaut `error 1` et
n'est pas un fait de membre.** `error 1` sort du `except` extérieur de `ExecQuery`
(`RDOQueryServer.pas:162-164`) : c'est le serveur qui est cassé, pas le membre qui répond. Les 174
verdicts `UNKNOWN` du rapport machine sont, pour l'essentiel, cette valeur-là.

### Vague 0 — 23 propriétés, résultat valide et complet

| Verdict | Nombre | Détail |
|---|---:|---|
| propriété confirmée (`Nom="…"`) | **15** | `CompositeName`, `DAAddr`, `DALockPort`, `DAPort`, `EnableEvents`, `MailAccount`, `MailAddr`, `MailPort`, `ServerBusy`, `TycoonId`, `UserName`, `WorldName`, `WorldSeason`, `WorldXSize`, `WorldYSize` |
| `error 2` — objet illégal | **8** | `HoursOnAir`, `Interest`, `Maintenance`, `Name`, `RDOAcceptCloning`, `Rent`, `Stopped`, `Term` — toutes sur le bloc, voir §6 |

Les deux canaris de la vague 0 sont PASS, avant et après : le serveur était sain à la fin de la
vague 0.

Valeurs relevées au passage, utiles à S6 : `DAPort="#7000"`, `DALockPort="#7001"`,
`MailPort="#10000"`, `EnableEvents="#255"` (et non `#-1`), `WorldSeason="#1"`.

### Vague 1 — 9 trames valides avant l'incident

| Membre | Réponse | Ce que ça établit |
|---|---|---|
| `ClientAware` | ack vide | publié sur `TClientView` |
| `GetCompanyCount` | ack vide | publié |
| `GetUserName` | ack vide | publié |
| `GetChannelInfo` | ack vide | publié — et le corps a tourné avec un argument fantôme |
| `GetChannelList` | ack vide | publié — et son propre `except` a écrit « Error in GetChannelList » dans le Survival |
| `RDOCacncelTransc` | `error 2` | cible invalide, rien sur le membre |
| `RDODowngrade` | `error 2` | idem |
| `RDOStopUpgrade` | `error 2` | idem |
| `Comercials` | `error 2` | idem |
| `GetUserList` | `error 1` | **a cassé le serveur** |

**Un ack vide sous `"*"` ne classe rien** : fonction et procédure acquittent pareil. Ces cinq lignes
disent « publié sur cet objet », rien de plus. C'était le but assigné à la vague 1, et il est atteint
pour 5 membres sur 98.

`GetChannelList` mérite d'être relevé : déclarée `function:1`, appelée à 0 argument, elle a **acquitté
normalement** tout en journalisant son exception interne. Une trame malformée peut donc être
silencieuse au niveau RDO et destructrice au niveau du corps. C'est pire qu'une erreur.

### Vagues 2, 3, endgame — aucun verdict

Toutes les trames sont postérieures à l'incident. `error 1` partout, y compris sur `ClientAware`
dont on sait par ailleurs (sonde U1-a, 2026-08-16, 91 ms) qu'il répond `error 9`. **Aucun membre n'a
été classé function/procedure par ce run.**

---

## 6. Ce que je n'ai pas su adresser

### 6.1 Le bloc focalisé — 56 membres, et c'est une découverte

`SwitchFocusEx` a renvoyé `res="%283869292\r\nCompany Headquarters…"`. Les **13** trames adressées à
`sel 283869292` ont toutes répondu `error 2` (`errIllegalObject`), en `get` comme en `call`, et le
Survival de l'IS porte 8 × `Error at: TRDOObjectServer.GetProperty (126)` en face.

> **L'identifiant que renvoie `SwitchFocusEx` n'est pas une adresse d'objet RDO sur l'Interface
> Server.** Le binding `CurrBlock` de l'inventaire du lot A ne désigne donc pas une cible `sel`
> directement utilisable. **56 membres** du plan (tous les `TBlock`, `TFacility`, `TBankBlock`,
> `TTownHall`, `TPresidentialHall`…) sont inatteignables tant que la vraie résolution n'est pas
> trouvée.

C'est le point de blocage n°1 pour S5, et il est indépendant de l'incident.

### 6.2 Les 96 membres hors du plan, par raison typée

| Raison | Nombre | Ce que ça veut dire |
|---|---:|---|
| `socket-map` | 37 | Cache Server, port 7000. `ctx.emit` parle `world`. |
| `not-a-member` | 15 | pages `.asp`, noms d'objet pour `idof`, placeholders du harnais |
| `socket-mail` | 14 | Mail Server |
| `transport-c-http` | 10 | atteints en HTTP par une page ASP, jamais par une trame |
| `socket-directory` | 7 | session annuaire, fermée après login |
| `arity-unknown-no-safe-frame` | **6** | `Comercials`, `RDOAskLoan`, `RDOCnntId`, `RDOModifyProject`, `RDOModifyRating`, `RDOSetBuyingStatus` — aucune déclaration, donc aucune trame émissible |
| `socket-construction` | 5 | `TWorld`, port 7001 — **laissé fermé exprès**, c'est là que vivent les sept |
| `unknown-binding` | 1 | `RDOAutoRelease` |
| `excluded-irreversible` | 1 | `RDODisconnectFromTycoon` — #44, dossier volontairement ouvert (plan §7) |

**Comptabilité : 119 balayables + 96 non atteints + 2 interdits = 217.** Épinglé par un test, pour
qu'un membre ne puisse pas tomber des trois listes sans que ça se voie.

Le socket map est l'extension la plus rentable pour S5 : 37 membres, sur le Cache Server, avec des
objets scratch qu'on possède. Il est plus sûr que l'IS et il est déjà dans `SessionDriver`.

### 6.3 Une lacune de l'extraction S1, relevée au passage

`TCacheServer` (`Cache Server/CacheServerReportForm.pas:100-118`) publie `CreateObject`,
`CreateIterator`, `CloseObject`, `FindSuppliers`, `FindClients`, `SimTimeOut`, `CachePath`,
`WorldURL` — **huit membres `published` que `extract-rdo-arity.js` ne trouve pas**, alors que le
fichier est dans son périmètre. Le plan annonçait « aucun suspect dans la surface atteignable » ;
il y en a au moins huit. À corriger avant que S5 s'appuie sur l'extraction pour le socket map.

---

## 7. La séquence parc — tentée, impossible, avec sa raison

Elle a été construite dans l'ordre : **localiser, résoudre la classe, démolir, reconstruire,
vérifier**. La résolution de classe précède la démolition **exprès** — un parc qu'on ne sait pas
reconstruire est du contenu détruit sur le compte de test, c'est-à-dire exactement le motif
opérationnel des trois exclusions.

Au run, l'étape `locate` a émis `RDOFavoritesGetSubItems` et reçu `error 1` : le serveur était déjà
cassé. Les quatre étapes suivantes se sont sautées avec leur raison, dont
`demolish — no resolved class — refusing to demolish what cannot be rebuilt`. **Rien n'a été
démoli.**

Le compte possède bien des parcs : l'enregistrement du login en liste trois, `Park,982,979`,
`Park,941,1049` et `Park,878,1021`. La séquence a un sujet ; il lui manque un serveur.

---

## 8. Le gel, et son attribution

Il n'y a pas eu de gel au sens de 2026-08-14 : aucune trame n'est restée sans réponse pendant le
balayage, `stoppedOnSilence` est `false` sur les six suites, la session s'est fermée proprement
(logs serveur : `exitCode 0`, disconnect à 10:23:11).

Le silence est venu **après**, sur le run de santé de 10:35:54 : `TIMEOUT 60 s` sur
`idof InterfaceServer` (rid 1007), juste après le login. C'est ce qui a déclenché la lecture des logs
publics et l'attribution du §0.

Autrement dit : **le mécanisme d'attribution livré par S2 n'a rien vu**, et c'est correct — il
attribue les silences, et il n'y en a pas eu. La panne s'est présentée comme une réponse valide
(`error 1`) répétée 190 fois. **Aucun oracle du harnais ne surveille ça.** S6 devrait : un canari qui
échoue deux fois de suite avec le même code devrait arrêter le run.

---

## 9. Les témoins — non validés, et il faut le dire

Le prompt §10(3) demande si la méthode a reclassé correctement les `procedure` et `function` déjà
connus. **La réponse est : la question n'a pas pu être posée.** Les 7 témoins à 0 paramètre
(`ClientAware`, `ClientNotAware`, `GetCompanyCount`, `GetUserName`, `RDOCacncelTransc`,
`RDODowngrade`, `RDOStopUpgrade`) sont bien dans la vague 2, la vague 2 a bien tourné, et toutes ses
réponses sont l'`error 1` du serveur cassé.

La seule chose que la vague 1 a validée, avant l'incident, c'est que 5 de ces membres sont publiés
sur le ClientView — ce qu'on savait.

**La méthode de classification reste donc non validée en live.** Elle est correcte sur le papier
(§1.2), elle est encodée dans `classifyReply` avec ses citations ligne à ligne, et elle attend un
serveur.

---

## 10. Ce qui a été corrigé dans le code, et ce qui reste protégé

| Fichier | Changement |
|---|---|
| `rdo-request-guards.ts` | `FORBIDDEN_MEMBERS` + `assertMemberNotForbidden` ; **`assertNotVoidPush` reclassée garde de SÛRETÉ**, l'opt-in `probe` supprimé |
| `cli.ts` | édition 0 ; `--suite all` exclut le balayage |
| `types.ts` | `StepRisks` (un step peut porter plusieurs classes de risque) ; `StepPacket.probe` supprimé ; `SessionDriver` gagne `currentCompany` |
| `runner.ts` | `hasRisk` sur les deux portes ; `ctx.push` passe par `assertPacketSafe` |
| `suites.ts` | le refus inconditionnel en tête de `assertPacketSafe` ; le balayage au catalogue |
| `sweep-plan.ts` (nouveau) | 119 + 96 + 2 membres, chaque ligne citée `File.pas:Ligne` |
| `sweep.ts` (nouveau) | vagues 0, 2, 3, séquence parc, endgame ; vague 1 supprimée avec son explication |
| `doc/rdo-protocol-architecture.md` §8.5 | la ligne `"*"` scindée procedure/function ; la « retired claim » de 2026-07-02 **rétablie dans sa portée réelle** |
| `CLAUDE.md` | la règle des deux axes, et `assertNotVoidPush` requalifiée |

**Un changement que je n'ai pas fait, et qui devrait l'être.** `assertMemberNotForbidden` n'est
appelée que depuis le harnais. Pour que la passerelle elle-même refuse les sept, il faut une ligne
dans `spo_session.ts`, à côté des deux autres gardes (`:2345-2356`) — **fichier protégé, je m'arrête
et je le signale** comme le prompt §8 le demande.

### Sur la « retired claim » de 2026-07-02

Elle disait que `"*"` + QueryId « corrompt toutes les requêtes suivantes ». Elle a été retirée le
2026-07-02 comme réfutée par les captures. **Les captures qui l'ont retirée montrent toutes `"*"` sur
une `procedure` ou une propriété** — `AddLine`, `CloseMessage`, `RDOEndSession`, `set EnableEvents`.
Aucune ne montre `"*"` sur une `function`, et c'est ce cas-là que la revendication décrivait. Elle
avait raison sur le mécanisme et tort sur la portée ; le retrait avait raison pour les `procedure` et
tort de généraliser. Les deux moitiés sont maintenant écrites dans §8.5.

---

## 11. Vérifications

- `npm run typecheck` — vert.
- `npm test` — **6 336 tests, 243 suites, 0 échec.**
- `npx jest --testPathPatterns conformance` — 19 suites, 400 tests, vert.
- `npm run build` — vert.
- Couverture des fichiers touchés : `sweep.ts` 100 % lignes / 96 % branches, `sweep-plan.ts` 100/100,
  `cli.ts` 100/98,6, `suites.ts` 100/96,9, `runner.ts` 98,6/95,3, `types.ts` 100/100,
  `rdo-request-guards.ts` 100/95. Plancher demandé : 93 %.
- Gate étape 1 (rejeu mémoire) : **vert**, 50 pass / 0 fail, avant le run live.
- Enregistrements : `report/campaign/rec/planitia-2026-08-18-sweep.ndjson` (209 échanges),
  `-sweep-run.json` (rapport machine), `-sweep-console.log`.

---

## 12. Ce qui bloque S5

1. **Le serveur.** Redémarrage de l'Interface Server `planitia`, puis effacement délibéré de
   `.rdo-live/HALT`. Rien de live avant ça.
2. **La résolution du bloc.** 56 membres attendent de savoir comment obtenir une adresse d'objet RDO
   pour un bâtiment. `SwitchFocusEx` ne la donne pas. Piste : `ObjectAt`, ou le chemin cacher
   (`getObjectRdoId`, socket map).
3. **La polarité de `assertPacketSafe`.** Le prompt §7 la laissait à S5, à fermer « avec la liste de
   `function` prouvées que TU produis ». **Cette liste n'existe pas** — le run n'a classé aucun
   membre. S5 devra la prendre de l'extraction Pascal, pas du fil, et le lot S1 doit d'abord combler
   les huit membres manquants du §6.3.
4. **Deux décisions du développeur :**
   - la ligne dans `spo_session.ts` (fichier protégé) pour que la passerelle refuse les sept ;
   - faut-il ouvrir le socket map (37 membres, Cache Server, objets scratch) en S5 ? C'est
     l'extension la plus rentable et la moins risquée, mais elle sort du périmètre « socket world »
     que S4 s'est fixé.
5. **Un oracle qui manque.** Rien dans le harnais ne remarque un serveur qui répond `error 1` à tout.
   Deux canaris consécutifs en échec devraient arrêter le run.

---

## 13. Ce que je referais autrement

Le prompt invitait à contredire ce qui paraît faux plutôt qu'à l'appliquer. Je l'ai fait sur trois
points — la composition de la vague 2, l'ordre des membres qui terminent la session, l'exclusion
de #44 — et ces trois corrections ont tenu.

Je ne l'ai pas fait sur le quatrième, alors que j'avais la ligne du dispatcher sous les yeux et que je
l'avais recopiée dans le code : `@ResParam` ne passe pas de pointeur sous `"*"`. J'ai lu ça comme une
absence de risque au lieu d'une asymétrie entre l'appelant et l'appelé. La vérification qui manquait
tenait en une question — *« et l'appelé, lui, sait-il qu'il n'y a pas de pointeur ? »* — et la réponse
était dans le même fichier Pascal.
