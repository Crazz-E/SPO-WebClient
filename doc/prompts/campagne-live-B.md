# ⛔ PÉRIMÉ — Lot B, annulé avant exécution

> **Jamais exécuté, et sans objet.** L'adjudication manuelle de 175 membres a été remplacée par
> l'extraction mécanique (`extract/extract-rdo-arity.js`), puis toute la campagne dont ce lot faisait
> partie a été renversée le 2026-08-18.
>
> **Plan en vigueur :** [plan-certification-rdo-rev4.md](../../report/plan-certification-rdo-rev4.md).

---

# Lot B — Adjudication des séparateurs, des arités et des types

**Session neuve. Modèle : Opus 5. Effort : `xhigh`.**
**C'est le lot où l'on n'économise pas. Une erreur ici gèle le serveur partagé pour des heures.**

---

## Mission

Pour chaque membre RDO de l'inventaire, établir sur **la déclaration Pascal elle-même** :

1. `function` ou `procedure` → **le séparateur** (`"^"` ou `"*"`) ;
2. le **nombre de paramètres** → **l'ampleur** d'un éventuel gel ;
3. le **type de chaque paramètre** → un second déséquilibre de pile, indépendant du séparateur ;
4. la **durée pendant laquelle le corps Delphi peut retenir la section critique globale** — l'axe que
   le lot A a laissé `unknown` sur **les 298 lignes**, et le seul qui ordonne le mode de gel dont la
   cause n'a jamais été établie.

Tu écris `.rdo-live/verdicts.ndjson`. **Aucun contact serveur. Aucune écriture sous `src/`.**

**Cadre :** [report/plan-campagne-live-rdo.md](../../report/plan-campagne-live-rdo.md) rév. 2, §4 lot B.
**Entrée :** `.rdo-live/inventory.ndjson` (298 lignes) et
[report/lot-A-inventaire-campagne-live.md](../../report/lot-A-inventaire-campagne-live.md).

---

## Le mécanisme, dans le détail qui compte

`"^"` (VariantId) fait pousser au serveur un **pointeur de résultat caché**
(`RDOQueryServer.pas:422-424`). Où il atterrit dépend de l'arité :

- `RegsUsed < MaxRegs = 3` → il reste **en registre**, la pile reste équilibrée, le serveur répond
  `error 9`. **Pas de gel.** Sonde U1-a, `ClientAware`, 0 paramètre, 91 ms.
- `RegsUsed` atteint `MaxRegs = 3` → `push edi` (`RDOObjectServer.pas:292`), et une procédure en
  convention `register` **ne dépile jamais**. **Gel.** `SayThis`, 2 widestrings + `Self`, 12 h 41.

**Le mot-clé seul ne suffit donc pas.** Une `procedure` sans paramètre n'est pas dangereuse ; une
`procedure` à 2 paramètres l'est. C'est la leçon centrale du lot L0 — et elle m'avait échappé.

**Second mode, que le panel a exhumé et qu'il ne faut pas rater :** l'assembleur ne connaît que
`varVariant`, `varInteger`, `varSingle`, `varDouble` (`RDOObjectServer.pas:250-282`). **Aucun cas
`varCurrency`.** Tout le reste part comme pointeur OLEStr. Une erreur de **type** produit donc le
même déséquilibre de pile qu'un mauvais séparateur. D'où `paramTypes` au schéma.

**Troisième mode, à ordonner et non à empêcher :** `CallMethod`, `GetProperty` et `SetProperty`
acquièrent **la même section critique de serveur**. Tout appel dont le corps Delphi bloque gèle
l'Interface Server pour tous les clients, **sans aucune faute de trame**. Tu ne peux pas l'empêcher ;
tu dois l'**estimer**, membre par membre, pour que les paliers l'ordonnent.

---

## Lectures obligatoires

1. Skill **`rdo-conformity`** — hiérarchie de preuve §0, matrice des séparateurs §8.5
2. Skill **`delphi-archaeologist`** — **obligatoire ici** : le lot A ne l'a délibérément pas invoquée
   et a tout laissé en `declaration_hint`. C'est ton travail de trancher.
