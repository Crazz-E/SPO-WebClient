# Prompt de mission — Construire l'outil de conformité RDO

**Usage :** coller le bloc ci-dessous dans une session **neuve**. Il est autoportant : il ne
suppose aucun contexte de la session qui l'a rédigé.
**Créé :** 2026-08-16.
**Exécuté :** 2026-08-16 — L1–L4 livrés, L5 codé sans run vert, L6 non démarré. Bilan dans
`report/plan-outil-conformite-rdo.md` §9 ; doc utilisateur `doc/rdo-conformance-suite.md`.
Le harnais `src/tools/rdo-probe.ts` cité ci-dessous a été remplacé par `src/tools/conformance/`.

---

```
MISSION

Transformer le harnais de sonde `src/tools/rdo-probe.ts` en une véritable suite de conformité
protocolaire RDO : exécutable en continu, verdict machine, intégrable en CI, capable de tourner
soit hors-ligne (rejeu d'enregistrements) soit contre une instance serveur Delphi dédiée.
Objectif final : remplacer les scénarios de mock écrits à la main par des enregistrements live,
et faire du test E2E sans UI.

Le plan détaillé est dans `report/plan-outil-conformite-rdo.md`. LIS-LE EN PREMIER — il contient
l'état des lieux, l'architecture cible, les 6 lots et leurs dépendances. Ce prompt ne le répète
pas ; il fixe le cadre, les invariants et les pièges.

CE QUI EXISTE DÉJÀ — NE PAS REPARTIR DE ZÉRO

`src/tools/rdo-probe.ts` a déjà la bonne architecture : il pilote la VRAIE `StarpeaceSession`
(login annuaire → login monde → trames → logoff propre) au lieu de réimplémenter le fil, et il
porte l'étagement du risque (`--live` obligatoire, `--allow-u1a`, `SAFE_PROBES`, arrêt sur
silence). Son bloc TODO (`rdo-probe.ts:60-98`) énumère lui-même ce qui manque. Le travail est
de la GÉNÉRALISATION, pas de la conception.

Lis aussi `src/tools/rdo-probe.test.ts` : il montre comment le harnais se teste sans serveur.

INVARIANTS NON NÉGOCIABLES

1. LA SESSION DE PRODUCTION NE SE MODIFIE PAS POUR LES TESTS. L'outil injecte un transport sous
   la socket (couture `createSocket`, déjà utilisée par
   `src/server/__tests__/rdo/rdo-callsite-wire-format.test.ts`). Si tu te surprends à ajouter un
   paramètre « mode test » dans `spo_session.ts`, tu t'es trompé de couture.

2. UNE TRAME PRODUITE À LA MAIN NE TESTE QUE ELLE-MÊME. Toute trame émise par la suite doit
   passer par le chemin de production (`RdoProtocol.format` via `sendRdoRequest`/`executeRdo`).
   C'est le principe qui a fait la valeur du harnais actuel — ne pas le perdre.

3. `"^"` SUR UNE PROCÉDURE DELPHI À ≥2 PARAMÈTRES GÈLE LE SERVEUR PARTAGÉ. Observé en
   production le 2026-08-15 (`SayThis`). Le mécanisme : `"^"` fait empiler un pointeur de
   résultat caché qu'une procédure `register` ne dépile jamais
   (`RDOQueryServer.pas:422-424` → `RDOObjectServer.pas:292`). La garde statique existe
   (`VOID_MEMBERS` + `assertNotVariantOnVoidMember` dans `session/rdo-request-guards.ts`) ;
   l'outil doit la RESPECTER et l'ÉTENDRE, jamais la contourner — même « juste pour tester ».
   À l'inverse, `"^"` sur une procédure à 0-1 paramètre répond `error 9`
   (`errIllegalFunctionRes`) sans geler : cette classe est testable activement, et c'est
   précisément ce que la suite `separators` doit épingler.

4. LA VÉRITÉ D'UN MEMBRE EST SA DÉCLARATION PASCAL. Jamais un site d'appel, jamais un document
   de synthèse. `doc/spo-original-reference.md` a déjà classé `RDOConnectInput`/`RDOConnectOutput`
   comme `function` en citant un site d'appel client tardivement lié — l'erreur qui avait masqué
   `SayThis`. Toute entrée de `VOID_MEMBERS` cite `Fichier.pas:Ligne`. Vérifie dans
   `../SPO-Original` (skill `delphi-archaeologist`).

5. LES CAPTURES PRIMENT SUR LA SOURCE DELPHI en cas de conflit
   (`doc/Mock_Server_scenarios_captures.md`, skill `rdo-conformity`). Un oracle qui contredit une
   capture est faux, pas la capture.

ORDRE DE TRAVAIL

Commence par L1 → L2 → L3 (plan §4). Ces trois lots NE TOUCHENT AUCUN SERVEUR et représentent
l'essentiel de la valeur : la suite devient exécutable, verdictable et intégrable en CI, avec un
transport de rejeu qui la rend utilisable hors-ligne. Ne demande aucune coordonnée serveur pour
les faire.

L4 (catalogue de suites) peut avancer en parallèle de L3 — c'est de la donnée.

L5 et L6 exigent :
  - les coordonnées de l'instance dédiée (à demander au développeur, non devinables) ;
  - que la session parallèle ait commité (elle travaille sur `src/mock-server/` et
    `src/server/session/` — vérifie `git status` avant de toucher à ces répertoires).

NE COMMENCE PAS L6 (retrait du mock manuel) SANS FEU VERT EXPLICITE.

CONTRAINTES PROJET

- Lis `CLAUDE.md`, `src/server/CLAUDE.md` et `src/mock-server/CLAUDE.md` avant de coder.
- Skills : `spo-testing` (couverture, matchers RDO, fixtures), `rdo-conformity` (matrice
  verbe/séparateur), `rdo-network-resilience` (si tu touches au cycle de session).
- Couverture : les lignes nouvelles/modifiées visent >= 93 % ; les seuils de `jest.config.js` ne
  font que monter (fichier protégé).
- TypeScript strict, pas de `any`, `unknown` dans les catch + `toErrorMessage`.
- `npm run typecheck` doit passer avant de terminer un lot ; `npm test` et `npm run build` avant
  de déclarer la mission finie.
- Le nouvel outil vit dans son propre répertoire (`src/conformance/` proposé) pour éviter toute
  collision avec la session parallèle.

INTERDITS

- N'exécute AUCUNE trame contre un serveur PARTAGÉ (planitia de production). Les lots L1-L4 n'en
  ont pas besoin. Pour L5+, seule l'instance DÉDIÉE est autorisée, et seulement après accord
  explicite du développeur au moment même.
- N'ajoute pas de sonde « U2 » (répétition massive d'une trame gelante) : annulée définitivement.
- Ne modifie pas `../SPO-Original` (artefact historique, lecture seule).
- Ne modifie pas `jest.config.js` autrement qu'en montant un seuil.

LIVRABLE ATTENDU PAR LOT

Code + tests + une entrée dans `report/plan-outil-conformite-rdo.md` marquant le lot fait, avec
ce qui a été appris (notamment toute déclaration Pascal nouvellement vérifiée). Si un lot révèle
que le plan est faux sur un point, corrige le plan — il n'est pas sacré.

PREMIÈRE ACTION

Lis `report/plan-outil-conformite-rdo.md`, puis `src/tools/rdo-probe.ts` (surtout son TODO), puis
propose ton découpage de L1 avant d'écrire du code.
```

---

## Notes pour le développeur (hors bloc à coller)

- **Pourquoi L1-L3 d'abord.** Ils ne demandent ni serveur ni coordination avec l'autre session.
  Une fois faits, l'outil est déjà utile : il rejoue les enregistrements existants avec des
  verdicts et un code de sortie. Le live n'ajoute que la vérité-terrain.
- **La question à trancher tôt** (bloque L4 `mutations`) : l'instance dédiée est-elle
  réinitialisable ? Si non, chaque scénario de mutation doit être auto-nettoyant, ce qui change
  leur écriture.
- **Collision** : la session parallèle touche `src/mock-server/` et `src/server/session/`.
  `src/conformance/` est neutre ; L6 ne l'est pas.
