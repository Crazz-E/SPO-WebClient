# Consolidation de la documentation RDO — trois documents, zéro perte

**Session neuve. Modèle : Opus 5. Effort : `high`** (voir §13 pour le découpage possible avec
Fable 5 sur les passes mécaniques).

**Travail documentaire uniquement.** Aucune trame RDO ne doit partir : pas de run live, pas de
`npm run conformance --live`, pas d'E2E, aucun serveur démarré, aucun accès à
`158.69.153.134`. Le corpus est déjà sur disque.

**Aucun commit, aucun push.** Tu laisses l'arbre sale et tu rends un CR (§14). La porte de
conformité (`.claude/hooks/conformance-gate.sh`) refuserait la synchro de toute façon.

---

## 0. Ce que tu produis

Trois documents dans `doc/`, en **anglais** (convention du dépôt : `doc/` anglais, `report/`
français), destinés **exclusivement à une IA** — Opus 5 ou Fable 5 qui doit écrire du code RDO
sans se tromper. La lisibilité humaine n'est pas un objectif ; la densité, l'univocité et la
traçabilité en sont.

| Fichier | DOC-ID | Répond à la question |
|---|---|---|
| `doc/rdo-1-protocol.md` | `RDO-P` | *Comment le langage RDO fonctionne, et comment former une requête correcte.* |
| `doc/rdo-2-vocabulary.md` | `RDO-V` | *Quels objets, membres, propriétés, chemins et clés existent, avec quelle signature.* |
| `doc/rdo-3-services-and-flows.md` | `RDO-F` | *Quels services de SPO existent, comment ils se parlent, et dans quel ordre les messages doivent s'enchaîner pour obtenir la logique métier du client.* |

Plus un CR : `report/consolidation-doc-rdo.md` (français), qui porte la table de couverture
(§9), la table d'arbitrage des conflits (§8 phase 3) et les escalades (§12).

**La frontière entre les trois est stricte** — c'est elle qui empêche la duplication de
revenir :

- `RDO-P` ne nomme **aucun** membre métier autrement que comme exemple explicitement marqué
  comme tel. Il décrit la grammaire, pas le lexique.
- `RDO-V` ne décrit **aucune** séquence. Il décrit des unités isolées : un membre, sa classe,
  son arité, son séparateur, sa dangerosité.
- `RDO-F` ne redéfinit **ni** la grammaire **ni** les signatures. Il ordonne des appels et
  cite `RDO-P` / `RDO-V` par identifiant.

Si un fait a sa place dans deux documents, il n'en a qu'un seul : celui dont la question
ci-dessus le réclame, et les deux autres y renvoient par ID.

---

## 1. Le cadre, et les interdits absolus

**Le protocole RDO est le projet.** Une divergence de fil n'est pas rattrapable ; une
documentation fausse la fabrique. Cette consolidation est donc une opération à haut risque :
en fusionnant, tu vas devoir arbitrer entre des documents qui se contredisent. **Tu n'as pas
le droit d'arbitrer par le raisonnement.** Tu arbitres par la hiérarchie de preuve, et quand
elle ne tranche pas, tu marques `[UNKNOWN]` et tu escalades.

Avant d'écrire une ligne :

1. Invoque la skill **`rdo-conformity`** (checklist, choix du verbe, matrice des séparateurs,
   hiérarchie de preuve).
2. Lis `CLAUDE.md` en entier, plus `src/server/CLAUDE.md` et `src/shared/CLAUDE.md`.
3. Invoque **`docs-codebase`** pour la forme, **`delphi-archaeologist`** dès que tu remontes à
   `../SPO-Original`.

**Hiérarchie de preuve, dans cet ordre exact :**

1. Capture live (`doc/Mock_Server_scenarios_captures.md`, `doc/building_details_rdo.txt`,
   `src/mock-server/scenarios/captured/*`, `report/campaign/rec/*.ndjson`)
2. Incident live daté (les deux formes létales ci-dessous)
3. Source Delphi (`../SPO-Original`, cité `File.pas:Line`)
4. Code de production du WebClient (ce que le client émet aujourd'hui et qui n'a pas cassé)
5. `[INFERRED]` — explicitement marqué comme tel, jamais présenté comme un fait

**En cas de conflit, la capture gagne.** Tu documentes *pourquoi* la forme capturée fonctionne,
puis tu la suis — jamais l'inverse.

**Les deux formes létales, prouvées sur le serveur partagé.** Elles ouvrent `RDO-P` et elles
sont non négociables :

| Forme | Conséquence | Prouvé |
|---|---|---|
| `"^"` sur une **procedure** avec 2 args registre | pointeur de résultat empilé, jamais dépilé → **gel du serveur** | 2026-08-14, `SayThis` |
| `"*"` sur une **function** | aucun pointeur passé, la fonction en écrit un quand même → **écriture mémoire arbitraire** ; l'Interface Server répond ensuite `error 1` à *toute* requête, sur *toute* connexion, pendant des heures | 2026-08-18, `GetUserList` |

