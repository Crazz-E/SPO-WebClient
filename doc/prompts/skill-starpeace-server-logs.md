# Créer la skill `starpeace-server-logs`

**Session neuve. Modèle : Opus 5. Effort : `high`.** Aucun agent, aucun workflow — c'est un travail
de rédaction dense qui exige de vérifier chaque affirmation dans le code et dans les journaux réels.

**Aucune trame RDO ne doit partir.** Tu ne fais que lire des journaux HTTP et du code.

---

## Mission

Écrire **`.claude/skills/starpeace-server-logs/SKILL.md`** : la skill qui apprend à lire les journaux
du serveur Delphi de Starpeace, à y trouver la cause d'un incident, et surtout **à ne pas s'y
tromper**.

Ce savoir existe aujourd'hui, mais dispersé dans `report/campaign/*.md`, dans les commentaires de
`src/tools/conformance/server-logs.ts` et dans la mémoire de sessions terminées. Il a déjà coûté deux
mauvaises conclusions. La skill est là pour que la troisième n'arrive pas.

---

## 1. Le piège des fuseaux — la raison d'être de cette skill

**À écrire en premier dans la skill, et à ne pas diluer.**

> **Les journaux serveur sont en UTC. La machine de développement est en Europe/Paris — UTC+2 en été.
> Convertis AVANT de conclure quoi que ce soit sur la fraîcheur d'un journal.**

Le 2026-08-18, j'ai lu dans le listing IIS `Survival 26-08-18.log … 11:37 AM`, comparé à une heure
locale de 13:37, et conclu que **le journal s'était arrêté deux heures plus tôt** — donc que le
processus était mort. Il était en réalité **en train de s'écrire sous mes yeux** : 11:37 UTC = 13:37
local. La conclusion « le serveur a crashé » en découlait, elle était fausse, et elle a été inscrite
dans `CLAUDE.md` et `doc/rdo-protocol-architecture.md` avant d'être corrigée.

**Ce n'est pas la première fois.** `src/tools/conformance/halt.ts:52-53` porte déjà le commentaire :
*« UTC, ISO 8601. Server logs are read as UTC; a local stamp has already cost one investigation. »*
Le piège a donc mordu **deux fois**, sur deux sujets différents.

La skill doit donner la règle, l'exemple, **et le geste** : convertir explicitement avant de comparer,
ou raisonner entièrement en UTC des deux côtés. `utcSecondsOfDay()` et `parseClock()` existent dans
`server-logs.ts` pour ça — dis-le.

Vérifie et documente aussi : **les horodatages du listing de répertoire IIS sont-ils dans le même
fuseau que le contenu des fichiers ?** (observé : oui, les deux en UTC — confirme-le.)

---

## 2. Ce que la skill doit contenir

### 2.1 L'accès

- Racine : `http://158.69.153.134/logs/` — un listing de répertoire IIS, en HTML.
- **`curl` uniquement.** Le listing se dépouille en retirant les balises ; donne la ligne de commande
  toute faite.
- Quatre serveurs : `FIVEINTERFACESERVER`, `FIVEMODELSERVER`, `FIVECACHESERVER`, `FIVEMAILSERVER`.
- Nommage : `<Catégorie> <AA-MM-JJ>.log`. Catégories observées : `Survival`, `Clients`, `Chat`,
  `Demolition`, `EOY`, `Excentric`, `favorites`, `Office`, `Population`. **Complète cette liste en
  interrogeant les quatre répertoires** — ne te contente pas de recopier la mienne.

### 2.2 ⚠ La règle de taille — sécurité de contexte

**Ne charge JAMAIS un journal entier dans le contexte.** `Population 26-08-18.log` faisait **57 Mo**.
`Survival` dépasse couramment le mégaoctet.

Le geste correct, à écrire noir sur blanc dans la skill :

