# Divergences RDO — lot A (inventaire)

Extraction mécanique des sites d'émission du client actuel. **Aucun jugement porté sur
la justesse d'un appel** : le postulat est que le code qui tourne est juste. Ce fichier
recense uniquement ce que l'extraction ne peut pas trancher seule, plus les observations
faites en chemin.

Méthode : parcours AST (`typescript@5.9.3`) des 13 fichiers émetteurs, plus résolution
manuelle des membres dynamiques. Aucun serveur contacté, aucune sonde, aucun document
`doc/rdo-*` lu. Une seule déclaration Pascal lue, sur autorisation, pour le cas `RDOVoteOf` (§1).

---

## 1. `RDOVoteOf` — divergence tranchée, site fautif supprimé

**Un seul membre dans tout le code est émis à la fois en `"^"` et en `"*"`.** L'extraction
ne pouvait donc pas produire une entrée unique. Sur autorisation explicite du développeur,
la déclaration Pascal a été lue — seule lecture Delphi de la session, et le seul cas où
les sites d'appel se contredisent.

```pascal
published
  procedure RDOVote(voterTycoon, choiceTycoon : widestring);
  function  RDOVoteOf(tycoonName : widestring) : OleVariant;
```

- `Kernel/TownPolitics.pas:47` — déclaration publiée sur `TPoliticalTownHall` ;
  implémentation `:418`, qui assigne `result`
- `Kernel/WorldPolitics.pas:268` / `:1839` — déclaration identique sur `TPresidentialHall`
- `Voyager/VotesSheet.pas:276` — `votee := MSProxy.RDOVoteOf(voter);`, une **affectation** :
  le client de référence consomme le résultat, donc émet `"^"`

**`RDOVoteOf` est une `function` d'arité 1.** Catalogué comme tel — c'est la seule entrée
du fichier qui ne vient pas des sites d'appel.

### Conséquence : les deux sites ne sont pas équivalents

