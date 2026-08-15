# Protocole opératoire — sondes live U1–U6

> **Statut : RÉDIGÉ 2026-08-14, non exécuté.** Lot **L0-c** du [plan de remédiation](../plan-remediation-rdo-2026-08-14.md).
> Rédigé en lecture seule : aucune sonde n'a été lancée, aucune connexion live n'a été ouverte.
> **Exécutant : lot L9.** Porte **D2 ouverte le 2026-08-14** (interaction utilisateur, `AskUserQuestion`) — U1, U2, U3, U4, U6 autorisées sur le serveur Delphi partagé de production, U2 encadrée par le [§5.1 du plan](../plan-remediation-rdo-2026-08-14.md#51-conditions-dexécution-de-u2-autorisé-mais-encadré).
> **L'autorisation de *concevoir* n'est pas l'autorisation d'*exécuter maintenant*.** L9 exige un feu vert explicite du développeur à l'ouverture de la fenêtre live, et la livraison + relecture préalable du harnais (§1, réserve 7).
> Questions sources : [rdo-audit-2026-08-14.md §6](../rdo-audit-2026-08-14.md).

---

## 0. Périmètre, interdits, et ce que ce document change au §6 du rapport

Six sondes, dont deux (U1, U4) sont **redécoupées** par rapport à la formulation du rapport parce que la lecture du source Delphi a montré que la formulation d'origine était soit plus risquée que nécessaire, soit non concluante. Chaque écart est justifié et signalé `⚠ ÉCART`.

| Sonde | Forme retenue | Écart vs §6 du rapport |
|---|---|---|
| **U1-a** | `call ClientAware "^"` (0 paramètre) | ⚠ **nouveau** — même question, pile équilibrée, risque nul |
| **U1-b** | `call SayThis "^" "%…","%…"` | conforme au rapport, mais **après** U1-a et avec `Dest` dirigé |
| **U2** | répétition 1→10→100 de U1-b sur une connexion jetable | conforme au §5.1, **isolement de la connexion ajouté** |
| **U3** | aller-retour cookie **+ moisson du corpus de logs** | ⚠ **l'aller-retour seul ne tranche pas** — voir §6.0 |
| **U4** | `set <propriété inexistante>="@1.5"` | ⚠ **nouveau** — teste le *parseur* de littéraux sans exécuter aucune méthode |
| **U6** | `get MailAccount` / `get UserName` sur le ClientView | précisé : trois propriétés `string` publiées identifiées |

**Interdits absolus pendant toute la campagne de sondes**

1. Jamais `"^"` **sans** QueryId — c'est la seule forme qui plante le serveur partagé (`RDOQueryServer.pas:419-424`, CLAUDE.md).
2. Aucune trame malformée, aucun fuzzing. Toutes les trames ci-dessous sont **syntaxiquement valides** et produites par `RdoCommand`/`RdoProtocol.format()` de production, jamais par une concaténation manuelle ni par `socket.write()` brut.
3. Aucune mutation de jeu en marge des sondes : pas de pose, pas de démolition, pas d'écriture de valeur de facilité. Les seuls effets persistants tolérés sont énumérés sonde par sonde (§4.2, §6.1, §5.3).
4. Identifiants verrouillés : `SPO_test3` / `test3` / zone **Free Space** / monde **planitia** / compagnie **SPO_test3 - Green** ([E2E-TESTING.md](../../doc/E2E-TESTING.md)).
5. Une seule sonde à la fois. Jamais en parallèle d'une session E2E ou d'un autre lot live.

---

## 1. Le vecteur d'émission

### 1.1 Pourquoi il faut un harnais

Sur les six sondes, **une seule** (U1-b) est émise telle quelle par du code de production : `sendChatMessage` (`src/server/session/chat-handler.ts:160-167`). Toutes les autres demandent une trame que l'interface utilisateur ne produit pas.

Le mécanisme sanctionné existe déjà : **`REQ_RDO_DIRECT`**.

```
src/server/ws-handlers/misc-handlers.ts:171-205  handleRdoDirect
  → exige SessionPhase.WORLD_CONNECTED               (:173)
  → seau à jetons : rafale 10, 5 jetons/s            (:152-153, :177)
  → verbes autorisés : get | set | call | sel        (:183)
  → ctx.session.executeRdo('world', {...})           (:191)
     → spo_session.ts:1503-1510 → sendRdoRequest → RID + '"^"' par défaut
       (rdo.ts:369-376 : separator = METHOD_SEPARATOR dès que rid !== undefined)
```

Toute trame passe donc par `RdoProtocol.format()` puis `writeRdoFrame()` (`rdo-helpers.ts:71-76`) — encodage octet, `clampToWireBytes`, journalisation `RDO>>`. **Rien n'est forgé à la main.**

### 1.2 Deux harnais, selon la sonde

| Harnais | Sondes | Description |
|---|---|---|
| **H1 — UI Playwright** | U1-b (variante fidélité) | Login par la procédure verrouillée, puis envoi d'un message de chat par le panneau. Exerce le call-site de production exact. Aucun code nouveau. |
| **H2 — script de sonde Node** | U1-a, U1-b, U2, U3, U4, U6 | `src/tools/rdo-probe.ts`, bundlé comme `capture-cli.ts`. Réutilise `StarpeaceSession` : logon annuaire → logon monde standard, puis émission des trames via `executeRdo` / `writeRdoFrame`, puis `Logoff` propre. |

`REQ_RDO_DIRECT` depuis le navigateur n'est **pas** exploitable en l'état : `window.__spoDebug` (`src/client/client.ts:51-66`) n'expose aucune API d'envoi, et une seconde WebSocket ouverte depuis la page créerait une session passerelle distincte, non authentifiée, donc rejetée par le garde de phase (`misc-handlers.ts:173`). **Livrable préalable de L9 : soit `src/tools/rdo-probe.ts`, soit l'exposition d'un `__spoDebug.rdoDirect()` derrière un drapeau d'environnement.** À décider par L9, ne pas improviser en séance.

### 1.3 Le piège du pool de connexions monde

`sendRdoRequest('world', …)` **ne part pas forcément sur la socket monde primaire** :

```
spo_session.ts:2121-2129 — si worldPool.size > 0 → poolConn = await this.worldPool.getConnection()
spo_session.ts:155        — WORLD_POOL_SIZE = 6
```

> **Note de recoupement (L0-a, O-M1) :** le constat O-M1 de l'[annexe MOYENNES/BASSES](../rdo-audit-2026-08-14-annexe-moyennes-basses.md) établit que le pool n'est **jamais peuplé** en production (`initialize()` jamais appelé, garde `size > 0` définitivement fausse). En l'état actuel du code, toute sonde part donc sur la socket primaire. **Cette section reste néanmoins impérative** : si la porte D5 aboutit à activer le pool avant L9, l'isolement de connexion ci-dessous redevient nécessaire. Vérifier `getQueueStatus().worldPoolSize` au préalable (P8) et adapter.

Le pool est créé inconditionnellement (`spo_session.ts:1594-1626`) ; il n'est pas conditionné par `RDO_PARALLEL_AREA_READS` (`shared/config.ts:52`, qui ne gouverne que les lectures de zone). Une sonde peut donc partir sur n'importe laquelle des 6 connexions.

**Conséquence opératoire** — pour U2 (et pour toute sonde dont l'oracle inclut « la connexion survit-elle ? »), le script doit ouvrir **sa propre connexion IS jetable** :

- même `host`/`port` que la socket `world` (`login-handler.ts:332` — `world.ip`, `world.port`) ;
- **pas** la socket `construction` : elle vise le port 7001, un **autre processus** (`spo_session.ts:948-952`), où `sel <ClientViewId>` n'a aucun sens ;
- aucun `Logon` n'est requis sur cette connexion. Précédent de production, déjà validé en live : les connexions du pool sont des sockets TCP nues vers l'IS, sans logon, qui portent des `sel <ClientViewId>` (`session/rdo-connection-pool.ts:238-269`). `TRDOQueryServer.ExecQuery` ne fait aucun contrôle d'appartenance : il déréférence l'id d'objet directement (`RDOQueryServer.pas:109-160`, `RDOObjectServer.pas:77` `theObject := TObject(ObjectId)`). `[INFERRED]` — aucune autorisation par connexion n'existe dans le chemin de dispatch.

**Bénéfice décisif : le rayon d'explosion de U1-b et U2 est une connexion jetable.** Si le thread de service de cette connexion meurt, la session de jeu réelle (socket primaire + pool) n'est pas touchée, et la mort est immédiatement observable (`close` sur la socket jetable, ou absence de réponse).

---

## 2. Préalables communs à toutes les sondes

| # | Préalable | Vérification |
|---|---|---|
| P1 | Passerelle en mode capture, fichier de log neuf | `LOG_LEVEL=debug LOG_JSON=true LOG_FILE=logs/probe-<date>-<n>.ndjson CACHE_SKIP_SYNC=true npm run dev` ([E2E-LIVE-CAMPAIGN §2.1](../../doc/E2E-LIVE-CAMPAIGN.md)) |
| P2 | **Bande C1 active = identité Latin-1** | Lire `src/shared/cp1252.ts:126` : `ACTIVE_C1_BAND = LATIN1_C1_BAND`. **Si le lot L11 a déjà basculé la table sur `CP1252_C1_BAND`, U3 est invalide** : les points de code U+0080–U+009F seraient encodés en `?` (`cp1252.ts:163-184`). Consigner le SHA du commit. |
| P3 | Session en phase `WORLD_CONNECTED` | `SessionPhase.WORLD_CONNECTED` ; sinon `handleRdoDirect` rejette (`misc-handlers.ts:173`) |
| P4 | `ClientViewId` relevé | Résultat de `Logon` dans le log fil (`RDO<<`). C'est l'id d'objet visé par **toutes** les sondes sauf U4 (qui l'utilise aussi) — jamais `worldContextId` d'une session précédente. |
| P5 | `TycoonId` relevé | Nécessaire à U3 (paramètre 1 de `Set/GetTycoonCookie`). Lisible par `get TycoonId` sur le ClientView (`InterfaceServer.pas:128`, propriété `integer` publiée) |
| P6 | Calibration d'horloge | Procédure [E2E-LIVE-CAMPAIGN §4](../../doc/E2E-LIVE-CAMPAIGN.md) : `LOGON ATTEMPT: User=SPO_test3` → `LOGON SUCCESS: ClientViewId=<id>` dans `FIVEINTERFACESERVER/Survival`, `ClientViewId` doit **égaler** P4 |
| P7 | Instantané des logs serveur AVANT | `curl -s "http://158.69.153.134/logs/FIVEINTERFACESERVER/Survival%2026-08-14.log"` (idem `Chat`, `Clients`, et `FIVEMODELSERVER/Survival`). **`curl` uniquement — HTTP nu, pas de TLS, WebFetch inutilisable.** Espace du nom de fichier = `%20`, suivi de `YY-MM-DD`. Cache : `report/campaign/logs-cache/<date>/` |
| P8 | Santé de départ | `FIVEMODELSERVER/Survival` bat toutes les ~15 s ; aucun `TimeWarp` récent ; `get ServerBusy` sur le ClientView répond `"#0"` ; `getQueueStatus().worldPoolSize` relevé (cf. §1.3) |

**Conditions d'abandon immédiat, valables partout** ([E2E-LIVE-CAMPAIGN §6](../../doc/E2E-LIVE-CAMPAIGN.md)) : trou de battement MS `Survival` > 60 s ; apparition d'un `TimeWarp` dans la fenêtre ; `Aerror 17` (ServerBusy) répété ; code de sortie `Clients` ≠ 0 sur une de nos sessions ; toute coupure de socket non provoquée. → **arrêt, pas de reprise, rapport.**

---

## 3. Ordre d'exécution et graphe de dépendances

```
        U6  ──┐   (get pur, aucun effet — peut ouvrir la séance)
        U4-a ─┤   (set sur propriété inexistante — aucun effet)
              │
        U1-a ─┴──► décision A : le serveur répond-il quelque chose à "^" sur une procédure ?
              │
              ├─ pas de réponse / socket coupée ──► ARRÊT TOTAL. P-H1 devient CRITIQUE.
              │
              └─ réponse obtenue ──► U1-b ──► décision B : le corps de la procédure a-t-il tourné ?
                                              (ligne dans FIVEINTERFACESERVER/Chat ?)
                                              │
                                              ├─ NON ──► U2 SANS OBJET. Arrêt de la branche.
                                              │          (§5.1 règle 1 du plan)
                                              └─ OUI ──► U2  (1 → 10 → 100)

        U3 ── indépendante, exécutable en dernier (seule sonde à effet persistant)
        U4-b ─ conditionnelle : uniquement si un Movie Studio est possédé ET budget accordé
```

**Le point critique demandé par le plan, rendu explicite.**

> **Si U1 montre que le serveur rejette la forme sans exécuter le corps de la procédure, le `push edi` n'a jamais lieu et U2 devient sans objet — arrêter là.**

C'est la règle 1 du §5.1 et elle est ici **opérationnalisée par un oracle précis** : la présence de la ligne de sonde dans `FIVEINTERFACESERVER/Chat <date>.log`. `TInterfaceServer.ChatMsg` journalise **inconditionnellement**, en tout premier, avant tout verrou et toute diffusion :

```pascal
Logs.Log( 'Chat', CompSrc + ': ' + Msg );   // InterfaceServer.pas:3909
```

appelé depuis `TClientView.SayThis` (`InterfaceServer.pas:1387`). **Ligne présente ⇒ le corps a tourné ⇒ le `push edi` a eu lieu ⇒ U2 a un objet. Ligne absente ⇒ U2 sans objet, arrêt.**

⚠ **Réserve de lecture** — la prémisse du rapport (« le serveur rejette la forme ») est **contredite par le source** : `TRDOQueryServer.CallCommand` accepte `^` **et** `*` au même test (`RDOQueryServer.pas:419`), puis appelle `fObjServer.CallMethod` (`:471`) **avant** toute tentative de marshalling du résultat (`:473-504`). `[INFERRED]` la méthode s'exécute toujours, et U2 aura donc un objet. L'oracle du log Chat le confirme empiriquement — c'est lui qui décide, pas cette lecture.

---

## 4. U1 — que répond le serveur à `call <Procedure> "^"` ?

### 4.0 Le raisonnement Delphi qui fonde les deux oracles

`TRDOQueryServer.CallCommand` (`RDOQueryServer.pas:393-509`) :

| Ligne | Ce qui se passe pour `"^"` |
|---|---|
| `:417` | `ResultType := ReadLiteral(...)` → `^` |
| `:419` | `(ResultType[1] = VariantId) or (… = VoidId)` → **vrai** : la forme est acceptée, pas de `errMalformedQuery` |
| `:422-424` | `TVarData(Res).VType := varVariant` |
| `:471` | `fObjServer.CallMethod(...)` — **la méthode est appelée** |
| `:476` | `TVarData(Res).VType <> varEmpty` → vrai (varVariant), on tente de sérialiser un résultat qui n'existe pas |
| `:479` | `GetStrFromVariant(Res, IllegVType)` |
| `:484` | si `IllegVType` → `Result := CreateErrorMessage(errIllegalFunctionRes)` = **`error 9`** |

`GetStrFromVariant` (`RDOUtils.pas:360-393`) : branche `varVariant` → `Result := VariantId + VarAsType(aVariant, varString)`. `[INFERRED]` la conversion d'un `varVariant` dont le `VPointer` n'a jamais été écrit lève `EVariantError`, capturée en `:390-392` → `IllegalVType := true` → **`error 9`**. La réponse finale est assemblée en `RDOQueryServer.pas:174-176` : `QueryId + Blank + Result + QueryTerm`, préfixée `A` côté transport.

**Prédiction principale : `A<rid> error 9;`** — `errIllegalFunctionRes = 9` (`ErrorCodes.pas:15`, message forgé en `:32-39`).

Et le mécanisme registre (`RDOObjectServer.pas:190-332`, `MaxRegs = 3`, `JustEAX = 1`) :

| Membre | Params | `RegsUsed` à `@ResParam` | Sort du pointeur `Res` | Pile |
|---|---|---|---|---|
| `ClientAware` | 0 | 1 | `mov edx, edi` (`:286`) | **équilibrée** |
| `AddLine` | 1 | 2 | `mov ecx, edi` (`:290`) | **équilibrée** |
| `SayThis` | 2 | 3 | `push edi` (`:292`) | **déséquilibrée de 4 octets** |

C'est toute la sonde : U1-a isole la question protocolaire à pile équilibrée ; U1-b ajoute le `push edi`.

Détail du déséquilibre pour `SayThis` : le bloc asm empile `eax, esi, edi` (`:234-236`), puis `push edi` (le pointeur `Res`), puis `call MethodAddr` (`:294`). `procedure SayThis(Dest, Msg : widestring)` en convention `register` reçoit `eax=Self, edx=Dest, ecx=Msg`, **n'a aucun paramètre pile** et retourne donc par `ret` sans nettoyage. Les trois `pop edi / pop esi / pop eax` (`:295-297`) dépilent alors **décalés d'un mot** : `edi` reçoit le pointeur `Res`, `esi` reçoit l'ancien `edi`, `eax` reçoit l'ancien `esi`, et l'ancien `eax` reste sur la pile. `esi`/`edi` sont préservés par appelé en convention Delphi : la corruption remonte dans `CallCommand`. `[INFERRED]` — le prologue/épilogue à `ebp` de `CallMethod` rattrape `esp`, mais pas les registres. Le mode de défaillance exact est précisément ce que U1-b/U2 vont mesurer.

**Contrôle de cohérence disponible en capture** : `call GetTycoonCookie "^" "#22","%LastY.0"` → `A36 res="%395";` [capture :982-983]. Même profil registre (2 params, `RegsUsed = 3`, `push edi`), mais `GetTycoonCookie` est une **fonction** `: OleVariant` (`InterfaceServer.pas:162`) : son résultat variant est justement passé en paramètre caché sur la pile, nettoyé par l'appelé. **La pile est équilibrée pour une fonction et déséquilibrée pour une procédure — c'est exactement la frontière que P-H1 franchit.**

### 4.1 U1-a — sonde à pile équilibrée (à exécuter en premier)

**Objectif.** Établir la réponse du serveur à `"^"` sur une procédure, **sans** aucun déséquilibre de pile et **sans** aucun effet de jeu.

**Cible.** `procedure ClientAware;` — 0 paramètre, publiée sur `TClientView` (`InterfaceServer.pas:197`). `[INFERRED]` inoffensive et idempotente : le client de référence l'émet de façon répétée en régime normal — `C sel 8161308 call ClientAware "*" ;` [capture :1017, :1019].

**Préalable.** P1–P8. Phase `WORLD_CONNECTED`, `ClientViewId` de la session courante.

**Trame exacte.**
```
C <rid> sel <ClientViewId> call ClientAware "^";
```
Produite par `RdoProtocol.format()` (`rdo.ts:330-390`) + `RDO_CONSTANTS.PACKET_DELIMITER` (`spo_session.ts:2222`). Pas d'espace avant `;` : `parts.join(' ')` puis concaténation du terminateur. Sans argument, `packet.args` est vide donc aucun token n'est ajouté (`rdo.ts:379-384`).
Analyse côté serveur : `ReadLiteral` sur `;` retourne `''` (`RDOUtils.pas:219-227` — `;` n'est ni délimiteur, ni chiffre, ni début d'identifiant) → `ParamValue = ''` → `Params` reste `Unassigned` (`RDOQueryServer.pas:431`). ✅ 0 paramètre.

**Oracle.**

| Réponse observée | Conclusion | Suite |
|---|---|---|
| `A<rid> error 9;` | **Prédiction confirmée.** `errIllegalFunctionRes`. Le serveur accepte la trame, dispatche, échoue à sérialiser un résultat fantôme. P-H1 = divergence de fil réelle, réponse **non-ack**. | → U1-b |
| `A<rid> res="^";` | `GetStrFromVariant` a réussi sur `varVariant`. Réponse bien formée mais vide de sens ; `cleanPayload` la réduirait à `''` (`rdo-helpers.ts:98-100`). P-H1 = divergence bénigne. | → U1-b |
| `A<rid> ;` | `TVarData(Res).VType` valait `varEmpty` après l'appel : le binaire de production diffère du source lu. **Falsifie l'analyse `RDOQueryServer.pas:422-424`.** Consigner, ne pas extrapoler. | → U1-b, prudence maximale |
| `A<rid> error 5;` | `errUnexistentMethod` (`RDOObjectServer.pas:326`) — `ClientAware` non publiée sur l'objet visé. **Sonde mal ciblée**, pas un résultat serveur. | corriger la cible, rejouer |
| `A<rid> error 2;` | `errIllegalObject` — `ClientViewId` invalide ou périmé. | re-login, rejouer |
| **aucune réponse** avant expiration | Le thread de service de requête est mort sur une trame **à pile équilibrée**. Gravité maximale. | **ARRÊT TOTAL.** P-H1 → CRITIQUE |
| socket fermée par le pair | idem | **ARRÊT TOTAL** |

**Critère d'arrêt.** Une seule émission. Aucune répétition à ce stade.
**Repli.** Réponse inattendue non listée → consigner les octets bruts, ne pas rejouer, remonter au développeur avant U1-b.

**Effet persistant.** Aucun. Pas de ligne de log serveur attendue.

### 4.2 U1-b — la forme de production (avec `push edi`)

**Objectif.** (i) confirmer la réponse sur le site réel du défaut ; (ii) **décider si U2 a un objet**, par l'oracle du log Chat.

**Préalable.** U1-a exécutée et non bloquante. Connexion IS **jetable** dédiée (§1.3). `ClientViewId`.

**Trame exacte.**
```
C <rid> sel <ClientViewId> call SayThis "^" "%SPO_test3","%RDO-probe U1b <horodatage-UTC>";
```

**Octets de production, pour comparaison** — `chat-handler.ts:160-167` produit la même forme avec `Dest` vide :
`C <rid> sel <worldContextId> call SayThis "^" "%","%<message>";`

**Octets de référence Voyager** — aucun. `SayThis` n'apparaît dans **aucune** capture. Les deux seules procédures capturées le sont en `"*"` **avec** QueryId, et reçoivent un ack propre :
```
C 2174 sel 30430748 call AddLine "*" "%test message";     A2174 ;    [capture :3542-3543]
C 2177 sel 30437308 call CloseMessage "*" "#30430748";    A2177 ;    [capture :3548-3549]
```
(Règle 4 : l'absence de `SayThis` des captures ne prouve rien à elle seule ; c'est la déclaration `procedure SayThis( Dest, Msg : widestring );` — `InterfaceServer.pas:179` — qui fonde P-H1.)

⚠ **Écart délibéré : `Dest = "SPO_test3"` au lieu de `""`.** Justification — `TInterfaceServer.ChatMsg` diffuse à tous les clients du canal quand `Dest = ''` :
```pascal
if ((Dest = '') or (pos( fUserName, Dest ) <> 0)) and (Source.fCurrChannel = fCurrChannel)
  then HearThis( ... );          // InterfaceServer.pas:3922-3923
```
Avec `Dest = 'SPO_test3'`, seuls les clients dont le `fUserName` est une sous-chaîne de `'SPO_test3'` reçoivent la ligne — en pratique nous seuls. **Le profil registre est identique** (2 paramètres `widestring` → `edx`, `ecx`, puis `push edi`) : la sonde teste exactement le même défaut sans spammer les joueurs. Message maintenu **sous 200 caractères** pour ne pas incrémenter `fLongChatLines` (`InterfaceServer.pas:1381-1386`).

**Oracle — deux axes indépendants.**

*Axe 1, réponse sur le fil* : même tableau qu'en §4.1, plus deux entrées propres au `push edi` :

| Réponse | Conclusion |
|---|---|
| `A<rid> error 6;` | `errIllegalParamList` — l'exception a été capturée par `RDOObjectServer.pas:320-324`. Corrélat attendu dans `FIVEINTERFACESERVER/Survival` : `Error at: TRDOObjectServer.CallMethod "SayThis" (319)` (`:323`). **La corruption de pile est réelle et détectée côté serveur.** → P-H1 **HAUTE confirmée**, U2 **à ne PAS lancer** sans nouvel arbitrage développeur. |
| `A<rid> error 2;` alors que U1-a répondait normalement | `errIllegalObject` levée par le `except` externe (`:327-331`) — dégât plus profond. Même conclusion, même arrêt. |

*Axe 2, le corps a-t-il tourné ?* — **c'est l'axe décisionnel** :

| Observation | Conclusion | Suite |
|---|---|---|
| Ligne `<CompositeName>: RDO-probe U1b <ts>` dans `FIVEINTERFACESERVER/Chat <date>.log` (`InterfaceServer.pas:3909`) | Le corps a tourné, le `push edi` a eu lieu | **U2 a un objet** |
| Push `ChatMsg` reçu sur notre socket monde primaire (forme capturée : `C sel 40133496 call ChatMsg "*" "%SYSTEM","%…";` [capture :1018]) | Confirmation indépendante de l'exécution + observation de transparence d'octets | corrobore |
| **Aucune** ligne Chat et **aucun** push, malgré une réponse `error 9` | Le corps **n'a pas** tourné. Falsifie la lecture `RDOQueryServer.pas:471`. | **U2 SANS OBJET — arrêt de la branche**, §5.1 règle 1 |
| Ligne `- Error in SayThis` dans `Survival` (`InterfaceServer.pas:1391`) | Exception **interne** à `SayThis`, capturée par son propre `try/except` — distincte de la corruption de pile | consigner, ne pas confondre |

**Critère d'arrêt.** Une seule émission. Pas de seconde tentative avant analyse complète des deux axes.
**Repli.** `error 6` ou perte de connexion → arrêt, U2 gelée, rapport immédiat.

**Effet persistant assumé.** Une ligne dans le log public `Chat` du serveur partagé.

---

## 5. U2 — le `push edi` surnuméraire déstabilise-t-il le serveur ?

**Autorisation.** Porte D2 ouverte. Encadrement : [plan §5.1](../plan-remediation-rdo-2026-08-14.md#51-conditions-dexécution-de-u2-autorisé-mais-encadré), reproduit et opérationnalisé ci-dessous point par point.

**Objectif.** Déterminer si le déséquilibre de 4 octets décrit en §4.0 est cumulatif (dégradation progressive) ou absorbé à chaque appel par l'épilogue à `ebp` de `TRDOObjectServer.CallMethod`.

### 5.1 Conditions, mappées sur le §5.1 du plan

| Règle du plan | Implémentation dans ce protocole |
|---|---|
| 1. Jamais avant U1 | U1-a **et** U1-b exécutées ; **et** l'axe 2 de U1-b positif (ligne Chat présente). Sinon U2 est sans objet et n'est pas lancée. |
| 2. Jamais en parallèle | Aucune session E2E, aucun autre lot live, aucune autre sonde en vol. Fenêtre annoncée au développeur. |
| 3. Montée 1 → 10 → 100 | Trois paliers, **relevé complet entre chaque** (§5.2). Abandon à tout palier. |
| 4. Arrêt immédiat | Coupure de socket, tout `Aerror`, dégradation de `Survival`, anomalie dans `/logs/` → arrêt, **pas de reprise**, rapport. |
| 5. Compte dédié, zéro mutation | `SPO_test3`. Aucune action de jeu en marge. |

**Ajout de ce protocole : isolement de la connexion.** Les 111 trames partent sur la **connexion IS jetable** de §1.3, jamais sur la socket monde primaire ni sur le pool. Si un thread de service meurt, il meurt sur une connexion sans valeur, et la mort est immédiatement visible.

**Séquentialité stricte.** Chaque réponse est attendue avant l'émission suivante (`sendRdoRequest` corrèle par QueryId). Espacement ≥ 2 s ([E2E-LIVE-CAMPAIGN §6](../../doc/E2E-LIVE-CAMPAIGN.md), cadence par défaut). Durée du palier 100 : ~4 min.

### 5.2 Déroulé

**Trame, identique à U1-b, avec un compteur :**
```
C <rid> sel <ClientViewId> call SayThis "^" "%SPO_test3","%RDO-probe U2 <palier>/<n> <ts>";
```

**Relevé entre chaque palier (1, puis 10, puis 100) :**

| # | Mesure | Seuil d'arrêt |
|---|---|---|
| 1 | La connexion jetable est-elle toujours ouverte ? | fermée → **ARRÊT** |
| 2 | `C <rid> sel <ClientViewId> get ServerBusy;` sur la connexion jetable | ≠ `ServerBusy="#0"` ou pas de réponse → **ARRÊT** |
| 3 | `C <rid> sel <ClientViewId> get UserName;` (voir U6) | valeur incohérente → **ARRÊT** (indice de corruption d'objet) |
| 4 | La session de jeu primaire répond toujours | non → **ARRÊT** |
| 5 | `FIVEINTERFACESERVER/Survival` — nouvelles lignes depuis l'instantané précédent | toute occurrence de `Error at: TRDOObjectServer.CallMethod`, `Malformed query`, `Error in …` → **ARRÊT** |
| 6 | `FIVEMODELSERVER/Survival` — battement ≤ 15 s | trou > 60 s → **ARRÊT** |
| 7 | `FIVEMODELSERVER/TimeWarp` — aucune entrée nouvelle | toute entrée → **ARRÊT, alerte rouge** |
| 8 | `FIVEINTERFACESERVER/Clients` — nos sessions, code de sortie | ≠ 0 → **ARRÊT** |

**Oracle final.**

| Résultat après 111 émissions | Conclusion | Effet sur P-H1 |
|---|---|---|
| 111 réponses homogènes (`error 9`), tous relevés propres | Le déséquilibre est absorbé appel par appel ; pas d'effet cumulatif observable en 111 itérations. **Ne prouve pas l'innocuité** — l'épilogue `mov esp, ebp` masque `esp`, mais `esi`/`edi` restent corrompus dans la trame appelante. | P-H1 reste une divergence de fil à corriger, sévérité **MOYENNE** |
| Dégradation à un palier (latence croissante, réponses hétérogènes) | Effet cumulatif | P-H1 → **HAUTE**, correctif L10 prioritaire |
| Coupure de connexion / `error 6` / trace `Survival` | Corruption confirmée | P-H1 → **CRITIQUE**, correctif L10 en urgence, et documenter que la forme est *dommageable au serveur*, pas seulement non conforme |

**Effet persistant assumé, non anticipé par le plan.** ⚠ **111 lignes dans le log public `Chat` du serveur partagé** (`InterfaceServer.pas:3909`, journalisation inconditionnelle). Deux atténuations offertes à L9, par ordre de préférence :

1. **Conserver `SayThis`** (recommandé) — c'est le site réel du défaut, le préfixe `RDO-probe U2` rend les lignes identifiables, et le bruit est annoncé dans le rapport de session.
2. **Substituer `SetViewedArea`** si le développeur refuse le bruit de log : `procedure SetViewedArea( x, y, dx, dy : integer )` (`InterfaceServer.pas:144`). Profil registre : p1→`edx` (`RegsUsed` 1→2), p2→`ecx` (2→3), p3 et p4 → `push` (`RDOObjectServer.pas:251-254`), puis `RegsUsed = MaxRegs` → `push edi` (`:288-292`). L'appelé nettoie 8 octets (p3, p4) et laisse les 4 octets du pointeur `Res` : **déséquilibre rigoureusement identique**, aucune ligne de log, aucun appel au serveur de modèle. Émettre avec les coordonnées de viewport courantes. Fidélité moindre (ce n'est pas le site du défaut), coût serveur possible en `RefreshArea`.

**Ne pas substituer `SetTycoonCookie`** : même déséquilibre, mais chaque appel relaie vers `fServer.WorldProxy.RDOSetTycoonCookie` (`InterfaceServer.pas:1119`) — 100 allers-retours supplémentaires vers le serveur de modèle partagé.

---

## 6. U3 — la code page ANSI de production est-elle CP1252 ?

### 6.0 ⚠ L'aller-retour cookie, seul, ne tranche pas — démonstration

La sonde telle que formulée au §6 du rapport (« aller-retour d'octets 0x80–0x9F via `SetTycoonCookie`/`GetTycoonCookie` ») est **structurellement non concluante**, et il faut le dire avant de l'exécuter.

Le chemin est symétrique de bout en bout :

```
nos octets  ──StrToWideStr (ANSI→Wide, code page du processus)──►  WideString serveur
   RDOUtils.pas:348, :283-286
WideString ──WideStrToStr (Wide→ANSI, MÊME code page)──►  octets renvoyés
   RDOUtils.pas:379, :266-269
```

Une conversion et son inverse par la **même** code page rendent les mêmes octets, que cette code page soit CP1252, ISO-8859-1, CP1251 ou autre. L'aller-retour est donc **aveugle au choix de la table** — il ne peut pas répondre à la question posée.

**Ce qu'il mesure réellement, et qui reste utile :** la **transparence d'octets** de la bande. Une code page DBCS (CP932, CP936…) traite 0x81–0x9F comme des **octets de tête** : la conversion consommerait deux octets pour un caractère et la longueur reviendrait modifiée. Une code page où la bande serait non mappable rendrait des `?` (0x3F). L'aller-retour détecte donc la catastrophe, pas la nuance.

**Ce qui tranche vraiment est observationnel** — U3-b ci-dessous : chercher des octets 0x80–0x9F dans du texte **produit par de vrais clients Delphi**. Sous l'hypothèse ISO-8859-1 ces octets sont des contrôles C1, qu'aucun clavier ne produit ; sous CP1252 ce sont les caractères les plus fréquents d'un texte collé (`’ “ ” – … €`). Leur simple présence, et le sens qu'ils prennent une fois décodés en CP1252, constituent la preuve.

### 6.1 U3-a — transparence d'octets (contrôlée)

**Préalable.** P1–P8, **et P2 impérativement** (`ACTIVE_C1_BAND = LATIN1_C1_BAND`, `cp1252.ts:126`). `TycoonId` relevé (P5).

**Charge utile.** Les 32 points de code U+0080…U+009F. `encodeCodePoint` les rend à l'identique tant que la bande active est l'identité (`cp1252.ts:73-76, 170-180`), puis `clampToWireBytes` les laisse passer (`cp1252.ts:235-253`, seuls les > 0xFF sont remplacés), puis `Buffer.from(…, 'latin1')` (`rdo-helpers.ts:75`) écrit les octets 0x80–0x9F **exacts**.

La bande ne contient ni `0x22 "`, ni `0x3B ;`, ni `0x2C ,`, ni `0x3D =`, ni `0x0A`, ni `0x0D` : aucun métacaractère RDO, et aucun risque de corrompre le blob de cookies, qui est un texte `Nom=Valeur` par ligne [capture :987-990].

**Trames exactes.**

Écriture — forme de production, `"*"` **sans** QueryId (`spo_session.ts:2413-2418`) :
```
C sel <ClientViewId> call SetTycoonCookie "*" "#<TycoonId>","%RdoProbeU3","%<32 octets 0x80-0x9F>";
```
*Référence Voyager* : `C sel {{logonId}} call SetTycoonCookie "*" "#37","%LastX.0","%933"` (`src/mock-server/scenarios/captured/login-full-captured.scenario.ts:1006`, dérivé d'une capture live).
Profil registre sans risque : 3 paramètres, `Res` vide → pas de `push edi` (`RDOObjectServer.pas:282-283` — `varEmpty` → `jz @DoCall`). Le 3ᵉ paramètre est empilé et **nettoyé par l'appelé** : pile équilibrée.

Relecture — forme de production, `"^"` **avec** QueryId (`login-handler.ts:519-540`) :
```
C <rid> sel <ClientViewId> call GetTycoonCookie "^" "#<TycoonId>","%RdoProbeU3";
```
*Référence Voyager* : `C 36 sel 8161308 call GetTycoonCookie "^" "#22","%LastY.0";` → `A36 res="%395";` [capture :982-983]. `GetTycoonCookie` est une **fonction** (`InterfaceServer.pas:162`) : `"^"` y est la forme correcte et capture-prouvée.

**Oracle.**

| Réponse | Conclusion |
|---|---|
| `A<rid> res="%<les 32 mêmes octets>";` | **Bande transparente.** La code page n'est ni DBCS ni lacunaire sur 0x80–0x9F. Notre chemin d'écriture `latin1` ne corrompt rien *sur le fil*. La question du rendu reste ouverte → U3-b. |
| Longueur < 32 octets | **Code page DBCS** — octets de tête consommés par paires. **Ni `latin1` ni `win1252` ne conviennent** ; escalade au développeur, L11 bloqué. |
| Un ou plusieurs `0x3F ?` en retour | Conversion lossy sur ces positions. Noter **lesquelles** : si ce sont exactement 0x81, 0x8D, 0x8F, 0x90, 0x9D, c'est la signature des positions indéfinies de CP1252 → **argument fort pour CP1252**. |
| `A<rid> res="%";` | `GetTycoonCookie` a renvoyé vide → soit `fServer.fDAOK` faux ou `fServerBusy` vrai (`InterfaceServer.pas:1102-1104`), soit exception (`:1105-1112`, trace `- Error in GetTycoonCookie` dans `Survival`). **Rejouer après vérification de `ServerBusy`**, ne pas conclure. |
| `A<rid> error 9;` | Anomalie : `GetTycoonCookie` est une fonction, `"^"` y est légitime. Consigner, escalader. |

**Contrôle croisé gratuit.** L'écriture des cookies étant fire-and-forget, elle n'a **aucun** oracle O1 (`RDOQueryServer.pas:174-178` : sans QueryId, `Result := ''`, rien n'est renvoyé). La relecture **est** l'oracle. Émettre aussi `call GetTycoonCookie "^" "#<TycoonId>","%"` (blob complet, forme capturée [capture :986-990]) pour vérifier que `RdoProbeU3=<octets>` figure bien dans le blob sans avoir cassé le format ligne.

**Critère d'arrêt.** Deux allers-retours maximum (un nominal, un de confirmation).
**Repli.** Réponse vide ou `error` → vérifier `get ServerBusy`, attendre 30 s, un seul rejeu. Puis abandon.

**Effet persistant assumé.** Un cookie `RdoProbeU3` sur le tycoon `SPO_test3`. **Nettoyage obligatoire en fin de sonde** : réécrire la même clé avec une valeur vide (`"%"`), et le consigner. `[UNKNOWN]` — aucun membre publié ne permet de *supprimer* une clé de cookie ; l'écrasement par une valeur vide est le seul nettoyage disponible.

### 6.2 U3-b — moisson du corpus (décisive, lecture seule, risque nul)

**Objectif.** Trancher `win1252` vs `latin1` pour le lot L11.

**Méthode.** Zéro trame émise. Télécharger en `curl` les logs texte du serveur, sur la plus grande fenêtre de rétention disponible, et les analyser **au niveau octet** (ne jamais les lire via un décodeur qui normalise) :

```
http://158.69.153.134/logs/FIVEINTERFACESERVER/Chat%20<YY-MM-DD>.log        ← texte tapé par des joueurs
http://158.69.153.134/logs/FIVEINTERFACESERVER/Clients%20<YY-MM-DD>.log     ← noms de tycoons
http://158.69.153.134/logs/FIVEMODELSERVER/Money%20<YY-MM-DD>.log           ← noms
http://158.69.153.134/logs/FIVEMODELSERVER/favorites%20<YY-MM-DD>.log       ← chemins et noms saisis
http://158.69.153.134/logs/FIVEMODELSERVER/TimeWarp%20<YY-MM-DD>.log        ← résumés politiques, noms
```

Ces fichiers sont des `AnsiString` Delphi écrites telles quelles par `Logs.Log` : ce sont **exactement** les octets que le serveur considère comme son texte.

**Oracle.**

| Observation | Conclusion |
|---|---|
| Au moins un octet de 0x80–0x9F dont l'interprétation CP1252 est une ponctuation sensée en contexte (`0x92 ’` dans `don’t`, `0x93/0x94 “ ”` autour d'une citation, `0x96/0x97 – —`, `0x85 …`, `0x80 €`) | **CP1252 prouvé.** Aucun client ne peut produire un contrôle C1 depuis un clavier. → **L11 = `CP1252_C1_BAND`** |
| Octets 0x80–0x9F présents mais incohérents en CP1252, cohérents dans une autre code page Windows (CP1250/1251…) | La code page n'est ni l'une ni l'autre. **L11 bloqué**, escalade développeur avec les octets. |
| Aucun octet 0x80–0x9F sur tout le corpus | **Non concluant** (règle 4 : l'absence ne prouve rien). Repli sur U3-c, puis décision par défaut. |

**Décision par défaut si non concluant** — recommandation de ce protocole, à arbitrer par le développeur : **basculer quand même sur CP1252**. Les serveurs sont des processus Delphi 5 Win32 en locale occidentale ; `WideStrToStr` passe par `WideCharToMultiByte` sur la code page ANSI du processus (`RDOUtils.pas:266-269`), qui sur une installation Windows occidentale **est** CP1252. ISO-8859-1 n'est la code page ANSI d'aucune installation Windows. `[INFERRED]`. Le risque résiduel du basculement est nul sur 0x00–0x7F et 0xA0–0xFF (tables identiques, `cp1252.ts:177-180`), et strictement borné à la bande 0x80–0x9F, aujourd'hui déjà fausse dans les deux sens (rapport §4, P-H2).

### 6.3 U3-c — corroboration par la surface ASP (lecture seule, optionnelle)

`curl -sI` sur une page ASP legacy du même hôte (`FacilityList.asp`, `MailFolder.asp` — [capture :3556]) et relever l'en-tête `Content-Type: …; charset=…` ainsi que toute directive `@CODEPAGE`/`<meta charset>` du corps. Preuve **indirecte** (IIS/ASP, pas le processus RDO), à ne jamais opposer à U3-b, mais utile en corroboration si U3-b est muette.

---

## 7. U4 — le serveur tolère-t-il les littéraux `@` / `!` ?

### 7.0 Pourquoi la sonde `RDOLaunchMovie` du rapport est une mauvaise sonde

Trois défauts, chacun rédhibitoire :

1. **Aucun oracle.** `RDOLaunchMovie` part en fire-and-forget (`building-property-handler.ts:172-174` : `RdoCommand.sel(target).call(propertyName).push()`), donc sans QueryId. Or si `GetVariantFromStr` lève sur `@1234.5` (`RDOUtils.pas:341-344`), l'exception remonte au `try/except` de `ExecQuery` (`RDOQueryServer.pas:162-165`), `Result := 'error 1'` — puis `if QueryId <> ''` est **faux** et `Result := ''` (`:174-178`). **Rien n'est renvoyé. L'échec est parfaitement silencieux.**
2. **Coût.** Exige un Movie Studio possédé par `SPO_test3` (TYPE-gated) et dépense de l'argent en jeu (MONEY-gated) — bloqué sur Q1/Q2 de [E2E-LIVE-CAMPAIGN §10](../../doc/E2E-LIVE-CAMPAIGN.md).
3. **Confusion des variables.** En cas d'échec on ne saurait pas distinguer « `@` refusé », « séparateur décimal », « studio en mauvais état », « budget invalide ».

### 7.1 U4-a — sonde du parseur de littéraux (contrôlée, sans effet, décisive)

⚠ **ÉCART assumé vs §6 du rapport.**

**Idée.** `TRDOQueryServer.SetCommand` parse le littéral **avant** de toucher à quoi que ce soit, et enveloppe ce parsing dans un `try/except` qui produit un code distinct :

```pascal
PropValAsStr := ReadLiteral( QueryText, ScanPos );          // RDOQueryServer.pas:338
try
  PropValue := GetVariantFromStr( PropValAsStr );           // :340  ← le test
  fObjServer.SetProperty( ObjectId, PropName, ... );        // :341
  if ErrorCode <> errNoError
    then Result := CreateErrorMessage( ErrorCode ) + ' setting ' + PropName;   // :344
except
  Result := CreateErrorMessage( errIllegalPropValue ) + ' setting ' + PropName; // :346
end;
```

En visant une propriété **qui n'existe pas**, `SetProperty` retourne `errUnexistentProperty` (`RDOObjectServer.pas:176`) **sans rien écrire**. Les deux issues sont donc parfaitement disjointes :

- **le littéral parse** → `error 3 setting <Prop>` ;
- **le littéral ne parse pas** → `error 4 setting <Prop>`.

Zéro mutation, zéro méthode appelée, un seul aller-retour, oracle binaire.

**Préalable.** P1–P8.

**Trames exactes** (quatre, dans cet ordre) :
```
C <rid> sel <ClientViewId> set RdoProbeU4="#1";        ← contrôle : le harnais marche
C <rid> sel <ClientViewId> set RdoProbeU4="@1";        ← @ entier, sans séparateur décimal
C <rid> sel <ClientViewId> set RdoProbeU4="@1234.5";   ← LA question
C <rid> sel <ClientViewId> set RdoProbeU4="!3.14";     ← idem en simple précision
```
Émises via `REQ_RDO_DIRECT` (`verb: 'sel'`, `action: 'set'`, `member: 'RdoProbeU4'`, `args: ['"@1234.5"']`) → `rdo.ts:359-361` produit `set RdoProbeU4="@1234.5"`. Notre `RdoValue.double(1234.5).format()` rend `"@1234.5"` (`rdo-types.ts:107-114` ; test de non-régression `facility-set-commands.test.ts:703`).

**Oracle.**

| Trame | Réponse | Conclusion |
|---|---|---|
| `"#1"` | `A<rid> error 3 setting RdoProbeU4;` | Harnais et oracle validés. Si autre chose → corriger le harnais avant d'interpréter la suite. |
| `"@1"` | `error 3 setting …` | `@` accepté par `VarCast(…, varDouble)` |
| `"@1234.5"` | **`error 3 setting …`** | ✅ **`@` fractionnaire accepté ; séparateur décimal du serveur = `.`** → notre émission est conforme, U4 close |
| `"@1234.5"` | **`error 4 setting …`** alors que `"@1"` donnait `error 3` | ❌ **Le serveur refuse le point décimal.** `[INFERRED]` locale serveur à séparateur `,` — `VarCast` string→`varDouble` en Delphi 5 utilise `DecimalSeparator`. **Constat nouveau, HAUT** : tout `@`/`!` fractionnaire que nous émettons est silencieusement perdu (défaut 1 ci-dessus). Correctif : formater sur le séparateur serveur, ou n'émettre que des entiers. |
| `"@1"` **et** `"@1234.5"` en `error 4` | `@` rejeté en bloc — incompatible avec `RDOUtils.pas:341-344`. Consigner les octets bruts, escalader. |
| `"!3.14"` | idem `@` | même conclusion pour `SingleId` |
| `error 1` (`errMalformedQuery`) | L'exception a échappé au `try` de `:339` et remonté à `ExecQuery:162`. Consigner. |
| `error 7` (`errIllegalPropType`) | Impossible sur propriété inexistante — signalerait que `RdoProbeU4` existe. Renommer la sonde et rejouer. |

**Critère d'arrêt.** Quatre trames. Aucune répétition.
**Repli.** Le contrôle `"#1"` ne donne pas `error 3` → arrêt, corriger le harnais, ne rien conclure.

**Effet persistant.** Aucun. `GetPropInfo` retourne `nil`, rien n'est écrit (`RDOObjectServer.pas:145-146, 175-176`).

**Note P-H3.** Cette sonde utilise un identifiant que nous contrôlons et qui respecte `/^[A-Za-z_][A-Za-z0-9_]*$/`. Elle **n'est pas** un test d'injection d'identifiant (P-H3) et ne doit pas être détournée en tel — l'adversarial d'identifiants reste du ressort de L2 sur le mock.

### 7.2 U4-b — bout en bout `RDOLaunchMovie` (conditionnelle, à ne lancer que si U4-a est positive)

**Ne pas exécuter** si : U4-a a répondu `error 4` sur `"@1234.5"` (la réponse est déjà acquise), ou si `SPO_test3 - Green` ne possède pas de Movie Studio, ou si le budget Q1/Q2 n'est pas arbitré.

**Trame de production** (`building-property-handler.ts:408-424` + `:172-174`), sur la socket `construction` :
```
C sel <currBlock> call RDOLaunchMovie "*" "%<nom>","@<budget>","#<mois>","#<autoInfo>";
```
Signature : `procedure RDOLaunchMovie(theName : widestring; budget : double; months : integer; AutoInfo : word)` — `StdBlocks/MovieStudios.pas:104`.
Profil pile : `theName`→`edx` (1→2) ; `budget` double → **8 octets empilés** (`RDOObjectServer.pas:259-265`, les flottants ne passent jamais par registre) ; `months`→`ecx` (2→3) ; `AutoInfo` → `RegsUsed = MaxRegs` → `push` ; `Res` vide (`"*"`) → pas de `push edi`. **12 octets pile, nettoyés par l'appelé : équilibré.** ✅

**Oracle.** O1 indisponible (fire-and-forget). Seuls : **O2** relecture indépendante de `InProd` (`building-property-handler.ts:674-677`) — la relecture de la passerelle est inutilisable comme oracle, elle ré-affiche la valeur demandée (`:185-188`, défaut M-E) ; **O4** logs `FIVEMODELSERVER` dans la fenêtre calibrée ; **O5** aucune pathologie.

**Effet persistant.** Un film lancé, de l'argent dépensé. **Mutation de jeu réelle : hors périmètre de ce protocole de sondes tant que Q1/Q2 ne sont pas arbitrées.**

---

## 8. U6 — le serveur nous renvoie-t-il jamais du `$` (AnsiString) ?

**État des captures.** Aucune occurrence de `="$` dans `doc/Mock_Server_scenarios_captures.md` ni dans `doc/building_details_rdo.txt` (recherche exhaustive). Les seuls `get` de propriété capturés sont `ServerBusy="#0"` [capture :993-994] et `RDOOpenSession="#…"` — des entiers. Toutes les valeurs `%` capturées proviennent de **fonctions** retournant `OleVariant` (`res="%…"`), pas de propriétés. **Règle 4 : cette absence ne prouve rien.**

**Ce que dit le source.** `TRDOObjectServer.GetProperty` traite `tkString, tkLString, tkWString` par une seule branche :
```pascal
tkString, tkLString, tkWString:
  Result := GetStrProp( theObject, thePropInfo );     // RDOObjectServer.pas:96-97
```
`Result` est un `variant` ; l'affectation depuis une expression `string` produit un `varString`. Puis `GetStrFromVariant` : `varString: Result := StringId + RDOStrEncode( aVariant )` (`RDOUtils.pas:376-377`), `StringId` = `$`. **`[INFERRED]` toute propriété `string` publiée lue par `get` renvoie `$`.**

**Trois candidates identifiées sur l'objet que nous sélectionnons à chaque session** (`TClientView`) :

| Propriété | Déclaration | Valeur attendue |
|---|---|---|
| `UserName` | `property UserName : string read fUserName;` — `InterfaceServer.pas:126` | `SPO_test3` |
| `CompositeName` | `property CompositeName : string read GetCompositeName;` — `:127` | nom composé |
| `MailAccount` | `property MailAccount : string read GetMailAccount;` — `:141` ; implémentation `result := fUserName + '@' + fServer.WorldName + '.net'` — `:672-675` | `SPO_test3@planitia.net` |

**Préalable.** P1–P8. Aucun autre.

**Trames exactes** (trois, lecture pure) :
```
C <rid> sel <ClientViewId> get UserName;
C <rid> sel <ClientViewId> get MailAccount;
C <rid> sel <ClientViewId> get CompositeName;
```
Via `REQ_RDO_DIRECT` (`verb: 'sel'`, `action: 'get'`, `member: 'UserName'`) — `rdo.ts:354-365`, pas de séparateur pour un `get`.

**Oracle.**

| Réponse | Conclusion |
|---|---|
| `A<rid> MailAccount="$SPO_test3@planitia.net";` | ✅ **U6 tranchée : oui, le serveur émet du `$`.** Notre décodeur le gère déjà (`rdo-helpers.ts:98` liste `$` ; `:167` et `:176` retirent `^[$#%@]` ; `RdoParser.extract` reconnaît `RdoTypePrefix.STRING`, `rdo-types.ts:171-180`). Promouvoir l'observation en preuve de rang capture et documenter dans `rdo-protocol-architecture.md`. |
| `A<rid> MailAccount="%SPO_test3@planitia.net";` | `GetStrProp` a produit un `varOleStr`. `$` ne serait alors jamais émis par ce chemin → U6 penche vers **non**, mais rester prudent : d'autres classes (serveur de mail, objets de modèle) peuvent différer. |
| `A<rid> error 3 getting UserName;` | `errUnexistentProperty` — l'objet visé n'est pas un `TClientView`. Vérifier P4. |
| `A<rid> error 7 getting …;` | `errIllegalPropType` (`RDOObjectServer.pas:103`) — type de propriété non géré. Consigner : information de première main sur le RTTI. |
| `A<rid> error 2 getting …;` | `errIllegalObject` (`:124`) — id périmé. |

**Piège à documenter.** `GetProperty` a un **repli en appel de méthode** : si `GetPropInfo` retourne `nil`, il appelle `CallMethod` avec le même nom (`RDOObjectServer.pas:111-116`). Un `get <Nom>` peut donc invoquer une **méthode**. C'est la « GET fallthrough » déjà documentée ; ici elle impose de vérifier que la réponse vient bien de la propriété (valeur `$` attendue) et non d'une fonction homonyme (`res=…`). Le nom de la clé dans la réponse (`MailAccount="…"` vs `res="…"`) distingue les deux sans ambiguïté (`RDOQueryServer.pas:284` vs `:482`).

**Critère d'arrêt.** Trois lectures. Aucune répétition.
**Repli.** Aucune des trois ne répond en `$` ni en `%` → consigner, ne pas élargir la chasse en séance.

**Effet persistant.** Aucun.

---

## 9. U5 et U7 — hors périmètre live, comme demandé

**U5 — `error N` en milieu de charge utile.** Se tranche **par lecture**, sans live. Notre détecteur est ancré : `payload.match(/^error\s+(\d+)(?:\s+(getting|setting)\s+(\S+))?\s*$/i)` (`rdo.ts:141`). Or `GetCommand` **concatène** les erreurs quand plusieurs propriétés sont demandées : `Result := Result + ParamDelim + CreateErrorMessage(ErrorCode) + ' getting ' + PropName` (`RDOQueryServer.pas:300`, `:308`). Une charge utile `A12 A="#1",error 3 getting B;` serait donc classée **succès**. La question se réduit à : « un handler construit-il un `get A, B` ? » — audit de code, à confier à un `Explore`, pas à L9. Le correctif est identique dans les deux cas (élargir le détecteur), donc la sonde ne conditionne rien.

**U7 — `Aerror 17` en dernier octet d'une socket qui se tait.** Test **mock** (`src/mock-server/`), scénario : émettre `Aerror 17` sans terminateur puis fermer. Vérifier que le drapeau busy bascule sur `close`. Le chemin de reconnaissance existe déjà (`rdo.ts:65-70`, `:114-124`) ; ce qui manque est le comportement sur `close` immédiat. **À ne pas provoquer en live** — obtenir un `Aerror 17` de production suppose de charger un serveur partagé.

---

## 10. Traces à conserver et forme du rapport

### 10.1 Ce qui doit exister après la campagne

| Artefact | Contenu | Chemin |
|---|---|---|
| Log fil NDJSON | Une ligne par trame : `RDO>>`, `RDO>*`, `RDO<<`, avec `sid`, `rid`, `raw`, horodatage ms ([E2E-LIVE-CAMPAIGN §2.1](../../doc/E2E-LIVE-CAMPAIGN.md)) | `logs/probe-<date>-<n>.ndjson` |
| Journal des sondes | Une ligne NDJSON **avant** chaque émission : `{ts, probeId:'U1a', frame, expect:[…], notes}` ; complétée **après** par `{answer, verdict}` | `report/campaign/journal-<date>-<n>.ndjson` |
| Cache des logs serveur | Instantanés AVANT et APRÈS, par catégorie, immuables | `report/campaign/logs-cache/<date>/` |
| Octets bruts | Pour U3 : les charges utiles en **hexadécimal**, jamais en texte rendu | dans le rapport de session |
| Rapport de session | §10.2 | `report/campaign/session-<date>-<n>.md` |

**Corrélation.** Clés de jointure par ordre de force ([E2E-LIVE-CAMPAIGN §3.1](../../doc/E2E-LIVE-CAMPAIGN.md)) : (1) `ClientViewId` du log fil = `LOGON SUCCESS: ClientViewId=` de IS `Survival` ; (2) fenêtre ±2 s après calibration P6 ; (3) signature d'événement — pour U1-b/U2, le préfixe `RDO-probe`. Le corrélateur `src/tools/correlate-server-logs.ts` **n'existe pas encore** ([§3.3](../../doc/E2E-LIVE-CAMPAIGN.md)) : pour ces sondes, la corrélation manuelle est acceptable et suffisante, le volume est faible.

### 10.2 Squelette du rapport de session

```markdown
# Sondes live U1–U6 — session <date>-<n>

Build : <sha> · ACTIVE_C1_BAND : <LATIN1|CP1252> (cp1252.ts:126)
ClientViewId : <id> · TycoonId : <id> · Décalage horloge : <±N s>
Instantanés logs : AVANT <heure> / APRÈS <heure>

## Verdicts
| Sonde | Trame émise | Réponse brute | Verdict | Conséquence |
|---|---|---|---|---|
| U1-a  | `C 42 sel … call ClientAware "^";` | `A42 error 9;` | … | … |

## Par sonde
### U1-a
Trame (octets) · Réponse (octets) · Lignes de log serveur corrélées · Interprétation · Écarts vs prédiction

## Anomalies et pathologies
(vide = bonne nouvelle, à dire explicitement)

## Effets persistants laissés sur le serveur
- N lignes `Chat` préfixées `RDO-probe`
- cookie `RdoProbeU3` (nettoyé : oui/non)

## Décisions débloquées
- P-H1 sévérité : … → lot L10
- L11 : `win1252` | `latin1` | indécis
```

**Promotion des preuves.** Toute observation octet-exacte issue de ces sondes est de **rang capture** dans la hiérarchie de preuves ([E2E-LIVE-CAMPAIGN §9](../../doc/E2E-LIVE-CAMPAIGN.md)) : à reverser dans `doc/rdo-protocol-architecture.md` avec la date, et à figer en scénario mock pour que L2 la garde.

---

## 11. Réserves du rédacteur

Points où ce protocole s'écarte du §6 du rapport, ou signale une faiblesse résiduelle.

1. **U3 tel que formulé au §6 du rapport est non concluant.** Un aller-retour par la même code page rend les mêmes octets quelle que soit la table (§6.0). La sonde est conservée pour sa valeur réelle — transparence d'octets, détection d'une code page DBCS ou lacunaire — mais **la décision L11 repose sur U3-b**, la moisson du corpus de logs, qui n'émet rien. Si U3-b est muette, L11 doit être arbitré par le développeur sur l'argument `[INFERRED]` du §6.2, pas par une sonde.

2. **U4 tel que formulé au §6 du rapport n'a pas d'oracle.** `RDOLaunchMovie` part sans QueryId : un rejet de littéral est intégralement silencieux (`RDOQueryServer.pas:174-178`). La sonde `set` sur propriété inexistante (§7.1) répond à la même question, sans effet, sans argent, avec un oracle binaire. **La substitution est le point le plus important de ce document après le verrou U1→U2.**

3. **La prémisse de U2 est probablement fausse dans le sens favorable.** Le rapport suppose que le serveur pourrait « rejeter la forme sans exécuter le corps » ; le source montre que `CallMethod` est appelé **avant** tout marshalling (`RDOQueryServer.pas:471`). U2 aura donc très probablement un objet. L'oracle du log Chat reste la décision — mais L9 doit s'attendre à devoir lancer les 111 trames.

4. **Coût non anticipé de U2 : 111 lignes permanentes dans un log public partagé.** Le §5.1 du plan ne le mentionne pas. Une substitution à effet de log nul est proposée (`SetViewedArea`, §5.2), avec perte de fidélité. **À arbitrer avant lancement, pas pendant.**

5. **U1-a est un ajout, et il devrait être obligatoire.** Poser la question protocolaire (« que répond le serveur à `"^"` sur une procédure ? ») sur un membre à **0 paramètre** la sépare complètement de la question mémoire (« que fait le `push edi` ? »). Le rapport les fusionnait sur `SayThis`. Séparées, la première coûte une trame et zéro risque.

6. **Aucune sonde ne mesure `error N` en milieu de charge utile (U5).** Traité en §9 : c'est de la lecture de code, pas du live.

7. **Le harnais d'émission n'existe pas.** `REQ_RDO_DIRECT` est câblé côté passerelle (`misc-handlers.ts:171-205`) mais n'a **aucun déclencheur** exploitable depuis le navigateur. Sans `src/tools/rdo-probe.ts` ou un `__spoDebug.rdoDirect()`, seule U1-b est exécutable (par le chat de l'UI). **C'est le préalable bloquant de L9**, et il doit être livré et relu **avant** l'ouverture de la fenêtre live, jamais improvisé au clavier face au serveur de production.

8. **`[UNKNOWN]` restants**, et ce qui les lèverait :
   - Le comportement exact de `VarAsType(varVariant, varString)` en Delphi 5 — lève-t-il ? U1-a le tranche en une trame.
   - Le séparateur décimal de la locale du processus serveur — U4-a le tranche.
   - L'existence d'un membre publié appliquant `AnsiUpperCase` à du texte que nous contrôlons : ce serait un discriminant **contrôlé** de code page, strictement meilleur que U3-b. Aucun candidat identifié ; une recherche dans `../SPO-Original` la lèverait, hors budget de ce lot.
   - La suppression d'une clé de cookie : aucun membre publié ne semble l'offrir ; le nettoyage de U3-a est un écrasement par valeur vide.

---

## Chaîne de preuves

**Captures live (rang 1)**
- `doc/Mock_Server_scenarios_captures.md:3542-3543` — `call AddLine "*" "%test message";` → `A2174 ;` : void + QueryId reçoit un ack propre
- `…:3548-3549` — `call CloseMessage "*" "#30430748";` → `A2177 ;`
- `…:982-983` — `call GetTycoonCookie "^" "#22","%LastY.0";` → `A36 res="%395";` : `"^"` sur une **fonction**, forme correcte
- `…:986-990` — blob de cookies complet, format `Nom=Valeur` par ligne
- `…:1017-1019` — `call ClientAware "*" ;` émis de façon répétée par le client de référence
- `…:1018` — `call ChatMsg "*" "%SYSTEM","%…";` : forme du push de chat serveur→client
- `src/mock-server/scenarios/captured/login-full-captured.scenario.ts:1006` — `call SetTycoonCookie "*" "#37","%LastX.0","%933"` (dérivé de capture)
- **Zéro occurrence** de `="$`, `="@`, `="!` dans l'ensemble du corpus de captures (règle 4 : ne prouve rien)

**Source Delphi (rang 2)**
- `Rdo/Server/RDOQueryServer.pas:419` — `^` et `*` acceptés au même test ; `:422-424` `Res.VType := varVariant` ; `:471` `CallMethod` appelé avant tout marshalling ; `:473-504` marshalling et `error 9` ; `:174-178` sans QueryId, aucune réponse n'est émise ; `:338-348` `SetCommand`, `try` autour de `GetVariantFromStr`, `error 4` en cas d'échec ; `:162-165` `except` global → `error 1` ; `:284` clé de réponse d'un `get` ; `:300`, `:308` concaténation des erreurs multi-propriétés (U5)
- `Rdo/Server/RDOObjectServer.pas:190-332` — dispatch registre, `MaxRegs=3` ; `:234-236` `push eax/esi/edi` ; `:246`, `:253`, `:269` empilements de paramètres ; `:259-265` doubles toujours empilés ; `:281-292` placement du pointeur `Res`, `push edi` quand `RegsUsed = MaxRegs` ; `:295-297` dépilements ; `:320-324` `except` → `errIllegalParamList` + trace `Survival` ; `:326` `errUnexistentMethod` ; `:96-97` `tkString/tkLString/tkWString` → `GetStrProp` ; `:111-116` repli GET→méthode ; `:103` `errIllegalPropType` ; `:124`, `:176` codes d'erreur
- `Rdo/Common/RDOUtils.pas:360-393` `GetStrFromVariant` (`varString`→`$`, `varOleStr`→`%`, `varVariant`→`VarAsType`, `except`→`IllegalVType`) ; `:319-358` `GetVariantFromStr` (`VarCast` vers `varSingle`/`varDouble`) ; `:266-269`, `:283-286` conversions Wide↔Ansi ; `:219-227` `ReadLiteral` sur un caractère non littéral ; `:70-78` `ReadIdent`
- `Rdo/Common/ErrorCodes.pas:6-23` — table des codes ; `:32-39` `CreateErrorMessage`
- `Rdo/Server/WinSockRDOConnectionsServer.pas:785-826` — dispatch des trames entrantes ; `:812` `A`+`error 17` sans QueryId ni terminateur (U7)
- `Interface Server/InterfaceServer.pas:126, 127, 141` — trois propriétés `string` publiées (U6) ; `:672-675` `GetMailAccount` ; `:128` `TycoonId` ; `:144` `SetViewedArea` ; `:162-163` `Get/SetTycoonCookie` ; `:179` `procedure SayThis( Dest, Msg : widestring )` ; `:197` `ClientAware` ; `:1099-1127` implémentations des cookies ; `:1375-1395` `SayThis` ; `:3902-3937` `ChatMsg`, avec `:3909` journalisation inconditionnelle et `:3922-3923` règle de diffusion
- `StdBlocks/MovieStudios.pas:104` — signature `RDOLaunchMovie`

**Notre code (rang 4)**
- `src/shared/rdo-types.ts:107-114` `format()` ; `:171-180` `RdoParser.extract`
- `src/shared/cp1252.ts:126` bande active ; `:163-184` `encodeCodePoint` ; `:235-253` `clampToWireBytes`
- `src/server/rdo.ts:330-390` `format()` ; `:141` détecteur d'erreur ancré ; `:46` décodage `latin1` ; `:65-70` récupération `Aerror`
- `src/server/rdo-helpers.ts:71-76` `writeRdoFrame` ; `:98-100`, `:167`, `:176` traitement du préfixe `$`
- `src/server/spo_session.ts:1503-1510` `executeRdo` ; `:2085-2114` exemption de retry CALL/SET ; `:2121-2129` + `:155` pool monde ; `:2220-2222` assemblage et terminateur ; `:2413-2418` `SetTycoonCookie`
- `src/server/session/chat-handler.ts:160-167` site P-H1 ; `src/server/session/login-handler.ts:519-540` `GetTycoonCookie` ; `:332` connexion monde
- `src/server/session/rdo-connection-pool.ts:238-269` connexions IS nues sans logon (précédent)
- `src/server/session/building-property-handler.ts:172-174`, `:408-424`, `:674-677`, `:185-188`
- `src/server/ws-handlers/misc-handlers.ts:152-205` `REQ_RDO_DIRECT`
- `src/client/client.ts:51-66` `__spoDebug` (sans API d'envoi)

**`[INFERRED]`** — `VarAsType` sur `varVariant` lève ⇒ `error 9` · le corps de la procédure s'exécute toujours (U1-b le vérifie) · `esi`/`edi` corrompus dans la trame appelante après `push edi` · absence de contrôle d'autorisation par connexion dans `ExecQuery` · code page ANSI d'une installation Windows occidentale = CP1252 · `VarCast` string→float utilise `DecimalSeparator` en Delphi 5 · `ClientAware` idempotente et inoffensive (fondé sur son émission répétée en capture)

**`[UNKNOWN]`** — voir §11.8

---

*Skills utilisées : `rdo-conformity` (hiérarchie de preuves §0, matrice verbe/séparateur §8.5), `delphi-archaeologist` (source legacy, citations Fichier.pas:Ligne), `rdo-network-resilience` (ServerBusy, pool, timers), `code-guardian` (fichiers protégés, catégories de crash).*
