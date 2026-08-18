# ✅ EXÉCUTÉ — Lot S2, déverrouillage du harnais

> Exécuté le 2026-08-18, neuf éditions livrées. **Une partie de ses livrables a été retirée depuis**
> par le lot R1 : le budget de 3 000 trames est revenu à 600, et l'opt-in `probe` sur
> `assertNotVoidPush` a été **supprimé** — c'est lui qui a laissé sortir la trame qui a cassé le
> serveur.
>
> ⚠ Son §6 porte la citation fautive `RDOObjectServer.pas:265-277` pour le caveat flottants ; les
> bonnes lignes sont **:255-263**.
>
> **Plan en vigueur :** [plan-certification-rdo-rev4.md](../../report/plan-certification-rdo-rev4.md).

---

# Lot S2 — Déverrouiller le harnais pour le balayage

**Session neuve. Modèle : Opus 5. Effort : `high`.** Aucun agent à lancer.

> **État de départ, à connaître.** J'ai commencé ce lot en session précédente puis **tout annulé**
> pour ne pas laisser un arbre rouge en travers d'une frontière de session. L'arbre est **vert**
> (15 suites, 211 tests). L'édition n°1 ci-dessous est **déjà écrite et validée** — elle est
> reproduite mot pour mot au §3, tu n'as qu'à l'appliquer. Deux tests figent l'ancienne croyance et
> tombent : leur réécriture est fournie aussi.

---

## Mission

Rendre le harnais de conformité capable d'émettre **le balayage** qui certifie les 217 membres RDO,
et les mutations. Neuf éditions, toutes localisées `fichier:ligne`.

**Cadre :** [report/plan-campagne-live-rdo.md](../../report/plan-campagne-live-rdo.md) **révision 3**,
§3 (le plan) et §4 (cette liste). Lis-le avant de commencer.

---

## 1. La découverte qui justifie tout le lot

**Le gel dépend du nombre d'arguments ÉMIS, pas de l'arité DÉCLARÉE.**

`RDOObjectServer.pas:214-218` lit `ParamCount` **du tableau variant reçu**, jamais de la déclaration
Pascal. Le 1ᵉʳ argument part dans `EDX`, le 2ᵉ dans `ECX` ; `RegsUsed` n'atteint `MaxRegs = 3` — le
point où le pointeur de résultat caché est poussé sur la pile (`:281-292`) — **qu'au deuxième
argument registre**.

Donc **`call M "^"` à 0 ou 1 argument ne peut pas geler**, quelle que soit la déclaration de `M`.

Les deux bords sont **live-prouvés**, et la capture prime sur la source :

| Membre | Args émis | Résultat | Source |
|---|---:|---|---|
| `ClientAware` | 0 | `error 9` en 91 ms | sonde U1-a, 2026-08-16 |
| **`CloseMessage`** | **1** | **`error 9`, aucun gel** | `mock-server/scenarios/captured/mail-read-captured.scenario.ts:1011-1012` |
| `SayThis` | 2 | **gel**, 12 h 41 | production, 2026-08-14 |

C'est ce qui permet de sonder les 217 membres en `"^"` à 0 argument et de lire la réponse — `res=`
pour une `function`, `error 9` pour une `procedure` — au lieu d'adjuger 175 déclarations à la main.

---

## 2. Les neuf éditions

| # | Édition | Où | Coût |
|---|---|---|---|
| **1** | **`assertPacketSafe` mesure le mauvais axe** — corps fourni au §3 | `suites.ts:98-109` | petit |
| 2 | Drapeau `--allow-mutations` porté jusqu'à `refusalReason` | `runner.ts:61-63` + `cli.ts` | trivial |
| 3 | Élargir `SessionDriver` — liste au §4 | `types.ts:99-107` | petit |
| 4 | Catégorie de délai paramétrable sur `ctx.emit` | `runner.ts:111`, `:114` | trivial |
| 5 | `DEFAULT_FRAME_BUDGET` 400 → **3000** | `runner.ts:52` | trivial |
| 6 | Opt-in `probe` sur `assertNotVoidPush` — voir la réserve §5 | `rdo-request-guards.ts:117-125` | moyen |
| 7 | Écrire le `HaltRecord` sur `stoppedOnSilence` — l'attribution immédiate | `runner.ts:270` | petit |
| 8 | Corriger le message de refus, aujourd'hui faux | `runner.ts:61-66` | trivial |
| 9 | Passer `allowMutations` à la construction du runner | `run.ts:222-228` | trivial |

