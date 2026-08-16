# P-M3 — inventaire des codes d'erreur, dérivé de la source serveur

> Établi le 2026-08-16. Objet : décider de `RDO_ERROR_CONTRACT=reject` **sans attendre du trafic**.
> Complète le recensement d'exécution (`GET /api/rdo-error-contract`), qui reste utile pour les
> fréquences réelles mais ne dit rien tant que la charge n'est pas représentative.

## 1. Pourquoi la source suffit ici

Le recensement d'exécution répond à « qui échoue en pratique ». La source répond à une question
plus utile pour la bascule : **quels codes peuvent atteindre quel site d'appel**. Et cette question
a une réponse exhaustive, parce que le serveur ne lève ses codes qu'à un nombre fini d'endroits,
tous localisés dans deux unités.

**Fait structurant : le code d'erreur dépend de la forme du verbe, pas du membre.**
`GetProperty`, `SetProperty` et `CallMethod` sont trois fonctions distinctes avec trois jeux de
sorties disjoints. Le membre visé ne change que *si* l'erreur survient, jamais *laquelle*.

## 2. Les 18 codes (`Rdo/Common/ErrorCodes.pas:6-23`)

| Code | Nom | Levé où |
|---|---|---|
| 0 | `errNoError` | — |
| 1 | `errMalformedQuery` | `RDOQueryServer.pas:121, 156, 163, 173, 508` |
| 2 | `errIllegalObject` | `RDOObjectServer.pas:124, 185, 207, 329, 340` |
| 3 | `errUnexistentProperty` | `RDOObjectServer.pas:119, 176, 179` |
| 4 | `errIllegalPropValue` | `RDOObjectServer.pas:172` ; `RDOQueryServer.pas:286, 346, 378, 380` |
| 5 | `errUnexistentMethod` | `RDOObjectServer.pas:326` |
| 6 | `errIllegalParamList` | `RDOObjectServer.pas:322` |
| 7 | `errIllegalPropType` | `RDOObjectServer.pas:103, 164` |
| 8 | `errQueryTimedOut` | `WinSockRDOServerClientConnection.pas:268` |
| 9 | `errIllegalFunctionRes` | `RDOQueryServer.pas:484` |
| 10 | `errSendError` | `WinSockRDOServerClientConnection.pas:167` |
| 11 | `errReceiveError` | côté client uniquement |
| 12 | `errMalformedResult` | côté client uniquement |
| 13 | `errQueryQueueOverflow` | `WinSockRDOServerClientConnection.pas:278` |
| 14 | `errRDOServerNotInitialized` | initialisation serveur |
| 15 | `errUnknownError` | `WinSockRDOServerClientConnection.pas:287` |
| 16 | `errNoResult` | côté client uniquement |
| 17 | `errServerBusy` | `WinSockRDOConnectionsServer.pas:812` |

## 3. Matrice — quel code peut atteindre quelle forme d'appel

Nos 93 sites `sendRdoRequest()` se répartissent en **58 `call`, 11 `get`, 5 `idof`, 3 `set`**
(le reste passe par des paquets construits en variable).

| Code | `get` | `set` | `call` | `idof` | Commentaire |
|---|:-:|:-:|:-:|:-:|---|
| 2 `errIllegalObject` | ✔ | ✔ | ✔ | — | id périmé — **le cas qui compte**, voir §4 |
| 3 `errUnexistentProperty` | ✔ | ✔ | — | — | `get` retombe sur `CallMethod` (`:112-116`), donc rare en `get` |
| 4 `errIllegalPropValue` | ✔ | ✔ | — | — | en `get`, échec de **sérialisation** de la valeur |
| 5 `errUnexistentMethod` | — | — | ✔ | — | membre non publié — bug de notre côté |
| 6 `errIllegalParamList` | — | — | ✔ | — | mauvaise arité — bug de notre côté |
| 7 `errIllegalPropType` | ✔ | ✔ | — | — | type RTTI non géré |
| 9 `errIllegalFunctionRes` | — | — | ✔ | — | résultat non sérialisable — **c'est le code attendu pour `"^"` sur une `procedure`** |
| 1, 8, 10, 13, 15, 17 | ✔ | ✔ | ✔ | ✔ | transport / charge, indépendants de la forme |

**Les `set` ne retombent sur rien.** `SetProperty` n'a pas l'équivalent du `GetProperty` →
`CallMethod` : une propriété inexistante donne `errUnexistentProperty` sec
(`RDOObjectServer.pas:176`). C'est précisément ce qui rend la sonde U4-a fiable.

## 4. Ce que la bascule changerait réellement

Le rayon d'impact n'est **pas** les 93 sites. Il se réduit à trois familles :

**(a) Bugs de notre côté — 5, 6, 7.** Un membre non publié, une arité fausse, un type non géré.
Aujourd'hui ils sont avalés et le code continue avec une valeur vide. **Les faire lever est
exactement le but de la bascule** : ce sont des erreurs de programmation qui se taisent.

