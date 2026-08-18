# ✅ EXÉCUTÉ — Lot L0

> Exécuté avant le 2026-08-18. A livré la garde `VOID_MEMBERS`, l'oracle O5, et le bus `.rdo-live/`.
> **Ces livrables sont toujours en service.** La campagne dont il faisait partie a en revanche été
> renversée : [plan-certification-rdo-rev4.md](../../report/plan-certification-rdo-rev4.md).

---

# Lot L0 — Filet de sécurité de la campagne live RDO

**Session neuve. Modèle : Opus 5. Effort : high. Aucun agent à lancer — la session *est* l'agent.**

---

## Mission

Tu poses le filet de sécurité d'une campagne live qui va, à terme, exécuter **l'intégralité des
scénarios RDO contre le serveur de production partagé `planitia`**. Ton lot ne touche aucun serveur.

Il existe parce que la campagne ne peut pas commencer sans trois choses qui manquent aujourd'hui :

1. un **garde** qui empêche d'émettre `"^"` sur les `procedure` du serveur de cache ;
2. un **oracle** capable de *voir* un gel — l'actuel ne le voit pas ;
3. un **disjoncteur** qui arrête tout au premier non-réponse confirmé.

Sans ces trois-là, la campagne serait aveugle à la seule chose qu'elle doit éviter.

**Lis d'abord** [report/plan-campagne-live-rdo.md](../../report/plan-campagne-live-rdo.md) — il
donne le cadre complet, les 11 lots et les contraintes C1 à C9. Ton lot est L0.

---

## Le fait qui commande tout

`"^"` (VariantId) sur une `procedure` Delphi **gèle l'Interface Server partagé**. `RegsUsed`
atteint `MaxRegs = 3` → `push edi` (`RDOObjectServer.pas:292`) : le serveur pousse un pointeur de
résultat caché qu'une procédure en convention `register` ne dépile jamais. Réf.
`RDOQueryServer.pas:422-424`.

