# Plan d'action — remédiation de l'audit RDO 2026-08-14

> Source : [rdo-audit-2026-08-14.md](rdo-audit-2026-08-14.md). Ce document est le plan
> d'exécution : découpage en lots, affectation aux agents, ordonnancement, portes de décision.
> **Statut : PLAN VALIDÉ, portes D1 et D2 ouvertes le 2026-08-14** — exécution agentique non
> encore lancée.

---

## 1. Ce que le rapport donne, ce qu'il ne donne pas

**Actionnable directement (14 constats localisés au fichier:ligne)** : P-C1, P-H1, P-H2, P-H3,
O-H1, O-H2, O-H3, M-A à M-E, plus les 2 angles morts de tests du §7 et l'inversion doc §8.5.

**Trou identifié** : le §1 chiffre « 6 MOYENNES + 6 BASSES protocolaires, 1 MOYENNE + 6 BASSES
opérationnelles » (19 constats) mais **ne les énumère nulle part**. Seul `P-L1` (résultat de
`RegisterEventsById` jeté) est nommé, en passant. Ces 19 constats sont dans les rapports des
3 sous-audits, non conservés. **Le lot 0 doit les reconstituer avant de pouvoir planifier le
point 7 de l'ordre de traitement du §8.**

---

## 2. Contraintes structurantes

### 2.1 Fichiers protégés (CLAUDE.md — « modifier sans discussion » interdit)

| Fichier | Lots concernés | Nature du changement |
|---|---|---|
| `src/shared/rdo-types.ts` | **L1** (codec CP1252 dans `RdoValue.format()`), **L2** (regex identifiants dans `RdoCommand`) | invariant de couche protocole, impacte **tout** appel RDO |
| `src/server/rdo.ts` | **L2** (`RdoProtocol.format`, l.358-364) | idem |
| `src/server/spo_session.ts` | **L3** (`packet.rid` l.2272) | 1 ligne, chirurgical |
| `src/__fixtures__/*` | **L7** si des octets de référence changent | à éviter |

→ **Porte D1** : approbation développeur obligatoire avant L1 et L2.

### 2.2 Serveur Delphi partagé de production

U1 (sonde `call SayThis "^"`) et surtout **U2 (répétition ×100)** touchent un serveur partagé.
Le rapport lui-même exige l'accord explicite du développeur pour U2.
→ **Porte D2**.

### 2.3 Collisions de fichiers entre lots (interdit le parallélisme naïf)

- **L1 ∩ L2** sur `rdo-types.ts` → **sérialisés**, jamais en parallèle.
- **L3 ∩ L4** sur `spo_session.ts` → L3 (1 ligne) passe **avant** L4.
- **L2 ∩ L5** : conceptuellement liés (M-D alimente P-H3) mais fichiers disjoints
  (`rdo-types.ts`/`rdo.ts` vs `building-property-handler.ts`) → parallélisables **avec contrat
  d'interface figé d'avance** : L2 exporte `assertValidRdoIdentifier()`, L5 la consomme.
- Tous les lots d'implémentation en parallèle → `isolation: worktree`, merge séquentiel.

### 2.4 Découplage P-C1 / P-H2 (décision de plan, écart assumé vs §8 du rapport)

Le rapport traite P-C1 et P-H2 comme un seul correctif (« même point d'étranglement »). C'est vrai
pour le *lieu*, faux pour les *dépendances* :

- **P-C1 (injection)** ne dépend d'aucune question ouverte : tout point de code > 0xFF → `?`.
  Livrable immédiatement, ferme la seule faille exploitable depuis une saisie utilisateur.
- **P-H2 (bande 0x80–0x9F)** dépend de **U3** (la code page de production est-elle CP1252 ?),
  donc d'un accès live.

→ L1 livre **la table de transcodage comme donnée injectable** : le squelette (chokepoint,
repli `?`, tests) part tout de suite ; la table 0x80–0x9F est basculée en une ligne quand U3
répond. Aucune reprise de l'architecture.

---

## 3. Découpage en lots

Légende agent : **impl** = agent d'implémentation (worktree, droits d'écriture, skills imposées) ·
**audit** = agent lecture seule.

