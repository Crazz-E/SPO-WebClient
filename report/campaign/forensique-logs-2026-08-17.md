# Forensique des journaux serveur — 2026-08-17

> **Sonde en lecture seule.** Aucune trame RDO émise, aucune session de jeu ouverte, aucune écriture
> sous `src/`. Uniquement des `GET` HTTP simples (`curl`) sur `http://158.69.153.134/logs/` et de la
> lecture de `../SPO-Original`. **Le gate de conformité est resté armé** pendant toute la session.
>
> **Résultat en une ligne :** l'étalon du gel est **établi et daté à la seconde** — un gel dur
> n'écrit *rien*, pas même la fin de la session en cours ; la **même signature s'est reproduite le
> 2026-08-17 à 14:54 UTC**, sur le build de production, depuis un poste qui n'est pas le nôtre ; le
> lien `Error opening message` ↔ `readMailMessage` est **écarté par la source**, mais le second
> message du Mail Server, `Error checking for new mail`, est **la trace en production d'un défaut de
> notre client**, aujourd'hui corrigé ; et le Model Server porte **l'oracle O4 de la sonde S1**, que
> la session live n'avait pas.

**Corpus.** `report/campaign/logs-cache/2026-08-17-preserve/` — 20 Mo, complété ce jour avec
`IS/` (Survival 07-03, 08-08, 08-15→17 · Clients 08-08, 08-10→17 · Chat · Demolition),
`MS/` (Survival 08-10→17, 2,2 Mo/jour · Demolition · ClassInfo · favorites · EOY · Money · TimeWarp),
`CS/` (les 9 fichiers du Cache Server), et les 2 fichiers du Mail Server déjà préservés.
`FIVEMODELSERVER` et `FIVECACHESERVER` n'avaient jamais été récupérés — c'est fait (T4).

**Horloge.** Les serveurs écrivent en heure locale serveur ≡ **UTC ±2 s** (vérifié : logoff du run de
gate `17:45:34.096Z` ↔ IS `5:45:34 PM` ↔ MS `5:45:34 PM`). Tous les horodatages ci-dessous sont donc
lisibles comme de l'UTC. **Le poste de travail est en CEST (UTC+2)** — c'est la source d'une confusion
traitée en §3.2.

---

## 1. Les étalons

### 1.1 Étalon A — le gel dur : **il n'écrit rien**

La mission situait la trace du gel U1-b/U2 dans `IS-2026-08-15.log`. **Elle n'y est pas, et c'est le
résultat.** Le 2026-08-15, l'Interface Server n'enregistre **aucune session `SPO_test3`** (`Clients
26-08-15.log` : 5 lignes, toutes `lord kaio`). Le gel est à la **fin du journal du 2026-08-14**.

**Chronologie reconstruite, à la seconde, par recoupement IS × Model Server :**

