# Annexe — lot MOYENNES / BASSES de l'audit RDO 2026-08-14

> **Statut : ACTIF.** Annexe de [rdo-audit-2026-08-14.md](rdo-audit-2026-08-14.md), produite par le
> lot **L0-a** du [plan de remédiation](plan-remediation-rdo-2026-08-14.md).
>
> Le §1 du rapport principal chiffrait « 6 MOYENNES + 6 BASSES protocolaires, 1 MOYENNE + 6 BASSES
> opérationnelles » (19) **sans les énumérer nulle part**. Cette annexe les reconstitue.
> **Compte réel : 25** — 6 M + 8 B protocolaires, 3 M + 8 B opérationnelles. Le compteur des
> moyennes protocolaires du rapport tombe juste ; les trois autres étaient sous-estimés, surtout
> sur l'axe opérationnel où deux constats structurels (O-M1, O-M3) n'apparaissaient sous aucune forme.
>
> Les 14 constats déjà documentés (P-C1, P-H1–3, O-H1–3, M-A–E, angles morts §7) ne sont pas
> recomptés. Les divergences acceptées `rdo-session-lifecycle.md` §9 (D1–D4) ont été vérifiées et exclues.

**Re-vérifié par le rédacteur** (lecture directe du source) : **P-M2**, **P-L4**, **O-M1**. Les autres
sont rapportés avec leur citation d'origine.

---

## 1. Les quatre requalifications de sévérité

L'auditeur classe quatre constats au-dessus de leur rang nominal. Deux changent l'ordre du plan.

### P-M2 → 🔴 CRITIQUE — seconde injection de trame, **pré-authentification, en ASCII pur**

✅ **vérifié par lecture directe.** `src/server/rdo.ts:414-417` :

```ts
const knownPrefixes = Object.values(RdoTypePrefix) as string[];
if (knownPrefixes.includes(cleaned.charAt(0))) {
  return `"${cleaned}"`;        // ← aucun échappement des " internes
}
```

Si le premier caractère d'un argument brut est l'un des sept préfixes RDO (`# $ ^ ! @ % *`), la
valeur est renvoyée entre guillemets **sans que ses `"` internes soient doublés**. La branche de
repli `:426` (`RdoValue.string(cleaned).format()`) échappe correctement, elle — seule la branche
préfixe court-circuite la protection.

**Atteignable avant toute authentification** ✅ vérifié : `session/login-handler.ts:198` et `:202`
passent `username` et `pass` en **chaînes brutes** dans `args`. Une valeur de la forme
`$a"; C sel 1 call Evil "*" "` produit deux trames RDO valides sur la socket annuaire.

**Ce constat est indépendant de P-C1 et lui survit.** P-C1 exige un point de code hors Latin-1 et une
collision d'octet de poids faible ; P-M2 n'exige qu'un `$` et un `"`, tous deux ASCII. **Le codec
CP1252 du lot L1 ne le referme pas.** Deux failles distinctes au même point d'étranglement.

Autres sites passant des arguments bruts : `login-handler.ts:291,360,371,1059`,
`chat-handler.ts:116,137`, `spo_session.ts:1370,1397,1409`,
`building-details-handler.ts:1238,1425`.

**Correctif :** ré-échapper dans la branche préfixe (`replace(/"/g, '""')`), **ou mieux** —
n'accepter que des `RdoValue` dans `packetData.args` et supprimer la notion d'argument brut.

> **✅ CORRIGÉ — lot L2, 2026-08-15.** Les deux approches ont été retenues : emballage `RdoValue`
> aux call-sites atteignables par saisie utilisateur, **et** point d'étranglement sûr dans
> `formatTypedToken`. Byte-identité prouvée sur un corpus de 27 entrées légitimes.
>
> **Trois vecteurs supplémentaires découverts pendant le correctif, absents de ce constat :**
> 1. **La branche `rdo.ts:400-405`** (`startsWith('"') && endsWith('"')` + préfixe → `return val`)
>    était **tout aussi injectable** : `"%evil" call Evil "*" "` commence et finit par un guillemet
>    et exhibe un préfixe `%`, donc repartait verbatim. Ce constat n'incriminait que `:414-417`.
> 2. **`packet.targetId`** est concaténé **sans guillemets** pour `sel`, et `handleRdoDirect` le
>    relaie brut depuis le navigateur : `42 call Evil "*" "` était une sous-commande. Verrouillé
>    en décimal. Le nom d'`idof`, lui, était inséré entre guillemets sans doubler les siens.
> 3. **`packet.separator`** acceptait n'importe quelle valeur via `replace(/"/g,'')`. Restreint
>    aux deux `ReturnMarker` de la grammaire (`^`, `*`).

