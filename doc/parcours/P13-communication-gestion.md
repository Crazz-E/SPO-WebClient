# Parcours P13 — Communication, favoris et gestion

> ✅ **Joué et capturé le 2026-08-18.** 240 échanges → `communication-captured.scenario.ts`.
> Pièce maîtresse : `SayThis "*" "%","%Test Message for Claude."` — le membre qui a gelé le serveur
> le 2026-08-14 sous `"^"`, ici dans sa forme juste (**OB-12**).
> A révélé **OB-10** (favoris en lecture seule) et **OB-11** (pas de rafraîchissement mail).
> Procédure générale : [PROCESSUS-CAPTURE.md](../PROCESSUS-CAPTURE.md).

**Une connexion, cinq gestes, une déconnexion.** Tout est réversible par vous-même.

Ce parcours vise les membres que les deux premières captures ont laissés de côté.

*Écrit avant P8, quand celui-ci semblait exiger un second compte. Il n'en a pas eu besoin : le rôle de
Maire a été porté sur `SPO_test3` le jour même, et P8 a été joué ensuite.*

---

## Ce qu'on va chercher, et pourquoi

| Geste | Membre visé | Pourquoi il compte |
|---|---|---|
| Envoyer un message de chat | **`SayThis`** | **Le membre qui a gelé le serveur partagé le 2026-08-14** — avec deux arguments sous `"^"`. Le client l'émet en `"*"`, la forme juste. Capturer ça fige la preuve que notre forme est la bonne. |
| Lister ses installations | `RDOFavoritesGetSubItems` | Jamais capturé — c'est pourtant la précondition de tout parcours bâtiment |
| Ajouter / retirer un favori | `RDOFavoritesNewItem`, `RDOFavoritesDelItem` | Domaine entier non couvert |
| Améliorer une installation | `RDOStartUpgrade`, `RDOStopUpgrade` | Non couverts, et réversibles |
| Écrire et supprimer un courrier | `composeMail`, `deleteMailMessage` | On n'a jamais fait que **lire** le courrier |

> **Aucun risque protocole.** Tous ces gestes passent par des méthodes du client, qui les émet déjà
> correctement en production. Et depuis le 2026-08-18, la garde `FORBIDDEN_MEMBERS` est branchée sur
> la passerelle elle-même, pas seulement sur l'outil de test.

---

## Avant

```bash
node scripts/dev-record.js communication
```

Attendre la synchro (~2 min, HTTP, ne pollue pas la capture), puis **http://localhost:8080**.

`SPO_test3` / `test3` · **Free Space** · **planitia** · **SPO_test3 - Green**.

**Les trois règles :** une seule charge de page · pas de promenade · **2-3 s de pause entre chaque
geste**.

---

## Geste 1 — Envoyer un message dans le chat

1. Ouvrir le panneau de chat
2. **Écrire et envoyer un message court** dans le lobby — quelque chose de neutre, il sera visible
   par les autres joueurs connectés
3. Vérifier qu'il s'affiche

> C'est le geste le plus intéressant du parcours. Écrivez quelque chose de banal : le message part
> sur un serveur partagé et restera dans le scénario.

## Geste 2 — Lister ses installations

1. Ouvrir la liste de vos installations — le panneau des favoris, ou la vue qui liste vos 41 biens
2. La laisser se charger complètement

## Geste 3 — Ajouter puis retirer un favori

1. **Ajouter un favori** — un emplacement ou une installation
2. Vérifier qu'il apparaît dans la liste
3. **Le retirer**

> Auto-réparant : vous défaites vous-même ce que vous venez de faire.

## Geste 4 — Améliorer une installation, puis annuler

1. Ouvrir l'inspecteur d'une installation **améliorable** (pas le parc — une usine, un commerce)
2. **Lancer l'amélioration**
3. Attendre la confirmation
4. **L'arrêter**

> Si l'amélioration coûte de l'argent que le compte n'a pas, le refus est une capture valide :
> notez le message et passez au geste 5.

## Geste 5 — Écrire un courrier et le supprimer

1. Ouvrir la messagerie
2. **Composer un message et l'envoyer à vous-même** (`SPO_test3`)
3. Revenir à la boîte de réception, le laisser apparaître
4. **Le supprimer**

## Sortie

**Se déconnecter par l'interface.** Puis dites-moi « fini ».

---

## Si un geste est impossible

Passez au suivant et notez-le. Une action indisponible, un bouton grisé, un refus serveur : tout ça
est une information, et elle ira dans [BACKLOG-OPEN.md](../BACKLOG-OPEN.md) comme les précédentes.

Rappel de ce qu'on a appris la dernière fois : **sur quatre « impossibilités », trois se sont
révélées être du comportement parfaitement correct.** Ne présumez pas d'un bug, décrivez ce que vous
voyez.
