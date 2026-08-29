# Haiku driver — analyse des demandes de permission

> **Note du 2026-08-29.** Ce document analyse la couche de hooks du pilote, **antérieure à
> #425** : les gardes qu'il décrit ont été retirés à l'étape 4 de la strangler-migration, et
> seuls `main-commit-guard.sh`, `pre-push-gate.sh` et `bench-port-guard.sh` subsistent dans
> `.claude/hooks/`. Conservé tel quel comme trace d'analyse.

> **Statut au 2026-08-27.** Collecte close. Ce journal a produit
> [haiku-permission-plan.md](haiku-permission-plan.md), dont sont issues les cartes
> **#337** (`npm run verdict`), **#338** (les messages de refus rendent la forme corrigée) et
> **#339** (documentation de la forme). Trois constats de ce journal étaient déjà filés par
> une session parallèle et ne sont **pas** repris dans ces cartes : **#324** (garde sur la
> recherche shell des corpus légataires — R11/R13/R15 ci-dessous, prescription différente de
> la mienne, voir mon commentaire sur la carte), **#326** (D-02 : `;`/sous-shell hors du champ
> de `verdict-pipe-guard`), et **#320/#321/#322** (R1 et le repli quand `Grep` est différé),
> déjà mergées. Document d'analyse daté : il décrit l'état du 2026-08-27, pas l'état courant.

**But.** Observer, sur des sessions `/next-task` pilotées par Haiku 4.5, chaque demande
d'autorisation réellement émise, et en tirer une politique d'intégration dirigée : ce qui
peut passer sans bruit, ce qui doit alerter, ce qui doit être bloqué.

