# Plan — Outil de conformité RDO live (remplacement du mock écrit à la main)

> **Statut : L1–L4 livrés, L5 codé (baseline sans run vert), L6 non démarré — 2026-08-16.**
> Journal des lots en [§9](#9-journal-dexécution). Doc utilisateur :
> [doc/rdo-conformance-suite.md](../doc/rdo-conformance-suite.md).
> **Objet :** transformer le harnais de sonde `src/tools/rdo-probe.ts` en suite de conformité
> protocolaire exécutable en continu, contre une instance serveur dédiée, sans UI.
> **Décisions actées en session :** moteur = la vraie `StarpeaceSession` ; le mock écrit à la
> main est remplacé ; scénarios hybrides (déclaratif + échappatoires impératives).
> **Entrée principale :** le bloc TODO de `src/tools/rdo-probe.ts:60-98`, écrit par la session
> qui a construit le harnais.

---

## 1. État des lieux — la graine est déjà bonne

`src/tools/rdo-probe.ts` (18 Ko) a **déjà** l'architecture retenue :

| Propriété visée | État | Emplacement |
|---|---|---|
| Pilote la **vraie** `StarpeaceSession` (pas de réimplémentation du fil) | ✅ fait | `emitProbeFrame` → `session.executeRdo` |
| Login réel complet `connectDirectory → loginWorld → … → Logoff` | ✅ fait | `main()` |
| Étagement du risque (`--live` obligatoire, `--allow-u1a`, `SAFE_PROBES`) | ✅ fait | `parseProbeArgs`, `ProbeRefusal` |
| Arrêt sur silence (une trame sans réponse ⇒ stop) | ✅ fait | `runProbe` |
| Types de résultat structurés | ✅ fait | `ProbeFrame` / `ProbeResult` |
| Identifiants par env (`SPO_PROBE_USER/PASS`) | ✅ fait | `parseProbeArgs` |
| Tests unitaires du harnais | ✅ fait | `src/tools/rdo-probe.test.ts` |

**Il ne faut pas repartir de zéro.** Le travail restant est de la généralisation, pas de
l'architecture — exactement ce que dit le TODO `rdo-probe.ts:60-98`.

### La garde statique existe déjà

`session/rdo-request-guards.ts` porte `VOID_MEMBERS` (5 membres, chacun avec sa déclaration
Pascal citée) et `assertNotVariantOnVoidMember`. C'est la **version statique** de la règle M8 ;
l'outil de conformité en sera la **version dynamique**.

### Correction à l'audit précédent

`audit-impact-serveur-rdo-2026-08-14.md` §S2 concluait : « côté `"^"`, tous des `function`,
**sauf trois** — `SayThis`, `CloseMessage`, `AddLine` ». **C'était incomplet.** Deux membres de
plus, au profil de gel identique (2 widestrings ⇒ `RegsUsed = MaxRegs` ⇒ `push edi`) :

- `RDOConnectInput` — `procedure( FluidId, Suppliers : widestring )`, `Kernel/Kernel.pas:1077`
- `RDOConnectOutput` — `procedure( FluidId, Clients : widestring )`, `Kernel/Kernel.pas:1078`

Émis **à chaque connexion de chaîne d'approvisionnement** (`building-property-handler.ts`).
Cause de l'angle mort : `doc/spo-original-reference.md` les classait `function … olevariant` en
citant un **site d'appel client** tardivement lié (`Voyager/SupplySheetForm.pas:295`) — la
confusion exacte qui avait masqué `SayThis`.

> **Règle à graver dans l'outil : la source de vérité d'un membre est sa déclaration Pascal,
> jamais un site d'appel, jamais un document de synthèse.**

### Le mécanisme est encadré des deux côtés (preuve live)

| Membre | Params | Pointeur caché | Résultat observé |
|---|---|---|---|
| `ClientAware` | 0 | en registre | **`A<rid> error 9;`** en 91 ms (2026-08-16) |
| `SayThis` | 2 | **sur la pile** (`push edi`) | **GEL** de l'IS (2026-08-15) |

`error 9` = `errIllegalFunctionRes` (`RDOQueryServer.pas:484`).

**Conséquence de conception majeure :** `"^"` sur une procédure à **0-1 paramètre** est
**détectable sans danger** — le serveur répond une erreur, jamais un ack. La suite peut donc
*vérifier activement* cette classe, et doit *interdire statiquement* la classe **≥2 paramètres**.

---

## 2. L'écart à combler

| # | Manque | Impact |
|---|---|---|
| 1 | Pas d'oracle par trame — attendus en Markdown, évalués à l'œil | ne peut pas faire échouer un build |
| 2 | Pas de sortie machine (`--json`) | inexploitable en CI |
| 3 | Pas de code de sortie piloté par les verdicts | une divergence passe inaperçue |
| 4 | Trames groupées par enquête (`u6`, `u4a`), pas par propriété testée | couvre l'historique, pas le protocole |
| 5 | Pas de transport rejouable | chaque exécution exige un serveur |
| 6 | Pas de baseline diffable | toute divergence exige un attendu écrit à la main |
| 7 | `RdoServerError` perd le texte brut (`error 3 setting X` → `error 3`) | le diff de baseline veut les octets |
| 8 | Aucun scénario applicatif (map, focus, details, mail, build…) | trames isolées, pas d'enchaînements |

---

## 3. Architecture cible

```
        Catalogue de suites (hybride : steps déclaratifs + hooks impératifs)
                              │
                   ┌──────────▼───────────┐
                   │  ConformanceRunner    │
                   │  · vraie StarpeaceSession
                   │  · injecte le transport
                   │  · oracle par step → verdict
                   │  · enregistre les octets
                   └────┬──────────────┬───┘
          transport=replay        transport=live
        ┌────────────▼─────┐   ┌──────▼──────────────────────┐
        │ socket mémoire    │   │ TCP réel → instance DÉDIÉE  │
        │ adossée à un      │   │ + corrélation logs serveur  │
        │ ENREGISTREMENT    │   │ + ENREGISTRE → baseline     │
        │ (CI, offline)     │   └─────────────────────────────┘
        └───────────────────┘              │
                  ▲                        │
                  └──── régénère ──────────┘
```

**La couture existe déjà** : `createSocket` est remplacé dans les tests
(`rdo-callsite-wire-format.test.ts`). Le transport = ce qui remplit la socket que la session
ouvre. La session de production reste **intacte**.

### Ce que « remplacer le mock » signifie

Pas « chaque test tape un serveur live » — ce serait lent, instable, dépendant d'une instance.
Lecture retenue :

> **Le live devient la source de vérité ; le mock cesse d'être écrit à la main et devient le
> *replay* des enregistrements live.** Plus personne n'édite `scenarios/*.ts` à la main. La CI
> rejoue le dernier enregistrement (rapide, déterministe, offline). Le run live (périodique /
> avant release) rafraîchit l'enregistrement et attrape les vraies divergences.

On supprime le **mock écrit à la main**, pas la capacité record/replay.

### Sécurité — l'outil comme application vivante de M8

1. **Statique** — `VOID_MEMBERS` + table des déclarations Pascal. Toute suite qui tenterait
   `"^"` sur une procédure ≥2 params est **refusée avant émission**. Non contournable.
2. **Cible** — `--target shared|dedicated`. Sur `shared`, toute mutation refusée. Sur
   `dedicated`, autorisée avec étape de reset obligatoire.
3. **Runtime** — arrêt sur silence (déjà présent) + budget de trames + logoff propre garanti.

---

## 4. Plan par lots

### L1 — Oracle et verdict *(aucun serveur requis)*
- `ProbeFrame.expect` : `{ kind: 'exact'|'pattern'|'predicate'|'errorCode', value }`.
- `evaluate(result, expect) → Verdict{ PASS|FAIL|UNKNOWN, detail }`.
- Rétro-équiper `u6`/`u4a`/`u1a` avec les oracles déjà écrits dans
  `report/campaign/sondes-live-U1-U6.md`.
- **Manque 1.**

### L2 — Sortie machine et code de sortie *(aucun serveur requis)*
- `--json` → `{ run, target, suites: [{ name, steps: [{...ProbeResult, verdict}] }] }`.
- Log humain conservé par défaut.
- `process.exitCode = 1` dès un `FAIL` ; `UNKNOWN` configurable (`--strict`).
- Corriger `RdoServerError` pour porter la **payload brute** — prérequis du diff L5.
- **Manques 2, 3, 7.**

### L3 — Transport rejouable *(aucun serveur requis)*
- `interface RdoTransport { openSocket(name, host, port): Promise<Socket> }`.
- `LiveTransport` (net.Socket) et `ReplayTransport` (socket mémoire adossée à un enregistrement).
- Injection via la couture `createSocket`.
- `Recorder` : capture octets in/out → format `scenarios/captured` (réutilise `capture:convert`).
- **Manque 5.** À ce stade la suite tourne **offline**.

### L4 — Catalogue de suites *(hybride)*
Regrouper par **propriété testée**, pas par enquête. `u6`/`u4a` disparaissent.

| Suite | Ce qu'elle épingle | Mutations |
|---|---|---|
| `types` | préfixes `# $ % @ ! ^ *`, booléens `#-1`, doubles | aucune |
| `separators` | matrice M8 : `"^"`/fonction OK, `"*"`/procédure OK, **`"^"`/procédure 0-1 param ⇒ `error 9`** | aucune |
| `errors` | grammaire `error N`, `error N getting/setting X`, contrat `errorCode` | aucune |
| `lifecycle` | login, `EnableEvents`, `PickEvent`, `ClientAware`, logoff propre | aucune |
| `reads` | map, focus, details, mail, politics, research | aucune |
| `mutations` | build, upgrade, roads, zones, chat, cookies | **dédiée + reset** |

Steps déclaratifs `{op, args, expect}` + hooks impératifs pour les enchaînements à état
(`focus→details`, `lock→build→verify`).
- **Manques 4, 8.**

### L5 — Baseline et diff *(serveur dédié)*
- `--record-baseline` sur un run vert connu ; `--diff-baseline` signale toute divergence
  d'octets, même sans attendu écrit. Détecte un changement serveur **non anticipé**.
- **Manque 6.**

### L6 — Bascule du mock et CI
- Régénérer `scenarios/captured/*` depuis les enregistrements live.
- Retirer les scénarios **écrits à la main** ; `RdoMock` devient le moteur de replay de L3.
- CI : `conformance --transport replay` sur chaque PR ; en local la porte git (rejeu puis live avant tout
  `git commit`/`git push`, règle développeur 2026-08-16) remplace la cadence « nocturne / avant release ».
- ⚠️ **Ne pas démarrer L6 tant que la session parallèle n'a pas commité** (elle travaille sur
  `src/mock-server/` et `src/server/session/`).

