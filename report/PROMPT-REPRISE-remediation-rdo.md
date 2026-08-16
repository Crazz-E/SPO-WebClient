# Prompt de reprise — remédiation de l'audit RDO (session suivante)

> Copier tout ce qui suit comme premier message d'une nouvelle session sur ce dépôt.

---

Tu reprends une remédiation d'audit protocole déjà très avancée sur le WebClient Starpeace
Online. Lis ce briefing en entier avant d'agir : il contient des faits qui ne sont pas
redécouvrables par lecture du code, et un fait de sécurité serveur qui prime sur tout le reste.

## 0. Le fait le plus important

**Émettre le séparateur `"^"` (VariantId) sur une `procedure` Delphi gèle l'Interface Server
partagé de production. Une seule trame suffit.** Prouvé en live le 2026-08-15 : la sonde a
montré que le serveur exécute bien le corps de la procédure, puis échoue à sérialiser un
résultat inexistant, et se fige.

Mécanisme vérifié dans le source : `"^"` fait poser `TVarData(Res).VType := varVariant`
(`RDOQueryServer.pas:422-424`), donc `CallMethod` passe `@Res` en argument caché
(`RDOObjectServer.pas:281-292`) ; si le membre a assez de paramètres pour saturer les registres
(`MaxRegs = 3`), ce pointeur part sur la pile (`push edi`, `:292`) — et une `procedure` en
convention `register` sans paramètre pile ne le dépile jamais.

**Conséquence pratique :** avant de choisir un séparateur, vérifie la déclaration Pascal du
membre dans `../SPO-Original`. Une `function` prend `"^"` ; une `procedure` prend `"*"` **avec**
QueryId. Deux gardes le font respecter : `assertNotVariantOnVoidMember` et la table
`VOID_MEMBERS` (`src/server/session/rdo-request-guards.ts`), dont chaque entrée cite sa
déclaration `Fichier.pas:Ligne`.

**La sonde U2 (111 répétitions) est annulée définitivement.** Ne jamais la lancer.

## 1. L'objectif

Corriger les constats de `report/rdo-audit-2026-08-14.md` et de son annexe
`report/rdo-audit-2026-08-14-annexe-moyennes-basses.md`, en suivant le plan
`report/plan-remediation-rdo-2026-08-14.md`.

L'audit décrivait une faiblesse unique sous plusieurs formes : **la couche RDO faisait confiance
aux valeurs qui la traversent**. Chaque constat était un contrat absent à une frontière —
encodage, identifiants, valeurs numériques, sémantique du verbe, codes de retour.

## 2. Ce qui est fait — 37 constats sur 39

Suite complète **verte : 4382 tests**, typecheck propre, build OK, couverture globale 43,88 %
(plancher machine 38, partie de 42,21 %).

**Mise à jour 2026-08-16 :** ces lots sont désormais **commités** — 7 commits `df818e09` →
`e46ccd6b` (63 fichiers). Arbre propre, 4382 verts re-confirmés à la reprise. (La version
initiale de ce briefing disait « rien n'est commité » : c'était vrai le 2026-08-15 seulement.)