3. [doc/rdo-protocol-architecture.md](../rdo-protocol-architecture.md) §8.5
4. `.rdo-live/README.md` — le protocole et le schéma amendé (Appendix A)
5. [report/lot-A-inventaire-campagne-live.md](../../report/lot-A-inventaire-campagne-live.md) §5 et §6

---

## La règle de preuve, et son piège

**Hiérarchie du projet : capture live > source ASP ≈ source Delphi > `[INFERRED]`.**

Deux niveaux de confiance autorisent l'émission, **à égalité** :

| `confidence` | Ce qu'il exige |
|---|---|
| `established` | Tu as **ouvert le fichier** `.pas` et lu la déclaration. Cite `Fichier.pas:Ligne` |
| `capture-proven` | Le membre a été **émis en live sans incident**, trame à l'appui (`report/campaign/rec/*.ndjson`) |

**Le piège :** refuser `capture-proven` reviendrait à **dégrader une preuve de niveau 1 en verdict de
niveau 2** et à exclure du live des membres émis 55 fois sans incident. Ne le fais pas.

**Tout le reste est `unknown`.** C'est une réponse acceptable et utile ; une invention ne l'est pas.

> **⚠ Ce que `unknown` déclenche a changé le 2026-08-18** (plan §0.5, *« tenter tout »*). Un membre
> `unknown` n'est plus **écarté en silence** : il est **remonté au développeur comme impossibilité,
> avec sa raison** — c'est précisément le cas que la directive vise. Liste-les explicitement dans ton
> CR, chacun avec ce qui a manqué pour trancher (unité introuvable, surcharge non levée, arité
> ambiguë…). Un `unknown` non signalé est un défaut de ce lot.

---

## Réfutation adverse — obligatoire

