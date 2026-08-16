# Run de conformité RDO live — planitia, 2026-08-16

> **Autorisation :** développeur (propriétaire du projet), donnée en séance le 2026-08-16 pour un run **lecture seule**
> sur le serveur partagé avec le compte de test verrouillé `SPO_test3` / `SPO_test3 - Green`.
> **Résultat :** run 2 (19:35:47–19:36:24 UTC) — **54 PASS · 0 FAIL · 1 observation · 4 skips justifiés**, exit 0 ;
> logs serveur : session bracketée par `ClientViewId=6968340`, `Clients` exit code **0**, **0** trou de heartbeat MS,
> **1** anomalie IS dans la fenêtre (à attribuer, §3.2). Aucune trame de mutation, aucun `"^"` sur procédure,
> aucun id arbitraire. Outil : `src/tools/conformance/` ([doc](../../doc/rdo-conformance-suite.md)).

## 1. Ce qui a été tiré, comment

```bash
npm run conformance -- --suite types,separators,errors,lifecycle,reads,map,focus,inspector,chat,mail,politics,research \
  --transport live --live --target shared --company "SPO_test3 - Green" --server-logs \
  --record report/campaign/rec/planitia-2026-08-16.ndjson \
  --record-baseline report/campaign/rec/planitia-2026-08-16-baseline.json \
  --report report/campaign/rec/planitia-2026-08-16-run.json
```

Une session, séquentielle, moteur = la vraie `StarpeaceSession` (formatter, gardes, timeouts, contrat d'erreur de
production). Sûreté vérifiée juste avant le tir dans `../SPO-Original` : chaque membre appelé en `"^"` par les
scénarios est une `function` (`ObjectsInArea/SegmentsInArea/GetSurface/SwitchFocusEx/GetChannelList/JoinChannel/
GetUserList/GetChannelInfo/RDOFavoritesGetSubItems` — InterfaceServer.pas ; `SetPath` — CachedObjectWrap.pas:23 ;
`RDOVoteOf` — TownPolitics.pas:47 ; `LogServerOn/CheckNewMail/OpenMessage/GetHeaders/GetLines/GetAttachmentCount` —
MailServer.pas) ; les procédures (`SetViewedArea`, `UnfocusObject`, `CloseObject`, `ClientAware/NotAware`,
`RDOLogonClient`, `SetTycoonCookie`) partent en push `"*"` sans QueryId, `CloseMessage` en `"*"`+QueryId (VOID_MEMBERS).

**Deux tirs.** Le run 1 (19:32:52–19:33:10, ClientViewId 7149132) a validé les 26 trames unitaires puis s'est arrêté au
premier scénario sur un **artefact du harnais** : `net.Socket.prototype.connect` réinitialise un `write` surchargé
(Node), donc l'enregistreur n'a capté que les trames entrantes (64) et le runner a cru qu'aucune trame n'était émise.
Corrigé (`transport.ts` : ré-installation du tap sur `connect`, test sur vraie socket), re-bundlé, run 2 complet.
Le run 1 était lui-même propre côté serveur (exit code 0, 0 anomalie). Artefacts : `report/campaign/rec/`
(`*-run1-*` = run 1 ; `planitia-2026-08-16.ndjson` = 230 trames, `-baseline.json`, `-run.json`, `-console.log` = run 2).

## 2. Résultats par étape (run 2)

