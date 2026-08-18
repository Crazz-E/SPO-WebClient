# ⛔ PÉRIMÉ — Prompt de pilotage de la campagne rév. 3

> **NE PAS REPRENDRE CE PILOTAGE.** Ce document pilote une campagne dont la prémisse centrale est
> morte le 2026-08-18 : *« la certification devient un balayage »* supposait qu'il existe une trame
> sûre pour un membre de genre inconnu. Il n'en existe pas, et le balayage a cassé le serveur partagé.
>
> Tout son §3 (« les apprentissages vérifiés ») décrit la mécanique du balayage, et son §5 en organise
> le lancement. **Deux de ses affirmations porteuses étaient fausses** : l'opt-in `probe` sur
> `assertNotVoidPush` qu'il légitime est précisément ce qui a laissé sortir la trame fatale, et il
> présente `assertNotVoidPush` comme une convention alors que c'est une **garde de sûreté**.
>
> **Plan en vigueur :** [plan-certification-rdo-rev4.md](../../report/plan-certification-rdo-rev4.md).
> **Processus en vigueur :** [PROCESSUS-CAPTURE.md](../PROCESSUS-CAPTURE.md).
>
> Conservé comme trace de la décision et de son renversement.

---

# Pilotage — certification RDO. Prompt de reprise

**Colle ce fichier dans une session neuve. Modèle : Opus 5. Effort : `high`.**

Tu reprends le **pilotage** d'un chantier en cours. Tu ne codes pas toi-même : tu écris les prompts
de lot, tu reçois les comptes rendus, tu arbitres, tu tiens le plan à jour. **S2 est livré et
accepté** (CR du 2026-08-18) ; les lots ouverts sont la seconde moitié de S1, puis S3 et S4.

---

## 1. L'objectif, dans les mots du développeur

> *« L'objectif est que à la fin de l'exécution tu aies bien l'intégralité des scénarios RDO qui sont
> testés en LIVE sans aucun crash. »*

Précisé depuis, et ces précisions **priment** :

- **L'outil visé** est une **suite de régression RDO certifiée, rejouée à chaque git** — uniquement
  si la surface RDO a bougé. Certifier = trancher `*` vs `^`, l'arité, les types, pour que le
  scénario soit juste.
- **« Tente tout à chaque fois et SEULEMENT si c'est impossible alors le processus doit avertir
  l'utilisateur. »** Aucune ligne écartée sur présomption ; une impossibilité n'existe qu'après une
  tentative échouée, et elle **remonte**.
- **Couche protocole uniquement.** Les tests d'UI viendront après, sur un socle protocole prouvé.
- **« Si le serveur crash ce n'est pas GRAVE »** — c'est un serveur de test en production. Mais
  **il faut savoir attribuer un gel**, sinon on ne peut pas corriger notre code.
- **Vitesse.** *« Va beaucoup plus vite, lève les inconnues le plus rapidement possible. »*

**Objectif réénoncé, contresigné :** *zéro gel **imputable** à la campagne, établi par corrélation.*
« Aucun crash » est intenable — `RDOObjectServer.pas` sérialise `CallMethod`/`GetProperty`/
`SetProperty` derrière **une seule section critique**, donc tout appel dont le corps Delphi bloque
gèle l'IS pour tous, sans faute de trame.

---

## 2. À lire en premier, dans cet ordre

1. **[report/plan-campagne-live-rdo.md](../../report/plan-campagne-live-rdo.md)** — rév. 3, le plan
   en vigueur. **La rév. 2 (paliers gatés O5-b) est obsolète, ne pas la ressusciter.**
2. **[report/lot-A-inventaire-campagne-live.md](../../report/lot-A-inventaire-campagne-live.md)** —
   le dénominateur : 298 scénarios, 217 membres distincts.
3. **[doc/prompts/campagne-live-S2.md](campagne-live-S2.md)** — **exécuté le 2026-08-18**, à lire
   comme archive : son §6 porte encore la citation fautive `:265-277` corrigée depuis.
4. `CLAUDE.md` + `doc/rdo-protocol-architecture.md` §8.5 (matrice des séparateurs).

**Prompts périmés, à ignorer :** `campagne-live-L1.md` et `campagne-live-B.md` — le lot B est annulé
(§3.2), L1 est remplacé par `campagne-live-A.md`, déjà exécuté.

---

## 3. Les apprentissages vérifiés — le cœur du transfert

Tout ce qui suit est **vérifié dans le code ou prouvé par capture**, pas inféré.

### 3.1 Le gel dépend des arguments ÉMIS, pas de l'arité déclarée

Le répartiteur lit `ParamCount` **du tableau variant reçu** (`RDOObjectServer.pas:214-218`), jamais
de la déclaration. 1ᵉʳ arg → `EDX`, 2ᵉ → `ECX` ; `RegsUsed` n'atteint `MaxRegs = 3` — le `push edi`
de `:281-292` — **qu'au deuxième argument registre**.

> **`call M "^"` à 0 ou 1 argument ne peut pas geler, quelle que soit la déclaration de `M`.**

