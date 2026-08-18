# Plan de certification RDO — révision 4 : le client est la spécification

**2026-08-18, après l'incident de 10:22.** Cette révision **remplace intégralement la révision 3**
([plan-campagne-live-rdo.md](plan-campagne-live-rdo.md)), qui est obsolète et ne doit pas être
ressuscitée. Le renversement est demandé par le développeur, et il est justifié.

Produite après une recherche parallèle sur six axes (12 agents, 1,31 M tokens), **chaque axe soumis à
une passe de réfutation adverse**. Les six sont revenus `IMPRECIS` et l'axe *surface* — le
dénominateur — est revenu `REFUTE`. Les chiffres ci-dessous sont **les chiffres corrigés**, pas ceux
de la première passe.

---

## 1. Pourquoi la révision 3 est morte

La rév. 3 reposait sur une phrase : *« la certification devient un balayage, pas une adjudication »*.
Elle supposait qu'il existe une **trame sûre pour un membre dont on ignore le genre**. Il n'y en a
pas :

| Forme | Conséquence | Prouvé |
|---|---|---|
| `"^"` sur une **procedure**, 2 arguments registre | pointeur de résultat empilé, jamais dépilé → **gel** | 2026-08-14, `SayThis` |
| `"*"` sur une **function** | aucun pointeur passé, la fonction en écrit un quand même → **écriture mémoire arbitraire**, puis `error 1` sur toute requête de toute connexion **pendant 3 h 42, le processus toujours vivant et jamais redémarré** — pire qu'un crash, qui se soignerait en repartant | 2026-08-18, `GetUserList` |

Et le genre est précisément ce que le balayage devait découvrir. **Le raisonnement était circulaire.**

**Ce qui a réellement cassé le serveur**, établi en croisant le journal `FIVEINTERFACESERVER` et
l'enregistrement du run : non pas une trame, mais **cinq `function` appelées sous `"*"`** — rids 1060
`GetCompanyCount`, 1061 `GetUserName`, 1066 `GetChannelInfo`, 1067 `GetChannelList`, 1068
`GetUserList`. Les trois premières n'ont produit aucun symptôme. `GetUserList` est **l'endroit où le
dégât devient visible, pas celui où il commence**. Chaque écriture de 16 octets part à l'adresse que
`EDX` contenait par hasard : trois sont tombées sur de l'indifférent, la cinquième sur une structure
dont le répartiteur de requêtes a besoin.

> **On ne peut pas nommer « la fonction dangereuse ». Toute `"*"` sur une `function` est un billet de
> loterie.**

**Erreur de pilotage à l'origine, nommée pour qu'elle ne se répète pas :** le plan avait trié les
deux gardes en « la vraie » (`assertNotVariantOnVoidMember`) et « la convention »
(`assertNotVoidPush`), et autorisé un opt-in `probe` sur la seconde. Il y avait deux gardes parce
qu'il y a **deux modes de défaillance**. L'opt-in est ce qui a laissé sortir la trame. Il est
supprimé, et `assertNotVoidPush` est requalifiée **garde de sûreté**.

---

## 2. Le principe de la révision 4

> **Ce que le client fait en production est sûr par construction.** Il tourne tous les jours, avec
> très peu de crash. On ne le démontre pas : on l'enregistre. Ce que le client ne fait pas n'est pas
> dans le périmètre tant qu'une fonctionnalité ne le réclame pas.

Trois conséquences directes :

1. **On n'écrit plus de trame à la main.** On appelle des méthodes de session. Le séparateur,
   l'arité et les types viennent du code de production, qui les a déjà justes.
2. **Le dénominateur n'est plus « 217 membres RDO »** mais **les parcours utilisateur**. Un membre
   que personne n'appelle n'est pas une lacune de couverture : c'est du code mort ou une
   fonctionnalité à venir.
3. **L'archéologie Pascal est rétrogradée.** On la consulte pour *un membre à la fois*, quand on
   ajoute un **nouvel** appel RDO. C'est cinq minutes et c'est le seul endroit où elle sert encore.

