# Faisabilité — se passer des pages ASP et requêter les serveurs en RDO

**Étude de principe, aucune écriture dans `src/`.**
Date : 2026-08-17 · Branche : `fix/rdo-pool-lifecycle-timeouts-probe`
Sources : `C:\Users\Robin Aleman\Documents\SPO\IIS_ROOT` (lecture seule) et
`C:\Users\Robin Aleman\Documents\SPO\SPO-Original` (lecture seule)
Suite de : [audit-transport-c-asp.md](audit-transport-c-asp.md) (session 7A)

---

## 0. Cadre de preuve

Même règle qu'en 7A. L'ASP et le Pascal sont du **source**, donc **sous** les captures live :

```
capture live  >  source ASP  ≈  source Delphi  >  [INFERRED]
```

Tout ce qui suit est **établi par source** sauf mention contraire. Deux marqueurs sont
utilisés : **[À SONDER]** pour ce qui exige une sonde live avant de s'engager, et
**[INFERRED]** pour ce que le source ne tranche pas.

Aucune sonde live n'a été lancée pour produire ce document.

> **Addendum du 2026-08-17 — voir [§12](#12-addendum-2026-08-17--laccès-distant-est-établi).** La
> question de faisabilité la plus structurante (« ces commandes sont-elles émissibles depuis
> l'extérieur du serveur ? ») a depuis été tranchée, et elle l'est au **niveau supérieur de la
> hiérarchie** : par capture live. Le §12 remplace sur ce point les verdicts *établis par source*
> du corps du document.

---

## 1. Les pages ASP ne sont pas un mécanisme, mais deux

`grep -rl` sur les 298 pages de `Five/0/Visual/Voyager` :

| Mécanisme | Fichiers | Ce que c'est réellement |
|---|---|---|
| `RDOClient.WinSockRDOConnection` + `RDOClient.RDOObjectProxy` | **41** | Un **client RDO mince**. Connexion à `DAAddr:DAPort`, `BindTo`, appel de membre, fin. La page ne fait que traduire une URL en trame RDO. |
| `CacheManager.CachedObject` | **54** | **Ce n'est pas du RDO.** Lecture de fichiers `.five` sur disque via `TFileStream` (`Cache/CacheObjects.pas:605`, `:699-707`), sous une racine lue au registre (`GetCacheRootPath`, `:144-148`). |

Les deux ensembles se recouvrent : `TycoonBankAccount.asp`, `TycoonAutoConnections.asp` et
`TycoonPolicy.asp` mutent en RDO puis relisent le cache fichier.

**Le seul RDO présent dans le chemin de lecture ne transporte pas la donnée.** Le COM
`CacheManager.CachedObject` se lie à `MSObjectCacherName` sur le Model Server
(`Cache/CacheManagerRDO.pas:248-293`, adresse et port lus dans `HKLM\…\Worlds\<monde>`) et
appelle `GetCache(Id, kind, info)` ou `RenewCache(Agent, ObjId)` — qui renvoient `resOK` ou
`resError` (`:138-202`). C'est une **demande de rafraîchissement** : le Model Server réécrit
le fichier de cache (`Cache/MSObjectCacher.pas:166-220`), et l'ASP relit le fichier.

Conséquence : côté Model Server, il n'existe **pas** de surface de lecture RDO pour ces
champs. Les 83 membres `RDO*` du Kernel sont presque tous mutatifs — les seules exceptions
sont `RDOGetBudget`, `RDOGetSubItems` et la famille `RDOFavorites*`.

---

## 2. Le levier — le Cache Server publie ce même cache en RDO

C'est le fait qui rend la bascule possible, et il n'apparaissait dans aucun document du repo.

`Cache Server/CachedObjectWrap.pas:19-39` — surface **`published`**, donc exposée en RDO par
`FIVECacheServer` (`Cache Server/FIVECacheServer.dpr`, serveur RDO monté sur
`WinSockRDOConnectionsServer`) :

```
ContainsFolder · SetClass · SetObject · SetObjectOfWorld · GetPath · SetPath
SetAbsPath · SetWorld · Properties · GetPropertyList · EnableReCache
GetIterator · GetInputNames · GetOutputNames · OpenGate · GetPropArray
RDODestroy · KeepAlive · Refresh · GetSubObject · GetSubObjectProps · SubObjCount
```

Et `TCachedObjectWrap.GetPropertyList` (`:209-237`) lit `fCachedObject.Properties[nom]` —
**le même `TCachedObject`**, issu du même `TWorldCacheSpool`, que le COM
`CacheManager.CachedObject` lit côté IIS (`Cache/CachedObjectAuto.pas:293-302`). Même
fichier, même TTL, même `RenewCache`.

Autrement dit : **tout ce qu'une page ASP peut afficher, le Cache Server peut le rendre en
RDO**, sans HTML.

**Nous parlons déjà ce protocole.** [spo_session.ts:1411-1480](../src/server/spo_session.ts#L1411-L1480)
implémente `cacherCreateObject` / `cacherSetObject` / `cacherSetPath` /
`cacherGetPropertyList`, et [building-management-handler.ts:41-63](../src/server/session/building-management-handler.ts#L41-L63)
fait **déjà** exactement la bascule visée — `SetPath("Tycoons\<nom>.five\")` puis
`GetPropertyList`, sur le chemin exact qu'utilisent les pages `NewTycoon/*`.

La bascule n'est donc pas un nouveau transport à écrire. C'est l'extension d'un transport
déjà en production.

---

## 3. La règle de nommage des propriétés — et son piège

Les pages écrivent `Obj.Budget`, `Obj.AccountValue(i)`, `Obj.AccountName(LangId, i)`. Ces
membres n'existent pas dans le type library : `Cache/CacheManager_TLB.pas:67-84` ne déclare
que `SetPath`, `SetWorld`, `SetClass`, `SetObject`, `Properties`, `Recache`, `ErrorCode`,
`ActivateDictionary`. Tout le reste passe par un **repli de dispatch** :
`TCachedObjectAuto.GetIDsOfNames` est surchargé (`Cache/CachedObjectAuto.pas:55-65`) et
mémorise le nom demandé ; `Invoke` (`:67-148`) le convertit en clé de propriété.

| Forme ASP | Clé de propriété lue | Citation |
|---|---|---|
| `Obj.Foo` | `Foo` | `CachedObjectAuto.pas:84-91` |
| `Obj.Foo(a)` | `Foo` + `a` | `:92-101` |
| `Obj.Foo(a, b)` | `Foo` + `rgvarg[0]` + `.` + `rgvarg[1]` | `:102-113` |

⚠ **Piège d'ordre — le point à ne pas rater.** Dans `DISPPARAMS`, COM range les arguments
**en ordre inverse** : `rgvarg[0]` est l'argument le plus à droite. La forme à deux arguments
se lit donc `Foo` + `b` + `.` + `a`, pas `Foo` + `a` + `.` + `b`.

Cette lecture est **confirmée par le recoupement écriture/lecture**, ce qui vaut mieux qu'une
citation de la documentation COM :

- Écriture : `Kernel/Accounts.pas:285` → `StoreMultiStringToCache('AccountName' + i + '.', …)`,
  et `Kernel/Languages.pas:243-249` ajoute l'indice de langue → clé réelle **`AccountName<i>.<lang>`**.
- Lecture : `TycoonProfitAndLoses.asp:123` → `Obj.AccountName(LangId, i)`.

Les deux ne coïncident **que** si l'ordre est inversé. Un portage qui construirait
`AccountName<lang>.<i>` remonterait des chaînes vides sur tous les comptes sauf le premier en
anglais — un échec silencieux, exactement du même genre que les bugs de la 7A.

**Noms de propriétés établis** (échantillon vérifié, non exhaustif) :

| Champ ASP | Clé de cache | Écriture |
|---|---|---|
| `Obj.Budget` | `Budget` | `Kernel/KernelCache.pas:968` (`WriteCurrency`) |
| `Obj.Prestige` | `Prestige` | `:973` (`WriteFloat`), `:870` (`WriteInteger`) |
| `Obj.Nobility` | `Nobility` | `:892` — confirme B-8 : le libellé de page est `Nobility`, pas `nobPoints` |
| `Obj.AccountCount` | `AccountCount` | `Kernel/Accounts.pas:300` |
| `Obj.AccountValue(i)` | `AccountValue<i>` | `:286` (`WriteCurrency`) |
| `Obj.AccountSecValue(i)` | `AccountSecValue<i>` | `:287` |
| `Obj.AccountLevel(i)` | `AccountLevel<i>` | `:288` |
| `Obj.AccountHistory(i)` | `AccountHistory<i>` | `:290` (`Account.History.Serialize`) |
| `Obj.AccountName(LangId,i)` | `AccountName<i>.<lang>` | `:285` + `Languages.pas:248` |
| `Obj.LoanBankName(i)` … | `LoanBankName<i>`, `LoanInterest<i>`, `LoanAmount<i>`, `LoanSlice<i>`, `LoanTerm<i>`, `LoanDate<i>`, `PayDate<i>` | `KernelCache.pas:792-798` |
| `LoanCount` | `LoanCount` | `:788` |

Deux gains immédiats visibles dans cette table :

1. **`WriteCurrency` livre la valeur brute.** Le passage par `FormatCurrency(v,0,0,0,-1)` de
   l'ASP disparaît — donc B-7 et B-20 (montants négatifs jamais lus) n'ont plus d'objet.
2. **`AccountHistory<i>` est la sérialisation directe** de `Account.History`. Le format reste
   **[INFERRED]** (`Account.History.Serialize`, non résolu ici), mais on le lit à la source au
   lieu de le pêcher dans une fenêtre de 500 caractères de HTML — B-37 disparaît par
   construction.

---

## 4. Table de bascule, page par page

Chemins relevés dans les pages elles-mêmes ; ils sont exactement de la forme que
`cacherSetPath` sait déjà émettre.

| Page ASP aujourd'hui | Remplacement RDO | Chemin / cible | Citation |
|---|---|---|---|
| `TycoonCurriculum.asp` | `SetPath` + `GetPropertyList` | `Tycoons\<nom>.five\` | `:13` |
| `TycoonCurriculum` (items) | `SetPath` + `GetIterator` | `Tycoons\<nom>.five\Curriculum\` | `:388-394` |
| `TycoonBankAccount.asp` (lecture) | idem | `Tycoons\<nom>.five\` | `:89` |
| `TycoonProfitAndLoses.asp` | idem | `Tycoons\<nom>.five\` | `:10` |
| `TycoonAutoConnections.asp` (lecture) | idem | `Tycoons\<nom>.five\` | `:10` |
| `TycoonPolicy.asp` (lecture) | idem + `world.five` | `Tycoons\<nom>.five\`, `world.five` | `:49`, `:55` |
| `popularratings.asp` / `ifelratings.asp` / `tycoonratings.asp` | `SetPath` + `GetIterator` | `Towns\<ville>.five\Ratings\` | `popularratings.asp:21` |
| `Build/KindList.asp` | `SetPath` ×2 + `SetClass` + `GetIterator` | `Companies\<c>.five\`, `Tycoons\<t>.five\`, `Classes\…` | `:11`, `:25`, `:166` |
| `Build/FacilityList.asp` | `SetPath` + `SetClass` + `GetIterator` | `Companies\<c>.five\`, `Classes\…` | `:11`, `:203` |
| `NewLogon/info.asp` | `SetClass` + `GetIterator` | `Classes\…` | `:12-16` |
| `NewLogon/facilityList.asp` | `SetClass` + `GetIterator` (+ exception §6b) | `Classes\…` | `:175-177` |
| `NewLogon/chooseCompany.asp` | **déjà 100 % RDO** — Interface Server | `GetClientView`, `GetCompanyCount`, `GetCompanyName`… | 7A §7.2 |

**Mutations — remplacement direct, membre pour membre.** Les signatures ont été établies en
7A §7.2 (`RDOAskLoan`, `RDOSendMoney`, `RDOPayOff`, `RDOAddAutoConnection`,
`RDODelAutoConnection`, `RDOHireTradeCenter`, `RDOSetAdvanceToNextLevel`, `RDOSetPolicyStatus`,
`RDOResetTycoonEx`, `RDOAbandonRoles`, `RDOLaunchCampaign`, `RDOCancelCampaign`…), et tous
figurent dans la surface `RDO*` du Kernel. Rien à découvrir : il reste à trancher le
séparateur par déclaration Pascal (§8).

---

## 5. Ce que la bascule supprime dans l'audit 7A

Ce n'est pas « moins de parsing ». C'est la disparition d'une classe entière de défauts.

| Bug 7A | Sort après bascule | Pourquoi |
|---|---|---|
| **B-1** payoff sans oracle | **disparaît** | `RDOPayOff` **est** une fonction ; son code de retour est capturé par l'appelant au lieu d'être jeté par la page (`TycoonBankAccount.asp:111`) |
| **B-2** `abandonRole` n'agit pas | **disparaît** | On appelle `RDOAbandonRoles`, pas une page de confirmation |
| **B-3** `AddDefaultSupplier.asp` inexistante | **disparaît** | `RDOAddAutoConnection` existe et est documenté |
| **B-4** `tycoonsratings` mort | **disparaît** | Plus de nom de fichier à écorcher : `SetPath` + `GetIterator` |
| **B-5** oracle de campagne faux dans les deux sens | **disparaît** | `RDOLaunchCampaign` rend 0/100/101/102 ; `RDOCancelCampaign` rend un résultat que la page jetait |
| **B-6** `links.asp` inexistante | **disparaît** | `RDOCacheTycoonLinks` / `RDOCacheCompanyLinks` |
| **B-7**, **B-20** montants négatifs | **disparaissent** | `WriteCurrency` brut, plus de `FormatCurrency` à dé-formater |
| **B-10** `displayName = "PGI&Folder="` | **disparaît** | Plus de regex sur du `<script>` |
| **B-12** `buildTime` contient une surface | **disparaît** | La clé s'appelle `Size` ; l'ambiguïté était née du HTML |
| **B-13** compagnies publiques dites « Private » | **disparaît** | Rôle lu comme propriété, pas comme mot dans un `<nobr>` |
| **B-14** `fluidName` = identifiant technique | **disparaît** | Le nom localisé est une clé `.<lang>` |
| **B-16** décalage des cellules de prêt | **disparaît** | `LoanBankName<i>` est indexé, plus de découpage positionnel |
| **B-17** intérêt/durée recalculés | **résolu** | Les valeurs serveur sont des propriétés (§7 réserve : la formule de repli reste à porter) |
| **B-18** désynchronisation des ratings | **disparaît** | Itérateur au lieu d'appariement par regex |
| **B-8**, **B-9**, **B-11**, **B-15**, **B-19** | **changent de nature** | Ne sont plus des défauts de parseur mais des règles métier à porter — voir §7 |

**Et surtout : toute la §5 de l'audit 7A devient sans objet.** Les 15 lignes marquées
*INSUFFISANTE* ou *FAUSSE* venaient d'un fait unique — « zéro `Response.Status` sur 298
pages, tout sort en HTTP 200 ». En RDO, un refus métier est un **code de retour typé**, et une
panne de liaison est une **erreur de transport**. L'oracle cesse d'être une heuristique.

Bénéfices structurels supplémentaires :

- **Localisation** : on lit `.<LangId>` sur la propriété au lieu de dépendre de l'arbre
  `Five/0` et des fichiers `.lng`. Les mondes non anglais deviennent atteignables.
- **Une seule pile de transport.** Le gate de conformité couvre alors la totalité du chemin,
  au lieu de s'arrêter à la frontière HTTP.
- **Fin des fixtures HTML.** Les 24 fixtures à re-dériver de 7A §6 sont remplacées par des
  paires nom/valeur.

---

## 6. Ce qui n'est **pas** remplaçable

Deux exceptions dures, et une mineure. Elles doivent rester en HTTP.

### 6a. `Mail/MessageList.asp` — le listing de dossier

`MessageList.asp:186` instancie `MailBrowser.MailBrowser`. Ce COM est un **parcours de
système de fichiers** : `TFolderIterator.Create(GetAccountPath(fWorld, fAccount) + fFolder, …)`
puis `fHeaders.LoadFromFile(… + tidMessage_Header)` (`Mail/MailBrowserAuto.pas:79`, `:136-139`).
Aucun RDO.

Et la surface RDO du Mail Server (`Mail Server/MailServer.pas:97-113`) **n'a aucun membre de
listing** :

```
Clients : NewMail · OpenMessage · DeleteMessage · Post · Save · CloseMessage
```

`OpenMessage(WorldName, Account, Folder, MessageId)` **exige déjà l'identifiant**. Il n'y a
donc pas de moyen RDO d'énumérer les messages d'un dossier.

Notre `mail-handler.ts` fait déjà tout le reste en RDO (`NewMail`, `AddLine`, `Post`,
`OpenMessage`, `GetHeaders`, `GetLines`, `GetAttachmentCount`, `GetAttachment`,
`CheckNewMail`) — **seul le listing reste en HTTP**
([mail-handler.ts:458](../src/server/session/mail-handler.ts#L458)).

**[À SONDER]** — `GetIterator` du Cache Server opère sous `CacheRootPath` ; l'arbre mail vit
sous `GetAccountPath`. Si les deux racines coïncident sur l'installation réelle, le trou se
referme. À trancher par une sonde, pas par le source.

### 6b. `Visual.VisualClass` — les classes visuelles

`facilityList.asp:161` et `Build/FacilityList.asp:187` instancient `Visual.VisualClass`
(`Cache/VisualClassAuto.pas`) : lecture de fichiers INI de classes (`ReadString`,
`ReadInteger`, `ReadBool`, `Open(ClassId)`). Aucun RDO, et aucune raison d'en avoir : ce sont
des **données statiques d'installation**.

Le bon geste n'est pas de les requêter mais de les **embarquer une fois** — c'est déjà ce que
fait [cluster-data.ts](../src/shared/cluster-data.ts) pour une partie.

### 6c. Mineur — la photo de profil

`RenderTycoon.asp:58` rend `<img src="/fivedata/userinfo/<monde>/<tycoon>/largephoto.jpg">`.
Cela reste un **asset HTTP**, mais ce n'est pas du parsing : une URL d'image, pas une page à
analyser. Accessoirement, B-11 la casse aujourd'hui — la bascule est l'occasion de la
réparer en construisant l'URL contre l'hôte et non contre le répertoire.

---

## 7. Le coût réel — le calcul serveur à porter

C'est ici que se trouve le travail, pas dans le transport. Les pages ASP font gratuitement
des calculs que nous devrons reprendre. Tous sont lisibles dans le source :

| Règle | Citation ASP | Conséquence si oubliée |
|---|---|---|
| `TycoonLevel`, forcé à 0 si `SuperRole <> 0` | `KindList.asp:31`, `:40-47` | Catalogue de construction faux pour maires/ministres |
| `Available` d'une installation, dérivé de `Technology` / `Uniqueness` / `RequiredLevel` | `Build/FacilityList.asp:208-215` | B-15 persiste sous une autre forme |
| Intérêt et durée par défaut du prêt (`Math.round(200 - x)` **puis** borne à 5) | `TycoonBankAccount.asp:226-232` | B-17 persiste — l'ordre arrondi/borne compte |
| Vraie condition de `canUpgrade` : `FullAccess and (NextLevelName <> "") and Demo <> 1` | `TycoonCurriculum.asp:250-260` | B-9 persiste |
| Description du cluster — cinq clusters littéraux seulement | `NewLogon/info.asp:103-114` | Description vide pour `IFEL`, `UW`, `Generic`, `Common` (déjà le cas aujourd'hui) |
| Repli d'icône `images/nopicture.jpg` | `RenderTycoon.asp:46-47` | Image cassée au lieu d'un repli |

Environ **six règles métier**. Deux d'entre elles (`canUpgrade`, intérêt/durée) sont
précisément des bugs ouverts de la 7A : les porter **est** le correctif.

**Réserve de fidélité.** Certaines de ces règles s'appuient sur des propriétés dont la
présence dans le cache n'a pas été vérifiée ici (`Technology`, `Uniqueness`, `RequiredLevel`,
`FullAccess`). **[À SONDER]** : un `GetPropertyList` sur un `Companies\<c>.five\` réel
tranchera en une requête.

---

## 8. Risques et points de vigilance

1. **Séparateur RDO — la règle de `CLAUDE.md` s'applique entièrement.** `GetPropertyList` est
   une `function` (`CachedObjectWrap.pas:28`), donc `"^"` y est légal — et c'est déjà ce que
   nous émettons. Mais **chaque membre `RDO*` du Kernel devra être vérifié un par un** sur sa
   déclaration Pascal (`function` vs `procedure`) avant choix de séparateur. Le fait qu'une
   page ASP capture un résultat n'établit pas la déclaration — réserve déjà posée en 7A §7.2.

2. **Fraîcheur.** `EnableReCache` (`CachedObjectWrap.pas:29`) et `SetPath` déclenchent le même
   `RenewCache` vers le Model Server que l'ASP. La sémantique est préservée, mais **c'est nous
   qui devrons la décider explicitement** : aujourd'hui la page choisit pour nous, et pas
   uniformément (`popularratings.asp:11` passe `Recache = true`, `tycoonratings.asp:11` non).
   Une bascule qui ignore ce paramètre lira du cache périmé sans le signaler.

3. **Cycle de vie des objets temporaires.** Chaque lecture coûte un
   `CreateObject` / … / `CloseObject` sur le socket map. Le sémaphore existe déjà dans
   [building-details-handler.ts](../src/server/session/building-details-handler.ts) ; il
   faudra le redimensionner, et surveiller la fuite de handle déjà signalée dans la mission de
   couverture. `KeepAlive` et `RDODestroy` sont publiés — à câbler.

4. **Le double slash de `getBaseURL()` disparaît avec les pages.** Rien à conserver : c'était
   une fidélité au client de référence, sans objet hors HTTP (7A §4).

5. **Ce document n'a pas été validé en live.** Tous les verdicts sont *établis par source*.
   Une capture qui les contredirait l'emporte.

---

## 9. Ordre de bascule recommandé

Du plus rentable au plus coûteux, chaque lot étant livrable seul :

| Lot | Contenu | Gain |
|---|---|---|
| **1 — mutations** | Les 11 actions ASP → membres `RDO*` directs | Ferme B-1, B-2, B-3, B-5, B-6 (gravité 1) et supprime la §5 pour ces chemins. Zéro parsing supprimé mais zéro parsing ajouté. |
| **2 — lectures tycoon** | Curriculum, banque, P&L, auto-connexions, policy | Un seul `SetPath` (`Tycoons\<nom>.five\`) couvre les cinq. Ferme B-7, B-8, B-14, B-16, B-17, B-20. |
| **3 — ratings** | `popularratings`, `ifelratings`, `tycoonratings` | `SetPath` + `GetIterator`. Ferme B-4, B-18. |
| **4 — templates de construction** | `info`, `facilityList`, `KindList`, `FacilityList` | `SetClass` + `GetIterator`. Ferme B-10, B-12, B-15, B-19. Lot le plus lourd (règles `Available` et `TycoonLevel`). |
| **hors bascule** | `MessageList.asp`, `Visual.VisualClass`, photo `/fivedata/` | Restent en HTTP, documentés comme tels. |

Après les lots 1 à 4, le transport C se réduit à **une** page ASP (`MessageList.asp`) et deux
sources de données statiques.

---

## 10. Ce que cette étude n'a pas fait

- **Aucune sonde live.** Les trois **[À SONDER]** (portée de `GetIterator` sur l'arbre mail,
  présence de `Technology`/`Uniqueness`/`RequiredLevel` dans le cache compagnie, format de
  `AccountHistory<i>`) restent ouverts.
- **Aucune vérification de séparateur** sur les membres `RDO*` du Kernel — travail de
  `rdo-conformity` + `delphi-archaeologist` au moment d'écrire le code, pas avant.
- **Pas d'inventaire exhaustif des noms de propriétés.** La table §3 est un échantillon
  vérifié couvrant le curriculum, la banque et le P&L. Les pages de construction et de
  politique restent à dépouiller de la même manière.
- **Aucune écriture dans `src/`.**

---

## 11. Sources

Aucune skill invoquée — lecture directe des deux corpus. Les skills `rdo-conformity` et
`delphi-archaeologist` sont **requises avant la première ligne de code** de la bascule, par la
règle de `CLAUDE.md`.

Fichiers déterminants :

- `SPO-Original/Cache Server/CachedObjectWrap.pas` — la surface RDO du cache (§2)
- `SPO-Original/Cache/CachedObjectAuto.pas:55-148` — la règle de nommage et son inversion (§3)
- `SPO-Original/Cache/CacheManagerRDO.pas:138-293` — ce que `GetCache`/`RenewCache` font vraiment (§1)
- `SPO-Original/Kernel/Accounts.pas:275-301`, `Kernel/Languages.pas:243-249` — clés du P&L (§3)
- `SPO-Original/Kernel/KernelCache.pas:783-800`, `:875-893`, `:960-975` — clés tycoon et prêts (§3)
- `SPO-Original/Mail/MailBrowserAuto.pas:79-155`, `Mail Server/MailServer.pas:97-113` — l'exception mail (§6a)

---

## 12. Addendum 2026-08-17 — l'accès distant est établi

**Question posée par le développeur :** les commandes RDO peuvent-elles être émises depuis
l'extérieur du serveur, ou faut-il être sur la même machine ?

**Réponse : depuis l'extérieur, sans restriction — et ce n'est pas une capacité à acquérir, c'est
une capacité déjà en production.** Contrairement au reste du document, ce verdict n'est pas
*établi par source* : il est **établi par capture live**, donc au sommet de la hiérarchie du §0.

### 12.1 Preuve de niveau 1 — capture live

Trames extraites de `report/campaign/rec/planitia-2026-08-17.ndjson`, l'enregistrement du run de
conformité qui a armé le gate. Elles sont parties de notre passerelle et ont traversé le réseau
jusqu'à planitia :

```
C 1057 idof "WSObjectCacher";
C 1066 sel 81232292 call SetPath "^" "%Tycoons\SPO_test3.five\";
C 1067 sel 81232292 call GetPropertyList "^" "%IsMayor<TAB>Town<TAB>IsCapitalMayor<TAB>IsPresident<TAB>IsMinister<TAB>Ministry<TAB>";
```

13 occurrences le 2026-08-17, 22 le 2026-08-16. **Ce sont exactement les trames de la bascule
décrite au §4**, chemin `Tycoons\<nom>.five\` compris. Le préfixe `%` confirme au passage
l'encodage OLEString des arguments.

### 12.2 Preuve de niveau 2 — notre propre code

[spo_session.ts:966-976](../src/server/spo_session.ts#L966-L976) :

```ts
await this.createSocket('map', this.currentWorldInfo?.ip || '127.0.0.1', RDO_PORTS.MAP_SERVICE);
// puis : idof "WSObjectCacher"
```

`RDO_PORTS.MAP_SERVICE = 6000` (`src/shared/types/protocol-types.ts:11`). L'adresse est l'IP du
monde fournie par le Directory, donc **distante** ; le `127.0.0.1` n'est qu'un repli.

### 12.3 Preuve de niveau 3 — source Delphi

| Fait | Citation |
|---|---|
| L'écouteur ne pose **que** le port sur un `TServerSocket` et n'assigne **jamais** `Address` — donc `INADDR_ANY`, toutes interfaces | `Rdo.IS/Server/WinSockRDOConnectionsServer.pas:501-514` |
| Le Cache Server est créé exactement ainsi | `Cache Server/CacheServerReportForm.pas:367-369` |
| **Voyager, qui tourne sur la machine du joueur**, ouvre une `TWinSockRDOConnection('Cache Server')` vers une adresse distante puis `BindTo(WSObjectCacherName)` | `Voyager/URLHandlers/ObjectInspectorHandleViewer.pas:244-247`, `:503` |
| Cette adresse est **servie au client distant par l'Interface Server** via `IClientView.getCacheAddr` / `getCachePort` | `Voyager/VoyagerServerInterfaces.pas:222-223` |
| La surface publiée annoncée au §2 est confirmée mot pour mot | `Cache Server/CachedObjectWrap.pas:18-39` |

L'accès distant n'est donc pas toléré : **il est publié par le serveur lui-même**. La localité des
pages ASP était un artefact d'hébergement — IIS colocalisé avec les serveurs de jeu — et non une
contrainte de protocole. Aucun blocage de topologie ne pèse sur la bascule.

### 12.4 Trois `procedure` dans la surface publiée — corrigé le 2026-08-17 (lot L0)

`Cache Server/CachedObjectWrap.pas:18-39` expose **18 `function`, 3 `procedure`** (plus 2 propriétés
publiées) :

| Membre | Ligne | Séparateur correct |
|---|---|---|
| `RDODestroy` | `:35` | `"*"` |
| `KeepAlive` | `:36` | `"*"` |
| `Refresh` | `:37` | `"*"` |

Aucun des trois n'était dans `VOID_MEMBERS`
([rdo-request-guards.ts](../src/server/session/rdo-request-guards.ts)) ; le lot L0 les y a ajoutés,
chacun avec sa citation Pascal vérifiée.

> **⚠ Correction — la première rédaction de ce §12.4 surestimait le risque.** Elle affirmait que
> « ce sont précisément les membres sur lesquels `"^"` gèle l'Interface Server » et faisait de leur
> ajout « un préalable strict » au lot 1. **C'est faux, et le mécanisme le dit.**
>
> Le gel exige que `RegsUsed` atteigne `MaxRegs = 3` pour que le pointeur de résultat parte sur la
> **pile** (`cmp RegsUsed, MaxRegs` / `jz @PushResParam` / `push edi`,
> `RDOObjectServer.pas:292`). Ces trois membres sont des `procedure` **sans aucun paramètre** : le
> pointeur reste en **registre**, la pile reste équilibrée, et le serveur répond `error 9`. C'est
> exactement le résultat de la sonde **U1-a** (`ClientAware`, 0 paramètre → `A<rid> error 9;` en
> 91 ms). **Le gel du 2026-08-14 ne pouvait pas venir de ces trois-là** — `SayThis` porte
> 2 widestrings, d'où `RegsUsed = 3`.
>
> Ce que l'ajout apporte réellement : une **correction de conformité et de cohérence**. Un `"^"` sur
> ces membres ne gèlerait pas le serveur, mais laisserait le site d'appel incapable de savoir si la
> procédure a tourné. À faire avant de câbler `KeepAlive` et `RDODestroy` (§8.3) — pas parce que
> c'est dangereux, parce que c'est juste.

**La leçon générale, elle, tient :** le nombre de paramètres décide autant que le mot-clé
`procedure`. Un audit de séparateur qui ne regarde que `function` vs `procedure` sans compter les
paramètres classe mal le risque — dans les deux sens.

Le reste de la surface (`SetPath`, `GetPropertyList`, `GetIterator`, `SetClass`, `SetObject`,
`GetSubObjectProps`…) est en `function` : `"^"` y est légal, et c'est déjà ce que nous émettons.

### 12.5 Note de sécurité — le Cache Server n'authentifie pas

`Cache Server/CacheServerReportForm.pas:368` : `//ServerConn.AuthenticationMode := amSecure;`
— **commentée**. Aucune barrière d'identification sur la surface de cache.

Ce n'est pas un obstacle à la bascule : nous n'utiliserions que ce que Voyager utilise déjà, par
le chemin que le serveur publie. C'est en revanche un constat à consigner — un port 6000 ouvert
sur Internet expose l'arbre de cache en lecture à quiconque, indépendamment de nous.

### 12.6 Effet sur le document

Le §10 (« ce que cette étude n'a pas fait ») disait *aucune sonde live*. C'est désormais faux sur
ce point précis, et **seulement** sur celui-là : les trois **[À SONDER]** du §10 — portée de
`GetIterator` sur l'arbre mail, présence de `Technology`/`Uniqueness`/`RequiredLevel` dans le
cache compagnie, format de `AccountHistory<i>` — **restent ouverts**.

**Méthode.** Lecture directe des deux corpus plus des enregistrements live ; aucune skill invoquée.
`rdo-conformity` et `delphi-archaeologist` restent requises avant la première ligne de code, comme
le pose le §11.
