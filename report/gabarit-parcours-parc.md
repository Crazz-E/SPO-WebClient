# Gabarit — parcours P6 « démolir puis reconstruire un parc »

**Pièce d'archive, pas du code vivant.** Extrait de `src/tools/conformance/sweep.ts:522-639`
et `:696-703` **avant la suppression du fichier** (lot R1, 2026-08-18). `sweep.ts` n'était pas
suivi par git : sans cette copie la séquence était perdue avec lui.

## D'où ça vient, et à quoi ça sert

C'est le **protocole dicté par le développeur le 2026-08-18** : démolir un parc, le reconstruire
au même endroit. Il devient le parcours **P6** du
[plan de certification rév. 4](plan-certification-rdo-rev4.md) §6, à écrire dans le lot **R4**,
quand `planitia` sera remonté.

Trois propriétés en font le gabarit de référence pour tous les parcours P5-P12 :

1. **Aucune trame fabriquée.** Chaque étape passe par `ctx.scenario(member, session => …)` sur de
   vraies méthodes de session — `fetchOwnedFacilities`, `focusBuilding`, `fetchBuildingCategories`,
   `fetchBuildingFacilities`, `deleteFacility`, `placeBuilding`. Séparateur, arité et types viennent
   du code de production. C'est exactement le principe de la rév. 4 : *ce que le client fait en
   production est sûr par construction*.
2. **La démolition PRODUIT le `(x, y)` que la construction consomme** — le choix des coordonnées
   n'a jamais à être fait.
3. **La classe est résolue AVANT de démolir quoi que ce soit**, et la séquence se déclare
   impossible sinon (`StepSkip`). Un parc qu'on ne saurait pas reconstruire, c'est du contenu
   détruit sur le compte de test — le motif exact des trois exclusions de `FORBIDDEN_MEMBERS`.

## Ce qu'il faut réimporter pour le ressusciter

```ts
import type { FavoritesItem, BuildingInfo, CompanyInfo } from '…/shared/types';
import type { ImperativeStep, Suite } from './types';
import { StepSkip } from './types';
```

L'état partagé était une clé de `SWEEP_STATE` ; en R4 elle devient une clé locale du fichier de
parcours :

```ts
const STATE = { facility: 'park:facility' } as const;

export interface FacilitySubject {
  x: number;
  y: number;
  name: string;
  visualClass: string;
  facilityClass?: string;
}
```

## Les cinq étapes, verbatim