---

## 3. Le dénominateur corrigé

Chiffres issus de l'axe *surface* **après réfutation** — la première passe annonçait 68/57 et se
trompait sur quatre points.

| | Nombre |
|---|---:|
| Méthodes publiques de `StarpeaceSession` qui mettent des octets RDO sur un socket | **67** |
| — hors d'atteinte d'un parcours utilisateur | 9 |
| **Atteignables par un parcours utilisateur** | **58** |
| Méthodes « métier » en **transport C** (HTTP/ASP), qui n'émettent aucune trame RDO | ~17 |
| Handlers WebSocket câblés | 76 |
| — jamais émis par le client | 7 |
| — orphelin d'UI (`REQ_POLITICS_DATA`) | 1 |

**Les 9 hors d'atteinte, nommées** (elles sortent du score, elles ne sont pas oubliées) :
`searchPeople` · `getBuildingDetails` · `getObjectRdoId` · `manageConstruction` ·
`getChatChannelInfo` · `setChatTypingStatus` · `saveDraft` · `executeRdo` · `getPoliticsData`.

**Quatre méthodes sont du code mort pur** — aucun appelant hors tests et hors harnais :
`searchPeople` (:619), `getBuildingDetails` (:3022), `getObjectRdoId` (:1398), `getMailAccount`
(:1120).

### Corrections apportées par la réfutation, à ne pas re-dériver

- **`getMailFolder` n'émet aucune trame RDO** : c'est un `fetch` HTTP sur `mail/MessageList.asp`
  (`mail-handler.ts:458-462`). Le domaine mail compte **5** émettrices, pas 6.
- **`getResearchInventory` ne touche jamais le socket `construction`** : elle est à 100 % du cacher
  sur le socket **`map`**. Seule `getResearchDetails` émet sur `construction`. Se tromper là ferait
  ouvrir le mauvais socket dans un parcours « recherche ».
- **`savePlayerPosition` et `releaseInspector` ne sont PAS mortes** : la première est appelée par
  `endSession()` (:2856) à chaque déconnexion, la seconde par `unfocusBuilding()` (:744),
  `cleanupWorldSession()` (:2744) et `destroy()` (:2909).
- **Nommage wire de la carte** : `loadMapArea` émet `ObjectsInArea` (:1232) et `SegmentsInArea`
  (:1253) — **pas** « GetObjects/GetSegments ». Ces noms partent sur le fil.
- **Ne pas compter comme émetteurs** : `ensureMailConnection` (:1091, garde) et `getObjectRdoId`
  (:1398, enveloppe).

---

## 4. La séquence opérationnelle — verdict

**Exigence du développeur :** authentification → choix du monde → choix de l'entreprise → connexion
au monde → exploration.

**Ordre réel, vérifié dans les deux chemins :**

> **authentification → choix du monde → connexion au monde → choix de l'entreprise → exploration**

Les deux étapes du milieu sont inversées par rapport à l'énoncé, **et c'est une nécessité, pas une
négligence** : la liste des entreprises est un *produit* de la connexion au monde — elle revient dans
la réponse de `REQ_LOGIN_WORLD` (`auth-handler.ts:112`, `resp.companies`). Le client Delphi de
référence fait de même. C'est `selectCompany` qui achève l'entrée en jeu (`EnableEvents`,
`PickEvent` ×2, `GetTycoonCookie` ×3, `ClientAware` ×2).

*Nuance technique établie par la réfutation :* la requête ASP qui sert la liste ne porte **aucun
identifiant de session** (`ClientViewId='0'`, `Logon='FALSE'`, `login-handler.ts:839-842`) et n'a
besoin que de `world.ip`, connu dès la réponse annuaire. Elle *pourrait* donc être obtenue plus tôt.
Mais la **sélection** ne peut pas remonter : `selectCompany` refuse sans `worldContextId` (:506-509).
Déplacer la liste divergerait du client de référence sans bénéfice. **On ne le fait pas.**

### La séquence est déjà respectée — mais rien ne la contraint

