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

**(b) Transport et charge — 1, 8, 10, 13, 15, 17.** Déjà traités en amont : `classifyRdoError`
(`session/rdo-error-classifier.ts`) les classe et `executeWithRetry` retente les `RECOVERABLE`.
`errServerBusy` (17) a son propre chemin. **La bascule ne les change pas.**

**(c) Le seul risque réel — `errIllegalObject` (2).** Levé sur cinq sites
(`RDOObjectServer.pas:124, 185, 207, 329, 340`) chaque fois qu'un id d'objet ne résout plus :
`ClientViewId` après expiration de session, id de bâtiment démoli entre-temps, `cacherId` périmé
après reconnexion. Ces cas **arrivent en régime normal**, et du code qui aujourd'hui continue
tranquillement se mettrait à lever.

## 5. Recommandation

**Basculer, mais en exemptant `errIllegalObject` (2) au premier tour.**

Le contrat rejetterait 5, 6, 7 (bugs silencieux — le gain) et laisserait 2 se résoudre comme
aujourd'hui, le temps de voir ce que le recensement d'exécution en dit. Un troisième mode
`reject-except-stale` est un ajout de quelques lignes dans `handleRdoErrorResponse`, du même ordre
que la distinction déjà faite pour `VOID_MEMBERS` ailleurs.

Ça donne le bénéfice de la bascule — les erreurs de programmation cessent de se taire — sans le
risque d'origine, qui était de « faire remonter d'un coup des années d'erreurs avalées, y compris
bénignes ».

**Ce que la source ne peut pas dire, et qu'il faut mesurer :** la fréquence réelle de
`errIllegalObject` en jeu. C'est la seule inconnue restante, et `GET /api/rdo-error-contract` la
donnera dès qu'une session de jeu normale aura tourné.

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