### Phase 0 — Pré-vol (lecture seule, 3 agents en parallèle, aucune porte)

| Lot | Contenu | Agent | Livrable |
|---|---|---|---|
| **L0-a** | Reconstituer les 19 constats MOYENS/BAS non énumérés (§1) : re-passe ciblée protocole + opérationnel, en excluant les 14 déjà traités | `rdo-conformity-auditor` | tableau id/sévérité/fichier:ligne/correctif, annexé au rapport |
| **L0-b** | Cartographier la surface d'entrée texte utilisateur → fil RDO (chat, mail sujet/corps, noms de compagnie, recherche, cookies) : liste exhaustive des points d'entrée à couvrir par les tests de L1 | `Explore` | liste fichier:ligne des call-sites |
| **L0-c** | Rédiger le **protocole des sondes live** U1/U3/U4/U6 (trames exactes, oracle attendu, critère d'arrêt, plan de repli) — **rédaction seule, aucune exécution** | `rdo-conformity-auditor` | `report/campaign/sondes-live-U1-U6.md` |

### Phase 1 — Protocole, sérialisée (porte D1 requise)

| Lot | Contenu | Fichiers | Dépendances |
|---|---|---|---|
| **L1** | **P-C1 + squelette P-H2.** Nouveau `src/shared/cp1252.ts` (encodeur, repli `?`, table injectable). Branchement au chokepoint unique. Tests : `Ģ Ļ Ĭ 😀 “ €` + paires de substitution + non-régression `é ü ñ` + un test d'injection bout-en-bout depuis `sendChatMessage` | `shared/cp1252.ts` (neuf), `shared/rdo-types.ts` 🔒, `server/rdo-helpers.ts` | D1, L0-b |
| **L2** | **P-H3.** `assertValidRdoIdentifier()` = `/^[A-Za-z_][A-Za-z0-9_]*$/`, imposée dans `RdoCommand.call/get/set` **et** `RdoProtocol.format`. Erreur typée (`error-codes.ts`), pas de `throw` nu. Liste blanche à la frontière WS | `shared/rdo-types.ts` 🔒, `server/rdo.ts` 🔒, `ws-handlers/building-handlers.ts` | D1, **après L1** |

Agent : **impl** unique pour L1 puis L2 (même fichier protégé, contexte partagé, évite deux
relectures du même invariant). Skills imposées : `rdo-conformity`, `code-guardian`, `spo-testing`.

### Phase 2 — Opérationnel + mutations (parallélisable, sans porte)

| Lot | Contenu | Fichiers | Agent |
|---|---|---|---|
| **L3** | **O-H3.** `packet.rid` → `packet.rid !== undefined`. Test : requête serveur à rid 0 dispatchée. Vérifier qu'aucun autre `if (…rid)` falsy ne traîne dans le fichier | `spo_session.ts` 🔒 (1 ligne) | impl-A |
| **L4** | **O-H1 + O-H2.** Supprimer le chemin de reconnexion légère ; sur `close` du socket monde → toujours `fullWorldRelogin`. Purger l'usage de `ctx.rdoCnntId` hérité. Tests de reconnexion (mock) + vérifier que `EVENT_WORLD_RECONNECTED` n'est plus émis sans re-`Logon` | `session/login-handler.ts` (979-1038), `spo_session.ts` | impl-A, **après L3** |
| **L5** | **M-B, M-E, M-C, M-D.** Lire et propager les codes retour ; supprimer le repli `readValues[0] \|\| value` ; honorer `allSalaries` (ou retirer le drapeau mort) ; liste blanche des `propertyName`, suppression du repli `call` verbatim | `building-management-handler.ts`, `building-property-handler.ts`, `template-groups.ts`, `property-utils.ts` | impl-B |
| **L6** | **M-A.** `placeBuilding` : trouver la vraie source de l'id posé (relecture de zone ou push) — **investigation d'abord, correctif ensuite**. Si aucune source fiable n'existe, retourner `null` explicitement + le documenter, plutôt qu'un faux succès | `building-templates-handler.ts` (535-544) | impl-C |

L5 consomme `assertValidRdoIdentifier` de L2 → si L2 est bloqué par D1, L5 livre sa liste blanche
locale et le branchement se fait au merge.

### Phase 3 — Tests & doc (après phases 1-2)

| Lot | Contenu | Agent |
|---|---|---|
| **L7** | **Angles morts §7.** `login-flow.test.ts:94` doit asserter la sortie de `RdoCommand.build()` de production, pas la chaîne codée en dur de `__mocks__/mock-rdo-session.ts:103`. `mail.validation.test.ts:133-152` doit consommer les octets réellement émis par `mail-handler.ts`. Objectif : **ces suites doivent échouer tant que P-H1 n'est pas corrigé** | impl-D |
| **L8** | Ratchet de couverture (≥ 93 % sur les lignes touchées), `npm test` + `npm run build` complets, mise à jour `doc/` (anglais) pour L1-L6 | impl-D |

### Phase 4 — Live & P-H1 (porte D2 requise)

| Lot | Contenu | Agent |
|---|---|---|
| **L9** | Exécuter U1, U3 (aller-retour cookie 0x80–0x9F), U4, U6 selon le protocole L0-c. **U2 exclu par défaut** — répétition ×100 sur serveur partagé, décision explicite requise | impl-live (`e2e-test`, Playwright MCP) |
| **L10** | **P-H1 + doc §8.5.** Basculer les 3 sites `"^"` → `"*"` **avec** QueryId ; corriger `doc/rdo-protocol-architecture.md:788` qui interdit aujourd'hui la forme même du client de référence ; aligner `assertNotVoidPush` et `src/server/CLAUDE.md`. **Conditionné au résultat U1** | impl-A |
| **L11** | Basculer la table 0x80–0x9F de L1 en CP1252 (ou confirmer `latin1`) selon U3 | impl-A |
| **L12** | Traiter le lot MOYENNES/BASSES issu de L0-a, priorisé | impl-B |

---

## 4. Ordonnancement

```
Phase 0   L0-a ─┐
          L0-b ─┼─ parallèle, lecture seule
          L0-c ─┘
                 │
         [D1] ───┤
                 │
Phase 1   L1 ──► L2                    (sérialisé, fichiers protégés)
                 │
Phase 2   L3 ──► L4    ─┐
          L5           ─┼─ parallèle, worktrees isolés
          L6           ─┘
                 │
Phase 3   L7 ──► L8                    (merge séquentiel, suite verte)
                 │
         [D2] ───┤
                 │
Phase 4   L9 ──► L10, L11              (U1/U3 tranchent)
          L12
```

**Chemin critique** : D1 → L1 → L2 → L8. Les phases 2 et 3 avancent sans attendre les portes.
**Coût de blocage de D1** : L3, L4, L5, L6, L0-* restent entièrement débloqués — environ 60 % du
volume de travail. Rien ne justifie d'attendre D1 pour démarrer.

---

## 5. Portes de décision (développeur)

| Porte | Question | Bloque | Décision |
|---|---|---|---|
| **D1** | Autoriser la modification de `rdo-types.ts` et `rdo.ts` (fichiers protégés) pour L1 et L2 ? | L1, L2, L11 | ✅ **OUVERTE 2026-08-14** — L1 **et** L2 autorisés |
| **D2** | Autoriser les sondes live U1/U3/U4/U6 sur le serveur partagé ? U2 (×100) séparément ? | L9, L10, L11 | ✅ **OUVERTE 2026-08-14** — U1/U3/U4/U6 **et U2** autorisés |
| **D3** | M-A : si aucune source fiable d'id de bâtiment n'existe, accepter un `null` explicite plutôt qu'un id fabriqué ? | L6 (fin) | ⏳ ouverte, tranchée par l'investigation L6 |

### 5.1 Conditions d'exécution de U2 (autorisé, mais encadré)

U2 martèle `call SayThis "^"` ~100× pour observer si le `push edi` surnuméraire déstabilise le
serveur **partagé**. L'autorisation développeur est acquise ; le protocole reste contraint :

1. **Jamais avant U1.** Si U1 révèle que le serveur rejette la forme (`error 9`/`error 1`) sans
   exécuter le corps de la procédure, le `push edi` n'a pas lieu et U2 devient **sans objet** —
   ne pas l'exécuter.
2. **Jamais en parallèle** d'un autre lot live, ni d'une session E2E.
3. **Montée progressive** : 1 → 10 → 100, avec relevé de `Survival` et de l'état socket entre
   chaque palier.
4. **Critère d'arrêt immédiat** : toute coupure de socket, tout `Aerror`, toute dégradation de
   `Survival`, ou toute anomalie dans `http://158.69.153.134/logs/` → arrêt, pas de reprise,
   rapport.
5. Compte de test dédié (`SPO_test3`), aucune mutation de jeu associée.

### 5.3 Révision après L0-c — protocole des sondes

Protocole complet : [sondes-live-U1-U6.md](campaign/sondes-live-U1-U6.md). Quatre points modifient
le §6 du rapport d'audit et ce plan.

**a) Prérequis bloquant de L9 : le harnais d'émission n'existe pas** ✅ vérifié.
`handleRdoDirect` est bien câblé côté passerelle — garde de phase, seau à jetons (rafale 10,
5/s), liste blanche de verbes (`ws-handlers/misc-handlers.ts:171-205`) — mais **aucun déclencheur
côté navigateur** : `window.__spoDebug` (`client/client.ts:51-66`) n'expose aucune API d'envoi.
Sans `src/tools/rdo-probe.ts` (ou un `__spoDebug.rdoDirect()` derrière un drapeau), **seule U1-b
est exécutable**. À livrer et relire **avant** l'ouverture de la fenêtre live, jamais en séance.