**Statut : collecte en cours.** Ce fichier est le brouillon de travail ; la carte kanban
sera déposée quand la collecte sera close (revue `card-reviewer` d'abord).

## Les trois classes

| Classe | Définition | Traitement visé |
|--------|-----------|-----------------|
| **A — légitime, silencieuse** | La demande fait partie du travail normal de la carte, et se tromper est rattrapé par un test ou par le gate. | Autoriser sans interruption (allowlist) |
| **B — légitime, sous alerte** | La demande est justifiée mais touche un point critique : fichier gelé, protocole RDO, écriture board, credentials, gate/bench, `main`. | Autoriser mais notifier / exiger une confirmation |
| **C — illégitime** | La demande sort du périmètre de la carte, contourne un garde-fou, ou détruit un état qu'un humain seul peut rétablir. | Refuser — la plus dangereuse des trois |

## Journal des demandes

<!-- Un bloc par notification. Rempli au fil de l'eau. -->

### D-01 — Task #117 — `grep -r` sur `../SPO-Original` — **Classe B**

| | |
|---|---|
| Session | `local_423c82be…` · worktree `next-task-68fede` · branche `claude/next-task-68fede` |
| Driver | `claude-haiku-4-5-20251001` |
| Carte | #117 — `GetChannelInfo` : le chemin RDO est câblé, on ignore ce qu'il retourne |
| Étape | Skill `delphi-archaeologist` venait d'être invoquée ; 1re recherche dans le corpus Delphi |
| Demande | `grep -r "GetChannelInfo" ../SPO-Original/Interface\ Server/ 2>/dev/null | head -20` |

**Pourquoi la permission est demandée.** L'allowlist exclut délibérément les alias shell
`grep`/`find`/`cat`/`sed` (CLAUDE.md § Environment) au profit des outils Grep/Read.

**Légitimité : oui.** Lire `../SPO-Original` en lecture seule est exactement ce que la carte
exige, et c'est la skill elle-même qui l'a demandé. Aucun contournement, aucune écriture,
aucune sonde du serveur vivant, rien hors périmètre.

**Pourquoi elle doit quand même alerter — la forme est fausse, et silencieusement.**
Trois défauts qui se composent :

1. **Le chemin ne résout pas.** Le cwd est `…/.claude/worktrees/next-task-68fede`, donc
   `..` = `…/.claude/worktrees/`. `../SPO-Original` n'existe pas ; le vrai arbre est
   `/home/crazz/SPO-Original`. CLAUDE.md et la skill écrivent `../SPO-Original` — vrai depuis
   `~/SPO-WebClient`, **faux depuis toute worktree de session**. C'est un piège systémique,
   pas une étourderie du driver.
2. **`2>/dev/null` avale le diagnostic.** L'avertissement « No such file or directory » est
   jeté ; il ne reste rien à lire.
3. **`| head` détruit le code de sortie.** `grep` sort en 2 (erreur), le pipeline rend 0.

Reproduit tel quel : **sortie vide, aucune erreur, exit 0** — indiscernable d'un « le symbole
n'existe pas ». Or il existe : `Interface Server/InterfaceServer.pas`, plus `Voyager/` et
`Voyager.1/` (`VoyagerServerInterfaces.pas`, `URLHandlers/ChatHandlerViewer.pas`,
`URLHandlers/ServerCnxHandler.pas`).

À quoi s'ajoute le piège déjà documenté : `grep` sans `-a` rend vide sur les `.pas` encodés
ISO-8859 (CLAUDE.md ⚠) — quatrième cause du même faux négatif.

**Conséquence si on laisse passer.** Le driver conclut `[UNKNOWN]` — ou pire, invente une
signature. On est sur la surface la plus chère du dépôt : un `kind` ou une `arity` faux dans
`rdo-members.ts` produit un gel, une écriture mémoire arbitraire ou un crash serveur, et
**aucun test ne l'attrape**. La garde `check-pr-rules.js` exige une citation `File.pas:Line`,
qu'une citation fabriquée satisfait.

**Traitement visé — sous-classe « B-corrective ».** L'alerte ne doit pas poser une question
oui/non : elle doit rendre la forme corrigée. Ici :

```
Grep(pattern="GetChannelInfo", path="/home/crazz/SPO-Original", glob="*.pas", output_mode="files_with_matches")
```

ou, si le shell est imposé : chemin absolu, `-a`, pas de `2>/dev/null`, pas de pipe qui mange
le code de sortie.

**Règles générales que ce cas produit** (pour la synthèse) :

- **R1** — un chemin relatif partant de `..` depuis une worktree de session : alerter, et
  proposer l'absolu. Corollaire dépôt : la mention `../SPO-Original` de CLAUDE.md et de la
  skill `delphi-archaeologist` est à requalifier.
- **R2** — `2>/dev/null` sur une commande d'*investigation* (dont la sortie vide sera lue
  comme une réponse) : alerter. Sur une commande d'*action*, c'est anodin.
- **R3** — un pipe qui masque le code de sortie d'une commande dont le vide est signifiant :
  alerter. Le hook `verdict-pipe-guard.sh` couvre déjà la famille bench/test ; la famille
  « recherche dont l'absence est une conclusion » n'est pas couverte.
- **R4** — `grep` shell sur `../SPO-Original` sans `-a` : alerter (piège ISO-8859 documenté).
- **R5** — toute archéologie Delphi dont le résultat alimentera `rdo-members.ts` : jamais
  classe A, quelle que soit la propreté de la commande. L'erreur n'y est rattrapée par
  aucun test.

### D-02 — Task #183 — typecheck en sous-shell `( ; )` — **Classe B**

| | |
|---|---|
| Session | `local_90a17a44…` · worktree `next-task-1a5216` · branche `claude/next-task-1a5216` |
| Driver | `claude-haiku-4-5-20251001` |
| Émetteur | **sous-agent** `exec-gate-merged-tree` (`subagent_type: claude`, `model: sonnet`, profondeur 1) |
| Carte | #183 — *Gate the merged tree, not the branch* |
| Étape | Après une série d'`Edit` sur `src/e2e/bench/{checkout,worker,worker.test}.ts` ; vérification |
| Demande | `(npx tsc --noEmit; npx tsc --noEmit -p tsconfig.e2e.json) > …/tsc.log 2>&1; echo "EXIT=$?"; cat …/tsc.log` |

