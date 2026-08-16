# Audit d'impact serveur — couche RDO du WebClient

> **Statut : passe complète, reprise à zéro depuis les sources primaires — 2026-08-14.**
> **Angle unique :** ce que notre client fait subir au processus Delphi de production, partagé
> entre tous les joueurs. Ni ergonomie, ni sécurité, ni perfs client.
> **Posture :** aucun rapport antérieur n'a servi d'entrée. Les `report/*.md` n'ont été ouverts
> qu'après figeage des conclusions, pour la seule §9.
> **Preuves :** chaque constat est cité des deux côtés. Les formes de trame de la §3 ont été
> **produites par exécution** des modules protocole compilés hors dépôt (§10).
> **Skills utilisées :** `rdo-conformity`, `delphi-archaeologist`, `code-guardian`, `spo-testing`.

---

## 1. Modèle serveur établi (à lire avant tout le reste)

Rien dans cet audit ne se comprend sans ces sept faits, tous vérifiés dans le source de
production (chemin de compilation confirmé par `FIVEInterfaceServer.dof:46`, qui pointe
`..\RDO\Common;..\RDO\Server` — donc `Rdo/`, pas les copies `Rdo.IS/` ou `Rdo.BIN/`).

| # | Fait | Source | Conséquence |
|---|------|--------|-------------|
| M1 | Le port client de l'Interface Server est servi par un **pool global de 24 threads** (`ISMaxThreads = 24`), partagé par **tous** les joueurs. Une seule file `fQueryQueue`, aucune section critique (`nil`). | `InterfaceServer.pas:20, 2628-2629` ; `WinSockRDOConnectionsServer.pas:573-575, 800-811` | Les requêtes pipelinées **d'une même connexion** s'exécutent concurremment. Ouvrir plusieurs sockets n'apporte aucun parallélisme supplémentaire. |
| M2 | Les lectures monde de l'IS passent **toutes** par `WorldProxy`, un proxy unique sur **une seule connexion** `fDAClientConn` vers le Model Server. | `InterfaceServer.pas:343-345, 2868-2876, 2788` | Point de convergence de tout le trafic de lecture. La connexion est *pipelinée* (`WinSockRDOConnection.pas:600-690`, un événement par requête), donc non sérialisante — mais unique. |
| M3 | Un **verrou global `fServerLock`** protège `Logon`, `AccountStatus`, `Logoff`, `GetUserList`, `GetChannelList/Info`, `GetUserCount`, `GetWorldYear/Population/Season`, **et tous les handlers d'événements modèle** (`RefreshArea`, `RefreshObject`, `RefreshTycoons`, `ModelStatusChanged`, `SystemMsg`…). | `InterfaceServer.pas:2620, 2754-2765, 3135, 3189, 3300, 3347, 3614, 3643, 3847` | Tout ce qui prend ce verrou **gèle aussi la diffusion des pushs vers le monde entier**. |
| M4 | `Logon` tient `fServerLock` **à travers 6 à 8 allers-retours inter-serveurs** : `RDOGetTycoon`, `CheckUserAccount` (HTTP), `fDSProxy.RDOSetCurrentKey` + 2 `RDOReadInteger`, `BindTo`, `.Id`, `.RealName`, `.Language`, puis `NotifyCompanionship` + `NotifyUserListChange`. `AccountStatus` de même. | `InterfaceServer.pas:3189-3293, 3131-3177` | Une reconnexion = un gel de l'IS entier pendant la durée cumulée de ces appels. |
| M5 | **`TInterfaceServer.Logoff` ne libère jamais le `TClientView`** : `fClients.Extract` retire de la collection, et `//ClientView.Free;` est **commenté**. | `InterfaceServer.pas:3314, 3326`. Non-destruction prouvée : `TCollection.AtExtract` retire l'élément du tableau et le **retourne**, sans aucun `Item.Free` (`Kernel/Collection.pas:308-323`) — à comparer à `AtDelete`, qui libère bien quand `RelKind = rkBelonguer` (`:276-306`). `TLockableCollection.Extract` n'ajoute que le verrou (`:703-711`). | Chaque cycle logon/logoff fuit un `TClientView` (+ 4 sections critiques, 2 collections, une référence de connexion DA) **définitivement**. Et surtout : un pointeur de ClientView périmé reste **lisible**, ce qui piège toute heuristique de validité de session. |
| M6 | Le Model Server expose **deux** ports : `DAPort` = 8 threads sans verrou ; **`DALockPort` = DAPort+1, UN SEUL thread, et toutes ses requêtes sérialisées sur `fWorld.WorldLock`** — le verrou de la simulation. Le cache embarqué du MS : 3 threads, même verrou. Le Cache Server autonome (port carte) : 16 threads, sans verrou. | `ModelServer.pas:1243, 1257-1264` ; `InterfaceServer.pas:2639-2640` ; `Cache Server/CacheServerReportForm.pas:13, 369` | Toute requête envoyée sur `DALockPort` **sérialise le monde entier**. |
| M7 | Garde-fous : requête max **1 Mo** — au-delà le serveur **ferme la socket** ; si le query server est `Busy`, il répond `A` + `error 17` **sans QueryId ni `;`** ; la file d'attente est **non bornée** ; aucun réaper d'inactivité sur le port client ; `RemoveQuery` est intégralement commenté. | `WinSockRDOConnectionsServer.pas:55, 777-783, 812, 874-909` | Pas de cap de connexions. Une trame malformée qui déséquilibre les guillemets fait grossir le buffer jusqu'à la **déconnexion**. |

### M8 — La règle de dispatch, la plus importante de toutes

Le marshalling serveur est un bloc assembleur qui **empile exactement ce qu'on lui donne**
(`RDOObjectServer.pas:233-298`) :

- Les paramètres remplissent EDX puis ECX (`RegsUsed` 1→3), le reste part sur la pile.
- **`@ResParam` (ligne 281-292)** : si `Res.VType <> varEmpty`, un **argument caché
  supplémentaire** `@Res` est ajouté — en EDX, en ECX, ou **`push edi`** si `RegsUsed = 3`.
- `RDOQueryServer.pas:419-424` : `"^"` (VariantId) pose `Res.VType := varVariant` ; `"*"`
  (VoidId) laisse `varEmpty`. **C'est là, et seulement là, que les deux séparateurs diffèrent.**
- `get` sur un membre qui n'est pas une propriété publiée retombe sur `CallMethod` **avec
  `varVariant`** (`RDOObjectServer.pas:113-115`) : `get X` ≡ `call X "^"`.

D'où la règle, valable dans les **deux** sens :

| Forme émise | Membre Delphi réel | Effet côté serveur |
|---|---|---|
| `"^"` ou `get` | `function` | ✅ correct — `@Res` est le résultat caché attendu |
| `"*"` | `procedure` | ✅ correct — aucun argument surnuméraire |
| `"^"` ou `get` | `procedure` **0 ou 1 paramètre** | ⚠️ bénin — `@Res` atterrit en EDX/ECX, la procédure l'ignore |
| `"^"` ou `get` | `procedure` **≥ 2 paramètres** | 🔴 **`push edi` jamais dépilé** (convention `register` : l'appelé nettoie ses propres paramètres pile, et il n'en a aucun) |
| `"*"` | `function` | 🔴 le pointeur de résultat caché **n'est jamais passé** : l'appelé écrit un variant à travers un registre/emplacement pile non initialisé, **et** `ret n` dépile ce qu'on n'a pas empilé |
| **arité incorrecte** | n'importe lequel | 🔴 même mécanisme : le bloc asm n'a aucune notion de la signature réelle |

