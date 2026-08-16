# S3 — Le modèle de reconnexion de Voyager, et son intégration dans le WebClient

> **Statut : analyse close, plan proposé — 2026-08-14.**
> **Objet :** remplacer la « reconnexion légère » du WebClient (constat **S3** de
> [audit-impact-serveur-rdo-2026-08-14.md](audit-impact-serveur-rdo-2026-08-14.md)) par le modèle
> du client de référence.
> **Méthode :** lecture directe de `../SPO-Original/Voyager/URLHandlers/ServerCnxHandler.pas`.
> Chaque affirmation cite `Fichier.pas:Ligne`. Aucun fichier legacy modifié.
> **Skills utilisées :** `delphi-archaeologist`, `rdo-network-resilience`, `rdo-conformity`.

---

## 1. La portion de code qui définit le comportement

Tout tient dans **quatre routines contiguës** de `Voyager/URLHandlers/ServerCnxHandler.pas`,
plus le thread de relance. C'est le cœur demandé.

### 1.1 `TServerCnxHandler.ConnectionDropped` — l'entrée dans l'état dégradé (`:3367-3387`)

```pascal
procedure TServerCnxHandler.ConnectionDropped;
  var Info : TChatMsgInfo;
  begin
    fOffline := true;                                   // <- 3371 : PREMIER geste
    Info.From := GetLiteral('Literal336');
    Info.Msg  := GetLiteral('Literal337');
    Info.Formatted := '<s /ital>...' + TimeToStr(Now) + ' - ' + Info.From + ': ' + Info.Msg;
    fMasterURLHandler.HandleEvent( evnChatMsg, Info );  // <- 3376 : l'utilisateur est prévenu
    if fReconnectThread<>nil
      then begin fReconnectThread.OnTerminate := nil; fReconnectThread.Terminate; end;
    fReconnectThread := TReconnectThread.Create( self );        // <- 3384
    fReconnectThread.OnTerminate := OnReconnectThreadTerminate;
    fReconnectThread.Resume;
  end;
```

**Ordre imposé : fermer le portail → prévenir → relancer.** Jamais l'inverse.

### 1.2 Le déclencheur — un seul, et il est de niveau socket

`ConnectionDropped` n'a que **deux** sites d'appel dans tout l'arbre Voyager :

| Site | État |
|---|---|
| `ServerCnxHandler.pas:3402` | **MORT** — à l'intérieur du corps de `ReportCnxFailure`, entièrement entre accolades `{ }` (`:3396-3404`) |
| `ServerCnxHandler.pas:3484` | **VIVANT** — `procedure TServerCnxHandler.OnSocketDisconnect(...) begin ConnectionDropped; end;` (`:3482-3485`) |

**Où le handler est câblé — attention au piège.** Il existe un `fWSISCnx.SetOnDisconnect( OnSocketDisconnect )` en `:1105`, mais **cette ligne est morte** : elle est à l'intérieur d'un bloc `(*` ouvert en `:988` et refermé en `:1155` (une ancienne version de `Logon`). **Le seul enregistrement vivant est en `:2818`**, dans la branche de succès de `TServerCnxHandler.Logon`, immédiatement avant l'ouverture du portail :

```pascal
fWSISCnx.SetOnDisconnect( OnSocketDisconnect );   // :2818
fOffLine := false;                                 // :2819
```

C'est un point de conception, pas un détail : **le handler de déconnexion est (ré)armé à chaque
login réussi**, dans la même routine qui rouvre le portail. Un re-login rétablit donc la
détection de coupure en même temps que la session.

