# Plan d'action — Mission « Couverture de test RDO à 100 % » (protocole + handlers)

Source : [doc/prompts/rdo-test-coverage-mission.md](../doc/prompts/rdo-test-coverage-mission.md).
Décisions prises le 2026-08-17 : **(a)** un helper partagé de faux `SessionContext` est autorisé, hors production ;
**(b)** ce document est le livrable — l'exécution se fera dans une session neuve, lot par lot.

> **Ce document et le prompt de mission se lisent ENSEMBLE.** Le prompt fixe le cadre (interdits,
> invariants de protocole, définition d'un bon test, livrable) ; ce plan porte l'exploration réelle
> du dépôt. **En cas de divergence sur un fait du dépôt, ce plan gagne** — il a été vérifié le
> 2026-08-17, et il a corrigé deux erreurs du prompt (M-E déjà corrigé §2 ligne « §9 périmé » ;
> `src/__fixtures__/` inexistant).
>
> Corrections appliquées le 2026-08-17 après re-vérification :
> — §4bis/Lot 6 : le chemin des types de messages est `src/shared/types/message-types.ts`
>   (et non `src/shared/message-types.ts`).
> — §3.2 et §5 : `--coverageThreshold='{}'` neutralise le seuil global pendant l'itération ciblée,
>   au lieu de subir un exit code ≠ 0 à chaque boucle.

---

## 1. Contexte

L'analyse d'écarts du 2026-08-16 (`report/analyse-ecarts-voyager-2026-08-16.md` §8) montre que la couche
protocole RDO est à 87 % mais que les **sites d'appel** — les handlers qui choisissent la cible, le séparateur,
le verbe et les arguments — sont à 35,6 %. Les trois matrices qui portent tout le risque de trame
(`RDO_OBJECTID_COMMANDS`, `SYNCHRONOUS_RDO_COMMANDS`, `RDO_SET_PROPERTIES`) vivent dans un fichier à 27 %.
La suite de conformité prouve que les trames émises sont *bien formées* ; rien ne prouve qu'on émet *les bonnes*.
La mission comble ce trou : 21 fichiers, 2 591 lignes, 272 fonctions, 1 982 branches, **tests uniquement**.

**Objectif réel (précision développeur, 2026-08-17)** : sécuriser une implémentation 100 % conforme du protocole
applicatif RDO — la moindre anomalie de trame gèle le serveur partagé. Le 100 % de lignes est un *proxy* ; l'invariant
à tester est : **chaque action que le webclient peut déclencher émet exactement la trame de référence, ou n'émet rien**.
Trois conséquences transversales, appliquées dans chaque lot :

1. **Oracle par membre RDO** — pour chaque membre émis, la forme attendue vient, dans l'ordre : de la capture live
   (`doc/Mock_Server_scenarios_captures.md`, `src/mock-server/scenarios/captured/`), sinon de la déclaration Delphi
   (`procedure` → `"*"`, `function` → `"^"`, cité `Fichier.pas:Ligne`), sinon `[INFERRED]` — consigné au rapport
   comme « non validé live ». Le test cite sa source en commentaire.
2. **IDs dynamiques** (classe de test à part, §4bis) — le handler doit **rethreader l'ID renvoyé par le serveur**
   (ObjectId, CurrBlock, tempObjectId du cacher, id de message, id de canal) dans la trame suivante, octet pour octet ;
   si l'ID est absent/malformé, **aucune trame ne part**.
3. **Limite assumée** — des tests Jest sur des faux prouvent la *forme*, pas la survie du serveur. Le rapport final
   liste les membres RDO exercés en Jest mais absents de la suite de conformité live (`src/tools/conformance/`) :
   c'est le lot de suivi (lecture sur planitia, mutations sur l'instance dédiée, avec étape de découverte d'ID).

## 2. État réel du dépôt (exploration 2026-08-17) — ce que le prompt ne dit pas

| Constat | Conséquence pour le plan |
|---|---|
| **Aucune fabrique partagée de faux `SessionContext`** — chaque test recopie un `makeCtx()` local (`building-mutations.test.ts:15-49`, `mail-handler-emission.test.ts:24-42`, `building-templates-handler.test.ts:15-24`, `login-handler-reconnect.test.ts:29-70`) | Lot 0 : créer `src/server/__tests__/session/fake-session-context.ts` (répertoire `__tests__/` exclu de la couverture par `jest.config.js:70`, jamais importé par la prod) |
| `sendRdoRequest` est **toujours** appelé via `ctx` ; `writeRdoFrame` est un import module de `../rdo-helpers` mais n'écrit que sur `ctx.getSocket(name)` | Aucun `jest.mock` nécessaire pour les handlers RDO purs : un `getSocket` renvoyant `{ write(buf) }` capture les trames (décoder en **latin1**, `writeRdoFrame` écrit un Buffer) |
| Handlers HTTP (`profile-finance`, `auto-connection`, `building-templates`, `politics`) utilisent `ctx.fetchAspPage` **et** `import fetch from 'node-fetch'` en direct | `jest.mock('node-fetch', () => ({ __esModule: true, default: jest.fn() }))` — forme déjà utilisée par `auth.validation.test.ts:16-19` |
| **Aucun répertoire `src/__fixtures__/` n'existe** (aucun `.html` sous `src/`) | Les HTML ASP de test seront des constantes inline dans chaque `*.test.ts` (rien à ajouter dans un répertoire protégé) |
| Les 3 matrices de `building-property-handler.ts` sont **locales à `setBuildingPropertyImpl`** (L136-172), non exportées | Elles se testent uniquement par comportement : un `it.each` par commande de `KNOWN_RDO_COMMANDS` (41 entrées, L26-39) qui appelle `setBuildingProperty()` et vérifie cible + séparateur + verbe sur la trame capturée |
| **Singletons module** : `construction-lock.ts:14` (WeakMap ctx→Promise), `building-details-handler.ts:82` (`activeInspectors` WeakMap, échappatoire `setActiveInspectorForTest` L124), `property-fallback-census.ts:41` (Map mutable), `rdo-helpers.ts:19` (`socketTags`) | Un ctx **neuf par test** ; jamais de ctx partagé au niveau `describe` |
| `setTimeout(…, 200)` après chaque fire-and-forget (`building-property-handler.ts:186,190,225` ; aussi `building-management`, `mail`, `politics`) | `jest.useFakeTimers()` + `await jest.advanceTimersByTimeAsync(200)` — sinon 41 commandes × 200 ms dépasse `testTimeout: 10000` |
| Timeouts RDO : la prod rejette avec `new Error('Request timeout: <member>')` (`spo_session.ts:2403`), erreurs serveur via `RdoServerError` (`rdo-error-contract.ts:79`) | Le faux `sendRdoRequest` doit pouvoir rejeter avec exactement ces formes pour couvrir les branches d'erreur |
| `rdo-connection-pool.ts` : `socketFactory` injectable (`PoolConfig`, L46-63), `log`/`onData`/`onClose` injectés ; health-check `setInterval` 60 s (L311) | Fake timers + `pool.close()` en `afterEach` (sinon handle ouvert) |
| **Jest 30.2** (`package.json:73`) : `it.failing` disponible ; l'option `--testPathPattern` du prompt a été **renommée `--testPathPatterns`** en Jest 30 | Utiliser la forme positionnelle `npx jest … <motif>` ; vérifier avec `npx jest --help` en Lot 0 |
| Une couverture ciblée `--collectCoverageFrom=<un fichier>` fait échouer le `coverageThreshold` global (38 %) tant que le fichier n'y est pas | Ajouter **`--coverageThreshold='{}'`** pendant l'itération : le seuil est neutralisé, l'exit code redevient exploitable. Le seuil réel se vérifie au `npm test` de fin de lot. (Sans ça : exit ≠ 0 à chaque boucle, le rapport `text` s'affiche quand même — ne pas « corriger » le seuil.) |
| Matchers RDO : types via `/// <reference path="../__tests__/matchers/rdo-matchers.d.ts" />` — **aucun précédent dans `src/server/session/`** | Chemin exact pour un test dans `session/` : `../__tests__/matchers/rdo-matchers.d.ts` ; dans `src/shared/` : `../server/__tests__/matchers/rdo-matchers.d.ts` |
| **§9 du prompt partiellement périmé** : `building-property-handler.ts:237-259` a déjà corrigé M-E (`readBack` vide → `newValue: ''`, `confirmed: false`) ; seul `success: true` reste inconditionnel | Le test documente le comportement **actuel** ; le rapport signale « M-E déjà corrigé, `success` inconditionnel demeure » |
| Bugs TV/Banque du §9 (`Comercials`, `EstLoan`, `BudgetPerc`…) vivent dans `src/shared/building-details/template-groups.ts:245-314` (hors périmètre) mais **transitent** par `setBuildingProperty(…,'property',…,{propertyName:'Comercials'})` et `getBuildingTabData` | Les tests `it.failing` se placent dans `building-property-handler.test.ts` et `building-details-handler.test.ts`, avec le commentaire `// BUG connu : … voir report/analyse-ecarts-voyager-2026-08-16.md §2` |