| Lot | Contenu |
|---|---|
| L1 | **P-C1** — injection de trame par troncature d'encodage. Codec `src/shared/cp1252.ts`, transcodage **avant** échappement (ordre imposé par `RDOUtils.pas:379`). |
| L2 | **P-M2** (injection ASCII pré-auth), **P-H3** (validation d'identifiants), **P-M1**, **P-L4**. |
| L10 | **P-H1** — 8 sites basculés vers `"*"`, garde anti-gel, doc §8.5 inversée corrigée. |
| L3 | **O-H3** — QueryId 0 traité comme absent (`packet.rid` falsy). |
| L4 | **O-H1/O-H2** — chemin de reconnexion légère supprimé. |
| L5 | **P-M3** en mode observation + **M-A…M-E** (couche mutation). |
| L5-UI | Triplet de salaires, audit des émetteurs, drapeau `confirmed` exploité. |
| D5 | **O-L1**, **O-M2**, **O-M1** (pool activable). |
| L7 | Angles morts de tests du §7. |
| L11 | **P-H2** — bascule CP1252 **et** décodeur symétrique. |
| L12 | 23 des 25 constats de l'annexe. |

### Décisions du développeur, déjà prises — ne pas les rouvrir

- **D1** : modification autorisée des fichiers protégés `src/shared/rdo-types.ts` et
  `src/server/rdo.ts`. Utilisée, tests à l'appui.
- **D2** : sondes live autorisées — mais **U2 annulée** après le gel.
- **D4** : contrat `errorCode` en **mode observation d'abord**, bascule ensuite.
- **D5** : pool de connexions à activer, **après** correction d'O-L1 — fait, mais population
  laissée **opt-in** (voir §4).
- **L11** : bascule CP1252 confirmée, sur un argument `[INFERRED]` assumé.

### Défauts trouvés hors audit — le rapport les sous-estimait

Huit défauts que l'audit ne décrivait pas, plusieurs plus graves que ce qu'il listait :

1. **P-M2** — injection ASCII **pré-authentification** via `formatTypedToken`, que le codec
   CP1252 ne referme pas (le caractère injecté est déjà en ASCII).
2. La **branche voisine** de la même fonction, injectable de façon identique.
3. **`targetId`** concaténé sans guillemets, relayé brut depuis le navigateur.
4. **`separator`** acceptant n'importe quelle valeur.
5. **`action`** non validé — quatrième champ de la même famille, trouvé par une revue
   adversariale multi-agents *après* que le lot se croyait terminé.
6. **`RDOConnectInput`/`RDOConnectOutput`** — deux procédures de plus appelées en `"^"`, donc
   un gel du serveur à **chaque connexion de chaîne d'approvisionnement**.
7. Un **cinquième site `CloseMessage`** et le **jumeau de M-A dans `placeCapitol`**.
8. Le **chemin de décodage resté en Latin-1** : basculer l'encodage seul aurait fait revenir
   faux un texte qu'on envoyait juste.

**Leçon à retenir pour la suite : le rapport d'audit sous-compte. Quand tu corriges un constat,
balaie systématiquement ses voisins immédiats — même fonction, même famille de champs, même
membre Delphi.**

## 3. Ce qui reste

> ### ⚠ Mise à jour 2026-08-16 — cette section est périmée, lire d'abord le rapport d'audit
>
> La session du 2026-08-16 a fermé **tout** ce que cette section §3 listait. État réel :
> bloc d'état de [rdo-audit-2026-08-14.md](rdo-audit-2026-08-14.md), section « Session 2026-08-16 ».
> Résumé : **39/39 constats fermés**, 4424 tests verts, couverture 44,23 %.
>
> | Sujet §3 | Devenu |
> |---|---|
> | L9-pré, harnais de sonde | ✅ écrit, testé — `src/tools/rdo-probe.ts` (18 tests) |
> | Sondes U6 et U4-a | ✅ **exécutées en live le 2026-08-16, tranchées** — [campaign/sondes-live-2026-08-16.md](campaign/sondes-live-2026-08-16.md) |
> | Sonde U1-a | ⏸ **non exécutée, sur recommandation** — risque de gel réel contre un gain purement documentaire (argumentaire : rapport de sonde §4) |
> | O-L3 `TimeoutCategory` | ✅ fermé — obligatoire par le type, 93 sites |
> | O-L5 sonde ServerBusy | ✅ fermé — deux options nommées sur la primitive |
> | Pool monde (D5) | ✅ activé par défaut — **mais lire la réserve de conformité** dans le rapport d'audit avant de l'y laisser |
> | Contrat `errorCode` (D4) | 🟡 toujours en mesure, **par décision** — le recensement est maintenant lisible : `GET /api/rdo-error-contract` |
> | `parsePropertyResponse` | 🟡 instrumenté en mesure — `GET /api/property-fallback` |
>
> **Deux décisions restent au développeur**, et elles ont maintenant les données pour être prises :
> basculer `RDO_ERROR_CONTRACT=reject` après lecture du recensement, et lancer ou non U1-a.
>
> **Rien n'est commité.** L'arbre porte la session complète.
>
> *Le texte d'origine suit, conservé pour le contexte.*

### L9-pré — le harnais de sonde (non commencé, bloquant pour le live)

`REQ_RDO_DIRECT` est câblé côté passerelle (`ws-handlers/misc-handlers.ts`) — garde de phase,
seau à jetons, listes blanches de verbe, action et membre — mais **aucun déclencheur navigateur
n'existe**. Sans `src/tools/rdo-probe.ts` (ou un `__spoDebug.rdoDirect()` derrière un drapeau),
une seule des sondes restantes est exécutable.

Protocole complet déjà rédigé : `report/campaign/sondes-live-U1-U6.md`. Sondes restantes :
**U1-a** (`ClientAware`, 0 paramètre, pile équilibrée, risque nul), **U4-a** (`set` sur
propriété inexistante — oracle binaire, aucun effet), **U6** (lecture de propriétés `string`).

**Écrire le harnais n'est pas l'exécuter.** N'ouvre aucune fenêtre live sans feu vert explicite
du développeur au moment même, indépendamment de D2.

### O-L3 — 81 des 93 sites `sendRdoRequest()` sans `TimeoutCategory` — ouvert, assumé

Impact faible : `NORMAL`, `SLOW` et `VERY_SLOW` partagent les mêmes 180 s. Le seul écart est
qu'une lecture qui devrait être `FAST` (60 s) attend 180 s. Rendre le paramètre obligatoire
touche 93 sites dans 15 fichiers — **passe dédiée**, pas au milieu d'autre chose.

### O-L5 — la sonde ServerBusy duplique la primitive — à moitié traité

Elle **doit** contourner `sendRdoRequest`, qui refuse d'émettre tant que `isServerBusy` est vrai
— et c'est l'appel qui lève ce drapeau. L'allocation de rid est désormais partagée
(`allocateRequestId`). Reste : elle échappe à `assertNotVoidPush`, au contrat `errorCode`, aux
métriques, et journalise `RDO>*` au lieu de `RDO>>`. Collapser le doublon demande un drapeau
« ignorer la garde busy » sur la fonction par laquelle passe **chaque appel RDO du projet**.

### Deux décisions en attente du développeur

- **Basculer le contrat `errorCode` en rejet** (`RDO_ERROR_CONTRACT=reject`). Le mode
  observation tourne : chaque réponse d'erreur émet une ligne `RDO-CONTRACT` avec un compteur
  par membre. **Regarder cette liste d'abord** — c'est exactement le tri à faire avant de
  basculer. Le code de rejet est déjà écrit.
- **Activer le pool monde par défaut** (`RDO_WORLD_POOL=true`). Le blocage poule-et-œuf est
  levé, mais la population reste opt-in : le pool construit ses propres sockets au lieu de
  passer par `createSocket()`, que le harnais de test intercepte. **Prérequis : injecter une
  fabrique de sockets** pour que la suite puisse l'exercer. Activer sans ça casse 33 tests.

### Observation consignée, non traitée

`parsePropertyResponse` : quand aucune propriété ne correspond, elle retourne **la charge utile
entière** « pour compatibilité ascendante ». Demander `Tax.Id` sur `Tax0Id="#5"` rend
`Tax0Id="#5` comme si c'était une valeur. Le repli est load-bearing (des appelants passent une
valeur nue) — le changer demande de recenser 60+ sites, avec la méthode de P-M3 : mesurer
d'abord.