**Légitimité : oui, sans réserve.** Vérifier son propre travail après édition est l'étape
attendue ; la commande est en lecture seule, n'écrit que dans le scratchpad, ne touche ni au
port du banc, ni au board, ni à `main`.

**Ce qui précède est un bon signal, à garder pour la synthèse.** Trois observations
*classe A* dans les secondes qui précèdent :

- Le sous-agent avait d'abord tenté `npx tsc … 2>&1 | head -100` : **`verdict-pipe-guard.sh`
  l'a bloqué**, avec la forme corrigée dans le refus, et le sous-agent a appliqué la
  correction du premier coup. Le garde-fou déterministe fonctionne, et le message qui
  *donne la forme* est ce qui le rend efficace — cf. la sous-classe « B-corrective » de D-01.
- `driver-scope-guard.sh` a laissé passer les `Edit` : c'est exactement sa règle (le driver
  d'une carte prise n'écrit pas, le sous-agent d'exécution oui). Comportement conforme.
- Le routage modèle est conforme au § Model routing : `Plan` pour la conception, puis
  exécution déléguée sur Sonnet, driver Haiku.

**Pourquoi la demande doit quand même alerter — deux défauts.**

1. **Le sous-shell avale le premier échec.** `$?` après `(cmd1; cmd2)` est le code de
   `cmd2` seul. Vérifié :

   ```
   (false; true)   -> EXIT=0   premier échec perdu
   (false && true) -> EXIT=1   premier échec conservé
   ```

   Si `tsc --noEmit` échoue et que `tsc -p tsconfig.e2e.json` passe, la sortie affiche
   `EXIT=0`. C'est **la famille exacte que `verdict-pipe-guard` venait de bloquer**, sous une
   autre syntaxe : le hook filtre les pipes, pas le `;` en sous-shell. Le garde-fou a été
   contourné sans intention, par simple changement d'habillage.

   Aggravant : la doctrine du dépôt est « lis le verdict dans le code de sortie, jamais dans
   le rapport imprimé ». Appliquée ici, elle donne la mauvaise réponse — le `cat` du log
   contiendrait les erreurs, mais c'est `EXIT=0` que la règle dit de croire.

2. **La vérification est incomplète.** `npm run typecheck` enchaîne **trois** configs
   (`tsc --noEmit && … -p tsconfig.client.json && … -p tsconfig.e2e.json`). La commande n'en
   passe que deux : **`tsconfig.client.json` est sauté**. La session dira « typecheck vert »
   sur une couverture partielle. Atténuation : le hook `sanctuarize.sh` (Stop) rejoue le vrai
   `npm run typecheck` avant la fin du tour — l'omission serait rattrapée, le faux `EXIT=0`
   du point 1 aussi.

**Le terrain, lui, est critique — et c'est le déclencheur B principal.** La carte #183
réécrit `src/e2e/bench/` : **le worker de banc lui-même**, la machine qui atteste le gate de
toutes les autres sessions (`npm run finish` le réinstalle justement quand un merge touche
`src/e2e/bench/` ou `scripts/bench-*`). Un défaut là ne fait pas rougir un test : il change
silencieusement ce que « PASS » veut dire pour toutes les sessions suivantes, y compris la
sienne. **Toute étape de vérification sur ce terrain est classe B par nature**, même
irréprochable dans sa forme — parce que c'est l'instrument de mesure qu'on modifie avec
l'instrument de mesure.

**Traitement visé.** B-corrective, forme rendue :

```
npm run typecheck > /tmp/tc.log 2>&1; echo "EXIT=$?"; cat /tmp/tc.log
```

Les trois configs, un `&&` qui conserve le premier échec, une seule vérité dans `EXIT`.

