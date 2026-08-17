# Prompt de mission — Couverture de test RDO à 100 % (protocole + handlers)

**Usage :** coller le bloc ci-dessous dans une session **neuve**, à la racine du dépôt WebClient,
**une session par lot**. Il est autoportant : il ne suppose aucun contexte de la session qui l'a rédigé.

**Plan d'exécution compagnon — À LIRE AVEC CE PROMPT :**
[report/plan-couverture-rdo-100.md](../../report/plan-couverture-rdo-100.md). Le plan porte
l'exploration réelle du dépôt (contraintes de singletons, fake timers, chemins de matchers,
spécification du helper partagé, ordre ROI intra-lot). Ce prompt fixe le cadre ; le plan dit comment.
En cas de divergence entre les deux sur un fait du dépôt, **le plan gagne** — il a été vérifié le 2026-08-17.

**Routage modèle / effort, par lot :**

| Lot | Modèle · effort | Pourquoi |
|-----|-----------------|----------|
| 0 — socle + helper | Opus 5 · `high` | le helper est utilisé par tout le reste ; le rater coûte cher |
| 1 — couche protocole | Opus 5 ou Fable 5 · `high` | ~117 lignes, mécanique |
| 2 — matrices + push-dispatcher | Opus 5 · **`xhigh`** | chaque entrée est une décision cible/séparateur |
| 3 — handlers bâtiment | Opus 5 · `high` | volume, peu de pièges protocolaires |
| 4 — handlers domaine | Fable 5 · `high` | 8 fichiers indépendants, fort volume |
| 5 — session | Opus 5 · **`xhigh`** | harnais + fichier protégé, 123 fonctions |
| 6 — inventaire | Opus 5 · `high` | un fichier, beaucoup de jugement sur les exemptions |

N'exécute PAS cette mission comme un workflow multi-agents : la boucle de couverture est un état
global (collisions sur `coverage/`), le helper partagé est un point de contention, et les points
d'étape par lot sont le mécanisme de contrôle. Un workflow est en revanche le bon outil pour
l'AUDIT après chaque lot — voir §8.
**Créé :** 2026-08-16, à partir de [report/analyse-ecarts-voyager-2026-08-16.md](../../report/analyse-ecarts-voyager-2026-08-16.md) §8.
**Chiffres de départ :** run complet `npx jest --coverage` du 2026-08-16 — 222 suites, 4 595 tests,
46,81 % de lignes global ; couche protocole RDO 87,4 %, sites d'appel RDO 35,6 %.
**Exécuté :** 2026-08-17, en sept sessions (lots 0 à 6), une par lot, point d'étape entre chacune.
**Terminé.** Résultat : 21/21 fichiers à 100 % lignes/fonctions/statements (sauf les 4 écarts
justifiés au §4 du rapport), branches à 100 % ou consignées, **0 `/* istanbul ignore */` sur un
budget de 10**, aucun fichier de production modifié. Suite : 4 595 → **6 011 tests passés**
(222 → 238 suites) ; couverture globale **46,81 % → 58,49 % lignes** ; `src/server/session/`
**31,4 % → 99,93 %** lignes / 100 % fonctions. Le lot 6 a livré
`src/server/__tests__/rdo/capability-inventory.test.ts` (24 tests, 5 contrôles, vert, aucune
couverture ajoutée). Rapport final : [report/couverture-rdo-100.md](../../report/couverture-rdo-100.md).

Deux corrections à apporter à ce prompt si la mission est rejouée :
— **§10, LOT 6, contrôle « séparateur cohérent »** : la règle « aucun site n'utilise `"^"` » ne vaut
que pour `VOID_MEMBERS`. `CONNECTION_BOUND_MEMBERS` ne contient que `RDOCnntId`, une **lecture** dont
`"^"` est la forme correcte ; son invariant est la socket primaire, pas le séparateur (rapport §8.3).
— **§9** a péri une **troisième** fois en exécution (`EstLoan`, mal rangé au lot 4). L'avertissement
de procédure qui précède la liste doit se lire comme la règle, pas comme une précaution.

---