### P-M3 → 🟠 HAUTE — `error N` est résolu comme un succès, sur 93 sites d'appel

`sendRdoRequest()` ne rejette que sur timeout. Une réponse `A<rid> error 9;` **résout** la promesse,
`errorCode` renseigné. Or **aucun des 93 sites d'appel ne lit `packet.errorCode`** — les seuls
consommateurs sont `executeWithRetry` et `checkMaintenanceMode`.

Ce n'est pas un défaut de handler mais **un contrat de couche absent**. M-B et M-E, tous deux
vérifiés et classés MOYENS dans le rapport principal, en sont deux instances parmi 93. Les corriger
un par un reconstruit le même bug quatre-vingt-onze fois.

**Conséquence sur le plan :** décision d'architecture à prendre **avant** le lot L5.

### P-M1 → 🟠 HAUTE — `RDOSearchKey` détruit son motif de recherche

`login-handler.ts:291` émet `args: ['*' + searchStr + '*']`. `formatTypedToken` voit `*` en tête,
part par la branche préfixe et écrit `"*<motif>*"`. Côté Delphi, `TypeId = VoidId` ⇒
`Result := Unassigned` (`RDOUtils.pas:351-352`) : **le motif est détruit avant d'atteindre la
méthode**. Octets attendus : `"%*<motif>*"`. Le tableau de sévérité du projet classe explicitement
« mauvais préfixe de type » en HAUTE, et `VoidId` est le seul préfixe dont la sémantique Delphi est
*détruire la valeur*. Correctif : une ligne.

> **✅ CORRIGÉ — lot L2, 2026-08-15.** Octets désormais `"%*<motif>*","%"`.
> **Rectification de ce constat :** le second paramètre (`ValueNameList`) était **déjà** passé par
> le code (`args: [..., '']`) — seul le préfixe du premier était faux. Signature confirmée par
> lecture directe : `RDOSearchKey(SearchPattern, ValueNameList : widestring)`,
> `Directory Server/DirectoryServer.pas:78`.

### O-M2 → 🟠 HAUTE — une requête serveur sans réponse immobilise un thread du serveur **partagé**

`spo_session.ts:2327-2352` ne répond qu'à `idof` d'objet **connu** et à `AnswerStatus`. Tout `idof`
d'objet inconnu se contente d'un `log.warn` (`:2339`), et toute autre requête serveur portant un
`rid` n'est **jamais** acquittée. Côté Delphi,
`WinSockRDOServerClientConnection.pas:252` : `WaitRes := WaitForSingleObject(theQuery.Event, TimeOut)`
— le thread appelant bloque jusqu'à expiration. Le client legacy, lui, répond toujours
(`ServerCnxHandler.pas:666-669`).

**Correctif :** répondre systématiquement — `A<rid> error 5;` (objet inconnu),
`A<rid> error 9;` (membre non géré).

---

## 2. Protocole — MOYENNES restantes

| Id | Constat | Fichier:ligne | Correctif | Effort |
|---|---|---|---|---|
| **P-M4** | `RdoValue.int/float/double` ne garantissent pas un littéral numérique : `Math.floor(NaN)` → `"#NaN"`, `1e21` → `"#1e+21"`, `Infinity` → `"#Infinity"`. Aucune validation à la frontière WS ; les coordonnées arrivent du JSON navigateur non validées. Delphi lève (`RDOUtils.pas:333-344`, `VarCast`) | `shared/rdo-types.ts:57-59, 78-87` 🔒 | `Number.isFinite()` + `Number.isSafeInteger` dans `RdoValue.int/float/double` | S |
| **P-M5** ✅ | `parsePropertyResponse` construit `new RegExp(\`${propName}\\s*=\\s*"…"\`, 'i')` : `propName` **non échappé** (métacaractères regex, cf. P-H3), **non ancré** (`XProperty="a" Property="b"` renvoie la valeur de `XProperty`) et insensible à la casse | `rdo-helpers.ts:151` | **CORRIGÉ 2026-08-15** : échappement, ancrage sur `(?:^\|[\s,])`, `i` retiré | XS |