## 3. Lot 0 — Socle (avant tout test)

### 3.1 Baseline chiffrée
```bash
export PATH="/c/Program Files/nodejs:$PATH"
npx jest --coverage --coverageReporters=json-summary --coverageReporters=text-summary
cp coverage/coverage-summary.json <scratchpad>/coverage-before.json
```
Extraire les 21 lignes du tableau §4 du prompt (lignes / fonctions / branches / statements) → colonne « avant » du rapport.
Confirmer au passage l'échec connu `auth.validation.test.ts:51` sous instrumentation (ne pas y toucher).

### 3.2 Vérifier la CLI Jest 30
Vérifié le 2026-08-17 : Jest 30.2 expose **`--testPathPatterns`** (pluriel) ; `--testPathPattern` n'existe plus.
La forme **positionnelle** est la plus stable. Commande de référence par fichier :
```bash
npx jest --coverage --collectCoverageFrom="src/server/session/road-handler.ts" \
  --coverageReporters=text --coverageDirectory=coverage-scratch --coverageThreshold='{}' \
  src/server/session/road-handler.test.ts
```
`--coverageDirectory=coverage-scratch` préserve le rapport de référence `coverage/` ;
`--coverageThreshold='{}'` rend l'exit code exploitable pendant l'itération.

### 3.3 Helper partagé `src/server/__tests__/session/fake-session-context.ts`
Spécification (typé, zéro `any`) :
```ts
export interface SentRequest { socketName: string; packet: Partial<RdoPacket>; timeoutMs?: number; category?: TimeoutCategory }
export type Responder = (packet: Partial<RdoPacket>, n: number) => string | RdoPacket | Error;   // string = payload
export interface FakeSessionCtx {
  ctx: SessionContext;
  sent: SentRequest[];                     // tout ce que sendRdoRequest a reçu, dans l'ordre
  frames: Record<string, string[]>;        // trames writeRdoFrame par nom de socket, décodées latin1
  respond(fn: Responder): void;            // routeur de réponses par membre ; défaut `res="#0"`, GET → `<member>="#1"`, IDOF → `objid="…"`
  cacher: { propertyLists: jest.Mock; setPath: jest.Mock; … };  // tous les cacher* de SessionContext
  log: Record<'debug'|'info'|'warn'|'error', jest.Mock>;
}
export function makeSessionCtx(overrides?: Partial<SessionContext> & { sockets?: string[] }): FakeSessionCtx;
export function makeLoginCtx(...)   // variante LoginContext pour login-handler.ts (mêmes captures)
export function makePushCtx(...)    // PushContext (push-dispatcher.ts:38) — tous les setters en jest.Mock
```
Règles : une `Error` retournée par le responder est **rejetée** (branches timeout) ; `getSocket(name)` renvoie `undefined` si `name` n'est pas dans `sockets` (branche « socket absente ») ; les valeurs par défaut reprennent `rdo-callsite-wire-format.test.ts:33-45` (`cannedPayload`). Le helper ne construit **jamais** de trame RDO — il capture.
Test du helper lui-même : `fake-session-context.test.ts` (quelques cas : capture latin1, rejet, socket absente).