| Suite | Etape | Verdict | ms | Reponse (extrait) |
|---|---|---|---:|---|
| types | `string-property-username` | PASS | 226 | `UserName="$SPO_test3"` |
| types | `string-property-mailaccount` | PASS | 91 | `MailAccount="$SPO_test3@Planitia.net"` |
| types | `string-property-compositename` | PASS | 92 | `CompositeName="$SPO_test3"` |
| types | `string-property-worldname` | PASS | 90 | `WorldName="$Planitia"` |
| types | `int-property-tycoonid` | PASS | 92 | `TycoonId="#37"` |
| types | `int-property-worldxsize` | PASS | 91 | `WorldXSize="#2000"` |
| types | `olevariant-function-result` | PASS | 483 | `res="%LastX.0=939 / LastY.0=994 / LastTimeOnline=2026-08-16 / "` |
| types | `literal-int-control` | PASS | 93 | `error 3 setting RdoConfProbe` |
| types | `literal-bool-true` | PASS | 92 | `error 3 setting RdoConfProbe` |
| types | `literal-double-integral` | PASS | 91 | `error 3 setting RdoConfProbe` |
| types | `literal-double-fractional` | PASS | 92 | `error 3 setting RdoConfProbe` |
| types | `literal-single-fractional` | PASS | 104 | `error 3 setting RdoConfProbe` |
| separators | `variant-on-function` | PASS | 278 | `res="%939"` |
| separators | `set-acks-empty` | PASS | 90 | `` (ack vide `A<id> ;`) |
| separators | `variant-on-zero-param-procedure` | SKIP | - | réglé le 2026-08-16 matin (`error 9`), jamais dans `all` |
| errors | `set-unknown-property-grammar` | PASS | 91 | `error 3 setting RdoConfProbe` |
| errors | `get-unknown-property-grammar` | PASS | 92 | `error 5 getting RdoConfProbe` |
| errors | `call-unknown-method` | PASS | 473 | `error 5` |
| lifecycle | `rdocnntid-connection-bound` | PASS | 406 | `RDOCnntId="$7263428"` |
| lifecycle | `serverbusy-poll` | PASS | **7670** | `ServerBusy="#0"` |
| lifecycle | `pick-event` | PASS | 100 | `res="%"` |
| lifecycle | `company-count` | PASS | 101 | `GetCompanyCount="#1"` |
| reads | `world-y-size` | PASS | 99 | `WorldYSize="#2000"` |
| reads | `world-season` | PASS | 100 | `WorldSeason="#1"` |
| reads | `da-addr` | PASS | 100 | `DAAddr="$158.69.153.134"` |
| reads | `mail-port` | PASS | 99 | `MailPort="#10000"` |
| reads | `tycoon-cookie-blob` | PASS | 117 | `res="%LastX.0=939 / LastY.0=994 / LastTimeOnline=2026-08-16 / "` |
| map | `connect-map-service` | PASS | 185 | `objid="3173064"` |
| map | `objects-in-area` | PASS | 207 | `res="%1500 / 29 / 16 / 933 / 1000 / 2842 / 36 / 17 / 941 / 1049 / …` |
| map | `segments-in-area` | PASS | 0 | `res="%967 / 999 / 981 / 999 / -13 / -7 / 0 / 0 / 0 / 0 / 932 / 1048 / …` |
| map | `set-viewed-area` | PASS | 0 | `(push) C sel 6968340 call SetViewedArea "*" "#939","#994","#64","#64"` |
| map | `surface-zones` | PASS | 93 | `res="%64:64:0=64,:0=64,…` |
| map | `pushes-after-viewport` | UNKNOWN | 3000 | `(none within 3 s)` — RefreshTycoon ×3 / RefreshObject sont arrivés plus tard |
| focus | `switch-focus` | PASS | 99 | `res="%254354412 / Town Hall / Helartia / 20,269 inhabitants:-:…` |
| focus | `unfocus` | PASS | 0 | `(push) C sel 6968340 call UnfocusObject "*" "#254354412"` |
| inspector | `property-list-at` | PASS | 359 | `res="%Town Hall⇥Mayor of Helartia⇥254354600⇥254354412⇥"` |
| inspector | `create-object` | PASS | 0 | `res="#80466680"` |
| inspector | `set-object` | PASS | 0 | `res="#-1"` |
| inspector | `close-object` | PASS | 0 | `(push) C sel 3173064 call CloseObject "*" "#80466680"` |
| inspector | `tycoon-role` | PASS | 742 | `res="%⇥⇥⇥⇥⇥⇥"` (aucun rôle) |
| inspector | `basic-details` | PASS | 11092 | Town Hall (Class1500) : 11 lots `GetPropertyList` (43 taxes…) |
| inspector | `refresh` | PASS | 3234 | même objet temporaire, `SetObject` puis 9 lots |
| inspector | `release` | PASS | 1 | `(push) C sel 3173064 call CloseObject "*" "#3948136"` |
| inspector | `tab-supplies` / `tab-products` | SKIP | - | le template Class1500 (mairie) n'a ni supplies ni products |
| chat | `channel-list` | PASS | 181 | `res="%Punta Morena / / West Bank / / Kidney Lake / …` |
| chat | `join-lobby` | PASS | 91 | `res="#0"` |
| chat | `user-list` | PASS | 109 | `res="%lord kaio/8393958/0 / SPO_test3/0/0 / "` |
| chat | `channel-info` | PASS | 92 | `res="%Channel ""Punta Morena"", created by Punta Morena.  0 users ."` |
| mail | `log-server-on` | PASS | 289 | `res="#4804536"` |
| mail | `check-new-mail` | PASS | 91 | `res="#2"` |
| mail | `inbox-listing-http` | PASS | 361 | `2 message(s)` (transport C) |
| mail | `read-message` | PASS | 464 | `res="%[Header] / FromAddr=mailer@GlobalPlanitia.net / …` |
| mail | `read-message-open` | PASS | 0 | `res="#4819028"` |
| mail | `read-message-lines` | PASS | 0 | `res="%<HEAD> / <META HTTP-EQUIV=""REFRESH""…` |
| mail | `read-message-attachment-count` | PASS | 0 | `res="#0"` |
| mail | `read-message-close-ack` | PASS | 0 | `` — **`CloseMessage "*"`+QueryId acké `A<id> ;`, première observation live de la forme corrigée** |
| politics | `owned-facilities` | PASS | 92 | `res="%"` (le compte ne possède rien) |
| research | `inventory` | SKIP | - | aucun bâtiment possédé |