> **Conclusion :** ni un timeout de requête, ni un code d'erreur ne provoque jamais de
> reconnexion. Seule la **perte de socket** le fait. Le compteur `fNetErrors` existe
> (`ReportCnxValid`, `:3389-3392`) mais son seul consommateur est le code mort.
> **Le WebClient est déjà conforme sur ce point** ([spo_session.ts:2198-2204](../src/server/spo_session.ts#L2198-L2204)).

### 1.3 `TReconnectThread` — la boucle de relance (`:685-720`)

```pascal
procedure TReconnectThread.Execute;
  begin
    while not Terminated and not fSuccess do
      begin
        sleep(100);                                              // <- 714
        if (not Terminated) and (fServerCnxHandler<>nil)
          then with fServerCnxHandler do
                 fSuccess := Reconnect(fUserName, true, true);    // <- 718 Silent=true, IgnoreErrors=true
      end;
  end;
```

**Boucle infinie, sans backoff, sans jitter, sans plafond**, jusqu'au succès ou au `Terminate`.
C'est la seule partie du modèle legacy qu'il ne faut **pas** reprendre (§4).

> **Le `sleep(100)` n'est pas la vraie cadence.** Chaque tour appelle `Reconnect` → `Logon`, dont
> le premier geste est `if fISCnx.Connect( ISTimeout )` (`:2741`) avec `ISTimeout = 20000`
> (`:17`). Serveur injoignable ⇒ chaque tentative coûte jusqu'à **20 s** de timeout de connexion,
> pas 100 ms. La cadence effective est donc de l'ordre de 3 tentatives/minute, pas 10/seconde.
> Le legacy est moins brutal qu'il n'y paraît — mais toujours sans plafond ni désynchronisation.

### 1.4 `TServerCnxHandler.Reconnect` — la routine centrale (`:3407-3473`)

```pascal
function TServerCnxHandler.Reconnect( AccountName : string; Silent, IgnoreErrors : boolean ) : boolean;
  begin
    Lock;
    try
      fISCnx   := nil;                    // <- 3418  PURGE de la connexion
      fISProxy := Unassigned;             // <- 3419  PURGE du proxy (donc de l'identité de session)
      try
        UserChange := AccountName <> fUserName;
        LogonURL := '?frame_Action=Logon&' + 'ISAddr=' + fISAddr + '&' + ... +
                    'UserName=' + AccountName + '&' + 'Password=' + fPassword + ...;
        result := Logon( LogonURL ) = urlHandled;   // <- 3439  RE-LOGIN COMPLET
        if result
          then
            begin
              fOffline   := false;        // <- 3443  réouverture du portail
              fNetErrors := 0;
              EnableEvents( ErrorCode );  // <- 3445
              ... Join( syncReconnectChatMsg, [@Info] );   // message « reconnecté »
            end
          else
            begin
              if (fMsgCount mod 115) = 0  // <- 3455  ~11,5 s à 100 ms/tour
                then ... Join( syncReconnectChatMsg, [@Info] );   // message « tentative en cours »
              inc(fMsgCount);
            end;
      except result := false; end;
    finally Unlock; end;
  end;
```

**Les deux lignes qui répondent à la question S3 sont 3418-3419.** Le client de référence
**jette** sa connexion et son proxy *avant* toute tentative. Il n'existe **aucune** sonde de
validité, **aucune** réutilisation du `ClientViewId` précédent, **aucun** chemin « léger ».

`Logon( LogonURL )` (`:3439`) route vers `function TServerCnxHandler.Logon` (`:2669`), dont le
corps (`:2740-2830`) exécute la séquence complète :

```
fISCnx.Connect(ISTimeout) → fISProxy.SetConnection → BindTo(tidRDOHook_InterfaceServer)
  → WorldName, DAAddr, DALockPort, MailAddr, WorldXSize/YSize, WorldSeason
  → AccountStatus(fUserName, fPassword)          :2764
  → fClientViewId := fISProxy.Logon(...)         :2771   ← NOUVEL identifiant de session
  → fISProxy.BindTo( fClientViewId )             :2776
  → Join( syncCreateEventsServer, [fISCnx] )
  → fMailAccount, fTycoonUId
  → ClientId := fISProxy.RDOCnntId               :2788   ← RELU sur la NOUVELLE connexion
  → fISProxy.RegisterEventsById( ClientId )      :2789
  → fISProxy.SetLanguage( ActiveLanguage )       :2791
  → fOffLine := false                            :2819
```

### 1.5 Le portail hors-ligne — 34 sites, plus les lecteurs externes

```pascal
function TServerCnxHandler.Offline : boolean;
  begin
    result := fOffline or VarIsEmpty(fISProxy);      // :3567-3570
  end;
```

Le motif `if not VarIsEmpty(fISProxy) and not fOffline` garde **34 sites d'appel** dans le seul
`ServerCnxHandler.pas` (`SetViewedArea:1288`, `ObjectsInArea:1319`, `ObjectAt:1380`,
`FocusObject:1551`, `SwitchFocus:1596`, `GetCompanyList:1672`, `GetUserList:1769`,
`NewFacility:1728`, `ConnectFacilities:1745`, `Chase:1954`…). La propriété publique `OffLine`
est en outre lue par le moteur de carte : `if not fClientView.OffLine then Fork(ThreadSetViewedArea, …)`
(`Components/MapIsoView/Map.pas:3978`, aussi `:4336`, `:5492`).

Transitions complètes de `fOffline` :

| Ligne | Sens | Contexte |
|---|---|---|
| `:926` | → `true` | échec dans `HandleURL` |
| `:1268` | → `true` | `HandleEvent`, extinction / logoff |
| `:3371` | → `true` | **`ConnectionDropped`** |
| `:2819` | → `false` | **succès de `Logon`** |
| `:3443` | → `false` | succès de `Reconnect` |

> **Conséquence architecturale — et la nuance qui compte.** Le portail à 34 sites n'est **pas**
> exhaustif : quatre enveloppes RDO ne le testent pas du tout et appellent le proxy directement —
> `ClientAware` (`:2320-2326`), `ClientNotAware` (`:2328-2334`), `SetLanguage` (`:2336-2342`) et
> `FavNewItem` (`:2344-2350`), toutes de la forme `try fISProxy.X; except end;`.
>
> Le silence pendant la coupure ne vient donc pas du drapeau, mais de la **purge** :
> `Reconnect:3419` pose `fISProxy := Unassigned`, et invoquer une méthode sur un OleVariant non
> assigné lève une exception, avalée par le `except end` de ces enveloppes. Résultat identique —
> **aucun octet ne part** — mais par un mécanisme différent.
>
> **C'est la purge qui garantit, le portail qui documente l'intention.** Cela pèse sur l'ordre des
> lots : voir L2 avant L1 en §6.

---

## 2. Le modèle legacy, distillé

1. **Perte de socket** — et rien d'autre — fait entrer en état dégradé.
2. **Premier geste : fermer le portail.** Aucun trafic applicatif ne sort tant que la session
   n'est pas rétablie.
3. **Purger l'identité** : connexion et proxy jetés. Le `ClientViewId` et le `RDOCnntId`
   d'avant la coupure sont considérés comme **définitivement invalides**.
4. **Prévenir l'utilisateur immédiatement**, puis périodiquement pendant l'échec.
5. **Rétablir par un re-login intégral**, jamais par une sonde de survie.
6. **Rouvrir le portail seulement à la fin**, une fois les événements ré-enregistrés.

---

## 3. Écart avec le WebClient

| Aspect | Voyager | WebClient actuel | Verdict |
|---|---|---|---|
| Déclencheur | socket uniquement (`:3484`) | socket uniquement ([spo_session.ts:1567](../src/server/spo_session.ts#L1567)) | ✅ **conforme** |
| Portail hors-ligne | 34+ sites gardés | **inexistant** — `sendRdoRequest` ne teste que `isClosing` ([spo_session.ts:2049](../src/server/spo_session.ts#L2049)) | ❌ **manque structurant** |
| Purge d'identité | `fISCnx := nil; fISProxy := Unassigned` (`:3418-3419`) | `worldContextId` et `rdoCnntId` **conservés** | ❌ **cause racine de S3 et S8** |
| Stratégie | re-login intégral (`:3439`) | sonde `get TycoonId` puis chemin léger ([login-handler.ts:979-1034](../src/server/session/login-handler.ts#L979-L1034)) | ❌ **S3** |
| Relecture `RDOCnntId` | oui, sur la nouvelle connexion (`:2788`) | non, valeur périmée réémise ([login-handler.ts:998](../src/server/session/login-handler.ts#L998)) | ❌ **S8** |
| Cadence | infinie, 100 ms, sans jitter (`:712-719`) | 23 tentatives, backoff exponentiel puis fixe, jitter ±25 % ([spo_session.ts:1658-1667](../src/server/spo_session.ts#L1658-L1667)) | ✅ **meilleur que le legacy** |
| Plafond global multi-sessions | sans objet (1 client = 1 processus) | absent | ⚠️ **spécifique passerelle** |
| Notification utilisateur | immédiate + toutes les ~11,5 s (`:3376`, `:3455`) | `EVENT_WORLD_RECONNECTED` en fin seulement | ⚠️ partiel |

**Lecture d'ensemble.** Voyager est *plus agressif* sur la cadence mais *bien plus discipliné*
sur l'état. Le WebClient est l'exact inverse : cadence civilisée, discipline d'état absente.
Le plan ci-dessous garde notre cadence et adopte leur discipline.

---

### 3.1 Un second appelant vivant de `Reconnect` : le changement de rôle

`Reconnect` n'a que **deux** sites d'appel vivants : le thread (`:718`) et **`SetCompany`**
(`:1166`) — le site en `:967` est mort (bloc `{ }` de `:933` à `:986`).

```pascal
OwnerRole := URLParser.GetParmValue( URL, htmlParmName_CompanyOwnerRole );
if (CompareText( OwnerRole, fUserName ) <> 0) and (OwnerRole <> '')
  then Reconnect( OwnerRole, true, true );          // :1165-1166
EnableEvents( ErrorCode );
```

**Corollaire :** pour le client de référence, *changer d'identité* (rôle politique, société) est
la même opération que *récupérer d'une coupure* — purge + re-login intégral. C'est l'invariant
du modèle : **une identité serveur ne se recycle jamais, elle se reconstruit.** Notre
`switchCompany` ([login-handler.ts](../src/server/session/login-handler.ts)) suit déjà cette
logique ; la reconnexion, elle, ne la suit pas — c'est précisément S3.

---

## 4. Ce qu'il ne faut PAS reprendre

La boucle infinie sans backoff ni plafond (`:712-719`) est acceptable pour un client
mono-processus ; répliquée par N sessions d'une passerelle mutualisée, elle produit exactement
la tempête que le verrou global `fServerLock` ne supporte pas (M3/M4 de l'audit). **Notre
backoff + jitter est supérieur et doit être conservé tel quel.**

Noter toutefois (§1.3) que la cadence réelle du legacy est bornée par `ISTimeout = 20000`, donc
bien plus lente que le `sleep(100)` ne le suggère : l'écart avec notre politique est un écart de
**plafond et de désynchronisation**, pas de fréquence brute.

---

## 5. Plan d'intégration

Cinq lots, ordonnés par dépendance. Les lots 1 à 3 forment le correctif S3/S8 ; les lots 4 et 5
sont des ajouts propres à l'architecture passerelle.

### Lot L1 — Portail hors-ligne (`sessionOffline`)

**Modèle :** `fOffline` (`:3371`, `:3443`) + `Offline()` (`:3567-3570`).

- Champ privé `sessionOffline: boolean` sur `StarpeaceSession`, exposé en lecture seule.
- **Posé à `true`** dans le handler `close` de la socket `world`
  ([spo_session.ts:1557-1579](../src/server/spo_session.ts#L1557)), **avant** l'appel à
  `attemptWorldReconnect`.
- **Remis à `false`** à la toute fin du re-login réussi, à l'endroit qui correspond à
  `Logon:2819` — c'est-à-dire dans `fullWorldRelogin`, après `RegisterEventsById`, et non dans
  l'orchestrateur.
- **Garde en entrée de `sendRdoRequest`**, avant le test `isServerBusy` : si `sessionOffline`,
  rejeter immédiatement avec un code d'erreur typé (`ERROR_SessionOffline`) — **sans mise en
  tampon**. Le tampon `requestBuffer` répond à `ServerBusy`, une condition différente (serveur
  vivant mais occupé) ; les deux ne doivent pas être confondus.
- **Garde symétrique pour les pushs.** Les ~14 appels directs à `writeRdoFrame()` échappent à
  `sendRdoRequest`. Introduire `pushRdoFrame(ctx, socketName, cmd)` qui teste le portail, et
  convertir les sites d'appel. Cela referme au passage l'angle mort noté en S2.
- **Échappatoire pour la séquence de re-login elle-même** : `login-handler` doit pouvoir parler
  pendant que le portail est fermé. Un paramètre explicite `{ bypassOfflineGate: true }` sur
  `sendRdoRequest`, réservé au handler de login et couvert par un test qui vérifie qu'aucun autre
  module ne l'emploie.

**Bénéfice serveur :** supprime tout trafic émis vers une session serveur déjà détruite. C'est
le lot qui rapporte le plus, indépendamment du reste.

### Lot L2 — Purge d'identité à la coupure

**Modèle :** `Reconnect:3418-3419`.

Dans le même handler `close`, mettre à `null` : `worldContextId`, `_rdoCnntId`,
`interfaceServerId`, `interfaceEventsId`. Ces valeurs désignent des objets serveur détruits ou
détachés ; les conserver est ce qui rend S3 et S8 possibles.

**Attention :** `interfaceServerId` est re-résolu par `idof InterfaceServer` en tête de
`reconnectWorldSocket` ([login-handler.ts:970-976](../src/server/session/login-handler.ts#L970)),
et `fullWorldRelogin` **exige** `ctx.interfaceServerId` non nul
([login-handler.ts:1067-1068](../src/server/session/login-handler.ts#L1067)) : l'ordre actuel
(idof puis relogin) reste valide après la purge. À vérifier au test.

### Lot L3 — Supprimer la reconnexion légère

**Modèle :** `Reconnect:3439` — il n'existe qu'un seul chemin.

Supprimer le bloc `try { get TycoonId } … catch { fullWorldRelogin }`
([login-handler.ts:978-1038](../src/server/session/login-handler.ts#L978)) et appeler
**toujours** `fullWorldRelogin(ctx)`.

Le code correct **existe déjà** et n'est aujourd'hui atteint que sur exception :
`fullWorldRelogin` ([login-handler.ts:1062-1122](../src/server/session/login-handler.ts#L1062))
fait `Logon` → nouveau `contextId` → `TycoonId` → **`RDOCnntId` relu** → `RegisterEventsById` →
`SetLanguage` → re-sélection de la société. C'est le miroir fidèle de `Logon:2764-2791`.
**Ce lot est donc soustractif, et il corrige S8 gratuitement.**

> #### ⚠ Le point que la copie naïve manque : `AccountStatus` avant `Logon`
>
> `fullWorldRelogin` **n'appelle pas `AccountStatus`**. Voyager, si (`:2764`, juste avant
> `Logon:2771`). Ce n'est pas décoratif — c'est la primitive d'éviction :
>
> - `TInterfaceServer.Logon` refuse et renvoie **0** si une vue client existe déjà pour ce nom :
>   `if (GetClientByName( UserName ) = nil) and not VarIsEmpty(WorldProxy) then … else result := 0`
>   (`InterfaceServer.pas:3192`, `:3283`).
> - `TInterfaceServer.AccountStatus` est ce qui retire l'ancienne :
>   `PreviousClient := GetClientByName(UserName); if PreviousClient <> nil then if
>   (uppercase(Password) = uppercase(PreviousClient.fPassword)) then PreviousClient.DoLogoff`
>   (`InterfaceServer.pas:3138-3151`).
>
> En coupure franche, `OnDisconnect` a déjà fait le `DoLogoff` côté serveur et `Logon` passerait.
> Mais sur une **socket à moitié ouverte** — le cas exact où la reconnexion est utile — le
> serveur n'a rien détecté, la vue précédente est toujours dans `fClients`, et **`Logon` échoue
> définitivement** : la session ne se rétablit jamais.
>
> **Ajouter `AccountStatus(username, password)` en tête de `fullWorldRelogin`**, conformément au
> client de référence. Coût : une prise du verrou global par reconnexion — le prix que Voyager
> payait déjà.

**Point complémentaire — réémettre `SetViewedArea` après le re-login.** Un re-login crée un
`TClientView` **neuf**, dont `fx1..fy2` valent 0 (et l'ancienne vue avait de toute façon reçu
`SetViewedArea(0,0,0,0)` dans `DoLogoff`, `InterfaceServer.pas:2004`). Sans réémission, le test
`IntersectRect(zone modifiée, viewport client)` échoue systématiquement et **le serveur cesse
d'envoyer `RefreshArea`/`RefreshObject`**. Notre battement de viewport à 30 s
([client.ts:673](../src/client/client.ts#L673)) finit par réparer la situation, mais laisse une
fenêtre aveugle ; une réémission explicite en fin de `fullWorldRelogin` la supprime. *(Le client
de référence ne réémet pas immédiatement : il attend le prochain scroll ou changement de focus —
sur ce point précis notre conception est meilleure.)*

### Lot L4 — Plafond de relogin à l'échelle de la passerelle

Sans équivalent legacy (Voyager = un client par processus). Sémaphore de 2 à 3 re-logins
concurrents pour toute l'instance, file d'attente au-delà. Justification : `Logon` et
`AccountStatus` tiennent `fServerLock` à travers 6 à 8 allers-retours inter-serveurs (M4), et
chaque cycle fuit un `TClientView` (M5). Conserver par ailleurs le backoff et le jitter
existants — supérieurs au legacy.

### Lot L5 — Notification utilisateur pendant la coupure

**Modèle :** `ConnectionDropped:3376` (immédiat) et `Reconnect:3455-3465` (périodique, ~11,5 s).

Émettre un événement WS **à l'entrée** dans l'état hors-ligne, pas seulement à la sortie ; et
un rappel périodique tant que la reconnexion échoue. Aujourd'hui seul le succès
(`worldReconnected`) et l'abandon final (`worldDisconnected`) sont signalés — l'utilisateur ne
sait pas qu'il est déconnecté pendant les 5,5 minutes de tentatives.

---

## 6. Ordre d'exécution recommandé

| Ordre | Lot | Motif |
|---|---|---|
| 1 | **L2** purge d'identité | **Promu en tête** après vérification : c'est la purge, pas le drapeau, qui garantit mécaniquement le silence chez le client de référence (§1.5). Deux ou trois lignes, et elle rend S3 et S8 structurellement impossibles. |
| 2 | **L1** portail hors-ligne | Défense en profondeur au-dessus de L2, et surtout **le seul moyen de rendre l'état lisible** côté passerelle (erreur typée plutôt qu'échec obscur). Indépendamment testable. |
| 3 | **L3** re-login intégral **+ `AccountStatus`** | Corrige S3 **et** S8. Soustractif, donc peu risqué — à condition de ne pas oublier l'encadré ci-dessus. |
| 4 | **L5** notification | Petit, découplé, améliore le diagnostic terrain avant de toucher à L4. |
| 5 | **L4** plafond passerelle | Le plus intrusif ; à faire une fois L1-L3 stabilisés, sinon on plafonne un chemin encore fautif. |

> **Pourquoi L2 passe devant L1.** Dans le legacy, quatre enveloppes RDO ignorent le drapeau
> `fOffline` (`:2320-2350`) : si la purge n'avait pas lieu, elles émettraient pendant la coupure.
> Transposé chez nous : un portail sans purge laisserait `worldContextId` réutilisable par le
> premier chemin qui oublierait la garde. La purge ferme le problème à la racine ; le portail le
> rend diagnosticable.

## 7. Conditions de vérification

- **Conformité :** un test qui assemble la séquence de reconnexion émise et la compare, membre à
  membre et dans l'ordre, à `Logon:2764-2791` — `AccountStatus`, `Logon`, `TycoonId`,
  `RDOCnntId`, `RegisterEventsById`, `SetLanguage`. C'est le test qui aurait attrapé S3 et S8.
- **Portail :** un test qui met la session hors-ligne et vérifie qu'**aucun** octet n'atteint la
  socket, pushs compris — c'est-à-dire portant sur `writeRdoFrame`, pas seulement sur
  `sendRdoRequest`.
- **Non-régression S8 :** vérifier que le `RDOCnntId` émis dans `RegisterEventsById` est celui
  lu **après** le `Logon` courant, jamais une valeur mémorisée.
- **L3 / socket semi-ouverte :** scénario mock-server où le serveur ne voit pas la coupure ;
  sans `AccountStatus`, `Logon` doit renvoyer `0` et le test échouer. C'est la preuve que
  l'encadré du lot L3 est nécessaire.

---

## 7 bis. « À quel moment la session doit-elle être reconnectée ? »

Cette section répond directement à la question, parce que la réponse n'est pas évidente et que le
code actuel se trompe précisément dessus.

### Le vice de vocabulaire dont tout découle

Deux opérations que notre code confond, et que Voyager ne sépare jamais :

| | Ce que c'est | Nécessaire ? Suffisant ? |
|---|---|---|
| **Reconnecter la socket** | ouvrir un nouveau TCP vers l'IS | nécessaire, **jamais suffisant** |
| **Re-loger la session** | recréer un `TClientView` **neuf** côté serveur via un `Logon` neuf → **nouveau `ClientViewId`** | **la seule opération qui rétablit une session utilisable** |

Côté serveur, un `TClientView` **n'est pas réattachable** : il naît d'un `Logon`
(`InterfaceServer.pas:3223`) et meurt à la déconnexion (`DoLogoff`, `:1949-2017`). Quand la
socket tombe, l'objet est déjà extrait de `fClients` (M5). **« Réutiliser la session d'avant »
n'existe pas dans le modèle Delphi.** C'est exactement ce que notre reconnexion légère prétend
faire ([login-handler.ts:979-1034](../src/server/session/login-handler.ts#L979)) : elle
reconnecte la socket, sonde l'ancien `ClientViewId`, et **saute le re-login**. Résultat : socket
vivante, identité morte, session invisible.

Voyager, lui : `ConnectionDropped` → `Reconnect` → `Logon` complet → nouvel identifiant
(`ServerCnxHandler.pas:3439`, `:2771`). **Une socket, une identité, reconstruites ensemble.**
Le canon interne le dit déjà : *« After re-Logon, the server delivers a new ClientView id »*
([doc/rdo-session-lifecycle.md:112](../doc/rdo-session-lifecycle.md)). La doc a raison ; le code
a divergé.

### La réponse, en cinq règles

**1. Déclencheur — une perte de socket AVÉRÉE, et rien d'autre.**
Le seul moment légitime est l'événement `close` de la socket monde (Voyager : `OnSocketDisconnect`
→ `ConnectionDropped`, `:3484` — l'unique déclencheur vivant). Notre code a **trois** portes
d'entrée vers `attemptWorldReconnect` — `close` de la socket
([spo_session.ts:1567](../src/server/spo_session.ts#L1567)), pool vidé
([:1614-1619](../src/server/spo_session.ts#L1614)), et à la demande si la socket manque
([:2134-2140](../src/server/spo_session.ts#L2134)). Les trois doivent converger vers la **même**
discipline (purge + re-login intégral). Le `close` est la porte canonique ; les deux autres sont
des spécificités passerelle.

**2. Jamais sur un timeout de requête ni un code d'erreur.**
La socket est alors vivante ; re-loger tuerait une session saine **et créerait une seconde
`TClientView` fantôme** pour le même joueur. Voyager le garantit par un `ReportCnxFailure`
inerte (corps commenté, `:3394-3405`). **Notre code est déjà correct sur ce point**
([spo_session.ts:2198-2204](../src/server/spo_session.ts#L2198)) — à préserver absolument.

**3. Le « moment » cache un piège : la socket semi-ouverte.**
Au moment où l'on décide de reconnecter, on ne sait **pas**, depuis le client, si le serveur a vu
la coupure. Si elle est semi-ouverte, l'ancien `TClientView` est toujours dans `fClients`, et
`Logon` **renvoie 0** (`InterfaceServer.pas:3192`, `:3283`) : la reconnexion échoue à jamais.
D'où la règle absolue : **le re-login commence toujours par `AccountStatus`** (`:3138-3151`,
la primitive d'éviction). C'est le point le plus facile à oublier (§5, encadré L3).

**4. Une seule reconnexion en vol, sous plafond global.**
Dédup : déjà en place ([spo_session.ts:1649](../src/server/spo_session.ts#L1649)). Plafond
passerelle : **absent** — et c'est S5. Chaque `Logon`/`AccountStatus` tient `fServerLock` sur
6-8 allers-retours inter-serveurs (M4) et fuit un `TClientView` (M5) ; N sessions × 23 tentatives
sans plafond = la tempête que le verrou global ne supporte pas. Lot L4.

**5. Abandon explicite.**
Après les 23 tentatives (~5,5 min), la session est **morte** : émettre `worldDisconnected` et
rendre la main à l'utilisateur. Ne jamais boucler indéfiniment comme le legacy (`:712-719`) —
notre borne est une divergence assumée et supérieure (`doc/rdo-session-lifecycle.md` D3).

### L'arbitrage S3/S5 que seul le développeur peut trancher

C'est le nœud, et il faut le nommer : **corriger S3 rend chaque reconnexion plus coûteuse pour le
serveur partagé.**

| Option | Coût serveur par tentative | Correct ? |
|---|---|---|
| **Aujourd'hui** (sonde légère) | quasi nul (`get TycoonId`) | ❌ ne reconnecte jamais vraiment |
| **Auto, corrigé** (re-login intégral) | `AccountStatus` + `Logon` = 2 prises de `fServerLock` + 1 `TClientView` fuité | ✅ mais ×N sessions ×23 = risque de tempête |
| **Auto borné + humain** | idem, mais plafonné et écourté | ✅ meilleur compromis |

**Ma recommandation :** re-login intégral automatique **pour la phase rapide** (3 tentatives,
5/10/20 s — couvre le blip réseau transitoire, majoritaire), puis **bascule en reprise manuelle**
pour la phase lente au lieu des 20 tentatives automatiques. Justification : une coupure qui
survit à 35 s n'est presque jamais un blip ; les 20 tentatives lentes coûtent 20 `Logon`
supplémentaires au monde entier pour une session qui, le plus souvent, ne reviendra qu'après une
action humaine de toute façon. Reloger sur intention humaine coûte au serveur exactement ce que
coûtait un login Voyager ; reloger automatiquement 23 fois × N sessions, non.

C'est **votre** décision — je la présente, je ne la tranche pas.

---

## 8. Ce que ce plan ne traite pas

Il ne traite que S3 et, par effet de bord, S8. Les constats S1 (`SayThis` en `"^"`), S2 (absence
de garde séparateur/arité), S9 (`RDOAcceptCloning`) et S6 (port `DALockPort`) restent ouverts et
gardent leur priorité propre dans
[audit-impact-serveur-rdo-2026-08-14.md §7](audit-impact-serveur-rdo-2026-08-14.md).