```bash
curl -s --max-time 120 -o "<scratchpad>/IS.log" "http://158.69.153.134/logs/FIVEINTERFACESERVER/Survival%2026-08-18.log"
grep -c "" IS.log            # combien de lignes
tail -20 IS.log              # l'état courant
grep -n "<signature>" IS.log | head
```

Télécharger dans le scratchpad, puis `grep`/`sed`/`tail`. **Jamais `cat`.**

Note l'encodage de l'URL : l'espace du nom de fichier devient `%20`.

### 2.3 Les formats de ligne, avec leurs bizarreries

Relève-les toi-même sur des journaux réels. Ceux que j'ai observés :

```
2026-08-18 10:22:57 AMMalformed query in TRDOQueryServer.ExecQuery line (160)  1068 sel 29983712 call GetUserList "*";
2026-08-18 10:22:57 AM Error at: TRDOObjectServer.CallMethod "RDODowngrade" (326)
10:22:57 AM - Error in GetChannelList
10:22:48 AM - LOGON ATTEMPT: User=SPO_test3
10:22:50 AM - LOGON SUCCESS: ClientViewId=29983712
10:22:51 AM SPO_test3.IP = 88.167.51.32
11:39:22 AMSIM-Facs
```

**Trois pièges de parsing à documenter :**
- l'`AM`/`PM` est parfois **collé** au message, parfois suivi d'un espace, parfois d'un ` - ` ;
- certaines lignes portent la date complète, d'autres seulement l'heure ;
- des lignes numérotées `(1)`, `(2)`… apparaissent pendant les déconnexions.

### 2.4 Le cœur : distinguer « une méthode a échoué » de « le serveur est cassé »

**C'est la compétence la plus importante de la skill.** Les deux se ressemblent et ne veulent pas du
tout dire la même chose.

| Signature | Ce que ça veut dire | Gravité |
|---|---|---|
| `Error at: TRDOObjectServer.CallMethod "<membre>" (326)` | ~~exception rattrapée dans le corps de la méthode~~ **FAUX — réfuté à l'exécution.** `(326)` est l'`except` **externe**, autour de `theObject.MethodAddress` → `errIllegalObject`. Le corps de méthode, c'est `(319)` → `errIllegalParamList`. Vérifié `Rdo/Server/RDOObjectServer.pas:319-326`. Voir la skill livrée. | — |
| `Error at: TRDOObjectServer.GetProperty (126)` | idem pour une lecture de propriété | normale |
| `- Error in <Membre>` | le `except` interne de la méthode elle-même | normale |
| `Malformed query in TRDOQueryServer.ExecQuery line (160)` | l'`except` **externe** d'`ExecQuery`. Isolé : une trame mal formée. **Sur TOUTES les requêtes de TOUTES les connexions : le répartiteur est corrompu** | critique |
| `Access violation` | fatal | critique |

Le test décisif à enseigner : **une signature critique se juge à sa densité, pas à sa présence.**
Compte-la, rapporte-la au nombre de lignes, et regarde si elle frappe aussi le **trafic interne** du
Model Server (`RefreshArea`, `RefreshTycoons` sur `sel <id>`). Si le serveur rejette les poussées de
son propre Model Server, il est cassé pour tout le monde, pas seulement pour nous.

`FATAL_SIGNATURES` et `troubleLines()` existent dans `server-logs.ts:183-230` — cite-les.

### 2.5 Les oracles de vivacité, et leurs signatures opposées

**À écrire avec soin, c'est contre-intuitif :**

- **Un IS gelé n'écrit RIEN.** Le silence du journal *est* le symptôme.
- **Un IS corrompu écrit ÉNORMÉMENT** — des milliers de `Malformed query`. Le bruit *est* le symptôme.

Deux modes de défaillance, deux lectures inverses. Confondre les deux fait chercher au mauvais
endroit.

**Le battement gratuit :** le Model Server pousse `RefreshArea` / `RefreshTycoons` vers l'IS toutes
les ~12 secondes, sans qu'on ait rien à faire. C'est l'oracle le moins cher : s'il apparaît et n'est
plus rejeté, `ExecQuery` est vivant.