**Corollaire à retenir : le danger ne vient pas du QueryId, il vient de l'accord
séparateur ↔ nature du membre ↔ arité.** Voir §8 pour l'affirmation projet que cela corrige.

---

## 2. Résumé exécutif, trié par catégorie d'impact serveur

| Cat. | Réf. | Constat | Statut |
|------|------|---------|--------|
| **1 — Comportement indéfini** | **S1** | `SayThis` (procédure Delphi à **2 paramètres**) émis avec `"^"` → mot surnuméraire empilé et jamais dépilé dans le processus Interface Server partagé | mécanisme **PROUVÉ**, conséquence **INFÉRÉE** |
| **1** | **S2** | Aucun garde-fou n'empêche la faute symétrique (`"*"` sur une *function*, ou mauvaise arité) : le choix est fait à la main, commentaire par commentaire, sans vérification outillée | **PROUVÉ** (absence de garde) |
| **3 — Fuite permanente** | **S3** | La « reconnexion légère » sonde l'ancien `ClientViewId` avec `get TycoonId` ; la fuite M5 garantit que la sonde **réussit toujours** → on ne se relogue jamais, on pilote un ClientView détaché | **PROUVÉ** |
| **4 — Contention verrou global** | **S4** | Chaque coupure de socket coûte à l'IS **deux balayages O(N²) sous `fServerLock`** (`DoLogoff` → `SetViewedArea(0,0,0,0)` → `NotifyCompanionship`, puis `Logoff` → `NotifyCompanionship`) | **PROUVÉ** |
| **4** | **S5** | 23 tentatives de reconnexion sur 5,5 min, sans plafond global passerelle : chaque échec qui bascule en `fullWorldRelogin` prend `fServerLock` sur 6-8 allers-retours inter-serveurs (M4) | **PROUVÉ** (mécanisme) / **INFÉRÉ** (ampleur) |
| **5 — Saturation lecture partagée** | **S6** | Le service « construction » est câblé en dur sur le port **7001**, alors que l'IS nous donne `DAPort` **et** `DALockPort` et qu'on jette la seconde valeur. Si 7001 = `DALockPort`, chaque requête sérialise la simulation entière (M6) | **PROUVÉ** (code) / **INCONNU** (valeur en production) |
| **6 — Désynchronisation de flux** | **S7** | Une seule mesure protège le cadrage serveur du texte utilisateur : `RdoValue.format()`. Tout chemin qui l'évite peut forger `"` → buffer non borné → **socket fermée par le serveur** à 1 Mo (M7) | **PROUVÉ** (mécanisme) / le filet actuel tient (§10) |
| **7 — Contamination inter-utilisateurs** | **S8** | Après reconnexion on renvoie `RegisterEventsById(<RDOCnntId périmé>)` — un **pointeur de socket serveur mort**. Si l'adresse a été réallouée, l'IS branche nos pushs sur la connexion **d'un autre joueur** | mécanisme **PROUVÉ**, occurrence **INFÉRÉE** |
| **7** | **S9** | `manageConstruction` écrit `RDOAcceptCloning = -1` sur le `TBlock` d'un bâtiment et ne le restaure jamais. Ce n'est pas un sémaphore : c'est une **préférence joueur persistante** (case à cocher de la fiche de gestion), sérialisée dans le backup | **PROUVÉ** |
| **8 — Charge de fond évitable** | **S10** | Deux lectures `SLOW` sur `RDOAcceptCloning` par action de construction, pour un protocole de verrouillage qui n'existe pas côté serveur | **PROUVÉ** |

Deux craintes fréquentes sont **écartées par les preuves** : le pool de 6 connexions monde
n'ouvre en réalité **aucune** socket (§6), et la cadence de nos timers est **inférieure** à celle
du client de référence (§6).

---

## 3. Constats détaillés — catégorie 1 : comportement indéfini

### S1 — `SayThis` : procédure à 2 paramètres émise avec `"^"`

