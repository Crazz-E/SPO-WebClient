# Lots R1 + R2 + R3 — nettoyage, garde-fous, socle de connexion

**2026-08-18.** Exécution en série, sans agent ni workflow, dans l'ordre du prompt.
Plan en vigueur : [plan-certification-rdo-rev4.md](plan-certification-rdo-rev4.md).

**Aucune trame n'est partie. Aucun run live. Aucun test E2E d'interface.**
Seuls des rejeux hors ligne contre `report/campaign/rec/planitia-2026-08-17.ndjson`.

| Vérification | Résultat |
|---|---|
| `npm run typecheck` | ✅ vert (les deux tsconfig) |
| `npm test` | ✅ **6 414 tests passés**, 0 échec, 5 sautés |
| `npx jest --testPathPatterns "conformance\|rdo-request-guards"` | ✅ 475 passés |
| Rejeu hors ligne `--suite all` | ✅ **60 PASS, 0 FAIL**, 1 UNKNOWN, 13 sautés |
| Couverture des fichiers touchés | ✅ 95,0 % à 100 % en lignes (détail §2.6) |

⚠ **Une action reste à faire par le développeur : la suppression des 4 fichiers `sweep*`.**
Voir §1.2 — le classificateur de permissions a refusé `rm` et `Remove-Item`.

---

## 1. R1 — le nettoyage

### 1.1 Le gabarit parc, archivé AVANT toute suppression

**[report/gabarit-parcours-parc.md](gabarit-parcours-parc.md)** — 200 lignes.

Contient, verbatim et annoté : le JSDoc de la séquence, `PARK_PATTERN`, les cinq steps
(`FACILITY_LOCATE`, `FACILITY_CLASS`, `FACILITY_DEMOLISH`, `FACILITY_REBUILD`,
`FACILITY_VERIFY`) et la `Suite` qui les assemble avec son `reset`. Plus : d'où ça vient, à quoi
ça sert (parcours **P6** du lot R4), les imports à rétablir, le remplacement de `SWEEP_STATE` par
une clé locale, le piège `assertSuitesSafe` à l'import, et ce qu'il faudra revérifier en R4.

### 1.2 ⚠ Suppression bloquée — action développeur requise

Les quatre fichiers sont **décrochés** (plus aucun import de production ne les référence) mais
**toujours présents sur le disque** : le classificateur de permissions a refusé `rm` via Bash puis
`Remove-Item` via PowerShell.

```bash
rm src/tools/conformance/sweep.ts \
   src/tools/conformance/sweep-plan.ts \
   src/tools/conformance/sweep.test.ts \
   src/tools/conformance/sweep-plan.test.ts
```