Corollaire à documenter tel quel : **il n'existe aucune trame sûre pour un membre dont on n'a
pas la déclaration Pascal.** Le *kind* vient de la déclaration, jamais d'une sonde.

**Interdits d'écriture :**

- Ne modifie **aucun** fichier sous `src/`. Cette mission ne touche que `doc/`, `.claude/`,
  `CLAUDE.md`, `README.md`, `report/` — plus les `CLAUDE.md` de répertoire, qui sont de la
  mémoire et non du code. Les chemins de doc cités dans des fichiers protégés
  (`src/shared/rdo-types.ts`, `src/server/rdo.ts`, `src/__fixtures__/*`, `jest.config.js`)
  se **listent** dans le CR (§12), ils ne se corrigent pas.
- Ne réécris **aucune archive** : `report/*` antérieurs, `doc/BACKLOG.md`,
  `doc/BACKLOG-OPEN.md`, `doc/prompts/*`. Ce sont des enregistrements datés ; les falsifier
  détruirait la traçabilité. Les liens morts qu'ils contiennent se résolvent par la table de
  correspondance `P§R` (§5).
- Ne réécris, ne reformate, ne résume **jamais** `doc/Mock_Server_scenarios_captures.md` ni
  `doc/building_details_rdo.txt`. Ce sont des preuves primaires. On les cite, on ne les édite
  pas.
- N'invente aucune trame d'exemple. **Tout exemple de trame est un verbatim de capture ou de
  fixture, avec sa provenance.** C'est une trame écrite à la main qui a cassé la production le
  2026-08-18.
- Ne renumérote jamais un ID une fois écrit (§4 règle 3).

---

## 2. Le corpus d'entrée, et son classement

Tu lis **l'intégralité** de la colonne « à fondre » avant de rédiger. Pas de survol, pas
d'échantillonnage : c'est une fusion, un paragraphe non lu est un fait perdu.

### 2.1 À fondre, puis supprimer

| Fichier | Lignes | Ce qu'il apporte | Va vers | Piège connu |
|---|---|---|---|---|
| `doc/rdo-protocol-architecture.md` | 1020 | Framing, grammaire, types, dispatch RTTI, push, erreurs, matrice §8.5, comparaison des 3 variantes | `P` (colonne vertébrale) ; §3/§4 architecture serveur/client → `F§0` | Sa section « Open Questions » devient `P§13`, pas une liste de TODO |
| `doc/rdo_typing_system.md` | 493 | API `RdoValue` / `RdoParser` / `RdoCommand`, exemples de construction | `P§10` | §6 « Migration Guide », §7 « Benefits », §9 « Implementation Status » sont **périmés et à jeter** (statut de chantier, pas de protocole). Sa table des préfixes contredit partiellement celle de `rdo-protocol-architecture.md §2.1` : arbitre, ne recopie pas les deux |
| `doc/rdo-session-lifecycle.md` | 238 | Timeouts canoniques, KeepAlive, logoff exact, politique de reconnexion, anti-patterns tueurs de session, divergences acceptées | `F§1`, `F§4` (régime permanent, logoff, reconnexion), `F§5`, `F§7` ; les catégories de timeout → `P§9` | §8 « WebClient Implementation Map » : vérifie chaque chemin, le code a bougé |
| `doc/building_details_protocol.md` | 711 | Familles `SetObject` / `GetPropertyList` / `CreateObject`+`SetPath` / `GetSubObjectProps`, liste des propriétés, notes de fil | `V§2`, `V§4`, `V§5` ; la séquence d'ouverture d'inspecteur → `F§4` | Son pseudo-code « pour développeur client » est de la prose tutorielle : à jeter |
| `doc/voyager-handler-reference.md` | 1214 | Les commandes RDO émises par chaque handler du client Delphi de référence — 158 occurrences RDO | `V§2` / `V§3` / `V§4` pour le fil ; les chaînes par panneau → `F§4` | Recouvre `doc/facility-tabs-reference.md`. Le **résidu non-RDO** (mapping onglet↔handler, config UI) se fusionne dans `facility-tabs-reference.md`, et ce fichier disparaît |

### 2.2 À dégraisser sur place (ils restent, on en retire les doublons RDO)

