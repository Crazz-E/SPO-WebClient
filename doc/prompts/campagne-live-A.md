# ✅ EXÉCUTÉ — Lot A, l'inventaire

> Exécuté le 2026-08-18. A livré `.rdo-live/inventory.ndjson` (298 lignes, 217 membres distincts),
> **toujours utile** comme référence de surface.
>
> ⚠ Son dénominateur « 217 membres » n'est **plus l'objectif de couverture** : la rév. 4 compte les
> parcours utilisateur, pas les membres. Voir
> [plan-certification-rdo-rev4.md](../../report/plan-certification-rdo-rev4.md) §3.

---

# Lot A — Inventaire exhaustif : le dénominateur de la campagne

**Session neuve. Modèle : Opus 5. Effort : high.**
**Agents : 4 × Fable 5 / effort low, en éventail. La synthèse est faite par toi, pas déléguée.**

> ⚠ **Ce prompt remplace `doc/prompts/campagne-live-L1.md`, qui est CADUC.** Le plan a été refondu
> en révision 2 après qu'un panel adversarial de 11 agents a conclu que la révision 1 n'atteignait
> pas l'objectif. Si tu trouves l'ancien prompt, ignore-le.

---

## Mission

Tu produis **le dénominateur** de la campagne live : la liste close des scénarios RDO, chacun avec
son statut et son palier de risque provisoire.

Tant que ce chiffre n'existe pas, « l'intégralité des scénarios testés en live » est un mot. La
suite de conformité en couvre 55, la matrice en liste 78, `KNOWN_RDO_COMMANDS` en déclare 42, la
surface `RDO*` du Kernel ~83, `CachedObjectWrap` 21 — **et les recouvrements ne sont pas établis**.

Ton lot ne touche **aucun serveur**. Il écrit dans `.rdo-live/`, pas sous `src/`.

**Cadre :** [report/plan-campagne-live-rdo.md](../../report/plan-campagne-live-rdo.md) **révision 2**.
Lis-le en entier avant de commencer — en particulier le §0 (les trois défauts de la rév. 1) et le §5
(les paliers).

---

## Ce qui a changé, et que tu dois intégrer

**L'objectif est réénoncé :** *zéro gel **imputable** à la campagne, établi par corrélation.* Pas
« sans aucun crash » — `RDOObjectServer.pas` sérialise `CallMethod`/`GetProperty`/`SetProperty`
derrière **une seule section critique de serveur**, donc tout appel dont le corps Delphi bloque gèle
l'Interface Server pour tous, **sans faute de trame**. C'est intenable et surtout non mesurable.

**On n'ordonne plus par chantier mais par risque**, en paliers P0→P4 (plan §5).

**Deux faits qui changent ton travail :**

- **Pas de lot de provisionnement.** L'enregistrement `report/campaign/rec/planitia-2026-08-17-run.json`
  liste **41 installations déjà possédées** sur 23 types. Toute la Famille 2 est exécutable sans
  placement ni argent. Vérifie ce chiffre toi-même et appaire chaque ligne OWN à une installation
  réelle.
- **Le compte n'a AUCUN rôle politique** — le champ rend `res="%\t\t\t\t\t\t"`. Les 13 lignes ROLE ne
  peuvent pas être couvertes par le chemin nominal, **mais elles peuvent l'être par le refus**
  (voir le statut `pass:refusal-verified` ci-dessous).

---

## Trois amendements de schéma, obligatoires

Le `README.md` de `.rdo-live/` porte les schémas livrés par L0. **Tu les amendes ainsi** — chaque
amendement vient d'une trouvaille du panel, pas d'une préférence :

1. **`inventory.ndjson` gagne `emitSite`** — le fichier qui émet la trame. Il sert à l'invalidation
   mécanique entre paliers (`git diff --name-only` croisé avec les `emitSite`).
   ⚠ **Avec sa clôture transitive** : une modification de `rdo.ts`, `rdo-helpers.ts`,
   `spo_session.ts`, `timeout-categories.ts` ou `rdo-request-guards.ts` **invalide TOUT**, quelle que
   soit la ligne — elle change chaque octet sur le fil. `emitSite` ne gouverne que les feuilles.
   Sans ce correctif, le mécanisme fabrique du vert silencieusement périmé.
