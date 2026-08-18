# ⛔ OBSOLÈTE — Plan rév. 3 (le balayage)

> **Cette révision est morte le 2026-08-18.** Sa prémisse centrale — « la certification devient un
> balayage » — supposait qu'il existe une trame sûre pour un membre dont on ignore le genre. Il n'y
> en a pas : `"^"` gèle sur une `procedure`, `"*"` provoque une écriture mémoire arbitraire sur une
> `function`, et le genre est précisément ce que le balayage devait découvrir. Le raisonnement était
> circulaire, et le balayage a cassé le serveur de production partagé.
>
> **Plan en vigueur : [plan-certification-rdo-rev4.md](plan-certification-rdo-rev4.md).**
> Ce document est conservé comme dossier d'incident. Ne pas le ressusciter.

---

# Plan — certification RDO, révision 3 : le balayage

> ## ⚠ §1.1 et §3 sont RENVERSÉS par la mesure — 2026-08-18, lire d'abord [lot-S4-balayage-live.md](lot-S4-balayage-live.md)
>
> Le lot S4 a exécuté la vague 1 et **elle a cassé l'Interface Server partagé de `planitia`** à sa
> dixième trame. Une seule : `call GetUserList "*"`, sur une `function`. Depuis, le serveur répond
> `error 1` à toute requête, sur toute connexion. `.rdo-live/HALT` est posé ; il faut redémarrer l'IS.
>
> **Ce que §3 affirme et qui est faux :** *« Le void ne demande pas de résultat, donc aucun pointeur
> caché nulle part. »* L'appelant n'en demande pas ; l'appelé en écrit un quand même, à travers le
> registre que son ABI réserve et que le dispatcher n'a pas rempli (`RDOObjectServer.pas:281-283`).
> C'est une écriture arbitraire dans le processus du serveur.
>
> **Ce que §1.1 affirme et qui est faux :** *« La certification devient un balayage, pas une
> adjudication. »* La règle a deux axes — arguments émis = arguments déclarés, ET séparateur accordé
> au genre — donc **il n'existe aucune trame sûre pour un membre dont personne n'a la déclaration**.
> Le genre d'un membre non adjugé ne se lit pas sur le fil. Le balayage **valide** l'extraction
> Pascal sur deux cellules (0 argument sur 0 paramètre, 1 argument registre sur 1 paramètre) ; il ne
> la remplace pas. Le lot B n'est pas remplacé par le fil, il est remplacé par S1.
>
> Le reste du plan tient : §2 (ce qui tombe), §4 (les éditions), §4 bis (le GO et les exclusions,
> aux deux corrections du rapport S4 près), §5, §6, §7.

**Révision 3 du 2026-08-18.** La rév. 2 ordonnait par risque de gel sur cinq paliers gatés, avec
~8 h d'attente bloquante. Le développeur a tranché : *« si le serveur crash ce n'est pas grave »*,
*« va beaucoup plus vite »*, *« lève les inconnues le plus rapidement possible »*. Trois vérifications
faites depuis rendent cette architecture obsolète — pas allégée, **obsolète**.

Objectif inchangé : **une suite de régression RDO certifiée, rejouée à chaque git** — uniquement si
la surface RDO a bougé, ce que le gate sait déjà faire depuis le 2026-08-18.

Branche : `fix/rdo-pool-lifecycle-timeouts-probe` · Production : `e46ccd6b`, saine.

---

## 1. Les trois découvertes qui changent l'échelle

### 1.1 Le gel dépend des arguments ÉMIS, pas de l'arité déclarée

C'est la découverte centrale, et elle est vérifiée dans l'assembleur de dispatch.

`RDOObjectServer.pas:214-218` lit `ParamCount` **du tableau variant reçu**, pas de la déclaration.
0 argument → `EDX`, 1 argument → `ECX` ; `RegsUsed` n'atteint `MaxRegs = 3` **qu'au deuxième
argument registre** (`:281-292`). Donc :

> **`call M "^"` avec 0 ou 1 argument ne peut pas geler, quelle que soit la déclaration de `M`.**

Les deux bords sont **live-prouvés**, et c'est la preuve opérationnelle qui prime :

| Membre | Arguments émis | Résultat | Source |
|---|---:|---|---|
| `ClientAware` | 0 | `error 9` en 91 ms | sonde U1-a, 2026-08-16 |
| `CloseMessage` | 1 | `error 9`, **aucun gel** | `mail-read-captured.scenario.ts:1011-1012` |
| `SayThis` | 2 | **gel**, 12 h 41 | production, 2026-08-14 |

