# Session enchaînée — P6, P7, P10, P11, P12

> ✅ **Jouée et capturée le 2026-08-18.** 474 échanges, six sockets →
> `src/mock-server/scenarios/captured/parcours-enchaine-captured.scenario.ts`.
> Constats versés dans [BACKLOG-OPEN.md](../BACKLOG-OPEN.md) : un vrai défaut (OB-1), deux
> observations, et **trois « impossibilités » qui se sont révélées être du comportement correct**.

**Une connexion, cinq gestes, une déconnexion.** Une seule session, un seul `sid`, un seul fichier.

Le zonage et les routes sont **sortis de cette session** — ils exigent un compte à rôle de service
public, voir [P8-service-public.md](P8-service-public.md).

---

## Avant

```bash
node scripts/dev-record.js enchainee
```

Le build est à jour, inutile de repasser par `npm run dev:record`. Attendez la synchro
(~2 min, elle est en HTTP et ne pollue pas la capture RDO), puis **http://localhost:8080**.

Identifiants verrouillés : `SPO_test3` / `test3` · **Free Space** · **planitia** ·
**SPO_test3 - Green**.

---

## Les trois règles, inchangées

**Une seule charge de page.** Pas de F5. Si ça arrive, dites-le — on relance.

**Ne vous promenez pas** entre les gestes. Chaque panneau ouvert par curiosité entre dans le scénario.

**Deux à trois secondes de pause entre chaque geste.** Ça me donne une frontière temporelle nette dans
le journal si on veut découper la capture en scénarios séparés plus tard.

---

## Geste 1 — P6 · Démolir le parc et le reposer au même endroit

**C'est votre protocole, et il est auto-réparant** : la démolition produit le `(x, y)` que la
reconstruction consomme.

Le sujet est déjà là, posé lors de P5 :

| | |
|---|---|
| Classe | `DissSmallPark` |
| Coordonnées | **(982, 1014)** |
| Compagnie | `#134` — SPO_test3 - Green |

1. Naviguer jusqu'au parc en (982, 1014)
2. Le sélectionner
3. **Le démolir**
4. Attendre le rafraîchissement de la carte
5. **Le reposer au même endroit**, même classe (`DissSmallPark`)
6. Vérifier qu'il est revenu

> Si la repose échoue faute de fonds, **ne réessayez pas** — passez au geste 2 et dites-le-moi. On
> aura quand même capturé la démolition, ce qui est déjà un domaine non couvert.

## Geste 2 — P7 · Gérer une installation

Sur le parc, ou sur une autre de vos installations :

1. Ouvrir son inspecteur
2. **La renommer**
3. **Remettre le nom d'origine** — la réversibilité est manuelle ici, c'est vous qui la faites
4. Si un bouton d'amélioration est disponible, l'ouvrir **sans valider**, puis fermer
5. Fermer l'inspecteur

## Geste 3 — P10 · Connexions et approvisionnement

1. Ouvrir une installation qui a des entrées ou des sorties (pas le parc — une usine, un commerce)
2. Ouvrir l'onglet des connexions
3. Lancer une **recherche de fournisseurs**
4. Si un fournisseur est proposé, **le connecter**
5. Fermer

> Le parc n'a probablement ni entrée ni sortie. Choisissez une installation productive parmi vos 41.

## Geste 4 — P11 · Politique

1. Ouvrir le panneau politique
2. Parcourir les onglets disponibles — classements, villes, campagnes
3. Si un vote est ouvert, **voter**
4. Fermer

## Geste 5 — P12 · Recherche et inventions

1. Ouvrir l'arbre des inventions
2. Parcourir un ou deux onglets
3. **Ouvrir le détail d'une invention**
4. Fermer

> Lecture pure, bonne fin de session. Attention : ce parcours passe par le socket **`map`** (cacher),
> pas `construction` — c'est une correction établie par la recherche, et la capture le confirmera.

## Sortie

**Se déconnecter par l'interface**, pas en fermant l'onglet. Puis dites-moi « fini » — j'arrête la
passerelle, je lis la capture et je convertis.

---

## Si un geste est impossible

**Passez au suivant et notez-le.** Une action indisponible, un bouton grisé, un refus serveur : tout
ça est une information, et la règle du projet est de ne jamais écarter une ligne sur présomption —
une impossibilité n'existe qu'après une tentative, et elle remonte.

Ne forcez pas, ne réessayez pas trois fois : ça remplirait la capture de bruit.