| t (UTC) | Journal | Ligne | Lecture |
|---|---|---|---|
| 08-14 **21:28:15** | IS `Survival` | `LOGON ATTEMPT: User=SPOTest3` → `RDOLogonUser result: 6` → `LOGON FAILED` | tentative avec un nom mal orthographié |
| 08-14 **21:29:22** | IS `Survival` | `LOGON ATTEMPT: User=SPO_test3` → … → **`LOGON SUCCESS: ClientViewId=7272232`** | **dernière ligne du fichier** |
| — | — | *(la ligne `SPO_test3.IP = …` qui suit normalement sous 1–12 s n'est jamais écrite)* | la trame fatale part ici |
| 08-14 **21:29:48** | MS `Survival` | le MS pousse `call ModelStatusChanged "*" "#1"` vers l'IS | début de sauvegarde binaire |
| 08-14 **21:29:58** | MS `Survival` | `<ISCnx> (10)- Query timed out … ModelStatusChanged "*" "#1"; Time: 10000` | **l'IS ne répond plus à rien** |
| 08-14 21:30 → 08-15 09:56 | MS `Survival` | **34 poussées `ModelStatusChanged` sans réponse** (8 le 14, 26 le 15), 2 par cycle de sauvegarde, ~toutes les 46 min | l'IS reste muet toute la nuit |
| 08-15 **10:10:09** | MS `Survival` | `ISCnx Error writing to socket` + `Start/End disconnecting: (ISCnx)` | la socket TCP casse enfin — le processus IS a disparu |
| 08-15 **10:10:47** | IS `Survival` | `GM Cannot connect to Server: dir.starpeaceonline.com Port: 2222` | l'IS réécrit |

**Indisponibilité de l'Interface Server : 12 h 41 min 25 s.**

**La signature empirique d'un gel dur — cinq marqueurs, tous négatifs :**

1. **Aucune exception.** `Error at: TRDOObjectServer.CallMethod "…" (…)` — la forme que le protocole
   de sonde prédisait pour un `errIllegalParamList` capturé — est **absente des journaux IS sur les
   8 jours** (0 occurrence, 10→17 août). Le serveur n'a rien attrapé : il a cessé de s'exécuter.
2. **Aucune ligne d'erreur, aucun avertissement, aucun code retour.**
3. **La session en cours n'est pas refermée.** Pas de `Start Disconnecting`, pas de `End
   Disconnecting`, et — décisif — **aucune ligne dans `Clients`**. Le tableau des codes de sortie
   n'enregistre que les sessions qui se terminent ; une session gelée y est *invisible*, pas
   *marquée*. Un `Clients` propre ne prouve donc rien sur les sessions gelées.
4. **Le fichier s'arrête net**, sans marqueur d'arrêt. L'IS n'écrit aucune bannière de démarrage non
   plus : la reprise est silencieuse.
5. **Le seul témoin positif est extérieur** : le Model Server, qui pousse `ModelStatusChanged` vers
   l'IS toutes les ~46 min, journalise chaque non-réponse. **`<ISCnx> … Query timed out` est le
   détecteur de gel de l'Interface Server**, et il est spécifique : **0 occurrence les 10, 11, 12, 13
   et 16 août**, 34 pendant le gel.

> **Conséquence opératoire, et tout le reste du rapport en dépend.**
> **L'absence d'entrées et les trous d'horodatage sont le signal ; les messages d'erreur ne le sont
> pas.** Un journal IS « propre » sur une fenêtre est compatible avec un gel dans cette fenêtre. Le
> seul contrôle de vivacité valable pour l'IS est **`ISCnx` côté Model Server**, et pour le monde,
> **la continuité du compteur intégrateur du MS** (§1.3).

**Attribution.** Le journal ne porte aucune IP pour une session gelée (la ligne `.IP =` n'a pas eu le
temps d'être écrite). L'attribution repose donc sur : le compte `SPO_test3`, la faute de frappe
`SPOTest3` suivie 67 s plus tard de la forme correcte — la signature d'un harnais automatisé mal
configuré — et l'absence de tout autre candidat. **Établi pour le gel, très fortement plausible pour
l'attribution, non prouvé par l'IP.**

> **Correction de date à porter.** Les rapports et `CLAUDE.md` datent le gel du **2026-08-15**. Le
> journal serveur le date du **2026-08-14 21:29:22 UTC** (= 23:29 CEST le 14 août sur le poste). La
> conclusion technique est inchangée ; seule la date l'est. Fichiers concernés :
> `src/server/CLAUDE.md`, `report/rdo-audit-2026-08-14.md:13,49`,
> `report/campaign/sondes-live-2026-08-16.md:135`. *(À corriger par le développeur — je n'écris pas
> sous `src/`.)*

### 1.2 Étalon B — le mauvais appel ASP du 2026-08-17 17:58:30

**Il n'apparaît dans aucun journal exposé.** Vérifié :

| Journal | Attendu | Constaté |
|---|---|---|
| IS `Survival` 08-17 | rien (l'appel ne passe pas par l'IS) | dernière ligne à 17:45:34 |
| MS `Survival` 08-17 | une ligne `Initial suppliers, …` si l'appel avait abouti | **rien entre 17:56 et 17:59** |
| Annuaire (66.70.203.216) | la cible réelle de l'appel | **`/logs/` ne publie que les 4 catégories du monde** — l'annuaire n'a pas de journal exposé |
| IIS de `158.69.153.134` | le HTTP 500 | aucune catégorie de journal web sous `/logs/` |

**Signature d'un mauvais appel : aucune.** C'est une **limite de couverture des journaux**, à
consigner comme telle : une faute COM contenue par IIS est invisible côté serveur de jeu.

**Mais son innocuité, elle, est prouvée positivement.** Le Model Server journalise l'*entrée* de
`TTycoon.RDOHireOnlyFromWarehouse` (§7). L'absence de toute ligne `Initial suppliers` à 17:58
**confirme indépendamment le §7 du rapport live** : la trame n'a jamais atteint le tycoon, aucune
mutation n'a été appliquée, il n'y avait rien à restaurer. C'est une confirmation O4 d'un constat
qui n'était jusqu'ici qu'O2.

### 1.3 Étalon C, non prévu — la panne du monde, et comment la distinguer d'un gel

Le compteur intégrateur du Model Server (`N>` / `<N+1`, une paire par cycle de ~14 s) tranche entre
**arrêt du processus** et **blocage du processus** :

| Cas | Compteur | Journal |
|---|---|---|
| Redémarrage du monde | **remise à 1** + ligne **`WORLD LOADED`** | `Registering at Cache Server…`, `Reading language files…` |
| Gel / suspension du modèle | **continu**, un cycle qui dure des heures | rien |

Appliqué au corpus : **le 2026-08-11, le cycle 10124 s'ouvre à 07:16:08 et ne se referme qu'à
10:16:33 — 3 h 00 min 17 s** sans redémarrage, compteur continu. Le monde a été **suspendu**, pas
relancé.

---

## 2. Ligne de base 10 → 16 août, par jour et par serveur

Rappel : ces jours-là la production tournait déjà sur `63d9eb0b`, et **nous n'y étions pas** (aucune
session `SPO_test3` du 10 au 13, ni le 15). Ce qui suit est produit par d'autres joueurs.

### 2.1 Interface Server

| Jour | Tentatives | Échecs | Lignes `Clients` | Anomalies |
|---|---:|---:|---:|---|
| 08-10 | 10 | 0 | 10 | 1 timeout DA (`RDOGetObjectsInArea "^"`), réponse arrivée après coup → `Ignored result` |
| 08-11 | 3 | 0 | 3 | 1 timeout DA (`RDOSegmentsInArea "^"`) |
| 08-12 | 5 | 0 | 5 | 1 timeout DSCnx (`RDOSetSecurityLevel "^"`, 30 s) → `Ignored result` |
| 08-13 | 2 | 0 | 2 | **aucune** |
| **08-14** | 18 | 1 | 15 | `Error in RefreshTycoon: Variant does not reference an automation object` (01:46) — et **le gel à 21:29:22** (§1.1) |
| 08-15 | 6 | 0 | 5 | 2 timeouts DA ; `Error in RefreshTycoon: Unspecified error` (17:41) |
| 08-16 | 24 | 0 | 24 | 4 timeouts (3 × `get RDOGetBudget`, 1 × `GetSurface`) → `Error in RefreshTycoon` ×3, `Error in GetSurface` ×1 |

**Trous d'horodatage IS : non exploitables comme signal.** L'IS n'écrit que sur événement ; les
« trous » quotidiens (jusqu'à 16 h) ne sont que des nuits sans joueurs. Seul le recoupement `ISCnx`
du §1.1 fait foi.

**`Error in RefreshTycoon` — point clos, définitivement.** Le motif est stable et récurrent
(15/08, 16/08 ×3, 17/08 ×4) : un `get RDOGetBudget` ou `get NetProfit` que le Model Server met plus
de 10 s à servir, l'IS abandonne, **puis la réponse arrive et est jetée** (`Ignored result: <rid>
RDOGetBudget="@…"`). C'est une **lenteur du modèle sur un chiffre financier**, chez `lord kaio`
(`sel 298805160`) dans la quasi-totalité des cas. Ni notre fait, ni un défaut de trame. Le rapport
live avait raison de le classer bruit ambiant ; on peut maintenant dire *pourquoi*.

**Observation transversale, utile au projet.** Le client de référence émet couramment `"^"` sur
`RDOGetObjectsInArea`, `RDOSegmentsInArea`, `RDOSetSecurityLevel`, `RDOPickEvent`,
`RDOContextStatusText`, `RDOAccountStatus`, `RDOGetTycoon`, `RDONewTycoon` — **toutes des
`function`**, jamais une `procedure`. Le corpus de production confirme la règle du projet par
l'usage, sur 8 jours : **aucune trame `"^"` sur une `procedure` n'apparaît dans le trafic normal.**
À l'inverse, le Model Server pousse `call ModelStatusChanged "*" "#1"` **avec** un QueryId (il en
attend la réponse et journalise le timeout) : c'est exactement la forme `VOID_MEMBERS`,
**confirmée en production par le serveur lui-même**.

### 2.2 Model Server

| Jour | Lignes | Trou max | Redémarrages (`WORLD LOADED`) | Anomalies |
|---|---:|---|---:|---|
| 08-10 | 72 398 | 29 s | 0 | — |
| **08-11** | 61 728 | **3 h 00 min 17 s** (07:16 → 10:16) | 0 | **suspension du monde**, compteur continu (§1.3) |
| 08-12 | 70 297 | 30 s | 0 | — |
| 08-13 | 69 957 | 30 s | 0 | — |
| 08-14 | 68 376 | 30 s | 0 | 8 × `ISCnx … timed out` → **gel de l'IS** (§1.1) |
| 08-15 | 63 432 | 33 s | 0 | 26 × `ISCnx … timed out`, puis `ISCnx Error writing to socket` (10:10:09) |
| 08-16 | 88 168 | 23 s | 0 | — |
| 08-17 | 63 882 (jusqu'à 18:21) | **33 min 44 s** | **2** (16:26:19, 16:51:38) | voir §2.4 |

Cadence nominale ≈ 14–15 s. **Aucun `TimeWarp` sur toute la période** (le seul fichier `TimeWarp` du
serveur date du 2026-07-03). **Aucun transfert d'argent** (`Money` : 07-07 et 08-04 seulement).

### 2.3 Cache Server et Mail Server

- **Cache Server.** 9 fichiers en 6 semaines — journal d'événements, pas de heartbeat. Le fichier
  `Survival 26-08-17.log` **n'existait pas** lors de la préservation de 17:47 : il a été créé à
  16:24:19 puis complété à 16:46:05, deux `Start disconnecting: (PLANITIA.ms)` — le Cache Server
  voyant partir le monde à chacun de ses deux redémarrages. **Corrobore le §2.4 depuis un troisième
  processus.** À noter pour l'avenir : `Survival 26-08-01.log` porte 5 lignes
  `Error at: TRDOObjectServer.CallMethod "KeepAlive|GetPropertyList|Refresh|SetObject" (326)` —
  c'est **la forme d'exception RDO capturée**, celle qui manque au 14 août.
- **Mail Server.** Voir §4. Confirmé par la source : **journal d'erreurs pur** — les 23
  `Logs.Log('Survival', …)` de `MailServer.pas` sont **tous** dans une clause `except`. Deux
  fichiers en 6 semaines = deux jours d'échec, pas deux jours de vie.

### 2.4 Le 17 août avant nous : trois incidents en deux heures

Ce que la session live ne pouvait pas voir depuis sa fenêtre de 22 minutes :

| Fenêtre (UTC) | Événement | Preuve |
|---|---|---|
| **14:54:00 → 15:16:56** | **Gel de l'Interface Server, 22 min 56 s — signature d'étalon A intégrale** | IS : `LOGON SUCCESS: ClientViewId=119442196` (SPO_test3, 82.165.165.224) puis **plus rien** ; **aucune ligne `Clients`** pour cette session ; MS : `ISCnx … ModelStatusChanged` timeout à 15:06:30 et 15:06:43, `Start disconnecting: (ISCnx)` à 15:16:26 ; IS reprend à 15:16:56 |
| **15:18:51 → 16:26:19** | Model Server absent 67 min (33 min de silence puis injoignable) | MS : trou de 2024 s ; IS : `DA13…DA123 Cannot connect to Server: 158.69.153.134 Port: 7000`, en boucle de 15:52:49 à 16:09:57 |
| **16:26:19 et 16:51:38** | **Deux redémarrages complets du monde** | MS : compteur remis à 1, `WORLD LOADED` ×2 ; IS : débranchement en masse de `DA`…`DA11` à 16:46:05 ; Cache Server : 2 × `Start disconnecting: (PLANITIA.ms)` |

**Notre run de gate (17:45:18 → 17:45:34) et la sonde S1 (18:02 → 18:03) ont eu lieu ~1 h après le
second redémarrage, sur une plateforme fraîchement relancée.** Le « 0 anomalie IS dans la fenêtre »
du rapport live reste vrai — il est simplement à lire avec ce contexte.

> **Le gel de 14:54 est le fait le plus important de ce rapport.** Il porte la signature complète de
> l'étalon A, il est survenu **le 2026-08-17**, sur le build de production `63d9eb0b`, depuis
> `82.165.165.224` — **ce n'est pas la suite de conformité** (notre IP de sortie, 88.167.51.32,
> n'apparaît qu'à 17:44:39). La signature est identique ; **la cause n'est pas établie** — un
> interblocage ou une faute dans un fil de service produit le même silence qu'un `"^"` sur une
> `procedure`. Ce que le journal établit, c'est que **l'Interface Server de production se gèle
> encore, et pas seulement sous nos sondes.**

---

## 3. Verdicts sur les deux points ouverts du 17 août

### 3.1 `EXCEPTION creating Tycoon: Unspecified error` (15:56:31) — **expliquée, et ce n'est pas nous**

**Attribution : pas nous.** `Clients 26-08-17.log` montre nos deux seules sessions, depuis
**88.167.51.32**, à 17:44:39 et 17:45:18. Toutes les sessions `SPO_test3` de l'après-midi viennent de
**82.165.165.224** (la même IP que `Crazz` à 14:46 — le poste du développeur). La dernière s'est
terminée à 15:55:07 ; la tentative de 15:56:18 arrive 71 s après. **Établi par exclusion d'IP ;**
l'IP exacte de la tentative n'est pas journalisée (un `LOGON FAILED` n'écrit pas de ligne `.IP =`).

**Cause : le Model Server était injoignable.** Séquence exacte, toutes les trames partant sur
`sel 0` — le proxy monde était mort :

```
15:56:06  call RDOAccountStatus "^" "%SPO_test3","%test3"   → Query timed out (10 s)
15:56:18  call RDOGetTycoon     "^" "%SPO_test3","%test3"   → Query timed out
15:56:18  - ERROR calling RDOGetTycoon: Unspecified error
15:56:20  - ValidAccount=TRUE
15:56:30  call RDONewTycoon     "^" "%SPO_test3","%test3"   → Query timed out
15:56:31  - EXCEPTION creating Tycoon: Unspecified error
15:56:31  - LOGON FAILED: TycoonProxyId = 0
```

C'est un symptôme de la panne MS de 15:18→16:26 (§2.4), pas un défaut propre.

> **Constat de conception à verser au dossier, non demandé mais gênant.** Quand `RDOGetTycoon`
> échoue — **y compris pour une raison d'infrastructure** (timeout, MS injoignable) — l'Interface
> Server ne distingue pas « le tycoon n'existe pas » de « je n'ai pas pu demander ». Il valide le
> compte (`ValidAccount=TRUE`) puis enchaîne sur **`RDONewTycoon`**, c'est-à-dire une **création de
> compte de jeu**. Ici la création a échoué elle aussi, faute de MS. Si le MS était revenu dans
> l'intervalle de 12 s séparant les deux appels, un joueur existant se serait vu créer un tycoon
> neuf. Constat serveur, hors de notre code — mais il conditionne toute politique de reconnexion
> agressive côté client. **`blocked:server`, à porter au backlog.**

### 3.2 Les « deux heures de silence » — **il n'y en a jamais eu**

**Le journal est complet et il n'a pas bougé.** Re-téléchargé ce jour à 18:21 UTC :
`Survival 26-08-17.log` fait 64 428 octets et est **byte-identique** à la copie préservée
(`cmp` : aucune différence). Sa dernière ligne est `5:45:34 PM - End Disconnecting`.

**L'écart de deux heures était un artefact de fuseau.** La préservation datée « 19:47 » l'a été à
**19:47 CEST = 17:47 UTC**, soit **2 min 26 s** après la dernière ligne du journal — pas deux heures.
Le poste est en UTC+2, les serveurs écrivent en UTC.

**Et il n'y avait rien à écrire après 17:45:34.** L'IS `Survival` ne journalise que les logons et les
déconnexions ; toute l'activité postérieure de la session live — l'appel erroné de 17:58:30 et la
sonde S1 de 18:02–18:03 — est en **transport C (HTTP/ASP)**, qui ne touche pas l'Interface Server.
Aucun autre joueur ne s'est connecté depuis. À 18:21 UTC, 36 min plus tard, le fichier n'avait
toujours pas grandi.

**Verdict : fin d'activité IS, pas latence du listing IIS, pas troncature.** Le listing IIS est à
jour — il a d'ailleurs révélé deux fichiers créés *après* la préservation :
`FIVEINTERFACESERVER/Demolition 26-08-17.log` et `FIVECACHESERVER/Survival 26-08-17.log`.

> **Faux ami à consigner : la catégorie `Demolition` n'est pas la démolition de bâtiments.**
> `AsxCriticalSections.pas:49-52`, `Accounts.pas:191`, `Events.pas:77` — c'est un **destructeur
> Delphi générique** qui journalise `ClassName`. D'où `IS/Demolition 26-08-17.log` =
> `TAsymetrixCriticalSection` ×2 à 16:46:07 (libération des verrous de connexion DA quand le monde
> est parti), et `MS/Demolition 26-08-17.log` = **354 × `TCircuit` entre 16:26:37 et 16:52:50** —
> les segments de route détruits par les **deux rechargements du monde**, aucun joueur en cause.
> **`E2E-LIVE-CAMPAIGN.md` §2.2 décrit cette catégorie comme « per demolished object » : à corriger.**
> Tel quel, l'oracle O4 de la ligne #3 (démolition) produirait des faux positifs massifs un jour de
> redémarrage.

---

## 4. Le Mail Server

### 4.1 `Error opening message 2691516090B1035AE` ×4 (2026-08-08) — lien **ÉCARTÉ**

L'hypothèse — un message ouvert jamais refermé par `readMailMessage`, donc verrouillé, donc
ré-ouvrable en vain — **est réfutée par la source, sur trois points indépendants.**

```pascal
function TMailServer.OpenMessage(WorldName, Account, Folder, MessageId : widestring) : OleVariant;
  begin
    path := GetAccountPath(WorldName, Account) + Folder + '\' + MessageId + '\';
    try
      Msg := TMailMessage.Load(path);   // ← seule instruction pouvant lever
      fMessages.Insert(Msg);
      result := integer(Msg);
    except
      result := 0;
      Logs.Log('Survival', … 'Error opening message ' + MessageId);   // MailServer.pas:867
    end;
  end;
```

1. **L'échec précède l'insertion.** La ligne n'est écrite que si `TMailMessage.Load(path)` lève —
   c'est-à-dire si `fHeaders.LoadFromFile(aPath + 'msg.header')` ou `fBody.LoadFromFile(…)` échoue
   (`MailServer.pas:955-963`). **Rien n'a jamais été ouvert.** Le message n'entre dans `fMessages`
   qu'en cas de succès, et dans ce cas aucune ligne n'est écrite.
2. **Il n'y a ni verrou ni exclusivité.** `OpenMessage` recharge le message **depuis le disque à
   chaque appel**, sans consulter `fMessages`. Une instance déjà présente et non refermée
   **n'empêche pas** un `OpenMessage` ultérieur d'aboutir. Le mécanisme causal supposé n'existe pas.
3. **Il y a un ramasse-miettes.** `TMailServer.CheckMessages` (`:886-907`) balaie `fMessages` et
   supprime tout `Msg.Expired(fMsgTimeout)` — `Expired` compare `Now - TimeOut` à `fLastUpdate`,
   rafraîchi par `KeepAlive` à chaque accès (`:988-1014`). **Une fuite de handle est reprise par
   expiration**, elle n'est ni permanente ni observable dans ce journal.

**Ce que la ligne signifie réellement :** les fichiers `msg.header` / `msg.body` du répertoire
`…\Inbox\2691516090B1035AE\` sont absents ou illisibles, tandis que le message figure encore dans une
liste d'inbox côté client. Quatre clics sur un message fantôme en 19 minutes.

**Notre `CloseMessage` défaillant est par ailleurs muet ici.** `CloseMessage(Id)` fait
`fMessages.Delete(TObject(Id))` et journalise `'Error deleting message.'` en cas d'exception
(`:843-852`) — **chaîne absente des deux fichiers du Mail Server**. Le défaut du lot 4 n'a donc, à ce
jour, **aucune trace en production**.

**Attribution : impossible.** La ligne ne porte ni compte, ni monde, ni IP — seulement le
`MessageId`. Et le 2026-08-08, `SPO_test3` **ne s'est pas connecté du tout** (0 occurrence dans
`IS/Survival 26-08-08.log`) ; la session la plus proche est `Innos`, terminée à 19:39:29, soit 78 s
avant la première erreur, et les deux dernières (19:59:09 et 19:59:14) tombent alors que **personne
n'est connecté**. À noter : `OpenMessage(WorldName, Account, Folder, MessageId)` **ne porte aucun
identifiant de session** — n'importe quel client RDO joignant le Mail Server peut ouvrir le message
de n'importe quel compte, sans authentification. Constat serveur, à verser au dossier sécurité.

> **Verdict : ÉCARTÉ.** Le mécanisme supposé n'existe pas dans la source. Ce qu'il faudrait pour
> trancher autrement — un accès au système de fichiers du Mail Server pour constater l'état du
> répertoire `2691516090B1035AE` — n'est pas à notre portée.

### 4.2 `Error checking for new mail of account SPO_test3@Planitia.net` (2026-07-03) — **notre défaut, en production**

C'est ici que se trouve la confirmation que la mission cherchait.

**La source borne la cause à une seule instruction.** Dans `CheckNewMail` (`MailServer.pas:533-575`),
le `try` externe ne contient qu'un seul point pouvant lever :

```pascal
World := TInterfaceServerData(ServerId).fOwner.fWorldName;   // ← transtypage de pointeur brut
```

- `GetAccountPath` (`Mail/MailUtils.pas:69-81`) est de la **pure concaténation de chaînes** — ne lève
  jamais.
- `FindFirst` sur un répertoire inexistant **retourne ≠ 0 sans lever** : le `repeat` ne s'exécute
  pas, `count := 0`, `result := 0`, **aucune ligne journalisée**. Un inbox manquant ne produit donc
  *pas* ce message.
- Chaque `Header.LoadFromFile` est dans un `try…except` imbriqué qui avale.

**Donc `Error checking for new mail` ⟺ `ServerId` n'était pas un `TInterfaceServerData` valide.**

**Et c'est exactement le défaut que notre code documente comme sien** —
[mail-handler.ts:401-404](../../src/server/session/mail-handler.ts#L401-L404) :

> « `CheckNewMail(ServerId: integer; Account: widestring)` dereferences `ServerId` as a
> `TInterfaceServerData` **POINTER** (`MailServer.pas:543`) — it MUST be the id returned by
> `LogServerOn`. **Passing 0 caused a server-side access violation and a constant −1 result.** »

**La corrélation temporelle est serrée.** `IS/Survival 26-07-03.log` porte 10 sessions `SPO_test3`
ce jour-là. L'une commence à **13:46:08** depuis **82.165.165.224** — l'IP du poste de développement,
et **la seule session de la journée depuis cette IP en journée** (les autres viennent de
176.146.90.5). L'erreur du Mail Server est datée **13:46:19**, soit **+11 s** : le délai exact d'un
`CheckNewMail` déclenché juste après le login pour afficher le compteur de non-lus.

> **Verdict : ÉTABLI au rang du mécanisme, PLAUSIBLE au rang de l'attribution.** Le message ne peut
> avoir qu'une cause, et cette cause est un défaut que notre dépôt reconnaît et a corrigé (la garde
> `if (!ctx.mailIntServerId) return 0` de [mail-handler.ts:411-414](../../src/server/session/mail-handler.ts#L411-L414)).
> Le journal ne nomme pas le client : c'est la corrélation IP + délai de 11 s qui porte
> l'attribution, pas une preuve directe. **Pour trancher complètement il faudrait le journal réseau
> de ce jour-là, qui n'existe plus.**

**Sur la coïncidence de date.** Le 2026-07-03 n'est pas la date de *déploiement* du build : c'est le
**jour zéro de l'installation entière**. Toutes les catégories de journaux ont un fichier `26-07-03`
et aucun antérieur — `TimeWarp`, `Demolition`, `ClassInfo`, `EOY`, `favorites`, Cache Server, Mail
Server. Le build `63d9eb0b` porte cette date parce que le serveur a été installé ce jour-là.
**Coïncidence d'installation, pas de causalité** — mais notre client était bien là, et c'est ce qui
compte.

### 4.3 La signature de gel prédite dans le Mail Server : **indétectable par ce journal**

`AddLine` (`MailServer.pas:140`, impl. `:993`) et `CloseMessage` (`:112`, impl. `:843`) sont bien des
`procedure` Delphi publiées, donc bien exposées au défaut `"^"`. Mais :

1. **Un gel dur n'écrit rien** (étalon A, §1.1) — l'absence de trace est *compatible* avec le
   diagnostic, elle ne le contredit pas.
2. **Le Mail Server n'a aucun heartbeat** — les 23 sites `Logs.Log` sont tous dans un `except`. Il
   n'y a donc **aucun trou d'horodatage à observer** : le détecteur du §1.1 (`ISCnx` côté MS) n'a pas
   d'équivalent ici, personne ne pousse périodiquement vers le Mail Server.
3. Le seul témoin possible serait `'Error deleting message.'` (exception *capturée* dans
   `CloseMessage`) — absent, mais un gel ne le produirait pas de toute façon.

> **Verdict : INDÉTECTABLE PAR CE JOURNAL.** Ni « présente », ni « absente ». Le Mail Server est le
> seul des quatre serveurs pour lequel nous n'avons **aucun oracle de vivacité**. Ce qu'il faudrait :
> une sonde de vivacité externe (un `idof "MailServer"` périodique), ou l'activation d'une catégorie
> de heartbeat côté serveur.

---

## 5. Ce que les journaux disent de l'urgence de déployer `main`

**L'Interface Server de production s'est gelé deux fois en quatre jours — le 2026-08-14 à 21:29 UTC
pour 12 h 41, et le 2026-08-17 à 14:54 UTC pour 23 min — le second sans aucune sonde de notre part,
sur le build `63d9eb0b` qui émet encore `"^"` sur trois `procedure` ; la cause du second n'est pas
établie, mais sa signature est celle du premier.**

---

## 6. Ce que le Model Server ajoute à la sonde S1

**La sonde S1 est journalisée côté modèle, nommément.** C'est l'oracle O4 que la session live
n'avait pas — elle ne disposait que d'O1 (ack HTTP) et O2 (relecture de la page).

| t live (UTC) | Geste | `MS/Survival 26-08-17.log` | Δ |
|---|---|---|---|
| 18:02:50.9 | `ModifyWarehouseStatus.asp?FluidId=Toys&Hire=YES` | `6:02:51 PM Initial suppliers, hire only warehouses: SPO_test3, Toys` | **+0,1 s** |
| 18:03:22.3 | `…&Hire=NO` (**annulation**) | `6:03:22 PM Initial suppliers, hire all: SPO_test3, Toys`<br>`6:03:22 PM Initial suppliers, hire all OK!` | **+0,0 s** |

Deux clés de jointure indépendantes dans la ligne elle-même — **le nom du tycoon et le nom du
fluide**. Bonus : `favorites 26-08-17.log` porte `5:45:32 PM "SPO_test3" Get "", "SPO_test3"`, notre
`RDOFavoritesGetSubItems` du run de gate, à la seconde.

**Ce que ça ajoute, et ce que ça n'ajoute pas.** Source : `Kernel/Kernel.pas:11735-11770`.

```pascal
procedure TTycoon.RDOHireOnlyFromWarehouse( FluidId : widestring );
  begin
    Logs.Log(…, ' Initial suppliers, hire only warehouses: ' + Name + ', ' + FluidId );  // :11739 — À L'ENTRÉE
    try
      AutoConnection := FindAutoConnection( FluidId );
      if AutoConnection <> nil then
        begin
          AutoConnection.fHireOnlyWarehouses := true;
          ModelServerCache.BackgroundInvalidateCache(self);      // :11746
        end;
    except  Logs.Log(…, ' Error in hire only warehouses..');  end;
  end;
```

1. **O4 prouve l'arrivée, pas l'effet.** La ligne est écrite **avant** le `try`, donc avant même
   `FindAutoConnection`. Et le `hire all OK!` de la branche inverse (`:11766`) est **hors** du
   `if AutoConnection <> nil` : il atteste « pas d'exception », pas « la connexion a été trouvée et
   modifiée ». **C'est un oracle de dispatch, exactement comme le `OK.` de la page ASP.** L'oracle
   d'effet reste O2, la relecture de `TycoonAutoConnections.asp`.
2. **Mais il prouve ce que le `OK.` de l'ASP ne pouvait pas** : que la trame RDO a atteint
   `TTycoon.RDOHireOnlyFromWarehouse` **sur le bon tycoon et avec le bon fluide**. La page imprime
   `OK.` inconditionnellement sans lire le résultat (`ModifyWarehouseStatus.asp:26-31`) ; le modèle,
   lui, nomme sa cible. **La chaîne complète appel → tycoon → fluide est désormais couverte.**
3. **La réserve du rapport live cesse d'être une prudence pour devenir un mécanisme.**
   `ModelServerCache.BackgroundInvalidateCache(**self**)` : l'invalidation est **explicite,
   par objet, et l'objet est le `TTycoon`**. C'est *pourquoi* la relecture à +0,6 s voyait la valeur
   neuve — et c'est aussi pourquoi le résultat **ne se transporte pas** au nœud de cache d'une
   installation. Une mutation de bâtiment invalide (ou non) le nœud de la `TFacility`, par un autre
   appel, à vérifier membre par membre. **La réserve du §5 S1′ du rapport live est confirmée par la
   source ; l'oracle O2 de la campagne mutation reste à sonder séparément.**

**Fraîcheur du cache — verdict inchangé, et c'est le bon.** Le rapport live réservait son résultat au
nœud tycoon. La source dit exactement pourquoi. Rien ici n'autorise à l'étendre.

**Deux observations de bord, non demandées, à ne pas perdre.**

- `MS/Survival 26-08-17.log` enregistre **`2:53:11 PM New Company: Magna Inc. TEST, SPO_test3, Magna`
  puis `2:53:13 PM New Company: Magna Inc. TEST, SPO_test3, Magna`** — **deux créations à 2 s
  d'écart, même nom, même cluster**. Or l'inventaire du rapport live (§3, `GetCompanyCount="#4"` à
  17:45) liste `Green`, `Yellow Inc. TEST`, `Blue Inc. TEST`, `Black Inc. TEST` — **`Magna` n'y est
  pas**. Une création dupliquée dont aucune des deux instances ne survit. `CompanyCreationModal.tsx`
  fait partie des fichiers modifiés non commités : **à instruire, pas à conclure ici.**
- `MS/Survival 26-08-17.log` porte 3 × `Error at: TRDOObjectServer.GetProperty (126)` entre 14:31:33
  et 14:32:10 — c'est la **forme d'exception RDO capturée** (même famille que le Cache Server du
  01/08). Elle démontre que ce canal *fonctionne* sur ce serveur, ce qui renforce le §1.1 : si le
  14 août l'IS n'a rien écrit, ce n'est pas parce qu'il ne sait pas écrire les exceptions.

---

## 7. Lignes à ajouter à `coverage-matrix.md`

**§1 — taxonomie `blocked:`, une entrée à ajouter :**

| Raison | Sens |
|---|---|
| `blocked:log-blind` | l'action n'a **aucun oracle O4** : aucune catégorie de journal exposée ne l'enregistre. Ni un manque du compte ni un défaut — une limite de l'instrumentation serveur. Cas connus : tout le transport C (ASP/IIS), l'annuaire (66.70.203.216, `/logs/` ne publie que les 4 catégories du monde), et **tout le Mail Server** (journal d'erreurs pur, sans heartbeat) |

**§2 — disponibilité des oracles, à corriger :**

| Oracle | Correction |
|---|---|
| **O4** | `Demolition` **n'est pas** un journal de démolition de bâtiment : c'est un destructeur Delphi générique (`AsxCriticalSections.pas:52`, `Accounts.pas:191`, `Events.pas:77`). 354 × `TCircuit` le 2026-08-17 proviennent de **deux rechargements du monde**, pas de joueurs. **O4 sur la ligne #3 est inutilisable sans filtre sur les fenêtres `WORLD LOADED`.** |
| **O4** | **Nouvel oracle disponible** pour les lignes #65/#66 : `MS/Survival` journalise `Initial suppliers, {hire only warehouses\|hire all\|include Trade Center\|excluding Trade Center}: <tycoon>, <fluide>` (`Kernel/Kernel.pas:11703-11766`). **Oracle de dispatch**, joignable par nom de tycoon **et** nom de fluide. |
| **O5** | **Réécrire.** « `Clients` exit code 0 » **ne détecte pas un gel** : une session gelée n'a **pas de ligne du tout** dans `Clients`. Le contrôle correct est : *(a)* le nombre de lignes `Clients` couvre chaque `LOGON SUCCESS` de la fenêtre ; *(b)* aucune ligne `<ISCnx> … Query timed out` ni `ISCnx Error writing to socket` dans `MS/Survival` ; *(c)* compteur intégrateur MS continu et aucun `WORLD LOADED` non attendu. |

**§3 — défauts vérifiés, deux entrées :**

| Réf | Constat |
|---|---|
| **D-3** | `Error checking for new mail` (2026-07-03 13:46:19) = **trace en production** du `ServerId` invalide passé à `CheckNewMail`. Cause unique établie par la source (`MailServer.pas:543` seul point levant du `try`). **Corrigé** — garde `mailIntServerId`, `mail-handler.ts:411-414`. Statut : `confirmé-live-corrigé`. |
| **D-4** | *(serveur, pas nous)* `RDOGetTycoon` en échec **d'infrastructure** fait enchaîner l'IS sur `RDONewTycoon` — création de compte de jeu sur un timeout. `blocked:server`, à porter au backlog. |

**§6 — statuts :**

| # | Ligne | Nouveau statut |
|---|---|---|
| 66 | Toggle only-warehouses (`ModifyWarehouseStatus.asp`) | **`nominal` + O4 acquis** — corrélé au modèle à +0,1 s, aller et retour (§6) |
| 65 | Toggle hire trade center | `nominal` par transitivité — **et O4 désormais disponible** (`include/excluding Trade Center`) |
| 3 | Démolition | **O4 requalifié** — `Demolition` ne distingue pas joueur et rechargement du monde |
| — | *(nouvelle)* toute ligne en transport C | **`blocked:log-blind`** pour O4 |

---

## 8. Trouvailles à porter à `analyse-ecarts-voyager-2026-08-16.md`

| Écart | Apport |
|---|---|
| **A-13** — fraîcheur du cache COM | La source **explique** le résultat live : `BackgroundInvalidateCache(**self**)`, invalidation explicite et **par objet**, `Kernel/Kernel.pas:11746` et `:11764`. La réserve « nœud tycoon seulement » passe de prudence à **mécanisme** : rien ne se transporte au nœud d'une `TFacility`. |
| **A-9** — transport C, oracles | Deux acquis : *(a)* le modèle fournit un **oracle d'entrée** nommé (tycoon + fluide) là où la page ASP ne fournit qu'un `OK.` inconditionnel ; *(b)* **aucun** oracle O4 n'existe pour l'échec — un HTTP 500 COM ne laisse aucune trace serveur (§1.2). L'absence d'effet, elle, est prouvable par l'absence de ligne `Initial suppliers`. |
| **A-9** — garde `if (!resp.ok)` | Confirmée dans les faits : le 500 `DISP_E_BADCALLEE` de 17:58:30 n'existe **que** côté HTTP. Sans cette garde, l'échec serait totalement silencieux, des deux côtés. |
| **Nouveau — A-14 (proposé)** | **Le gel de l'Interface Server est reproductible en production hors de nos sondes.** 2026-08-17 14:54:00 → 15:16:56, signature d'étalon A intégrale, depuis `82.165.165.224`. Cause non établie. Élève l'urgence de déployer `main`. |
| **Nouveau — A-15 (proposé)** | **Le corpus de production confirme la règle du séparateur par l'usage.** Sur 8 jours, Voyager n'émet `"^"` que sur des `function` ; le Model Server pousse `call ModelStatusChanged "*" "#1"` **avec** QueryId — la forme `VOID_MEMBERS`, attestée par le serveur lui-même. |
| **Nouveau — A-16 (proposé)** | **`OpenMessage` n'est pas authentifié** : `(WorldName, Account, Folder, MessageId)`, aucun identifiant de session. Tout client RDO joignant le Mail Server lit le courrier de tout compte. `MailServer.pas:854`. Constat serveur. |

**Correction de date à porter** (§1.1) : le gel est daté **2026-08-14 21:29:22 UTC**, non 2026-08-15.
Concerne `src/server/CLAUDE.md`, `report/rdo-audit-2026-08-14.md:13,49`,
`report/campaign/sondes-live-2026-08-16.md:135`.

**Correction à porter à `doc/E2E-LIVE-CAMPAIGN.md` §2.2** : la description de la catégorie
`Demolition` (« per demolished object … e.g. `TCircuit` road segments ») est fausse — voir §3.2.

---

## 9. Compétences employées

`delphi-archaeologist` — `Mail Server/MailServer.pas` (`OpenMessage` :854-870, `CheckNewMail`
:533-575, `CloseMessage` :843-852, `CheckMessages` :886-907, `TMailMessage.Load` :955-978,
`Expired` :1011-1014, recensement des 23 `Logs.Log`), `Mail/MailUtils.pas:69-81`,
`Kernel/Kernel.pas:11735-11770`, `Kernel/AsxCriticalSections.pas:49-52`, `Kernel/Accounts.pas:191`,
`Kernel/Events.pas:77`.
`rdo-conformity` — hiérarchie de preuve (capture > source), matrice QueryId × séparateur appliquée au
trafic de production, lecture des formes `"^"` / `"*"` observées.
`rdo-network-resilience` — timeouts DA/DSCnx/ISCnx, `ModelStatusChanged`, renouvellement de proxy,
politique de reconnexion face au piège `RDONewTycoon`.
`code-guardian` — §A pièges RDO (transtypage de pointeur brut `TInterfaceServerData(ServerId)`,
`TObject(Id)`), fichiers protégés, interdiction d'écrire sous `src/`.
`debugging` — construction des étalons avant l'interprétation ; distinction systématique entre
« absent », « présent » et « indétectable par ce journal ».

---

*Une corrélation n'est pas une cause. Les verdicts de ce rapport sont, dans l'ordre : **établi** —
gel du 14/08 et sa durée, signature de l'étalon A, gel du 17/08, mécanisme du Mail Server, absence
d'effet de l'appel erroné, corrélation S1 ↔ modèle, inexistence des « deux heures de silence » ;
**plausible** — attribution du gel du 14/08 à notre sonde (pas d'IP), attribution de l'erreur mail du
03/07 à notre client (IP + délai de 11 s) ; **écarté** — le lien `Error opening message` ↔
`readMailMessage` ; **indétectable par ce journal** — la signature de gel dans le Mail Server, la
cause du gel du 17/08, et tout événement du transport C.*