| Fichier | Ce qu'on retire | Ce qu'on laisse |
|---|---|---|
| `doc/spo-original-reference.md` | « RDO Dispatch Rules », « Delphi Type → RDO Prefix Mapping », « RDO Error Codes » → remplacés par un pointeur vers `P§6` / `P§3` / `P§7` | Son rôle d'**index de la source Delphi** : les listes de membres par classe avec `File.pas:Line`, matière première de `V§2`. **Il contient des erreurs connues** : il a classé `SayThis` et `AddLine` en `function … olevariant` sur la foi d'un site d'appel *client*, ce qui a caché la première forme létale (voir le commentaire de `VOID_MEMBERS`, `src/server/session/rdo-request-guards.ts:43-48`). Corrige-les et journalise la correction en `V§9` |
| `doc/facility-tabs-reference.md` | Les faits de fil (verbes, membres, préfixes) → `V` | La configuration des onglets, `CLASSES.BIN`, les classes visuelles + le résidu de `voyager-handler-reference.md` |
| `doc/voyager-inspector-architecture.md` | Les faits de fil → `V` / `F` | L'architecture d'inspecteur côté UI |
| `doc/research-system-reference.md`, `doc/supply-system.md` | Les faits de fil → `V` / `F` | La mécanique de jeu |
| `doc/architecture-overview.md` | — | Mettre à jour les pointeurs vers les 3 nouveaux docs |
| `doc/rdo-conformance-suite.md`, `doc/mock-server-guide.md` | Toute **règle de protocole** qu'ils énoncent → `P`, avec pointeur en retour | Ce sont des docs d'outillage : ils restent |

### 2.3 Preuve — intouchable

