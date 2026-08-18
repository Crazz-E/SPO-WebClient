# Lot A — l'inventaire : le dénominateur de la campagne live RDO

**2026-08-18.** Cadre : [plan-campagne-live-rdo.md](plan-campagne-live-rdo.md) révision 2.
Livrable : [`.rdo-live/inventory.ndjson`](../.rdo-live/inventory.ndjson) — 298 lignes, ajout seul, LF.
Schéma : [`.rdo-live/README.md`](../.rdo-live/README.md) **Appendix A** (les 3 amendements).

Aucun contact serveur. Aucune écriture sous `src/`. Rien de commité.

---

## 1. Le chiffre

| | Lignes |
|---|---:|
| **Dénominateur total** | **298** |
| — dont périmètre du plancher (matrice des mutations) | 78 |
| — dont hors matrice (lectures, cache, bascule, sites d'appel, sondes) | 220 |
| Déjà couverts (`covered:*`, verts en live) | 100 |
| À exécuter en live (`todo`) | 168 |
| Bloqués | 25 |
| Exclus | 5 |
| **Réellement atteignables** (couverts + `todo`) | **268 / 298 — 90 %** |

**Aucune ligne sans statut. Aucune ligne sans palier.** Vérifié mécaniquement.

### La confrontation au plancher de 47/78 — le plan ne tient pas en l'état

Sur les 78 lignes de la matrice :

| Verdict | Lignes | Numéros |
|---|---:|---|
| Atteignables sans dépense | 35 | 3,4,5,9,10,13,15,17–21,24–27,37,38,43,45,52,54,58,61–72 |
| Refus vérifiable (transport A) | 5 | 2, 74, 75, 76, 77 |
| Conditionnées à **P4** (argent / contrepartie / destruction) | 12 | 1,6,7,8,39,40,41,42,53,55,56,57 |
| Bloquées | 21 | 11,12,14,16,22,23,28–36,46–51 |
| Exclues | 5 | 44, 59, 60, 73, 78 |

> **Plafond en s'arrêtant à P3 : 40/78 — il manque 7 lignes au plancher.**
> **Plafond avec P4 : 52/78 — plancher tenu, marge de 5.**

Le plan §3 propose *« une sortie honorable : s'arrêter à P3, P4 en `excluded:risk-budget` »*, et le §7
définit « terminé » par *« ≥ 47 lignes sur 78 en `pass` live »*. **Les deux énoncés sont
incompatibles.** La sortie honorable rend la définition de terminé insatisfaisable. C'est une
décision à contresigner au **GO 1**, pas à découvrir au GO 3 : soit le plancher descend à ~40, soit
P4 cesse d'être optionnel.

Et la marge de 5 est mince : elle repose sur une classification des installations que je n'ai pas pu
lire sur le fil (§4).

---

## 2. La granularité retenue, et ce que j'ai écarté

**Clé de déduplication :** `verb` × `member` (nom de propriété inclus pour `set`) × `targetBinding`
× `argProfile`.

- **`targetBinding` est l'identifiant d'adressage, PAS la classe déclarante.** La matrice §4 les
  distingue explicitement — *« ObjectId pour exactement 10 membres ; CurrBlock sinon »*. Les avoir
  confondus dans une première passe fabriquait **77 faux doublons** entre le corpus matrice et le
  corpus sites d'appel. La classe déclarante est conservée en attribut (`object`), jamais dans la clé.
- **`argProfile` ne discrimine que les membres portés par plusieurs lignes de matrice**, et cet
  ensemble est **calculé, pas deviné**. Deux cas réels : `NewFacility` (#1 générique vs #2
  `%Capitol,#1`, qui n'ont pas le même déverrouillage) et `tycooncampaign.asp` (#67 vs #68 `?Cancel`,
  dont le discriminant est dans le nom de page et non dans les arguments — il m'a fait perdre la
  ligne 68 sur deux passes avant que je le voie).

**Écarté n°1 — la variante comme ligne.** La matrice définit 7 classes adversariales V0–V6 et en
place **136 instances** sur ses 78 lignes. Les compter comme des lignes rendrait le plancher
« 47 sur 78 » **incomparable à lui-même** : il est exprimé en lignes de matrice. Retenu : la variante
est un **attribut** de la ligne ; une ligne est `pass` quand V0 passe, le vecteur de variantes est de
la progression *dans* la ligne.

**Écarté n°2 — la surface Pascal publiée.** A3 a relevé **154** membres `RDO*` dans le Kernel. Les
inventorier tous ajouterait ~120 lignes qu'aucun chemin de code n'atteint. **Un membre qu'aucun code
n'émet n'est pas un scénario, c'est un membre.** C'est exactement l'inventaire de 400 lignes dont 300
sont intestables que le cadrage du lot met en garde de produire.

**Écarté n°3 — la ligne par site d'émission.** A1 a relevé 133 sites d'appel distincts pour 152
membres. Un même scénario émis depuis deux handlers reste un scénario ; `emitSite` est un attribut,
et c'est bien ainsi qu'il sert à l'invalidation.

---

## 3. Les recouvrements — la partie difficile

Ils **n'étaient pas établis**, c'était l'objet du lot. Mesure sur les membres distincts, casse
normalisée (Delphi est insensible à la casse) :

| Corpus | Membres distincts | Exclusifs |
|---|---:|---:|
| **C1** `KNOWN_RDO_COMMANDS` + sites d'appel `src/server/` | 152 | 33 |
| **C2** suites de conformité + enregistrements live | 63 | 5 |
| **C3** `coverage-matrix.md` (78 lignes) | 63 | 14 |
| **C4** `CachedObjectWrap` + transport C | 65 | 40 |
| **Union** | **211** | — |

Somme naïve 343 · union 211 · **recouvrement 132**.

|  | C1 | C2 | C3 | C4 |
|---|---:|---:|---:|---:|
| **C1** | 152 | 58 | 49 | 25 |
| **C2** | 58 | 63 | **3** | 10 |
| **C3** | 49 | **3** | 63 | 0 |
| **C4** | 25 | 10 | 0 | 65 |

**Aucun membre n'est présent dans les 4 corpus.** 92 membres n'existent que dans un seul.

**Le recouvrement qui change la lecture du plan : C2 ∩ C3 = 3.** Les 55 scénarios verts de la
conformité et les 78 mutations de la matrice sont **quasi disjoints** — la conformité couvre des
lectures, la matrice des mutations. On ne peut donc **pas** soustraire les 55 des 78 : ce sont deux
surfaces différentes. C'était implicite dans la façon dont le plan les met en regard (« la suite
couvre 55, la matrice en liste 78 »), et c'est faux.