**L'édition 8 :** le message affirme *« settled live 2026-08-16: error 9; re-running buys nothing »*.
Ce n'est vrai que pour `ClientAware`. Le balayage rachète précisément ce que ce message déclare sans
valeur.

**L'inversion de polarité n'est PAS dans ce lot.** `if (!proc) return` laisse passer `"^"` sur tout
membre inconnu ; la fermer exige la liste des `function` prouvées, que seul le balayage produit.
C'est **S5**. Ne l'anticipe pas : tu casserais `GetTycoonCookie` (2 args, `"^"`, function légitime,
absente de `KNOWN_PROCEDURES`).

---

## 3. L'édition n°1, écrite et validée — à appliquer telle quelle

Remplace intégralement `assertPacketSafe` dans `src/tools/conformance/suites.ts` :

```ts
/**
 * The same check for one packet — the runner applies it to imperative emits too.
 *
 * ## The axis is the arguments EMITTED, not the arity DECLARED (fixed 2026-08-18)
 *
 * The dispatcher reads `ParamCount` from the variant array it received
 * (`RDOObjectServer.pas:214-218`), never from the Pascal declaration. The first
 * argument goes to `EDX`, the second to `ECX`; `RegsUsed` only reaches
 * `MaxRegs = 3` — the point where the hidden result pointer is pushed on the
 * stack (`:281-292`) — at the **second** register argument.
 *
 * So `call M "^"` with 0 or 1 argument cannot freeze, whatever `M` declares.
 * Both edges are live-proven, and the capture outranks the source:
 *
 * - `ClientAware`, 0 args  → `error 9` in 91 ms (probe U1-a, 2026-08-16)
 * - `CloseMessage`, 1 arg  → `error 9`, no freeze
 *   (`mock-server/scenarios/captured/mail-read-captured.scenario.ts:1011-1012`)
 * - `SayThis`, 2 args      → **froze the shared server**, 12 h 41 (2026-08-14)
 *
 * This is what lets a sweep put `"^"` on every unknown member at 0 arguments and
 * read the answer — `res=` for a function, `error 9` for a procedure — instead of
 * adjudicating 175 Pascal declarations by hand.
 *
 * A known procedure below the danger band still has to declare
 * `risk: 'variant-on-procedure'`: harmless, but the intent stays on the record.
 */
export function assertPacketSafe(packet: StepPacket, where: string, allowZeroParam: boolean): void {
  if (!emitsVariantId(packet)) return;
  const emitted = packet.args?.length ?? 0;
  const proc = KNOWN_PROCEDURES.get(packet.member);

  if (emitted >= 2) {
    // Danger band. A member we cannot name still passes here — the polarity is
    // inverted in S5, once the sweep has produced the list of proven functions.
    if (!proc) return;
    throw new Error(
      `${where}: refusing "^" on procedure ${packet.member} (${proc.declaration}) with ${emitted} ` +
      'emitted argument(s) — from the second the hidden result pointer goes on the stack ' +
      '(RDOObjectServer.pas:292) and a register-convention procedure never pops it. ' +
      'This froze the shared server on 2026-08-14.'
    );
  }

  if (proc && !allowZeroParam) {
    throw new Error(
      `${where}: "^" on procedure ${packet.member} (${proc.declaration}) with ${emitted} emitted ` +
      'argument(s) answers error 9 and does NOT freeze — but the step must say so: ' +
      'declare risk "variant-on-procedure".'
    );
  }
}
```