`doc/Mock_Server_scenarios_captures.md` (4158 l., 14 scénarios numérotés),
`doc/building_details_rdo.txt` (trames brutes d'inspecteur),
`src/mock-server/scenarios/captured/*`, `report/campaign/rec/*.ndjson`, `.rdo-live/raw/`.

Une seule décision à prendre ici, et elle est vérifiable : **vérifie si chaque trame de
`doc/building_details_rdo.txt` figure déjà dans `Mock_Server_scenarios_captures.md`.** Si oui,
le fichier est une preuve redondante et tu le supprimes en le disant dans le CR. Si non — et
c'est l'hypothèse probable, il porte des trames `GetInputNames` / `SetPath` /
`GetSubObjectProps` que je n'ai pas vues ailleurs — **il reste, tel quel**, et `V§4` / `V§5`
le citent.

### 2.4 Hors périmètre, ne pas toucher

`doc/prompts/*` (dont ce fichier), `doc/parcours/*` (instruments de campagne — tu les **lis**
comme source de `F§4`, tu ne les édites pas), `doc/BACKLOG.md`, `doc/BACKLOG-OPEN.md`,
`doc/E2E-*.md`, `doc/PROCESSUS-CAPTURE.md`, tout `report/*` existant, tout le rendu
(`texture-*`, `road_*`, `concrete_*`, `CANVAS2D-*`, `CAB-EXTRACTION`), sécurité, logging.

### 2.5 Automation vivante — à mettre à jour (obligatoire)

Ce ne sont pas des archives : elles pilotent les sessions futures. Si elles pointent vers un
fichier supprimé, la mission a échoué.

`CLAUDE.md` · `README.md` · `.claude/hooks/context-router.sh` (le `case` RDO et le `case`
session) · `.claude/skills/rdo-conformity/SKILL.md` ·
`.claude/skills/rdo-network-resilience/SKILL.md` · `.claude/skills/delphi-archaeologist/SKILL.md`
et ses `resources/*` · `.claude/skills/code-guardian/SKILL.md` ·
`.claude/skills/starpeace-server-logs/SKILL.md` · `.claude/skills/spo-testing/SKILL.md`
(si concerné) · `.claude/agents/rdo-conformity-auditor.md` · `.claude/agents/security-reviewer.md` ·
`.claude/hooks/conformance-gate.sh` · `.github/pull_request_template.md` ·
`src/server/CLAUDE.md`, `src/shared/CLAUDE.md`, `src/mock-server/CLAUDE.md`,
`src/client/CLAUDE.md`.

Après édition d'une skill : `node .claude/generate-skills-manifest.js` puis
`node .claude/generate-skills-manifest.js --check`.

---

## 3. Les sources de vérité machine

Un document est faux dès qu'il contredit ces artefacts. Ils ne s'invoquent pas « si besoin » :
`V` et `F` se **construisent** à partir d'eux, et le corpus `doc/` ne sert qu'à les expliquer.

| Source | Ce qu'elle tranche |
|---|---|
| `src/shared/rdo-types.ts` (protégé, lecture seule) | Préfixes, encodage booléen, API `RdoValue`/`RdoCommand`/`RdoParser` |
| `src/server/rdo.ts` (protégé, lecture seule) | Framing réel, envoi, corrélation des QueryId |
| `src/server/session/rdo-request-guards.ts` | `VOID_MEMBERS` (chaque entrée cite sa déclaration Pascal), `assertNotVoidPush`, les gardes — **la liste des membres létaux de `V§8` en descend directement** |
| `src/mock-server/rdo-strict-validator.ts` | Spécification exécutable du fil : ce que le validateur refuse est une règle de `P` |
| `src/shared/timeout-categories.ts` | Les catégories de timeout de `P§9` et la colonne timeout de `V§2` |
| `src/server/spo_session.ts` (`SessionPhase`, ~2900 l.) | Le modèle d'état de `F§2` : phases réelles, `worldContextId`, pool de connexions |
| `src/server/session/*-handler.ts` (30 fichiers) | Les sites d'émission : colonne « emit site » de `V§2`, colonne `SURFACE` de `F§4` |
| `src/tools/conformance/suites.ts` | Le catalogue de conformité : ce qui est prouvé, et sous quelle forme |
| `src/tools/conformance/extract/extract-rdo-arity.js` | **L'extracteur d'arité et de kind.** `node src/tools/conformance/extract/extract-rdo-arity.js ../SPO-Original --report` — la seule façon licite d'obtenir le *kind* d'un membre |
| `.rdo-live/inventory.ndjson` (298 lignes, **217 membres distincts**) + `.rdo-live/README.md` | Le dénominateur de `V§2` : classe, transport, verbe, séparateur émis, binding, profil d'arguments, site d'émission, tier |
| `../SPO-Original` | `RDOProtocol.pas`, `RDOUtils.pas`, `RDOObjectServer.pas`, `RDOQueryServer.pas`, `WinSockRDOConnection*.pas`, `RDOMarshalers.pas`, `RDOConnectionPool.pas`, `ErrorCodes.pas`, `InterfaceServer.pas`, `DirectoryServer.pas`, `MailServer.pas`, `CachedObjectWrap.pas`, `Kernel/Kernel.pas` |

**Attention sur `inventory.ndjson`** : il contient du bruit à classer, pas à recopier —
`unknown`, `MessageList.asp`, `ifelratings.asp`, `tycoonratings.asp`, `popularratings.asp`,
`links`, `idof`, `REQ_RDO_DIRECT`, `WS`. Les `.asp` sont du **transport C (HTTP)**, pas du RDO :
ils vont en `V§7` avec la raison de leur exclusion, pas dans la table des membres.

---

## 4. Contrat de forme — obligatoire pour les trois documents

C'est ici que se joue « à destination d'une IA ». Chaque règle est vérifiable.

1. **Anglais, LF, sans emoji, sans `✅`/`❌`/`📝`.** Aucune section de statut, d'avancement,
   d'historique de chantier, de « benefits », de « migration guide ». Pas de « nous », pas de
   récit. Un document d'état, au présent.

2. **Bloc d'en-tête à champs fixes**, identique dans les trois, en tête de fichier :
   `DOC-ID`, `PURPOSE` (une phrase), `SCOPE` (ce qui est ici), `NOT-HERE` (ce qui n'est pas ici
   **et où c'est**, par DOC-ID), `SIBLINGS`, `SOURCE-OF-TRUTH` (les chemins du §3 qui gouvernent
   ce doc), `EVIDENCE-TAGS` (la légende, règle 5), `LAST-VERIFIED` (date), `INVARIANTS`
   (ce qui ne doit jamais être contredit).

3. **Identifiants stables.** Chaque section porte un ID (`P§4.2`, `V§2`, `F§4.C6`). Chaque
   règle normative porte un ID court (`P-R07`). Chaque chaîne porte un ID (`F-C06`). Les IDs
   sont **permanents** : on n'en renumérote jamais un. Un fait retiré laisse sa ligne avec
   `SUPERSEDED BY <id>`. Les IDs sont ce que le code, les skills et les CR citeront.

4. **Un fait, un seul foyer.** Zéro duplication entre les trois documents ; zéro duplication
   interne. Un renvoi se fait par ID, jamais par recopie. Si tu te vois écrire deux fois la
   même table, l'une des deux est un lien.

5. **Étiquette de provenance sur chaque affirmation non triviale.** Aucune ligne de table
   normative sans étiquette :
   `[CAP:<fichier>#<section>]` capture · `[PAS:<File.pas:Line>]` Delphi ·
   `[SRC:<chemin:ligne>]` notre code · `[LIVE:<YYYY-MM-DD>]` incident ou run live daté ·
   `[INFERRED]` déduction assumée · `[UNKNOWN]` trou identifié.
   `[INFERRED]` et `[UNKNOWN]` sont autorisés et souhaitables ; les faire passer pour des faits
   ne l'est pas.

6. **Tables plutôt que prose.** Une ligne = un fait. Cellules courtes ; au-delà d'environ
   120 caractères, la cellule renvoie à une note numérotée sous la table. La prose n'est admise
   que pour un mécanisme qu'aucune table ne rend (par exemple où atterrit le pointeur de
   résultat caché) — et elle reste sous dix lignes.

7. **Index plat en tête**, après le bloc d'en-tête : la liste de tous les IDs du document avec
   leur titre, une ligne chacun. C'est la table de navigation de l'IA.

8. **Tout exemple de trame est un verbatim**, en bloc de code, suivi de sa provenance
   (règle 5). Aucune trame reconstituée, aucune trame « illustrative ». Même règle pour les
   réponses serveur, erreurs comprises.

9. **`P§0` est un bloc de danger**, avant toute autre chose dans `RDO-P` : les deux formes
   létales, le corollaire « pas de déclaration, pas de trame », et le renvoi vers `V§8`.