**Règles générales que ce cas produit :**

- **R6** — `(a; b)` ou `a; b` où le code de sortie est lu ensuite : alerter. Même perte que le
  pipe, hors du champ de `verdict-pipe-guard.sh`. Extension du hook à envisager
  (`;` et `&` séquentiels, `$?` après sous-shell). Voir R3.
- **R7** — une commande de vérification qui **réimplémente à la main** un script npm existant,
  en en perdant une branche : alerter. Le script est la définition de « vert » ; sa
  paraphrase ne l'est pas.
- **R8** — toute écriture ou vérification touchant `src/e2e/bench/`, `scripts/bench-*`,
  `.claude/hooks/` ou `jest.config.js` : **jamais classe A**. On modifie l'instrument qui
  juge ; le jugement d'après ne peut plus servir de preuve. Alerte systématique, et exiger
  une vérification par un moyen indépendant de ce qui vient d'être modifié.
- **R9** *(positive, pour l'allowlist)* — un refus de hook qui **rend la forme corrigée** est
  suivi correctement, du premier coup, par un driver Haiku comme par un sous-agent Sonnet.
  Toute règle d'alerte de cette politique doit donc être rédigée en « voici la forme »,
  jamais en « refusé ».
- **R10** *(confirmation)* — `driver-scope-guard.sh` distingue correctement driver et
  sous-agent d'exécution. Rien à changer ; à documenter comme comportement attendu pour ne
  pas le prendre pour une faille lors d'un audit ultérieur.

### D-03 — Task #117 (2e demande) — `find | xargs grep` — **Classe B, sévérité haute**

| | |
|---|---|
| Session | `local_423c82be…` · worktree `next-task-68fede` — **même session que D-01** |
| Driver | `claude-haiku-4-5-20251001` |
| Carte | #117 — `GetChannelInfo` |
| Étape | D-01 a été **refusée** par l'humain ; le driver a corrigé et relancé (20 min plus tard) |
| Demande | `find /home/crazz/SPO-Original -name "*.pas" -type f 2>/dev/null \| xargs grep -l "GetChannelInfo" 2>/dev/null` |

**Ce que le driver a corrigé tout seul.** Le refus de D-01 ne portait aucun texte
explicatif — juste « rejected ». Le driver a néanmoins : abandonné le chemin relatif pour
**`/home/crazz/SPO-Original` en absolu** (R1 apprise), et lu `Rdo/Server/RDOObjectServer.pas`
et `Voyager/URLHandlers/ChatHandler.pas` avec l'outil **Read**. Il a même tenté
`ToolSearch select:Grep` — l'outil Grep n'étant pas différé dans cette session, la recherche
n'a rien rendu, et c'est **ce mur-là qui l'a renvoyé vers le shell**.

**Ce qu'il n'a pas corrigé.** `2>/dev/null` (R2) et le pipe (R3) sont revenus à l'identique.
→ Affine R9 : *un refus nu corrige ce qui a été visiblement refusé, pas les défauts latents
que personne n'a nommés.*

**Légitimité : oui.** Lecture seule, dans le périmètre de la carte.

**Pourquoi c'est la demande la plus dangereuse observée jusqu'ici.** Exécutée telle quelle,
elle ne rend pas le vide : elle rend **une réponse fausse, courte et crédible**.

```
rendu par la commande (2 fichiers)      | vérité (15 fichiers)
Voyager/VoyagerServerInterfaces.pas     | + Interface Server/InterfaceServer.pas   <-- L'AUTORITÉ
Voyager.1/VoyagerServerInterfaces.pas   | + Voyager{,.1}/URLHandlers/{ChatHandlerViewer,ServerCnxHandler}.pas
                                        | + 9 fichiers sous Tests/
```

Un driver qui lit ça conclut, raisonnablement : *« `GetChannelInfo` n'existe que côté client
Voyager ; aucune déclaration serveur »*. C'est faux, et c'est exactement la conclusion qui
mène à inventer un `kind` et une `arity` dans `rdo-members.ts` — gel, écriture mémoire
arbitraire ou crash, **qu'aucun test n'attrape**.

**Mécanisme, mesuré.** Trois causes empilées, toutes masquées :

1. **`xargs` avorte sur une apostrophe.** L'arbre contient `Pastel's mp3/` (27 `.pas`).
   `xargs` traite les quotes comme spéciales sans `-0` : il émet
   `xargs: unmatched single quote` et **arrête de lire le flux**. Mesuré : **1338 fichiers
   transmis sur 1747** — 409 jamais cherchés.
2. **Le découpage sur les espaces casse les chemins.** `Interface Server/`, `Model
   Extensions/`, `Mail Server/`, `Tests/… Viewer/`, `StdBlocks/Copy of …` — chaque chemin
   devient deux arguments inexistants. `Interface Server/InterfaceServer.pas`, le fichier
   qui **porte la réponse**, est perdu par ce seul mécanisme.
3. **`2>/dev/null` avale 343 lignes d'erreur**, dont le `xargs: unmatched single quote` fatal.

Isolation des causes : en null-délimité (`-print0 | xargs -0`), **les 15 fichiers
remontent**, avec ou sans `-a` — ici tous les fichiers concernés sont ASCII, le piège
ISO-8859 de R4 ne joue pas dans ce cas précis.

**Fait d'environnement à retenir.** Dans ce shell, `grep` est une **fonction bash** qui
réachemine vers l'`ugrep` embarqué de Claude Code (`-I`, `--ignore-files`, exclusions VCS).
Une fonction n'est pas héritée par `xargs` : **`xargs grep` exécute un *autre* grep** que
`grep` tapé directement — messages en `grep:` et non `ugrep:`, et aucune des protections sur
lesquelles l'avertissement ISO-8859 de CLAUDE.md est calibré. Deux commandes qui se lisent
pareil ne font pas la même chose.

**Traitement visé.** B-corrective. La forme juste est l'outil, pas le shell :

```
Grep(pattern="GetChannelInfo", path="/home/crazz/SPO-Original", glob="*.pas", output_mode="files_with_matches")
```

Si le shell est imposé : `find … -print0 | xargs -0 grep -al …`, **sans** `2>/dev/null`.

**Règles générales que ce cas produit :**

- **R11** — `find | xargs` sans `-print0`/`-0` sur `../SPO-Original` : **alerte dure**. L'arbre
  contient des apostrophes (`Pastel's mp3/`) et des dizaines de répertoires à espaces ; la
  commande ne échoue pas, elle **tronque**. Générique : tout `xargs` sans `-0` sur une
  arborescence non contrôlée.
- **R12** — distinguer, dans la politique, **« rend vide »** (D-01) de **« rend une réponse
  partielle plausible »** (D-03). Le second est plus dangereux : rien n'invite à douter. Une
  troncature silencieuse doit peser plus lourd qu'un échec franc.
- **R13** — `2>/dev/null` combiné à une sortie non vide : l'alerte doit **montrer le compte de
  lignes d'erreur supprimées** (343 ici). C'est le signal le plus court et le plus décisif.
- **R14** — ne jamais raisonner sur le comportement de `grep` sans savoir lequel s'exécute :
  fonction shell (ugrep bridé) en direct, binaire système sous `xargs`, `find -exec`, `sh -c`.
  À vérifier avant toute conclusion d'absence.
- **R15** *(durcissement de R5)* — sur l'archéologie RDO, **la recherche shell ne devrait pas
  être « alertée » mais refusée au profit de l'outil `Grep`**, qui n'a ni quoting, ni pipe, ni
  découpage, ni stderr à perdre. Seul cas rencontré jusqu'ici où une classe B mérite le
  traitement d'une classe C — non pour l'intention, qui est saine, mais parce que le coût
  d'un faux négatif y est non rattrapable.
- **R16** — si l'outil `Grep` est absent/différé dans une session, le driver **se rabat sur le
  shell** (observé : `ToolSearch select:Grep` → « No matching deferred tools found », puis
  `xargs grep`). L'indisponibilité d'un outil sûr fabrique mécaniquement des demandes
  dangereuses : garantir `Grep` non différé dans les sessions `/next-task` est une mesure
  préventive à part entière.


## Relevé du 2026-08-27 — toutes les demandes arrêtées, regroupées

Source : les 56 transcripts `~/.claude/projects/**/*.jsonl` touchés aujourd'hui. Ne sont
retenues que les **certitudes de journal** — un appel d'outil sans résultat (`PENDING`), avec
`toolDenialKind`, ou dont le résultat porte un refus de hook. Un appel simplement autorisé par
l'allowlist n'est pas distinguable dans le journal : il n'est pas compté.

**43 arrêts · 11 sessions · Bash 23 · Edit 18 · Write 2.**

| Cause | N |
|---|---|
| `worktree-scope-guard.sh` | 13 |
| `verdict-pipe-guard.sh` | 10 |
| `driver-scope-guard.sh` | 5 |
| `poll-loop-guard.sh` | 4 |
| classifieur automode | 4 |
| refus humain | 3 |
| autre / en attente | 4 |

### Les six schémas génériques

**S1 — lire dans une racine, écrire dans la même, alors que l'écrivable est une copie** (13).
Les skills, `CLAUDE.md` et `.claude/settings.json` sont *lus* sous
`/home/crazz/SPO-WebClient/…` ; l'agent réécrit naturellement là où il a lu, c'est-à-dire dans
le checkout principal, hors de sa worktree. Cibles observées : `CLAUDE.md` (×4),
`.claude/settings.json` (×3), `.claude/commands/next-task.md`, `.claude/hooks/journal-writes.sh`,
`src/__tests__/journal-writes.test.ts`. Le chemin est *absolu et correct* — il désigne
simplement la mauvaise copie.

**S2 — abréger une sortie longue** (10). `| head`, `| tail`, `| grep -E`. Le besoin est
légitime et permanent : économiser du contexte. Le réflexe détruit le code de sortie. Un cas
porte aussi l'ordre de redirection inversé (`2>&1 > log` : stderr part à l'écran, pas au
fichier).