Session : ClientViewId 6968340, IS 6501416, TycoonId 37, compagnie #134, login 19:35:49.171Z → logoff 19:36:24.116Z.
Pushes reçus : `InitClient`, `NewMail`, `ChatMsg`, `RefreshTycoon` ×3, `RefreshObject` ×1.

## 3. Corrélation logs serveur

| Run | Bracket IS (`LOGON SUCCESS: ClientViewId=`) | Décalage horloge | `Clients` | Heartbeat MS | Anomalies IS |
|---|---|---|---|---|---|
| 1 | 7149132 — 7:32:55 PM → 7:33:01 PM, IP 88.167.51.32 | −2 s | 7:32:56 → 7:33:01, **exit 0** | 0 trou | 0 |
| 2 | 6968340 — 7:35:47 PM → 7:36:24 PM, IP 88.167.51.32 | −2 s | 7:35:48 → 7:36:24, **exit 0** | 0 trou | 1 (§3.2) |

Horloge serveur ≈ UTC − 2 s (le matin : +1 s ; à recalibrer à chaque login, comme prévu). Fichiers lus :
`FIVEINTERFACESERVER/Survival 26-08-16.log`, `Clients 26-08-16.log`, `FIVEMODELSERVER/Survival 26-08-16.log`.

### 3.2 L'anomalie `7:36:21 PM - Error in RefreshTycoon: Unspecified error`