**Notre code.** [chat-handler.ts:160-167](../src/server/session/chat-handler.ts#L160-L167) —
`member: 'SayThis'`, `separator: '"^"'`, deux arguments. Trame réellement produite
(**exécution**, §10) :

```
C 1042 sel 39751288 call SayThis "^" "%","%hello";
```

**Forme de référence.** Le client Voyager appelle `fISProxy.SayThis( Dest, Msg );` comme une
**instruction nue**, sans affectation de résultat
([`Voyager/URLHandlers/ServerCnxHandler.pas:2632`](../../SPO-Original/Voyager/URLHandlers/ServerCnxHandler.pas)).
Le dispatch COM laisse alors `Res.VType = varEmpty`, et le marshaller émet **`VoidId "*"`** —
`RDOMarshalers.pas:213-217` choisit le séparateur *uniquement* sur ce critère. Il émet aussi un
QueryId, car `TimeOut = DefTimeOut = 60000 ≠ 0` (`RDOMarshalers.pas:262`,
`RDOObjectProxy.pas:100`). La forme de référence est donc `C <id> sel N call SayThis "*" …`.

**Signature de production.** `procedure SayThis( Dest, Msg : widestring );` —
`Interface Server/InterfaceServer.pas:179`. **Deux paramètres, aucun résultat.**

> **Piège évité.** Le commentaire de `chat-handler.ts:159` justifie le `"^"` par « *Delphi
> `IClientView.SayThis` has an out ErrorCode param* ». La seule déclaration `function SayThis(…)
> : OleVariant` du dépôt legacy est **commentée** (`Protocol/Protocol.pas:330`). La variante à
> `out ErrorCode` est le *wrapper client* `TServerCnxHandler.SayThis`
> (`ServerCnxHandler.pas:80`), qui n'est pas une signature serveur.

**Mécanisme serveur exact.** Deux `widestring` → EDX et ECX, `RegsUsed = 3 = MaxRegs`. Puis
`@ResParam` : `Res.VType = varVariant` (posé par `"^"`, `RDOQueryServer.pas:422-424`) ⇒
branche `@PushResParam` ⇒ **`push edi`** (`RDOObjectServer.pas:288-292`). L'appelé est une
procédure `register` sans paramètre pile : il fait `ret` sans rien dépiler. Les trois `pop
edi/esi/eax` du bloc asm (lignes 295-297) lisent alors des valeurs **décalées de 4 octets** :
EDI reçoit `@Res`, ESI reçoit l'ancien EDI, EAX l'ancien ESI. Le cadre EBP de `CallMethod`
répare ESP à l'épilogue, mais **EBX/ESI/EDI remontent corrompus dans l'appelant**
(`TRDOQueryServer.CallCommand`), qui y détient ses pointeurs de chaîne et de variant.

**Catégorie 1. Statut : mécanisme PROUVÉ ligne à ligne ; conséquence INFÉRÉE.** L'issue la plus
probable est une AV rattrapée (`RDOObjectServer.pas:320-324`, puis
`WinSockRDOConnectionsServer.pas:342-344`) et une réponse perdue ; une corruption silencieuse
via un pointeur faussé est possible et non exclue. **Un plantage de processus n'est pas prouvé
et ne doit pas être affirmé.**

**Correction.** Aligner sur la référence : `writeRdoFrame(socket,
RdoCommand.sel(ctx).call('SayThis').push().args(…).build())`. Si la détection d'erreur compte,
la forme QueryId + `"*"` est celle qu'émettait réellement Voyager, et le serveur y répond
`A<id> ;` — elle est légale, seule la convention maison l'interdit (§8).

### S2 — Rien n'outille l'accord séparateur ↔ nature du membre ↔ arité

**Notre code.** Le seul garde existant est
[`assertNotVoidPush`](../src/server/session/rdo-request-guards.ts), qui interdit `"*"` **avec**
`sendRdoRequest()` — c'est-à-dire précisément le cas **sans danger**. Rien ne vérifie la
direction dangereuse. Le choix repose sur des commentaires en langage naturel
(`spo_session.ts:1289` « Delphi: procedure, not function », `research-handler.ts:88-91`
« both are olevariant-returning functions »), dont S1 démontre qu'ils peuvent être faux.

**Mécanisme serveur.** M8, deuxième et cinquième lignes du tableau. La faute symétrique — `"*"`
sur une *function* — est **plus grave** que S1 : l'appelé écrit son résultat variant à travers
un pointeur jamais fourni, donc à une adresse arbitraire du processus partagé, **et** son
`ret n` déséquilibre la pile en sens inverse. L'arité est le même piège : le bloc asm ignore
totalement la signature réelle.

**État actuel — vérification exhaustive menée dans cet audit.** J'ai confronté **chaque** membre
émis par le code de production à sa déclaration Delphi :

- Les 14 membres envoyés en `"*"` (`RDOEndSession`, `SetLanguage`, `ClientAware`,
  `ClientNotAware`, `MsgCompositionChanged`, `UnfocusObject`, `RDOLogonClient`, `SetViewedArea`,
  `CloneFacility`, `SetTycoonCookie`, `CloseObject`, `KeepAlive`, `RDOVote`, `DeleteMessage`,
  `RDOStartUpgrades`/`RDOStopUpgrade`/`RDODowngrade`) sont **tous de véritables `procedure`**
  (`World.pas:412`, `TownPolitics.pas:46`, `Kernel.pas:1092-1094`,
  `Cache Server/CacheServerReportForm.pas:104`, `CachedObjectWrap.pas:36`,
  `MailServer.pas:112`, `InterfaceServer.pas:144, 163-164, 197-198`,
  `Directory Server/DirectoryServer.pas:30`). **Aucune écriture sauvage. ✅**
- Côté `"^"`/`get` : tous des `function`, **sauf trois** — `SayThis` (2 params → S1),
  `CloseMessage` et `AddLine` (`MailServer.pas:112, 140`), procédures à **1 paramètre**, donc
  **bénignes côté serveur** (`@Res` en ECX, ignoré). Pour ces deux-là la divergence est
  néanmoins **prouvée par capture** (preuve de rang 1) : le client de référence émet
  `C 2174 sel 30430748 call AddLine "*" "%test message";` et
  `C 2177 sel 30437308 call CloseMessage "*" "#30430748";`
  ([capture :3542, :3548](../doc/Mock_Server_scenarios_captures.md)) — noter le **QueryId
  accompagnant `"*"`**, exactement la forme que `RDOMarshalers.pas:262` produit quand
  `TimeOut ≠ 0`. À corriger par conformité, sans urgence serveur.
- Arité : les points de contrôle échantillonnés sont exacts, y compris le piège
  `GetInputNames`/`GetOutputNames`, dont la variante *production* prend **2** paramètres
  (`Cache Server/CachedObjectWrap.pas:31-32`) là où la variante archivée `Cache/` n'en prend
  qu'un — et nous en passons bien deux
  ([building-details-handler.ts:986](../src/server/session/building-details-handler.ts#L986)). ✅

**Catégorie 1 (risque de régression). Statut : PROUVÉ.** L'inventaire est sain aujourd'hui ;
c'est le **filet** qui manque. Correction : un test de conformité qui confronte chaque membre
émis à une table `membre → {kind, arité, unité:ligne}`, à l'image de
`no-raw-rdo-writes.test.ts`. Voir §7 pour l'ordre.

---

## 4. Catégories 3, 4 et 7 — cycle de vie de session

### S3 — La reconnexion légère est un faux positif garanti par la fuite serveur

**Notre code.** [login-handler.ts:957-1034](../src/server/session/login-handler.ts#L957-L1034).
Après une coupure de socket, on recrée la socket, on re-résout `idof InterfaceServer`, puis on
« vérifie que la session est encore valide » par `sel <ancien worldContextId> get TycoonId`.
Si ça répond, on saute le relogin.

**Ce que fait le serveur pendant ce temps.** La perte de socket déclenche
`TClientView.OnDisconnect` → `DoLogoff` (`InterfaceServer.pas:1799-1817, 1949-2017`), qui
défocalise tous les objets, quitte le canal, arrête les chasers, appelle `SetViewedArea(0,0,0,0)`
et `ClientNotAware`, puis `TInterfaceServer.Logoff(self)` — lequel **extrait** le ClientView de
`fClients` sans le libérer (M5). **La session est donc déjà close côté serveur au moment où on
la sonde.** Mais l'objet reste en mémoire : `sel <pointeur> get TycoonId` répond normalement.

**Mécanisme serveur exact.** `GetProperty` fait `theObject := TObject(ObjectId)` puis lit la
RTTI (`RDOObjectServer.pas:77-101`) ; sur un objet fuité mais vivant, la lecture réussit. La
fuite M5 transforme donc notre heuristique de validité en **oracle systématiquement faux**.
On poursuit ensuite sur un ClientView détaché : `EnableEvents := -1` et `PickEvent` sur un objet
absent de `fClients`, donc invisible de la liste des joueurs, du chat et de la companionship.

**Catégories 3 + 7. Statut : PROUVÉ.** Coût serveur direct : modéré (quelques requêtes sur un
objet mort). Coût réel : on ne se relogue jamais, donc on n'apparaît plus jamais pour les autres
joueurs, tout en continuant à consommer des threads de requête.

**Correction.** Supprimer la sonde. Le client de référence ne la fait pas : en reconnexion il
rejoue **le login complet** — `AccountStatus` → `Logon` → `BindTo(nouveau ClientViewId)` →
relecture de `RDOCnntId` → `RegisterEventsById`
(`ServerCnxHandler.pas:2740-2790`). **Arbitrage à traiter explicitement, voir §7.**

### S8 — `RDOCnntId` périmé renvoyé au serveur après reconnexion

**Notre code.** `login-handler.ts:998-1009` réutilise `ctx.rdoCnntId`, capturé au **login
initial**.

**Ce que cette valeur est.** `get RDOCnntId` est intercepté avant toute RTTI et renvoie `ConnId`
(`RDOQueryServer.pas:269-273`), lui-même `integer(fQueryToService.Socket.getSocket)`
(`WinSockRDOConnectionsServer.pas:320`) : **l'adresse de l'objet `TCustomWinSocket`** qui a servi
la requête. Notre ancienne socket ayant été détruite (`ClientDisconnected`,
`WinSockRDOConnectionsServer.pas:707-744`), c'est un pointeur mort.

**Mécanisme serveur exact.** `RegisterEventsById` → `GetClientConnectionById` compare
`integer(CurrConn) = Id` sur les connexions **vivantes**
(`InterfaceServer.pas:1919, 650-686`). Deux issues :
1. aucune correspondance → `fClientConnection := nil` → l'affectation `.OnDisconnect` lève une
   AV rattrapée → `ERROR_CannotSetupEvents`. Bénin pour le serveur, mais **nos pushs ne sont
   jamais rebranchés** ;
2. l'adresse a été **réallouée** à un `TCustomWinSocket` d'un autre joueur — même classe, même
   taille, allocation VCL fréquente. La comparaison réussit, et l'IS branche notre
   `fClientEventsProxy` sur **la socket de cet autre joueur** : nos `RefreshArea`,
   `RefreshObject` et notifications partent dans son flux RDO. Pire, la ligne suivante écrase
   son `OnDisconnect` par le **nôtre** — la fermeture de *sa* socket déclenchera *notre*
   `DoLogoff`.

**Catégorie 7. Statut : mécanisme PROUVÉ, occurrence INFÉRÉE** (dépend de l'allocateur ; non
observée). **Correction :** relire `RDOCnntId` sur la nouvelle socket avant tout
`RegisterEventsById` — ce que fait le client de référence (`ServerCnxHandler.pas:2788-2789`).
Correction d'une ligne, indépendante de S3, à faire même si S3 est traité autrement.

### S4 — Chaque coupure coûte deux balayages O(N²) sous le verrou global

**Mécanisme serveur, entièrement côté Delphi.** `SetViewedArea` appelle
`fServer.NotifyCompanionship` (`InterfaceServer.pas:741`), qui prend **`fServerLock`** puis
itère sur *tous* les clients (`:3996-4020`) ; chacun exécute `FindCompanionship`, qui itère à
nouveau sur *tous* les clients en calculant une intersection de rectangles (`:2341-2369`) — et
quand la chaîne a changé, `FindCompanionship` est appelée **une seconde fois** pour composer
l'argument du push (`:2385`). Or `DoLogoff` appelle `SetViewedArea(0,0,0,0)` (`:2004`) **puis**
`TInterfaceServer.Logoff`, qui refait `NotifyCompanionship` (`:3323`).

**Ce que notre code y ajoute.** Rien de fautif en régime nominal — mais chaque cycle
déconnexion/reconnexion déclenche ces deux balayages, plus ceux du `Logon` suivant (M4). Notre
politique de reconnexion ([spo_session.ts:1643-1753](../src/server/spo_session.ts#L1643-L1753))
autorise **23 tentatives sur ~5,5 min** (3 rapides + 20 lentes), avec jitter ±25 % — bon point —
mais **sans plafond global à l'échelle de la passerelle** : N sessions d'une même instance
peuvent enchaîner N × 23 cycles après une panne partagée.

**Catégories 4 + 5. Statut : PROUVÉ (mécanisme) / INFÉRÉ (ampleur, faute de mesure live).**
**Correction :** un sémaphore de relogin au niveau passerelle (2-3 logins concurrents max, file
d'attente), et abandon plus précoce (les 20 tentatives lentes n'apportent rien qu'une
reconnexion manuelle n'apporterait à moindre coût pour le monde).

---

## 5. Catégories 5, 7 et 8 — chemins de lecture et mutations

### S6 — Port 7001 câblé en dur alors que le serveur nous donne la bonne valeur

**Notre code.** `RDO_PORTS.CONSTRUCTION_SERVICE = 7001`
([protocol-types.ts:12](../src/shared/types/protocol-types.ts#L12)), utilisé par
`connectConstructionService` ([spo_session.ts:948-952](../src/server/spo_session.ts#L948-L952)).
Or `fetchWorldProperties` **lit** `DAPort` **et** `DALockPort` depuis l'IS
([login-handler.ts:744, 762-763](../src/server/session/login-handler.ts#L744)) — et **jette
`DALockPort`** après l'avoir journalisé.

**Côté serveur.** `fDAPort := aMSPort ; fDALockPort := fDAPort + 1`
(`InterfaceServer.pas:2639-2640`). `DALockPort` est le port **à un seul thread, sérialisé sur
`fWorld.WorldLock`** (M6). Le client de référence s'y connecte délibérément :
`fDAPort := fISProxy.DALockPort` (`ServerCnxHandler.pas:2756`).

**Conséquence.** Si `DAPort = 7000` en production, notre socket « construction » est sur le port
verrouillé : chacune de ses requêtes — y compris les **lectures** `RDOGetInvPropsByLang`,
`RDOGetInvDescEx` ([research-handler.ts:119-137](../src/server/session/research-handler.ts#L119-L137))
et `RDOVoteOf` — sérialise la simulation du monde entier. C'est conforme au client de référence
dans le *choix du port*, mais notre volume de lectures y est propre au WebClient.

**Catégorie 5. Statut : PROUVÉ (code des deux côtés) / INCONNU (la valeur réelle de `DAPort`
en production).** Voir §8 pour l'expérience qui tranche. **Correction :** utiliser la valeur
`DALockPort` renvoyée par l'IS au lieu de la constante, et déplacer les lectures pures vers
`DAPort` si l'objet y est accessible.

### S9 — `RDOAcceptCloning` n'est pas un sémaphore : c'est une préférence joueur persistante

**Notre code.**
[building-management-handler.ts:113-141](../src/server/session/building-management-handler.ts#L113-L141)
lit `RDOAcceptCloning`, exige la valeur 1 ou 255 (« 255 = zone vide »), puis « verrouille le
bloc » par `set RDOAcceptCloning="#-1"` — trame confirmée par exécution (§10). Le déverrouillage
n'existe pas : l'étape 6 ne fait que **relire** la valeur (`:184-191`).

**Côté serveur.** `property RDOAcceptCloning : boolean read fAcceptCloning write fAcceptCloning;`
sur `TBlock` (`Kernel/Kernel.pas:1347`, classe ligne 1209). Ce champ :
- vaut `true` par défaut (`Kernel.pas:5239`) ;
- gouverne le clonage de réglages entre bâtiments : `if (fCurrBlock <> nil) and
  fCurrBlock.AcceptCloning` (`Kernel.pas:5103`) ;
- est **sérialisé dans le backup du monde** (`Kernel.pas:6045, 6100`).

Et surtout, le client de référence ne s'en sert **que** comme case à cocher de la fiche de
gestion : lecture `fAcceptSettings := Proxy.RDOAcceptCloning` et écriture
`Proxy.RDOAcceptCloning := accept` — `Voyager/ManagementSheet.pas:273, 313`. **Aucun protocole
de verrouillage n'existe côté serveur.**

**Mécanisme exact.** `Boolean` Delphi tient sur 1 octet ; `SetOrdProp` avec `-1` y écrit `0xFF`.
La relecture renvoie donc **255** — ce « 255 » que notre code documente comme « zone vide » est
en réalité **l'artefact de notre propre écriture précédente**. Fonctionnellement `255 ≠ 0` reste
« true », donc le dégât est nul tant que la préférence valait déjà `true` ; mais si le
propriétaire du bâtiment avait **décoché** la case, notre passage la **réactive
silencieusement et définitivement**, backup compris.

**Catégorie 7. Statut : PROUVÉ.** **Correction :** supprimer purement et simplement les étapes 2,
3 et 6 — elles n'ont aucune contrepartie serveur. Ce qui protège réellement l'opération est
`CheckOpAuthenticity`, appliqué par le serveur dans `RDOStartUpgrades` (`Kernel.pas:4672`). Cela
règle du même coup S10.

### S10 — Deux lectures `SLOW` par action de construction, pour rien

Conséquence directe de S9 : `get RDOAcceptCloning` avant et après l'action
(`building-management-handler.ts:114-119, 184-189`), plus le `set`, soit **trois allers-retours
supplémentaires sur le port potentiellement verrouillé** (S6) pour chaque montée ou descente de
niveau. **Catégorie 8. Statut : PROUVÉ.** Disparaît avec S9.

### S7 — Cadrage serveur : ce qui tient, et sur quoi ça tient

Le serveur découpe ses trames avec `KeyWordPos` (`RDOUtils.pas:82-125, 469-479`), qui **saute
les littéraux entre guillemets**, guillemets doublés compris. Un `;` dans un texte utilisateur
est donc inoffensif — vérifié par exécution (§10, ligne 5). En revanche, **un guillemet
déséquilibré** fait échouer la recherche du terminateur : le buffer de la socket grossit
indéfiniment jusqu'à `MaxQueryLength = 1 Mo`, où le serveur **journalise et ferme la connexion**
(`WinSockRDOConnectionsServer.pas:777-783`).

L'unique rempart est l'ordre d'opérations de
[`RdoValue.format()`](../src/shared/rdo-types.ts#L122-L131) : rétrécissement à l'alphabet
mono-octet **avant** doublement des guillemets, calqué sur `RDOStrEncode(WideStrToStr(v))`
(`RDOUtils.pas:379`, `WideStrToStr` étant la conversion RTL implicite, `:266-269`). Le filet de
sécurité `clampToWireBytes()` au niveau socket
([rdo-helpers.ts:71-76](../src/server/rdo-helpers.ts#L71-L76)) couvre les chemins qui
contourneraient `RdoValue`. **Vérifié par exécution : `U+0122`/`U+013B` sortent en `?` (0x3F),
aucun 0x22 ni 0x3B forgé (§10, lignes 4 et 5).**

**Catégorie 6. Statut : PROUVÉ pour le mécanisme, le rempart actuel tient.** Ce constat figure
ici parce que la conséquence serveur réelle n'est pas « injection » mais **désynchronisation du
cadrage puis fermeture de socket** : toute future régression sur cet ordre d'opérations est un
défaut d'intégrité de service, pas un simple bug d'affichage. À verrouiller par un test de
non-régression explicite sur l'ordre `encodeAnsi` → échappement.

---

## 6. Ce qui est déjà conforme (vérifié, ne pas ré-auditer)

| Point | Vérification |
|---|---|
| **Les 14 membres émis en `"*"` sont tous de vraies `procedure`** | Confronté une à une aux déclarations Delphi — détail en §3/S2. Aucune écriture sauvage possible. |
| **Le pool de connexions monde n'ouvre aucune socket** | `RdoConnectionPool.initialize()` n'est **jamais appelé** en production ; `initWorldPool` ne fait que construire l'objet ([spo_session.ts:1588-1627](../src/server/spo_session.ts#L1588)), et `executeRdoRequest` est gardé par `worldPool.size > 0` (`:2121`). Empreinte serveur réelle : **une seule socket monde**, comme le client de référence. |
| **Les lectures de carte tapent bien le cache partagé de l'IS** | `ObjectsInArea` n'est servi depuis `fServer.fObjectCache` que si `CanonicalSquare(x,y,dx,dy)` (`InterfaceServer.pas:758-768, 2477-2480`), soit `dx = dy = MapChunkSize = 64` et origine alignée (`Protocol/Protocol.pas:13`). Notre renderer demande exclusivement des zones 64×64 alignées ([isometric-map-renderer.ts:199-209, 291](../src/client/renderer/isometric-map-renderer.ts#L199-L209), helpers [map-handler.ts:60-98](../src/client/handlers/map-handler.ts#L60-L98)). Idem `SegmentsInArea`, dont le cache exige `CircuitId = cirRoads = 1` — la valeur que nous envoyons ([spo_session.ts:1194](../src/server/spo_session.ts#L1194)). **Nos lectures profitent au monde entier au lieu de le charger.** |
| **Cadence des timers ≤ client de référence** | `SetViewedArea` : chez nous une fois toutes les 30 s plus un debounce de 2 s ([client.ts:673, 1058-1066](../src/client/client.ts#L673)) ; chez Voyager, à **chaque** changement de vue (`Map.pas:3981`) — la capture montre deux `SetViewedArea` dans une même rafale ([capture :1032](../doc/Mock_Server_scenarios_captures.md)). Sondage `ServerBusy` : 50 s ; cadence legacy **re-vérifiée dans le source** — `if ((fTimerCount mod 50)=0) then Defer(threadedServerBusy, …)`, `ToolbarHandlerViewer.pas:160-162`. `KeepAlive` : 60 s, sur l'objet temporaire d'inspecteur, uniquement quand un inspecteur est ouvert — cible correcte (`Cache Server/CachedObjectWrap.pas:36`). |
| **Forme de fil identique à la capture pour 4 membres** | `SetViewedArea "*"` **sans QueryId**, `MsgCompositionChanged "*"` sans QueryId, `SegmentsInArea "^"` avec QueryId et `"#1"` en premier argument (`cirRoads`) : les trois apparaissent tels quels dans la capture ([capture :1032, :2111](../doc/Mock_Server_scenarios_captures.md)) et correspondent octet pour octet à ce que nous émettons (§10, ligne 3). Preuve de **rang 1**. |
| **Les timeouts de requête ne déclenchent jamais de reconnexion — motif legacy re-vérifié** | `TServerCnxHandler.ReportCnxFailure` est bien un **no-op** : son corps entier est entre accolades de commentaire (`Voyager/URLHandlers/ServerCnxHandler.pas:3394-3405`, lu dans le source et non repris de nos notes). |
| **Les timeouts de requête ne déclenchent jamais de reconnexion** | [spo_session.ts:2198-2204, 2103-2107](../src/server/spo_session.ts#L2198-L2204). Conforme : `ReportCnxFailure` est un no-op côté legacy. C'est ce qui évite la tempête de relogins de M4. |
| **Aucune ré-émission automatique des mutations** | `executeWithRetry` sort immédiatement sur `CALL`/`SET` ([spo_session.ts:2087-2091](../src/server/spo_session.ts#L2087-L2091)). Le serveur n'a **aucune** idempotence ; rejouer un `RDOStartUpgrades` construirait deux fois. |
| **`Logoff` traité correctement** | `TClientView.Logoff` est un no-op renvoyant `NOERROR` (`InterfaceServer.pas:2019-2022`) ; tout le nettoyage vient de la fermeture de socket. Notre `endSession()` envoie `ClientNotAware` puis `get Logoff` puis `socket.end()` ([spo_session.ts:2563-2609](../src/server/spo_session.ts#L2563)) — séquence du client de référence. |
| **Rejet `busy` malformé géré** | Le serveur émet `A` + `error 17` **sans QueryId ni `;`** (`WinSockRDOConnectionsServer.pas:812`) ; notre framer le détecte et le retire du buffer avant qu'il ne colle à la trame suivante ([rdo.ts:65-70](../src/server/rdo.ts#L65-L70)). Sans cela, chaque rejet `busy` désynchronisait le flux. |
| **`AnswerStatus` répondu** | [spo_session.ts:2341-2351](../src/server/spo_session.ts#L2341). Sans réponse, la requête serveur occuperait un slot jusqu'à son timeout de 60 s. |
| **Encodage booléen** | `#-1` — `varBoolean` passe par `OrdinalId + VarAsType(...)`, `RDOUtils.pas:367-368`. |
| **Corrélation des QueryId** | Compteur monotone modulo 65536 partagé par toutes les sockets ([spo_session.ts:2181](../src/server/spo_session.ts#L2181)) : une collision exigerait 65536 requêtes en vol. Non-problème. |

---

## 7. Ordre de traitement, justifié par l'impact serveur

1. **S1 — `SayThis` en `"*"`.** Seule occurrence connue de comportement indéfini dans le
   processus le plus partagé du système. Correctif d'une ligne, sans arbitrage.
2. **S8 — relire `RDOCnntId` après reconnexion.** Seul chemin identifié pouvant faire écrire nos
   trames dans le flux d'un autre joueur. Une ligne, indépendante de S3.
3. **S2 — le test de conformité membre → {kind, arité}.** Ne corrige rien aujourd'hui : empêche
   la réintroduction de S1 et de sa variante plus grave (`"*"` sur une *function*). C'est le
   seul point de cette liste qui protège l'avenir.
4. **S9 + S10 — supprimer la fausse séquence de verrouillage `RDOAcceptCloning`.** Arrête une
   écriture d'état de jeu persistant appartenant à un autre joueur, et retire trois
   allers-retours par action sur le port possiblement verrouillé.
5. **S3 — supprimer la sonde de reconnexion légère.** Voir l'arbitrage ci-dessous : à traiter
   *après* S8, car S8 est bénéfique dans les deux scénarios.
6. **S5 — plafond global de relogin au niveau passerelle.** Protège le verrou global lors d'une
   panne partagée ; sans effet en régime nominal.
7. **S6 — utiliser `DALockPort` au lieu de la constante 7001.** À conditionner à l'expérience
   U-B (§8) : si `DAPort ≠ 7000`, le constat change de nature.
8. **S7 — figer par test l'ordre `encodeAnsi` → échappement.** Pas un défaut ouvert ; un verrou
   contre la régression.

### Arbitrages où corriger le client aggrave la charge serveur

**S3 — le cas frontal.** La correction « propre » est de rejouer le login complet, comme le
client de référence. Mais un login complet, c'est `AccountStatus` + `Logon`, tous deux sous le
verrou global sur 6 à 8 allers-retours inter-serveurs (M4), **plus un `TClientView` fuité
définitivement** (M5). Autrement dit : **corriger S3 rend chaque reconnexion nettement plus
coûteuse pour le monde entier, et fuit de la mémoire à chaque fois.**
Recommandation, en toute franchise : ne pas remplacer la sonde par un relogin automatique.
La séquence la moins nocive est (a) supprimer la sonde, (b) considérer la session comme perdue,
(c) **demander une action explicite du joueur** pour se reloguer. Un relogin par intention
humaine coûte au serveur exactement ce que coûtait un login Voyager ; un relogin automatique
multiplié par N sessions et 23 tentatives ne coûte pas la même chose.

**S5 — le même arbitrage à l'échelle.** Plus on rend la reconnexion robuste, plus on multiplie
les prises du verrou global. Un plafond de reconnexions n'améliore pas l'expérience d'un joueur
isolé : il protège les autres. C'est un choix à assumer, pas une optimisation.

**S6 — arbitrage inverse.** Déplacer nos lectures de `DALockPort` vers `DAPort` soulage le
verrou du monde, mais nous fait perdre la sérialisation implicite dont dépendent peut-être
certaines séquences état-plein (`SetObject` puis `GetPropertyList`). À ne faire qu'appuyé sur
une capture, jamais par raisonnement seul.

---

## 8. Zones non prouvées et expériences minimales qui les trancheraient

Aucune de ces sondes ne doit être lancée sans **accord explicite du développeur** : le serveur
de production est partagé.

| Réf. | Question ouverte | Expérience minimale | Coût / risque |
|------|------------------|---------------------|---------------|
| **U-A** | Que répond exactement le serveur à `call <procédure à 2 params> "^"` ? Le déséquilibre de pile de S1 se traduit-il par une réponse absente, une réponse malformée, ou une AV journalisée ? | **Une seule** trame : `C <id> sel <ClientViewId> call SayThis "^" "%","%probe";` puis relève de la réponse et de `Survival` via http://158.69.153.134/logs/. | Faible, décisif. Fixe la sévérité de S1. |
| **U-B** | `DAPort` vaut-il 7000 en production, c'est-à-dire notre port 7001 est-il bien `DALockPort` ? | Aucune sonde nécessaire : lire la valeur déjà journalisée par `fetchWorldProperties` dans un log de session existant (`[Session] DAPort:` / `DALockPort:`). | **Nul.** À faire en premier. |
| **U-C** | Combien de joueurs simultanés en pratique ? C'est le `N` du coût O(N²) de S4. | `get GetUserCount` sur l'IS, une fois, aux heures de pointe — méthode déjà publiée et prise sous `fServerLock`, donc à ne faire qu'une fois. | Faible. Rapporte S4 à une échelle réelle. |
| **U-D** | La réallocation d'adresse de S8 se produit-elle réellement ? | Non tranchable sans instrumentation serveur. Traiter S8 comme un défaut à corriger sans attendre la preuve : le correctif est trivial et sans contrepartie. | — |
| **U-E** | Le serveur en production tourne-t-il bien sur `Kernel.pas` et `Rdo/Server/` — et non sur une variante ? | Comparer un `res=` de `RDOGetInvDescEx` ou la présence de `RDOSetTradeLevel` avec les variantes archivées. | Faible. Toutes les conclusions §5 en dépendent. |

**Angle mort de tests confirmé.** Les suites vertes ne prouvent pas la conformité de l'émission :
`chat-handler` a passé toutes ses suites avec le `"^"` de S1 pendant des mois, parce qu'aucun
test ne confronte la trame **de production** à la signature Delphi. C'est exactement le piège
annoncé, et c'est ce que le lot S2 doit fermer.

---

## 9. Confrontation à l'historique (`report/*.md`, lu après figeage)

**Convergences — cross-check indépendant réussi.** Cette passe a redécouvert sans les lire :
`ISMaxThreads = 24`, la connexion IS→Model unique, le verrou global `fServerLock` et sa prise à
travers des appels inter-serveurs, la fuite du `TClientView` (`//ClientView.Free` commenté), le
`"^"` sur `SayThis`, le `RDOCnntId` périmé, la session zombie après reconnexion légère, et le
correctif d'injection P-C1. L'accord est total sur les faits **et** sur les références de lignes.
`report/rdo-audit-2026-08-14.md` §3 va jusqu'au même `push edi` — bonne archéologie.

**Ce que cette passe ajoute et qu'aucun rapport ne disait.**

1. **La règle de dispatch est bilatérale.** L'historique ne traite que `"^"` sur des procédures.
   La faute symétrique — **`"*"` sur une `function`** — est *plus* grave : le pointeur de
   résultat caché n'est jamais transmis, donc l'appelé écrit un variant à une adresse
   arbitraire du processus partagé (M8, ligne 5). Idem pour l'**arité** : le bloc asm
   `RDOObjectServer.pas:233-298` ignore la signature réelle, une arité fausse est le même
   danger. Aucun rapport ne le mentionne.
2. **L'inventaire exhaustif des 14 membres en `"*"`**, chacun confronté à sa déclaration
   Delphi. Les rapports listent les divergences trouvées ; aucun n'établit que la direction
   dangereuse est **intégralement** saine aujourd'hui. C'est ce qui distingue « pas de bug
   connu » de « vérifié ».
3. **`SetViewedArea` est O(N²) sous le verrou global**, et `DoLogoff` l'appelle : chaque
   coupure coûte **deux** balayages `NotifyCompanionship` (`InterfaceServer.pas:741, 2004, 2341-2369,
   3323, 3996-4020`). L'historique n'associe `fServerLock` qu'à `Logon`/`AccountStatus`.
4. **`RDOAcceptCloning` est une préférence joueur persistante**, pas un sémaphore
   (`Voyager/ManagementSheet.pas:273, 313` ; `Kernel.pas:1347, 5103, 6100`), et le « 255 » que
   notre code documente comme « zone vide » est l'artefact de notre propre `-1` tronqué sur un
   octet. Absent de tous les rapports.
5. **Le port 7001 est probablement `DALockPort`** — un seul thread, sérialisé sur
   `fWorld.WorldLock` (`ModelServer.pas:1257-1264`) — et nous **lisons puis jetons** la valeur
   `DALockPort` que l'IS nous donne. Aucun rapport n'identifie la distinction DAPort/DALockPort.
6. **L'alignement 64 de nos lectures de carte est un actif**, pas un risque : il nous fait
   servir depuis `fObjectCache`/`fRoadsCache` partagés (`InterfaceServer.pas:758-768,
   2477-2480`, `Protocol.pas:13`). Le silence de l'historique sur ce point a probablement
   entretenu l'idée inverse.
7. **La conséquence serveur d'un guillemet forgé est la fermeture de socket**, pas seulement
   l'injection : buffer non borné → `MaxQueryLength` 1 Mo → `Socket.Close`
   (`WinSockRDOConnectionsServer.pas:777-783`). Cela reclasse P-C1 en défaut d'intégrité de
   service et justifie de figer l'ordre d'opérations par test.

**Ce que l'historique dit et qui ne tient plus.**

1. 🔴 **« `"^"` sans QueryId fait planter le serveur : la réponse est construite sans
   destination. »** — Affirmation portée par le skill `rdo-conformity` (matrice §8.5, ligne 4,
   « MUST NOT »), `src/server/CLAUDE.md` et `CLAUDE.md` racine. **Elle est fausse.**
   `RDOQueryServer.pas:174-178` : `if QueryId <> '' then Result := QueryId + Blank + Result +
   QueryTerm else Result := ''`. Sans QueryId, **la chaîne de résultat est vidée avant tout
   envoi** ; `TQueryThread` teste `if QueryResult = ''` et se contente de journaliser « No
   result » (`WinSockRDOConnectionsServer.pas:347-353`). Rien n'est jamais émis vers une
   destination inexistante.
   Le danger réel de cette famille n'est **pas** l'axe QueryId : c'est l'accord séparateur ↔
   nature du membre (M8). `"^"` sans QueryId sur une procédure à ≥2 paramètres reste
   dangereux — mais pour la raison de S1, exactement comme `"^"` **avec** QueryId. Symétriquement,
   la règle « fire-and-forget DOIT utiliser `"*"` » est correcte, mais pour le bon motif.
   **La documentation doit être corrigée avec la même rigueur qu'en juillet 2026 pour la
   claim « QueryId + `*` fait planter » : noter la date, le motif, et la ligne qui tranche.**
2. 🟠 **« B4 — pool 6× dormant, footgun. »** (`network-server-risk-report.md`) — Plus qu'un
   footgun : `initialize()` n'est **jamais** appelé, `size` reste 0, et le garde
   `worldPool.size > 0` de `spo_session.ts:2121` rend le pool intégralement inerte. L'empreinte
   socket réelle est de **une** connexion monde. À retirer ou à assumer, mais la formulation
   actuelle laisse croire que 6 connexions existent.
3. 🟠 **« B1 — les timeouts de requête déclenchent une reconnexion. »**
   (`network-server-risk-report.md` §4) — **Ne tient plus dans le code d'aujourd'hui.**
   `spo_session.ts:2198-2204` et `:2103-2107` documentent et implémentent l'inverse : seul
   l'événement socket `close` reconnecte. Le jitter ±25 % réclamé par B3 est également en place
   (`:1665-1667`). Ces deux points sont **corrigés** ; le rapport, lui, ne l'est pas.
4. 🟡 **`rdo-conformity-report.md` §5 classe `SayThis` parmi les « non-divergences
   vérifiées »** (ligne 114, « Conformes »). Contredit par `rdo-audit-2026-08-14.md` §3 et par
   cette passe. Le tableau des non-divergences doit être corrigé, sans quoi il fera à nouveau
   écarter le constat.

---

## 10. Preuves par exécution

Modules protocole compilés hors dépôt (`tsc --outDir <scratchpad>`, aucun fichier du dépôt
touché) et exécutés sous Node. Trames réellement produites par le code de production :

```
1 SayThis       : C 1042 sel 39751288 call SayThis "^" "%","%hello";
2 CloseMessage  : C 1043 sel 111 call CloseMessage "^" "#7";
3 SetViewedArea : C sel 39751288 call SetViewedArea "*" "#10","#20","#30","#40";
4 U+0122/U+013B : C 1042 sel 39751288 call SayThis "^" "%","%a?b?c";
  octets        : ...2225222c2225613f623f63223b      ← 0x3f 0x3f, aucun 0x22 ni 0x3b forgé
5 quote+semi    : C 1042 sel 39751288 call SayThis "^" "%","%he said ""hi""; bye";
6 SetCloning    : C 1046 sel 555 set RDOAcceptCloning="#-1";
7 GetInputNames : C 1047 sel 222 call GetInputNames "^" "#0","%0";
8 emoji         : C 1042 sel 39751288 call SayThis "^" "%","%ok ? fin";
```

Lignes 1 et 2 : le `"^"` de S1 et le `"^"` bénin de `CloseMessage`, tels qu'émis en production —
noter que la ligne 2 n'a **aucun** séparateur explicite dans le code : c'est
`RdoProtocol.format()` qui pose `"^"` par défaut dès qu'un `rid` est présent
([rdo.ts:369-371](../src/server/rdo.ts#L369-L371)). Lignes 4, 5 et 8 : le rempart de cadrage de
S7 tient, y compris sur les paires de substitution. Ligne 6 : l'écriture d'état persistant de S9.

---

## 11. Statut de vérification, constat par constat

Ce tableau répond à une question directe : **qu'est-ce qui vient du source Delphi lu dans cette
passe, qu'est-ce qui vient d'une capture, et qu'est-ce qui reste une inférence ?**
Rangs de la hiérarchie de preuves : **1** = capture live, **2** = source du client legacy,
**3** = source serveur.

| Réf. | Rang atteint | Ce qui a été lu dans cette passe | Ce qui reste non prouvé |
|------|--------------|----------------------------------|-------------------------|
| **M1** 24 threads | 3 | `InterfaceServer.pas:20, 2628-2629` ; `WinSockRDOConnectionsServer.pas:573-575, 800-811` lus intégralement ; chemin de compilation confirmé par `FIVEInterfaceServer.dof:46` | — |
| **M2** connexion IS→Model unique | 3 | `InterfaceServer.pas:343-345, 2788, 2868-2876` ; pipelining lu dans `WinSockRDOConnection.pas:600-690` | — |
| **M3/M4** verrou global | 3 | `InterfaceServer.pas` lu par blocs (3120-3360 pour `AccountStatus`/`Logon`/`Logoff`, 2341-2420, 3996-4020) | — |
| **M5** fuite `ClientView` | 3 | `InterfaceServer.pas:3314, 3326` **et** `Collection.pas:308-323` vs `:276-306` — la non-destruction d'`AtExtract` est désormais **lue**, plus déduite du nom | — |
| **M6** ports Model/Cache | 3 | `ModelServer.pas:1243, 1257-1264` ; `InterfaceServer.pas:2639-2640` ; `Cache Server/CacheServerReportForm.pas:13, 369` | La valeur de `DAPort` **en production** → U-B |
| **M7** plafonds serveur | 3 | `WinSockRDOConnectionsServer.pas:55, 777-783, 812, 874-909` lus | — |
| **M8** règle de dispatch | 3 | `RDOObjectServer.pas:190-332` (bloc asm) et `RDOQueryServer.pas:393-509` lus **intégralement** ; `RDOMarshalers.pas:194-295` pour le côté client | **La convention `register` (l'appelé dépile ses paramètres) est une sémantique du langage Delphi, pas une ligne du dépôt** → `[INFERRED]`, mais c'est le fondement du raisonnement de S1 |
| **S1** `SayThis` en `"^"` | **2 + 3, pas 1** | Signature serveur `InterfaceServer.pas:179` ; émission legacy `ServerCnxHandler.pas:2632` ; sélection du séparateur `RDOMarshalers.pas:213-217` ; notre trame **produite par exécution** (§10) | **Aucune capture ne contient `SayThis`** (0 occurrence dans les deux corpus). Conformément aux règles, cette absence ne prouve rien — mais le constat repose sur les rangs 2 et 3, pas sur le rang 1. La **conséquence** du déséquilibre de pile reste `[INFERRED]` |
| **S2** absence de garde | 3 | Les 14 membres `"*"` confrontés un à un à leur déclaration (`World.pas:412`, `Kernel.pas:1092-1094`, `TownPolitics.pas:46`, `MailServer.pas:112`, `CachedObjectWrap.pas:36`, `CacheServerReportForm.pas:104`, `DirectoryServer.pas:30`, `InterfaceServer.pas:144, 163-164, 197-198`) | Vérification faite sur les **déclarations** (grep ciblé), pas sur les corps — suffisant pour la nature et l'arité, qui sont tout ce que M8 exige |
| **`CloseMessage` / `AddLine`** | **1** | Captures `:3542`, `:3548` — forme de référence `"*"` **avec** QueryId | — |
| **S3** session zombie | 3 | `InterfaceServer.pas:1799-1817, 1949-2017` (`OnDisconnect` → `DoLogoff`) et `RDOObjectServer.pas:77-101` lus | — |
| **S4** O(N²) sous verrou | 3 | `InterfaceServer.pas:741, 2004, 2341-2369, 2385, 3323, 3996-4020` lus | **N** (joueurs simultanés) → U-C |
| **S5** rafales de reconnexion | 3 | Notre code lu ; M4 lu | Ampleur réelle non mesurée → `[INFERRED]` |
| **S6** port 7001 | 3 | `ModelServer.pas:1257-1264` ; `InterfaceServer.pas:2639-2640` ; `ServerCnxHandler.pas:2756` (le client legacy prend bien `DALockPort`) | **`DAPort` = 7000 ?** → U-B, `[UNKNOWN]` |
| **S7** cadrage | 3 + exécution | `RDOUtils.pas:82-125, 246-254, 379, 469-479` lus ; notre rempart **prouvé par exécution** (§10) | `WideStrToStr` → `WideCharToMultiByte` → `?` : le source ne montre qu'une affectation implicite (`RDOUtils.pas:266-269`) → `[INFERRED]`, déjà signalé comme tel dans `shared/cp1252.ts` |
| **S8** `RDOCnntId` périmé | 3 | `RDOQueryServer.pas:269-273` ; `WinSockRDOConnectionsServer.pas:320, 707-744` ; `InterfaceServer.pas:650-686, 1919` lus | **La réallocation d'adresse** n'est pas observable depuis le source → `[INFERRED]`, U-D |
| **S9** `RDOAcceptCloning` | 3 | `Kernel.pas:1347` (propriété publiée sur `TBlock`), `:5103` (usage), `:5239` (défaut), `:6045, 6100` (backup) lus | Deux points `[INFERRED]` : (a) que `Boolean` Delphi tienne sur 1 octet et que `SetOrdProp(-1)` y écrive `0xFF` — sémantique RTL, pas une ligne du dépôt ; (b) que `ManagementSheet.pas:273, 313` soit bien **une case à cocher d'interface** — je n'ai lu que ces deux lignes en `grep`, pas leur contexte |
| **S10** lectures inutiles | 3 | Découle de S9 | — |
| **§6** alignement 64 | **1 + 3** | `InterfaceServer.pas:758-768, 2477-2480` ; `Protocol.pas:13, 93` ; notre renderer lu — **et** `SegmentsInArea "^" "#1"` visible en capture `:1032` | — |
| **§6** pool inerte | notre code | `initialize()` sans appelant ; garde `worldPool.size > 0` (`spo_session.ts:2121`) | — |
| **§8** claim retirée | 3 | `RDOQueryServer.pas:174-178` et `WinSockRDOConnectionsServer.pas:347-353` lus | — |

**Deux citations reprises de notre propre documentation ont été re-vérifiées dans le source
pendant cette relecture, et sont exactes** : `ReportCnxFailure` est bien un no-op à corps
commenté (`ServerCnxHandler.pas:3394-3405`) et la cadence `ServerBusy` est bien
`fTimerCount mod 50` (`ToolbarHandlerViewer.pas:160-162`). Elles figuraient dans nos commentaires
de code sans que je les aie ouvertes au moment de la rédaction ; c'est maintenant fait.

**Limite méthodologique assumée.** Cet audit s'appuie très majoritairement sur les rangs 2 et 3.
Le rang 1 n'a été mobilisé que ponctuellement — les captures ne couvrent tout simplement pas la
famille chat/reconnexion/construction (`SayThis`, `RegisterEventsById`, `RDOCnntId`,
`RDOAcceptCloning`, `UnfocusObject`, `ClientNotAware` : **zéro occurrence**). Là où elles
couvrent (`SetViewedArea`, `SegmentsInArea`, `ObjectsInArea`, `MsgCompositionChanged`,
`AddLine`, `CloseMessage`), elles confirment l'analyse sans exception. Aucun constat de ce
rapport n'est contredit par une capture ; aucun ne repose sur l'absence d'une capture.

---

## 12. Interdits respectés

Aucun fichier du dépôt ni de `../SPO-Original` n'a été modifié ; ce rapport est le seul ajout.
Aucun correctif n'a été appliqué — cette passe produit un diagnostic. **Aucune requête n'a été
émise vers le serveur de production** : les quatre expériences de la §8 sont formulées comme des
propositions à approuver. Aucune conclusion de conformité n'est tirée d'une absence de capture.
