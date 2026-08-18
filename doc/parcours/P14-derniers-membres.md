# Parcours P14 — Les derniers membres

> ✅ **Joué et capturé le 2026-08-18.** 392 échanges → `derniers-membres-captured.scenario.ts`.
> **8 membres visés sur 9**, et surtout la résolution d'**OB-7** : `ObjectAt "^" "#x","#y"` rend une
> vraie adresse d'objet RDO, que `ConnectFacilities` consomme — les 56 membres déclarés inatteignables
> ne le sont plus.
> Le refus de pose de route en joueur (`res="#22"`) puis son acceptation en maire (`res="#0"`) sont
> figés dans le même scénario (**OB-14**). **Trois `ClientView` dans une session.**
> Procédure générale : [PROCESSUS-CAPTURE.md](../PROCESSUS-CAPTURE.md).

**Le parcours de clôture.** Après lui il ne restera que le conditionnel (élection, pièce jointe) et
l'inatteignable (deux handlers sans interface, OB-8).

Cible : les 13 membres non capturés relevés le 2026-08-18. Ce parcours en vise **9**.

---

## ⚠ Le piège à connaître avant de commencer

Il existe **deux boutons de déconnexion** dans l'inspecteur, et ils n'ont pas le même statut :

| Geste | Membre émis | Statut |
|---|---|---|
| Retirer **une** ligne dans la liste des connexions | `RDODisconnectInput` / `RDODisconnectOutput` | ✅ `todo` — réversible |
| Bouton **« déconnecter tous les entrepôts / usines / magasins »** | `RDODisconnectFromTycoon` | 🚫 **`excluded:irreversible`** — dossier **#44** |

> **N'utilisez jamais le bouton groupé.** Il déconnecte tout d'un coup, et c'est précisément la ligne
> que vous aviez laissée en suspens. Le parcours ci-dessous passe uniquement par le retrait ligne à
> ligne.

---

## Avant

```bash
node scripts/dev-record.js derniers-membres
```

Synchro (~2 min), puis **http://localhost:8080**.
`SPO_test3` / `test3` · **Free Space** · **planitia** · **SPO_test3 - Green**.

**Les trois règles :** une seule charge de page · pas de promenade · 2-3 s de pause entre gestes.

---

## Geste 1 — Connexion d'entrepôt : retirer puis recréer ⭐

**Le geste le plus rentable du parcours.** Vous avez choisi un entrepôt, ce qui garantit que la
connexion aboutira — contrairement à P10 où tout était hors de portée.

1. Ouvrir l'inspecteur d'un **entrepôt** qui a déjà au moins une connexion
2. Ouvrir l'onglet des connexions
3. **Retirer UNE connexion** — la ligne, pas le bouton groupé
4. Vérifier qu'elle a disparu
5. **La recréer** — reconnecter la même source

> Visait `RDODisconnectInput`. **Ce qui a réellement été émis est `RDODisconnectOutput`** —
> l'entrepôt était connecté à un *client*, donc en sortie, pas en entrée :
> `RDODisconnectOutput "*" "%FreshFood","%886,1018,"`. La recréation est passée par
> `ConnectFacilities` du geste 2, pas par `RDOConnectInput`.
>
> `RDODisconnectInput` reste donc non capturé. Son jumeau passe par le même code
> (`setBuildingProperty`), le risque de divergence isolée est faible.

## Geste 2 — Connecter deux installations par coordonnées ⭐⭐

**Le geste le plus important de tous.** Si l'interface propose de connecter **une installation précise
à une autre** — par sélection d'un bâtiment cible, pas la recherche de fournisseurs de P10 — faites-le.

1. Depuis l'entrepôt, chercher l'action qui connecte à **une installation désignée**
2. Désigner une seconde installation
3. Valider

> Vise `ConnectFacilities`, et surtout **`ObjectAt`** : `connectFacilitiesByCoords`
> (`spo_session.ts:780`) est documenté *« Uses ObjectAt to resolve IDs, then ConnectFacilities »*.
>
> **`ObjectAt` est la piste d'OB-7** — le défaut où `SwitchFocusEx` ne rend pas d'adresse d'objet RDO,
> ce qui bloque 56 membres de l'inventaire. Voir comment le code résout réellement un bâtiment en
> objet adressable vaut à lui seul le parcours.
>
> Si ce chemin n'existe pas dans l'interface, **dites-le-moi** : ce serait un constat de plus
> (méthode serveur sans UI, famille OB-8).

## Geste 3 — L'onglet des sorties

1. Sur une installation **productive** (pas l'entrepôt — une usine, une ferme)
2. Ouvrir l'onglet **sorties / produits**
3. Laisser charger

> Vise `GetOutputNames`. On n'a jamais fait que les entrées.

## Geste 4 — Le détail d'une invention

1. Ouvrir l'arbre des inventions
2. **Ouvrir le DÉTAIL d'une invention — sans la lancer**

> C'est le geste manqué de P12 : vous aviez lancé la recherche au lieu d'en consulter le détail.
> Vise `RDOGetInvPropsByLang` et `RDOGetInvDescEx`, sur le socket `construction`.

## Geste 5 — Route : poser puis démolir en un point

1. Poser un **court segment** de route
2. **Le démolir en cliquant un point précis** — pas la démolition de zone

> En P8 la démolition passait par `WipeCircuit`. Ici on vise `BreakCircuitAt`, l'autre chemin.

## Geste 6 — Créer une compagnie *(en dernier, volontairement)*

1. Ouvrir la création de compagnie
2. **Créer une compagnie** — un nom reconnaissable, par exemple `SPO_test3 - Capture`
3. Laisser la création aboutir

> Vise `NewCompany`. **Placé en dernier parce qu'il change l'état durable du compte** : la compagnie
> restera, et la suppression de compagnie fait partie de vos trois exclusions compilées — elle ne
> pourra donc pas être défaite par l'outil.
>
> Si la création bascule automatiquement la session sur la nouvelle compagnie, laissez faire : ce
> serait une seconde occurrence de la séquence de bascule, et c'est une bonne chose.

## Sortie

**Se déconnecter par l'interface.** Puis dites-moi « fini ».

---

## Ce que ce parcours ne peut pas atteindre

Inutile de les chercher, ils sont déjà consignés :

- **`RDOVoteOf`** — attend une élection ouverte (avec P11).
- **`GetAttachment`** — attend un courrier avec pièce jointe.
- **`GetChannelInfo`** et **`Save`** (brouillon mail) — deux des sept handlers vivants qu'aucune
  interface n'appelle. **OB-8** : ils ne seront capturables que le jour où l'UI les expose.

## Si un geste est impossible

Passez au suivant et décrivez ce que vous voyez. Sur les sept « impossibilités » rencontrées jusqu'ici,
**cinq étaient du comportement parfaitement correct** — ne présumez pas d'un bug, je vérifierai dans
le code.
