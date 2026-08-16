# Sondes live — session 2026-08-16

> Protocole : [sondes-live-U1-U6.md](sondes-live-U1-U6.md) · Harnais : `src/tools/rdo-probe.ts`
> Feu vert développeur donné en séance, avec **analyse obligatoire des logs serveur**.

**Cible :** planitia (`Root/Areas/America/Worlds`), compte E2E verrouillé `SPO_test3`.
**Fenêtres :** 10:03:21 → 10:03:27 UTC (U6, U4-a) et 10:52:20 → 10:52:25 UTC (U1-a).
**Horloge serveur ≈ UTC** (calibrée ci-dessous).
**Exécuté :** U6, U4-a, U1-a — **les trois tranchées**. **U2 : annulée définitivement.**

---

## 1. Résultat — les deux sondes sont tranchées

### U6 — le serveur émet-il du `$` (AnsiString) ? → **OUI**

| Trame | Réponse | Délai |
|---|---|---|
| `get UserName` | `UserName="$SPO_test3"` | 94 ms |
| `get MailAccount` | `MailAccount="$SPO_test3@Planitia.net"` | 90 ms |
| `get CompositeName` | `CompositeName="$SPO_test3"` | 90 ms |

Les trois propriétés `string` publiées sur `TClientView` (`InterfaceServer.pas:126, :127, :141`)
répondent avec le préfixe `$`. Cela **confirme** la lecture jusque-là `[INFERRED]` :
`GetProperty` traite `tkString, tkLString, tkWString` par la branche unique `GetStrProp`
(`RDOObjectServer.pas:96-97`), dont le résultat `string` devient un `varString` dans le `variant`,
que `GetStrFromVariant` sérialise en `StringId + …` (`RDOUtils.pas:376-377`).

**Conséquence :** aucune. Notre décodeur gère déjà `$` (`rdo-helpers.ts:98`, `RDO_PREFIX_STRIP`).
L'observation étant byte-exacte, elle passe au rang **preuve de capture** (hiérarchie §0) et est
promue dans [rdo-protocol-architecture.md §2.1.1](../../doc/rdo-protocol-architecture.md).

Ferme le premier `[UNKNOWN]` de l'annexe §6.

### U4-a — le serveur accepte-t-il un `@` fractionnaire ? → **OUI, séparateur `.`**

| Trame | Réponse | Lecture |
|---|---|---|
| `set RdoProbeU4="#1"` | `error 3 setting RdoProbeU4` | contrôle — harnais et oracle validés |
| `set RdoProbeU4="@1"` | `error 3 setting RdoProbeU4` | `@` entier accepté |
| `set RdoProbeU4="@1234.5"` | `error 3 setting RdoProbeU4` | **la réponse** — le littéral parse |
| `set RdoProbeU4="!3.14"` | `error 3 setting RdoProbeU4` | idem simple précision |

L'oracle est binaire par construction (`RDOQueryServer.pas:338-346`) : le littéral est parsé
**avant** toute écriture, dans un `try/except` qui produit un code distinct. `error 3`
(`errUnexistentProperty`, `RDOObjectServer.pas:176`) = le parsing a réussi et `SetProperty` a
refusé une propriété inexistante ; `error 4` aurait signifié l'inverse. Quatre `error 3` sur
quatre : **rien n'a été écrit, et tous les littéraux ont parsé.**

**Conséquence :** l'hypothèse d'un serveur en locale `,` — qui aurait fait perdre silencieusement
tout `@`/`!` fractionnaire que nous émettons — est **écartée**. `RdoValue.double()` et `.float()`
sont conformes. U4 close, aucun constat nouveau.

---

## 2. Analyse des logs serveur — corrélation exacte

Source : `http://158.69.153.134/logs/` (HTTP simple, `curl`). Instantanés avant/après dans
`report/campaign/logs-cache/2026-08-16/`.

**Calibration d'horloge.** Le dernier événement de la ligne de base était `3:43:24 AM` pour un
`mtime` de fichier `3:43 AM`, et le Model Server écrivait à `10:01 AM` pour un `10:00:39` UTC
observé côté client : **l'horloge serveur suit UTC**, à la seconde près. Les horodatages ci-dessous
sont donc directement comparables.

### Interface Server — `Survival 26-08-16.log` (1046 → 1975 octets)

```
10:03:23 AM - LOGON ATTEMPT: User=SPO_test3
10:03:23 AM - (Logon.7) Creating ClientView...
10:03:23 AM - Getting connection from DA pool...
10:03:23 AM - Connection obtained, binding TycoonProxy...
10:03:24 AM - LOGON SUCCESS: ClientViewId=7187732
10:03:24 AM SPO_test3.IP = 88.167.51.32
10:03:26 AM - Start Disconnecting SPO_test3
             (1) … (11)
10:03:26 AM - End Disconnecting
```

- **`ClientViewId=7187732` est exactement l'identifiant rapporté par le harnais.** Corrélation
  certaine, pas une inférence temporelle.
- Séquence de déconnexion complète `(1)`…`(11)` puis `End Disconnecting` : la session s'est fermée
  proprement, `endSession()` a fait son travail. Aucune `ClientView` laissée vivante.
- **Aucune exception, aucun `error`, aucun gel.** Le fichier se termine normalement.

### Model Server — `Survival 26-08-16.log` (994 156 octets)

```
10:03:23 AM - AccountsStatus
10:03:26 AM SleepTycoon: 37
10:03:26 AM Tycoon logged off: SPO_test3(37)
10:03:29 AM Check roads / Notification / SIM-Tycoons / SIM-Cloning / SIM-Spread / SIM-Collect / SIM-Facs
```

