# ⛔ PÉRIMÉ — Lot L1, remplacé avant exécution

> Remplacé par [campagne-live-A.md](campagne-live-A.md), lui-même exécuté puis rendu obsolète par le
> renversement de stratégie du 2026-08-18.
>
> **Plan en vigueur :** [plan-certification-rdo-rev4.md](../../report/plan-certification-rdo-rev4.md).

---

# Lot L1 — Inventaire exhaustif des scénarios RDO (surface post-bascule)

**Session neuve. Modèle : Opus 5. Effort : high.**
**Agents à lancer : 4 × Fable 5 / effort low, en éventail. La synthèse est faite par toi, pas
déléguée.**

---

## Mission

Tu produis **le dénominateur** de la campagne : la liste close des scénarios RDO à tester en live.

L'objectif final du développeur est « l'intégralité des scénarios RDO testés en LIVE sans aucun
crash ». **Personne ne sait aujourd'hui ce que « l'intégralité » désigne** — la suite de conformité
en couvre 55, la matrice de mutation en liste 78, `KNOWN_RDO_COMMANDS` en déclare 42, la surface
`RDO*` du Kernel en compte ~83, `CachedObjectWrap` 21 de plus, et **les recouvrements ne sont pas
établis**. Tant que ce chiffre n'existe pas, « intégralité » est un mot.

Ton lot ne touche **aucun serveur** et **n'écrit pas sous `src/`** — il ne ré-arme donc pas le gate
de conformité.

**Cadre complet :** [report/plan-campagne-live-rdo.md](../../report/plan-campagne-live-rdo.md).
Ton lot est L1.

---

## Ce que L0 a livré, et que tu dois utiliser

- **`.rdo-live/`** existe, avec son `README.md` : les trois règles du protocole d'échange et **les
  schémas de `inventory.ndjson`, `verdicts.ndjson`, `blocked.ndjson`**. Lis-le en première action.
  **Suis ses schémas, ne les réinvente pas.**
- **`VOID_MEMBERS`** couvre désormais `RDODestroy`, `KeepAlive`, `Refresh`.
- **O5** a été scindé en O5-a (immédiat) et O5-b (différé, ~47 min).
- **Le disjoncteur** est en place (`src/tools/conformance/halt.ts`).

**La leçon de L0 que tu dois porter dans ton schéma :** le nombre de paramètres décide autant que
le mot-clé `procedure`. Les trois membres ajoutés sont des `procedure` **sans paramètre** : le
pointeur de résultat reste en registre, la pile reste équilibrée, le serveur répond `error 9` — ils
**ne gèlent pas**. Le gel exige `RegsUsed = MaxRegs = 3`, donc assez de paramètres (`SayThis` en a
deux, plus `Self`).

→ **Si le schéma `inventory.ndjson` de L0 ne porte pas le nombre de paramètres, propose de l'y
ajouter et dis-le dans ton CR.** Sans lui, L2 ne peut pas classer le risque, seulement le séparateur.

---

## Lectures obligatoires

1. `.rdo-live/README.md` — le protocole d'échange
2. [report/plan-campagne-live-rdo.md](../../report/plan-campagne-live-rdo.md) — §0, §1, §3
3. [report/faisabilite-abandon-asp.md](../../report/faisabilite-abandon-asp.md) — **§4, §9 et §12**,
   qui définissent la surface cible après bascule
4. [report/campaign/coverage-matrix.md](../../report/campaign/coverage-matrix.md) §1 — la taxonomie
   `blocked:` (dix valeurs, `blocked:log-blind` comprise). **Reprends-la, ne l'invente pas.**
5. Skill **`rdo-conformity`** — hiérarchie de preuve
6. Skill **`delphi-archaeologist`** — pour les agents qui lisent `../SPO-Original`

---

## La décision de fond : qu'est-ce qu'« un scénario » ?

C'est le jugement que ce lot doit rendre, et il n'a pas de réponse évidente.

**Un membre RDO n'est pas un scénario.** `RDOSetPolicyStatus` sur une installation que l'on possède
et sur une installation que l'on ne possède pas sont deux scénarios : l'un doit réussir, l'autre
doit être **refusé**, et un test qui ne couvre que le premier ne teste rien.

**Granularité proposée**, à confirmer ou à amender par toi, avec justification :

- clé = **membre × classe cible déclarante** (`TFacility` → `objectId`, `TBlock`/`TWorkCenter` →
  `CurrBlock`, `TPullInput` → ObjectId de porte) ;
- les scénarios **mutatifs** portent en plus leur **précondition** et leur **remise en état** ;
- les scénarios de **refus attendu** sont des lignes à part entière, pas des variantes.

Si cette granularité fait exploser le compte au-delà du raisonnable, **dis-le et propose autre
chose** plutôt que de la subir. Un inventaire de 400 lignes dont 300 sont intestables n'a aucune
valeur ; un inventaire de 90 lignes exactes en a beaucoup.

---

## La surface est celle d'**après** la bascule

Décision développeur du 2026-08-17 : **la bascule ASP → RDO est retenue.** L'inventaire décrit donc
l'état cible, pas l'état actuel.

**Entrent dans le périmètre :**