> **Observation annexe découverte en corrigeant P-M5 — non traitée, hors périmètre.**
> Quand aucune propriété ne correspond, `parsePropertyResponse` tombe sur un repli « pour
> compatibilité ascendante » (`rdo-helpers.ts:209-220`) qui **retourne la charge utile nettoyée
> entière**. Un appelant demandant `Tax.Id` sur `Tax0Id="#5"` reçoit donc `Tax0Id="#5` comme s'il
> s'agissait d'une valeur, au lieu de rien. Le repli est **load-bearing** — des appelants passent
> une valeur nue sans nom de propriété — donc le changer demande de recenser les 60+ sites
> d'appel. À traiter séparément, avec la même méthode que P-M3 : mesurer d'abord.
| **P-M6** | Les préfixes `!` (SingleId) et `^` (VariantId) ne sont pas retirés à la lecture : les parseurs ne dépouillent que `[$#%@]`, et le dispatcher de push fait `replace(/^[%#@$]/,'')` en 7 endroits. Une propriété `single` reviendrait `!0.85` → `parseFloat` → `NaN`. Incohérent avec `cleanPayload` (7 préfixes). Quelle propriété est concrètement `single` : **[UNKNOWN]** → sonde U6 | `rdo-helpers.ts:155,164,166,198,203` ; `push-dispatcher.ts:159,160,186,203,220,221,250` | `RdoParser.getValue()` partout | S |

## 3. Protocole — BASSES

| Id | Constat | Fichier:ligne | Effort |
|---|---|---|---|
| **P-L2** | `RdoValue.variant()` exposé dans l'API alors que le serveur jette la valeur (`RDOUtils.pas:349-350`). Piège d'API, aucun site de production | `shared/rdo-types.ts:71-73, 270-271` 🔒 | XS |
| **P-L3** | Littéraux RDO construits à la main (`` `#${circuitId}` ``) — viole « ne jamais construire de chaîne RDO manuellement » et emprunte la branche non échappée de P-M2 | `session/road-handler.ts:339-344, 412+` | XS |
| **P-L4** | ⚠️ **`RdoCommand` ne sait pas produire la forme de référence `QueryId + "*"`** ✅ vérifié : `withRequestId()` force `this.separator = '"^"'` et écrase silencieusement un `.push()` précédent | `shared/rdo-types.ts:383-387` 🔒 | XS |
| **P-L5** | `RdoCommand.build()` perd des arguments sans avertir : en `get` ils sont ignorés, en `set` seul `rdoArgs[0]` est émis, un `set` sans arg produit `Prop=`. Non atteignable aujourd'hui — **[INFERRED]** latent | `shared/rdo-types.ts:406-424` 🔒 | XS |
| **P-L6** | Débordement du framer : au-delà de 5 Mo, `this.buffer = ''` jette **aussi les trames complètes déjà présentes** | `rdo.ts:49-53` 🔒 | S |
| **P-L7** | Réponse `A…` non parsable → paquet sans `rid` → **trame jetée en silence**, la requête attend ses 180 s complètes | `rdo.ts:125` + `spo_session.ts:2308-2319` | XS |
| **P-L8** | `redactRdoRaw` ne caviarde pas un mot de passe contenant `"` : la classe `[^"]*` s'arrête au `""` échappé ⇒ **mot de passe en clair dans le log** | `spo_session.ts:117-119` ; `rdo-helpers.ts:37` | XS |
| **P-L9** | Extraction du code retour incohérente : `/res="#(\d+)"/` (sans signe) vs `/res="#(-?\d+)"/`. Le résultat est correct par accident | `building-templates-handler.ts:588,590` vs `road-handler.ts:348` | XS |

## 4. Opérationnel — MOYENNES restantes