| Chemin | Étapes | Preuve |
|---|---|---|
| Navigateur | `REQ_AUTH_CHECK` :39 → `REQ_CONNECT_DIRECTORY` :68 → `REQ_LOGIN_WORLD` :95 → `REQ_SELECT_COMPANY` :154 | `src/client/handlers/auth-handler.ts` |
| Harnais | `connectDirectory` :188 → recherche du monde :189-192 → `loginWorld` :199 → `selectCompany` :207-220 → `runAll` :222-237 → `endSession` :240 | `src/tools/conformance/run.ts` |

Prouvé live le 2026-08-17 (`planitia-2026-08-17-console.log`, et l'enregistrement porte
`RDOMapSegaUser`, `RDOLogonUser`, `RDOQueryKey`, `AccountStatus`, `Logon`, `RegisterEventsById`,
`EnableEvents`, `GetTycoonCookie`, `ClientAware`).

**Ce qui manque, et qui est du travail réel :**

1. **Aucune assertion de phase.** Rien ne vérifie `getPhase() === WORLD_CONNECTED` ni
   `getCurrentCompany() !== null` avant de commencer à explorer.
2. **Faux positif en rejeu.** `run.ts:197` force `world.ip` à `127.0.0.1` → la liste HTTP revient
   vide → la garde de refus (`companies.length > 0`) est court-circuitée → `selectCompany` reçoit un
   **nom** là où il attend un **id** → `currentCompany` reste `null` **et le run passe quand même**.
   Le rejeu valide donc une session où aucune entreprise n'est sélectionnée. Le même trou avale
   silencieusement le piège connu des quotes mangées par npm.
3. **Aucune liste noire de cycle de vie.** Rien n'interdit à une suite de réémettre `Logon`,
   `AccountStatus`, `RegisterEventsById`, `Logoff`, `EnableEvents`, `ClientAware` **après**
   l'établissement de la session. Le balayage du 2026-08-18 l'a fait : `call Logon "*"` au rid 1089,
   après le `Logon` légitime du rid 1019.
4. **Le harnais court-circuite la couche WebSocket et le client.** Il instancie `StarpeaceSession`
   directement. Un crash dans un ws-handler, dans le client ou dans un store lui est **invisible**.
5. **Aucune suite ne rejoue un parcours.** Les 7 suites existantes appellent des méthodes isolées,
   dans un ordre défini par la suite — pas par l'utilisateur.

---

## 5. L'architecture : la capture pilotée par l'humain

> **RÉÉCRIT le 2026-08-18 en fin de session.** Cette section a changé deux fois dans la journée, et la
> version retenue est la troisième. L'historique est conservé plus bas parce que les deux options
> écartées le sont pour des raisons qui restent valables.

**Procédure complète : [doc/PROCESSUS-CAPTURE.md](../doc/PROCESSUS-CAPTURE.md).**

### La boucle retenue — proposition du développeur

> *« L'IA dicte le test, l'humain fait, l'IA enregistre. »*

1. **L'IA dicte** le parcours, geste par geste, dans un document sous `doc/parcours/`.
2. **L'humain joue** dans le vrai navigateur, contre la passerelle démarrée en mode capture
   (`npm run dev:record -- <nom>`).
3. **L'IA enregistre et convertit** : le NDJSON de la passerelle devient un scénario mock
   (`npm run capture:convert`), puis un test de non-régression hors ligne.

**Pourquoi c'est supérieur aux deux options écartées :** aucun code de test à écrire avant de jouer,
aucune précondition à deviner (l'interface les enchaîne d'elle-même), et **il est structurellement
impossible d'émettre une trame que le client ne produit pas**. C'était le défaut mortel du balayage.

La chaîne existait déjà entièrement — `LOG_JSON`/`LOG_FILE` → `parseNdjsonCapture` →
`buildRdoScenario` → `ReplayTransport` — et n'avait jamais servi pour notre propre client. Il ne
manquait que `npm run dev:record` (`scripts/dev-record.js`).