### 3.4 Convention de fichier de test
- En-tête : `/// <reference path="…/rdo-matchers.d.ts" />` si un matcher est utilisé.
- Un `describe` par fonction exportée ; `it()` nommés par le comportement (« garde "*" sur SayThis », pas « sendChatMessage works »).
- Ordre des assertions dans chaque test de mutation : **cible → séparateur/QueryId → verbe → arguments (préfixe, ordre, `#-1`/`#0`) → chemin d'erreur**.
- Toute valeur attendue de trame construite via `RdoCommand`/`RdoValue` (jamais de littéral `"C sel …"` sauf citation de capture en commentaire).
- Citer `Fichier.pas:Ligne` quand un test encode une règle Delphi (copier les références déjà présentes dans les commentaires du handler).

## 4. Lots — fichier par fichier

Format : **fichier → stratégie → cas à couvrir → pièges**. Chaque fichier suit la boucle §5.

### LOT 1 — Fermer la couche protocole (≈ 117 l.)

| Fichier | Test | Stratégie | Cas clés |
|---|---|---|---|
| `src/shared/proxy-utils.ts` (80 l., 0 test) | `proxy-utils.test.ts` (nouveau) | Pur, zéro mock | `toProxyUrl` : les 3 exemples de la JSDoc L20-33 + URL sans host, `baseHost` fourni/absent, URL déjà proxifiée ; `fileToProxyUrl` ; `isProxyUrl` vrai/faux ; `PROXY_IMAGE_ENDPOINT` |
| `src/shared/error-codes.ts` (151 l., 43 br.) | `error-codes.test.ts` (nouveau) | Table-driven sur les 44 constantes exportées L7-53 | `it.each` : chaque code → message non vide et distinct ; `default` (code inconnu, négatif) ; unicité des valeurs des constantes ; bandes 0-34 / 100-102 / 110-115 |
| `src/server/rdo-helpers.ts` (7 l.) | compléter `rdo-helpers.test.ts` | Cibler les lignes rouges du rapport `text` | probablement `redactSensitiveRdoFrame` (regex L36), `extractRevenue`, `parseIdOfResponse` cas malformés, `writeRdoFrame(…, alreadyLogged=true)` ; **reset du census** (`property-fallback-census`) en `beforeEach` |
| `src/shared/rdo-types.ts` (5 l., protégé) | compléter `rdo-types.test.ts` | Idem — lignes rouges seulement | branches d'erreur `RdoIdentifierError` L108, cas limites de `RdoValue` |
| `src/server/rdo.ts` (5 l., protégé) | compléter `rdo.test.ts` | Idem | branches du framer/parser sur trames tronquées ou séparateurs inattendus |
| `src/server/session/rdo-connection-pool.ts` (45 l., 12 fn) — **prioritaire** | compléter `rdo-connection-pool.test.ts` (135 l. existantes) | `socketFactory` injecté renvoyant un faux `net.Socket` (EventEmitter + `connect/write/destroy` jest.fn) ; `jest.useFakeTimers()` | `initialize` succès/échec/`connectTimeoutMs` ; `getConnection` round-robin + `acquireSlot`/`releaseSlot` ; `maxConsecutiveTimeouts` → `replaceConnection` ; `onData`/`onClose` callbacks ; `startHealthCheck` (avancer 60 s) ; `drainAll` ; `close` idempotent ; `getPrimarySocket`/`getPrimaryConnection` avant init ; **`close()` en `afterEach`** |