Ces trois mesures encadrent le seuil des deux côtés. **On peut donc sonder les 217 membres en `"^"`
à 0 argument sans aucun risque de gel**, et la réponse classe le membre :

| Réponse | Verdict |
|---|---|
| `res="…"` | **function** |
| ack vide sous `"^"` | function renvoyant un variant vide (`RDOQueryServer.pas:478-482`) |
| `error 9` | **procedure** |
| `error 5` | non **publié** (`MethodAddress` ne voit que le `published`) — jamais « inexistant » |
| `error 6` | liste de paramètres refusée |
| silence | gel |

**La certification devient un balayage, pas une adjudication.** Deux vagues, ~450 trames, un seul
login, **moins de 2 minutes de fil**.

### 1.2 L'extraction mécanique de l'arité est faite, et elle est propre

0,32 s sur 1 751 `.pas`. 1 090 déclarations publiées, dont **548 sur la surface réellement
atteignable**. Le corpus Pascal SPO est d'une régularité inespérée : **zéro surcharge, zéro paramètre
par défaut, zéro `var`/`out`, zéro déclaration multi-lignes** parmi les membres `RDO*`.

Taux d'échec mesuré : 23 suspects sur 1 090 (2,1 %), **aucun dans la surface atteignable**. Il reste
**0 membre réellement ambigu** dans la surface, et 3 dans tout le corpus — des forks de fichier
(`Cache/` vs `Cache Server/`) qu'**une** sonde live tranche.

> **Le lot B est annulé.** L'adjudication Opus `xhigh` avec double réfutation sur 175 membres est
> remplacée par **un script et trois questions**.

### 1.3 Les captures certifient déjà 28 % du corpus, gratuitement

**61 des 217 membres** de l'inventaire sont attestés sur le fil (3 enregistrements `planitia`,
6 scénarios capturés, 4 158 lignes de `Mock_Server_scenarios_captures.md`). Preuve de rang maximal,
coût nul. **156 membres n'ont jamais été vus** — c'est le vrai dénominateur du balayage.

---

## 2. Ce qui tombe, et la ligne de partage

> **Tout ce qui répond « QUI a gelé le serveur » tombe. Tout ce qui répond « ce vert veut-il dire
> quelque chose » reste.**

**Supprimé** — ~8 h d'attente bloquante mesurée, plus le plus gros lot hors ligne :

- les fenêtres O5-b entre paliers (4 × 47 min ≈ **3 h 10**) ;
- les vagues isolées pour les membres à profil de gel (≈ **4 h 40**) ;
- la séquentialité stricte de L4 ;
- l'axe « rétention de section critique » de l'échelle P0→P4 ;
- **la réfutation adverse du lot B** comme préalable à toute émission.

**Conservé, et pour une autre raison que le serveur :**

- le corrélateur `ISCnx` en **enregistrement passif**, déjà non bloquant (`server-logs.ts:405-412`) —
  il sert à distinguer « c'est nous » de « c'est un tiers », ce qui évite de chasser un bug qu'on n'a
  pas ;
- l'**invalidation rétroactive en version étroite** : un événement `ISCnx` invalide les steps dont
  l'horodatage tombe dans la fenêtre, **pas le palier** ; la campagne ne rembobine jamais ;
- le **canari transport B** — c'est l'O2 de ~30 lignes sans acquittement, pas un dispositif de
  sûreté ;
- la **catégorie de délai juste** — une ligne déclarée `fail` sur une expiration à 60 s est un faux
  négatif ;
- la **garde compilée** (§4, éditions 1 à 3).

### L'attribution d'un gel, corrigée et rendue immédiate

Le développeur a raison de le demander : **un gel est un résultat de test**, et sans attribution il
n'apprend rien. Mais elle n'a plus besoin des 47 minutes d'`ISCnx` :

- le harnais enregistre **déjà** chaque trame sortante (`recorder.recordOut`) ; le journal survit au
  gel, puisque c'est le serveur qui se tait, pas notre processus ;
- `runSuite` **s'arrête au premier `response === null`** (`runner.ts:262-273`) : la dernière trame
  émise **est** le suspect, directement ;
- il suffit de **produire le `HaltRecord`** sur `stoppedOnSilence` et de le porter jusqu'au rapport,
  **sans écrire `.rdo-live/HALT`**. La formulation initiale confondait deux choses distinctes, et la
  confusion était mienne : le **record est l'attribution**, le **fichier est le frein**, et le frein
  reste **manuel** — retrait du déclenchement automatique décidé par le développeur le 2026-08-18,
  motifs conservés dans `halt.ts:8-32`. Livré en S2 sous cette forme : `SuiteReport.halt`,
  `RunnerHooks.onHalt`, `formatSilenceAttribution`.