Trois bords live-prouvés : `ClientAware` 0 arg → `error 9` en 91 ms · `CloseMessage` 1 arg →
`error 9` sans gel (`mail-read-captured.scenario.ts:1011-1012`) · `SayThis` 2 args → gel de 12 h 41.

**C'est ce qui transforme la certification en BALAYAGE** — 4 vagues, ~450 trames, un login, moins de
2 minutes de fil, et la réponse classe : `res=` = function · `error 9` = procedure · `error 5` = non
**publié** (jamais « inexistant ») · `error 6` = arité refusée · silence = gel.

⚠ `countParams` **surestime pour les flottants** — `@CheckIfSingle`/`@CheckIfDouble` poussent
inconditionnellement **sans incrémenter `RegsUsed`** (`:255-263`).

### 3.2 L'extraction mécanique de l'arité fonctionne — le lot B est annulé

`src/tools/conformance/extract/extract-rdo-arity.js` (sur disque, non commité). 0,32 s sur 1 751
`.pas`, 1 090 déclarations publiées, **0 membre réellement ambigu dans la surface atteignable**
(3 dans tout le corpus, des forks de fichier). Le corpus Pascal SPO n'a **aucune surcharge, aucun
paramètre par défaut, aucun `var`/`out`, aucune déclaration multi-lignes** parmi les `RDO*`.

→ L'adjudication Opus `xhigh` avec double réfutation sur 175 membres est **remplacée par ce script
plus trois questions**.

### 3.3 Les captures certifient déjà 28 % du corpus

**61 des 217 membres** sont attestés sur le fil : 3 enregistrements `report/campaign/rec/*.ndjson`,
6 scénarios `src/mock-server/scenarios/captured/`, 4 158 lignes de
`doc/Mock_Server_scenarios_captures.md`. **Preuve de rang maximal — la capture prime sur le Pascal.**
156 membres n'ont jamais été vus : c'est le vrai dénominateur du balayage.

### 3.4 Le harnais sait déjà chaîner des séquences

Vérifié, et pas documenté ailleurs. `ctx.state` est une `Map` partagée par toutes les étapes d'un run
(`types.ts:143-155`) ; `ImperativeStep.run(ctx)` exécute du code arbitraire ; `StepTarget` accepte
`{ objectId }`, donc une étape peut adresser un objet **dont l'id vient de l'étape précédente**.

La chaîne existe déjà en production dans `scenario-suites.ts` : `objects-in-area` →
`state.set(K.building)` → `switch-focus` → `property-list-at`. Le helper `need()` lève `StepSkip` si
le maillon amont manque : l'étape est **sautée avec sa raison**, ni échec ni faux vert.

Et il y a **deux niveaux** : `derived()` juge plusieurs trames d'une même séquence en rejouant le
segment marqué par `ctx.wire.mark()`, **sans rien réémettre**. Une séquence s'exerce une fois et
s'assertent en plusieurs points.

**Limite :** `SessionDriver` est un `Pick<>` de lectures — les séquences **mutatives** attendent S2.

### 3.5 L'attribution d'un gel est immédiate, elle ne coûte plus 47 minutes

`runSuite` s'arrête au premier `response === null` (`runner.ts:262-273`) ; le harnais enregistre déjà
chaque trame sortante (`recorder.recordOut`) ; le journal survit au gel puisque c'est le serveur qui
se tait, pas notre processus. **La dernière trame émise est le suspect, directement.** Il reste à
écrire le `HaltRecord` sur `stoppedOnSilence` — le type existe, personne ne l'écrit (édition 7 de S2).

L'oracle `ISCnx` (résolution ~47 min) garde **un seul rôle** : distinguer « c'est nous » de « c'est
un tiers ». Deux gels en quatre jours n'étaient pas de notre fait. Vérification **a posteriori**,
jamais une barrière.

**Un gel nous coûte 60 s** (délai `FAST`) plus la queue de run confisquée — pas 12 h 41. Le seul
terme qui compte est que le run suivant attende le retour du serveur.

### 3.6 Le gate ne se déclenche que si la surface RDO a bougé

Livré et testé (26 tests). `.claude/hooks/rdo-surface.json` déclare la surface : **tier 1** = les 7
fichiers qui changent chaque octet sur le fil, **tier 2** = les émetteurs et le catalogue, plus des
exclusions. `rdo-surface.js` détecte via git et date la fraîcheur **sur les seuls fichiers de la
surface**. Mesure réelle : 24 fichiers modifiés → **20 ignorés**, 4 retenus.

Deux pièges corrigés au passage : la mtime portait sur **tout `src/`** (un `.md` jetait une
certification payée), et un `push` était jugé comme un `commit`.

---

## 4. Trois refus à tenir

1. **Jamais déguiser une mutation en `risk:'read'`** pour passer le gate. Un agent l'a proposé et l'a
   lui-même qualifié de *« mensonge au gate »*. Falsifier la classe de risque corromprait la
   comptabilité de la suite qu'on construit. Le chemin est `--allow-mutations`.