**b) U3 ne tranche pas tel que formulé.** L'aller-retour cookie traverse la même code page à
l'aller et au retour : il rend les mêmes octets quelle que soit la table. Il détecte une code page
DBCS ou lacunaire, pas le choix CP1252 vs Latin-1. **La décision L11 repose sur U3-b** — moisson
des logs serveur au niveau octet, qui n'émet aucune trame. Si U3-b est muette, L11 s'arbitre sur
un argument `[INFERRED]`, pas sur une sonde.

**c) U4 n'a pas d'oracle tel que formulé.** `RDOLaunchMovie` part sans QueryId : un rejet de
littéral est **intégralement silencieux** (`RDOQueryServer.pas:174-178`). Remplacée par un `set`
sur une propriété inexistante — oracle binaire (`error 3` = littéral parsé, `error 4` = rejeté),
zéro effet, zéro argent dépensé.

**d) Coût de U2 non anticipé par le §5.1 : 111 lignes permanentes dans le log public `Chat`**
du serveur partagé (`InterfaceServer.pas:3909`, journalisation inconditionnelle). Une substitution
à effet de log nul existe (`SetViewedArea`, déséquilibre de pile rigoureusement identique) au prix
de la fidélité — ce n'est plus le site réel du défaut. **→ Porte D6, à arbitrer avant L9.**