Chaque verdict est soumis à **deux agents indépendants chargés de le RÉFUTER**, avec consigne
explicite de conclure « réfuté » en cas de doute. Un verdict qui ne survit pas retombe en `unknown` —
donc **remonté**, jamais absorbé (voir l'encadré ci-dessus).

Ce qu'un `unknown` interdit exactement : **`"^"` sur ce membre**, parce que c'est la forme qui gèle.
Il n'interdit pas de le sonder en `"*"`, forme qui n'a jamais gelé quoi que ce soit — mais c'est
l'affaire des paliers, pas la tienne : **ton lot n'émet rien**.

Modèle des réfutateurs : **Opus, effort `high`**. Ne les fais pas plus faibles que l'adjudicateur sur
les membres à profil de gel.

Donne-leur des **angles distincts** plutôt que trois fois le même : *(a)* la déclaration citée
existe-t-elle vraiment à cette ligne, et est-ce la bonne unité ? *(b)* existe-t-il une **surcharge**
ou un homonyme que le dispatch atteindrait à la place ? *(c)* l'arité et les types sont-ils comptés
juste, `Self` compris ?

---

## Ce que le lot A te lègue, et que tu dois traiter

**236 lignes portent `awaitingLotB: true`.** Leur palier est provisoire au sens fort.

**Quatre défauts trouvés en chemin, à vérifier puis verser à ton verdict :**

1. **`RDOAutoRelease` (#33) n'existerait nulle part** dans `../SPO-Original` (grep = 0).
   `TMovieStudios` n'aurait qu'un champ privé `fAutoRelease` (`MovieStudios.pas:48`). Confirme ou
   infirme : si le membre n'existe pas, la ligne est `excluded:no-such-member`, pas `blocked`.
2. **`Comercials` (#31) serait une faute d'orthographe** — la propriété publiée serait `Commercials`
   (`Broadcast.pas:53`, `TBroadcaster`). Et **`set` n'a pas de repli** : un `set Comercials` rendrait
   `errUnexistentProperty`. Vérifie l'orthographe **et** l'absence de repli.
3. **`set Name` sur `CurrBlock` (#5)** viserait une propriété que `TBlock` ne publie pas
   (`Kernel.pas:1209-1395`) ; seule `TFacility.Name` existerait (`Kernel.pas:1029`). Si c'est exact,
   #5 est un **échec prédit**, à marquer comme tel et non à tenter en aveugle.
4. **Les surcharges duales monde / mairie** — `RDOVote`, `RDOSitMinister`, `RDOSitMayor`,
   `RDOSetMinSalaryValue` sont citées **des deux côtés**. Laquelle le dispatch atteint réellement est
   ton adjudication, et elle décide de l'arité.

**Un défaut de garde, qui n'est PAS pour toi mais que ton verdict doit alimenter :**
`RDOStartUpgrades`, `RDOStopUpgrade` et `RDODowngrade` sont émis en fire-and-forget par
`building-management-handler.ts:154/162/169` **sans figurer dans `KNOWN_RDO_COMMANDS`** — ils
contournent le contrôle. C'est le lot C qui inversera la polarité ; toi, adjuge-les comme les autres.

**Un chiffre corrigé :** la surface `RDO*` du Kernel est de **154** membres dans les unités canoniques
(+ ~10 dans `StdBlocks`), pas ~83. Dimensionne ton éventail là-dessus.

**Une bonne nouvelle à ne pas défaire :** sur les 32 lignes à profil de gel (`procedure`, arité ≥ 2),
**zéro** est émise aujourd'hui avec `"^"`. Si ton adjudication en révèle une, c'est un correctif de
production à signaler **en tête de ton CR**.

---

## Priorité — tu n'as pas à tout faire d'un bloc

Le plan fait de B **un service à la demande**, pas une barrière de ~450 invocations. Ordonne ainsi :

1. **les 32 lignes à profil de gel** (`procedure`, arité ≥ 2) — le risque réel ;
2. **les 42 `KNOWN_RDO_COMMANDS` + les 21 de `CachedObjectWrap`** — ce que le lot C doit compiler ;
3. **les membres des paliers P0 et P1** — ce que la première vague émettra ;
4. le reste, à la demande des paliers suivants.

Cet ordre règle **quand** tu traites un membre, jamais **si** — la règle §0.5 du plan (« tenter
tout ») s'applique à toi comme au reste. Si le budget se tend, **rends 1-2-3 complets plutôt que
1-2-3-4 approximatifs**, et **liste nommément ce que tu n'as pas traité** pour que le lot suivant le
reprenne. Un reliquat annoncé est un résultat ; un reliquat tu, un défaut.

---

## Contraintes

- Aucune écriture sous `src/`, aucun contact serveur, aucun commit.
- Un fichier, un écrivain ; NDJSON en ajout seul.
- Toute citation Pascal est de la forme `Fichier.pas:Ligne`, **fichier ouvert**. Sinon `unknown`.
- LF. Rapport **en français**.

---

## Définition de « terminé »

- [ ] `.rdo-live/verdicts.ndjson` porte, par membre : `pascalKind`, `paramCount`, `paramTypes`,
      `separator`, `criticalSectionRisk`, `confidence`, `citation`, `refutations`
- [ ] **Les 32 lignes à profil de gel sont toutes adjugées**, aucune en `unknown`
- [ ] Chaque verdict a subi **deux réfutations d'angles distincts** ; les réfutations sont conservées
- [ ] Les 4 défauts légués par le lot A sont confirmés ou infirmés, avec citation
- [ ] Tout membre non résolu est `unknown`, **listé nommément dans le CR avec sa raison** — jamais deviné, jamais absorbé

---

## Compte rendu attendu

En français : **(1)** tout correctif de production en tête ; **(2)** le compte adjugé / réfuté /
`unknown` ; **(3)** les 4 défauts du lot A, tranchés ; **(4)** comment tu as estimé la rétention de
section critique, et avec quelle confiance ; **(5)** ce qui doit changer dans le plan.

**Si quelque chose te paraît faux dans ce prompt, dis-le plutôt que de l'appliquer.** Le lot L0 a
corrigé deux inexactitudes du sien, un panel de 11 agents a réfuté la révision 1 du plan, et le lot A
vient d'invalider trois de ses chiffres et son plancher. Contredire est la norme ici.