2. **`assertNotVoidPush` est une convention** (`CLAUDE.md` le dit) — un opt-in `probe` est légitime.
   **`assertNotVariantOnVoidMember` est la garde** et ne bouge pas.
3. **`sendRdoRequest` n'est pas un trou à fermer** — c'est le moteur de `ctx.emit` et le seul chemin
   qui traverse le formateur, les gardes, les délais et le contrat `errorCode`.

---

## 5. Ce qui a été dit au développeur avant la vague 1 de S4 — et sa réponse

**Le balayage exécute les corps de méthode.** `error 5` est décidé avant l'appel (`MethodAddress`),
mais tout le reste passe par `call MethodAddr`. C'est donc une **campagne de mutation sur le compte
vivant `SPO_test3`** — 41 installations — et non une lecture. Il assume le crash ; **une modification
d'état non voulue est autre chose**, et il doit le savoir avant, pas après.

**Réponse donnée le 2026-08-18 : GO.** *« Pas de problème pour une altération du compte. »* Avec
**trois exclusions**, motif opérationnel — elles détruiraient le contenu du compte de test et
empêcheraient tout test ultérieur : **suppression du compte · suppression d'une compagnie ·
régression de niveau**.

Elles sont **compilées** dans la garde (édition 1 de S4), parce que le balayage est aveugle par
construction et ne peut pas savoir qu'il appelle `RDODelCompany`. Les sept membres, tous
`published` dans `Kernel/World.pas` : `RDODelTycoon` :367 · `RDOResetTycoon` :368 · `RDOResetTycoonEx`
:369 · `RDODelCompany` :372 · `RDOGetRidOfCompany` :373 · `RDOAssignLevel` :402 ·
`RDOResetTournament` :415. Détail et vérifications : plan §4 bis.

**Protocole bâtiment, dicté par lui :** démolir **un parc**, puis le reconstruire **au même endroit**
— la démolition produit le `(x, y)` que la construction consomme, ce qui règle le choix des
coordonnées.

Et sur les inconnues : *« ne t'inquiète pas pour les éléments que tu découvriras en LIVE — c'est le
but. »* Une surprise live s'enregistre et ne bloque pas.

---

## 6. État de l'arbre

**Vert** : `npm run typecheck` OK, `npx jest --testPathPatterns "conformance|rdo-request-guards"` →
**16 suites, 279 tests**. Suite complète 240 suites / 6 214 tests. **Rien n'est commité** — ~30
fichiers modifiés ou non suivis.

Lots faits : **L0** (garde `VOID_MEMBERS`, oracle O5-a/O5-b, bus `.rdo-live/`) · **A** (l'inventaire) ·
**S2** (les 9 éditions du harnais, 2026-08-18).

Lots ouverts, dans l'ordre :

1. **S1, seconde moitié** — `extract-rdo-arity.js` est sur disque, mais **`verdicts.ndjson` n'a jamais
   été produit**. C'est le pré-rempli sur lequel S5 réinjecte ; sans lui S5 n'a pas d'entrée.
2. **S3** — les 5 membres jamais émis, côté mock. Aucun risque live.
3. **S4** — le balayage. **Go donné le 2026-08-18** ; prompt écrit et prêt :
   [campagne-live-S4.md](campagne-live-S4.md). Il porte l'édition 0 et l'édition 1 ci-dessous.

⚠ **Édition 0 de S4, avant toute chose** : `cli.ts:137-138` porte encore *« the step is settled
(error 9, live 2026-08-16) »* — le raisonnement `ClientAware`-seulement que l'édition 8 de S2 a retiré
de `runner.ts` et qui a survécu dans son jumeau. La règle `--allow-variant-on-procedure` ≠ `--suite
all` **reste** ; seul son motif est à réécrire.

---

## 7. Méthode, et pourquoi elle tient

**Une session neuve par lot, prompt écrit à l'avance, CR à chaque fois.** Sur les lots précédents,
chaque prompt a été corrigé par le lot qui l'exécutait — c'est le comportement attendu et il faut
l'écrire explicitement dans chaque prompt :

- **L0** a corrigé deux inexactitudes du sien ;
- un panel de 11 agents a **réfuté la révision 1** du plan (9 bloquants, 25 majeurs) ;
- le **lot A** a invalidé trois chiffres de la rév. 2 et son plancher de couverture ;
- un panel de 5 agents a rendu la **rév. 2 obsolète**.

**Ne jamais déléguer la compréhension** : synthétiser les CR soi-même, vérifier les affirmations
porteuses dans le code, puis agir. Deux affirmations du dernier panel étaient fausses et une nuance
lui avait échappé.

**Décisions déjà prises, ne pas rouvrir :** `#44 RDODisconnectFromTycoon` est
`excluded:irreversible` mais **dossier volontairement ouvert** · le hook du gate n'est **pas**
modifié pour l'interblocage `HALT` · l'arrêt automatique à 180 s est **retiré**, `HALT` est un frein
**manuel** · la bascule ASP → RDO est **retenue**.

Réponses **en français** ; `doc/` en anglais, `report/` en français.