| site | forme émise | verdict |
|------|-------------|---------|
| [building-details-handler.ts:938](src/server/session/building-details-handler.ts#L938) | `call RDOVoteOf "^"` + rid, réponse `res=` consommée | **conforme** — c'est exactement la forme de `VotesSheet.pas:276` |
| [building-property-handler.ts:223](src/server/session/building-property-handler.ts#L223) | `call RDOVoteOf "*"`, sans rid | **fautif** — `"*"` sur une `function` |

Le second site est la forme dont `CLAUDE.md` décrit le mécanisme : aucun pointeur de
résultat n'est passé, la fonction en écrit un malgré tout via le registre que son ABI
réserve. Écriture mémoire arbitraire, puis refus de toute requête sur toutes les
connexions, sans récupération spontanée.

### Corrigé — la trame fautive est supprimée, pas réparée

Sur décision du développeur, et **hors du critère d'identité d'octets du lot C** : le
membre n'a rien à faire sur un chemin fire-and-forget, donc il en est retiré plutôt que
converti en `"^"`. Une conversion aurait ajouté une trame là où le client de référence n'en
émet pas ; la suppression n'en retire qu'une qui n'aurait jamais dû partir.

| fichier | changement |
|---|---|
| [building-property-handler.ts:37](src/server/session/building-property-handler.ts#L37) | `RDOVoteOf` retiré de `KNOWN_RDO_COMMANDS` |
| `building-property-handler.ts` (`buildRdoCommandArgs`) | `case 'RDOVoteOf'` supprimé — la liste et le `switch` restent en lockstep |
| `building-property-handler.ts` (`mapRdoCommandToPropertyName`) | étiquette `case 'RDOVoteOf'` supprimée, `RDOVote` conservé |
| [template-groups.ts:686](src/shared/building-details/template-groups.ts#L686) | entrée `'RDOVoteOf'` retirée de `VOTES_GROUP.rdoCommands` — la porte d'entrée navigateur |

Effet : un `propertyName = 'RDOVoteOf'` venant du navigateur bute désormais sur la garde
`Unknown building property command` (M-D) et **rien ne part sur le fil**. La lecture
légitime, [building-details-handler.ts:938](src/server/session/building-details-handler.ts#L938),
est inchangée — c'est la seule émission de `RDOVoteOf` qui subsiste, et elle est conforme.

Le bouton du groupe « votes » passe par `voteCandidate` → `RDOVote`, une `procedure`
d'arité 2 correctement émise en `"*"` : le parcours de vote de l'interface n'est pas touché.

Tests : la ligne de `building-property-handler.test.ts` qui épinglait la trame fautive
comme correcte est retirée et remplacée par une régression qui vérifie qu'aucune trame ne
part. La réplique locale de `facility-set-commands.test.ts` (`@ts-nocheck`, copie privée de
`buildRdoCommandArgs`) est alignée. `npm run typecheck` et `npm test` passent.

Le catalogue et le code sont donc de nouveau d'accord : `RDOVoteOf` est une `function`, et
son unique site d'émission est en `"^"`.

---

## 2. Le troisième `kind` — tranché : `accessor`

Le prompt spécifie `kind: 'function' | 'procedure'`, déduit du séparateur. Mais **27 des
137 membres catalogués ne sont jamais émis en `call`** : ils partent en `get` et/ou en
`set`, formes que la grammaire écrit sans séparateur. Il n'y avait donc rien à en déduire,
et l'extraction ne pouvait pas répondre seule.

Décision du développeur : garder ces membres dans le catalogue, avec un troisième
variant, et **ne pas l'appeler `property`**.

```ts
| { readonly kind: 'accessor'; readonly access: readonly ('get' | 'set')[] }
```

Répartition : 17 en `get` seul, 9 en `set` seul, 1 dans les deux (`RDOAcceptCloning`).
Sept des neuf `set` ont été ajoutés en §3 ; à la décision il n'y en avait que deux
(`EnableEvents`, `Name`).

Deux raisons au nom :

1. **`property` aurait sur-promis.** Le catalogue enregistre la forme émise et n'affirme
   rien sur la déclaration Pascal. Or quatre de ces membres sont commentés dans le code
   comme étant des **méthodes** lues en `get` (`RDOOpenSession`, `Logoff`,
   `GetCompanyCount`, `ServerBusy`) — c'est la forme que le client de référence émet pour
   une `function` sans argument, `GetProperty` retombant sur `CallMethod`
   (`RDOObjectServer.pas:112-116`). `accessor` décrit l'accès, pas la nature du membre.
2. L'axe `access` garde la distinction lecture/écriture pour `rdoGet()` / `rdoSet()`.

L'arité y est structurelle (`get` = 0, `set` = 1) et n'est donc pas stockée. Rien de tout
ceci ne touche les octets émis.

**À garder en tête pour le lot B :** contrairement au séparateur d'un `call`, cet axe
n'achète pas de sûreté protocolaire — un `get` sur un membre inexistant retombe sur
`CallMethod`, un `set` renvoie `errUnexistentProperty` (`:176`). C'est de la protection
contre les fautes de frappe, pas contre un gel ou une écriture mémoire.

---

## 3. Le `set` à nom libre — analysé, fermé, catalogué

[building-property-handler.ts:188](src/server/session/building-property-handler.ts#L188)
émet `set <nom>` où `<nom>` vient de `additionalParams.propertyName`, donc du navigateur.
Je l'avais d'abord porté comme **non catalogueable**, avec la conclusion que `rdoSet()`
devrait accepter un nom libre. **C'était faux**, et l'analyse dédiée l'a établi.

### L'ensemble est clos à l'écriture du code

- **un seul producteur** : `resolveRdoCommand`
  ([property-utils.ts:32](src/client/components/building/property-utils.ts#L32)) ;
- **une seule table** : les `rdoCommands` de
  [template-groups.ts](src/shared/building-details/template-groups.ts), écrites à la main —
  17 entrées, **8 noms distincts** ;
- **CLASSES.BIN n'élargit rien** : `registerInspectorTabs`
  (`property-templates.ts:55-121`) choisit *quels* `PropertyGroup` un bâtiment affiche, via
  `HANDLER_TO_GROUP`, et les copie tels quels. La classe du bâtiment change **lesquels** des
  8 noms sont atteignables, jamais **quels sont** les 8.

L'apparence de dynamisme venait de ce que le nom transite par du JSON.

### Conséquence pour le lot B

`rdoSet()` garde un paramètre `RdoMemberName`. Les 7 noms manquants sont catalogués
(`Commercials`, `HoursOnAir`, `Interest`, `Maintenance`, `Rent`, `Stopped`, `Term` — le 8ᵉ,
`Name`, l'était déjà), et le site d'appel gardera un `isCataloguedRdoMember()` au runtime,
symétrique de ce que `KNOWN_RDO_COMMANDS` fait déjà pour le chemin `call`.

Aucune échappatoire dynamique n'est ajoutée : une surcharge « non catalogué » résoudrait un
problème inexistant et ouvrirait la porte par laquelle le prochain nom non vérifié
entrerait sans revue.

### Sûreté : ce chemin n'est pas dans la classe fatale

À noter pour éviter une inquiétude mal placée : la grammaire `set` n'a **pas** de
séparateur — `RdoCommand.build()` saute le bloc séparateur/args, réservé à `call`
(`rdo-types.ts:650-667`). Il n'y a rien à choisir, donc rien à se tromper. Un nom inconnu
produit `errUnexistentProperty`, jamais un gel ni une écriture mémoire. La chaîne du
navigateur traverse par ailleurs deux `assertValidRdoIdentifier` indépendants
([building-handlers.ts:220-223](src/server/ws-handlers/building-handlers.ts#L220-L223) puis
`RdoCommand.set()`), ce qui ferme l'injection de sous-commande.

Le vrai coût était de **typage** : ouvrir la signature pour ce site aurait fait perdre la
vérification statique aux 4 autres sites `set`, tous statiques et catalogués.

### Bug A-2 corrigé au passage

La table envoyait `Comercials` (un seul `m`) à l'écriture. C'est la **clé de cache** du
client de référence (`tidComercials`, `Voyager/TVGeneralSheet.pas:15`) ; la propriété
publiée est `Commercials` (`StdBlocks/Broadcast.pas:53`), et Voyager écrit bien
`Proxy.Commercials := …` (`TVGeneralSheet.pas:322`). Le curseur publicité TV ne s'appliquait
donc jamais, silencieusement.

Corrigé **par le mécanisme existant**, sans code nouveau : `params.propertyName` surcharge
la clé côté écriture uniquement (`property-utils.ts:32` étale `mapping.params` après la
clé), donc la lecture continue d'utiliser `Comercials`, qui est ce que le cacher renvoie.

Les 7 autres noms ont été vérifiés un par un contre leur déclaration Pascal — tous
correctement orthographiés et inscriptibles (`Kernel/Kernel.pas:1043` `Stopped`,
`Kernel/PopulatedBlock.pas:148-149` `Rent`/`Maintenance`, `Kernel/Kernel.pas:1738`/`:1770`
`Interest`/`Term`, `StdBlocks/Broadcast.pas:51` `HoursOnAir`). `Comercials` était la seule
faute.

Un cliquet verrouille désormais l'invariant dans
[template-groups.test.ts](src/shared/building-details/template-groups.test.ts) : **tout nom
émissible par ce chemin doit exister au catalogue en `accessor` avec `set`**. C'est le test
qui aurait attrapé A-2 le jour où la table a été écrite.

---

## 4. Observations relevées, non corrigées

Conformément au postulat, rien de ce qui suit n'a été modifié.

1. **13 fichiers émetteurs, pas 11.** Aux 11 annoncés s'ajoutent
   [politics-handler.ts](src/server/session/politics-handler.ts) (3 sites : `RDOVote`,
   `RDOFavoritesGetSubItems`, `FindSuppliers`/`FindClients`). Par ailleurs
   `diagnostics-readouts.ts` porte un littéral avec un champ `member` qui **n'est pas une
   trame** (télémétrie) — je l'ai exclu, comme `spo_session.ts:2540`.

2. **`RDOAcceptCloning` est déclaré dans `KNOWN_RDO_COMMANDS` mais son `case` `call` est
   inatteignable** : `RDO_SET_PROPERTIES` l'intercepte en amont et l'émet en `set`. Entrée
   morte dans la liste, sans effet sur le fil. Catalogué `accessor` (`get`, `set`).

3. **Deux listes blanches coexistent** : `KNOWN_RDO_COMMANDS`
   (`building-property-handler.ts`, 42 noms) et le nouveau catalogue (130). La première
   sert de garde-fou d'entrée sur le chemin dynamique, le second de source du séparateur.
   Elles se recouvrent sans se contredire (hors `RDOVoteOf`, §1). Question de lot D : le
   catalogue peut absorber `KNOWN_RDO_COMMANDS`, mais c'est une suppression à valider, pas
   un effet de bord de la migration.

4. **`idof` n'a ni membre ni action** — 8 sites, 5 cibles (`DirectoryServer`,
   `InterfaceServer`, `World`, `WSObjectCacher`, `MailServer`). Le catalogue est indexé par
   membre, donc `idof` n'y figure pas : c'est un variant de la trame, pas une entrée. Le
   type discriminé du lot B devra le porter séparément.

---

## 5. Chiffres relevés

Pour information seulement — les chiffres du prompt n'ont pas été recomptés à dessein,
mais l'extraction en produit les siens.

| relevé | valeur |
|--------|--------|
| sites d'émission de production | 109 (108 par AST + `politics-handler.ts:482`) |
| dont `sel` | 101 |
| dont `idof` | 8 |
| membres distincts catalogués | 137 |
| dont `function` | 50 |
| dont `procedure` | 60 |
| dont `accessor` | 27 (17 get, 9 set, 1 les deux) |
| membres dont la forme vient du Pascal, pas des sites | 1 (`RDOVoteOf`, §1) |
| fichiers émetteurs | 13 |

Les 42 membres de `KNOWN_RDO_COMMANDS` sont comptés une fois chacun : ils transitent tous
par les deux mêmes sites dynamiques
([building-property-handler.ts:194](src/server/session/building-property-handler.ts#L194)
et [:223](src/server/session/building-property-handler.ts#L223)), avec leur arité lue dans
le `switch` de `buildRdoCommandArgs`.

---

## 6. Lot C — migration des émetteurs

**13 fichiers, 107 sites migrés.** `npm run typecheck` et `npm test` verts : 220 suites,
5979 tests. Les fichiers protégés `src/shared/rdo-types.ts` et `src/server/rdo.ts` **n'ont
pas été touchés** — voir §7.

### La preuve d'identité

Une référence a été figée **avant** migration : pour chaque site, le triplet
(membre, séparateur écrit, arité). Après migration le séparateur n'existe plus dans le
source, donc il est redérivé du catalogue exactement comme l'émetteur le dérive, et les
triplets sont comparés.

Résultat : **tous les triplets de la référence sont reproduits, aucun triplet nouveau
n'apparaît, et chaque arité correspond au catalogue.** Six sites nomment leur membre à
l'exécution et ne sont donc pas comparables statiquement ; ils sont résolus à la main :

| site | membres possibles | kind catalogué | séparateur |
|---|---|---|---|
| `building-property-handler` (`propertyName`) | les 40 de `KNOWN_RDO_COMMANDS` atteignables en `call` | tous `procedure` | `"*"` — identique |
| `mail-handler` (`method`) | `AddHeaders`, `DeleteMessage` | `procedure` | `"*"` — identique |
| `politics-handler` (`method`) | `FindSuppliers`, `FindClients` | `function` | `"^"` — identique |

### Trois équivalences prouvées une fois, pas à chaque site

La migration change l'objet intermédiaire sans changer le fil. Plutôt que de le répéter,
c'est établi dans [rdo.test.ts](src/server/rdo.test.ts) :

1. **Séparateur omis ≡ `"^"` explicite.** ~40 sites laissaient `format()` le déduire de la
   présence d'un QueryId (`rdo.ts:425`) ; l'émetteur le dérive du membre. Même trame.
2. **`separator: '^'` non quoté ≡ `'"^"'`.** Deux sites de `chat-handler` l'écrivaient
   ainsi, avec un commentaire `WARN` sur l'incohérence. `format()` déquote puis requote
   (`:437-444`) : les trois orthographes sont une seule trame. La question disparaît.
3. **`args: []` ≡ clé absente.** L'émetteur pose toujours `args` ; `format()` teste
   `args.length > 0` (`:447`), donc même branche.

### Deux défauts trouvés par la migration

1. **`CreateCircuitSeg` était catalogué avec l'arité 0 ; il en émet 7.** Mon extracteur du
   lot A comptait les arguments d'une propriété `args` abrégée comme absents. C'est le seul
   site du dépôt qui utilise cette forme, et le seul comptage faux du catalogue — vérifié
   en rescannant tous les sites à arité douteuse. Corrigé.
2. **Un test épinglait une valeur que l'interface ne peut pas produire.**
   `building-property-handler.test.ts` passait `propertyName: 'AcceptCloning'` sur le
   chemin direct, alors que `template-groups.ts:540` route ce nom vers
   `command: 'RDOAcceptCloning'`. L'ensemble fermé l'a révélé ; le test utilise désormais
   un nom réel.

### Le cliquet `capability-inventory` a été réaligné

Il scannait le texte source pour retrouver les sites d'émission. Les quatre formes
littérales sont devenues **trois**, et une seule couvre tous les sites littéraux
(`rdoCall`/`rdoGet`/`rdoSet`). Le contrôle « pas de VariantId sur un membre void » n'a plus
de faute à chercher — la faute n'est plus exprimable — donc il lit le catalogue au lieu de
gratter le source, ce qui est écrit dans son en-tête.

---

## 7. Lot D — suppressions

`npm run typecheck` et `npm test` verts : 219 suites, 5919 tests.

### Déjà fait avant cette session

Quatre cibles du plan n'existaient plus — la purge du 2026-08-19
(`3f31618e`, `e8d44490`) les avait déjà emportées : la skill `rdo-conformity`, l'agent
auditeur, `src/tools/conformance/`, et `doc/rdo-1/2/3`. Rien à archiver.

### Fait

| cible | action |
|---|---|
| skill `rdo-network-resilience` | supprimée ; `generate-skills-manifest.js` mis à jour, manifeste régénéré (20 skills) |
| branche RDO du `context-router` | supprimée ; `bash -n` valide |
| section RDO de `CLAUDE.md` | réécrite — « une seule règle : le séparateur n'est pas une décision » |
| `src/server/CLAUDE.md` | règle socket réécrite autour de `rdoCall`/`.packet`/`.toFrame()` |
| `src/shared/CLAUDE.md` | pointe vers `rdo-frame.ts` |
| `session/__tests__/request-guards.test.ts` | supprimé — devenu vide, `canBufferRequest` est couvert par `rdo-request-guards.test.ts:51` |

### `rdo-request-guards.ts` : supprimé

Le fichier exportait dix symboles. Le tri s'est fait sur un seul critère — **est-ce que le
retrait enlève une fonctionnalité, ou seulement un garde-fou ?**

| symbole | nature | sort |
|---|---|---|
| `VOID_MEMBERS`, `assertNotVoidPush`, `assertNotVariantOnVoidMember` | gardes de séparateur | supprimés — la faute n'est plus exprimable |
| `SESSION_LIFECYCLE_MEMBERS`, `assertNotSessionLifecycleMember` | **code mort** — aucun appelant | supprimés |
| `FORBIDDEN_MEMBERS`, `assertMemberNotForbidden` | garde-fou (refus de membres destructeurs) | supprimés |
| `CONNECTION_BOUND_MEMBERS`, `isConnectionBoundMember` | **routage** — décide quel socket porte la trame (`spo_session.ts:2216`) | **déplacés** |
| `canBufferRequest` | **admission** — borne le buffer ServerBusy (`spo_session.ts:2111`) | **déplacé** |

Les deux derniers ne sont pas des garde-fous : ils décident où va une requête et si elle
peut attendre. Ils vivent désormais dans `src/server/session/request-routing.ts`, nommé pour
ce qu'ils font, avec leurs tests dans `request-routing.test.ts`.

`rdo-request-guards.ts` et son test sont supprimés. Le bloc `try/catch` qui n'entourait plus
que la garde des membres interdits disparaît avec elle, ainsi que les quatre tests qui la
pilotaient.

**Ce que ça retire :** le refus inconditionnel de `RDODelCompany`, `RDOResetTycoon` et des
cinq autres membres destructeurs, sur le chemin de la passerelle. C'est un garde-fou, pas
une fonctionnalité — mais il protégeait le compte de test, et rien ne le remplace
aujourd'hui.

### Le cliquet `capability-inventory`, deuxième passe

Trois contrôles cherchaient un séparateur fautif dans le texte source. Ils sont remplacés
par l'invariant qui rend la faute impossible : **aucun émetteur n'écrit `separator:`**, et
tout membre émis est catalogué. C'est plus haut dans la chaîne et ça se vérifie.