Point d'étape Lot 1 : `npm test` vert (hors échec connu), typecheck vert, tableau partiel.

### LOT 2 — Le cœur du risque de trame

**`src/server/session/building-property-handler.ts`** (805 l., 27 %) → `building-property-handler.test.ts` (nouveau ; `building-mutations.test.ts` reste)
- Harnais : `makeSessionCtx({ sockets: ['construction'] })`, fake timers, `cacher*` mockés (`cacherCreateObject` → id, `cacherGetPropertyList` → `[valeur]`).
- **Matrice complète** : `it.each([...KNOWN_RDO_COMMANDS])` → pour chaque commande, appeler `setBuildingProperty(ctx, x, y, cmd, value, params)` avec les `additionalParams` que `buildRdoCommandArgs` (L285) attend (lire la fonction en entier pour lister les cas : index, salaires ×3, fluid/perc, tycoon id, ware…), puis asserter :
  1. **cible** : `objectId` pour les 10 de `RDO_OBJECTID_COMMANDS` (L150-154), `currBlock` sinon — donc le faux `cacherGetPropertyList` doit renvoyer `CurrBlock ≠ ObjectId` (cas entrepôt) pour que le test discrimine ;
  2. **séparateur** : `"*"` partout ; **QueryId présent** uniquement pour `RDOConnectOutput`/`RDOConnectInput` (via `sent[]`, `category === TimeoutCategory.SLOW`), **absent** pour les fire-and-forget (via `frames.construction`) — Delphi `Kernel.pas:1077-1078`, `RDOObjectProxy.pas:438-443` ;
  3. **verbe** : `set` pour `RDOAcceptCloning` (`Kernel.pas:1304`) et pour `'property'`+`propertyName` ; `call` sinon ;
  4. **arguments** : préfixes `#`/`%`/`$` et booléen `#-1`/`#0` selon `buildRdoCommandArgs` ; `WIDESTRING_PROPERTIES` (`Name` L637) ;
  5. **erreurs** : commande inconnue → throw « not in KNOWN_RDO_COMMANDS » (L214) ; socket construction absente (L177) ; `sendRdoRequest` rejette (timeout) → `{ success:false, newValue:'' }` ; read-back vide → `confirmed:false` (M-E) ; `cacherCloseObject` appelé dans le `finally` même en erreur.
- **Bugs à documenter** : `success: true` inconditionnel après un read-back vide (§9, partiellement corrigé — commenter l'état réel) ; `it.failing` « `Comercials` devrait s'écrire `Commercials` (Broadcast.pas:53) » via `'property'` + `{propertyName:'Comercials'}`.
- `mapRdoCommandToPropertyName` (L668) : couvrir chaque `case` via le read-back (le nom demandé à `cacherGetPropertyList`).
- Sérialisation `construction-lock` : deux appels concurrents sur le même ctx → ordre préservé (une assertion, ctx neuf).

**`src/server/session/push-dispatcher.ts`** (408 l., 106 br.) → `push-dispatcher.test.ts` (nouveau)
- Harnais : `makePushCtx()` ; paquets construits comme des `RdoPacket` **entrants** (`type`, `member`, `args`, `payload`) — c'est du parsing, pas de l'émission, donc pas de contrainte `RdoCommand` ; reprendre les formes des pushes capturés (`src/mock-server/scenarios/captured/*.scenario.ts`, `doc/Mock_Server_scenarios_captures.md`).
- Un `describe` par membre L91-386 (`InitClient`, `SetLanguage`, `NewMail`, `ChatMsg`, `NotifyMsgCompositionState`, `NotifyChannelChange`, `NotifyUserListChange`, `RefreshTycoon`, `EndOfPeriod`, `RefreshDate`, `ShowNotification`, `Refresh`, `TycoonRetired`, `ModelStatusChanged`, `RefreshSeason`, `MoveTo`, `NotifyChannelListChange`) : cas nominal → bon setter/`emit` appelé avec les bons arguments ; args manquants / malformés / vides ; encodage (accents latin1 dans `ChatMsg`).
- **Membre inconnu** : ne jette pas, journalise ; **paquet sans `member`** ; `_socketName` ignoré.
- Test d'inventaire (§8.3-2 de l'analyse) : liste des membres traités vs les 24 méthodes `TISEvents` (`ServerCnxHandler.pas:476-504`) — **`it.failing` ou liste d'exemptions explicite** pour les non-traités (famille B), avec le pointeur vers le rapport.

### LOT 3 — Handlers de bâtiment