```
MISSION

Porter à 100 % la couverture de test de la couche RDO du WebClient — le protocole ET les
handlers qui construisent les commandes. 21 fichiers, 2 591 lignes, 272 fonctions et 1 982
branches restent à couvrir.

C'est un travail de volume. Il est mécanique dans son exécution mais PAS dans sa conception :
la moitié de la valeur tient à ce que les tests vérifient réellement quelque chose. Lis la
section « CE QU'EST UN BON TEST ICI » avant d'écrire la première ligne — le dépôt contient déjà
des tests tautologiques, et en ajouter serait une régression déguisée en progrès.

═══════════════════════════════════════════════════════════════════════════════
1. À LIRE EN PREMIER, DANS CET ORDRE
═══════════════════════════════════════════════════════════════════════════════

1. CLAUDE.md (racine) — invariants du projet, interdits absolus
2. src/server/CLAUDE.md — règles de socket RDO, phases de session, catégories de timeout
3. src/shared/CLAUDE.md — préfixes de type RDO, encodage booléen, gestion d'erreur
4. doc/rdo-protocol-architecture.md — hiérarchie de preuve (§0), framing, dispatch,
   matrice des séparateurs (§8.5)
5. doc/rdo_typing_system.md — API RdoValue / RdoCommand
6. Invoque la compétence `spo-testing` — layout des projets Jest, ratchet, 7 matchers, mock server
7. report/analyse-ecarts-voyager-2026-08-16.md §8 — l'analyse qui motive cette mission

Ne recommence pas cette lecture à chaque fichier. Lis une fois, puis exécute.

═══════════════════════════════════════════════════════════════════════════════
2. INTERDITS ABSOLUS
═══════════════════════════════════════════════════════════════════════════════

▸ NE MODIFIE AUCUN FICHIER DE PRODUCTION. Cette mission n'écrit que des tests.
  Si un test ne peut pas passer sans changer le code de prod, c'est un BUG : consigne-le dans
  le rapport final (§9) et passe au suivant. Ne le corrige pas, ne le contourne pas.

▸ Fichiers protégés, à ne modifier sous aucun prétexte :
  src/shared/rdo-types.ts · src/server/rdo.ts · src/server/spo_session.ts · jest.config.js
  (`src/__fixtures__/` est cité comme protégé par CLAUDE.md mais N'EXISTE PAS aujourd'hui — vérifié
   le 2026-08-17. Ne le crée pas : les HTML de test sont des constantes inline dans chaque *.test.ts.)
  En particulier : NE TOUCHE PAS aux seuils de couverture de jest.config.js. Les remonter est
  une décision du développeur, prise après cette mission, pas pendant.

▸ Ne commit pas, ne push pas. Un hook PreToolUse (`conformance-gate.sh`) refuse la synchro git
  tant que la suite de conformité n'a pas validé les sources ; ce n'est pas ton rôle ici.

▸ N'utilise jamais `any`. `unknown` dans les blocs catch + `toErrorMessage(err)` depuis
  `@/shared/error-utils`. Interfaces typées pour les données de test.

▸ Ne construis jamais une chaîne de protocole RDO à la main. Toujours `RdoValue` / `RdoCommand`
  depuis `@/shared/rdo-types`. Cela vaut AUSSI dans les tests, y compris pour les valeurs
  attendues quand le point du test est le format.

▸ Fins de ligne LF uniquement (.gitattributes). Jamais de CRLF.

▸ N'ajoute pas `/* istanbul ignore */` pour atteindre le chiffre. Voir §7.

═══════════════════════════════════════════════════════════════════════════════
3. INVARIANTS DU PROTOCOLE QUE TES TESTS DOIVENT ENCODER (ET JAMAIS VIOLER)
═══════════════════════════════════════════════════════════════════════════════

Ces règles sont établies par capture live et par le source Delphi. Un test qui les contredit est
faux, même s'il passe au vert.

▸ `"^"` (VariantId) sur une `procedure` Delphi GÈLE LE SERVEUR PARTAGÉ. Prouvé en live le
  2026-08-15 : une seule trame a suffi. Réf. RDOQueryServer.pas:419-424 → RDOObjectServer.pas:292.
  Les membres void utilisent `"*"` AVEC QueryId — la forme du client de référence, acquittée
  `A<id> ;`. Liste dans `VOID_MEMBERS` (src/server/session/rdo-request-guards.ts).

▸ `sendRdoRequest()` + `"*"` est interdit par convention de projet (une forme par intention,
  garde `assertNotVoidPush`), SAUF pour les `VOID_MEMBERS` où c'est la seule forme sûre.
  L'autre risque réel est `"^"` SANS QueryId.

▸ Fire-and-forget = `writeRdoFrame(socket, RdoCommand.build())`, séparateur `"*"`, pas de QueryId.
  Appel synchrone = `sendRdoRequest(socketName, packet, timeout?, category?)`, séparateur `"^"`,
  QueryId ajouté.

▸ Booléens : `#-1` (vrai) / `#0` (faux), octet pour octet comme le client legacy. À la lecture,
  accepter tout ordinal non nul comme vrai. Ne JAMAIS normaliser `#-1` en `#1`.