### Les deux tests qui tombent, et pourquoi c'est correct

`suites.test.ts` a un helper `call(member, separator?)` qui **n'émet aucun argument**. Deux tests
attendent donc un refus pour `SayThis` à **zéro argument émis** — exactement ce que la capture
réfute. Remplace le helper et les deux tests :

```ts
  const call = (member: string, separator?: string, args?: string[]) =>
    ({ verb: RdoVerb.SEL, action: RdoAction.CALL, member, separator, args });

  it('refuses "^" from the second emitted argument — the proven freeze', () => {
    expect(() => assertPacketSafe(call('SayThis', undefined, ['%a', '%b']), 't', true))
      .toThrow(/SayThis.*2 emitted argument.*froze/s);
    expect(() => assertPacketSafe(call('SetTycoonCookie', undefined, ['#1', '%c', '%v']), 't', true))
      .toThrow(/3 emitted argument/);
  });

  it('allows "^" at one emitted argument — capture-proven harmless', () => {
    expect(() => assertPacketSafe(call('CloseMessage', undefined, ['#42']), 't', true)).not.toThrow();
    expect(() => assertPacketSafe(call('AddLine', undefined, ['%line']), 't', true)).not.toThrow();
  });

  it('still makes a known procedure declare its intent inside the safe band', () => {
    expect(() => assertPacketSafe(call('AddLine', undefined, ['%line']), 't', false))
      .toThrow(/does NOT freeze.*variant-on-procedure/s);
  });
```

Et dans le test `a suite with "^" on SayThis cannot exist` : passer `['%d', '%m']` en arguments et
renommer en *« … with its two arguments … »*.

---

## 4. Les méthodes à ajouter à `SessionDriver`

Toutes vérifiées présentes sur `StarpeaceSession`. **Élargis membre par membre, pas en bloc.**

**Mutations RDO :** `cloneFacility` (:1350) · `manageConstruction` (:1521) · `upgradeBuildingAction`
(:1525) · `renameFacility` (:1529) · `deleteFacility` (:1533) · `buildRoad` (:1538) · `demolishRoad`
(:1546) · `wipeCircuit` (:1550) · `defineZone` (:2988) · `placeBuilding` (:3013) · `placeCapitol`
(:3017) · `setBuildingProperty` (:3048) · `savePlayerPosition` (:2683) · `connectFacilitiesByCoords`
(:780) · `sendChatMessage` (:2662) · `setChatTypingStatus` (:2666)

**Objets scratch du Cache Server** — idéaux pour une séquence mutative réversible :
`cacherCreateObject` (:1411) · `cacherSetObject` (:1428) · `cacherSetPath` (:1440) ·
`cacherGetPropertyList` (:1453) · `cacherCloseObject` (:1497) · `getObjectRdoId` (:1398)

**Mutations mail et ASP :** `composeMail` (:1100) · `saveDraft` (:1104) · `deleteMailMessage` (:1112)
· `executeBankAction` (:1141) · `executeAutoConnectionAction` (:1158) · `setPolicyStatus` (:1166) ·
`executeCurriculumAction` (:1170) · `politicsVote` (:1183) · `politicsLaunchCampaign` (:1187) ·
`politicsCancelCampaign` (:1191)

**Lectures manquantes qui sont des PRÉCONDITIONS de séquence** — sans elles aucune mutation bâtiment
n'est atteignable : `connectConstructionService` (:983, **obligatoire avant `placeBuilding`**) ·
`fetchBuildingCategories` (:3005) · `fetchBuildingFacilities` (:3009) · `fetchClusterInfo` (:2997) ·
`fetchClusterFacilities` (:3001) · `getRoadCostEstimate` (:1542) · `ensureMailConnection` (:1091) ·
`searchConnections` (:1195) · `fetchAutoConnections` (:1154) · `fetchPolicy` (:1162) ·
`fetchBankAccount` (:1137) · `fetchCompanies` (:1149) · `fetchTycoonProfile` (:1129) ·
`fetchProfitLoss` (:1145) · `fetchCurriculumData` (:1133) · `getResearchDetails` (:3057) ·
`executeRdo` (:1559 — **seule voie vers les sockets non-`world`** : map, mail)