### O-M1 — le pool de connexions monde n'est **jamais peuplé** ✅ vérifié

`RdoConnectionPool.initialize()` n'est appelé **nulle part** en production (grep exhaustif :
uniquement dans son propre test). `initWorldPool()` ne fait que construire l'objet — 0 connexion —
tout en journalisant « World connection pool initialized » (`spo_session.ts:1626`), message trompeur.
`executeRdoRequest` se garde derrière `this.worldPool.size > 0` (`:2121`, `:2141`), condition
**définitivement fausse** ; et `getConnection()`, seul point qui ajoute une connexion, n'est appelé
qu'à `:2124` et `:2144` — **sous cette même garde**. Poule et œuf.

Conséquences : tout le trafic monde passe sur la socket primaire unique ; la divergence acceptée
**§9 D2 n'est pas en vigueur** ; `config.rdo.parallelAreaReads` pipeline sur une seule socket ;
`worldPoolSize` remonte 0 dans `getQueueStatus`.

**Décision requise** : activer le pool (**et alors corriger O-L1 d'abord**, sinon on transforme un
latent en actif) ou le retirer et mettre `doc/rdo-session-lifecycle.md` §9 D2 à jour.

### O-M3 — requêtes bufferisées sans échéance

Quand `isServerBusy` est vrai, `sendRdoRequest` empile **sans armer de timer** (`spo_session.ts:2063`).
Si le poll ServerBusy s'auto-arrête après 4 échecs consécutifs (`:1834-1843`) et qu'aucun push
`ModelStatusChanged` n'arrive, **rien ne peut plus remettre `isServerBusy` à faux** : jusqu'à
20 promesses ne se règlent jamais, les suivantes sont rejetées « buffer full ». Le legacy n'a pas
d'équivalent — il bloque sur `SendReceive` sous `ISProxyTimeOut` (`ServerCnxHandler.pas:329`)
— **[INFERRED]** : notre buffer est une invention sans échéance.
**Correctif :** armer `effectiveTimeout` dès la mise en buffer, et/ou relancer le poll quand le
buffer est non vide.

## 5. Opérationnel — BASSES

| Id | Constat | Fichier:ligne | Effort |
|---|---|---|---|
| **P-L1** | *(déjà nommé §4/O-H2)* Résultat de `RegisterEventsById` jeté. **Facette nouvelle : ce n'est pas isolé** — `selectCompany` ignore aussi les réponses de `set EnableEvents` et des deux `call PickEvent`. Combiné à P-M3, un `error N` sur `EnableEvents` (= plus aucun push) est indiscernable d'un succès | `login-handler.ts:1000-1009, 498-505, 509-516, 558-565, 1013-1032` | S |
| **O-L1** | La réponse à une requête serveur part sur la socket **primaire**, pas sur la connexion émettrice : `onData` du pool appelle `processSingleCommand('world', …)` en aplatissant l'identité. `theQuery` est **par connexion** côté Delphi (`WinSockRDOServerClientConnection.pas:227-252`). Latent tant que O-M1 tient ; **devient HAUT dès qu'on initialise le pool** | `spo_session.ts:1601-1610, 2333, 2346` | S |
| **O-L2** | Fuites de slot du pool : `assertNotVoidPush` lève **après** `getConnection()` sans `releaseSlot` ; `wrappedReject` ne libère jamais le slot et contient une instruction morte `resolve;` | `spo_session.ts:2124, 2163, 2175-2179` | XS |
| **O-L3** | **81 des 93 sites `sendRdoRequest()` n'indiquent aucune `TimeoutCategory`** alors que `src/server/CLAUDE.md` l'impose. Les lectures qui devraient être FAST (60 s) attendent 180 s | 93 sites | M |
| **O-L4** | `wsMs` déclaré pour les 5 catégories et **consommé nulle part**. Le commentaire affirme « Two layers must stay aligned: RDO (L3) < WS (L1) » — **la couche L1 n'existe pas** | `shared/timeout-categories.ts:15-16, 38-44` | XS |
| **O-L5** | La sonde ServerBusy **réimplémente** `sendRdoRequest` : échappe à `assertNotVoidPush`, au buffering, aux métriques et au log `RDO>>` | `spo_session.ts:1773-1811` | S |
| **O-L6** | Collision de QueryId au bouclage : `pendingRequests.set(rid, …)` **écrase** une entrée vivante sans `clearTimeout`. Exige ~65 536 requêtes dans la fenêtre — **[INFERRED]** non atteignable en session mono-utilisateur, dette | `spo_session.ts:2181, 2208` | XS |
| **O-L7** | `set EnableEvents` s'appuie sur l'auto-typage numérique implicite (`args: ['-1']` → `"#-1"`). Octets corrects, mais si l'auto-typage était désactivé pour SET comme il l'est pour CALL, l'activation des push tomberait en silence | `login-handler.ts:503, 1018` ; `building-management-handler.ts:140` | XS |