**Correction d'un chiffre que j'ai avancé à tort :** un gel ne nous coûte pas 12 h 41 d'attente. Il
nous coûte **60 s** (le délai `FAST`) plus la queue de run confisquée. Le seul terme qui compte est
que **le run suivant ne peut pas démarrer** avant le retour du serveur — c'est lui, et lui seul, qu'on
minimise.

---

## 3. Le plan

| # | Lot | Contenu | Coût |
|---|---|---|---|
| **S1** | **Extraction** | Script d'arité sur le corpus Pascal + minage des captures → `verdicts.ndjson` pré-rempli. **Remplace le lot B** | ⚠ **à moitié** — `extract-rdo-arity.js` livré, `verdicts.ndjson` **jamais produit** |
| **S2** | **Déverrouillage du harnais** | La liste d'éditions du §4. Sans elle rien ne s'émet | ✅ **fait** 2026-08-18 — 16 suites, 279 tests |
| **S3** | **Mock** | Les 5 membres jamais émis : `GetIterator`, `SetClass`, `OpenGate`, `GetSubObject`, `SubObjCount` | 1 session |
| **S4** | **Balayage live** | 4 vagues, ~450 trames, < 2 min de fil. **Prompt écrit** : [campagne-live-S4.md](../doc/prompts/campagne-live-S4.md) — porte les éditions 0 (message `cli.ts`) et 1 (liste de refus) | 1 session |
| **S5** | **Réinjection** | Chaque `error 9` → `VOID_MEMBERS` avec sa déclaration ; chaque `res=` → `function`. Ferme le défaut de polarité | 1 session |
| **S6** | **Suite + gate** | La suite de régression, rejouée à chaque git sur surface RDO touchée | 1 session |

### L'ordre des vagues de S4 — risque résiduel croissant

Un gel à la position *k* confisque toute la queue (`runSuite` casse au premier silence). On trie donc
pour que la queue confisquée par la sonde la plus risquée soit **vide** :

- **vague 0** — `get <prop>` sur les propriétés : aucun appel de méthode, risque nul
  (`RDOObjectServer.pas:119`) ;
- **vague 1** — `call M "*"` 0 arg sur les 217 : partition *existe* / `error 5` ;
- **vague 2** — `call M "^"` 0 arg sur les survivants : **function vs procedure** ;
- **vague 3** — `call M "^"` 1 argument bien typé, là où la vague 2 a rendu `error 6`.

Intra-vague : `paramCount = 0` d'abord, puis inconnus, puis `≥ 1` en dernier.

**La vague 2 est entièrement en `"^"`, donc entièrement en `risk:'variant-on-procedure'`.**
`cli.ts:133-139` refuse ce drapeau avec `--suite all` : la vague doit **nommer sa suite**. Arbitré le
2026-08-18 — **la règle reste, sa justification tombe**. Son objet réel (« re-lancer doit être une
décision, pas un défaut ») survit intact à la découverte ; le motif affiché, lui, est faux depuis
qu'on sait que le balayage rachète les 156 membres jamais vus. À revoir en S6, quand le balayage
entrera dans `all`.

---

## 4. La liste d'éditions de S2 — **exécutée le 2026-08-18**

Les neuf éditions sont appliquées. Deux corrections de cette liste, relevées à l'exécution et
vérifiées par moi : l'édition 9 dit **produire** le record, pas écrire le fichier (§2) ; et l'édition
visant le message de refus a été appliquée à `runner.ts` seul — **son jumeau survit dans
`cli.ts:137-138`**, qui affirme encore *« the step is settled (error 9, live 2026-08-16) »*. C'est le
raisonnement `ClientAware`-seulement que la découverte a réfuté. Défaut de mon prompt, pas du lot :
reporté en **édition 0 de S4**.