**`building-details-handler.ts`** (1 557 l., 52 fn) → compléter `building-details-handler.test.ts` (179 l.)
- Harnais : `makeSessionCtx` + `setActiveInspectorForTest` (L124) / `releaseInspector` (L88) en `afterEach` (WeakMap L82).
- Couvrir : `getBuildingDetails` L199 (cache in-flight `get/set/deleteInFlightBuildingDetails`, dédoublonnage), `getBuildingBasicDetails` L226, `getBuildingTabData` L349 (chaque onglet/groupe → liste de `rdoName` demandés à `cacherGetPropertyList` — c'est ici que l'`it.failing` « `HoursOnAir`/`Comercials`/`BudgetPerc`/`Interest`/`Term`/`EstLoan` ne sont jamais dans le cache » se place), `refreshBuildingProperties` L488, `Semaphore` L1104 / `computeWorkerCount` L1148 / pool de workers L1159-1196 (`MAX_CONCURRENT_CONNECTIONS = 3`, `MAX_GLOBAL_CONCURRENT_RDO = 4` : vérifier le plafond de parallélisme en comptant les `sendRdoRequest` en vol), `AsyncMutex` (déjà partiellement couvert par `__tests__/async-mutex.test.ts` — ne pas dupliquer).
- Erreurs : `cacherSetPath` rejette, réponse `GetPropertyList` vide/malformée, socket map absente.

**`building-templates-handler.ts`** (608 l.) → compléter `building-templates-handler.test.ts` (120 l.)
- `jest.mock('node-fetch')` ; HTML inline minimal mais **réaliste** (reproduire la structure des pages `VisualClasses`/clusters ; réutiliser les motifs de `build-facility-parser.test.ts` si compatibles) pour piloter les 4 parseurs non exportés via `fetchClusterInfo` L31, `fetchClusterFacilities` L100, `fetchBuildingCategories` L190, `fetchBuildingFacilities` L289 ; `deriveResidenceClass` ; erreurs HTTP (status ≠ 200, `fetch` rejette, HTML vide).
- `placeBuilding` L506 / `placeCapitol` L567 : déjà testés — compléter les branches d'erreur (`res="#N"` ≠ 0 via `parseResultCode`, timeout).

**`building-management-handler.ts`** (378 l.) → `building-management-handler.test.ts` (nouveau ; `building-mutations.test.ts` reste)
- `queryTycoonPoliticalRole` L41 (`parseBooleanCacheValue` L26 : `#-1`, `#1`, `#0`, vide, non-numérique — accepter tout ordinal non nul), `manageConstruction` L75 (START/STOP/DOWN, `count`, cible, séparateur), `upgradeBuildingAction` L211, `renameFacility` L250 (SET `Name`, widestring `%`), `deleteFacility` L315.
- **Bug §9** : `RDODelFacility` L343-357 — `it()` documentant que `success:true` est renvoyé même quand la réponse porte `error N` / `res="#N"` non nul (commentaire `// BUG connu`).

### LOT 4 — Handlers de domaine