```ts
/**
 * Demolish a park, rebuild the same park at the same place — dictated by the
 * developer on 2026-08-18.
 *
 * The demolition PRODUCES the `(x, y)` the construction consumes, so the choice
 * of coordinates never has to be made. What it does not produce is the class,
 * and the class is what `NewFacility` takes — so the sequence resolves it
 * BEFORE it demolishes anything and declares itself impossible otherwise. That
 * ordering is not caution for its own sake: a park we cannot rebuild is content
 * destroyed on the test account, which is the exact motive behind the three
 * exclusions ("would destroy all the content of the test account and prevent
 * further tests").
 *
 * `RDODelFacility(x, y : integer) : OleVariant` (`Kernel/World.pas:354`) is a
 * `function`, so `"^"` is its right form and its two integer arguments do not
 * freeze — a function pops the hidden result pointer. The freeze is `"^"` on a
 * **procedure** with two register arguments, nothing else.
 *
 * It runs on the **construction socket**, where `idof World` resolves `TWorld`
 * (`building-management-handler.ts:332-345`) — the class that publishes all
 * seven forbidden members. That is why the compiled refusal is not a precaution
 * for a future denominator: this sequence brings it into reach today.
 */
const PARK_PATTERN = /park/i;

const FACILITY_LOCATE: ImperativeStep = {
  id: 'locate',
  intent: 'locate the subject — `RDOFavoritesGetSubItems` on the account, then the first facility whose name matches /park/i',
  risk: 'read',
  run: async ctx => {
    const outcome = await ctx.scenario('RDOFavoritesGetSubItems', async session => {
      const owned: FavoritesItem[] = await session.fetchOwnedFacilities();
      const park = owned.find(o => PARK_PATTERN.test(o.name) && (o.x > 0 || o.y > 0));
      if (!park) {
        throw new StepSkip(
          `impossible — the account owns ${owned.length} facilities and none whose name matches /park/i has coordinates. `
          + 'The developer named a park specifically; demolishing anything else would be a different test.'
        );
      }
      const focus = await session.focusBuilding(park.x, park.y);
      ctx.state.set(SWEEP_STATE.facility, {
        x: park.x, y: park.y, name: focus.buildingName || park.name, visualClass: focus.visualClass,
      } satisfies FacilitySubject);
    });
    return outcome;
  },
};

const FACILITY_CLASS: ImperativeStep = {
  id: 'resolve-class',
  intent: 'resolve the facility class from the build catalogue (KindList.asp → FacilityList.asp) — `NewFacility` takes '
    + 'the class, and the demolition does not return it. Resolved BEFORE the demolition on purpose.',
  risk: 'read',
  run: async ctx => {
    const subject = ctx.state.get(SWEEP_STATE.facility) as FacilitySubject | undefined;
    if (!subject) throw new StepSkip('no subject — the locate step found no park');
    return ctx.scenario('FacilityList.asp', async session => {
      const company: CompanyInfo | null | undefined = session.currentCompany;
      if (!company) throw new StepSkip('no company selected — the build catalogue is per company');
      const categories = await session.fetchBuildingCategories(company.name);
      if (!categories.length) throw new StepSkip('KindList.asp returned no category — the catalogue is unreachable from here');
      let match: BuildingInfo | undefined;
      for (const c of categories) {
        const facilities = await session.fetchBuildingFacilities(
          company.name, c.cluster, c.kind, c.kindName, c.folder, c.tycoonLevel,
        );
        match = facilities.find(f => f.visualClassId === subject.visualClass)
          ?? facilities.find(f => f.name.trim().toLowerCase() === subject.name.trim().toLowerCase());
        if (match) break;
      }
      if (!match) {
        throw new StepSkip(
          `impossible — no catalogue entry matches visualClass "${subject.visualClass}" or name "${subject.name}". `
          + 'Demolishing without a rebuild path would destroy account content, so the sequence stops here.'
        );
      }
      ctx.state.set(SWEEP_STATE.facility, { ...subject, facilityClass: match.facilityClass } satisfies FacilitySubject);
    });
  },
};

const FACILITY_DEMOLISH: ImperativeStep = {
  id: 'demolish',
  intent: '`call RDODelFacility "^" "#x","#y"` on TWorld over the construction socket — a function, two integer '
    + 'arguments, no freeze (Kernel/World.pas:354). SLOW: a demolition crosses a simulation tick.',
  risk: 'mutation',
  run: async ctx => {
    const subject = ctx.state.get(SWEEP_STATE.facility) as FacilitySubject | undefined;
    if (!subject?.facilityClass) throw new StepSkip('no resolved class — refusing to demolish what cannot be rebuilt');
    return ctx.scenario('RDODelFacility', session => session.deleteFacility(subject.x, subject.y));
  },
};

const FACILITY_REBUILD: ImperativeStep = {
  id: 'rebuild',
  intent: '`call NewFacility "^" "%<class>","#<companyId>","#x","#y"` at the SAME coordinates — the demolition '
    + 'produced them, so no coordinate has to be chosen (TClientView.NewFacility).',
  risk: 'mutation',
  run: async ctx => {
    const subject = ctx.state.get(SWEEP_STATE.facility) as FacilitySubject | undefined;
    if (!subject?.facilityClass) throw new StepSkip('no resolved class — nothing to rebuild with');
    return ctx.scenario('NewFacility', session => session.placeBuilding(subject.facilityClass!, subject.x, subject.y));
  },
};

const FACILITY_VERIFY: ImperativeStep = {
  id: 'verify',
  intent: 'verify — `SwitchFocusEx` back on the coordinates: the park is standing again, or the reset owed to the developer is named',
  risk: 'read',
  run: async ctx => {
    const subject = ctx.state.get(SWEEP_STATE.facility) as FacilitySubject | undefined;
    if (!subject) throw new StepSkip('no subject — nothing to verify');
    return ctx.scenario('SwitchFocusEx', session => session.focusBuilding(subject.x, subject.y));
  },
  expect: { kind: 'pattern', value: /^res="%/ },
};

```

## La suite qui les assemble, verbatim

```ts
export const SWEEP_FACILITY_SUITE: Suite = {
  name: 'sweep-facility',
  description: 'The building sequence the developer dictated: demolish a park, rebuild the same park at the same place.',
  reset: 'the suite rebuilds what it demolished, at the coordinates the demolition produced and with the class resolved '
    + 'before it. If `rebuild` fails, the park must be rebuilt by hand — its (x, y), name and class are in the report, '
    + 'and `verify` is what says whether that is owed.',
  steps: [FACILITY_LOCATE, FACILITY_CLASS, FACILITY_DEMOLISH, FACILITY_REBUILD, FACILITY_VERIFY],
};
```

⚠ `assertSuitesSafe` s'exécute à l'import (`suites.ts`) : une suite qui porte un step
`risk: 'mutation'` **sans champ `reset`** fait exploser le CLI avant le parsing des arguments.
Le `reset` ci-dessus n'est pas décoratif.

## Ce qui a changé depuis, et qu'il faudra revérifier en R4

- Le `SWEEP_STATE` d'origine n'existe plus — remplacer par une clé locale (ci-dessus).
- La suite `connexion` du lot R3 devient le préfixe obligatoire de tout parcours ; P6 se branche
  derrière elle, pas devant.
- `deleteFacility` ouvre le socket `construction` et résout `TWorld` par `idof World`
  (`building-management-handler.ts:332-345`) — la classe qui publie les **sept**
  `FORBIDDEN_MEMBERS`. La garde `assertMemberNotForbidden` est donc à portée réelle ici, et
  depuis R2 elle est aussi branchée sur le chemin de production (`spo_session.ts`).
- **Non vérifié** (rév. 4 §12) : que `SPO_test3` possède un parc, ni sous quel nom de classe.
  P6 le découvrira ; s'il n'y en a pas, la séquence se déclare impossible avec sa raison typée
  et le run continue.