**Résultat mesuré, 2026-08-18 :** cinq captures, **1 383 échanges**, six sockets, **88 membres RDO**
dont huit poussées serveur. À comparer aux 22 appels des 7 suites écrites à la main.

### ⚠ La limite à connaître

Un scénario capturé détecte qu'**notre client a changé**. Il ne détecte pas que **le serveur a
changé**, puisqu'il rejoue des réponses enregistrées. Pour la dérive côté serveur il faudra, de temps
en temps, un run live — mais rarement.

Et **le rejeu répond par correspondance octet-identique** : toute trame non enregistrée reste sans
réponse, ce qui se lit comme un silence, donc comme un gel. Un enregistrement ne vaut que pour le
parcours exact qui l'a produit.

### Les deux options écartées, et pourquoi

**Écrire les parcours en `ctx.scenario` dans le harnais de conformité.** Défendable — le harnais
instancie le vrai `StarpeaceSession` et couvre 100 % de la surface du fil, puisque les ws-handlers
n'émettent rien. Écarté parce qu'il faut écrire le code du test avant de jouer, deviner les
préconditions (quel socket, quoi doit exister), et savoir quoi attendre. La capture obtient le même
résultat sans rien de tout ça. **Les 7 suites existantes restent en service** et gardent leur valeur.

**Playwright.** Écarté sur arbitrage explicite du développeur : *« session E2E RDO »* qualifie **RDO**,
pas l'interface, et **aucun test E2E d'UI dans ce chantier**. Il n'existe d'ailleurs aucune
infrastructure Playwright dans le code (`doc/E2E-STRATEGY.md:24`). Le pilotage humain du navigateur
donne le même fil sans rien construire.

### Étage 2 — la non-régression (hors ligne, rejeu)

Le scénario capturé est rejoué hors ligne (`replay-transport.ts`, mock server) et ne touche plus
jamais le serveur. C'est ce que le gate rejoue à chaque git quand la surface RDO a bougé.

⚠ **Un log de parcours ne doit PAS servir de `--recording` à l'étape rejeu du gate** — les deux usages
sont distincts.

## 6. Les parcours — la liste de travail

Chaque parcours est préfixé du **socle obligatoire** : authentification → monde → connexion →
entreprise. Il n'est pas contournable.

| # | Parcours | Domaines couverts | Statut |
|---|---|---|---|
| P0 | **Socle** — se connecter, restaurer la position | connexion, session | 7 suites existantes le font partiellement |
| P1 | **Explorer la carte** | carte, caméra, zones, surface | couvert (suite `map`) |
| P2 | **Inspecter un bâtiment** | focus, inspecteur, cacher | couvert (`focus`, `inspector`) |
| P3 | **Discuter** | chat | couvert (`chat`) |
| P4 | **Lire son courrier** | mail | couvert (`mail`) |
| P5 | **Construire** | `NewFacility` (`placeBuilding`) sur le socket `construction` | ✅ **capturé 2026-08-18** — `construire-captured.scenario.ts`, 125 échanges, 49 membres. Le catalogue s'est révélé être du **transport C**, pas du RDO |
| P6 | **Démolir puis reconstruire un parc au même endroit** | `RDODelFacility` (socket `construction`), `NewFacility` (socket `world`) | ✅ **capturé 2026-08-18** — protocole du développeur, les deux gestes acceptés (`res="#0"`) |
| P7 | **Gérer une installation** | `Name=` (renommage), `RDOStartUpgrades`, `RDOStopUpgrade` | ✅ **capturé 2026-08-18** (`parcours-enchaine`, `communication`) |
| **P8** | **Service public — bascule de rôle, zonage, routes** | `DefineZone`, `CreateCircuitSeg`, `WipeCircuit`, **+ la branche `switchCompany`** | ✅ **capturé 2026-08-18** — rôle Maire de Helartia porté sur `SPO_test3`, plus besoin d'un second compte. `service-public-captured.scenario.ts`, 152 échanges, **deux connexions monde dans une session** |
| P10 | **Connexions et approvisionnement** | `FindSuppliers`, `RDOConnectInput`, `GetInputNames` | ⚠ **capturé, refus hors de portée** — a révélé **OB-1** |
| P11 | **Politique** | `politicsVote`, `politicsLaunchCampaign` | ⏸ **borné par l'état du monde** — pas d'élection ouverte, mauvaise période. À rejouer un jour propice |
| P12 | **Recherche / inventions** | `GetSubObjectProps`, `RDOQueueResearch` | ✅ **capturé 2026-08-18** |
| **P13** | **Communication, favoris, gestion** | **`SayThis`**, `RDOFavoritesGetSubItems`, `RDOStartUpgrades`/`RDOStopUpgrade`, `DeleteMessage` | ✅ **capturé 2026-08-18** — a révélé **OB-10** (favoris en lecture seule) et **OB-11** (pas de refresh mail) |
| — | **Transport C** (banque, profil, P&L, templates, menu recherche) | ~17 méthodes HTTP/ASP | **catégorie séparée** — ne peut pas casser le serveur RDO, ne doit pas polluer le score |