**Vérifié avant de laisser ça en l'état :** les quatre sont auto-suffisants — `sweep.ts` importe
`sweep-plan.ts`, `shared/*` et `session/rdo-request-guards`, jamais `suites.ts` ni `cli.ts`. Les
orpheliner ne casse donc ni le typecheck ni les tests (leurs 82 tests passent encore, sur des
symboles qu'eux seuls utilisent). Après suppression, `npm test` doit repasser sans eux —
**aucun autre fichier ne les importe**, c'est vérifié par grep.

### 1.3 Décrochage

**`suites.ts`** — import `SWEEP_SUITES` retiré, étalement retiré, JSDoc de `SUITES` réécrit.
Le commentaire d'`assertPacketSafe` ne parle plus de la campagne morte ; **sa logique n'a pas
bougé**. La polarité ouverte (`if (!proc) return` dans la bande de danger) est **conservée** et son
commentaire dit maintenant pourquoi elle reste ouverte et pourquoi elle est inatteignable en
pratique sous la rév. 4 — au lieu de renvoyer à un « S5 » qui n'existera pas.

**`cli.ts`** — import retiré, texte d'usage réécrit, et le filtre remplacé par la constante
documentée demandée :

```ts
export const NOT_REPLAYABLE: ReadonlySet<string> = new Set();
```

**`--allow-variant-on-procedure` conservé**, refus combiné avec `--suite all` conservé. Son motif
parlait **encore** du balayage (contrairement à ce que supposait le prompt §2.3) : réécrit, de même
que son jumeau dans `runner.ts:refusalReason` et les deux commentaires de test correspondants. Le
motif juste, troisième et dernière version : *le refus porte sur l'**exécution** du corps de méthode
sur le compte live, et `all` est le mode automatique où aucune décision ne peut être enregistrée.*

### 1.4 Le verrou de remplacement — et la preuve qu'il mord

Écrit en formulation positive dans `suites.test.ts`, avec le commentaire citant `GetUserList` et
le 2026-08-18 :

> Parcourir **toutes** les `SUITES` et refuser **toute étape déclarative qui émet `"*"` sur un
> membre absent de `VOID_MEMBERS`**.

**Preuve qu'il mord** (§8 du prompt) — un step fautif injecté dans `SEPARATORS_SUITE` :

```
× no declarative step in the catalogue emits "*" on a member absent from VOID_MEMBERS
  - Array []
  + Array [ "separators/bite-void-on-function -> call GetUserList \"*\"" ]
Tests: 1 failed, 31 passed
```

Un seul test échoue, et il **nomme le coupable**. Injection annulée, 32/32 verts.

Le verrou est doublé d'un second test qui rejoue la même fonction sur un catalogue fabriqué
(`GetUserList` refusé, `SayThis` accepté) : un refactor qui cesserait d'inspecter quoi que ce soit
— un `continue` mal placé, un `SUITES` vide — échoue là plutôt que de passer en silence.

### 1.5 Budget de trames — **mesuré**

`DEFAULT_FRAME_BUDGET` : **3000 → 600**.

Pour mesurer, `run.ts` **affiche désormais le compteur du runner à chaque exécution** —
`runner.emitted` existait en getter public et n'était jamais lu :

```
[conformance] frames emitted: 66 / 600 budget
```

| Configuration (rejeu hors ligne, planitia-2026-08-17) | Trames |
|---|---:|
| `--suite all` (13 steps sautés) | **66** |
| idem `+ --allow-mutations` (10 sautés) | **69** |
| apport de la suite `connexion` | **0** |

Soit ~8× de marge sur le tirage réel, pour les parcours P5-P12 de R4. Le commentaire `runner.ts`
porte les deux chiffres ; `runner.test.ts` assert la valeur **et** les deux bornes (`> 69×4`,
`< 69×16`), pour qu'un chiffre trop bas comme trop haut se voie.

---

## 2. R2 — les huit garde-fous

### 2.1 Détecteur de dégradation globale ✅

`runner.ts` : `MAX_CONSECUTIVE_ERRORS = 5`, compteur **porté par le run entier** (pas par suite),
`SuiteReport.stoppedOnDegradation`, `attributeDegradation()`, `runAll` s'arrête sur l'un ou l'autre.

**Calibration honnête, écrite dans le commentaire :** ça n'aurait **pas** empêché l'incident. Le
dégât était fait par la première trame ; ça borne le rayon, pas le risque.

⚠ **Correction de calibration que j'ai dû faire, et elle est importante.** La première version
comptait tout `errorCode`. Un rejeu de `--suite all` l'a déclenchée **immédiatement** : `types`
enchaîne **cinq** steps d'analyseur de littéraux dont l'oracle **est** `error 3`, et `errors` en
enchaîne trois de plus. Le run s'arrêtait à `types/literal-single-fractional` — 60 PASS retombés à
22. Un détecteur qui arrête une suite parce qu'elle fait exactement ce pour quoi elle est écrite est
désactivé dans la semaine.

Le compteur mesure donc **l'échec à réussir**, pas la présence d'un code d'erreur : une étape qui a
répondu `error N` **et passé son oracle** le remet à zéro. Ce qui reste est exactement le signal qui
manquait le 2026-08-18 — un serveur qui répond des erreurs là où le run attendait des valeurs.

L'attribution ne réutilise pas la phrase du silence : sur silence la dernière trame **est** le
suspect, sur dégradation elle n'est que le dernier **symptôme**. `formatSilenceAttribution` change
d'étiquette (`[degraded]`) et de phrase de clôture.

*Tests : 6 (`runner.test.ts`), dont l'arrêt inter-suites, le reset par un succès intercalé, et le cas
« cinq erreurs attendues ne déclenchent rien ».*

### 2.2 Sonde pré-vol ✅ — **avec une correction de fond**

`preflight()` dans `run.ts`, appelée avant le premier `connectDirectory`, **en live uniquement**.

⚠ **Le prompt demande `idof InterfaceServer` puis « un get trivial ». Les deux sont impossibles
tels quels, et la raison est dans le Pascal :**

1. **`idof InterfaceServer` n'est pas adressable à ce moment-là.** L'IP de l'Interface Server sort de
   la réponse annuaire ; avant `connectDirectory` il n'existe ni socket ni hôte. La sonde porte donc
   sur le **Directory Server** (`config.rdo.directoryHost:1111`), le seul hôte connu.
2. **Il n'existe aucun `get` trivial sans effet de bord.** `idof DirectoryServer` résout
   `TDirectoryServer` (`tidRDOHook_DirectoryServer`, `Directory Server/DirectoryServer.pas:145`), et
   cette classe publie **exactement un membre** : `function RDOOpenSession : olevariant` (`:110`) —
   le lire **crée** une `TDirectorySession`. Tous les autres membres du fichier appartiennent à
   `TDirectorySession`, qui n'existe pas encore. Un `get` sur un nom qu'on n'a pas répondrait
   `error 5` sur un serveur parfaitement sain et la sonde refuserait de démarrer : **un frein
   fantôme est pire ici qu'une trame de moins.**

La sonde est donc **`idof DirectoryServer`, et rien d'autre**. Ce n'est pas un pis-aller : `idof`
est intercepté par l'analyseur de requêtes **avant tout dispatch d'objet** — aucun état touché,
aucun corps de méthode exécuté — et c'est **l'oracle exact** de ce qu'on cherche, puisque le
2026-08-18 le serveur cassé répondait `error 1` à *toute* requête, `idof` compris : ce qui était
corrompu, c'était le répartiteur lui-même.

Refus sur erreur, sur payload commençant par `error`, et sur timeout. Socket détruit dans un
`finally` sur les deux chemins.

*Tests : 6 (`run.test.ts`), dont « une seule trame et c'est celle-là », le teardown sur les deux
chemins, et « un rejeu ne sonde jamais ».*

### 2.3 Assertion de phase ✅ — **et une découverte qui change l'énoncé**

⚠ **Le prompt demande `getPhase() === WORLD_CONNECTED` ET `getCurrentCompany() !== null` comme deux
contrôles indépendants. Ils n'en font qu'un.**

`SessionPhase.WORLD_CONNECTED` est posé sur la **dernière ligne de `selectCompany`**
(`login-handler.ts:616`, après le second `ClientAware`). Une session qui ne sélectionne pas
d'entreprise reste en `WORLD_CONNECTING` — légitimement, et pour toujours. Exiger
`WORLD_CONNECTED` sans condition **refuserait tout run `--no-company` et tout run de rejeu**, y
compris celui que le gate git rejoue à chaque commit. Je l'ai constaté en direct : la première
version de l'assertion a arrêté le rejeu net.

L'assertion est donc **fonction de ce qui a été demandé**, et dit quel contrat elle vérifie :

- entreprise sélectionnée → `currentCompany` non nul **et** phase `WORLD_CONNECTED` ;
- pas d'entreprise (`--no-company`, ou absence déclarée) → phase `WORLD_CONNECTING` ou mieux, et
  `worldContextId` non nul.

Les deux branches sont des arrêts durs ; aucune n'est un repli. Une ligne de journal résume ce qui
a été atteint : `[conformance] sequence complete — phase …, company …`.

Ce point est aussi la raison de la seule vraie inexactitude du plan rév. 4 (§8, points 3 et 4) que
ce lot corrige.

*Tests : 4 (`run.test.ts`), dont les deux refus nommés.*

### 2.4 Faux positif du rejeu, colmaté ✅

`run.ts` : une liste d'entreprises **vide** ne tombe plus dans le trou de
`if (!match && companies.length > 0)`.

- **live** → refus nommé, le run s'arrête ;
- **rejeu** → l'absence est **déclarée** (`CONNECTION_STATE.companySkipped`), aucune sélection n'est
  faite, `report.session.company` vaut `null`, et les steps qui ont besoin d'une entreprise se
  sautent avec leur raison. *Déclaré, jamais simulé.*

Ce colmatage **inverse un test existant** (`run.test.ts:131`), qui affirmait
`company: 'SPO_test3 - Green'` et la sortie de `PickEvent`/`ClientAware` dans un run où la liste est
vide : le test encodait le bug. L'inversion est commentée sur place.

*Tests : l'assertion inversée, un test dédié pour la branche live (transport forgé en `kind: 'live'`),
et 5 tests de la branche nominale « la liste existe vraiment » — la seule façon d'atteindre le chemin
qu'un run live emprunte, puisque le rejeu force `world.ip` sur la boucle locale.*

### 2.5 Liste noire de cycle de vie ✅ — **avec une exemption énumérée, et je la défends**

`rdo-request-guards.ts` : `SESSION_LIFECYCLE_MEMBERS` (les 12 membres demandés, chacun avec ce
qu'il fait) + `assertNotSessionLifecycleMember(packet, where)`.

**La garde porte sur la phase, pas sur le membre.** Le porteur de la phase est le **runner** :
tout ce qu'il émet est post-socle *par construction*, puisque `context()` résout `clientView` de
façon impatiente et ne peut pas exister avant le login. La suite `connexion` de R3 n'émet rien,
donc elle n'est jamais concernée.

⚠ **Problème que le prompt n'avait pas vu : deux steps du catalogue actuel émettent déjà des
membres de cette liste.**

| step | trame | adjugé par |
|---|---|---|
| `separators/set-acks-empty` | `set EnableEvents="#-1"` | capture :978-979 |
| `separators/variant-on-zero-param-procedure` | `call ClientAware "^"` | live 2026-08-16, `error 9` en 91 ms |

Un refus sec aurait cassé le catalogue livré. J'ai donc écrit `LIFECYCLE_ADJUDICATED` : une
**liste énumérée de deux `suite/step`, chacun avec sa citation**.

**Ce n'est pas le `probe` qui a laissé sortir la trame du 2026-08-18**, et la différence est de
nature : `probe` était un **drapeau** qui se généralisait à qui le demandait ; ceci est la forme de
`VOID_MEMBERS` — une liste blanche fermée où chaque entrée porte sa preuve, qui ne peut pas grandir
en silence. Les deux steps exemptés ré-émettent une valeur déjà posée par `selectCompany` ou sont
refusés par le serveur avant d'exécuter quoi que ce soit ; aucun ne rétablit de session.

**Non branchée dans `spo_session.ts`, délibérément** — la passerelle est précisément le code qui
émet légitimement ces douze membres, depuis les handlers de login, dans la phase que la garde
refuserait. Un test le vérifie en lisant le fichier.

*Tests : 6 côté garde + 5 côté runner. Constat au passage : `ClientAware`, `ClientNotAware` et
`SetLanguage` sont **déjà** refusés en amont par `assertPacketSafe` (ce sont des `procedure`
connues) — deux gardes indépendantes couvrant la même trame pour des raisons différentes. Le test le
nomme plutôt que de l'ignorer.*

### 2.6 `--record` dans le `finally` ✅

L'écriture de l'enregistrement est passée de la fin du run au `finally`, **juste après le teardown
et avant toute autre I/O**. Son propre échec est journalisé, **jamais relancé** : perdre
l'enregistrement ne doit pas en plus masquer l'erreur qui remonte.

*Tests : 3 — l'exception dans le bloc de connexion, la baseline malformée, et « `disk full` sur
l'enregistrement laisse remonter l'erreur réelle ».*

### 2.7 Signatures dures des logs serveur ✅ — **et un trou que le prompt n'avait pas vu**

`FATAL_SIGNATURES` + `fatalAnomalies()`, poussées dans `verdict.failures` (donc code de sortie 1).

⚠ **`Malformed query in TRDOQueryServer.ExecQuery` n'arrivait jamais dans `verdict.anomalies`.**
Le motif `TROUBLE` cherchait `error|exception|access violation|fail|timeout|survival|renewing` — la
ligne ne contient **aucun** de ces mots. La « promotion d'affichée à fatale » demandée par le prompt
aurait donc été un **no-op silencieux** : la ligne que le serveur partagé a écrite sur chaque
connexion pendant 75 minutes n'était même pas affichée.

Deux corrections : `malformed query` ajouté à `TROUBLE` (pour qu'elle soit affichée), et
`fatalAnomalies` lit **les lignes brutes du bracket**, jamais `anomalies` — chaîner les deux ferait
dépendre le détecteur fatal d'un filtre ambigu, ce qui est exactement comment le trou a survécu.

*Tests : 7, dont « c'est son propre oracle : il ne dépend pas de TROUBLE » et un bout-en-bout par
`correlateSession`.*

### 2.8 La ligne dans `spo_session.ts` ✅ — autorisation §5, portée respectée

Deux modifications, exactement celles autorisées, dans le bloc `:2345-2360` :

1. **`assertMemberNotForbidden(packetData)` appelée**, en tête du bloc de gardes, dans le même
   `try` / `catch (guardError)` qui relâche le slot de pool acquis.
2. **Le commentaire `:2350` corrigé.** Il ne dit plus *« the guard protects consistency, not the
   server »*. La formulation retenue : `"*"` + QueryId est sûr **sur une `procedure`** (forme du
   client de référence, prouvée en capture) et constitue une **écriture mémoire arbitraire sur une
   `function`** ; `assertNotVoidPush` est une **garde de sûreté** depuis le 2026-08-18, sans opt-in,
   et `VOID_MEMBERS` en est la liste blanche.

**Vérifié :** le bloc est dans `executeRdoRequest`, seul chemin auquel `sendRdoRequest` délègue —
la garde couvre donc les deux. Les 9 `writeRdoFrame()` directs ne la traversent pas, mais **tous
portent un membre codé en dur** (`KeepAlive`, `ClientNotAware`, `unfocusCmd`, `logonCmd`…) : le trou
est théorique aujourd'hui, réel le jour où un push prendra un membre dynamique. Signalé, non corrigé
— hors portée du §5.

*Tests : 3 dans `spo-session-lifecycle.test.ts`. Le plus important assert le **négatif** — les sept
membres refusés et **le compte de trames sur le socket inchangé** : un refus qui arrive après les
octets est une ligne de journal, pas une garde. Plus la casse (`rdoResetTycoon`), le verbe (`get`
aussi bien que `call`), et la restitution du slot de pool.*

---

## 3. R3 — la suite `connexion`

**`src/tools/conformance/connection-suite.ts`**, en **tête de `SUITES`**, 12 steps, **0 trame**.

| Step | Ce qu'il observe | Rejeu 2026-08-17 |
|---|---|---|
| `auth` | l'annuaire répond, la liste des mondes est non vide | ✅ `3 world(s): planitia, shamba, zorcon` |
| `world` | le monde demandé est **dans** la liste | ✅ `selected "planitia"` |
| `login` | `ClientViewId`, `InterfaceServerId`, `TycoonId` non nuls | ✅ `…=29601272 …=29570088 …=37` |
| `companies` | liste non vide, ou absence **déclarée** (§2.4) | ⏭ sautée, raison nommée |
| `company` | `currentCompany` non nul **et** phase `WORLD_CONNECTED` | ⏭ sautée, raison nommée |
| `frame-idof-interface-server` | `idof InterfaceServer` | ✅ `objid="29570088"` |
| `frame-logon` | `Logon` — émis **une** fois, ici | ✅ `res="#29601272"` |
| `frame-account-status` | `AccountStatus` | ✅ `res="#0"` |
| `frame-tycoon-id` | `TycoonId` en `#` | ✅ `TycoonId="#37"` |
| `frame-rdocnntid` | `RDOCnntId` répondu depuis la connexion porteuse | ✅ `RDOCnntId="$88…"` |
| `frame-register-events` | `RegisterEventsById` | ✅ |
| `frame-set-language` | `SetLanguage` | ✅ `(push) …` |

Forme imposée respectée : `ctx.state`/`need()` + un `derived()` local sur la marque 0.
**Aucun `packet`, aucun `ctx.emit`, aucun `ctx.push`, aucun `ctx.scenario`.** Le test le prouve en
exécutant **chaque** step avec un contexte dont `emit`, `push` et `scenario` **lèvent**.

### 3.1 Le point délicat — mon choix et sa raison

> **La séquence reste du contrôle de flux dans `run.ts` ; la suite l'OBSERVE, depuis l'état du
> runner et depuis l'enregistrement. Elle n'émet rien.**

Trois raisons, par poids croissant :

**1. `runAll` s'arrête sur le silence, jamais sur un FAIL — et ça tranche.** Si le login était un
step de suite, un login raté serait un `FAIL` et le run **continuerait** vers la suite suivante, à
émettre contre des ids nuls ou périmés. C'est exactement le défaut que le §3.3 existe pour
supprimer. Déplacer le socle dans une suite aurait **rétrogradé une précondition en verdict** — et
la demande du développeur est que la séquence soit *exigible*, pas *rapportée*.

**2. Le runner ne peut pas héberger un step antérieur au login.**
`ConformanceRunner.context()` résout `clientView` et `interfaceServer` de façon **impatiente**, et
`resolveTarget` lève quand l'id est nul. Un step pré-login ne pourrait pas construire son propre
contexte sans restructurer la pièce la plus porteuse du runner — gros changement, mauvais fichier,
aucun gain.

**3. Rejouer le socle doublerait un login fragile.** `loginWorld` met une vingtaine de trames sur le
fil. Les émettre deux fois contre un serveur de production partagé, pour apprendre ce que la
première passe a déjà prouvé, est le contraire de ce que demande la rév. 4.

Mécanisme : `run.ts` publie ce que le socle a appris dans l'état du runner (`CONNECTION_STATE`,
nouveau 5ᵉ paramètre du constructeur), le `Recorder` détient déjà toutes ses trames depuis la
première, et chaque step est un jugement pur sur les deux. **Coût : 0 trame, 0 budget, pas de
seconde session.**

Contrat existant préservé : `run.ts` refuse toujours proprement un monde absent et une entreprise
absente, et fait toujours son `endSession()` dans un `finally`.

*Note d'implémentation : `CONNECTION_STATE` a dû être placé dans `types.ts`, pas dans `runner.ts`.
Le placer près du runner créait un cycle d'import (`connection-suite` → `runner` → `suites` →
`connection-suite`) et le catalogue s'assertait sur `undefined` au chargement. `types.ts` n'importe
rien du dossier, donc ne peut pas participer à un cycle. Le commentaire le dit sur place.*

---

## 4. Ce que j'ai changé par rapport au prompt, et pourquoi

| # | Prompt | Ce que j'ai fait | Pourquoi |
|---|---|---|---|
| 1 | §3.2 : sonde `idof InterfaceServer` + « un get trivial » | `idof DirectoryServer`, **seul** | L'IS n'est pas adressable avant `connectDirectory`. Et `TDirectoryServer` publie **un seul** membre, `RDOOpenSession`, dont la lecture **crée une session** : aucun `get` trivial n'existe. Un `get` deviné répondrait `error 5` sur un serveur sain → frein fantôme. |
| 2 | §3.3 : phase **et** entreprise, deux contrôles | Un seul contrôle, conditionnel | `WORLD_CONNECTED` est posé sur la dernière ligne de `selectCompany` (`login-handler.ts:616`). Sans entreprise la phase reste `WORLD_CONNECTING` **légitimement**. La version inconditionnelle a cassé le rejeu du gate en direct. |
| 3 | §3.1 : N erreurs consécutives → arrêt | N **erreurs inattendues** consécutives | La v1 s'est déclenchée au premier rejeu : `types` enchaîne 5 steps dont l'oracle **est** `error 3`. Une étape qui répond l'erreur qu'elle attend est un succès. |
| 4 | §3.7 : promouvoir `Malformed query` depuis `anomalies` | Ajouté à `TROUBLE` **et** scan des lignes brutes | La ligne n'atteignait jamais `anomalies` — `TROUBLE` ne la matche pas. La promotion demandée aurait été un no-op. |
| 5 | §3.5 : refus des 12 membres hors phase de connexion | + `LIFECYCLE_ADJUDICATED`, 2 entrées citées | Deux steps du catalogue livré émettent déjà `EnableEvents` et `ClientAware`, tous deux adjugés par capture. Liste énumérée fermée, pas un drapeau. |
| 6 | §2.6 : `rdo-request-guards.ts` **en entier** ne bouge pas | Ajouts §3.5 + 1 JSDoc corrigé | Les ajouts sont demandés par §3.5. Le JSDoc d'`assertNotVariantOnVoidMember` disait encore *« Unlike assertNotVoidPush — a style convention »* : le cadrage retiré le 2026-08-18, dans le fichier même qui le réfute vingt lignes plus bas. Corrigé (doc seule, aucune logique). |
| 7 | §2.2 : supprimer 4 fichiers | **Non fait — bloqué** | Classificateur de permissions. Commande fournie au §1.2. |
| 8 | — | `run.ts` affiche `frames emitted: N / B` | Il fallait bien mesurer le §2.5, et `runner.emitted` était un getter public jamais lu. Utile en permanence. |
| 9 | — | Test `run.test.ts:131` **inversé** | Il affirmait qu'une entreprise était sélectionnée dans un run où la liste est vide : il encodait le faux vert du §3.4. |

**Une inexactitude signalée, non corrigée (hors périmètre) :** la skill `rdo-conformity`
(`.claude/skills/rdo-conformity/SKILL.md`) porte **encore** l'ancien cadrage —
*« QueryId + `"*"` … ⛔ Forbidden by convention … Not a crash risk »* et *« The only real crash risk
is row 4 »*. C'est exactement ce que le 2026-08-18 a réfuté, et cette skill est chargée avant tout
travail RDO. **À corriger avant le prochain lot RDO.**

---

## 5. Ce qui reste ouvert pour R4

1. **Supprimer les 4 fichiers `sweep*`** (§1.2) — action développeur, commande fournie.
2. **Les parcours P5-P12**, un à la fois, en `ctx.scenario`, derrière la suite `connexion`.
   Le gabarit P6 est archivé et prêt ([gabarit-parcours-parc.md](gabarit-parcours-parc.md)).
   **Bloqués : `planitia` est à terre et `.rdo-live/HALT` est posé.**
3. **Rendre le socle non contournable en préfixe de tout parcours.** R3 le rend *observé* et
   *exigible* ; il n'est pas encore *structurellement* impossible d'écrire un parcours qui l'ignore.
   La forme naturelle est un champ `Suite.requiresFloor` vérifié par `assertSuitesSafe` à l'import.
4. **Les `writeRdoFrame()` directs de `spo_session.ts`** ne traversent aucune garde (§2.8). Sans
   danger aujourd'hui — membres codés en dur — à revoir dès qu'un push prendra un membre dynamique.
5. **Corriger la skill `rdo-conformity`** (§4).
6. **Vérifier que les *purposes* de socket du rejeu** (`directory_auth`, `directory_query`, `world`)
   couvrent `map`, `construction` et `mail`, que P5-P12 vont solliciter (rév. 4 §12).
7. **Le gate git réclamera rejeu puis live** au prochain sync : la surface RDO a bougé. Le rejeu
   passe (60 PASS) ; le live est impossible tant que `planitia` est mort. **Non contourné.**
8. **Rien n'a été commité ni poussé.**

---

## 6. Fichiers touchés

**Créés** — `src/tools/conformance/connection-suite.ts`, `connection-suite.test.ts`,
`report/gabarit-parcours-parc.md`, `report/lot-R1-R2-R3.md`.

**Modifiés** — `src/tools/conformance/` : `suites.ts`, `suites.test.ts`, `cli.ts`, `cli.test.ts`,
`runner.ts`, `runner.test.ts`, `run.ts`, `run.test.ts`, `types.ts`, `report.ts`, `server-logs.ts`,
`server-logs.test.ts` · `src/server/session/rdo-request-guards.ts`, `rdo-request-guards.test.ts` ·
`src/server/spo_session.ts` (§5 autorisé) · `src/server/__tests__/spo-session-lifecycle.test.ts`.

**À supprimer par le développeur** — `sweep.ts`, `sweep-plan.ts`, `sweep.test.ts`,
`sweep-plan.test.ts`.

**Couverture des fichiers touchés**

| Fichier | Lignes | Branches |
|---|---:|---:|
| `types.ts` | 100 % | 100 % |
| `suites.ts` | 100 % | 96,9 % |
| `cli.ts` | 100 % | 98,6 % |
| `runner.ts` | 100 % | 91,4 % |
| `report.ts` | 100 % | 97,0 % |
| `connection-suite.ts` | 100 % | 96,7 % |
| `rdo-request-guards.ts` | 100 % | 95,8 % |
| `run.ts` | 97,7 % | 91,6 % |
| `server-logs.ts` | 95,0 % | 89,3 % |

---

**Skills utilisées :** `rdo-conformity` (invoquée avant toute modification RDO — et c'est en la
lisant que son inexactitude du §4 est apparue), `delphi-archaeologist` (lecture directe de
`Directory Server/DirectoryServer.pas` pour la sonde du §2.2), `spo-testing` et `code-guardian`
(chargées automatiquement sur `src/`).