Ce n'est pas une précaution, c'est une propriété du serveur, observée **deux fois en production** —
2026-08-14 (12 h 41 d'indisponibilité) et 2026-08-17 (23 min).

---

## Lectures obligatoires

1. Invoque la skill **`rdo-conformity`** — checklist, choix du verbe, matrice des séparateurs
2. [doc/rdo-protocol-architecture.md](../rdo-protocol-architecture.md) — hiérarchie de preuve §0,
   matrice des séparateurs §8.5
3. [doc/E2E-LIVE-CAMPAIGN.md](../E2E-LIVE-CAMPAIGN.md) — le tableau des oracles O1-O6 (§ ligne 117)
4. [report/campaign/forensique-logs-2026-08-17.md](../../report/campaign/forensique-logs-2026-08-17.md)
   — §4, la signature d'un gel
5. [report/faisabilite-abandon-asp.md](../../report/faisabilite-abandon-asp.md) §12.4 — la trouvaille
   qui motive D1
6. Skill **`delphi-archaeologist`** pour toute citation Pascal, **`spo-testing`** pour les tests

---

## D1 — Étendre `VOID_MEMBERS` aux trois `procedure` du cache

`Cache Server/CachedObjectWrap.pas:18-39` publie **17 `function` et 3 `procedure`** :

| Membre | Déclaration | Séparateur obligatoire |
|---|---|---|
| `RDODestroy` | `CachedObjectWrap.pas:35` | `"*"` |
| `KeepAlive` | `CachedObjectWrap.pas:36` | `"*"` |
| `Refresh` | `CachedObjectWrap.pas:37` | `"*"` |

Aucun des trois n'est dans `VOID_MEMBERS`
([src/server/session/rdo-request-guards.ts:39-50](../../src/server/session/rdo-request-guards.ts#L39-L50)).

**Vérifie chaque déclaration toi-même avant de l'inscrire** — ne recopie pas ce tableau sur parole.
La règle du projet est que toute entrée de `VOID_MEMBERS` porte sa citation `Fichier.pas:Ligne`, et
une entrée fausse est pire qu'une entrée absente : elle légitimerait un `"*"` sur une `function`.

**Contexte utile :** `KeepAlive` est **déjà** émis correctement avec `.push()`
([spo_session.ts:2024-2028](../../src/server/spo_session.ts#L2024-L2028)). L'ajout ne corrige donc
pas un bug actif — il transforme un comportement *correct par le soin de l'auteur* en comportement
*correct par contrainte*. C'est exactement la différence que `VOID_MEMBERS` existe pour créer.

**Contrôle attendu en plus :** balaie les sites d'appel actuels et confirme qu'aucun n'émet `"^"`
sur ces trois membres. Si tu en trouves un, c'est un correctif de production — signale-le en tête
de ton CR.

**Hors périmètre :** l'audit exhaustif des séparateurs de tous les membres RDO est le lot L2. Ne le
commence pas ici.

---

## D2 — Réécrire l'oracle O5

**Formulation actuelle**, [doc/E2E-LIVE-CAMPAIGN.md:121](../E2E-LIVE-CAMPAIGN.md#L121) :

> O5 · Absence de pathologie · *IS/MS `Survival` propre, pas de trou de heartbeat, pas de
> `TimeWarp`, `Clients` exit code 0, pas de déconnexion/timeout passerelle*

**Pourquoi elle est fausse.** Un gel ne produit **aucune** ligne : ni exception, ni
`Start Disconnecting`, ni ligne `Clients` — le journal s'arrête, simplement. `Clients exit code 0`
ne détecte donc rien. Le seul témoin est **externe** : le Model Server journalise des
`ModelStatusChanged` sans réponse jusqu'à `ISCnx Error writing to socket`. Lors du gel du
2026-08-14, 34 pushes sans réponse.

**Ce qu'il faut produire :** un O5 fondé sur le canal **`ISCnx`** du Model Server, c'est-à-dire sur
la détection d'une **absence** et non d'un message.

Points à trancher, en t'appuyant sur les journaux réels déjà collectés dans
`report/campaign/logs-cache/2026-08-17-preserve/` (11 fichiers, ne les re-télécharge pas) :

- quelle est la signature exacte d'un `ISCnx` sain, et au bout de combien de temps l'anomalie
  devient concluante ?
- quel est le taux de faux positifs ? Le serveur cale **légitimement** pendant les ticks de
  simulation (`src/shared/timeout-categories.ts:6-13`) — un O5 qui crie à chaque tick est inutile ;
- l'oracle est-il purement documentaire, ou existe-t-il un corrélateur en code à mettre à jour ?
  `doc/E2E-LIVE-CAMPAIGN.md` mentionne « run the correlator » — trouve-le et tranche.

Mets à jour la ligne O5 du tableau **et** tout endroit qui s'appuie sur l'ancienne formulation.

---

## D3 — Le disjoncteur et le protocole `HALT`

**Règle développeur :** arrêt de la campagne dès que le serveur ne répond plus au-delà du **plus
long délai accepté du projet**.

Ce délai est **`IS_PROXY_TIMEOUT_MS` = 180 000 ms**
([src/shared/timeout-categories.ts:43](../../src/shared/timeout-categories.ts#L43)), soit le
`ISProxyTimeOut` du client Delphi (`ServerCnxHandler.pas:329`).

**Contrainte de conception, à respecter :** n'arme **pas** un minuteur parallèle de 180 s. Il
courrait contre la limite RDO armée à la même durée, et l'ordre de déclenchement serait
indéterminé. Le disjoncteur se branche **sur le rejet de la couche RDO elle-même** — la première
expiration `TimeoutCategory.NORMAL`/`SLOW`/`VERY_SLOW` rencontrée pendant la campagne **est**
l'événement `HALT`.

À l'expiration, dans cet ordre :

1. écrire `.rdo-live/HALT` — horodatage **UTC**, dernière trame émise, membre, socket,
   `ClientViewId`, identifiant de vague
2. cesser toute émission. **Ne pas réessayer, ne pas « tester si ça remarche »**
3. capturer les journaux serveur immédiatement — la fenêtre de diagnostic est courte
4. rendre la main

**Attention au fichier protégé.** `spo_session.ts` est protégé par `CLAUDE.md`. Si ton implémentation
exige de le modifier, **arrête-toi et explique pourquoi dans ton CR** plutôt que de le modifier.
Le disjoncteur est un dispositif *de campagne* : il a probablement sa place dans le harnais de
conformité (`src/tools/conformance/`), pas dans la session de production.

---

## D4 — `.rdo-live/README.md`

Le bus d'échange entre agents. **À la racine du dépôt**, déjà ajouté à `.gitignore`.

L'emplacement n'est pas négociable, et la raison est technique : le gate de conformité compare la
mtime la plus récente **sous `src/`** aux derniers runs replay+live, sans filtre d'extension. Un bus
sous `src/` ferait payer un run live sur planitia à chaque écriture d'agent.

Crée l'arborescence et écris le `README.md` qui énonce les trois règles du protocole (§2.3 du plan) :

- **un fichier, un écrivain** — les fichiers partagés sont du NDJSON en **ajout seul**
- **lire avant d'agir, écrire après** — première action de tout agent : lire `HALT`, puis
  `verdicts.ndjson` et `inventory.ndjson`
- **`HALT` est vérifié avant chaque action live, sans exception**

Définis les schémas de `inventory.ndjson`, `verdicts.ndjson` et `blocked.ndjson`. Pour ce dernier,
reprends la taxonomie existante de `report/campaign/coverage-matrix.md` §1
(`blocked:<no-facility|ui-disabled|ui-absent|role|funds|precondition|target|server|harness>`) — ne
l'invente pas.

Écris ce README **pour un agent qui n'a pas ton contexte**. C'est sa seule source sur le protocole.

---

## Contraintes

- **Fichiers protégés** — `rdo-types.ts`, `rdo.ts`, `spo_session.ts`, `jest.config.js`. Ne les
  modifie pas ; si tu penses devoir le faire, explique-le dans le CR.
- **Tests obligatoires** — lignes nouvelles ou modifiées à **≥ 93 %** de couverture. Tests
  co-localisés (`module.ts` → `module.test.ts`).
- **Ne commit pas, ne push pas.** Ce lot ré-arme volontairement le gate de conformité (il écrit
  sous `src/`) ; c'est attendu et sans conséquence, aucun live n'ayant lieu avant L2b.
- **Fins de ligne LF** uniquement.
- `npm run typecheck` et `npm test` verts avant de rendre.
- Jamais de `any` ; `unknown` dans les `catch` + `toErrorMessage()`.
- Réponses et rapports **en français** ; la documentation sous `doc/` **en anglais**.

---

## Définition de « terminé »

- [ ] `VOID_MEMBERS` contient les trois membres, chacun avec sa citation Pascal **vérifiée**
- [ ] Aucun site d'appel actuel n'émet `"^"` sur ces trois membres (vérifié, pas supposé)
- [ ] O5 réécrit autour d'`ISCnx`, avec sa fenêtre de conclusion et son taux de faux positifs argumentés
- [ ] Le corrélateur, s'il existe, est à jour
- [ ] Le disjoncteur est branché sur le rejet RDO, pas sur un minuteur parallèle
- [ ] `.rdo-live/` existe avec son `README.md` et les trois schémas NDJSON
- [ ] typecheck + tests verts, couverture ≥ 93 % sur les lignes touchées

---

## Compte rendu attendu

En français, structuré ainsi :

1. **Ce qui a été fait**, livrable par livrable, avec les chemins de fichiers
2. **Les citations Pascal** que tu as vérifiées toi-même, et celles que tu n'as **pas** pu vérifier
3. **Les décisions de conception** — en particulier sur O5 : quelle fenêtre, quel taux de faux
   positifs, et sur quelles données tu t'appuies
4. **Ce que tu n'as pas fait et pourquoi** — fichier protégé rencontré, question ouverte, doute
5. **Ce qui doit changer dans le plan** pour les lots suivants, si ton travail l'a révélé

**Si quelque chose te paraît faux dans ce prompt, dis-le plutôt que de l'appliquer.** Sur les sept
lots précédents de ce projet, le prompt s'est trompé trois fois, et à chaque fois c'est le lot qui
l'a rattrapé.