- les **11 mutations ASP** devenues des membres `RDO*` du Kernel (étude §4 : `RDOAskLoan`,
  `RDOSendMoney`, `RDOPayOff`, `RDOAddAutoConnection`, `RDODelAutoConnection`, `RDOHireTradeCenter`,
  `RDOSetAdvanceToNextLevel`, `RDOSetPolicyStatus`, `RDOResetTycoonEx`, `RDOAbandonRoles`,
  `RDOLaunchCampaign`, `RDOCancelCampaign`…) ;
- les **lectures basculées** — `SetPath` / `GetPropertyList` / `GetIterator` / `SetClass` sur les
  chemins de l'étude §4 ;
- tout le RDO déjà en place (session, chat, mail, carte, inspecteur, construction…).

**Sortent du périmètre**, et doivent apparaître en `excluded:` avec leur raison :

- les scénarios de **parsing ASP** que la bascule supprime ;
- les trois exceptions dures de l'étude §6 : `Visual.VisualClass` (données statiques), la photo
  `/fivedata/`, et `Mail/MessageList.asp` — ce dernier **sous réserve de la sonde 1 de L2b**, qui
  peut le faire rentrer dans le périmètre RDO.

⚠ **Ne suppose pas le résultat des trois `[À SONDER]` de l'étude §10.** Marque-les
`blocked:precondition` en attente de L2b.

---

## Les quatre agents en éventail

Quatre corpus disjoints, **aucun contact serveur**, chacun rend une liste brute avec citations.
Modèle **Fable 5**, effort **low** — c'est de l'extraction de volume, pas du jugement.

| # | Périmètre | Rend |
|---|---|---|
| **A1** | `KNOWN_RDO_COMMANDS` (42 membres) + **tous** les sites d'appel sous `src/server/` | membre, fichier:ligne, verbe, séparateur émis, catégorie de délai, cible |
| **A2** | Les suites de conformité (`src/tools/conformance/suites.ts` et le catalogue) | ce qui est **déjà couvert**, par quelle suite, en replay et/ou en live |
| **A3** | `report/campaign/coverage-matrix.md` (78 lignes) + la surface `RDO*` du Kernel dans `../SPO-Original` | membre, unité Pascal, déclaration, **nombre de paramètres** |
| **A4** | `Cache Server/CachedObjectWrap.pas` + les membres transport-C établis en 7A/7B depuis `IIS_ROOT` | membre, cible, chemin de cache, page ASP d'origine |

**Consigne commune aux quatre :** toute déclaration Pascal relevée est un **indice non vérifié**
(`declaration_hint`), jamais un verdict. **L2 les ré-adjuge tous, avec réfutation adverse.** Un
agent qui n'est pas sûr écrit `unknown` — c'est une réponse acceptable et utile ; une invention ne
l'est pas.

---

## La synthèse — c'est toi

**Ne délègue pas cette partie.** C'est là que se joue la valeur du lot.

1. **Déduplication inter-corpus.** Les recouvrements ne sont pas établis : un même membre peut
   apparaître sous trois noms dans trois corpus. Documente ta clé de déduplication.
2. **Statut par ligne** — `todo`, `covered:<suite>`, `blocked:<raison typée>`, `excluded:<raison>`.
   **Aucune ligne sans statut.**
3. **Écriture de `.rdo-live/inventory.ndjson`** au schéma du README, en ajout seul.
4. **Le chiffre.** Combien de scénarios, combien déjà couverts, combien restent à exécuter en live.
   C'est le livrable que le développeur attend.

---

## Contraintes

- **Aucune écriture sous `src/`**, aucun contact serveur. Si tu penses devoir écrire dans `src/`,
  arrête-toi et explique-le.
- **Ne fais pas l'adjudication des séparateurs** — c'est L2, avec un budget d'effort supérieur au
  tien pour une raison.
- Un fichier, un écrivain ; NDJSON en **ajout seul**.
- Ne commit pas, ne push pas.
- Fins de ligne LF. Rapports **en français**.

---

## Définition de « terminé »

- [ ] `.rdo-live/inventory.ndjson` existe, au schéma du README
- [ ] **Aucune ligne sans statut**
- [ ] La granularité « qu'est-ce qu'un scénario » est explicitée et justifiée
- [ ] La clé de déduplication est documentée, et les recouvrements entre les 4 corpus sont chiffrés
- [ ] Les exclusions post-bascule portent leur raison
- [ ] Les trois `[À SONDER]` sont en attente de L2b, pas devinés
- [ ] Le chiffre final est donné : total / couverts / à exécuter / bloqués / exclus

---

## Compte rendu attendu

En français :

1. **Le chiffre**, en tête. C'est le livrable.
2. **La granularité retenue** et pourquoi ; ce que tu as écarté.
3. **Les recouvrements** entre corpus — c'est la partie difficile, montre-la.
4. **Ce que tu n'as pas pu trancher** et ce qu'il faudrait pour le faire.
5. **Ce qui doit changer dans le plan** — notamment si le volume rend L4 irréaliste en une passe.
   Si l'inventaire montre que la campagne complète demande dix vagues plutôt que trois, **dis-le
   maintenant**, pas en L4.

**Si quelque chose te paraît faux dans ce prompt, dis-le plutôt que de l'appliquer.** L0 a corrigé
deux inexactitudes du sien et relevé une contrainte que le plan ignorait — c'est le comportement
attendu, pas une exception.