▸ Tous les writes socket passent par `writeRdoFrame()` — il encode en Latin-1 (ANSI). Un test qui
  écrit en UTF-8 sur une socket RDO teste un comportement que la prod n'a pas.

▸ Chaque `sendRdoRequest()` porte une `TimeoutCategory` (FAST 60 s / NORMAL, SLOW, VERY_SLOW 180 s).

▸ En cas de conflit entre le source Delphi et une capture live, LA CAPTURE GAGNE
  (doc/Mock_Server_scenarios_captures.md). Documente pourquoi la forme capturée fonctionne, puis
  suis-la — jamais l'inverse.

═══════════════════════════════════════════════════════════════════════════════
4. LE PÉRIMÈTRE EXACT
═══════════════════════════════════════════════════════════════════════════════

Cible : 100 % lignes, 100 % fonctions, 100 % statements sur CHACUN des fichiers ci-dessous.
Les branches sont traitées à part (§7).

Reste à couvrir (baseline 2026-08-16, lignes / fonctions / branches non couvertes) :

  src/server/session/profile-finance-handler.ts        3,71 %   259 / 13 / 208
  src/server/session/auto-connection-handler.ts        5,45 %   156 /  7 / 171
  src/server/session/road-handler.ts                   6,97 %   120 /  5 /  63
  src/server/session/zone-surface-handler.ts           9,25 %    49 /  4 /  22
  src/server/session/building-details-handler.ts      10,35 %   485 / 52 / 373
  src/server/session/mail-handler.ts                  11,72 %   128 / 10 /  86
  src/server/session/research-handler.ts              12,50 %    49 /  2 /  22
  src/server/session/building-templates-handler.ts    16,59 %   196 /  8 / 128
  src/shared/proxy-utils.ts                           25,00 %    12 /  3 /   9
  src/server/session/building-property-handler.ts     27,30 %   197 /  3 / 211
  src/server/session/politics-handler.ts              27,71 %   120 / 10 /  92
  src/server/session/push-dispatcher.ts               27,74 %   112 /  1 / 106
  src/shared/error-codes.ts                           51,68 %    43 /  0 /  43
  src/server/session/chat-handler.ts                  53,96 %    29 /  7 /  24
  src/server/session/building-management-handler.ts   57,75 %    49 /  4 /  38
  src/server/spo_session.ts                           60,12 %   431 /123 / 260
  src/server/session/rdo-connection-pool.ts           61,53 %    45 / 12 /  22
  src/server/session/login-handler.ts                 76,38 %    94 /  8 /  79
  src/server/rdo-helpers.ts                           90,14 %     7 /  0 /   4
  src/shared/rdo-types.ts                             96,81 %     5 /  0 /   7
  src/server/rdo.ts                                   97,44 %     5 /  0 /  14

Déjà à 100 %, à NE PAS régresser (relance-les à chaque lot) :
  timeout-categories.ts · cp1252.ts · rdo-error-classifier.ts · rdo-error-contract.ts ·
  rdo-request-guards.ts · session-utils.ts · construction-lock.ts ·
  property-fallback-census.ts · diagnostics-readouts.ts

HORS PÉRIMÈTRE : renderer, composants React, stores, ws-handlers, client/handlers, mock-server,
tools/conformance. Ne les touche pas, même si la couverture y est basse.

═══════════════════════════════════════════════════════════════════════════════
5. L'OUTILLAGE QUI EXISTE DÉJÀ — NE RÉINVENTE RIEN
═══════════════════════════════════════════════════════════════════════════════

▸ 7 matchers Jest personnalisés, enregistrés à l'exécution via
  src/server/__tests__/setup/jest-setup.ts (`expect.extend(rdoMatchers)`) — aucun import de
  runtime à faire :
    toContainRdoCommand(method, args?) · toMatchRdoFormat() · toMatchRdoCallFormat(method) ·
    toMatchRdoSetFormat(property) · toHaveRdoTypePrefix(prefix) · toMatchRdoResponse(requestId?) ·
    toPassStrictRdoValidation(config?)
  MAIS les TYPES ne sont pas globaux : tout fichier de test qui les utilise doit porter, en
  première ligne, la directive triple-slash — sinon `npm run typecheck` échoue. Convention suivie
  par tous les tests existants :
      /// <reference path="<chemin relatif>/server/__tests__/matchers/rdo-matchers.d.ts" />
  Utilise-les. Une assertion `expect(cmd).toContain('call Foo')` là où
  `toMatchRdoCallFormat('Foo')` existe est un test de moindre qualité.