| Fichier | Test | Harnais | Cas clés |
|---|---|---|---|
| `profile-finance-handler.ts` (695 l., **priorité**) | nouveau | `makeSessionCtx` (`fetchAspPage`, `get/setAspActionCache`, `convertToProxyUrl`), `jest.mock('node-fetch')` pour les 2 `fetch` directs (L65 RenderTycoon, L494 bank action) | `fetchTycoonProfile` L29 (avec/sans photo, échec curriculum → push data), `fetchCurriculumData` L145 + `parseCurriculumDetails` L172 (sections présentes/absentes, cache d'URLs d'action L274), `fetchBankAccount` L313 + `parseBankAccountHtml` L331, **`executeBankAction` L434** — borrow / send / payoff : URL construite (encodage `%20` L494), formulaire depuis le cache `TycoonBankAccount.asp` (L473-474) présent/absent, réponse OK / KO / `fetch` rejette — **argent réel : chaque branche** ; `fetchProfitLoss` L528, `fetchCompanies` L619 ; `it.failing` « `EstLoan` vient de `RDOEstimateLoan`, non implémenté » si le handler l'expose |
| `auto-connection-handler.ts` (473 l.) | nouveau | idem (fetch mocké, HTML inline, `extractAllActionUrls` réel) | `fetchAutoConnections` L28 + parser L46 (0/1/n lignes, HTML tronqué), `executeAutoConnectionAction` L125 (URL d'action trouvée/absente, réponse KO), `fetchPolicy` L247 + `parsePolicyHtml` L266, `setPolicyStatus` L308, `executeCurriculumAction` L369 |
| `mail-handler.ts` (474 l.) | nouveau `mail-handler.test.ts` (compléter, pas dupliquer, `mail-handler-emission.test.ts`) | `makeSessionCtx({ sockets:['mail'] })`, `ensureMailConnection` mock, fake timers | `composeMail` L95 : séquence `NewMail`→`AddLine`×n→`CloseMessage` (**`AddLine`/`CloseMessage` ∈ `VOID_MEMBERS` : `"*"` + QueryId**), en-têtes `parseMailHeaders` L44 / pièce jointe L74, ligne vide, accents ; `saveDraft` L183 ; `readMailMessage` L276 (`sendRdoRequest` ×n, réponse vide/malformée) ; `deleteMailMessage` L379 ; `getMailUnreadCount` L406 ; `getMailAccount` L432 ; `getMailFolder` L441 (HTTP via `parseMessageListHtml`) ; timeouts sur chaque appel |
| `politics-handler.ts` (453 l.) | compléter `politics-handler.test.ts` (121 l.) | parseurs purs L32/L124/L175 sans mock ; fetch mocké ; `makeSessionCtx` | `parsePoliticsRatings` (0/n candidats, HTML cassé), `parseCampaignResponse`, `getDefaultPoliticsData`, `fetchOwnedFacilities` L197, `getPoliticsData` L218 (chaîne fetch → RDO), `politicsVote` L298 / `politicsLaunchCampaign` L345 / `politicsCancelCampaign` L371 (cible, séparateur, `#`), `searchConnections` L399 branches restantes (déjà en partie dans `rdo-callsite-wire-format.test.ts:112+`) |
| `road-handler.ts` (441 l.) | nouveau | `makeSessionCtx({ sockets:['world'] })` — pur ctx, zéro `jest.mock` | `buildRoad` L106 : `generateRoadSegments` L33 via le résultat (horizontal, vertical, diagonale/L, longueur 0, coordonnées inversées), `CreateCircuitSeg` cible `worldContextId`, args `#`, coût `ROAD_COST_PER_TILE`, `res="#N"` (rejet — s'aligner sur `scenarios/captured/road-build-rejected-captured.scenario.ts`) ; `getRoadCostEstimate` L272 ; `demolishRoad` L317 (`BreakCircuitAt`) ; `wipeCircuit` L385 (`WipeCircuit`) ; timeouts |
| `zone-surface-handler.ts` (174 l.) | nouveau | ctx minimal (`sendRdoRequest` seul) | `defineZone` L18 (cible, args, erreur) ; `getSurfaceData` L71 → `parseRLEResponse` L105 / `decodeRLERow` L153 : run simple, runs multiples, ligne vide, run tronqué, longueur ≠ largeur annoncée, payload vide |
| `research-handler.ts` (144 l.) | nouveau | ctx (`sendRdoRequest`, `cacherGetPropertyList`) | `getResearchInventory` L20 (0, < 50, > 50 items → `BATCH_SIZE` L64 : nombre d'appels), `getResearchDetails` L94, réponses vides/malformées, `parseResearchItems` réel |
| `chat-handler.ts` (212 l.) | nouveau | `makeSessionCtx({ sockets:['world'] })` | `sendChatMessage` L159 : **`SayThis` `"*"` + QueryId** (`InterfaceServer.pas:179`, la trame qui a gelé le serveur), texte avec `;`/`"`/accents (croiser `rdo-frame-injection.test.ts`), `getChatUserList` L72 / `getChatChannelList` L89 (parseurs L23/L52 : vide, 1, n, `parseAccDesc`), `getChatChannelInfo` L107, `joinChatChannel` L131, `setChatTypingStatus` L187, `getCurrentChannel` L210 |

### LOT 5 — Session

**`login-handler.ts`** (1 139 l., 94 l. restantes) → compléter via `login-handler-reconnect.test.ts` **et/ou** un nouveau `login-handler.test.ts`
- Deux harnais : `makeLoginCtx` (unitaire, rapide) pour `checkAuth` L141, `searchPeople` L272 (`parseSearchKeyResults` L959), `createCompany` L627, `switchCompany` L707, `parseSeasonValue` L128, `parseDirectoryResult` L901 ; **`createProtocolTestHarness`** (`protocol-test-harness.ts:102`, avec `jest.mock('net')` + `jest.mock('node-fetch')` **avant** l'import, `buildWorldPropertyFallbacks` L349, `buildLoginPushTriggers` L381) pour `connectDirectory` L150, `loginWorld` L327, `selectCompany` L505, `reconnectWorldSocket` L999 / `fullWorldRelogin` L1057 (fake timers pour le backoff ; s'appuyer sur `world-reconnect.test.ts` et `server-busy-reconnect.test.ts` existants — compléter, ne pas dupliquer).
- Erreurs : `AuthError`, directory KO, monde absent, `net` échoue (`failNextConnect` de `MockTcpSocket` L138), timeouts par catégorie.

**`spo_session.ts`** (3 064 l., 431 l. / 123 fn restantes, **protégé**) → nouveau `src/server/__tests__/spo-session-surface.test.ts` (ou `session-delegation.test.ts`)
- 202 méthodes publiques dont la majorité sont des **délégations une ligne** vers les handlers (`this` passé tel quel, ex. L1101, L631, L2641) et des getters/setters pour `SessionContext`/`PushContext`.
- Stratégie : (1) `jest.spyOn` sur chaque module handler (`import * as mailHandler …`) et vérifier que la méthode de session appelle le handler avec `(session, …args)` et renvoie sa valeur — un `it.each` par table `[méthode, module, fonction, args]` couvre les ~120 délégations en un fichier lisible ; (2) getters/setters : aller-retour ; (3) le reste (`sendRdoRequest` L2184-2403 : buffer plein, session closing, timeout, réponse tardive L2543 ; `startServerBusyPolling` ; `startGcSweep` ; `logoff` L2885 ; cleanup L2777) via `createProtocolTestHarness` avec fake timers, en complétant `timeout-state-machine.test.ts` / `parallel-area-reads.test.ts` existants.
- Ne jamais mocker `sendRdoRequest` quand c'est lui qu'on couvre.

### §4bis — Classe transversale « IDs dynamiques » (dans les lots 2, 3, 4)

Le faux `sendRdoRequest`/`cacher*` distribue des IDs **distincts et non triviaux** (ex. `CurrBlock=40133496`,
`ObjectId=40133497`, `tempObjectId=7`), jamais les mêmes valeurs que les arguments du test, pour qu'un littéral
codé en dur ou une inversion soit détecté. Pour chaque handler qui enchaîne des appels :

| Chaîne | Ce que le test épingle |
|---|---|
| `getBuildingDetails` → `cacherCreateObject` → `cacherSetObject(id,x,y)` → `cacherGetPropertyList(id,…)` → `cacherCloseObject(id)` | le même `tempObjectId` traverse toute la chaîne ; `close` appelé même en erreur |
| `setBuildingProperty` : `GetPropertyList` renvoie `CurrBlock`/`ObjectId` → trame `sel <cible>` | la cible de la trame est **la valeur renvoyée**, choisie par `RDO_OBJECTID_COMMANDS` ; `CurrBlock` vide/absent → aucune trame, `success:false` |
| `manageConstruction`/`renameFacility`/`deleteFacility` : focus → id → commande | idem ; id manquant → rien n'est écrit sur la socket |
| `composeMail` : `NewMail` → id de message renvoyé → `AddLine`×n → `CloseMessage` | l'id du serveur est celui des `AddLine`/`CloseMessage` |
| `readMailMessage`/`deleteMailMessage` : id fourni par le client | id vide → pas de trame |
| `joinChatChannel` / `getChatChannelInfo` : nom de canal renvoyé par la liste | rethreadé tel quel (accents latin1) |
| `buildRoad` : `worldContextId` du login → `CreateCircuitSeg` | `worldContextId` null → aucune trame |
| `selectCompany` : `worldContextId`, `tycoonId`, `companyId` | `PickEvent`/`GetTycoonCookie` portent les IDs de session, pas des constantes (déjà amorcé `rdo-callsite-wire-format.test.ts:84-109`) |

Assertion type : `expect(frames.construction).toEqual([RdoCommand.sel(objectIdRenvoyé).call(...).push().args(...).build()])`
— l'ID attendu est **la variable** que le faux a renvoyée. Cas négatif systématique : `respond(() => 'res="%"')`
(vide) → `frames` vide et retour d'échec.

### LOT 6 — Test d'inventaire « capacité → trame » (après les cinq lots)

Fichier : `src/server/__tests__/rdo/capability-inventory.test.ts`. **Vert dès le premier run** (listes d'exemptions
explicites, seedées à partir du premier passage, avec un commentaire par entrée), **aucune table de correspondance
maintenue à la main** — tout est dérivé du code source au moment du test :

1. **Pas de capacité orpheline** — lire `src/shared/types/message-types.ts` (`REQ_*`), les clés de `wsHandlerRegistry`
   (`src/server/ws-handlers/index.ts`) et les émissions dans `src/client/` : chaque `REQ_*` a un handler serveur
   **et** un émetteur client, sauf exemptions nommées (`REQ_RDO_DIRECT`, …). Reprend §8.3-3 de l'analyse.
2. **Pas de membre RDO sans test** — extraire par regex, dans `src/server/session/*.ts` et `spo_session.ts`, tous
   les membres émis (`member: '…'`, `.call('…')`, `.set('…')`, `.get('…')`, `idof`) ; pour chacun, exiger qu'au moins un
   `*.test.ts` de `src/server/` (hors `__mocks__`) le mentionne **dans une assertion** (heuristique : ligne contenant
   `expect` ou `toContainRdoCommand`/`toMatchRdoCallFormat`/`toMatchRdoSetFormat`, ou fichier qui importe le handler
   émetteur). Exemptions nommées avec raison.
3. **Séparateur cohérent** — pour chaque membre de `VOID_MEMBERS` (`rdo-request-guards.ts`), aucun site
   d'émission n'utilise `"^"` (grep statique) et au moins un test le pilote (croisement avec 2).
4. **Pushes traités** — membres `TISEvents` (`ServerCnxHandler.pas:476-504`, liste figée dans le test avec la
   citation) vs `packet.member === '…'` de `push-dispatcher.ts` ; non-traités en exemptions (famille B).

Le test lit les sources avec `fs` (chemins relatifs à `__dirname`), pas d'import dynamique. Il ne touche à aucun
fichier de prod. Toute exemption retirée par la suite doit faire échouer le test — c'est son rôle de cliquet.

## 5. Boucle de vérification (par fichier, puis par lot)

Par fichier :
1. `Read` du fichier de prod **en entier** (signatures, branches, commentaires Delphi à recopier).
2. Couverture ciblée → lignes rouges. 3. Écrire/compléter le test. 4. Reboucler jusqu'à 100 % L/F/S. 5. `npx jest <motif>` vert. 6. `npm run typecheck` (le hook Stop le fait aussi).

Par lot :
```bash
npm test                                             # vert, hors auth.validation.test.ts:51 sous couverture
npx jest --coverage --coverageReporters=text-summary # global après lot
```
+ relancer explicitement les 9 fichiers déjà à 100 % (`timeout-categories`, `cp1252`, `rdo-error-classifier`, `rdo-error-contract`, `rdo-request-guards`, `session-utils`, `construction-lock`, `property-fallback-census`, `diagnostics-readouts`) — non-régression.
Point d'étape rendu au développeur après **chaque** lot (§10 du prompt) ; ne pas enchaîner trois lots.

## 6. Ordre d'exécution recommandé à l'intérieur des lots (ROI)

Lot 1 : pool → proxy-utils → error-codes → rdo-helpers → rdo-types → rdo.ts.
Lot 2 : push-dispatcher (aucune friction) puis building-property (le plus exigeant).
Lot 3 : management → templates → details.
Lot 4 : zone-surface → research → chat → road → mail → politics → auto-connection → profile-finance.
Lot 5 : login-handler → spo_session.

## 7. Rapport final `report/couverture-rdo-100.md` (français)

Sections imposées par §11 : (1) tableau avant/après ×21 (depuis `coverage-before.json` / `coverage-summary.json` final) ; (2) tests ajoutés par lot (compter les `it(` par fichier, `git diff --stat`) ; (3) bugs — connus (§9, avec l'état réel : M-E déjà corrigé partiellement ; `RDODelFacility` ; `Comercials` ; cache TV/Banque ; `EstLoan`) et nouveaux ; (4) branches inatteignables `fichier:ligne` + raison ; (5) chaque `/* istanbul ignore */` (≤ 10, sinon stop et signalement) ; (6) couverture globale avant/après + **valeurs auxquelles `jest.config.js` pourrait monter** (global, et proposition d'une entrée `./src/server/session/`), sans les modifier ; (7) compétences utilisées (`spo-testing`, `rdo-conformity`, `code-guardian`, `delphi-archaeologist` si le Delphi est consulté, `typescript`) ;
**(8) suivi live** — table des membres RDO exercés en Jest × présence dans la suite de conformité (`src/tools/conformance/`), avec pour chaque absent : lecture (planitia) ou mutation (instance dédiée), et l'étape de découverte d'ID nécessaire ; **(9)** membres dont l'oracle est `[INFERRED]` (ni capture ni déclaration Delphi trouvée) ; **(10)** exemptions posées dans le test d'inventaire (Lot 6), avec raison.
Aussi : compléter la ligne « **Exécuté :** » de `doc/prompts/rdo-test-coverage-mission.md`.

## 8. Risques et garde-fous

- **Ne jamais toucher** : `rdo-types.ts`, `rdo.ts`, `spo_session.ts`, `jest.config.js`, `src/__fixtures__/*` (inexistant aujourd'hui — ne pas le créer). Aucun fichier de prod, même pour un export « pratique » : si un parseur privé n'est atteignable qu'à travers un mock lourd, c'est le prix.
- **Séparateurs dans les tests** : les tests écrivent sur des faux — aucune trame ne part vers le serveur partagé. Aucun test ne doit lancer `npm run conformance -- --live`.
- Fuites d'état : ctx neuf par `it`, `jest.restoreAllMocks()` en `afterEach`, `pool.close()`, `releaseInspector`, reset du census de fallback.
- Fake timers + `node-fetch` mocké : `jest.useFakeTimers()` **après** les imports mockés ; utiliser `advanceTimersByTimeAsync` (pas `runAllTimers`, qui boucle sur les `setInterval`).
- Volume : ~2 600 lignes à couvrir ≈ 15-20 fichiers de test, plusieurs centaines de `it`. Chaque lot est un point de rendu — un lot inachevé se déclare comme tel.
- Le prompt de mission est autoportant ; ce plan le complète (constats §2, helper §3.3, ordre §6). Dans la session d'exécution, lire les deux.

## 9. Vérification de fin de mission

```bash
npm run typecheck && npm test && npm run build
npx jest --coverage --coverageReporters=text --collectCoverageFrom="src/server/session/*.ts" \
  --collectCoverageFrom="src/server/rdo*.ts" --collectCoverageFrom="src/server/spo_session.ts" \
  --collectCoverageFrom="src/shared/{proxy-utils,error-codes,rdo-types}.ts"
```
Attendu : 100 % lignes/fonctions/statements sur les 21 fichiers ; branches à 100 % ou justifiées ; les 9 fichiers déjà à 100 % inchangés ; `capability-inventory.test.ts` vert avec ses exemptions documentées ; `git status` ne montre que des `*.test.ts`, `src/server/__tests__/session/fake-session-context.ts`, `report/couverture-rdo-100.md` et la ligne « Exécuté » du prompt.

Ordre des lots final : Lot 0 → 1 → 2 → 3 → 4 → 5 → **6 (inventaire)** → rapport. Point d'étape après chacun.

---
Compétences utilisées pour ce plan : `spo-testing` (lue), exploration via agents Explore, `rdo-conformity`/`code-guardian` (règles rappelées depuis CLAUDE.md et `src/server/CLAUDE.md`).