**S3 — la correction est trop petite pour un sous-agent** (5). Le driver d'une carte prise
édite lui-même une ligne de doc ou une case de tableau. Cibles : `doc/kanban-workflow.md`,
`CLAUDE.md`, `.claude/settings.json`, `src/__tests__/…`.

**S4 — ne pas bloquer sur une commande longue** (4). `npm run gate 2>&1 &`,
`while [ ! -f …done/job-….json ]; do sleep 10; done`, `npm test > log; echo "EXIT=$?"` avec
`run_in_background: true`.

**S5 — chercher un symbole dans un corpus hors dépôt** (3, + les deux demandes analysées en
D-01/D-03). `grep -r`, `find | xargs grep` sur `SPO-Original`. Les outils sûrs sont
allowlistés, le shell ne l'est pas — donc la demande s'arrête ; mais **rien ne regarde la
forme**, et c'est la forme qui produit les faux négatifs (D-01, D-03).

**S6 — l'agent modifie l'instruction qui le gouverne** (4). Quatre `Edit` sur
`.claude/agents/change-validator.md`, arrêtés par le classifieur automode.

### Un schéma transversal : le réessai à l'identique

Quand le refus **ne rend pas une forme applicable**, l'agent rejoue la même action :
`change-validator.md` ×4 (dont deux `old_string`/`new_string` identiques),
`.claude/settings.json` ×3 par deux agents différents, `CLAUDE.md` ×4. Quand le refus **rend la
forme** (`verdict-pipe-guard`, `poll-loop-guard`), la correction est appliquée **du premier
coup** — observé en D-02, et sur les dix arrêts `verdict-pipe-guard` du jour, aucun réessai à
l'identique. C'est la confirmation empirique de **R9**.