▸ src/server/__tests__/protocol-validation/protocol-test-harness.ts — instancie une VRAIE
  StarpeaceSession avec net.Socket remplacé par MockTcpSocket et node-fetch par HttpMock,
  un RdoMock par socket, et le validateur strict actif. C'est l'outil de choix pour
  spo_session.ts, login-handler.ts, et tout ce qui touche à la séquence de session.

▸ src/server/__mocks__/mock-rdo-session.ts — MockRdoSession, enregistre les commandes émises et
  sert des réponses par motif. Plus léger que le harnais ; suffit pour les handlers isolés.

▸ src/server/session/session-context.ts — l'interface SessionContext que reçoivent TOUS les
  handlers de session. C'est le point d'injection : construis un faux typé
  (`sendRdoRequest`, `getSocket`, `cacherGetPropertyList`, `cacherSetPath`, `log`, …) et appelle
  le handler directement. Pas besoin de la classe complète.

▸ src/mock-server/ — serveur RDO de mock, scénarios (dont `scenarios/captured/` : des captures
  live réelles), et RdoStrictValidator. Préfère un scénario capturé à un scénario inventé.

▸ Tests existants dont tu peux copier la forme (les meilleurs du dépôt) :
    src/server/__tests__/rdo/rdo-callsite-wire-format.test.ts
    src/server/session/rdo-request-guards.test.ts
    src/server/session/rdo-error-contract.test.ts
    src/tools/conformance/runner.test.ts

═══════════════════════════════════════════════════════════════════════════════
6. CE QU'EST UN BON TEST ICI — LA SECTION LA PLUS IMPORTANTE
═══════════════════════════════════════════════════════════════════════════════

Le dépôt souffre déjà d'un travers précis, identifié dans l'analyse d'écarts : sur 45 fichiers de
test RDO, 21 CONSTRUISENT la trame localement et 16 seulement pilotent du code de production.
Exemple concret à ne pas reproduire — src/server/__tests__/protocol-validation/profile-tabs.validation.test.ts:61-79
formate une commande avec RdoProtocol.format() puis vérifie le résultat de RdoProtocol.format().
Il ne touche à aucun code de prod ; `RDOAskLoan` n'existe nulle part ailleurs que dans ce test.

RÈGLE : chaque test que tu écris DOIT invoquer la fonction de production sous test.
  ✗ INTERDIT : construire une commande avec RdoCommand/RdoProtocol puis asserter sur elle.
  ✓ EXIGÉ   : appeler `setBuildingProperty(ctx, …)` / `fetchAutoConnections(ctx)` / etc., puis
              asserter sur ce que le faux `sendRdoRequest` / `writeRdoFrame` a REÇU.

Ce que chaque test doit établir, par ordre de valeur :
  1. LA CIBLE  — CurrBlock vs ObjectId vs 'World' vs proxy tycoon. C'est la source d'erreur n°1.
                 Les matrices RDO_OBJECTID_COMMANDS / SYNCHRONOUS_RDO_COMMANDS /
                 RDO_SET_PROPERTIES (building-property-handler.ts:136-172) portent tout ce risque.
  2. LE SÉPARATEUR — `"^"` vs `"*"`, et la présence/absence de QueryId. Croise avec VOID_MEMBERS.
  3. LE VERBE   — call vs set vs get vs idof.
  4. LES ARGUMENTS — ordre, arité, préfixe de type (`#` `$` `%` `@` `!`), encodage booléen `#-1`/`#0`.
  5. LE CHEMIN D'ERREUR — timeout, `error N`, socket absente, réponse malformée, réponse vide.
     C'est là que sont la plupart des 1 982 branches non couvertes. Ne les néglige pas : ce sont
     elles qui décident du comportement en dégradé.

Interdits de forme :
  ✗ un test par ligne de code, sans intention
  ✗ `expect(result).toBeDefined()` comme seule assertion
  ✗ mocker la fonction sous test
  ✗ des snapshots sur des trames RDO (illisibles en revue, et ils figent les bugs)
  ✗ `expect(true).toBe(true)` ou toute variante d'assertion vide