**Le protocole parc du développeur survit intact** et devient P6 : démolir un parc, le reconstruire au
même endroit — la démolition **produit** le `(x, y)` que la construction consomme, ce qui règle le
choix des coordonnées. Le gabarit existe déjà (`sweep.ts:549-639`) et pilote de vraies méthodes via
`ctx.scenario` : **le récupérer avant de supprimer le fichier.**

### La forme d'écriture, imposée

`ctx.scenario(member, session => …)` + `ctx.state`/`need()` + `derived()`. Rien d'autre. Les 7 suites
existantes ne contiennent **aucun** `packet`, `ctx.emit` ni `ctx.push` — 22 appels `ctx.scenario`
répartis MAP 4, FOCUS 2, INSPECTOR 7, CHAT 4, MAIL 3, POLITICS 1, RESEARCH 1. C'est le gabarit.

Toutes les trames fabriquées à la main vivent dans `suites.ts` (suites `types`, `separators`,
`errors`, `lifecycle`, `reads`, `mutations`) et dans `sweep.ts`. **Elles ne servent plus de modèle.**

---

## 7. Ce qui meurt

**Quatre fichiers, tous non suivis par git — suppression propre, aucun historique à réécrire :**
`sweep.ts`, `sweep-plan.ts`, `sweep.test.ts`, `sweep-plan.test.ts` — 2 142 lignes, 82 tests.

**Deux fichiers de production à décrocher :** `suites.ts` (import :28, étalement `...SWEEP_SUITES`
:397, JSDoc :384-393) et `cli.ts`.

**À conserver intact :**

- `rdo-request-guards.ts` en entier — `FORBIDDEN_MEMBERS` (:132), `assertMemberNotForbidden` (:160),
  `VOID_MEMBERS` (:39), `assertNotVariantOnVoidMember` (:183), `assertNotVoidPush` (:238) ;
- `halt.ts` et l'attribution (`HaltRecord`, `onHalt`, `formatSilenceAttribution`) ;
- l'enregistreur (`transport.ts`), le rejeu (`replay-transport.ts`), le diff de baseline, le gate ;
- `--allow-variant-on-procedure` : il garde encore une étape réelle
  (`separators/variant-on-zero-param-procedure`, adjugée par capture live le 2026-08-16). **Réécrire
  son commentaire**, pas le supprimer.

**Avant de supprimer :** `sweep.test.ts:220-221` porte le seul verrou de régression nommé contre la
trame qui a cassé la production (`has no sweep-void suite`). Il faut son **remplaçant en formulation
positive** : parcourir `SUITES` et refuser toute étape déclarative émettant `"*"` sur un membre
absent de `VOID_MEMBERS`.

`DEFAULT_FRAME_BUDGET` revient de 3 000 à une valeur dimensionnée pour un parcours (quelques
dizaines de trames).