**`ISCnx`** dans `MODELSERVER/Survival` : l'oracle de connexion Model→Interface, résolution ~47 min
(`ISCNX_PROBE_INTERVAL_SEC = 2798`, `server-logs.ts:281-283`). Il sert à distinguer *« c'est nous »*
de *« c'est un tiers »*, en vérification **a posteriori** — jamais comme barrière.

**L'absence de bannière de démarrage après un incident prouve qu'aucun redémarrage n'a eu lieu.**
Documente à quoi ressemble un démarrage d'IS — cherche-le dans un journal de jour où il y en a un.

### 2.6 Retrouver notre propre session

Le bracket de connexion, tel qu'observé :

```
LOGON ATTEMPT: User=SPO_test3
fDAOK=TRUE / WorldProxy is OK
(Logon.3) Calling WorldProxy.RDOGetTycoon...
(Logon.4) TycoonProxyId=…
(Logon.7) Creating ClientView...
Validating account… / CheckUserAccount RDOLogonUser result: 0
LOGON SUCCESS: ClientViewId=…
<user>.IP = <ip>
…
Start Disconnecting <user> … End Disconnecting
```

`findLogonBlocks()` (`server-logs.ts:140`) l'automatise. Le journal **`Clients`** est écrit **au
logout** et se corrèle sur tycoon + heure de login à ±2 s (`parseClients()`, `:112`).

### 2.7 Étude de cas — l'incident du 2026-08-18

C'est le meilleur exemple pédagogique disponible, et tout est vérifiable. Raconte-le comme une
méthode, pas comme une anecdote :

1. **Le symptôme** : `error 1` sur toute requête, depuis 10:22:57 UTC.
2. **La première occurrence** : `FIVEINTERFACESERVER/Survival 26-08-18.log:136`.
3. **Remonter avant** : les rids 1060 `GetCompanyCount`, 1061 `GetUserName`, 1066 `GetChannelInfo`,
   1067 `GetChannelList`, 1068 `GetUserList` — **cinq `function` appelées sous `"*"`**, dont trois
   sans le moindre symptôme. **La trame où le dégât devient visible n'est pas celle qui l'a causé.**
4. **Le mécanisme** : sous `"*"` le répartiteur ne passe aucun pointeur de résultat (`@ResParam` voit
   `Res.VType = varEmpty` et saute à `@DoCall`, `RDOObjectServer.pas:281-283`) ; la `function`
   compilée écrit quand même son `OleVariant` à travers `EDX`, laissé à une valeur arbitraire.
5. **La densité** : 11 894 `Malformed query` sur 12 042 lignes, et seulement **13 lignes
   non-malformées** après la première — notre propre déconnexion.
6. **La durée réelle** : plus de 3 h, **sans redémarrage** — aucune bannière de démarrage.
7. **L'erreur à ne pas refaire** : conclure « le processus a crashé » sans le vérifier dans le
   journal. Il était vivant et cassé, ce qui est **pire** — un crash se soigne en repartant.

Sources : `report/lot-S4-balayage-live.md`, `report/plan-certification-rdo-rev4.md` §1.

---

## 3. Ce que la skill NE doit PAS faire

**Ne duplique pas `src/tools/conformance/server-logs.ts`** — 515 lignes qui automatisent déjà la
corrélation d'une session : `logUrl`, `fetchText`, `parseClock`, `utcSecondsOfDay`, `parseSurvival`,
`parseClients`, `findLogonBlocks`, `troubleLines`, `FATAL_SIGNATURES`, `fatalAnomalies`,
`parseIsCnxEvents`, `heartbeatGaps`, `correlateSession`, `formatServerLogVerdict`.

La skill enseigne **la lecture manuelle** — l'enquête à la main, quand on ne sait pas encore quoi
chercher — et **renvoie au code** pour le chemin automatisé. Dis explicitement quand utiliser l'un ou
l'autre.

