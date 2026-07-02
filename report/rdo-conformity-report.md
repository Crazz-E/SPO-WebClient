# SPO WebClient ↔ Serveur legacy Delphi — Rapport de conformité RDO

**Date :** 2026-07-02
**Audience :** développeur WebClient **et** développeur serveur (Delphi)
**Périmètre :** conformité de la couche RDO du WebClient (protocole + gestion des sessions réseau) vs le code source `SPO-Original`. Aucune modification serveur — les défauts serveur sont remontés en §6.
**Méthode :** analyse relancée de zéro. 3 agents d'exploration (inventaire RDO WebClient, vérité terrain Delphi, inventaire des appels/sessions), croisement des deux inventaires, puis vérifications ciblées des signatures publiées Delphi (Phase 0, V1–V12). Chaque verdict cite `fichier:ligne` des deux côtés.

> Chemins Delphi relatifs à `../SPO-Original`. Statuts : ✅ corrigé · 📝 documenté (non-divergence ou choix assumé) · 🔴 serveur (remonté, pas de fix WebClient possible).

---

## 1. Résumé exécutif

| # | Anomalie | Verdict | Statut |
|---|----------|---------|--------|
| A1 | Écritures socket en UTF-8 alors que le fil Delphi est ANSI/Latin-1 | DIVERGENCE confirmée | ✅ Tier 1 (F1) |
| A2 | Logoff : `RDOEndSession` envoyé à l'InterfaceServer (membre inexistant → error 5) au lieu du `Logoff` publié ; socket détruite avant la fermeture gracieuse ; double `endSession` sur REQ_LOGOUT | DIVERGENCE confirmée | ✅ Tier 2 (F5) |
| A3 | Regex d'erreur ancrée qui rate `error <n> getting/setting <Prop>` → erreurs traitées en succès | DIVERGENCE confirmée | ✅ Tier 1 (F4, fichier protégé pré-approuvé) |
| A4 | `EnableEvents="#-1"` — soupçonné divergent, **prouvé conforme** : le client legacy marshalle `varBoolean(true)` en `#-1` (captures réelles) | NON-DIVERGENCE | 📝 (décision initiale « corriger vers #1 » annulée sur preuve V9) |
| A5 | KeepAlive 60 s envoyé à la racine cacher qui ne le publie pas (error 5 silencieux) ; le legacy keep-alive l'objet temporaire | DIVERGENCE confirmée | ✅ Tier 2 (F6) |
| A6 | `RDOOpenSession` en `get` — soupçonné divergent, **prouvé octet-exact legacy** (property-get COM, RDOObjectProxy.pas:388-399) | NON-DIVERGENCE | 📝 (fix appliqué puis reverté sur preuve) |
| A7 | Reconnexion sur timeouts RDO / échecs de poll — le legacy ne reconnecte QUE sur close socket | DIVERGENCE confirmée | ✅ Tier 3 (F8/F9) |
| A8 | Poll ServerBusy : 10 s / deadline 1 s vs legacy ~50 s / 180 s / stop après 4 échecs | DIVERGENCE confirmée | ✅ Tier 3 (F9) |
| A9 | Timeouts en jeu 30 s vs legacy ISProxyTimeOut = 180 s | DIVERGENCE confirmée | ✅ Tier 3 (F7) |
| A10 | `CheckNewMail(ServerId=0)` : le serveur caste l'argument en **pointeur** → AV → retourne toujours -1 | DIVERGENCE confirmée (nouvelle) | ✅ Tier 2 (F10) |
| V1 | `PickEvent(TycoonId: integer)` — tycoonId envoyé en `%` OLEString (BSTR poussé comme entier par l'ASM du serveur) | DIVERGENCE confirmée | ✅ Tier 1 (F2) |
| V2 | `GetTycoonCookie(TycoonId: integer; …)` — idem `%` au lieu de `#` | DIVERGENCE confirmée | ✅ Tier 1 (F2) |
| V3 | `FindSuppliers/FindClients(…; Count,X,Y,SortMode,Role: integer)` — 5 args int envoyés en `%` | DIVERGENCE confirmée | ✅ Tier 1 (F2) |

**Non-divergences vérifiées** (aucun fix, §5) : encodage booléen `#-1` (V9), `RDOOpenSession` get (A6), pas de char de priorité (V5), doubles avec point décimal (V12), `RDOLogonClient` fire-and-forget (V11), signatures chat/mail/NewFacility/NewCompany/CloneFacility/SetTycoonCookie/SayThis (V6/V7/V8), pushs sans réponse attendue, format de la réponse idof sortante.

---

## 2. Référence du format de fil (vérité terrain Delphi)

- **Encodage : ANSI mono-octet** (Latin-1 en pratique). `Socket.SendText/ReceiveText` sur `AnsiString` ; les `widestring` sont rétrécis par `WideStrToStr` (RDOUtils.pas:262-282). Jamais d'UTF-8.
- **Trames** : terminées par `;` hors littéraux quotés (KeyWordPos, RDOUtils.pas:78-121) ; `""` = quote échappée ; CR/LF = simple blanc. Garde anti-flood : trame > 1 Mo → fermeture socket (WinSockRDOConnectionsServer.pas:777-783).
- **Réponses** : `A<id> <corps>;` — pas d'espace après `A` (WinSockRDOConnectionsServer.pas:368). Pushs : `C <corps>` **sans** QueryId (fire-and-forget, WinSockRDOServerClientConnection.pas:291-314).
- **Erreurs** : `error <n>`, `error <n> getting <Prop>`, `error <n> setting <Prop>` (RDOQueryServer.pas:274 ; codes 0-17 ErrorCodes.pas:6-23).
- **QueryId absent → aucune réponse émise** (RDOQueryServer.pas:170-173) — c'est le mécanisme fire-and-forget. Void call AVEC QueryId → ack vide `A<id> ;` (pas de crash dans cette version du parseur ; la règle prudente du projet est conservée).
- **GET fallthrough** : `get <X>` sur un non-property invoque la méthode du même nom (RDOObjectServer.pas:114-118) — le client legacy s'appuie dessus pour tous les membres sans argument lus en expression (RDOObjectProxy.pas:388-399 route PROPERTYGET+0 args → MarshalPropertyGet).
- **Priorité** : le client legacy n'émet jamais de char de priorité (fPriority=NORMAL par défaut, jamais modifié dans Voyager ; RDOMarshalers.pas:130-135). Le serveur force alors THREAD_PRIORITY_HIGHEST (RDOQueryServer.pas:103).
- **Booléens** : côté client → `varBoolean` → `#-1` (true) / `#0` (false) — prouvé par captures réelles (`doc/building_details_rdo.txt:2,17` : `res="#-1"`). Côté serveur, un GET de propriété Boolean renvoie l'ordinal (`#1`/`#0`). Les deux formes coexistent légitimement.
- **Doubles `@`** : format locale du serveur (VarAsType). Toutes les captures observées utilisent le point (`140001.2714`) — `parseFloat` est correct pour ce déploiement.
- **Ids d'objets** : pointeurs 32 bits signés ; le parseur `sel` ne lit pas de signe `-` (ReadNumber, RDOUtils.pas:142-172) — seuls des ids positifs sont envoyables.

---

## 3. Anomalies corrigées

### A1 — Écritures socket UTF-8 (Tier 1, F1) ✅
- **Symptôme :** lecture décodée latin1 (`rdo.ts:46`) mais écritures `socket.write(string)` = UTF-8. Tout caractère ≥ 0x80 (chat, mail, noms accentués) part en 2 octets → mojibake côté serveur, et divergence octets stricte.
- **Fix :** helper `writeRdoFrame(socket, frame)` (`src/server/rdo-helpers.ts`) = `socket.write(Buffer.from(frame,'latin1'))`. Les **23 sites** d'écriture RDO (spo_session ×12, login-handler ×7, chat/politics/mail/building-property/building-management ×1) passent par lui.
- **Tests :** `rdo-helpers.test.ts` (octets bruts), `protocol-validation/encoding.validation.test.ts` (session réelle → Buffers latin1, accents byte-exact), `__tests__/no-raw-rdo-writes.test.ts` (balayage : tout `socket.write(` brut hors helper fait échouer la CI).

### V1/V2/V3 — Typage des arguments entiers (Tier 1, F2) ✅
- **Vérité Delphi :** `PickEvent(TycoonId: integer)` (InterfaceServer.pas:166), `GetTycoonCookie(TycoonId: integer; CookieId: widestring)` (:162), `FindSuppliers/FindClients(Output,World,Town,Name: widestring; Count,X,Y,SortMode,Role: integer)` (CacheServerReportForm.pas:108-109).
- **Symptôme :** ces args partaient en `%` OLEString. Sans RTTI de signature, le dispatch ASM du serveur pousse alors un **pointeur BSTR comme entier** (RDOObjectServer.pas:246-311) — valeur garbage côté serveur.
- **Fix :** `RdoValue.int(...).format()` sur les 3 sites PickEvent, les 3 sites GetTycoonCookie (login-handler) et les 5 args int de FindSuppliers/FindClients (politics-handler).

### A3 — Grammaire d'erreur incomplète (Tier 1, F4 — `rdo.ts` protégé, pré-approuvé) ✅
- **Symptôme :** `^error\s+(\d+)$` ne matchait que la forme nue ; `error 3 getting WorldName` traversait comme payload de succès → parse silencieusement faux en aval.
- **Fix :** regex élargie aux 3 formes Delphi, ancrage conservé (un `error N` cité dans un payload quoté ne matche pas) ; le membre fautif est ajouté à `errorName` pour le log. Modification unique d'un fichier protégé, pré-approuvée.
- **Tests :** 6 nouveaux cas dans `rdo.test.ts` (les 3 formes, casse, mi-payload, mots en trop).

### A2 — Logoff non conforme (Tier 2, F5) ✅
- **Vérité Delphi :** l'InterfaceServer ne publie **pas** `RDOEndSession` (c'est un membre de TDirectorySession, DirectoryServer.pas:31, et du GMServer). Le client legacy appelle `Logoff` (no-op publié du ClientView, InterfaceServer.pas:2019-2022) en synchrone avec timeout 5 s (ServerCnxHandler.pas:330, 2043-2063) puis ferme la socket ; le vrai nettoyage serveur est déclenché par `OnDisconnect` (InterfaceServer.pas:1799-1817).
- **Symptôme WebClient :** `RDOEndSession` fire-and-forget sur `interfaceServerId` (= error 5 silencieux serveur), socket hard-détruite ~100 ms après par `destroy()` (le `scheduleSocketClosure` de 2 s ne s'exécutait jamais), et `endSession()` exécuté deux fois sur REQ_LOGOUT.
- **Fix :** `Logoff` synchrone sur `worldContextId` (timeout 5 s), fermeture socket après la réponse (ou le timeout), idempotence, suppression du double appel.

### A5 — KeepAlive cacher sur le mauvais objet (Tier 2, F6) ✅
- **Vérité Delphi :** le hook `WSObjectCacher` du Cache Server est un `TCacheServer` (CacheServerReportForm.pas:369) qui publie CreateObject/CloseObject/FindSuppliers/… mais **pas KeepAlive** (:100-118). `KeepAlive` est publié sur `TCachedObjectWrap` (l'objet temporaire, CachedObjectWrap.pas:36) ; TTL objets = 1 min (CheckObject, fMaxTTL). Le client legacy keep-alive **l'objet temporaire** de l'inspecteur ouvert (ObjectInspectorHandleViewer.pas:1172-1180).
- **Symptôme WebClient :** timer 60 s → `sel <cacherId> call KeepAlive "*"` → errUnexistentMethod silencieux à chaque minute, pour rien.
- **Fix :** KeepAlive reciblé sur l'objet temporaire actif de l'inspecteur quand il existe, timer supprimé sinon.

### A10 — `CheckNewMail(ServerId=0)` toujours en échec (Tier 2, F10) ✅
- **Vérité Delphi :** `CheckNewMail(ServerId: integer; Account)` caste ServerId en `TInterfaceServerData` **pointeur** (MailServer.pas:543) ; `0` → nil deref → except → **résultat -1 systématique** (:569-570).
- **Fix :** obtention d'un ServerId valide via `LogServerOn(WorldName)` (le modèle qu'utilise l'Interface Server, MailServer.pas:100) à la connexion mail, réutilisé pour CheckNewMail ; sinon retrait de l'appel mort.

### A7/A8/A9 — Comportement session (Tier 3, F7/F8/F9) ✅
- **Vérité Delphi (client legacy) :** reconnexion **uniquement** sur déconnexion socket réelle (`ReportCnxFailure` est un no-op, ServerCnxHandler.pas:3394-3405) ; poll ServerBusy ~toutes les 50 s (LEDsTimer 1 s gated `mod 50`, ToolbarHandlerViewer.pas:160-162) en GET bloquant sous ISProxyTimeOut=180 s, arrêt après 4 exceptions consécutives sans reconnexion (ServerCnxHandler.pas:3596-3611) ; timeout proxy en jeu = **180 s** (:329).
- **Fixes :** suppression du déclenchement de reconnexion sur 3 timeouts consécutifs et sur échecs de poll ; poll aligné (cadence 50 s, deadline 180 s, stop après 4 échecs) ; catégorie de timeout monde alignée sur 180 s (`timeout-categories.ts`), WS > RDO conservé.

---

## 4. Décisions inversées en cours d'audit (important)

1. **A4 `EnableEvents="#-1"`** : la première passe (lecture serveur seule) concluait `#1`. La vérification V9 a prouvé le contraire côté client legacy : tout Boolean marshalé par le proxy COM part en `varBoolean` → `#-1` (RDOUtils.pas:360-368 + captures réelles `doc/building_details_rdo.txt`). **La valeur actuelle du WebClient était déjà octet-exacte — aucun changement.** Idem `RDOAcceptCloning="#-1"`, `RDOAutoProduce("#-1")`, `RDOSetBuyingStatus(…, "#-1")`.
2. **A6 `RDOOpenSession` en `get`** : converti en `call "^"` puis **reverté** — tous les appels legacy sont `session := DSProxy.RDOOpenSession;` (LogonHandlerViewer.pas:308 etc.), soit un property-get COM → `get RDOOpenSession` sur le fil (RDOObjectProxy.pas:388-399). L'octet-exact legacy est `get`, servi par le GET-fallthrough. Commentaire de preuve ajouté dans login-handler.ts.

Leçon consignée : pour ce protocole, la référence de conformité est **ce que le client Voyager émet réellement** (marshaling COM inclus), pas la classification sémantique property/méthode du serveur.

---

## 5. Non-divergences vérifiées (aucun fix)

| Sujet | Verdict | Evidence |
|---|---|---|
| Chat typing `#1`/`#0` (`MsgCompositionChanged`) | Conforme (param ordinal `TMsgCompositionState`) | InterfaceServer.pas:185 |
| Réponse idof sortante `A<rid> objid="…";` sans espace | Conforme | WinSockRDOConnectionsServer.pas:368 ; spo_session.ts:2200 |
| Pushs serveur sans réponse attendue | Conforme — les pushs sont `Send()` sans QueryId (fWaitForAnswer=false, TimeOut=0) | WinSockRDOServerClientConnection.pas:153, RDOObjectProxy.pas:433-435 |
| Réponse au `C <id> idof "InterfaceEvents"` du BindTo serveur | Conforme (`handleServerRequest`) | spo_session.ts:2195-2210 |
| Pas de char de priorité émis | Conforme au legacy (Priority=NORMAL jamais modifié) | RDOMarshalers.pas:130-135 |
| Doubles `@` avec point décimal | Conforme aux captures ; caveat : dépend de la locale du serveur | doc/building_details_rdo.txt:4,83 |
| `RDOLogonClient` fire-and-forget sur `World` (port DA) | Conforme — procedure void, même connexion, ordre préservé ; miroir exact de GetMSProxy | Kernel/World.pas:411-412, ObjectInspectorHandleViewer.pas:613-620 |
| Signatures mail (NewMail/OpenMessage/Post/Save/DeleteMessage/GetHeaders/GetLines/GetAttachment*) | Conformes | MailServer.pas:107-146 |
| `SayThis(Dest,Msg)`, `JoinChannel`, `GetChannelInfo`, `NewCompany`, `NewFacility`, `CloneFacility` (5 int), `SetTycoonCookie` | Conformes | InterfaceServer.pas:163-179 |
| `AddLine`/`CloseMessage` appelés en synchrone (procedures void → ack `A<id> ;`) | Toléré (cosmétique ; le legacy les émet en statement F&F) | MailServer.pas:112,140 |
| `handleIncomingMessage` (split `;` non quote-aware) | **Code mort** — le chemin réel est RdoFramer (quote-aware) ; ticket de nettoyage, pas un bug live | spo_session.ts:2082-2099 |
| Void+QueryId | Le parseur actuel répond `A<id> ;` (pas de crash) — le guard projet est conservé par prudence | RDOQueryServer.pas:170 |

---

## 6. Observations côté serveur (remontées, aucune correction recherchée)

1. **`ClientView` fuité au logoff** : `ClientView.Free` commenté (InterfaceServer.pas:3326) — chaque cycle logon/logoff fuit un TClientView. Le `Logoff` publié étant un no-op, tout le nettoyage repose sur `OnDisconnect`.
2. **Réponse busy malformée** : sous `Busy`, le serveur émet `A` + `error 17` **sans QueryId ni `;`** (WinSockRDOConnectionsServer.pas:812). La trame reste collée au buffer du client et corrompt la trame suivante (le client legacy la droppe aussi — bug-compatible, mais la requête concernée finit en timeout au lieu d'une erreur propre).
3. **Priorité par défaut HIGHEST** : toute requête sans char de priorité passe le thread serveur en THREAD_PRIORITY_HIGHEST (RDOQueryServer.pas:103) — un flood client peut affamer les threads internes.
4. **`CheckNewMail`/`SetForwardRule` castent ServerId en pointeur sans validation** (MailServer.pas:543,582) — tout id invalide provoque une AV (interceptée). API fragile pour des clients tiers.
5. **Tolérances actuellement porteuses** : GET-fallthrough (RDOObjectServer.pas:114-118) et écriture de -1 dans des propriétés Boolean via SetOrdProp. Le WebClient s'y conforme parce que le client legacy le fait ; toute future « correction » serveur casserait aussi le client d'origine.
6. Rappels du rapport réseau précédent toujours valables : `fServerLock` tenu pendant Logon/AccountStatus (≤10 s), pool DA modèle à 8 threads, pas de cap connexions ni reaper (voir `report/network-server-risk-report.md`).

---

## 7. Registre de risques & vérification

| Fix | Risque | Vérification |
|---|---|---|
| F1 latin1 | Très faible (ASCII inchangé octet pour octet) | Tests octets bruts + E2E accents chat/mail |
| F2 typage int | Faible (aligne sur les signatures publiées) | Suites validation + E2E pushs/cookies/recherche fournisseurs |
| F4 regex | Moyen — des erreurs réelles vont apparaître là où du garbage passait (voulu) | rdo.test.ts (ancrage) ; audit classifier ok |
| F5 logoff | Faible-moyen (chemin déconnexion uniquement) | logoff.validation.test.ts + E2E logout (plus d'error 5) |
| F6 keepalive | Faible (supprime du trafic mort) | Fake timers + E2E idle 5 min puis inspecteur |
| F10 CheckNewMail | Faible (l'appel échouait déjà systématiquement) | mail.validation + E2E compteur non-lus |
| F7/F8/F9 comportement | ÉLEVÉ (récupération sur serveur instable) | Suites réécrites + E2E soak ; tier réversible |

**Gates E2E** (skill `/e2e-test`, credentials verrouillés SPO_test3) : après Tier 1 — login complet, pushs reçus, accents round-trip ; après Tier 2 — logout propre, idle 5 min ; après Tier 3 — soak avec tick de simulation et kill serveur.

---

## Annexe — Statut d'implémentation

- Tier 1 (F1, F2, F4) : **implémenté**, suites vertes (rdo, protocol-validation ×15, session).
- Tier 2 (F5, F6, F10) : _en cours_.
- Tier 3 (F7, F8, F9) : _en attente_.
- Ce rapport est mis à jour en fin de chantier avec les statuts finaux.
