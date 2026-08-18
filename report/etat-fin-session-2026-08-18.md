# État de fin de session — 2026-08-18

**Note de passation pour la session de vérification.** Ce document dit ce qui est vrai à la clôture,
ce qui a changé dans la journée, et **où chercher les incohérences que je n'ai pas vues**.

**Rien n'est commité.** Environ 40 fichiers modifiés ou non suivis.

---

## 1. Ce qu'il faut savoir avant tout

La journée a **renversé la stratégie du projet** et **cassé le serveur de production partagé**. Les
deux sont liés. Si un document semble se contredire, la règle est simple : **le plus récent gagne**, et
le plus récent est [plan-certification-rdo-rev4.md](plan-certification-rdo-rev4.md).

### L'incident, en une phrase

Un balayage de certification a émis `call GetUserList "*"` — `"*"` (VoidId) sur une Delphi
**`function`**. Le répartiteur ne passe alors **aucun pointeur de résultat** (`@ResParam` voit
`Res.VType = varEmpty` et saute à `@DoCall`, `RDOObjectServer.pas:281-283`), mais la fonction compilée
écrit quand même son `OleVariant` à travers `EDX`, laissé à une valeur arbitraire. **Écriture mémoire
arbitraire dans le processus.** L'Interface Server a ensuite répondu `errMalformedQuery` à toute
requête de toute connexion pendant **3 h 42**, sans crasher et sans redémarrer.

### Trois erreurs que j'ai commises et corrigées — vérifiez que la correction a bien pris partout

1. **« Le processus a crashé »** — faux, propagé depuis une **erreur de fuseau horaire** de ma part
   (logs en UTC, machine en UTC+2 : j'ai lu un journal en train de s'écrire comme un journal arrêté
   deux heures plus tôt). Corrigé dans `CLAUDE.md`, `doc/rdo-protocol-architecture.md` §8.5,
   `spo_session.ts` (commentaire) et `plan-certification-rdo-rev4.md` §1.
   **À vérifier : reste-t-il une occurrence ailleurs ?**
2. **« Aucune bannière de démarrage ⇒ aucun redémarrage »** — raisonnement invalide : **il n'y a jamais
   de bannière**. La conclusion était juste par accident. La skill `starpeace-server-logs` porte les
   marqueurs indirects corrects.
3. **« `(326)` = exception dans le corps de la méthode »** — faux. `(326)` est l'`except` **externe**
   → `errIllegalObject` ; le corps de méthode c'est `(319)` → `errIllegalParamList`. Annoté dans
   `doc/prompts/skill-starpeace-server-logs.md`.

---

## 2. Ce qui fait foi, et ce qui est périmé

### En vigueur

| Document | Rôle |
|---|---|
| [plan-certification-rdo-rev4.md](plan-certification-rdo-rev4.md) | **Le plan.** §5 réécrit trois fois dans la journée, la version retenue est la troisième |
| [doc/PROCESSUS-CAPTURE.md](../doc/PROCESSUS-CAPTURE.md) | **Le processus de capture**, créé en clôture — la procédure opératoire durable |
| [doc/BACKLOG-OPEN.md](../doc/BACKLOG-OPEN.md) | **Les 15 constats ouverts**, dont 1 fermé (OB-7). Compagnon de `BACKLOG.md`, qui n'est qu'un historique du fait |
| [doc/parcours/](../doc/parcours/) | Les 5 scripts de parcours, chacun annoté de son résultat |
| `.claude/skills/starpeace-server-logs/SKILL.md` | Lecture des journaux Delphi, créée ce jour |

### Périmé — bandeaux posés en clôture