2. **Nouveau statut `pass:refusal-verified`**, de premier rang. Un refus serveur attendu est un
   **résultat**, pas un empêchement. Sans lui, les 13 lignes ROLE partent en `blocked:role` et
   perdent leur seule couverture live possible.
3. **`verdicts.ndjson` gagne `paramCount`, `paramTypes` et `confidence: "capture-proven"`.** Tu ne
   remplis pas ce fichier (c'est le lot B), mais **c'est toi qui poses le schéma**. Justifications :
   l'arité décide de l'ampleur du gel (`RegsUsed = MaxRegs = 3`) ; l'assembleur ne connaît que
   `varVariant`/`varInteger`/`varSingle`/`varDouble` — **aucun cas `varCurrency`**, donc une erreur
   de type produit le même déséquilibre de pile ; et sans `capture-proven` **au même rang
   qu'`established`**, un membre émis 55 fois en live sans incident mais dont la déclaration Pascal
   reste introuvable serait exclu — le plan dégraderait une preuve de niveau 1 en verdict de niveau
   2, contre la hiérarchie de preuve du projet.

---

## La décision de fond : qu'est-ce qu'« un scénario » ?

C'est le jugement que ce lot doit rendre.

**Un membre RDO n'est pas un scénario.** `RDOSetPolicyStatus` sur une installation possédée et sur
une non possédée sont deux scénarios : l'un doit réussir, l'autre doit être **refusé**.

**Granularité proposée**, à confirmer ou amender **avec justification** :

- clé = **membre × classe cible déclarante** (`TFacility` → `objectId`, `TBlock`/`TWorkCenter` →
  `CurrBlock`, `TPullInput` → ObjectId de porte) ;
- les scénarios **mutatifs** portent leur **précondition** et leur **remise en état** ;
- les **refus attendus** sont des lignes à part entière, statut `pass:refusal-verified`.

Si cette granularité fait exploser le compte, **dis-le et propose autre chose**. Un inventaire de
400 lignes dont 300 sont intestables n'a aucune valeur ; 90 lignes exactes en ont beaucoup.

---

## Classement provisoire en paliers

Chaque ligne reçoit un palier **provisoire** P0→P4, sur les trois axes du plan §3 :

| Axe | Tu peux le calculer ? |
|---|---|
| **Nouveauté du triplet** (membre × arité × profil de types) | **En partie** — tu établis si le membre a déjà été émis en live (suites de conformité + enregistrements `report/campaign/rec/*.ndjson`). L'arité et les types viennent du **lot B** |
| **Durée de rétention de la section critique** | **Non** — marque `unknown`, c'est du ressort du lot B avec `delphi-archaeologist` |
| **Réversibilité** | **Oui** — valeur d'avant lisible ? inverse existant ? |

**Un palier provisoire n'est pas un verdict.** Marque explicitement ce qui attend le lot B.

---

## La surface est celle d'**après** la bascule

La bascule ASP → RDO est retenue (décision développeur). L'inventaire décrit l'état cible.

**Dans le périmètre :** les 11 mutations ASP devenues membres `RDO*` du Kernel ; les lectures
basculées (`SetPath`/`GetPropertyList`/`GetIterator`/`SetClass`) ; tout le RDO déjà en place.

**Hors périmètre**, avec la raison : les scénarios de parsing ASP que la bascule supprime ; les
exceptions dures de l'étude §6 (`Visual.VisualClass`, photo `/fivedata/`, et `Mail/MessageList.asp`
**sous réserve de la sonde 1 de P1**).

**Déjà tranché — ne le rediscute pas :** `#44 RDODisconnectFromTycoon` est
**`excluded:irreversible`** (décision développeur du 2026-08-18). Il coupe *toutes* les connexions
d'un type, y compris préexistantes, dont personne n'a le graphe. Le dossier reste ouvert pour plus
tard : voir §8 bis du plan. Ne le reclasse pas, ne le descends pas en P4.