**Bonne nouvelle sur la sévérité de U2 :** le source montre que `CallMethod` est appelé **avant**
tout marshalling (`RDOQueryServer.pas:471`), donc la prémisse « le serveur rejette la forme sans
exécuter le corps » est probablement fausse — U2 aura vraisemblablement un objet. Le verrou
U1→U2 est néanmoins conservé et **opérationnalisé par un oracle précis** : la présence de la ligne
de sonde dans `FIVEINTERFACESERVER/Chat`. Absente ⇒ U2 sans objet ⇒ arrêt.

**Ajout de sécurité :** U1-a — même question protocolaire posée sur `ClientAware`, membre à
**0 paramètre**, donc **pile équilibrée**. Sépare la question protocolaire de la question mémoire
pour une trame et un risque nul. À exécuter avant U1-b.

## 5.2 Révision du plan après L0-a (2026-08-14)

Le lot L0-a a rendu **25 constats** au lieu des 19 annoncés —
[annexe MOYENNES/BASSES](rdo-audit-2026-08-14-annexe-moyennes-basses.md). Trois d'entre eux
modifient ce plan ; les trois ont été re-vérifiés par lecture directe du source.

**a) P-M2 rejoint la phase 1 comme second constat CRITIQUE.** `rdo.ts:414-417` renvoie
`"${cleaned}"` sans échapper les `"` internes dès que l'argument commence par un préfixe RDO,
et `login-handler.ts:198,202` passe `username`/`pass` en chaînes brutes. C'est une injection de
trame **pré-authentification, en ASCII pur** — le codec CP1252 de L1 **ne la referme pas**.