`doc/prompts/campagne-live-S4.md` (⛔ **ne pas exécuter** — c'est le prompt qui a cassé le serveur) ·
`doc/prompts/pilotage-campagne-rdo.md` (⛔ pilote la campagne morte) ·
`campagne-live-B.md`, `campagne-live-L1.md` (⛔ jamais exécutés, sans objet) ·
`campagne-live-L0.md`, `campagne-live-A.md`, `campagne-live-S2.md`, `lot-R1-R2-R3.md` (✅ exécutés) ·
[plan-campagne-live-rdo.md](plan-campagne-live-rdo.md) (⛔ rév. 3, dossier d'incident).

### Deux rapports antérieurs annotés, car ils portaient une affirmation dangereuse

[network-server-risk-report.md](network-server-risk-report.md) et
[rdo-conformity-report.md](rdo-conformity-report.md) affirmaient que `"*"` + QueryId *« ne fait pas
crasher le serveur »* et que `assertNotVoidPush` est *« une convention »*. Bandeau de correction posé.
Le reste de ces rapports n'est pas invalidé.

**La même affirmation était dans la skill `rdo-conformity`**, chargée avant tout travail RDO — et elle
ordonnait de ne pas la remettre en cause (*« Do not reintroduce it »*). Corrigée : la matrice distingue
désormais `"*"` sur `procedure` (requis) de `"*"` sur `function` (écriture arbitraire).

---

## 3. Ce qui a été livré

**R1** balayage supprimé (4 fichiers, 2 142 lignes, 82 tests), `suites.ts`/`cli.ts` décrochés, verrou
de régression en formulation positive · **R2** 8 garde-fous · **R3** suite `connexion`
(`connection-suite.ts`) · **R4** remplacé par la capture navigateur.

**Cinq captures, 1 383 échanges, six sockets, 88 membres RDO** — dont huit poussées serveur.
Enregistrées dans `captured-scenarios.validation.test.ts`, **liste tenue à la main**.

Le chaînon manquant était `npm run dev:record` (`scripts/dev-record.js`). Le reste de la chaîne
existait déjà et n'avait jamais servi pour notre propre client.

**Vérifications à la clôture :** `npm run typecheck` vert · `npx jest --testPathPatterns mock-server`
15 suites / 272 tests.

---

## 4. Où chercher les incohérences — mes propres soupçons

Par honnêteté, voici où je regarderais en premier :

1. **`doc/rdo-session-lifecycle.md` décrit une seule connexion par session.** OB-13 prouve qu'une
   bascule de rôle en fait deux, voire trois. **Non corrigé** — je ne l'ai pas touché.
2. **Les 7 suites de `scenario-suites.ts` et les 5 captures se recouvrent** (map, focus, inspector,
   chat, mail). Personne n'a arbitré si les suites gardent leur utilité ou si les captures les
   remplacent. Le plan §5 dit qu'elles « restent en service », ce qui est une décision par défaut, pas
   un arbitrage.
3. **`doc/E2E-LIVE-CAMPAIGN.md` décrit un pilotage navigateur** alors que l'implémentation était une
   CLI couche-session — dérive relevée par la recherche, **jamais corrigée**. Et le contexte a encore
   changé depuis.
4. **`doc/E2E-STRATEGY.md`** décrit des couches L0-L3 dont la numérotation **collisionne** avec les
   lots de campagne L0/L1. Relevé, non traité.
5. **La divergence `DAPort` / `DSArea`** (plan §12) reste ouverte et confirmée deux fois sur le fil.
6. **`report/lot-A-inventaire-campagne-live.md`** raisonne sur un dénominateur de 217 membres qui n'est
   plus l'objectif. Le fichier est utile comme référence de surface mais son cadrage est périmé.
7. **Le gate de conformité est ré-armé** (la surface RDO a bougé) et ne pourra pas être satisfait sans
   un rejeu puis un run live. Aucun commit n'est possible avant ça — c'est voulu, pas un défaut.

---

## 5. Ce qui reste à faire, hors vérification

- **`RDODisconnectInput`** — jumeau capturé (`RDODisconnectOutput`), même code.
- **`RDOVoteOf`**, **`GetAttachment`** — attendent une élection ouverte et un courrier avec pièce
  jointe. Bornés par l'état du monde.
- **`GetChannelInfo`**, **`Save`** — deux des sept handlers vivants sans interface (**OB-8**).
- **Corriger OB-1 et OB-11.** ⚠ Corriger OB-1 **fera diverger** `parcours-enchaine` au rejeu : le
  scénario fige le comportement actuel. Il faudra recapturer P10 après le correctif.
- **Cinq captures brutes conservées** dans `logs/` (1,3 Mo, gitignorées) sur décision du développeur.

---

## 6. Une règle de méthode qui a fait ses preuves aujourd'hui

Sur les huit « impossibilités » remontées par le développeur pendant les parcours, **six étaient du
comportement parfaitement correct** — bouton voter absent parce qu'aucune élection n'est ouverte et
l'interface le dit, campagne refusée hors période avec son message, fournisseurs hors de portée.
Deux seulement étaient de vrais manques (OB-10, OB-11).

**Ne présumez pas d'un bug : vérifiez dans le code.** Et la passe de réfutation adverse sur la
recherche parallèle a renvoyé **six axes sur six en `IMPRECIS` et un en `REFUTE`** — dont quatre
conclusions fausses sur le dénominateur, qu'il a fallu corriger avant de s'en servir.