⚠ **Ne devine pas** les 4 sondes `[À SONDER]` de P1 (les 3 de l'étude §10 + la clé de prix dans le
cache). Marque `blocked:precondition` en attente de P1.

---

## Les quatre agents en éventail

Corpus disjoints, aucun contact serveur, **Fable 5 / effort low** — c'est de l'extraction, pas du
jugement.

| # | Périmètre | Rend |
|---|---|---|
| **A1** | `KNOWN_RDO_COMMANDS` (42) + **tous** les sites d'appel sous `src/server/` | membre, `emitSite` (fichier:ligne), verbe, séparateur émis, catégorie de délai, cible |
| **A2** | Les suites de conformité + **les enregistrements `report/campaign/rec/*.ndjson`** | ce qui est **déjà couvert** et surtout ce qui a **déjà été émis en live sans incident** — c'est l'axe « nouveauté » |
| **A3** | `report/campaign/coverage-matrix.md` (78 lignes) + surface `RDO*` du Kernel dans `../SPO-Original` | membre, unité Pascal, déclaration, **nombre de paramètres**, **types des paramètres** |
| **A4** | `Cache Server/CachedObjectWrap.pas` + les membres transport-C établis en 7A/7B depuis `IIS_ROOT` | membre, cible, chemin de cache, page ASP d'origine |

**Consigne commune :** toute déclaration Pascal relevée est un **indice non vérifié**
(`declaration_hint`), jamais un verdict — **le lot B les ré-adjuge tous, avec réfutation adverse**.
Un agent qui n'est pas sûr écrit `unknown` : c'est une réponse utile ; une invention ne l'est pas.

---

## La synthèse — c'est toi

**Ne délègue pas.** C'est là que se joue la valeur du lot.

1. **Déduplication inter-corpus**, avec ta clé documentée. Les recouvrements ne sont pas établis.
2. **Statut par ligne** — `todo`, `covered:<suite>`, `pass:refusal-verified`, `blocked:<raison>`,
   `excluded:<raison>`. **Aucune ligne sans statut.**
3. **Palier provisoire** par ligne, avec ce qui attend le lot B.
4. **Écriture de `.rdo-live/inventory.ndjson`**, en ajout seul.
5. **Le chiffre.** Total / déjà couverts / à exécuter en live / bloqués / exclus — et surtout :
   **combien de lignes sont réellement atteignables**, à comparer au plancher de **47 sur 78** posé
   par le plan. Si ton inventaire dit que le plancher est irréaliste, **c'est maintenant qu'il faut
   le dire.**

---

## Contraintes

- **Aucune écriture sous `src/`**, aucun contact serveur.
- **Ne fais pas l'adjudication des séparateurs** — lot B, effort supérieur au tien pour une raison.
- Un fichier, un écrivain ; NDJSON en ajout seul.
- Ne commit pas, ne push pas. LF. Rapports **en français**.

---

## Définition de « terminé »

- [ ] `.rdo-live/inventory.ndjson` existe, schéma amendé des 3 points ci-dessus
- [ ] **Aucune ligne sans statut**, aucune ligne sans palier provisoire
- [ ] La granularité est explicitée et justifiée ; la clé de déduplication documentée
- [ ] Les recouvrements entre les 4 corpus sont **chiffrés**
- [ ] Les lignes OWN sont appairées aux 41 installations réelles ; les types absents en
      `blocked:no-facility`
- [ ] Les 13 lignes ROLE portent `pass:refusal-verified` et non `blocked:role`
- [ ] Le chiffre final est donné, et confronté au plancher de 47/78

---

## Compte rendu attendu

En français : **(1)** le chiffre, en tête ; **(2)** la granularité retenue et ce que tu as écarté ;
**(3)** les recouvrements — la partie difficile, montre-la ; **(4)** ce que tu n'as pas pu trancher ;
**(5)** ce qui doit changer dans le plan.

**Si quelque chose te paraît faux dans ce prompt, dis-le plutôt que de l'appliquer.** Le lot L0 a
corrigé deux inexactitudes du sien, et un panel de 11 agents vient de réfuter la révision 1 de ce
plan sur trois points structurels. Contredire est le comportement attendu, pas l'exception.