Serveur 19:36:21 = nôtre ≈ 19:36:23. À cet instant nous lisions le mail (`OpenMessage`…`CloseMessage`, socket
mail) ; le serveur nous avait poussé `RefreshTycoon` à 19:36:21.083 et 19:36:22.145 (nôtre), tous deux reçus et
dispatchés. **Attribution non certaine** : `lord kaio` était connecté en même temps (liste d'utilisateurs), le log IS
`Survival` est global, et le matin le même fichier montrait des `Error in SegmentsInArea` pour d'autres sessions.
Aucun effet observable côté nous (Logoff propre, exit code 0). À surveiller sur les prochains runs : si la ligne
réapparaît systématiquement dans notre fenêtre après une rafale de `RefreshTycoon`, ce sera un signal ; sinon bruit
ambiant du serveur. Le corrélateur la remonte en *anomalie*, pas en échec — c'est le comportement voulu.

## 4. Ce que le run apprend (nouveau ou confirmé)

1. **`get ServerBusy` répond en 7,67 s** (19:35:54.846 → 19:36:02.515) alors que toute autre lecture répond en ~90 ms.
   Cela explique vraisemblablement les **17/17 occurrences non répondues** dans les captures live (fenêtre de capture
   trop courte), pas un silence. Le poll de production (50 s, deadline 180 s) tient, mais tout code qui attendrait
   `ServerBusy` en chemin critique se trompe. `get RDOCnntId` a aussi mis 406 ms au second appel.
2. **`SwitchFocusEx` répond en CRLF** en live (`254354412\r\nTown Hall\r\nHelartia…`) — la capture doc était en LF ;
   [UNKNOWN] du recensement tranché.
3. **`GetChannelInfo`** (aucune preuve auparavant) : `res="%Channel ""Punta Morena"", created by Punta Morena.  0 users ."`
   — guillemets doublés, texte libre.
4. **`CloseMessage "*"` + QueryId ⇒ `A<id> ;`** confirmé live (la capture `mail-read` n'avait que la forme rejetée
   `"^"` ⇒ `error 9`).
5. **`get <propriété inexistante>` ⇒ `error 5 getting <Prop>`** : l'inférence GET → CallMethod → `errUnexistentMethod`
   (RDOObjectServer.pas:112-116, :326) est confirmée ; le motif `error N getting X` (RDOQueryServer.pas:278) aussi.
6. `ObjectsInArea` / `SegmentsInArea` / `GetSurface` (`64:64:` puis lignes RLE) / `SetViewedArea` conformes aux captures.
   La divergence de padding de `SegmentsInArea` (le client de référence pad ±1 tuile, la passerelle non) est
   **notée, pas jugée** — à décider (voir §6).
7. Cache : `CreateObject` ⇒ `res="#<id>"`, `SetObject` ⇒ `res="#-1"`, `GetPropertyList` tabulé avec tabulation finale,
   `CloseObject "*"` — désormais preuve de rang capture via la passerelle (avant : `building_details_rdo.txt` seul).
   Le premier bâtiment de la zone (939,994 ±32) est la **mairie d'Helartia** (Class1500) : 11 lots `GetPropertyList`
   à l'ouverture (11 s), le template n'a pas d'onglets supplies/products ; **aucune connexion port 7001**
   (`RDOVoteOf`) n'a été déclenchée.
8. `SPO_test3` ne possède aucun bâtiment (`RDOFavoritesGetSubItems` ⇒ `%`), n'a aucun rôle politique (6 champs vides)
   malgré un mail « Welcome Minister » (2 non lus) — cohérent avec un compte de test remis à zéro.
9. Cookie de position : `LastX.0=939 / LastY.0=994` lus puis réécrits **à l'identique** au logoff (SetViewedArea a
   utilisé la même position) — pas de dérive de l'état du compte.
10. Trames par run : 230 (104 requêtes, 14 pushes sortants, 112 entrantes) — budget 400 loin d'être atteint.

## 5. Classification des 75 scénarios RDO/HTTP de la passerelle

Recensement complet (workflow `wf_e1b44019-95c`, 4 lecteurs + critique) : 75 scénarios, 111 membres avec preuve.

### A — testables maintenant, testés, **fonctionnent** (ce run)