10. **Profondeur maximale `###`.** Pas de HTML, pas de section repliable, pas de tableau
    imbriqué. Liens relatifs uniquement.

11. **Greppabilité.** Un membre s'écrit toujours avec sa casse exacte du fil, jamais abrégé,
    jamais pluralisé dans un identifiant. Il apparaît **une fois** en ligne canonique dans
    `V§2` ; partout ailleurs, c'est une citation.

12. **Une section `UNKNOWNS` unique par document**, en fin : la question, ce qui la trancherait,
    et qui peut la trancher. Aucune feuille de route, aucun TODO, aucun « future enhancement ».

13. **Longueur : la complétude passe avant la brièveté.** Aucun fait ne se perd pour
    raccourcir. Si un document devient très long, il s'organise par index (règle 7) — il ne se
    scinde pas en un quatrième fichier.

14. **Bloc lisible-machine quand la structure s'y prête.** `F§2` porte un bloc `STATE-DAG`
    (arêtes `requires → produces`) en JSON clôturé. `V§2` reste une table markdown, mais ses
    colonnes sont figées et dans un ordre stable.

---

## 5. `doc/rdo-1-protocol.md` — plan imposé

| ID | Contenu |
|---|---|
| `P§0` | **LETHAL FORMS** — les deux formes létales, le corollaire, renvoi `V§8`. Doit rester équivalent au tableau de `CLAUDE.md` : en cas de divergence, c'est `CLAUDE.md` qui a raison |
| `P§1` | Transport et framing : octets, lignes `C`/`A`, QueryId, terminateur, CP1252, échappement, découpage, réponse `ServerBusy` malformée (`A` + `error 17` sans QueryId ni `;`) |
| `P§2` | Grammaire : formes de requête (`call`, `get`, `set`, `sel`, …) en notation formelle exacte ; formes de réponse ; forme d'erreur |
| `P§3` | Système de types : les 7 préfixes (une seule table, arbitrée), booléens (`-1` à l'émission / non-nul à la lecture), chaînes courtes vs OLE, paramètres par référence, `single`/`double` toujours empilés |
| `P§4` | **Matrice QueryId × séparateur**, complète, avec pour chaque case : légalité, preuve, conséquence de la violation. Plus la procédure de détermination du *kind* d'un membre (`extract-rdo-arity.js`), qui est la seule licite |
| `P§5` | Construction des arguments : convention de registres Delphi (EDX puis ECX ; `varVariant`/`varInteger`/`varOleStr` consomment un registre, `varSingle`/`varDouble` jamais), arité = déclaration, règle du RID |
| `P§6` | Sémantique de dispatch serveur : `MethodAddress`, `published` seulement, RTTI, fallthrough du `GET`, absence de fallthrough du `SET`, priorité de thread |
| `P§7` | Erreurs : table des codes (`ErrorCodes.pas`), ce que chacun signifie **pour l'appelant**, lesquels sont fatals à la session, lesquels signalent une corruption serveur |
| `P§8` | Canal push : enregistrement, filtrage, ordonnancement, ce qui invalide un abonnement |
| `P§9` | Timeouts au niveau protocole : les catégories de `src/shared/timeout-categories.ts` et leur justification. La *politique* de session est en `F` |
| `P§10` | Comment émettre dans ce dépôt : `RdoValue` / `RdoCommand` / `RdoParser` / `sendRdoRequest()`, ce que les gardes refusent et pourquoi. Contrat d'API, pas tutoriel |
| `P§11` | Hiérarchie de preuve et procédure d'arbitrage d'un conflit |
| `P§12` | Aide-mémoire compacte : un seul bloc, tout le protocole |
| `P§13` | `UNKNOWNS` |
| `P§R` | **Retired sources** — table de correspondance `ancien chemin (+ section) → ID de destination`, pour que les archives restent résolvables |

---

## 6. `doc/rdo-2-vocabulary.md` — plan imposé

| ID | Contenu |
|---|---|
| `V§0` | Mode d'emploi : clé de la table, ordre des colonnes, comment ajouter un membre, ce qui interdit d'en ajouter un sans déclaration |
| `V§1` | **Objets et ObjectId** : une ligne par classe adressable (`TDirectorySession`, `TInterfaceServer`, `TClientView`, `TWorld`, `TMailServer`, `TMailMessage`, `TCachedObjectWrap`, `TBlock`/`TFacility`, `TResearchCenter`, itérateurs…) : comment on obtient son ObjectId, sur quelle connexion il vaut, ce qui l'invalide, quel service le publie |
| `V§2` | **La table des membres.** Colonnes figées : `member` · `class` · `service` · `pascal kind` · `paramCount` / `regParams` · `param types` · `verb(s)` · `separator` · `RID required` · `timeout cat` · `our emit site` · `live status` · `flags` · `evidence`. Couverture minimale : les **217 membres distincts** de `.rdo-live/inventory.ndjson`, chacun classé ou explicitement exclu en `V§7` |
| `V§3` | Propriétés (`get`/`set`) : nom, type, lisible/écrivable, objet porteur, preuve |
| `V§4` | **Vocabulaire des listes de propriétés** : les clés-chaînes de `GetPropertyList` / `GetSubObjectProps` / `GetPropArray` (`Creator`, `SecurityId`, `CurrBlock`, `srvSupplies0`, `cnxFacilityName0`, …), leur type, l'objet qui les répond, leur capture de référence. C'est le plus gros gisement de `building_details_protocol.md`, `facility-tabs-reference.md` et `building_details_rdo.txt` |
| `V§5` | Grammaire des chemins (`Companies\<co>\<facility>{x{y}.<world>\Inputs\<nn>.<fluid>…`) : segments, séparateurs, ce qui les produit, ce qui les consomme |
| `V§6` | Vocabulaire du push : évènements, charge utile, condition d'émission |
| `V§7` | **Non-RDO** : les membres de transport C / HTTP (`*.asp`, `links`, `idof`, `REQ_RDO_DIRECT`, `WS`, `unknown`) — exclus, chacun avec sa raison |
| `V§8` | **Membres létaux et interdits** : ce que `VOID_MEMBERS` couvre, ce qu'aucune trame ne doit viser, `#44 RDODisconnectFromTycoon` et son statut de porte ouverte volontaire |
| `V§9` | **Corrections** : classements antérieurs faux et leur rectification, avec la déclaration qui tranche (au minimum `SayThis`, `AddLine`, plus tout ce que tu trouves en vérifiant `doc/spo-original-reference.md`) |
| `V§10` | `UNKNOWNS` — dont tout membre sans déclaration retrouvée, marqué **inutilisable** |

---

## 7. `doc/rdo-3-services-and-flows.md` — plan imposé

C'est le document que le développeur a demandé le plus précisément : *quels services existent,
comment ils se parlent, et l'enchaînement complet des messages qui produit la logique métier
du client*. Son exemple canonique, à traiter comme test d'acceptation : **on s'identifie avant
de choisir un monde ; on a choisi un monde avant de pouvoir choisir une société ; on a choisi
une société avant de pouvoir entrer dans le monde.** Si `F` ne rend pas cette chaîne explicite,
mécaniquement vérifiable et sourcée, il est raté.

| ID | Contenu |
|---|---|
| `F§0` | **Topologie des services** : Directory Server, Interface Server, Cache / Object Cacher, Mail Server, News Server, Model / Kernel, transport C (ASP/HTTP). Par service : comment on découvre son hôte/port, quels objets il publie, ce qu'il authentifie, ce qu'il pousse, ce qui le tue |
| `F§1` | **Carte des sockets** : quelle chaîne vit sur quelle connexion, ce que le pool partage, ce qu'une chaîne ne doit jamais emprunter à une autre |
| `F§2` | **Modèle d'état** : chaque variable d'état (identité, RID, ObjectIds, `worldContextId`, société courante, focus, abonnements) + le bloc `STATE-DAG` lisible-machine des arêtes `requires → produces`. Aligné sur `SessionPhase` de `src/server/spo_session.ts` |
| `F§3` | **Table des préconditions** : par variable d'état, ce qui la produit, ce qui l'exige, ce qui l'invalide. C'est la forme normative de l'exemple ci-dessus |
| `F§4` | **Les chaînages**, une sous-section par chaîne, format uniforme (ci-dessous) |
| `F§5` | **Ordonnancements interdits** — la table des tueurs de session, chacun avec son symptôme observé |
| `F§6` | Durées de vie et invalidation : ce qui périme un ObjectId, ce qu'une reconnexion doit reconstruire et dans quel ordre |
| `F§7` | Divergences acceptées : là où notre comportement s'écarte du client Delphi, avec la décision et sa date (source : `rdo-session-lifecycle.md §9`) |
| `F§8` | `UNKNOWNS` |

**Format imposé de chaque chaîne `F§4.Cnn`** — identique pour toutes :

```
F-Cnn  <name>
PRE:        <état requis, par ID de F§3>
SERVICE:    <service(s)>   SOCKET: <réf. F§1>
STEPS:      table — n | socket | target object | verb | member | args profile | sep |
                    expected response | produces | timeout cat | evidence
POST:       <état produit>
INVALIDATED-BY: <évènements qui cassent l'acquis>
FAILURES:   table — symptôme | cause | code d'erreur | récupération
SURFACE:    <fichiers src/ qui l'implémentent>
```

**Couverture minimale des chaînes.** Une chaîne par geste métier réellement implémenté ; au
minimum : authentification annuaire · liste des mondes · sélection de monde et connexion à
l'Interface Server · liste des sociétés · sélection de société · entrée dans le monde ·
streaming de carte (`SegmentsInArea` / `ObjectsInArea` / `GetSurface`) · focus et push
(`SwitchFocusEx` → `RefreshObject`) · ouverture et lecture d'inspecteur · construction ·
routes et circuits · zonage · courrier · politique / mairie · recherche · commerce et
approvisionnement · profil et finances · régime permanent (`KeepAlive`) · déconnexion propre ·
reconnexion · chemins d'erreur et `ServerBusy`.

**Contrôle d'exhaustivité, mécanique** : énumère `src/server/session/*-handler.ts` et prouve
que chaque handler apparaît dans la colonne `SURFACE` d'au moins une chaîne. Un handler
orphelin est soit une chaîne manquante, soit du code mort — dans les deux cas, ça va au CR.

**Matière première de `F§4`** : `doc/rdo-session-lifecycle.md §4`, les scénarios 1 à 14 de
`doc/Mock_Server_scenarios_captures.md`, `doc/parcours/*.md`,
`report/gabarit-parcours-parc.md`, `src/mock-server/scenarios/captured/*`,
`src/server/session/login-handler.ts`, `src/server/spo_session.ts`.

---

## 8. Procédure — sept phases, dans l'ordre

**Phase 1 — lecture.** Le corpus §2.1 et §2.2 en entier, plus le §3. Tiens un journal de lecture
dans le scratchpad (`<scratchpad>/lecture.md`) : fichier, plages de lignes, faits saillants.

**Phase 2 — carte de recouvrement.** Dans le scratchpad : pour **chaque section** de chaque
fichier §2.1/§2.2, une ligne `fichier §section → destination (ID) | doublon de … | périmé |
à jeter (raison)`. Cette carte devient la table de couverture du CR (§9). Aucune rédaction
avant qu'elle soit complète : c'est elle qui garantit le zéro perte.

**Phase 3 — arbitrage.** Liste tous les conflits détectés — au minimum : les trois tables de
préfixes (`rdo-protocol-architecture.md §2.1`, `rdo_typing_system.md`,
`spo-original-reference.md`), les trois emplacements des codes d'erreur, la séquence de login
présente en trois versions, le statut du `^` porteur de valeur, le *kind* de
`SayThis` / `AddLine`. Pour chacun : énoncé A, énoncé B, verdict, preuve, méthode. Table
destinée au CR. **Un conflit non tranché par la hiérarchie devient `[UNKNOWN]` + escalade —
jamais un choix de rédaction.**

**Phase 4 — vérification mécanique.**
`node src/tools/conformance/extract/extract-rdo-arity.js ../SPO-Original --report` ; lecture de
`.rdo-live/inventory.ndjson` ; extraction des sites d'émission depuis `src/server/session/*` ;
réconciliation avec `suites.ts` et `VOID_MEMBERS`. Sortie : le squelette de `V§2`, chiffré.
Toute divergence entre extracteur et inventaire est un fait à documenter, pas à lisser.

**Phase 5 — rédaction, dans l'ordre `P` → `V` → `F`.** `V` cite `P` ; `F` cite `P` et `V`.
Écrire dans l'autre sens fabrique de la duplication.

**Phase 6 — migration des références.** §2.5 uniquement. Puis suppression des fichiers de §2.1,
une fois leur ligne de couverture verte. `git rm` conserve l'historique — pas de fichier
souche, pas de stub : `P§R` fait la correspondance.

**Phase 7 — vérification.** §11. Puis le CR.

---

## 9. Anti-perte : la table de couverture

Livrée dans `report/consolidation-doc-rdo.md`, une ligne par section source. Colonnes :
`fichier source` · `section` · `lignes` · `disposition` (`MERGED` / `DEDUPED` / `DROPPED` /
`KEPT-IN-PLACE` / `EVIDENCE`) · `destination (ID)` · `raison si DROPPED`.

**Un `DROPPED` sans raison explicite est un échec de la mission.** Les raisons admises :
statut de chantier, prose tutorielle, doublon exact (avec l'ID du foyer retenu), fait démenti
par une preuve supérieure (avec la preuve). « Peu utile », « verbeux », « obsolète » sans preuve
ne sont pas des raisons.

---

## 10. Migration des références

- Vivant (§2.5) : réécrit vers les nouveaux chemins **et les IDs** — profite de la migration
  pour remplacer `voir doc/x.md` par `voir doc/rdo-1-protocol.md P§4`.
- Archives (§2.4, `report/*`) : **jamais** réécrites. `P§R` les résout.
- Fichiers protégés : listés au CR (§12), non touchés.
- Après édition d'une skill : régénère le manifeste et passe `--check`.

---

## 11. Vérification et critères d'acceptation

Mesurables, tous. Reporte le chiffre obtenu pour chacun.

1. Les trois fichiers existent, avec le plan imposé, le bloc d'en-tête complet, l'index plat et
   des IDs conformes.
2. **Zéro affirmation normative sans étiquette de provenance.** Compte les lignes de table
   normatives et les lignes étiquetées ; les deux nombres doivent être égaux.
3. La table de couverture couvre **100 %** des sections de §2.1 et §2.2.
4. **Zéro lien mort** dans `doc/`, `.claude/`, `CLAUDE.md`, `README.md` : écris un petit script
   de vérification (dans le scratchpad, pas dans le dépôt) qui résout tous les liens relatifs.
5. Chaque `[SRC:chemin:ligne]` résout : le fichier existe et le symbole cité est bien à cette
   ligne. Script-le, donne le taux.
6. Chaque `[PAS:File.pas:Line]` résout dans `../SPO-Original`. Même traitement.
7. `node .claude/generate-skills-manifest.js --check` passe.
8. `P§0` reste équivalent au tableau des formes létales de `CLAUDE.md`.
9. `V§2` contient au moins les 217 membres distincts de `.rdo-live/inventory.ndjson`, chacun
   classé ou renvoyé en `V§7` avec sa raison.
10. Chaque `src/server/session/*-handler.ts` apparaît dans au moins un `SURFACE` de `F§4`.
11. L'exemple canonique du développeur est explicite et sourcé dans `F§3`.
12. `git status` ne montre **aucune** modification de fichier `.ts` sous `src/`.
13. `git diff --stat` : les trois nouveaux fichiers, les suppressions de §2.1, les dégraissages
    de §2.2, les mises à jour de §2.5, le CR. Rien d'autre.
14. Aucun commit, aucun push.

---

## 12. Ce que tu escalades, sans le décider

Dans une section « Décisions développeur » du CR, numérotées, chacune avec l'option que tu
recommandes et la preuve :

1. Les chemins de doc cités dans les fichiers protégés — liste, diff proposé, non appliqué.
2. Tout conflit non tranché par la hiérarchie de preuve.
3. Tout membre de `V§2` sans déclaration Pascal retrouvée (donc inutilisable : ni `^` ni `*`
   n'est sûr).
4. Toute suppression que tu voudrais faire hors de §2.1.
5. Tout fait faux découvert dans une archive `report/*` (signalé, non corrigé).
6. Le sort de `doc/building_details_rdo.txt` (§2.3), avec le résultat du test de redondance.
7. Le sort du résidu non-RDO de `doc/voyager-handler-reference.md` si la fusion dans
   `facility-tabs-reference.md` s'avère plus qu'un déplacement.

---

## 13. Modèle et effort

**Tout en Opus 5, effort `high`** est le choix par défaut et le plus sûr : les phases 3 et 5
sont un arbitrage sur les règles qui ont déjà cassé la production deux fois. `xhigh` si tu veux
la marge maximale sur la phase 3.

Découpage possible pour réduire le coût, **dans cet ordre et pas autrement** :

| Phase | Modèle | Effort | Pourquoi |
|---|---|---|---|
| 1, 2 (lecture, carte) | Opus 5 | `high` | Repérer un doublon *sémantique* entre deux formulations différentes, c'est du jugement |
| 3 (arbitrage) | Opus 5 | `xhigh` | Jamais autre chose. C'est la phase qui décide ce qu'une IA future croira du fil |
| 4 (extraction) | Fable 5 | `medium` | Mécanique : lancer l'extracteur, parser du NDJSON, croiser des tables |
| 5 (`P`, `F`) | Opus 5 | `high` | Rédaction normative et modélisation d'état |
| 5 (remplissage `V§2`/`V§4`) | Fable 5 | `medium` | Remplissage de colonnes depuis la sortie de la phase 4, une fois le gabarit figé par Opus |
| 6 (références) | Fable 5 | `low` | Réécriture de chemins, régénération du manifeste |
| 7 (vérification) | Fable 5 | `medium` | Scripts de contrôle, comptages ; **la lecture des verdicts revient à Opus 5** |

Si tu découpes, la carte de recouvrement (phase 2) et la table d'arbitrage (phase 3) sont le
contrat de passation : Fable 5 ne doit jamais avoir à décider ce qu'Opus 5 n'a pas tranché.

**Pas d'agents parallèles pour la rédaction.** Les trois documents se citent mutuellement par
ID ; deux rédacteurs simultanés fabriquent des IDs incohérents et de la duplication. La
délégation en lecture seule est admise à une condition : le sous-agent rend des **extraits
verbatim avec plages de lignes**, jamais un résumé, et tu lis le passage que tu rédiges.

---

## 14. Livrables

1. `doc/rdo-1-protocol.md`
2. `doc/rdo-2-vocabulary.md`
3. `doc/rdo-3-services-and-flows.md`
4. `report/consolidation-doc-rdo.md` — français : table de couverture (§9), table d'arbitrage
   (phase 3), chiffres des 14 critères (§11), décisions développeur (§12), et ce que tu n'as
   pas vérifié.
5. Les mises à jour de §2.5, les suppressions de §2.1, les dégraissages de §2.2.
6. Arbre non commité.

Le CR liste les skills utilisées (convention « Transparence » de `CLAUDE.md`).

**Et dis-le si ce prompt a tort.** Il a été écrit depuis une cartographie du corpus, pas depuis
sa lecture intégrale. Si une section que je classe « périmée » porte le seul fait sourcé sur un
point, garde le fait et signale-le : le corpus a raison contre le prompt.