**C3 ∩ C4 = 0** est en revanche un artefact : les 14 lignes transport C de la matrice nomment des
**pages ASP**, pas des membres RDO. Le lien page → membre Kernel est précisément le travail du lot B ;
A3 et A4 l'ont marqué en note, jamais en citation.

**Déduplication effective sur l'inventaire :** 378 tentatives d'insertion → **298 lignes**, soit
**84 fusions** par la clé. Journal dans `.rdo-live/raw/merge-log.txt`.

---

## 4. Les 41 installations, et les lignes OWN

**41 installations sur 23 types : vérifié, exact.** A2 a recompté mécaniquement depuis
`planitia-2026-08-17-run.json` (réponse `RDOFavoritesGetSubItems`, entrées séparées par `\x02`,
champs par `\x01`), 41 entrées toutes `kind=1`.

**Deux réserves que je ne masque pas.**

1. **Les 41 ids sont des ids de nœud favori (12–52), pas des ids objet-monde.** Or toute mutation de
   la Famille 2 s'adresse par `CurrBlock` ou `ObjectId`. Chaque ligne OWN porte donc une
   **résolution préalable** (`ObjectAt` / `idof` / focus) que le plan ne budgète nulle part. Ce n'est
   pas un blocage, c'est un coût de trames et une étape de plus par ligne.
2. **La nature des 23 types est inférée de leur nom** — aucune classe n'a été lue sur le fil. Le
   relevé de restauration de P1 la tranchera. Les 10 lignes ci-dessous sont donc `blocked:no-facility`
   **provisoirement**.

### Appairage des 30 lignes OWN

**20 appairées.** Natures couvertes par le parc : `any`, `service`, `employer`, `consumer`,
`residential`, `warehouse`, `industry/wh`, `hq/lab`.

**10 sans installation** — natures jamais possédées : `producer`, `industry`, `bank`, `tv`, `studio`.

| Ligne | Nature requise | Membre |
|---|---|---|
| 14 | producer | `RDOSetOutputPrice` |
| 22 | industry | `RDOSetRole` |
| 23, 28, 29 | bank | `RDOSetLoanPerc`, `set Interest`, `set Term` |
| 30, 31 | tv | `set HoursOnAir`, `set Comercials` |
| 32, 33, 34 | studio | `RDOAutoProduce`, `RDOAutoRelease`, `RDOLaunchMovie` |