## 4. Règles de travail sur ce dépôt

- **Toute affirmation sur le comportement Delphi cite `Fichier.pas:Ligne`**, ou est marquée
  `[INFERRED]` / `[UNKNOWN]`. `../SPO-Original` est **lecture seule**.
- **Hiérarchie de preuves : captures live > client legacy > source serveur.** L'absence dans une
  capture ne prouve rien.
- **Piège récurrent, qui a coûté cher deux fois** : des déclarations homonymes existent dans les
  unités de test (`Tests/*`) et les interfaces client (`Voyager/*`). Seule compte la déclaration
  **publiée par le serveur**. C'est ce qui avait masqué `SayThis`, et `doc/spo-original-reference.md`
  classait encore `RDOConnectInput`/`Output` en `function` en citant une ligne de formulaire client.
- Invoquer la skill `rdo-conformity` avant toute écriture de code RDO.
- Tests obligatoires, ≥ 93 % sur les lignes nouvelles/modifiées. **Faire échouer le test contre
  l'ancien comportement avant de le déclarer bon** — plusieurs assertions du dépôt passaient dans
  les deux cas (l'une acceptait littéralement les deux séparateurs).
- Fins de ligne LF. Jamais de chaîne RDO construite à la main.
- `doc/` en anglais, `report/` en français.

## 5. Par où commencer

1. `git status` puis `npm run typecheck && npm test` — confirmer les 4382 verts avant de toucher
   à quoi que ce soit.
2. Lire `report/rdo-audit-2026-08-14.md` (le bloc d'état en tête suffit) et l'annexe §5.1.
3. Demander au développeur ce qu'il veut faire des deux décisions en attente et de L9-pré.

**Ne commite pas sans qu'il le demande.**