**(b) Transport et charge — 8, 10, 11, 13, 14, 17.** ⚠ **Cette section disait initialement « la
bascule ne les change pas ». C'était faux, et c'est le défaut le plus important trouvé en
appliquant la recommandation.**

`classifyRdoError` les marque `RECOVERABLE` et `executeWithRetry` les retente — mais la retentative
lit `result.errorCode` sur le paquet **résolu**. Le contrat, lui, agit plus tôt, dans le dispatch de
réponse : `entry.reject(contractError)` règle la promesse **avant** qu'`executeWithRetry` ne
l'inspecte. Basculer naïvement aurait donc **désactivé silencieusement l'auto-retentative** pour
`errQueryTimedOut`, `errSendError`, `errServerBusy` et les autres.

**Correctif appliqué :** le contrat ne rejette **jamais** un code `RECOVERABLE`, quel que soit le
mode. Ce n'est pas une concession de premier tour mais un **invariant** — le contrat et le
classifieur de retentatives partitionnent les codes, ils ne doivent pas se recouvrir. Fixé par test
(`rdo-error-contract.test.ts`, un cas par code, dans les deux modes).

*Trou résiduel, assumé :* un code `RECOVERABLE` qui survit à toutes ses retentatives se résout
toujours avec `errorCode` positionné, et personne ne le lit. Le fermer demande d'appliquer le
contrat dans `executeWithRetry`, **après** la décision de retentative — pas dans
`handleRdoErrorResponse`, qui s'exécute avant. Hors périmètre de cette bascule.

Note : le code **1** (`errMalformedQuery`) n'appartient pas à cette famille — il est `FATAL` et
signale une trame malformée de notre côté. Il est rejeté, avec (a).

**(c) Le seul risque réel — `errIllegalObject` (2).** Levé sur cinq sites
(`RDOObjectServer.pas:124, 185, 207, 329, 340`) chaque fois qu'un id d'objet ne résout plus :
`ClientViewId` après expiration de session, id de bâtiment démoli entre-temps, `cacherId` périmé
après reconnexion. Ces cas **arrivent en régime normal**, et du code qui aujourd'hui continue
tranquillement se mettrait à lever.

## 5. Recommandation — ✅ **APPLIQUÉE le 2026-08-16**

**Basculée, en exemptant `errIllegalObject` (2) au premier tour.**

`config.rdo.errorContract` a trois modes ; le défaut est désormais **`reject-except-stale`**.

| Codes | Comportement | Pourquoi |
|---|---|---|
| 1, 3, 4, 5, 6, 7, 9, 12, 15, 16 | **rejetés** (`RdoServerError`) | bugs silencieux — le gain de la bascule |
| **2** `errIllegalObject` | résolu, recensé | survient en jeu normal (id périmé) ; `RDO_ERROR_CONTRACT=reject` l'inclut |
| 8, 10, 11, 13, 14, 17 | résolu, recensé — **dans tous les modes** | invariant : ils appartiennent à `executeWithRetry` (voir §4b) |

Le bénéfice est acquis — les erreurs de programmation cessent de se taire — sans le risque
d'origine, qui était de « faire remonter d'un coup des années d'erreurs avalées, y compris
bénignes ».

**Validé en live le 2026-08-16 11:17 UTC.** La sonde U4-a a été rejouée sous le nouveau contrat :
les quatre `error 3` sont bien rejetés par le transport *et* correctement rapportés comme des
réponses par le harnais. Cette double lecture a exigé un correctif dans la sonde — un
`A<id> error N;` est une **réponse**, pas un échec de transport, et pour U4-a et U1-a le code
d'erreur **est** l'oracle. Sans ça, `runProbe` se serait arrêté sur sa règle d'ARRÊT TOTAL et aurait
rapporté « aucune réponse » pour un serveur qui répondait parfaitement.

**Ce que la source ne peut toujours pas dire, et qu'il faut mesurer :** la fréquence réelle de
`errIllegalObject` (2) en jeu. C'est la seule inconnue restante avant le second tour, et
`GET /api/rdo-error-contract` la donnera dès qu'une session de jeu normale aura tourné.

## 6. Vérification croisée — la seule donnée live disponible

Les quatre trames d'U4-a du 2026-08-16 ont produit quatre `error 3` sur un `set` visant une
propriété inexistante. Conforme à la matrice §3 : `set` + propriété absente →
`errUnexistentProperty`, sans repli. Le seul point de la matrice observé en conditions réelles à ce
jour, et il tient.

---

*Sources lues : `Rdo/Common/ErrorCodes.pas`, `Rdo/Server/RDOObjectServer.pas`,
`Rdo/Server/RDOQueryServer.pas`, `Rdo/Server/WinSockRDOServerClientConnection.pas`,
`Rdo/Server/WinSockRDOConnectionsServer.pas`.*
*Skills utilisées : `delphi-archaeologist`, `rdo-conformity`.*