**+2 par précondition transitive** : #35 et #36 (`RDOCancelMovie`, `RDOReleaseMovie`) dépendent de
#34, lui-même sans studio. **12 lignes perdues au total** — c'est la cause principale du déficit de 7
face au plancher.

---

## 5. Ce que je n'ai pas pu trancher

- **L'axe « durée de rétention de la section critique »** — `unknown` sur **les 298 lignes**, comme
  prévu. C'est le ressort du lot B avec `delphi-archaeologist`, et c'est le seul axe qui ordonne le
  mode de gel n°3. **236 lignes portent `awaitingLotB: true`** : leur palier est provisoire au sens
  fort, pas au sens décoratif.
- **Le lien page ASP → membre Kernel** pour les 14 lignes transport C.
- **Les 4 sondes `[À SONDER]`** — non devinées, portées en `blocked:precondition` en attente de P1 :
  portée de `GetIterator` sur l'arbre mail · présence de `Technology`/`Uniqueness`/`RequiredLevel`
  dans le cache compagnie · format de `AccountHistory<i>` · **la clé de prix dans le cache** (4ᵉ
  sonde du plan §6, celle qui décide si un plafond de dépense est seulement applicable en P4).
- **Les surcharges duales monde / mairie** (`RDOVote`, `RDOSitMinister`, `RDOSitMayor`,
  `RDOSetMinSalaryValue`) : A3 les cite des deux côtés. Laquelle le dispatch atteint réellement est
  une adjudication du lot B.

---

## 6. Ce qui doit changer dans le plan

### 6.1 Le plancher et la sortie honorable sont incompatibles — GO 1

Voir §1. Sans P4, le plafond est **40/78**. À trancher : plancher revu, ou P4 non optionnel.

### 6.2 `pass:refusal-verified` ne couvre pas les 13 lignes ROLE, mais 5

L'amendement est juste ; sa portée ne l'est pas. Les 13 lignes ROLE se répartissent ainsi :

| | Lignes | Traitement retenu |
|---|---|---|
| **Transport A** — refus observable | 2, 74, 75, 76, 77 | `todo` + `expectedOutcome: "refusal"` → `pass:refusal-verified` une fois observé |
| **Transport B** — refus **non** observable | 16, 46, 47, 48, 49, 50, 51 | `blocked:role` + `upgradePath: canari D-4` |
| **Aucun RDO émis** | 73 (*GM broadcast — WS fan-out, no RDO*) | `excluded:not-rdo` |