---

## 5. Ordonnancement

```
L1 ─┬─> L2 ─┬─> L5 ──> L6
    │       │
    └─> L3 ─┴─> L4
```

**L1+L2+L3 sont livrables sans aucun serveur** — ~70 % de la valeur (suite exécutable,
verdictable, CI-able), zéro risque. **L4** parallélisable avec L3 (c'est de la donnée).
**L5+L6** exigent l'instance dédiée et la fin des travaux de la session parallèle.

---

## 6. À décider / fournir

| # | Question | Bloque |
|---|---|---|
| 1 | **Coordonnées de l'instance dédiée** : host directory, monde, port IS, compte | L5, L6 |
| 2 | L'instance est-elle **réinitialisable** (restore backup monde) ? Sinon les suites `mutations` doivent être auto-nettoyantes | L4 |
| 3 | `UNKNOWN` doit-il faire échouer la CI par défaut ? | L2 |
| 4 | ~~Fréquence du run live~~ **Tranché le 2026-08-16 (soir)** : rejeu socket mémoire puis run live **avant chaque envoi git** ; le hook `conformance-gate.sh` bloque `git commit`/`git push` tant que les deux ne sont pas validés sur les sources courantes (CLAUDE.md § Git, doc §11). Remplace les cadences précédentes. | — |
| 5 | Confirmer la lecture de « remplacer le mock » (§3) | L6 |

---

## 7. Risques

- **Couplage à l'API `StarpeaceSession`** — assumé, c'est le but. Tout refactor casse la suite,
  ce qui est le comportement souhaité.
- **Gel du serveur dédié** — impossible par construction pour les membres connus, *à condition*
  que la table Pascal reste à jour. **L'ajout d'un membre à `VOID_MEMBERS` doit exiger la
  citation `Fichier.pas:Ligne`** (déjà le cas — à préserver).
- **Dérive de la baseline** — un diff qui échoue souvent finit ignoré. Prévoir une
  ré-acceptation explicite, jamais automatique.

---

## 8. Hors périmètre

L'UI n'est pas testée (choix assumé : « E2E sans UI »). Rendu, Canvas et stores restent couverts
par les tests composant et la campagne Playwright.

---

## 9. Journal d'exécution

### 2026-08-16 — L1, L2, L3, L4 livrés ; L5 codé ; L6 non démarré

**Où :** `src/tools/conformance/` (`types.ts`, `oracle.ts`, `transport.ts`, `replay-transport.ts`,
`suites.ts`, `runner.ts`, `report.ts`, `cli.ts`, `run.ts`) + entrée `src/tools/rdo-conformance.ts`,
script `npm run conformance` (bundle esbuild, comme `capture:convert`). 130 tests, couverture des
nouveaux fichiers ≥ 98 % lignes. `src/tools/rdo-probe.ts` et son test sont **supprimés** — le
harnais est devenu la suite, les noms `u6`/`u4a`/`u1a` n'ont pas survécu (TODO item 4).

| Lot | Livré | Détail |
|---|---|---|
| L1 | ✅ | `Expectation` = `exact` / `pattern` / `errorCode(+payload)` / `predicate` / `answered` ; `evaluate()` → `PASS`/`FAIL`/`UNKNOWN`. Silence = `FAIL` quelle que soit l'attente ; pas d'attente = `UNKNOWN`. Les oracles U6/U4-a/U1-a sont rétro-équipés dans `types` et `separators`. |
| L2 | ✅ | `--json` (`RunReport`), log humain par défaut, `exitCode` (FAIL ⇒ 1, UNKNOWN ⇒ 1 sous `--strict`, silence ⇒ 1, refus CLI ⇒ 2). **`RdoServerError.payload`** ajouté (`session/rdo-error-contract.ts`, additif ; `spo_session.ts` passe `packet.payload`) — manque 7 clos. Le runner passe par `sendRdoRequest` et non `executeRdo`, pour obtenir `errorCode` + payload dans **les deux** modes du contrat (`observe` résout, `reject` lève). |
| L3 | ✅ | `RdoTransport` = fabrique de sockets injectée par `setSocketFactory` (la couture réelle, plus précise que `createSocket`). `LiveTransport` : `net.Socket` + tap bidirectionnel (framer de production côté entrée), enregistreur en **dialecte NDJSON du log passerelle** (`RDO>> / RDO>* / RDO<<`) — `capture:convert` l'accepte tel quel, identifiants expurgés à l'enregistrement. `ReplayTransport` : socket mémoire par *purpose* (`directory_auth`/`directory_query`/`world`…), réponse = échange dont la requête est octet-identique (QueryId mis à part) et non consommé, puis repli `RdoMock`. Preuve : la vraie `StarpeaceSession` fait login annuaire + monde sur la capture live `login-full` (2026-07-03) sans mock `net`. |
| L4 | ✅ (périmètre honnête) | 6 suites, 26 étapes, toutes avec oracle et citation. `reads` se limite aux propriétés monde et au blob de cookies : map/focus/details/mail exigent des objets connus (instance dédiée, Q1). `mutations` : `SetTycoonCookie` (push `"*"` sans QueryId, 3 params) → `GetTycoonCookie "^"` ; `SayThis "*"`+QueryId ⇒ ack vide ; **auto-nettoyante** (dernière étape remet le cookie à vide — réponse à Q2 par construction). |
| L5 | ⏳ code prêt, run vert manquant | `--record-baseline` / `--diff-baseline` (octets par étape, `changed`/`added`/`missing` ; ré-acceptation explicite seulement). Aucune baseline ni aucun enregistrement n'est livré : le premier run `--transport live --record` les produit. |
| L6 | ⛔ non démarré | Feu vert explicite requis + commit de la session parallèle. Le moteur de rejeu (RdoMock + exact-first) est en place. |

**Garde statique (M8, §3).** `KNOWN_PROCEDURES` = `VOID_MEMBERS` (repris du gardien de production, arité
lue sur la déclaration) + `ClientAware` (0), `ClientNotAware` (0), `SetTycoonCookie` (3), `SetLanguage` (1).
`assertSuitesSafe()` s'exécute **au chargement du module** : une étape déclarative avec `"^"` sur une
procédure à paramètres ne peut pas exister ; une procédure à 0 paramètre exige `risk: 'variant-on-procedure'`
(⇒ `--allow-variant-on-procedure`, jamais dans `all`). Les étapes impératives subissent le même contrôle
à l'émission (`StepContext.emit`) ; les pushes passent par `writeRdoFrame` avec `"*"` imposé.

**Déclarations Pascal vérifiées en séance** (`../SPO-Original`, `grep -n`) :

| Membre | Déclaration | Note |
|---|---|---|
| `ClientAware` | `procedure ClientAware;` — `Interface Server/InterfaceServer.pas:196` | ⚠ le harnais, `login-flow.test.ts:96` et plusieurs docs citaient **:197** — décalé d'une ligne (:197 = `ClientNotAware`) |
| `ClientNotAware` | `procedure ClientNotAware;` — `InterfaceServer.pas:197` | |
| `SetLanguage` | `procedure SetLanguage( langid : widestring );` — `InterfaceServer.pas:198` | |
| `SetTycoonCookie` | `procedure SetTycoonCookie( TycoonId : integer; CookieId, CookieValue : widestring );` — `InterfaceServer.pas:163` | 3 params ⇒ `"^"` gèlerait ; production l'émet en push, **non listée dans `VOID_MEMBERS`** — à ajouter côté gardien de production (hors périmètre de cette session, répertoire de la session parallèle) |
| `GetTycoonCookie` | `function GetTycoonCookie( TycoonId : integer; CookieId : widestring ) : OleVariant;` — `:162` | |
| `PickEvent` | `function PickEvent( TycoonId : integer ) : OleVariant;` — `:166` | |
| `CompositeName` | `property CompositeName : string read GetCompositeName;` — `:127` | le rapport U6 citait :141 (= `MailAccount`) |
| grammaire `getting` | `RDOQueryServer.pas:278` (`CreateErrorMessage(ErrorCode) + ' getting ' + PropName`), `:300`/`:308` en multi-propriétés | |
| grammaire `setting` | `RDOQueryServer.pas:344`, `:346` | |
| `sel <id>` | `theObject := TObject( ObjectId )` — `RDOObjectServer.pas:77`, `:136`, `:205` : **transtypage brut de pointeur**. Aucune étape n'envoie d'id arbitraire ; pas de sonde `errIllegalObject`. | |

**Le plan était faux sur un point.** §4 L3 nommait la couture `createSocket` ; la couture réelle et
plus fine est `setSocketFactory` (déjà utilisée par `protocol-test-harness.ts`), qui garde intact le
`createSocket` de production (Nagle, framer, reconnexion). Adopté.

**Décisions prises en l'absence de réponse (§6).** Q3 : `UNKNOWN` ne fait pas échouer par défaut,
`--strict` existe. Q2 : la suite `mutations` est auto-nettoyante quoi qu'il arrive. Q5 : lecture §3
implémentée (le rejeu = enregistrement live, pas de scénario édité à la main).

### 2026-08-16 (soir) — premier run live, lecture seule, autorisé par le développeur

Rapport : [campaign/conformance-run-2026-08-16.md](campaign/conformance-run-2026-08-16.md). **54 PASS / 0 FAIL /
1 observation / 4 skips**, exit 0 ; logs serveur : bracket par ClientViewId, `Clients` exit code 0, 0 trou de
heartbeat, 1 anomalie IS non attribuable avec certitude (`Error in RefreshTycoon`, autre joueur connecté).
Ajouts : `server-logs.ts` (corrélation logs publics), `wire-view.ts`, `ctx.scenario()`/`StepSkip`, 7 suites de
scénarios (`map focus inspector chat mail politics research`), `--company` / `--server-logs` / `--report`, chargement
CLASSES.BIN. Enregistrement complet + baseline livrés (`report/campaign/rec/`) → **L5 : baseline enregistrée sur run
vert** (serveur partagé, lectures) ; le rejeu hors ligne du run passe (35/35 sur le sous-ensemble testé).
Découvertes : `get ServerBusy` répond en 7,7 s ; `SwitchFocusEx` en CRLF ; forme `GetChannelInfo` ; `CloseMessage "*"`
+QueryId acké ; `error 5 getting X` confirmé. Piège Node corrigé (`connect` réinitialise `write`).
Classification des 75 scénarios A/A′/B/C dans le rapport §5 ; ce qu'il faut du développeur pour B : instance dédiée
ou feu vert mutations + Q1–Q11, une ville/mairie pour `getPoliticsData`, un bâtiment de recherche, un `fluidId`.

**Fichiers touchés hors `src/tools/`** : `src/server/session/rdo-error-contract.ts` (+`payload`, +2
tests), `src/server/spo_session.ts` (1 ligne, passe `packet.payload`), `package.json` (script),
`doc/rdo-conformance-suite.md` (nouveau), `doc/rdo-protocol-architecture.md` (§2.1.1 pointeur),
`.claude/hooks/context-router.sh` (route « conformance »).