| # | Édition | Où | Coût |
|---|---|---|---|
| 1 | **`assertPacketSafe` mesure le mauvais axe** — il lit `proc.paramCount` (déclaré) au lieu de `packet.args?.length` (émis). C'est le correctif qui autorise tout le balayage | `suites.ts:104` | petit |
| 2 | Élargir la bande sûre de 0 à **1 argument** — `CloseMessage` le prouve en capture | `suites.ts:98-109` | petit |
| 3 | **Inverser la polarité** : `if (!proc) return` laisse passer `"^"` sur tout membre inconnu. Sur 154 membres Kernel, c'est le vecteur de gel | `suites.ts:101` | moyen |
| 4 | Drapeau `--allow-mutations` porté jusqu'à `refusalReason` | `runner.ts:61-63`, `cli.ts` | trivial |
| 5 | Élargir `SessionDriver` — ~45 méthodes qui existent déjà sur `StarpeaceSession` | `types.ts:99-107` | petit |
| 6 | Catégorie de délai paramétrable sur `ctx.emit` (`FAST` est faux pour une mutation) | `runner.ts:111`, `:114` | trivial |
| 7 | `DEFAULT_FRAME_BUDGET` 400 → **3000** | `runner.ts:52` | trivial |
| 8 | Opt-in `probe` sur `assertNotVoidPush` — voir la réserve §5.2 | `rdo-request-guards.ts:117-125` | moyen |
| 9 | **Produire** le `HaltRecord` sur `stoppedOnSilence` — l'attribution immédiate. **N'écrit pas `HALT`** : voir §2 | `runner.ts:270` | petit |

**`sendRdoRequest` n'est pas un trou à fermer** — c'est le moteur de `ctx.emit` (`runner.ts:114`) et
le seul chemin qui traverse le formateur, les gardes, les délais et le contrat `errorCode` de
production. Le fermer transformerait la suite en sonde qui se teste elle-même.

**Piège de chargement :** `assertSuitesSafe` s'exécute **à l'import** (`suites.ts:342`). Toute suite
portant un step `risk:'mutation'` **sans champ `reset`** fait exploser le CLI entier avant même le
parsing des arguments. Écrire le `reset` en même temps que le step, jamais après.

---

## 4 bis. GO du développeur, 2026-08-18 — et la liste de refus qu'il impose

**Le go/no-go du §5.3 est donné.** *« Pas de problème pour une altération du compte »* — la campagne
de mutation sur `SPO_test3` est autorisée. **Trois exclusions**, et leur motif est opérationnel, pas
prudentiel : elles *« détruiraient tout le contenu du compte de test et empêcheraient de nouveaux
tests »*.

1. suppression du compte ;
2. suppression d'une compagnie ;
3. régression de niveau.

### Ces exclusions doivent être COMPILÉES, pas respectées par convention

Le balayage est aveugle par construction : il émet `call M "^"` sur des membres qu'il n'a pas
identifiés — c'est son objet. Il ne peut pas *savoir* qu'il vient d'appeler `RDODelCompany`. Une
exclusion qui repose sur « le balayage ne devrait pas y aller » n'en est pas une. Elle entre donc
dans la garde compilée, à côté de `VOID_MEMBERS`.

**Les membres concernés, tous `published` dans `Kernel/World.pas`, tous atteignables par une trame :**

| Ligne | Membre | Exclusion |
|---|---|---|
| :367 | `RDODelTycoon( name, password )` | 1 |
| :368 | `RDOResetTycoon( name )` | 1 — **sans mot de passe, 1 paramètre : le plus exposé des six** |
| :369 | `RDOResetTycoonEx( name, password )` | 1 |
| :372 | `RDODelCompany( name )` | 2 — 1 paramètre |
| :373 | `RDOGetRidOfCompany( cpnName, tycoonName, password )` | 2 |
| :402 | `RDOAssignLevel( tycoonName, sysPassword, Level )` | 3 |
| :415 | `RDOResetTournament( password )` | ajouté par moi — même famille, même irréversibilité |

**Deux vérifications qui changent la portée du risque :**

- **Aucun des six n'est dans l'inventaire du lot A.** Les 217 membres du dénominateur sont ceux que
  notre client appelle ; l'outillage d'administration de `World.pas` n'en fait pas partie. Le
  balayage tel que planifié ne les atteint pas. **Le piège est dans S1** : l'extraction produit 548
  membres sur la surface atteignable, et c'est là qu'ils vivent. Le jour où le dénominateur passe de
  217 à 548 « pour être exhaustif », ils sont embarqués sans qu'on le voie.
- `TWorld.DeleteTycoon`, `TWorld.DeleteCompany` (:567-571) et `TTycoon.ResetLevel` (`Kernel.pas:2594`)
  sont **`public`, pas `published`** — `MethodAddress` ne les voit pas, ils répondent `error 5`.
  Ces chemins ne sont pas atteignables.