En transport B, `writeRdoFrame` part **sans QueryId** : le serveur ne produit **aucune trame de
réponse**, par conception ([rdo-protocol-architecture.md §8.5](../doc/rdo-protocol-architecture.md)).
Un refus serveur et une trame jamais arrivée sont indiscernables sur le fil — rien n'est *vérifié*.
Le canari du lot D (émission → relecture synchrone → constat d'invariance) donnerait une preuve
**négative**, d'un rang en dessous. Si le développeur accepte ce rang, statut proposé :
**`pass:refusal-inferred`**, explicitement plus faible, jamais `pass:refusal-verified`.

### 6.3 La clôture transitive d'`emitSite` était fausse d'un chemin et courte de deux fichiers

Le cadrage nommait `src/server/session/rdo-helpers.ts`. Le fichier est à
**[src/server/rdo-helpers.ts](../src/server/rdo-helpers.ts)** et c'est lui qui porte `writeRdoFrame`
([:76](../src/server/rdo-helpers.ts#L76)). Manquaient **[rdo-types.ts](../src/shared/rdo-types.ts)**
(constructeur de toute trame) et **[cp1252.ts](../src/shared/cp1252.ts)** (encodeur Latin-1) : les
deux satisfont le critère même de l'amendement — *« elle change chaque octet sur le fil »*. Un
ensemble de clôture qui oublie le constructeur et l'encodeur fabrique le vert silencieusement périmé
que l'amendement existe pour empêcher. Les **7** fichiers sont fixés dans README Appendix A.2 et
recopiés dans chaque ligne (`closureSet`).

### 6.4 Trois chiffres du plan sont faux

| Affirmation du plan | Réalité vérifiée | Par |
|---|---|---|
| surface `RDO*` du Kernel **~83** | **154** dans les unités canoniques (89 hors `TWorld`) ; **+ ~10 hors dossier Kernel**, dans `StdBlocks` | A3 |
| **11 mutations ASP** basculées | non corroboré : le §4 de l'étude en nomme **12** (liste non close), la source amont `audit-transport-c-asp.md` §7.2 établit **18 membres Kernel nommés** + 2 via-page + 8 lectures IS | A4 |
| l'enregistrement du 17 ne contient que `idof`/`SetPath`/`GetPropertyList` | vrai au sens « aucune trame du protocole d'itération », **faux comme inventaire** : le canal contient aussi `CreateObject` ×4, `SetObject` ×4 et le push `CloseObject "*"` ×4 | A2 |

Ce qui est **confirmé** : 78 lignes · 14 transport C dont 2 exclues · 21 membres publiés par
`CachedObjectWrap` (23 avec les 2 propriétés publiées) · les 5 membres d'itération (`GetIterator`,
`SetClass`, `OpenGate`, `GetSubObject`, `SubObjCount`) **absents de toutes les captures** — le lot E
est justifié · les 3 exceptions dures hors périmètre · 41 installations × 23 types.

### 6.5 Trois défauts trouvés en chemin, à verser au lot B

Aucun n'était cherché ; tous sont vérifiés en source.

1. **`RDOAutoRelease` (#33) n'existe nulle part** dans `../SPO-Original` (grep exhaustif = 0).
   `TMovieStudios` n'a qu'un champ privé `fAutoRelease` (`MovieStudios.pas:48`), aucun membre publié.
2. **`Comercials` (#31) est une faute d'orthographe.** La propriété publiée est **`Commercials`**
   (2 m) — `Broadcast.pas:53`, `TBroadcaster`. Or `set` **n'a pas de repli** : un `set Comercials`
   rendrait `errUnexistentProperty` ([§8.2](../doc/rdo-protocol-architecture.md)). La ligne échouerait
   même avec une station de télévision.
3. **`set Name` sur `CurrBlock` (#5) vise une propriété que `TBlock` ne publie pas** (`Kernel.pas:1209-1395`) ;
   seule `TFacility.Name` existe (`Kernel.pas:1029`). #5 est un **échec prédit**, pas un scénario neutre.

Et un défaut de garde, relevé par A1 : **`RDOStartUpgrades`, `RDOStopUpgrade` et `RDODowngrade` sont
émis en fire-and-forget par `building-management-handler.ts:154/162/169` sans figurer dans
`KNOWN_RDO_COMMANDS`** — ils contournent entièrement ce contrôle. C'est du ressort du lot C, qui doit
inverser la polarité de la garde.

**Une bonne nouvelle, mesurée :** sur les 32 lignes de l'inventaire à profil de gel potentiel
(`procedure` d'arité ≥ 2), **zéro** est émise aujourd'hui avec `"^"`. La garde de production tient.

---

## 7. Définition de « terminé » du lot A

- [x] `.rdo-live/inventory.ndjson` existe, schéma amendé des 3 points (README Appendix A)
- [x] Aucune ligne sans statut, aucune sans palier provisoire — 298/298
- [x] Granularité explicitée et justifiée ; clé de déduplication documentée
- [x] Recouvrements entre les 4 corpus chiffrés (union 211, recouvrement 132, matrice 2×2)
- [x] Lignes OWN appairées aux 41 installations ; 10 types absents en `blocked:no-facility`
- [⚠] Les 13 lignes ROLE : **contredit** — 5 en refus vérifiable, 7 `blocked:role`, 1 `excluded:not-rdo` (§6.2)
- [x] Chiffre final donné et confronté au plancher de 47/78 (§1)

---

## 8. Méthode

4 agents Fable 5 en effort low, corpus disjoints, aucun contact serveur :
**A1** `KNOWN_RDO_COMMANDS` + sites d'appel (183 lignes) · **A2** conformité + enregistrements live
(64 lignes + comptage des installations) · **A3** matrice + surface Kernel (207 lignes) ·
**A4** `CachedObjectWrap` + transport C (66 lignes). Extraits bruts conservés sous `.rdo-live/raw/`.

**Toute déclaration Pascal relevée est un `declaration_hint`**, jamais un verdict — 206 sur 206 chez
A3, 66 sur 66 chez A4. **Le lot B les ré-adjuge tous, avec réfutation adverse.**

**La synthèse, la déduplication, l'appairage OWN, le calcul d'atteignabilité et les quatre
contradictions ci-dessus sont les miens, pas ceux des agents.** Les vérifications de comptage de la
matrice (78 / 13 ROLE / 30 OWN / 14 transport C / 136 variantes) ont été refaites indépendamment.

**Skills utilisées :** `rdo-conformity` (hiérarchie de preuve §0, matrice QueryId × séparateur) ·
lecture directe de `rdo-protocol-architecture.md` §2.1.0 et §8.5. `delphi-archaeologist` n'a **pas**
été invoquée : le lot A ne rend aucun verdict sur une déclaration Pascal — c'est le lot B qui la doit.