---

## 5. Trois réserves, non négociables

**Je refuse le déguisement en `risk:'read'`.** `runner.ts:61` ne laisserait passer le balayage que
déclaré `read`. Ce serait **un mensonge au gate**, pas une sécurité contournée : falsifier la classe
de risque corromprait la comptabilité de la suite qu'on construit. Le chemin est le drapeau
`--allow-mutations`, qui déclare l'intention dans la ligne de commande et dans le rapport.

**`assertNotVoidPush` est une convention, `assertNotVariantOnVoidMember` est la garde.** `CLAUDE.md`
est explicite. Un opt-in `probe` sur la première est légitime ; **la seconde ne bouge pas**.

**`sendRdoRequest` n'est pas un trou à fermer** — c'est le moteur de `ctx.emit` (`runner.ts:114`) et
le seul chemin qui traverse le formateur, les gardes, les délais et le contrat `errorCode` de
production. Le fermer transformerait la suite en sonde qui se teste elle-même.

---

## 6. Pièges relevés, à ne pas redécouvrir

- **`assertSuitesSafe` s'exécute à l'import** (`suites.ts:342`). Une suite portant un step
  `risk:'mutation'` **sans champ `reset`** fait exploser le CLI entier **avant le parsing des
  arguments**. Écris le `reset` en même temps que le step.
- **`ctx.push` ne traverse AUCUNE garde** (`runner.ts:175-182` → `writeRdoFrame`) — ni
  `assertNotVoidPush`, ni `assertNotVariantOnVoidMember`. C'est le levier et le risque dans le même
  appel. Et il n'émet **pas de QueryId**, donc aucune réponse corrélée : il n'apprend rien pour un
  balayage.
- **`countParams` surestime pour les flottants.** `@CheckIfSingle`/`@CheckIfDouble` poussent
  **inconditionnellement sans incrémenter `RegsUsed`** (`RDOObjectServer.pas:265-277`).
- **`error 5` se lit « non publié », jamais « inexistant ».** `MethodAddress` ne voit que le
  `published`.

---

## 7. Contraintes

- Couverture **≥ 93 %** sur les lignes touchées ; tests co-localisés.
- `jest.config.js`, `rdo-types.ts`, `rdo.ts`, `spo_session.ts` sont **protégés** — si tu crois devoir
  les modifier, arrête-toi et explique.
- `npm run typecheck` et `npx jest --testPathPatterns conformance` **verts avant de rendre**.
- Ne commit pas, ne push pas. LF. Rapport **en français**.
- Ce lot touche la surface RDO : le gate réclamera une re-certification au prochain sync. Attendu.

---

## 8. Définition de « terminé »

- [ ] Les 9 éditions appliquées, chacune avec son test
- [ ] `assertPacketSafe` mesure les arguments **émis** ; les 4 tests de garde épinglent les deux bords
- [ ] Un `call M "^"` à 0 argument sur un membre **inconnu** passe — c'est le balayage
- [ ] Un `call M "^"` à 2 arguments sur une **procedure connue** est refusé
- [ ] La polarité n'a **pas** été inversée (c'est S5)
- [ ] typecheck + suites conformance verts

## 9. Compte rendu attendu

**(1)** ce qui est appliqué, édition par édition ; **(2)** ce que tu as dû changer par rapport à ce
prompt et pourquoi ; **(3)** les tests ajoutés ; **(4)** ce qui bloque S4 s'il reste quelque chose.

**Si quelque chose te paraît faux ici, dis-le plutôt que de l'appliquer.** Le lot L0 a corrigé deux
inexactitudes du sien, un panel de 11 agents a réfuté la révision 1 du plan, le lot A a invalidé
trois de ses chiffres, et un panel de 5 agents vient de rendre la révision 2 obsolète.
