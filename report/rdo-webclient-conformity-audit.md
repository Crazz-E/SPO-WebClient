# Audit de conformité RDO du WebClient — implémentation & gestion des sessions

> **Statut : INTÉGRÉ (2026-07-03)** — instantané daté, conservé comme piste d'audit (grille 35 règles,
> V1-V5/P1-P6, annexe Tier-4). Les décisions durables sont canoniques : divergences acceptées D1-D4 →
> [doc/rdo-session-lifecycle.md §9](../doc/rdo-session-lifecycle.md) ; erratum `RECONNECT_MAX_RETRIES=23` →
> intégré docs + skill `rdo-network-resilience` ; P6 (tests contre la vraie session) → résolu Tier 4.

> **Date :** 2026-07-02 · **Branche :** `fix/rdo-conformity-tier3` · **Référentiel :** `doc/rdo-protocol-architecture.md` + `doc/rdo-session-lifecycle.md` (vérifiés ligne à ligne contre le source Delphi et les captures le même jour)
> **Méthode :** 3 auditeurs indépendants (émission fil / lecture-parsing / sessions-timers), 35 règles, chaque violation re-vérifiée à la main dans le code avant publication.
> **Sévérité :** CRITIQUE = corruption/crash serveur · HAUTE = risque réel côté serveur ou passerelle · MOYENNE = divergence comportementale vs client legacy · BASSE = impureté tolérée par le serveur.

## Score global

| Verdict | Nombre | Règles |
|---|---|---|
| ✅ CONFORME | **24 / 35 (69 %)** | W1-W5, W7-W9 · R1-R4, R7-R10 · S2-S4, S8-S10, S11c-d |
| 🟡 PARTIEL | 6 | W6, W10, S1, S6, S7, S12 |
| 🔴 VIOLATION | 5 | R5, R6, S5, S11a, S11b |

**Score pondéré (partiel = ½) : ≈ 77 %. Objectif 100 % : NON atteint — 5 violations et 6 partiels à traiter.**