**Les deux artefacts de preuve du 2026-08-18** (`planitia-2026-08-18-sweep.ndjson` et
`-run.json`) sont **conservés** : c'est le dossier de l'incident.

---

## 8. Les garde-fous à construire

Par ordre de valeur, et le premier est celui qui a manqué ce matin.

1. **Détecteur de dégradation globale.** Une réponse `error 1` est un `outcome` avec `response` non
   nulle : elle produit un `FAIL` par étape et **n'interrompt rien**. Seul `response === null` coupe
   (`runner.ts:341`). Il faut : *N réponses `error N` consécutives → arrêt*. Ce matin le serveur
   répondait `error 1` à tout et le harnais a continué.
   ⚠ **Calibration honnête : ça n'aurait pas empêché l'incident.** Le dégât était fait par la
   première trame. Ça réduit le rayon, ça ne protège pas de la trame qui casse.
2. **Sonde pré-vol avant le login live.** Ouvrir un socket, `idof InterfaceServer`, un `get` trivial,
   et **refuser de démarrer** si la réponse est `error 1` ou un timeout. Évite de s'attribuer
   l'incident d'un tiers — c'est déjà arrivé deux fois en quatre jours.
3. **Assertion de phase** avant l'exploration : `WORLD_CONNECTED` et `currentCompany` non nul.
4. **Colmater le faux positif du rejeu** : refuser le run quand la liste d'entreprises est vide, au
   lieu de laisser passer.
5. **Liste `SESSION_LIFECYCLE_MEMBERS`** dans les gardes : `Logon`, `AccountStatus`,
   `RegisterEventsById`, `SetLanguage`, `Logoff`, `EnableEvents`, `ClientAware`, `ClientNotAware`,
   `RDOOpenSession`, `RDOEndSession` — interdits après l'établissement de la session.
6. **Écrire `--record` dans un `finally`.** Aujourd'hui l'enregistrement est écrit à `run.ts:283-286`,
   après la corrélation des logs et le diff : **un échec au login détruit la preuve de l'incident.**
7. **Promouvoir les signatures dures des logs serveur en échecs** : `Malformed query in
   TRDOQueryServer.ExecQuery`, `Access violation`. Aujourd'hui elles sont affichées, pas fatales.
8. **La ligne dans `spo_session.ts`** (fichier protégé) pour que la passerelle refuse aussi les sept
   `FORBIDDEN_MEMBERS` — la garde existe et n'est branchée que sur l'outil de test. **Au même
   endroit**, corriger le commentaire `:2350` qui dit encore *« the guard protects consistency, not
   the server »* : c'est le cadrage retiré le 2026-08-18, et il est sur le chemin de production.

---

## 9. Les lots

| # | Lot | Contenu | État |
|---|---|---|---|
| **R1** | **Nettoyage** | Supprimer le balayage, décrocher `suites.ts`/`cli.ts`, écrire le verrou de remplacement, ramener le budget de trames | ✅ **livré 2026-08-18** |
| **R2** | **Garde-fous** | Les 8 points du §8 | ✅ **livré 2026-08-18** — 3 des 8 ont demandé une correction de fond, dont le §3.7 qui aurait été un no-op |
| **R3** | **Socle de connexion** | Suite `connexion` en tête de `SUITES`, qui observe la séquence sans l'émettre | ✅ **livré 2026-08-18** — `connection-suite.ts` |
| **R4** | **Les parcours** | ~~Écrire les domaines non couverts en `ctx.scenario`~~ → **remplacé par la capture navigateur** (§5) | ✅ **9 parcours capturés 2026-08-18** |

CR : [lot-R1-R2-R3.md](lot-R1-R2-R3.md). Le gabarit de séquence mutative récupéré du balayage avant
sa suppression est archivé dans [gabarit-parcours-parc.md](gabarit-parcours-parc.md).

**Ce qui reste, et rien n'est bloqué :**

- **`RDODisconnectInput`** — son jumeau `RDODisconnectOutput` est capturé et passe par le même code.
- **`RDOVoteOf`**, **`GetAttachment`** — attendent une élection ouverte et un courrier avec pièce
  jointe. Bornés par l'état du monde, pas par notre code.
