# Parcours P8 — Service public : bascule de rôle, zonage et routes

> ✅ **Joué et capturé le 2026-08-18.** 152 échanges → `service-public-captured.scenario.ts`.
> `DefineZone`, `CreateCircuitSeg`, `WipeCircuit` — les trois acceptées (`res="#0"`).
> **Deux connexions monde dans une seule session** : le second `Logon` part sous
> `%Mayor of Helartia` alors que l'authentification annuaire reste `%SPO_test3` (**OB-13**).
> Procédure générale : [PROCESSUS-CAPTURE.md](../PROCESSUS-CAPTURE.md).

**Débloqué le 2026-08-18** : le développeur a fait passer le rôle de **Maire de Helartia** sur le
compte `SPO_test3`. Plus besoin d'un second compte — **les identifiants verrouillés de `CLAUDE.md`
restent en vigueur**, et l'écart envisagé (compte `Crazz`) est **annulé**.

Regroupe l'ancien P8 (routes) et l'ancien P9 (zonage), soumis à la même contrainte de rôle : les
zones sont réservées aux rôles de service public — Maire, Ministre, Président — et la possibilité de
poser des routes dépend des règles du serveur.

---

## Pourquoi ce parcours vaut plus que les autres

Ce n'est pas « les mêmes gestes avec plus de droits ». Choisir une compagnie à rôle fait prendre au
client une **branche entièrement différente** :

```ts
const needsSwitch = company.ownerRole && company.ownerRole !== ctx.storedUsername;
if (needsSwitch) { … REQ_SWITCH_COMPANY … }   // src/client/handlers/auth-handler.ts:132
```

Côté passerelle, `switchCompany` (`src/server/session/login-handler.ts:707`) **arrête le KeepAlive du
cacher, ferme tous les sockets sauf l'annuaire, et refait un login complet sous le nom du rôle**.

> **La capture contiendra donc deux séquences de connexion complètes dans une seule session
> passerelle.** Aucun scénario existant ne montre ça.

**Rien n'exerce ce chemin aujourd'hui** — `switchCompany` n'apparaît nulle part dans
`src/tools/conformance/`. C'est un **cycle de vie de session jamais capturé**, pas seulement quelques
membres RDO de plus.

---

## Ce qu'on va chercher

| Geste | Membres visés | État |
|---|---|---|
| Sélectionner Green | `EnableEvents`, `PickEvent`, `GetTycoonCookie`, `ClientAware` | déjà couvert — sert de point de comparaison |
| **Basculer vers le Maire** | **toute la séquence de re-login sous le rôle** | **jamais capturé** |
| Zoner | `defineZone` | jamais capturé |
| Poser puis démolir une route | `buildRoad`, `demolishRoad`, `getRoadCostEstimate` | jamais capturés |

---

## Avant

```bash
node scripts/dev-record.js service-public
```

Attendre la synchro (~2 min), puis **http://localhost:8080**.

`SPO_test3` / `test3` · **Free Space** · **planitia**.

**Les trois règles :** une seule charge de page · pas de promenade · **2-3 s de pause entre chaque
geste** — et ici c'est particulièrement utile, parce que la bascule est le moment que je voudrai
pouvoir isoler dans le journal.

---

## Geste 1 — Entrer par la voie normale

1. S'identifier `SPO_test3` / `test3`
2. Zone **Free Space**, monde **planitia**
3. **Choisir `SPO_test3 - Green`** — la compagnie ordinaire
4. Laisser la carte se charger et se stabiliser

> C'est le chemin déjà capturé trois fois. Il sert de référence : la même session va ensuite prendre
> l'autre branche, et la comparaison des deux dans un seul fichier est précisément ce qui manque.

## Geste 2 — Basculer sur le rôle de Maire ⭐

1. Rouvrir le sélecteur de compagnie
2. **Choisir la compagnie du Maire de Helartia**
3. **Attendre que tout se recharge** — sockets fermés, re-login, carte rechargée. Ne cliquez sur rien
   pendant ce temps, c'est la séquence que je veux propre.
4. Vérifier que vous êtes bien passé — le nom de la compagnie, la position de la caméra

> **Le moment le plus important des quatre parcours.** Si quelque chose doit mal tourner, c'est ici :
> une bascule laisse potentiellement des sockets à demi fermés. Si l'interface se fige ou affiche une
> erreur, **ne rechargez pas la page** — dites-le-moi. La capture aura enregistré exactement ce qui
> s'est passé, et c'est plus précieux qu'un parcours réussi.

## Geste 3 — Zoner

5. Ouvrir l'outil de zonage
6. **Définir une petite zone** sur un terrain libre de Helartia
7. Vérifier qu'elle apparaît

## Geste 4 — Poser puis démolir une route

8. Ouvrir l'outil de route
9. Si un coût s'affiche avant la pose, le laisser s'afficher — c'est `getRoadCostEstimate`
10. **Poser un court segment** — deux ou trois tuiles
11. Vérifier qu'il apparaît
12. **Le démolir** — la séquence redevient auto-réparante

> Si les routes restent interdites même au Maire, c'est une information : notez le message et passez.
> Le dépôt contient déjà `road-build-rejected-captured.scenario.ts`, un refus capturé sur le client
> d'origine — un refus de notre côté serait son pendant.

## Sortie

13. **Se déconnecter par l'interface**, puis dites-moi « fini ».

---

## Sécurité

Les trois exclusions du développeur restent compilées, et un rôle de service public a **plus** de
pouvoir qu'un compte ordinaire : suppression de compte, suppression de compagnie et régression de
niveau sont refusées par `FORBIDDEN_MEMBERS`, désormais branché sur **la passerelle elle-même**
(`spo_session.ts`, autorisation du 2026-08-18) et plus seulement sur l'outil de test.

## Si un geste est impossible

Passez au suivant et notez-le. Rappel de ce qu'on a appris : sur les six « impossibilités »
rencontrées jusqu'ici, **quatre étaient du comportement parfaitement correct** et deux étaient de
vrais manques. Décrivez ce que vous voyez, je vérifierai dans le code.