- `tycoonId 37` correspond au `tycoonId` de notre session. Logoff propre côté modèle aussi.
- **La boucle de simulation repart normalement 3 s après**, cycle complet. C'est l'observation qui
  compte : le serveur n'est ni gelé ni ralenti.
- `grep -icE "exception|access violation|error|fail"` sur **toute la journée** : **0**.

**Verdict logs : serveur sain avant, pendant et après. Aucun effet persistant.**

---

## 3. Deux acquis de bord

1. **Le pool DA de l'Interface Server, observé en direct.** Les lignes
   `Getting connection from DA pool... / Connection obtained, binding TycoonProxy...` confirment
   `InterfaceServer.pas:3230-3234` : l'IS prend **une** connexion dans son pool et la **lie à la
   `ClientView`** pour sa durée de vie. C'est l'archéologie sur laquelle repose le constat du pool
   monde de cette session (voir le rapport d'audit) — elle est maintenant appuyée par le log.

2. **L'instrumentation P-M3 fonctionne de bout en bout.** Les quatre `error 3` d'U4-a ont produit
   quatre lignes `[RDO-CONTRACT] would reject: RdoProbeU4 -> errUnexistentProperty (code 3)` avec
   compteur incrémental. Le mode observation est validé en conditions réelles — et ces quatre
   entrées sont les premières du recensement lisible sur `GET /api/rdo-error-contract`.

---

## 4. U1-a — exécutée sur feu vert, **tranchée**

**Fenêtre :** 10:52:20 → 10:52:25 UTC. Une trame, jamais répétée.

```
C <rid> sel 6942220 call ClientAware "^"   →   error 9      [91 ms]
```

`error 9` = `errIllegalFunctionRes`, levé à `RDOQueryServer.pas:484` : le serveur a **accepté** la
trame, **dispatché** l'appel, puis échoué à sérialiser un résultat inexistant. C'est l'oracle
principal prédit par la spec. **Aucun gel.**

### Le mécanisme est désormais encadré des deux côtés

| Membre | Params | Pointeur résultat caché | Observé | Date |
|---|---|---|---|---|
| `SayThis` | 2 widestrings | **sur la pile** — `RegsUsed` atteint `MaxRegs = 3` → `push edi` (`RDOObjectServer.pas:292`) | **gel du serveur** | 2026-08-15 |
| `ClientAware` | 0 | en registre — pile équilibrée | `A<rid> error 9;` en 91 ms | 2026-08-16 |

La seule variable est **où atterrit le pointeur**, et elle découle du nombre de paramètres.
`RDOObjectServer.pas:281-292` est confirmé par expérience, plus par lecture.

### Deux conclusions, et la seconde compte autant

1. **Le gel exige le pointeur sur la pile.** Le cas à 0 paramètre est sûr — ce qui rendait la sonde
   exécutable, et le confirme après coup.
2. **`"^"` sur une `procedure` reste une divergence de fil même sans gel.** La réponse est une
   **erreur**, jamais un ack : le site d'appel ne peut pas savoir si la procédure a tourné. Donc
   `VOID_MEMBERS` + `"*"` + QueryId reste la seule forme correcte pour **toute** procédure, quelle
   que soit son arité. L'arité change le rayon de dégât, pas le verdict.

Promu dans [rdo-protocol-architecture.md §2.1.0](../../doc/rdo-protocol-architecture.md) et cité
dans `assertNotVariantOnVoidMember`.

### Logs — corrélation

```
10:52:06 AM - Start Disconnecting rstlne30 … End Disconnecting   ← autre joueur, avant la sonde
10:52:22 AM - LOGON ATTEMPT: User=SPO_test3
10:52:23 AM SPO_test3.IP = 88.167.51.32
10:52:24 AM - Start Disconnecting SPO_test3 … (1)…(11) … End Disconnecting
```

Model Server : `Tycoon logged on/off: SPO_test3(37)` à 10:52:24, puis cycle de simulation complet à
10:52:29 (`SIM-Tycoons`, `SIM-Cloning`, `SIM-Spread`, `SIM-Facs`). **Zéro exception sur la
journée.** Un autre joueur était connecté au moment de la décision de tir ; il s'était déconnecté
proprement 14 s avant la trame.

Le mécanisme est fixé en **données** dans `U1A_EVIDENCE` (`src/tools/rdo-probe.ts`), avec des tests
qui mordraient si quelqu'un faisait converger les deux cas. Le message de refus du harnais énonce le
résultat et précise que la question est close : la sonde reste derrière `--allow-u1a`, non pas parce
qu'elle est inconnue, mais parce que c'est toujours une trame `"^"` sur une procédure et que la
rejouer n'apprendrait rien.

---

## 5. Note d'exécution — un défaut trouvé dans le harnais

Le premier lancement a rendu `World "planitia" not in the directory listing:` avec une liste
**vide**. Cause : `Root/Areas/Free Space/Worlds` n'existe pas. « Free Space » est un **libellé
d'interface** ; le chemin annuaire est `Root/Areas/America/Worlds`
(`WORLD_ZONES`, `shared/types/protocol-types.ts:85`).

L'échec est silencieux et mérite d'être retenu : l'annuaire ne renvoie pas d'erreur pour un chemin
inconnu, il renvoie une liste vide. Corrigé, constanté (`FREE_SPACE_ZONE_PATH`) et couvert par un
test de non-régression qui vérifie explicitement que le défaut n'est **pas** le libellé.

---

*Skills utilisées : `rdo-conformity`, `delphi-archaeologist`.*