- **`GetChannelInfo`**, **`Save`** (brouillon mail) — deux des sept handlers vivants qu'aucune
  interface n'appelle (**OB-8**). Pas capturables tant que l'UI ne les expose pas.
- **Les défauts trouvés** — OB-1, OB-11 et les lacunes d'outillage :
  [doc/BACKLOG-OPEN.md](../doc/BACKLOG-OPEN.md).

**Hors périmètre, décidé le 2026-08-18 :** aucun test E2E d'interface (§5).

---

## 10. La boucle de crash

**Ça marche → on enregistre. Ça casse → on identifie.**

La partie « on identifie » est la seule chose de la campagne précédente qui ait payé, et elle est
**prouvée en conditions réelles** : le 2026-08-18, l'attribution a nommé la trame en secondes, et le
recoupement avec `http://158.69.153.134/logs/` a pris trois requêtes.

Outillage, conservé tel quel : `HaltRecord` + enregistreur de fil + logs serveur + `.rdo-live/HALT`
comme frein **manuel** (décision développeur du 2026-08-18, motifs dans `halt.ts:8-32` — **ne pas
réintroduire de déclencheur automatique**).

---

## 11. État au 2026-08-18, fin de session

**Rien n'est bloqué.** `planitia` a été redémarré ce jour vers **14:05:30 UTC** (frontière datée :
dernière `Malformed query` à 14:05:23, marqueur `GM Cannot connect` à 14:06:02, logons propres
ensuite). `.rdo-live/HALT` est **levé**, et **cinq captures live** ont été jouées depuis sans
incident.

*Une révision antérieure de cette section annonçait « planitia est à terre, HALT est posé ». C'était
vrai à l'heure de rédaction, faux deux heures plus tard.*

**Arbre :** `npm run typecheck` vert, 15 suites / 272 tests sur `mock-server`. **Rien n'est commité.**

---

## 12. Ce que je n'ai pas vérifié

Par honnêteté, et parce que la rév. 3 est morte d'une prémisse non testée. **Deux points de la
rédaction initiale sont depuis résolus, et sont conservés barrés plutôt que supprimés :**

- **La divergence `DAPort` / `DSArea`** — TOUJOURS OUVERTE. Le WebClient lit `DAPort` là où
  `doc/rdo-protocol-architecture.md:667` documente `DSArea`. Confirmé sur le fil **deux fois** (rid
  1011 du 2026-08-17, puis la capture `construire` du 2026-08-18). Divergence réelle, non documentée,
  **à arbitrer**.
- **Que la page ASP des entreprises tolère d'être interrogée sans session préalable** — toujours non
  vérifié, et toujours sans objet tant qu'on ne déplace pas la liste (on ne le fait pas).
- ~~Que `SPO_test3` possède un parc~~ → **RÉSOLU.** `DissSmallPark` en (982, 1014). P6 l'a démoli
  puis reposé au même endroit, les deux gestes acceptés (`res="#0"`).
- ~~Que les *purposes* de socket du rejeu couvrent tous les sockets qu'un parcours ouvre~~ →
  **RÉSOLU en pratique.** Les cinq captures traversent **six sockets** — `directory_auth`,
  `directory_query`, `world`, `map`, `mail`, `construction` — et le convertisseur les a tous traités
  sans perte.

---

## 13. Méthode

Recherche parallèle sur six axes (connexion, surface, couverture, E2E, retrait, enregistrement),
12 agents, 1,31 M tokens, chaque axe suivi d'une **passe de réfutation adverse** dont la consigne
était de réfuter, pas de confirmer. Verdicts : `surface` **REFUTE** (quatre conclusions fausses,
totaux corrigés), les cinq autres `IMPRECIS`.

**Les arbitrages et les vérifications finales sont les miens.** La séquence de connexion a été relue
directement dans `run.ts` et `auth-handler.ts`, et le mécanisme de l'incident directement dans
`RDOObjectServer.pas`.