**N'écris aucun code de production.** La skill est un document. Si tu penses qu'une fonction manque
dans `server-logs.ts`, écris-le en fin de skill comme une suggestion, sans l'implémenter.

---

## 4. Forme

Structure du dépôt : `.claude/skills/<nom>/SKILL.md`. Frontmatter, sur le modèle de
`.claude/skills/rdo-conformity/SKILL.md` :

```yaml
---
name: starpeace-server-logs
description: "TRIGGER: … "
user-invokable: true
disable-model-invocation: false
---
```

La `description` est ce qui décide du déclenchement : elle doit nommer les situations réelles —
diagnostiquer un incident serveur, vérifier qu'un monde est vivant, attribuer un gel ou une
corruption, corréler un run de conformité avec les journaux.

**Après création :**

```bash
node .claude/generate-skills-manifest.js          # régénérer
node .claude/generate-skills-manifest.js --check  # doit passer
```

Ajoute la skill au tableau des skills projet de `CLAUDE.md` (section « Skills »), et incrémente le
compte total dans le titre de section.

**Langue :** `doc/` est en anglais et les autres `SKILL.md` sont en anglais — **écris la skill en
anglais**, comme ses voisines. Le rapport de fin, lui, en français.

---

> **Ce prompt a été exécuté le 2026-08-18 et onze de ses affirmations ont été réfutées** par la
> session qui l'a appliqué — dont trois erreurs de fond dans le tableau ci-dessus. La référence est
> désormais `.claude/skills/starpeace-server-logs/SKILL.md`, pas ce document.

## 5. Vérifie, ne recopie pas

Tout ce prompt est de seconde main. **Ouvre les journaux et le code, et confirme chaque point avant
de l'écrire.** En particulier :

- la liste réelle des catégories de journaux dans les quatre répertoires ;
- le fuseau du listing IIS **et** du contenu (les deux, séparément) ;
- à quoi ressemble une bannière de démarrage d'Interface Server ;
- les numéros de ligne cités de `server-logs.ts` ;
- l'intervalle réel des poussées `RefreshArea` (j'ai observé ~12 s, mesure-le).

Si un point de ce prompt est faux, **dis-le et corrige-le** plutôt que de le propager. Plusieurs lots
de ce projet ont corrigé leur propre prompt, et c'est le comportement attendu.

---

## 6. Contraintes

- Aucune trame RDO. Aucun run de conformité. Lecture de journaux HTTP et de code uniquement.
- Télécharge dans le scratchpad, jamais `cat` sur un journal.
- Ne commit pas, ne push pas. LF.
- **Une session `R1-R2-R3` travaille peut-être en parallèle dans `src/`** — tu ne touches ni `src/`,
  ni `report/`, hormis ton propre rapport. Si `CLAUDE.md` est modifié sous toi, relis-le avant
  d'écrire.

## 7. Définition de « terminé »

- [ ] `.claude/skills/starpeace-server-logs/SKILL.md` existe, en anglais, avec son frontmatter
- [ ] La règle des fuseaux est **en tête**, avec l'exemple de l'erreur réelle et le geste correct
- [ ] La règle de taille (ne jamais charger un journal entier) est explicite
- [ ] Le tableau des signatures distingue « méthode qui échoue » de « serveur cassé »
- [ ] Les deux signatures opposées de défaillance (gel = silence, corruption = bruit) sont écrites
- [ ] L'étude de cas du 2026-08-18 est là, comme méthode
- [ ] La skill renvoie à `server-logs.ts` au lieu de le dupliquer
- [ ] `node .claude/generate-skills-manifest.js --check` passe
- [ ] `CLAUDE.md` est à jour (tableau + compte)

## 8. Compte rendu attendu

**(1)** ce que la skill couvre ; **(2)** ce que tu as **vérifié** et qui contredisait ce prompt ;
**(3)** ce que tu n'as pas pu vérifier et pourquoi ; **(4)** les manques que tu vois dans
`server-logs.ts`, sans les implémenter.