Aucune violation CRITIQUE : les formes qui endommagent le serveur (`"^"` sans RID, `sendRdoRequest`+`"*"`, écritures UTF-8, retry de mutations, RDOEndSession vers l'IS, KeepAlive sur la racine cacher, CheckNewMail(#0)) sont **toutes structurellement impossibles** dans le code actuel — les correctifs Tier 1-3 tiennent.

---

## 🔴 Violations (5)

### V1 — HAUTE · Le poll ServerBusy lit le booléen `#-1` de travers
`src/server/spo_session.ts:1724` : `this.isServerBusy = busyValue == '1';`
Le serveur encode true en `#-1` (règle §2.2 : tout ordinal non nul = vrai). `'-1' == '1'` est faux → **un serveur occupé est lu comme libre** et le WebClient continue de lui envoyer des requêtes au lieu de les mettre en tampon. C'est exactement l'inverse du rôle protecteur du poll. Le canal push (`ModelStatusChanged`) masque partiellement le défaut, mais le poll — le mécanisme de secours legacy — est inopérant. Le reste du code fait correctement `=== '1' || === '-1'` (`building-management-handler.ts:29`, `session-utils.ts:121`).
**Correctif :** `busyValue !== '0'` + test sur la vraie session.

### V2 — HAUTE · Une exception dans un handler de push abat toute la passerelle
`spo_session.ts:1465-1468` (`socket.on('data') → framer.ingest → messages.forEach(processSingleCommand)`) : **aucun try/catch** sur la chaîne data → `processSingleCommand` → `dispatchPush`. Un push inattendu qui fait lever une exception synchrone remonte jusqu'à `process.on('uncaughtException')` → `shutdown()` (`service-registry.ts:522-524`) : **toutes les sessions de tous les joueurs tombent**, pas seulement la session fautive.
**Correctif :** try/catch par message dans les deux data-handlers (`:1467` et le chemin mail `:1522`), log + continue.

### V3 — HAUTE · `REQ_RDO_DIRECT` sans limitation de débit
`src/server/ws-handlers/misc-handlers.ts:147-177` : le navigateur peut émettre du RDO arbitraire (`targetId`/`member`/`args` libres, whitelist de verbes seulement) **sans aucun throttle** → un client bogué ou malveillant peut inonder le serveur legacy partagé à la vitesse du WebSocket. (Risque C9 du rapport réseau, toujours ouvert.)
**Correctif :** rate-limit (ex. token bucket 5 req/s, burst 10) + test.

### V4 — MOYENNE · Reconnexion déclenchée par une erreur RDO (pas par un close socket)
`spo_session.ts:2007-2010` : `executeWithRetry` appelle `attemptWorldReconnect()` quand `classifyRdoError` renvoie `connectionDegraded` (errSendError 10 / errReceiveError 11). Règle vérifiée dans le legacy : la reconnexion est **uniquement** pilotée par le close socket (`ReportCnxFailure` est un no-op, `ServerCnxHandler.pas:3394-3405`) ; si le transport est réellement mort, l'événement `close` arrive de toute façon. Ce chemin erreur→reconnexion n'existe pas chez le client de référence et peut déclencher des re-Logon superflus (sérialisés ~10 s sur le `fServerLock` de l'IS).
**Correctif :** supprimer l'appel `:2008-2010` (garder le retry GET simple).

### V5 — MOYENNE · Aucun jitter sur les reconnexions (troupeau synchronisé)
`src/client/handlers/reconnect-utils.ts:12` : délais **fixes** `[2,4,8,16,30]s` puis 30 s ; côté passerelle `attemptWorldReconnect` : 5/10/20 puis 15 s fixes. Après une coupure commune (redémarrage serveur), tous les clients retentent aux mêmes instants → pics synchronisés sur le `fServerLock`.
**Correctif :** jitter ±25 % sur chaque délai (client + passerelle) + tests.

---

## 🟡 Partiels (6)

| # | Sévérité | Constat | Correctif proposé |
|---|---|---|---|
| P1 (R6b) | MOYENNE | **`AnswerStatus` jamais répondu** : `handleServerRequest` (`spo_session.ts:2241-2256`) ne répond qu'à l'`idof` inverse. Un push avec RID `C <id> sel … call AnswerStatus "^"` (heartbeat serveur, doc §6.3) expire côté serveur. | Répondre `A<id> res="#0"` aux requêtes serveur avec RID non-idof. |
| P2 (S1) | BASSE | **`RDOEndSession` émis en fire-and-forget sans RID** (`login-handler.ts:200,237,284`) alors que la capture montre le client legacy l'envoyer **avec** RID et attendre `A<id> ;` (capture :16-17). Wire-legal, socket fermé juste après (TCP livre la frame avant FIN) — divergence d'octets, pas de risque serveur identifié. | Décision : accepter (documenter) ou introduire un envoi void-avec-ack dédié (nécessite d'assouplir `assertNotVoidPush` pour ce seul cas). |
| P3 (W10) | MOYENNE | **RDO concurrent sur le socket cacher** : `building-details-handler.ts:1088,1211` pipeline jusqu'à 3 requêtes simultanées sur l'unique socket `map` (règle projet : strictement séquentiel ; le legacy obtient son parallélisme via un POOL de connexions, pas en multiplexant un socket). Légal sur le fil (corrélation RID), borné à 3, lectures seules — toléré par le pool 16 threads du cacher. | Décision : sérialiser (inspecteur ~3× plus lent) ou documenter l'exception bornée. |
| P4 (S6) | — | Même racine que V1 (parsing du poll). | Couvert par V1. |
| P5 (S7) | BASSE | **TimeoutCategory presque jamais spécifiée** : `LoginContext.sendRdoRequest` est 2-args → tout le login/directory/mail part en NORMAL=180 s (le legacy utilise 20 s côté Directory). Conservateur, aucun risque de tempête — mais la règle « chaque appel spécifie sa catégorie » n'est pas appliquée. | Ajouter le paramètre catégorie au `LoginContext` et passer les ops Directory en ~20 s. |
| P6 (S12) | HAUTE (confiance) | **Les tests reconnect/busy/timeout valident des mocks, pas la prod** : `world-reconnect.test.ts:66` code en dur `RECONNECT_MAX_RETRIES = 3` dans sa propre classe mock alors que la prod vaut **23** ; `server-busy-reconnect` et `timeout-state-machine` testent aussi des réimplémentations parallèles. Fausse confiance sur les constantes réelles. | Réécrire ces suites pour piloter la vraie `StarpeaceSession` (comme `logoff.validation` et `keepalive.validation` le font déjà). |

---

## 📝 Erratum documentaire (corrigé ce jour)

L'audit a réfuté une affirmation de **notre propre doc** : `rdo-session-lifecycle.md` §4.5 et le skill `rdo-network-resilience` §8 annonçaient `RECONNECT_MAX_RETRIES = 3`. Le code réel (`spo_session.ts:335-341`) implémente **délibérément** deux phases : 3 tentatives rapides (5/10/20 s) + 20 lentes (15 s) = **23 tentatives bornées sur ~5,5 min**, puis abandon. Le legacy retente à l'infini (boucle 100 ms) — 23 borné est donc **plus doux** que la référence : c'est la doc qui était fausse, pas le code. Docs et skill corrigés ; le commentaire code (« Max 3 retries », `:1552`) et le test mock restent à aligner (P6).

## Notes basses / hygiène (aucun risque immédiat)
- `handleIncomingMessage` mort avec split naïf sur `;` (`spo_session.ts:2128-2145`) — à supprimer (piège de copier-coller).
- Réponse busy malformée `Aerror 17` (sans RID ni `;`) : pas de crash, mais elle colle à la frame suivante et fait expirer une requête légitime — récupération ciblée possible dans `RdoFramer`.
- `no-raw-rdo-writes.test.ts:43` ne matche que la variable littérale `socket` — durcir la regex.
- Le poll ServerBusy contourne `assertNotVoidPush` (sûr aujourd'hui : GET codé en dur).
- Frame `A${rid} objid=…` construite à la main (`spo_session.ts:2246`) — seul cas, aucun builder de frames `A` n'existe ; octets conformes à la capture.
- Divergences bénignes du login : lecture `DSArea` absente, `DAPort` ajoutée, `GetCompanyCount` supplémentaire ; poll `PickEvent` non implémenté (moins de charge que le legacy).

## Vérifié conforme (à ne PAS « corriger »)
Latin-1 partout (`writeRdoFrame`, ingest `latin1`) · verbes capture-first (`get RDOOpenSession`/`Logoff`/`ServerBusy`) · booléens émis `#-1`/`#0` (chat `#1`/`#0` = non-divergence documentée) · typage `#`/`%`/`@` des commandes sensibles · framing quote-aware + coalescence · ack vide `A<id> ;` = succès · grammaire d'erreurs 3 formes · logoff conforme (`ClientNotAware` → `get Logoff` 5 s → close, idempotent, `loggedOff` avant close) · séquence login 18 étapes ordonnée · KeepAlive 60 s sur l'objet temporaire uniquement · mail `LogServerOn`→`CheckNewMail` gardé contre #0 · pas de retry des mutations CALL/SET · pool mondial inerte (0 socket) · stop@4 du poll sans reconnexion.

## Plan pour atteindre 100 %

| Priorité | Items | Fichiers | Nature |
|---|---|---|---|
| **P0 — protection serveur/passerelle** | V1, V2, V3, V4, V5 | `spo_session.ts`, `misc-handlers.ts`, `reconnect-utils.ts` | Code + tests (≥93 %) |
| **P1 — conformité protocole** | P1 (AnswerStatus), P2 & P3 (décisions), récupération `Aerror 17` | `spo_session.ts`, `login-handler.ts`, `rdo.ts` (protégé — discussion requise), `building-details-handler.ts` | Code + tests / décisions |
| **P2 — confiance & hygiène** | P5, P6, suppression code mort, durcissement garde-fous, alignement commentaire `:1552` | tests + divers | Tests/refactor |

Après P0-P2 et re-audit : score attendu 100 % (avec P2/P3 soit corrigés, soit documentés comme divergences acceptées wire-legal). Gate final : E2E (`/e2e-test`) contre le serveur réel.

---

## Annexe — Statut d'implémentation (2026-07-02, branche `fix/rdo-conformity-tier4`)

**TOUS les items P0/P1/P2 sont implémentés.** Arbitrages développeur : P2 (RDOEndSession sans RID) et P3 (cacher ×3) = **divergences acceptées**, consignées dans `doc/rdo-session-lifecycle.md` §9 + commentaires code aux sites concernés.

| Item | Statut | Implémentation | Test |
|---|---|---|---|
| V1 poll busy `#-1` | ✅ corrigé | `isTrueOrdinal()` (`rdo-helpers.ts`), poll `spo_session.ts` | `tier4-conformity.validation` + `server-busy-reconnect` (session réelle) |
| V2 push toxique | ✅ corrigé | try/catch par frame (2 data handlers) | `tier4-conformity.validation` |
| V3 throttle REQ_RDO_DIRECT | ✅ corrigé | token bucket 10/burst, 5/s (`misc-handlers.ts`) | `misc-handlers.test` |
| V4 reconnect-sur-erreur | ✅ corrigé | appel supprimé dans `executeWithRetry` | `tier4-conformity.validation` |
| V5 jitter | ✅ corrigé | ±25 % passerelle (`spo_session.ts`) + client (`reconnect-utils.ts`) | `reconnect-utils.test`, `world-reconnect` |
| P1 AnswerStatus | ✅ corrigé | `handleServerRequest` répond `A<rid> res="#0"` | `tier4-conformity.validation` |
| P1 `Aerror 17` | ✅ corrigé | récupération `RdoFramer` + classification parseur + bascule busy (`rdo.ts` protégé — modif approuvée via plan) | `rdo.test`, `tier4-conformity.validation` |
| P2 RDOEndSession sans RID | 📝 divergence acceptée D1 | commentaire aux 3 sites (`login-handler.ts`) | — |
| P3 cacher ×3 | 📝 divergence acceptée D2 | commentaire `batchedParallel` | — |
| P5 catégories timeout | ✅ corrigé | catégorie `DIRECTORY` 20 s (legacy `DSProxy.TimeOut`), appliquée aux 12 appels directory | `timeout-state-machine` (défaut 180 s) |
| P6 tests-mocks | ✅ corrigé | `world-reconnect`, `server-busy-reconnect`, `timeout-state-machine` réécrits contre la **vraie** `StarpeaceSession` (constantes réelles : 3+20=23, stop@4, 180 s) | 22 tests |
| Hygiène | ✅ | `handleIncomingMessage` mort supprimé, commentaires « Max 3 » corrigés, garde reformulée (convention), `no-raw-rdo-writes` durci (tout identifiant), en-tête keepalive corrigé (TTL 5 min) | `no-raw-rdo-writes` |

Erratum documentaire appliqué (docs + skill) : politique réelle de reconnexion = 23 tentatives bornées (3 rapides + 20 lentes), jitterées — plus douce que la boucle infinie 100 ms du legacy.

**Score post-correctifs : 35/35 règles = conformes ou divergences acceptées documentées → 100 %** (au sens du log de décision §9 : aucune violation, aucune divergence non tracée). Gate final restant : E2E (`/e2e-test`, invocation développeur) contre le serveur réel, comme pour les tiers 1-3.