⚠ **Erreur d'attribution évitée, à ne pas refaire :** `RDODowngrade` / `RDODowngradeMany`
(`Kernel.pas:1094-1095`) ne sont **pas** l'exclusion 3. Leur bloc `published` contient
`RDOConnectInput`, `RDOStartUpgrade`, `RDOStopUpgrade` : c'est la classe **bâtiment**, et ce
`Downgrade` rétrograde le niveau technologique d'un bâtiment, réversible par `RDOStartUpgrade`.
La vraie exclusion 3 est `RDOAssignLevel`.

### Le protocole bâtiment, dicté par le développeur

**Démolition : un parc. Construction : le même parc, au même endroit.** La démolition *produit* le
couple `(x, y)` que la construction consomme — c'est la chaîne `ctx.state` que le harnais sait déjà
faire (§3.4 du prompt de pilotage), et elle résout le problème du choix des coordonnées sans avoir à
le trancher.

`RDODelFacility( x, y )` (`World.pas:354`) est une **`function`** : `"^"` est sa forme juste et ses
deux arguments entiers ne gèlent pas — une `function` dépile bien le pointeur de résultat caché. Le
gel ne concerne que `"^"` sur une **procedure**.

---

## 5. Trois réserves que je maintiens

### 5.1 Je refuse le déguisement en `risk:'read'`

Un agent a relevé que `runner.ts:61` ne laisserait passer le balayage que déclaré `risk:'read'`, et
l'a lui-même qualifié de *« mensonge au gate, pas une sécurité contournée »*. **Il a raison, et je ne
le ferai pas.** Falsifier la classe de risque corromprait la comptabilité de la suite qu'on
construit — c'est-à-dire l'objet même du travail. Le chemin honnête est le drapeau `--allow-mutations`
de l'édition 4, qui déclare l'intention dans la ligne de commande et dans le rapport.

### 5.2 `assertNotVoidPush` n'est pas une garde de sûreté — mais l'autre l'est

`CLAUDE.md` est explicite : c'est une **convention de projet** (une forme par intention). La garde de
crash est `assertNotVariantOnVoidMember`, et **elle ne bouge pas**. Un opt-in `probe` explicite,
positionné par le seul harnais, est donc légitime. La distinction compte : relâcher la convention est
défendable, désarmer la garde ne l'est pas.

### 5.3 Le balayage EXÉCUTE les corps de méthode

`error 5` est décidé avant l'appel (`MethodAddress`), mais **tout le reste passe par
`call MethodAddr`**. Un balayage `"*"` ou `"^"` sur des membres inconnus est donc une **campagne de
mutation sur le compte vivant `SPO_test3`** — 41 installations — et non une lecture.

Tu as autorisé les mutations et tu assumes le crash ; ce n'est donc pas un obstacle. Mais **une
modification d'état non voulue sur ton compte est autre chose qu'un crash**, et tu dois le savoir
avant la vague 1, pas après.

---

## 6. Deux corrections de l'inventaire, à répercuter

- **`error 5` se lit « non publié », jamais « inexistant ».** `MethodAddress` ne voit que le
  `published` ; un membre `public` répond `error 5` tout en étant appelable côté Delphi. Ne pas
  fermer une ligne de l'inventaire sur ce seul signal.
- **`countParams` surestime pour les flottants.** `@CheckIfSingle` / `@CheckIfDouble` poussent
  **inconditionnellement sans incrémenter `RegsUsed`** (`RDOObjectServer.pas:255-263`). Ne jamais
  dériver la règle du texte de la déclaration sans regarder les types.

---

## 7. Ce qui reste vrai de la révision 2

- La règle **« tenter tout, n'exclure que sur échec constaté »** : aucune ligne écartée sur
  présomption, toute impossibilité remontée au développeur avec sa raison.
- La couche visée est le **protocole**, pas l'interface. Les raisons `blocked:ui-disabled` et
  `blocked:ui-absent` de la matrice n'ont aucun sens ici : les lignes qui les portaient sont `todo`.
- Le **gate ne se déclenche que si la surface RDO a bougé** (`.claude/hooks/rdo-surface.json`).
- `#44 RDODisconnectFromTycoon` reste `excluded:irreversible`, **dossier volontairement ouvert**.
- Le **dénominateur** : 298 scénarios, 217 membres distincts, 268/298 atteignables.

---

## 8. Méthode

Rév. 3 produite après un panel de 5 agents (Workflow `plan-rapide-rdo`, 423 k tokens) sur les cinq
inconnues bloquantes. **Les vérifications de code et les arbitrages sont les miens** — deux
propositions du panel sont refusées au §5.

Skills prescrites : `rdo-conformity` (S2, S4, S5) · `delphi-archaeologist` (S1) · `spo-testing`
(S2, S3, S6).