→ **L2 est requalifié** : « durcissement de la frontière `rdo.ts` / `RdoCommand` » =
P-H3 (validation des identifiants) + **P-M2** (échappement de la branche préfixe) + P-M1
(préfixe `RDOSearchKey`) + P-L4. Priorité égale à L1, exécuté juste après.

**b) P-L4 bloque P-H1 (L10).** `withRequestId()` force `separator = '"^"'`
(`rdo-types.ts:383-387`) : `RdoCommand` est **structurellement incapable** d'émettre
`QueryId + "*"`, la forme prouvée par capture. Découpler les deux axes est un prérequis de L10,
pas un raffinement — intégré à L2 puisque le fichier protégé est déjà ouvert.

**c) P-M3 doit être tranché avant L5.** `sendRdoRequest()` résout sur `error N` ; **aucun des
93 sites d'appel ne lit `errorCode`**. M-B et M-E sont deux instances parmi 93. Corriger les
mutations une par une sans fixer le contrat de couche reconstruit le même défaut 91 fois.

→ **Nouvelle porte D4**, à trancher avant L5 : rejeter par défaut sur `errorCode > 0` avec
opt-out explicite, ou imposer un helper `unwrapRdo(packet)`. C'est un choix d'architecture,
pas une correction.

→ **Nouvelle porte D5** (non bloquante) : le pool de connexions monde n'est jamais peuplé
(O-M1, vérifié) — `initialize()` n'est appelé nulle part et `getConnection()` n'est atteignable
que sous une garde `size > 0` définitivement fausse. Soit on l'active (**et alors O-L1 d'abord**,
sinon un défaut latent devient actif), soit on le retire et on corrige
`doc/rdo-session-lifecycle.md` §9 D2, qui décrit aujourd'hui un comportement que le code n'a pas.

**Ordre révisé de la phase 1 :** L1 (P-C1) → L2 (P-M2 + P-H3 + P-M1 + P-L4) → [D4] → phase 2.

## 6. Definition of Done — par lot

1. Tests joints, lignes nouvelles/modifiées ≥ 93 % de couverture
2. Aucune régression `npm run typecheck` / `npm test` / `npm run build`
3. Toute affirmation protocolaire citée `Fichier.pas:Ligne` ou capture, ou marquée `[INFERRED]`
4. Skill `rdo-conformity` invoquée avant toute écriture RDO (L1, L2, L10, L11)
5. `doc/` en anglais, `report/` en français
6. Commit `type: résumé court`, une branche `fix/` par lot

---

*Skills consultées pour ce plan : `rdo-conformity` (matrice verbe/séparateur §8.5, hiérarchie de
preuves), `code-guardian` (manifeste des fichiers protégés), `spo-testing` (ratchet de couverture).*