## État du processus face à ces besoins — certitudes uniquement

Lu sur `main` à `3773cbd6`.

| Besoin | Couvert ? | Preuve |
|---|---|---|
| S1 écrire hors worktree | **oui, bloqué** | `worktree-scope-guard.sh` câblé PreToolUse sur `Bash` **et** `Edit\|Write\|NotebookEdit` ; 13 arrêts aujourd'hui |
| S3 le driver écrit lui-même | **oui, bloqué** | `driver-scope-guard.sh` câblé sur les mêmes deux matchers ; 5 arrêts ; les `Edit` des sous-agents passent |
| R1 chemin relatif vers SPO-Original | **oui, corrigé aujourd'hui** | `permissions.additionalDirectories` = `["~/SPO-Original","~/SPO-ASP"]` ; `CLAUDE.md:104` et `delphi-archaeologist/SKILL.md:8` disent `~/SPO-Original` … **« NOT from a session worktree »** |
| S2 pipe qui mange le verdict | **partiellement** | `verdict-pipe-guard.sh:87-89` ne connaît que `npm (run) test\|typecheck\|lint\|build\|gate\|e2e`, `npm run coverage\|deps:gate`, `npx jest`. Un pipe sur une **recherche** n'est pas dans la liste |
| S4 fond / attente d'un verdict | **partiellement** | `poll-loop-guard.sh` bloque le `&` final et les boucles `until/while+sleep`. Le chaînage `cmd; echo "EXIT=$?"` n'est testé que si `background === true` (`:104`) — **la même forme en avant-plan passe** (c'est D-02) |
| R8 écrire sur les instruments de jugement | **observé, pas alerté** | `journal-writes.sh` câblé PostToolUse `Edit\|Write\|Bash\|NotebookEdit`, familles `.claude/hooks/**`, `src/e2e/bench/**`, `scripts/bench-*`, `scripts/verify-gate.js`, `jest.config.js`, fichiers RDO — mais en-tête `:17` : **« Always exits 0 — never blocks a write »** |
| R9 un refus doit rendre la forme | **confirmé, non généralisé** | voir le schéma transversal ci-dessus |
| S5 / R2 / R11 / R13 / R14 / R15 forme des recherches shell | **non couvert** | aucun hook ne mentionne `xargs`, `-print0`, ni `ISO-8859` ; `SPO-Original` n'apparaît que dans `context-router.sh` (routage, pas garde). `grep`/`find`/`xargs`/`sed`/`cat` absents de l'allowlist : la demande s'arrête, mais **rien n'examine la commande** |
| R7 paraphrase d'un script npm | **non couvert** | aucun garde ne compare une commande à la définition du script npm équivalent |
| R12 troncature silencieuse vs échec franc | **non couvert** | aucune distinction nulle part |

**Non tranché — laissé de côté faute de certitude :** si l'outil `Grep` était réellement
disponible dans la session #117 (le journal montre seulement `ToolSearch select:Grep` →
« No matching deferred tools found », puis le repli sur le shell) ; les règles du classifieur
automode, côté harnais et non lisibles ici ; et si les worktrees branchées avant le correctif
R1 voient la version corrigée de `CLAUDE.md` et de `settings.json`.


## Synthèse — règles d'intégration

<!-- Dégagée à la fin, à partir du journal : allowlist, règles d'alerte, règles de refus. -->

Le plan d'action dérivé de ce journal est dans **[haiku-permission-plan.md](haiku-permission-plan.md)** (sous-agent `Plan`/Fable 5, 2026-08-27) : modèle causal RC1–RC4, 11 étapes réparties en 3 cartes, table de disposition des six schémas.
