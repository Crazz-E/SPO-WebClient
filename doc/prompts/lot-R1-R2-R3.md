# ✅ EXÉCUTÉ — Lots R1 + R2 + R3

> Exécuté le 2026-08-18, livré et accepté. CR : [lot-R1-R2-R3.md](../../report/lot-R1-R2-R3.md).
>
> **Le lot a eu raison contre ce prompt sur deux points**, et c'est le comportement attendu :
> son §3.7 demandait de promouvoir la signature `Malformed query` en échec alors qu'elle n'était pas
> même **collectée** (l'ancien `TROUBLE` ne la matchait pas) — la demande aurait porté sur rien ; et
> son §3.2 supposait un `get` trivial sur l'Interface Server, qui n'est pas adressable avant
> `connectDirectory`.

---

# Lots R1 + R2 + R3 — nettoyage, garde-fous, socle de connexion

**Session neuve. Modèle : Opus 5. Effort : `high`.**
**Aucun agent, aucun workflow** — voir §0.

**Aucune trame ne doit partir. Aucun run live. Aucun test E2E d'interface.**

---

## 0. Pourquoi tu travailles seul

Les trois lots éditent les **mêmes fichiers** — `suites.ts`, `cli.ts`, `runner.ts`, `run.ts`,
`types.ts` — et dans un ordre qui compte : R1 supprime, R2 et R3 ajoutent des tests qui doivent
survivre à cette suppression. Des agents parallèles se marcheraient dessus et produiraient un arbre
rouge. **Fais-le en série, toi-même, dans l'ordre du document.**

---

## 1. Le cadre

**Plan en vigueur : [report/plan-certification-rdo-rev4.md](../../report/plan-certification-rdo-rev4.md).**
Lis-le avant de commencer. La révision 3 est morte et porte un bandeau d'obsolescence.

**Le principe :** *ce que le client fait en production est sûr par construction.* On n'écrit plus de
trame à la main : on appelle des méthodes de session. Le séparateur, l'arité et les types viennent du
code de production, qui les a déjà justes.

**Ce qui a tué la rév. 3**, parce que ça conditionne tout ce que tu vas faire :

| Forme | Conséquence | Prouvé |
|---|---|---|
| `"^"` sur une **procedure**, 2 args registre | pointeur de résultat empilé, jamais dépilé → **gel** | 2026-08-14, `SayThis` |
| `"*"` sur une **function** | aucun pointeur passé, la fonction en écrit un quand même → **écriture mémoire arbitraire** → `error 1` universel → **crash** | 2026-08-18, `GetUserList` |

**Il n'existe donc aucune trame sûre pour un membre dont personne n'a la déclaration.**

### État bloquant

`planitia` est à terre depuis 11:39 le 2026-08-18 (Interface Server **et** Model Server).
`.rdo-live/HALT` est posé. **Tout ce lot est hors ligne** — c'est voulu, les trois lots n'ont besoin
d'aucun serveur.

---

## 2. R1 — Retirer le balayage

### 2.1 D'abord sauver le gabarit, ensuite supprimer

`sweep.ts:549-639` contient la séquence **démolir puis reconstruire une installation**, écrite en
`ctx.scenario` sur de vraies méthodes de session (`fetchOwnedFacilities`, `focusBuilding`,
`fetchBuildingCategories`, `fetchBuildingFacilities`, `deleteFacility`, `placeBuilding`), avec
chaînage par `ctx.state` et `StepSkip` défensif partout. **C'est exactement le gabarit dont le
parcours P6 aura besoin, et le fichier n'est pas suivi par git : le supprimer le perd.**

Recopie ce bloc — y compris `FACILITY_LOCATE`, le `PARK_PATTERN` et les steps suivants — dans
**`report/gabarit-parcours-parc.md`**, en bloc de code annoté, avec une phrase disant d'où il vient et
à quoi il servira. Ce n'est pas du code vivant, c'est une pièce d'archive.

### 2.2 Supprimer

Quatre fichiers, **tous non suivis par git** — suppression propre, aucun historique à réécrire :

```
src/tools/conformance/sweep.ts            (773 l.)
src/tools/conformance/sweep-plan.ts       (476 l.)
src/tools/conformance/sweep.test.ts       (648 l.)
src/tools/conformance/sweep-plan.test.ts  (245 l.)
```

### 2.3 Décrocher — deux fichiers de production

**`suites.ts`** : retirer l'import (`:28 import { SWEEP_SUITES } from './sweep'`), l'étalement
(`:397 ...SWEEP_SUITES`), et la mention du balayage dans le JSDoc (`:384-393`). Le commentaire de
`assertPacketSafe` (`:123`, `:135`, `:150`) parle aussi du balayage : réécris-le pour qu'il décrive
la règle, pas la campagne morte. **Ne touche pas à la logique de `assertPacketSafe`.**

**`cli.ts`** : retirer l'import `SWEEP_SUITE_NAMES` (`:15`), et les mentions `:32-34`, `:69-70`,
`:103-106`, `:148`.

⚠ **`:106` — ne te contente pas de supprimer le filtre.**
`const suites = requested === 'all' ? known.filter(n => !SWEEP_SUITE_NAMES.has(n)) : …`
Remplace-le par une constante locale documentée :

```ts
/**
 * Suites that `--suite all` must not pick up — `all` is the gate's replay step,
 * so a suite without a baseline recording would read as silence.
 * Empty since 2026-08-18 (the certification sweep was removed): the set is kept
 * so the rule survives, and so the next non-replayable suite has an obvious home.
 */
const NOT_REPLAYABLE: ReadonlySet<string> = new Set();
```

**Conserver `--allow-variant-on-procedure`.** Il garde encore une étape réelle
(`separators/variant-on-zero-param-procedure`, `suites.ts:250-257`, adjugée par capture live du
2026-08-16). Son refus combiné à `--suite all` (`cli.ts:157-163`) **reste**. Son motif a déjà été
réécrit par le lot S4 : vérifie qu'il ne parle plus du balayage, et corrige sinon.

### 2.4 Le verrou de régression à remplacer — ne le perds pas

`sweep.test.ts:220-221` porte **le seul verrou nommé** contre la trame qui a cassé la production :

```ts
it('has no sweep-void suite', () => {
  expect(SWEEP_SUITES.map(s => s.name)).not.toContain('sweep-void');
});
```

Il disparaît avec le fichier. Écris son remplaçant **en formulation positive**, dans `suites.test.ts`,
et c'est la pièce la plus importante de R1 :

> Parcourir **toutes** les `SUITES` et refuser **toute étape déclarative qui émet `"*"` sur un membre
> absent de `VOID_MEMBERS`.**

C'est la traduction exacte, en test, de la règle qui manquait le 2026-08-18. Donne-lui un commentaire
qui cite l'incident (`GetUserList`, 2026-08-18) pour que personne ne le supprime en le croyant
cosmétique.

### 2.5 Budget de trames

`DEFAULT_FRAME_BUDGET = 3000` (`runner.ts:71`) était dimensionné pour ~450 trames de balayage plus la
marge. Ramène-le à une valeur de parcours — **600** est un point de départ raisonnable (les 7 suites
actuelles plus le socle de connexion plus de la marge), mais **mesure-le** sur un rejeu avant de
figer, et écris la mesure dans le commentaire `:63-70`. Mets à jour `runner.test.ts:78` et le texte
d'usage de `cli.ts:89`.

### 2.6 Ce qui ne bouge pas

- **`src/server/session/rdo-request-guards.ts` en entier** — `VOID_MEMBERS` (:39),
  `FORBIDDEN_MEMBERS` (:132), `assertMemberNotForbidden` (:160), `assertNotVariantOnVoidMember`
  (:183), `assertNotVoidPush` (:238). **`assertNotVoidPush` est une garde de sûreté depuis le
  2026-08-18 et ne prend aucun opt-in.** Ne réintroduis pas de `probe` : c'est lui qui a laissé
  sortir la trame.
- `halt.ts` et l'attribution. **Rien n'écrit `.rdo-live/HALT`** — frein manuel, décision développeur,
  motifs dans `halt.ts:8-32`. **Ne réintroduis pas de déclencheur automatique.**
- L'enregistreur, le rejeu, le diff de baseline, le gate.
- Les méthodes de mutation de `SessionDriver` (`types.ts:158-175`) : elles deviennent orphelines mais
  **on les garde** — les parcours P5-P12 de R4 en ont besoin. Ajoute un commentaire disant pourquoi.
- **`report/campaign/rec/planitia-2026-08-18-sweep.ndjson` et `-run.json`** : ce sont les pièces du
  dossier d'incident. **Ne les supprime pas.**

---

## 3. R2 — Les garde-fous

Huit points, par ordre de valeur. Chacun avec son test.

### 3.1 Détecteur de dégradation globale — le plus important

Aujourd'hui **la seule condition d'arrêt est le silence** : `runner.ts:341`,
`if (report.outcome.response === null)`. Or une réponse `error 1` est un `outcome` avec `response`
**non nulle** : elle produit un `FAIL` par étape et **n'interrompt rien**.

Le 2026-08-18 le serveur a répondu `error 1` à **tout** pendant 75 minutes et le harnais a continué à
émettre. Ajoute, à côté de la règle stop-on-silence : **N réponses en erreur consécutives → arrêt du
run**, avec la même attribution que le silence (`HaltRecord`, `onHalt`). N = 5 est un bon départ.

⚠ **Calibration honnête, à écrire dans le commentaire :** ça n'aurait **pas** empêché l'incident — le
dégât était fait par la première trame. Ça réduit le rayon, ça ne protège pas de la trame qui casse.

### 3.2 Sonde pré-vol avant le login live

Avant le premier `connectDirectory` en transport live : ouvrir un socket, `idof InterfaceServer`, un
`get` trivial, et **refuser de démarrer** si la réponse est une erreur ou un timeout.

Raison : deux gels en quatre jours n'étaient pas de notre fait. Sans cette sonde, on s'attribue
l'incident d'un tiers — ou pire, on émet contre un serveur déjà mourant.

### 3.3 Assertion de phase avant l'exploration

Juste avant `runner.runAll` (`run.ts:222`) : `session.getPhase()` doit valoir `WORLD_CONNECTED`
**et** `session.getCurrentCompany()` doit être non nul, sinon le run s'arrête avec un message nommé.

C'est ce qui rend la séquence opérationnelle **exigible** au lieu de simplement respectée.

### 3.4 Colmater le faux positif du rejeu

`run.ts:197` force `world.ip` à `127.0.0.1` en rejeu → `fetchCompaniesViaHttp` échoue → la liste
revient **vide** → la garde `if (!match && companies.length > 0)` (`:213-217`) est court-circuitée →
`selectCompany` reçoit un **nom** là où il attend un **id** → `currentCompany` reste `null` **et le
run passe quand même**.

Le rejeu valide donc une session où aucune entreprise n'est sélectionnée. Le même trou avale
silencieusement le piège connu des quotes mangées par npm (`--company SPO_test3` au lieu de
`"SPO_test3 - Green"` échoue bruyamment en live et passe sans un mot en rejeu).

**Refuse le run quand la liste est vide** au lieu de laisser passer. Traite proprement le cas rejeu :
soit l'enregistrement porte la liste, soit le rejeu déclare explicitement qu'il ne sélectionne pas
d'entreprise — mais **plus jamais un faux vert**.

### 3.5 Liste noire de cycle de vie

Rien n'interdit à une suite de réémettre les membres d'établissement de session **après** que la
session est établie. Le balayage l'a fait : `call Logon "*"` au rid 1089, après le `Logon` légitime du
rid 1019.

Ajoute dans `rdo-request-guards.ts` une `SESSION_LIFECYCLE_MEMBERS` : `Logon`, `AccountStatus`,
`RegisterEventsById`, `SetLanguage`, `Logoff`, `EnableEvents`, `ClientAware`, `ClientNotAware`,
`RDOOpenSession`, `RDOEndSession`, `RDOLogonUser`, `RDOMapSegaUser`. Refus quand ils sont émis hors de
la phase de connexion.

**Attention :** le socle de connexion de R3 les émet **légitimement**. La garde doit donc porter sur
la *phase*, pas sur le membre seul. Écris R3 d'abord si ça t'arrange, ou prévois le point d'entrée.

### 3.6 Écrire `--record` dans un `finally`

L'enregistrement est écrit à `run.ts:283-286`, **après** la corrélation des logs serveur et le diff de
baseline. Il est donc perdu sur deux chemins : une exception dans la phase de connexion
(`:187-244`, sans `catch`), et une baseline absente ou malformée (`JSON.parse` + `throw`, `:277-278`).

**Un échec au login détruit la preuve de l'incident.** Déplace l'écriture immédiatement après le
`finally` de `:244`, avant toute autre I/O.

### 3.7 Promouvoir les signatures dures des logs serveur

`server-logs.ts:368` collecte les lignes suspectes dans `verdict.anomalies` — elles sont **affichées,
jamais fatales**. Deux signatures doivent faire échouer le run :
`Malformed query in TRDOQueryServer.ExecQuery` et `Access violation`. Ce sont les deux traces qu'un
serveur laisse quand on l'a corrompu.

### 3.8 La ligne dans `spo_session.ts` — FICHIER PROTÉGÉ, lis le §5

`FORBIDDEN_MEMBERS` et `assertMemberNotForbidden` vivent dans le module de garde de production, mais
`spo_session.ts:2350-2355` n'appelle que `assertNotVoidPush` et `assertNotVariantOnVoidMember`.
**Le refus existe et n'est branché que sur l'outil de test.**

Au même endroit, le commentaire `:2350` dit encore *« the guard protects consistency, not the
server »* — c'est le cadrage retiré le 2026-08-18, et il est sur le chemin de production.

**Ne fais cette édition que si le §5 dit que le développeur l'a autorisée.** Sinon, arrête-toi sur ce
point, laisse le reste fait, et dis-le en CR.

---

## 4. R3 — Le socle de connexion, promu en suite

**Exigence du développeur :** le processus opérationnel doit toujours être respecté.

L'ordre réel, vérifié dans les deux chemins — et **les deux étapes du milieu sont inversées par
rapport à l'énoncé, par nécessité** : la liste des entreprises est un *produit* de la connexion au
monde (elle revient dans la réponse de `REQ_LOGIN_WORLD`, `auth-handler.ts:112`). Le client Delphi de
référence fait de même.

> **authentification → choix du monde → connexion au monde → choix de l'entreprise → exploration**

**La séquence est déjà exécutée** par `run.ts:188 → 189-192 → 199 → 207-220 → 222-237 → 240`, prouvée
live le 2026-08-17. **Ce qui manque, c'est qu'elle ne soit ni observée, ni exigible.**

### Ce que tu écris

Une suite **`connexion`**, placée **en tête de `SUITES`**, avec un step par étape, ses oracles et son
attribution de silence — au lieu d'un préambule impératif silencieux dans `run.ts` :

| Step | Ce qu'il observe |
|---|---|
| `auth` | `connectDirectory` — l'annuaire répond, la liste des mondes est non vide |
| `world` | le monde demandé est **dans** la liste (refus nommé sinon) |
| `login` | `loginWorld` — `ClientViewId`, `InterfaceServerId`, `TycoonId` non nuls |
| `companies` | la liste des entreprises est non vide (§3.4) |
| `company` | `selectCompany` — `currentCompany` non nul, phase `WORLD_CONNECTED` |

Utilise `derived()` pour juger les trames de chaque étape **sans rien réémettre** : `loginWorld` seul
émet une vingtaine de trames (`idof`, 10 `get`, `AccountStatus`, `Logon`, `MailAccount`, `TycoonId`,
`RDOCnntId`, `RegisterEventsById`, `SetLanguage`), et chacune mérite son verdict.

**La forme d'écriture est imposée :** `ctx.scenario(member, session => …)` + `ctx.state`/`need()` +
`derived()`. **Aucun `packet`, aucun `ctx.emit`, aucun `ctx.push`** — c'est ce que font déjà les 7
suites de `scenario-suites.ts` (22 appels `ctx.scenario`, zéro trame fabriquée). C'est le gabarit.

### Le point délicat

La séquence de connexion s'exécute aujourd'hui **avant** que le runner existe (`run.ts` construit le
runner à `:222`, après le login). Tu dois donc soit faire observer la séquence par le runner en la
déplaçant dedans, soit enregistrer ses trames et les faire juger après coup par `derived()`.

**Les deux sont défendables. Choisis, et explique ton choix en CR** — c'est la seule vraie décision
de conception de ce lot.

Ne casse pas le contrat existant : `run.ts` doit continuer à refuser proprement un monde absent, une
entreprise absente, et à faire son `endSession()` dans un `finally`.

---

## 5. La décision du développeur — ACCORDÉE

> ✅ **Autorisation donnée par le développeur le 2026-08-18 : fais l'édition §3.8 dans
> `spo_session.ts`.**

`spo_session.ts` est protégé par `CLAUDE.md` (« modifier sans discussion » interdit). La discussion a
eu lieu, l'accord est donné. **Fais le §3.8.**

**Portée exacte de l'autorisation — elle ne couvre rien d'autre :**

1. **Appeler `assertMemberNotForbidden(packetData)`** dans le bloc de gardes de
   `spo_session.ts:2345-2360`, à côté de `assertNotVoidPush` (:2350) et
   `assertNotVariantOnVoidMember` (:2355), pour que la passerelle refuse elle aussi les sept
   `FORBIDDEN_MEMBERS`. Le refus doit passer par le même `catch (guardError)` qui relâche le slot
   acquis (:2357-2360).
2. **Corriger le commentaire `:2350`**, qui dit encore *« Void+QueryId is wire-legal … the guard
   protects consistency, not the server »*. C'est le cadrage **retiré le 2026-08-18** et il est sur
   le chemin de production. La formulation juste : `"*"` + QueryId est sûr **sur une `procedure`** —
   forme du client de référence, prouvée en capture — et constitue une **écriture mémoire
   arbitraire sur une `function`** ; `assertNotVoidPush` est donc une **garde de sûreté** depuis
   cette date, sans opt-in, et `VOID_MEMBERS` en est la liste blanche.

**Toute autre modification de `spo_session.ts` reste interdite.** Si tu crois en avoir besoin,
arrête-toi et explique.

Cette édition touche le chemin de production : elle doit avoir ses tests dans
`src/server/session/rdo-request-guards.test.ts` **et** un test de la passerelle prouvant que
l'émission d'un membre interdit via `sendRdoRequest` est refusée avant toute écriture socket.

---

## 6. Pièges relevés, à ne pas redécouvrir

- **`assertSuitesSafe` s'exécute à l'import** (`suites.ts:386`). Une suite portant un step
  `risk:'mutation'` **sans champ `reset`** fait exploser le CLI **avant le parsing des arguments**.
- **`ctx.push` ne traverse aucune garde** et n'émet **pas de QueryId** : aucune réponse corrélée.
- **`error 5` se lit « non publié »**, jamais « inexistant » (`MethodAddress` ne voit que le
  `published`).
- **La polarité de `assertPacketSafe` reste ouverte** (`if (!proc) return` dans la bande de danger).
  **Ne la ferme pas** : elle exigeait la liste des `function` prouvées, que le balayage n'a jamais
  produite. Le sujet est clos avec la rév. 3 — n'y touche pas dans ce lot.
- **Ne déguise jamais une mutation en `risk:'read'`.** Le chemin est `--allow-mutations`.

---

## 7. Contraintes

- Couverture **≥ 93 %** sur les lignes touchées ; tests co-localisés (`module.ts` → `module.test.ts`).
- **Protégés** — si tu crois devoir les modifier, arrête-toi et explique : `jest.config.js`,
  `rdo-types.ts`, `rdo.ts`, `spo_session.ts` (sauf §5 coché).
- `npm run typecheck` **et** `npx jest --testPathPatterns "conformance|rdo-request-guards"` verts
  avant de rendre. Lance aussi `npm test` complet une fois à la fin.
- **Aucune trame, aucun run live, aucun `npm run conformance` contre un serveur.** Un rejeu hors
  ligne (`--transport replay --recording report/campaign/rec/planitia-2026-08-17.ndjson`) est
  autorisé et utile pour la mesure du §2.5.
- Ne commit pas, ne push pas. LF. Rapport **en français**, dans `report/`.
- Le gate réclamera rejeu puis live au prochain sync : la surface RDO bouge. Attendu, et impossible à
  satisfaire tant que `planitia` est mort — **ne cherche pas à contourner le gate.**

---

## 8. Définition de « terminé »

- [ ] Gabarit parc archivé dans `report/gabarit-parcours-parc.md` **avant** suppression
- [ ] 4 fichiers `sweep*` supprimés, `suites.ts` et `cli.ts` décrochés, `NOT_REPLAYABLE` en place
- [ ] Le verrou de remplacement existe et **échoue** si on lui donne une suite fautive (teste-le
      en le cassant volontairement, puis remets)
- [ ] `DEFAULT_FRAME_BUDGET` mesuré, pas deviné
- [ ] Les 8 garde-fous du §3 (ou 7 + la raison, si §5 non coché), chacun avec son test
- [ ] La suite `connexion` existe, est en tête de `SUITES`, et n'émet aucune trame fabriquée
- [ ] Un run de rejeu passe encore de bout en bout
- [ ] typecheck + suite complète verts

## 9. Compte rendu attendu

**(1)** R1 : ce qui est supprimé, ce qui est décroché, le verrou de remplacement et la preuve qu'il
mord ; **(2)** R2 : les 8 points, chacun avec son test, et la valeur mesurée du budget ;
**(3)** R3 : la suite `connexion`, **et surtout ton choix de conception** sur le point délicat du §4,
avec sa raison ; **(4)** ce que tu as dû changer par rapport à ce prompt et pourquoi ; **(5)** ce qui
reste ouvert pour R4 (les parcours P5-P12).

**Si quelque chose te paraît faux ici, dis-le plutôt que de l'appliquer.** Le lot L0 a corrigé deux
inexactitudes du sien, un panel de 11 agents a réfuté la révision 1 du plan, le lot A a invalidé trois
de ses chiffres, le lot S2 a eu raison de refuser une édition telle qu'elle était écrite, et la
révision 3 est morte d'une prémisse que personne n'avait testée.