directory auth check · directory world list · world login · company selection · logoff/end session · cookie save
(à l'identique) · server-busy poll · map service connect · mail service connect · map area read · set viewed area ·
focus building · unfocus building · cacher property read at coordinates · tycoon political role query · building basic
details · building refresh properties · release inspector · surface data read (ZONES) · chat user list · chat channel
list · chat channel info · chat join channel (lobby) · mail unread count · mail read message · mail folder listing
(HTTP) · owned facilities list · reverse-channel answers (`idof InterfaceEvents` répondu au login) · pushes
(InitClient, NewMail, ChatMsg, RefreshTycoon, RefreshObject reçus et dispatchés) — **31 scénarios, 0 échec.**

### A′ — testables maintenant, **non exercés par ce run** (précondition absente sur ce compte / cette zone)

building tab data supplies/products (mairie sans onglets → choisir un bâtiment industriel dans la zone : à ajouter
comme stratégie « second bâtiment ») · research inventory (aucun bâtiment possédé) · cacher keepalive (inspecteur gardé
ouvert 60 s : ajout trivial) · directory people search (`RDOSearchKey`, façade morte côté UI) · building full details
(chemin legacy, sans appelant UI) · construction service connect + `RDOVoteOf` (déclenché seulement par un template
avec groupe `votes`) · surfaces autres que ZONES.

### B — non testables sans séquence / autorisation **que vous devez fournir**

- **Toutes les mutations** (`--target dedicated` ou autorisation explicite + réponses Q1–Q11 de
  `coverage-matrix.md`) : place building / capitol, demolish, rename (2 chemins), upgrade/downgrade, property setters
  (RDOSet*/RDOConnect*/RDOAutoProduce/…), road build/demolish/wipe, zone define, chat say / typing, mail send / save
  draft / delete, politics vote, campaign launch/cancel, company creation / switch, bank borrow/send/payoff,
  policy set, curriculum actions, auto-connection actions, clone facility, connect facilities. **Ce qu'il me faut :**
  l'instance dédiée (ou le feu vert partagé + budget), un bâtiment/lieu de test, la politique de nettoyage.
- **Lectures à contexte que je ne connais pas** : politics / town info (`getPoliticsData` — nom de ville + coords
  d'un hôtel de ville ; la mairie d'Helartia à 933,1000 est candidate si vous confirmez), research invention details
  (`RDOGetInvPropsByLang/RDOGetInvDescEx` — bâtiment de recherche possédé + port 7001), connection search
  (`FindSuppliers/FindClients` — un `fluidId` et un bâtiment), tycoon profile / curriculum / bank / P&L / companies /
  policy read / auto-connections read / cluster info / build menu (HTTP ASP — hors conformité RDO, à couvrir par le
  smoke L3), world reconnection (couper la socket volontairement), cleanup world session (bascule serveur).

### C — jamais en live

RDO direct (`REQ_RDO_DIRECT`, L2 uniquement) · `"^"` sur procédure (réglé, `error 9`) · U2 (annulé) · reset compte /
abandon de rôle (ASP destructifs).

## 6. Divergences à arbitrer (issues du recensement, non tranchées par un run lecture seule)

| # | Divergence | Preuve | Décision attendue |
|---|---|---|---|
| D1 | `SegmentsInArea` sans padding ±1 tuile (le client de référence : `ObjectsInArea 458,392,5,5` → `SegmentsInArea 457,391,464,398`) | doc :2020-2031 vs `spo_session.ts:1249-1261` | aligner sur le client de référence ? (segments à cheval sur la bordure) |
| D2 | `GetPropertyList` de gate sans `Selected` | `building_details_rdo.txt:18` vs `building-details-handler.ts:1247-1250` | mineur |
| D3 | `MoneyGraphInfo` lu via `GetPropertyList` au lieu de `Properties "%MoneyGraphInfo"` | `building_details_rdo.txt:44-47` vs `building-details-handler.ts:912` | vérifier que la valeur arrive (route non prouvée) |
| D4 | `PickEvent` : 2 appels à la sélection, le client de référence poll en continu (×14) | doc :980-1012 | comportemental, impact serveur inconnu |
| D5 | `RDOEndSession "*"` sans QueryId (référence : avec, acké `A4 ;`) | doc :16-17 | divergence acceptée (audit 2026-07-02) |

## 7. Suite

- Prochain run (même autorisation) : ajouter la stratégie « second bâtiment » (premier bâtiment **non** mairie de la
  zone) pour exercer supplies/products, un pas `keepalive` (inspecteur ouvert 60 s), `getPoliticsData` sur Helartia si
  confirmé, `--diff-baseline` contre `planitia-2026-08-16-baseline.json` pour détecter les dérives serveur.
- CI : `--transport replay --recording report/campaign/rec/planitia-2026-08-16.ndjson` rejoue désormais tout le run
  hors ligne (l'enregistrement complet est livré).
- Mutations : attendre l'instance dédiée / vos réponses Q1–Q11 (`report/campaign/coverage-matrix.md` §5, §7).