---

## 5.1 État au 2026-08-16 — ce qui reste ouvert

**23 des 25 constats sont fermés**, avec tests de régression. Deux restent, tous deux
délibérément, et pour la même raison : le correctif coûte plus que le défaut.

### O-L3 — 81 des 93 sites `sendRdoRequest()` sans `TimeoutCategory` — ⏸️ OUVERT

`src/server/CLAUDE.md` impose une catégorie explicite à chaque appel ; le défaut retombe sur
`NORMAL`. **L'impact réel est faible** : `NORMAL`, `SLOW` et `VERY_SLOW` partagent tous les
180 s d'`IS_PROXY_TIMEOUT_MS`, donc l'omission ne change rien pour eux. Le seul écart concret
est qu'une lecture qui devrait être `FAST` (60 s) attend 180 s avant d'échouer.

Rendre le paramètre obligatoire par le type touche 93 sites d'appel dans 15 fichiers, pour un
gain qui se mesure uniquement sur le délai d'échec. **À faire dans une passe dédiée**, pas au
milieu d'un lot de correctifs de conformité — le diff mécanique noierait les changements qui
comptent.

### O-L5 — la sonde ServerBusy réimplémente `sendRdoRequest` — ⏸️ PARTIELLEMENT TRAITÉ

La sonde réécrit à la main l'allocation de rid, l'écriture de trame, l'entrée
`pendingRequests` et le minuteur. Elle **doit** contourner la primitive : `sendRdoRequest`
refuse d'émettre tant que `isServerBusy` est vrai, et c'est précisément l'appel qui lève ce
drapeau.

**Traité :** l'allocation de rid est désormais partagée (`allocateRequestId`), sinon la sonde
aurait échappé à la garde anti-collision d'O-L6 — l'écart se serait creusé au moment même où
on le corrigeait ailleurs.

**Non traité :** elle échappe toujours à `assertNotVoidPush`, au contrat `errorCode` (P-M3),
aux métriques, et journalise `RDO>*` au lieu de `RDO>>`. Collapser le doublon demande un
drapeau « ignorer la garde busy » sur la fonction par laquelle **passe chaque appel RDO du
projet**. Ce n'est pas un changement à glisser en fin de lot.

---

## 6. Ce qui n'a pas pu être établi

- **[UNKNOWN]** Quelle propriété publiée est concrètement déclarée `single` (P-M6). `RDOUtils.pas:369-370`
  prouve que le serveur *peut* émettre `!` ; aucune capture n'en contient. → étendre la sonde **U6** à `!`.
- **[UNKNOWN]** Ce que fait `fDirMng.SearchKey('')` avec un motif vide (P-M1). Ne change pas le
  verdict : les octets émis sont faux quel qu'en soit l'effet.
- **[INFERRED]** L'`Unassigned` décodé pour un paramètre `widestring` devient `''` plutôt que de lever.
- **[INFERRED]** O-M3 : absence de buffer équivalent côté legacy, déduite sans lecture exhaustive.

*Fichiers legacy lus : `RDOUtils.pas`, `RDOProtocol.pas`, `WinSockRDOServerClientConnection.pas`,
`DirectoryServer.pas`, plus greps ciblés sur `InterfaceServer.pas` et `ServerCnxHandler.pas`.*

*Skills utilisées : `rdo-conformity`, `delphi-archaeologist`, `rdo-network-resilience`, `code-guardian`.*