Style : `module.ts` → `module.test.ts`, MÊME répertoire. Nomme les `it()` par le comportement
vérifié, pas par le nom de la fonction. Écris comme le code qui t'entoure : même densité de
commentaire, mêmes idiomes. Cite `Fichier.pas:Ligne` quand un test encode une règle Delphi.

═══════════════════════════════════════════════════════════════════════════════
7. LES BRANCHES, ET LE CODE INATTEIGNABLE
═══════════════════════════════════════════════════════════════════════════════

100 % lignes / fonctions / statements est EXIGÉ sur les 21 fichiers.
100 % branches est l'OBJECTIF, avec une seule échappatoire, strictement encadrée :

Si une branche est GÉNUINEMENT inatteignable (garde défensive sur un invariant de type déjà
garanti par TypeScript, `default:` d'un switch exhaustif, etc.), tu ne l'ignores pas : tu la
CONSIGNES dans le rapport final, avec fichier:ligne et la raison. Une branche inatteignable est
souvent du code mort — c'est une trouvaille, pas un obstacle.

`/* istanbul ignore */` n'est admis que si les trois conditions sont réunies :
  (a) la branche est prouvée inatteignable, pas seulement difficile ;
  (b) un commentaire d'une ligne juste au-dessus dit pourquoi ;
  (c) elle figure dans le rapport final.
Si tu en poses plus de 10 sur l'ensemble de la mission, arrête-toi et signale-le : c'est le signe
que la cible de 100 % branches est mauvaise pour ce code, et c'est une information utile.

═══════════════════════════════════════════════════════════════════════════════
8. BOUCLE DE TRAVAIL
═══════════════════════════════════════════════════════════════════════════════

Environnement : Windows 11, PowerShell principal + Bash (MINGW64) disponible, Node v24 dans
`C:\Program Files\nodejs\`. Pour bash : `export PATH="/c/Program Files/nodejs:$PATH"`.
Utilise les outils Read/Grep/Glob/Edit/Write, pas grep/find/cat/sed du shell.

Travaille FICHIER PAR FICHIER, dans l'ordre des lots (§10). Pour chaque fichier :

ATTENTION CLI — Jest 30.2 : l'option `--testPathPattern` (singulier) N'EXISTE PLUS, elle a été
renommée `--testPathPatterns`. Vérifié le 2026-08-17 via `npx jest --help`. Le plus simple et le
plus stable est la forme POSITIONNELLE : `npx jest <chemin ou motif>`.

  1. LIS le fichier de production en entier. Ne devine jamais une signature.
  2. IDENTIFIE ce qui n'est pas couvert :
       npx jest --coverage --collectCoverageFrom="src/<chemin>.ts" \
         --coverageReporters=text --coverageDirectory=coverage-scratch \
         --coverageThreshold='{}' src/<chemin>.test.ts
     Le rapport `text` donne les numéros de lignes non couvertes dans la dernière colonne.
     ▸ `--coverageThreshold='{}'` neutralise le seuil global (38 %) pendant l'itération : sans lui,
       une couverture ciblée sur UN fichier à 27 % fait sortir jest en code ≠ 0 à chaque boucle et
       tu perds le signal utile. Le seuil réel se vérifie au `npm test` de fin de lot.
     ▸ `--coverageDirectory=coverage-scratch` évite d'écraser le rapport de référence `coverage/`.
       Ajoute `coverage-scratch/` à .gitignore si ce n'est pas déjà couvert par `coverage*`.
  3. ÉCRIS ou complète `<module>.test.ts` à côté du module.
  4. VÉRIFIE : même commande qu'en 2. Boucle jusqu'à 100 % lignes/fonctions/statements.
  5. NON-RÉGRESSION du fichier : `npx jest src/<chemin>.test.ts` doit être vert.
  6. TYPECHECK : `npm run typecheck` doit être vert (un hook Stop le lance de toute façon et
     bloque le tour en cas d'échec — ne le laisse pas te surprendre en fin de lot).

À la fin de CHAQUE lot (pas de chaque fichier) :
  npm test                  # la suite complète doit rester verte, SEUILS ACTIFS
  npx jest --coverage --coverageReporters=text-summary
  + relance les 9 fichiers déjà à 100 % (§4) — non-régression.

AUDIT DE FIN DE LOT — c'est ici, et seulement ici, qu'un workflow multi-agents est utile.
Fan-out de relecteurs indépendants sur le diff du lot, une seule consigne : « trouve les tests qui
passent sans rien vérifier — assertion vide, fonction sous test mockée, trame construite localement
puis assertée ». C'est le mode de défaillance n°1 de cette mission (§6), et plusieurs lecteurs
indépendants l'attrapent mieux qu'une relecture unique.

Point connu à ne pas confondre avec une régression que tu aurais causée :
`src/server/__tests__/protocol-validation/auth.validation.test.ts:51` dépasse le timeout de 10 s
sous instrumentation de couverture (91 s observées) alors qu'il est vert sans. Il est en échec
AVANT ton intervention. Ne le « répare » pas en changeant du code de prod ; signale-le.

═══════════════════════════════════════════════════════════════════════════════
9. LES BUGS QUE TU VAS RENCONTRER — NE LES CORRIGE PAS, ENCODE-LES COMME TROUVAILLES
═══════════════════════════════════════════════════════════════════════════════

L'analyse d'écarts a déjà identifié des bugs de conformité dans le périmètre. Tu vas tomber
dessus en écrivant les tests. Dans CE cas précis, n'écris PAS un test qui grave le comportement
fautif comme correct : écris le test qui documente l'écart (`it.failing()` ou un `it()` qui
assert le comportement ACTUEL avec un commentaire `// BUG connu : …, voir report/…`), et
consigne-le au rapport.

⚠ AVERTISSEMENT DE PROCÉDURE — cette liste a périmé DEUX FOIS en exécution (M-E au lot 2, M-B au
lot 3 : les deux bugs étaient déjà corrigés, et les prompts de session demandaient encore de les
tester). **VÉRIFIE CHAQUE ENTRÉE contre le code actuel avant d'écrire le test.** Si le bug est
corrigé, ne gèle pas l'ancien comportement : complète les branches restantes et signale la
péremption au rapport. Une liste de bugs vieille de quelques lots est une hypothèse, pas un fait.

Connus au 2026-08-16, à re-vérifier avant usage :
  ▸ TV — `Comercials` (un seul « m ») est émis à l'écriture ; la propriété publiée Delphi est
    `Commercials` (StdBlocks/Broadcast.pas:53). Le set ne touche rien.
  ▸ TV — `HoursOnAir` et `Comercials` sont lus via GetPropertyList alors que
    TBroadcaster.StoreToCache (Broadcast.pas:431-453) ne les écrit jamais dans le cache.
  ▸ Banque — `BudgetPerc`, `Interest`, `Term` sont des propriétés PUBLIÉES (StdBlocks/Banks.pas:39-41),
    absentes du cache (Banks.pas:188-206) ; lues via GetPropertyList, donc toujours vides.
  ▸ `EstLoan` n'existe ni en cache ni en propriété — il vient de `RDOEstimateLoan`, non implémenté.
  ▸ building-property-handler.ts:237-259 — CORRIGÉ DEPUIS, ne teste pas l'ancien comportement.
    La re-lecture ne retombe plus sur la valeur demandée : `readBack` vide → `newValue: ''` et
    `confirmed: false`. CE QUI RESTE : `success: true` est toujours INCONDITIONNEL sur ce chemin
    (L259), y compris quand rien n'a pu être confirmé. C'est ça que le test doit épingler.
  ▸ building-management-handler.ts:343-357 — `RDODelFacility` est attendu puis son code d'erreur
    est seulement journalisé, jamais interprété ; la fonction renvoie `success: true` toujours.

Si tu en découvres d'autres : même traitement.

═══════════════════════════════════════════════════════════════════════════════
10. ORDRE DES LOTS
═══════════════════════════════════════════════════════════════════════════════

Fais un point d'étape à la fin de chaque lot. N'enchaîne pas trois lots sans rendre la main.

LOT 1 — Finir la couche protocole (le plus rapide, ferme le socle)
  rdo-helpers.ts (7 l.) · rdo-types.ts (5 l.) · rdo.ts (5 l.) · proxy-utils.ts (12 l.) ·
  error-codes.ts (43 l., 43 branches) · rdo-connection-pool.ts (45 l., 12 fn)
  ≈ 117 lignes. Le pool est prioritaire : c'est le sujet de la branche courante.

LOT 2 — Le cœur du risque de trame
  building-property-handler.ts (197 l., 211 br.) · push-dispatcher.ts (112 l., 106 br.)
  Ce sont les deux fichiers les plus critiques du dépôt et les moins protégés. Traite-les à fond :
  chaque entrée des trois matrices, chaque membre de push, y compris les membres inconnus.

LOT 3 — Handlers de bâtiment
  building-details-handler.ts (485 l., 52 fn — le plus gros) ·
  building-templates-handler.ts (196 l.) · building-management-handler.ts (49 l.)

LOT 4 — Handlers de domaine
  profile-finance-handler.ts (259 l. — mutations d'argent réel, priorité dans le lot) ·
  auto-connection-handler.ts (156 l.) · mail-handler.ts (128 l.) · politics-handler.ts (120 l.) ·
  road-handler.ts (120 l.) · zone-surface-handler.ts (49 l.) · research-handler.ts (49 l.) ·
  chat-handler.ts (29 l.)

LOT 5 — Session
  login-handler.ts (94 l.) · spo_session.ts (431 l., 123 fn)
  spo_session.ts est un fichier PROTÉGÉ : tests uniquement, aucune modification. Utilise le
  protocol-test-harness plutôt que des faux à la main.

LOT 6 — Un test d'inventaire, UNIQUEMENT après que les lots 1 à 5 sont verts
  Un seul fichier. Il ne produit AUCUNE couverture (il n'exécute aucun chemin de handler) : ce
  n'est pas la cible de la mission, c'est un filet posé une fois le travail fait. Ne réorganise
  PAS le plan autour de lui.

  Il doit PASSER AU VERT dès le premier run. Il échouera sinon sur des écarts déjà connus et
  documentés (report/analyse-ecarts-voyager-2026-08-16.md §7) — un rouge bloque le gate de
  conformité git. Donc : listes d'exemptions explicites, UNE RAISON PAR ENTRÉE. La liste est la
  documentation ; le test empêche les NOUVEAUX orphelins, il ne réclame pas les anciens.

  Ce qu'il assert — uniquement du mécaniquement dérivable :
   ▸ chaque `REQ_*` de shared/types/message-types.ts (78 au total) est soit une clé de
     `wsHandlerRegistry` (ws-handlers/index.ts), soit dans la liste d'exemptions UNROUTED ;
   ▸ chaque `REQ_*` est soit émis quelque part dans src/client/, soit dans la liste UNWIRED ;
   ▸ scan statique : aucun site d'appel de src/server/ n'émet `"^"` sur un membre de
     `VOID_MEMBERS` (rdo-request-guards.ts:39 — ReadonlyMap déjà source de vérité unique).
     Précédent de forme : src/server/__tests__/no-raw-rdo-writes.test.ts.

  INTERDIT : une table de correspondance `REQ_* → membres RDO → séparateur` maintenue à la main.
  Ce serait une nouvelle source de vérité, et elle pourrira. Reste sur le dérivable.

  Exemptions connues au 2026-08-16, à reprendre avec leur raison (vérifie-les, ne les recopie pas
  aveuglément) : REQ_TRANSPORT_DATA et REQ_SEARCH_MENU_PEOPLE (ni handler ni émetteur) ;
  REQ_CHAT_GET_CHANNEL_INFO, REQ_CHAT_TYPING_STATUS, REQ_GET_ROAD_COST,
  REQ_MAIL_GET_UNREAD_COUNT, REQ_MAIL_SAVE_DRAFT, REQ_MANAGE_CONSTRUCTION, REQ_RDO_DIRECT
  (handler présent, jamais émis par le client).

═══════════════════════════════════════════════════════════════════════════════
10bis. FRONTIÈRE AVEC LA SUITE DE CONFORMITÉ LIVE — NE LA FRANCHIS PAS
═══════════════════════════════════════════════════════════════════════════════

Cette mission écrit des tests JEST. Elle ne touche NI à src/tools/conformance/, NI aux suites
live, NI aux scénarios de mock.

Le cas des scénarios à variable imprévisible (ID de bâtiment découvert au runtime, puis muté) :
Jest ne découvre pas d'ID, il en fabrique un — et c'est suffisant. Ce que Jest doit prouver est
le CHEMINEMENT : qu'un ID obtenu au runtime arrive sur la bonne cible, avec le bon séparateur et
le bon préfixe de type. Cela se teste entièrement hors ligne, avec un ID factice.

Ce que Jest ne peut PAS prouver — que le serveur accepte la trame — est le métier de la suite de
conformité (13 suites, `npm run conformance`). N'essaie pas de le couvrir ici : les mutations sur
ID découvert exigent l'instance dédiée (planitia partagé = lectures seules), donc une mission de
couverture s'y retrouverait bloquée par de l'infra.

LIVRABLE CORRESPONDANT, à la place : le rapport final liste les membres RDO que tes tests
exercent en Jest et qui sont ABSENTS des suites live, sous forme de lignes prêtes à être
AJOUTÉES à report/campaign/coverage-matrix.md — le plan live existe déjà, avec son analyse
d'oracles par transport A/B/C. N'en écris pas un second.

═══════════════════════════════════════════════════════════════════════════════
11. LIVRABLE
═══════════════════════════════════════════════════════════════════════════════

Code : les fichiers `*.test.ts` co-localisés, PLUS un seul helper partagé autorisé (voir ci-dessous).
Rien d'autre. Aucun fichier de production, à aucun moment.

HELPER PARTAGÉ AUTORISÉ — et un seul :
  src/server/__tests__/session/fake-session-context.ts
  Fabrique typée de faux `SessionContext`. Répertoire exclu de la couverture
  (`!src/**/__tests__/**` dans collectCoverageFrom) et non capté par testMatch : ce n'est ni du
  code de production ni un test. Suit le précédent de __tests__/protocol-validation/protocol-test-harness.ts.

  Il existe : sans lui, ~15 nouveaux fichiers recopient chacun leur `makeCtx()`, et la divergence
  est DÉJÀ constatée sur les 4 fabriques locales actuelles —
  building-mutations.test.ts:52-58 décode le Buffer latin1 (`f.toString('latin1')`),
  mail-handler-emission.test.ts:30 fait `write: () => true` et JETTE les trames, donc ne peut rien
  asserter sur le canal fire-and-forget `"*"`. Le décodage latin1 est l'invariant du codec L1 sur
  le chemin writeRdoFrame : il ne doit pas dépendre du fichier de test qui le recopie.

  Contraintes, non négociables :
   ▸ Une fabrique, pas un framework. Signature à `overrides` partiels, comme l'existant.
     INTERDIT : DSL de scénario, réponse inférée d'après le membre appelé, état partagé entre tests.
     Un faux assez malin pour faire passer un test pour la mauvaise raison coûte plus qu'il ne rapporte.
   ▸ Il capture LES DEUX canaux — c'est sa raison d'être :
       les paquets de `sendRdoRequest` (member, targetId, separator, args, category)
       ET les trames de `writeRdoFrame`, décodées en latin1 depuis le Buffer.
   ▸ Aucune valeur métier par défaut. Les défauts se limitent à la plomberie (log, sockets, ids de
     contexte). Un test qui dépend d'une valeur de propriété la déclare lui-même, localement.
     Un défaut partagé du genre `cacherGetPropertyList → ['8161308','8161308']` est toxique.
   ▸ Typé strictement. Pas de `any`.

  NE RÉTROFITE PAS les 4 fichiers de test de session existants (building-mutations,
  mail-handler-emission, building-templates-handler, login-handler-reconnect). Ils sont verts, et
  le périmètre est déjà de 2 591 lignes. Consigne-les comme dette dans le rapport final —
  mail-handler-emission.test.ts en tête, puisqu'il est aveugle au canal `"*"`.

Rapport final : `report/couverture-rdo-100.md`, EN FRANÇAIS, contenant :
  1. Tableau avant/après par fichier (lignes, fonctions, branches, statements)
  2. Nombre de tests ajoutés, par lot
  3. Les bugs rencontrés — connus (§9) et nouveaux — avec fichier:ligne et l'effet observable
  4. Les branches déclarées inatteignables, avec fichier:ligne et justification
  5. Tout `/* istanbul ignore */` posé, avec sa justification
  6. La couverture globale de la suite avant/après, et la valeur à laquelle les seuils de
     jest.config.js POURRAIENT être remontés — sans les remonter toi-même
  7. Les membres RDO exercés en Jest et ABSENTS des suites de conformité live, en lignes prêtes
     à être ajoutées à report/campaign/coverage-matrix.md (voir §10bis)
  8. Les listes d'exemptions du test d'inventaire (LOT 6), avec la raison de chacune
  9. La dette laissée : les 4 fabriques makeCtx() locales non rétrofitées (voir §11 helper)
 10. Les compétences utilisées pour produire le travail (convention CLAUDE.md § Transparency)

Sois factuel. Si un lot n'est pas terminé, dis-le et dis pourquoi ; ne présente pas un travail
partiel comme complet. Si tu penses que 100 % est le mauvais objectif sur un fichier donné,
argumente-le dans le rapport — mais finis d'abord tout le reste.
```
