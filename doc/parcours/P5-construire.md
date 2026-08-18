# Parcours P5 — Construire

> ✅ **Joué et capturé le 2026-08-18.** 125 échanges → `construire-captured.scenario.ts`.
> `NewFacility "^" "%DissSmallPark","#134","#982","#1014"` → `res="#0"`.
> Constat : le **catalogue de construction n'est pas du RDO** (transport C) — seule la pose l'est
> (**OB-3**). Procédure générale : [PROCESSUS-CAPTURE.md](../PROCESSUS-CAPTURE.md).

**Premier parcours capturé de la boucle « l'IA dicte, l'humain joue, l'IA enregistre ».**
Domaine non couvert par les 7 suites existantes.

Objectif : mettre sur le fil la séquence complète de construction d'un bâtiment, telle que le client
la produit réellement, et en faire un scénario de non-régression.

---

## 0. Avant de commencer

| Vérification | État |
|---|---|
| Interface Server `planitia` sain | ✅ redémarré le 2026-08-18 à ~14:05:30 UTC, logons propres depuis |
| `.rdo-live/HALT` | ✅ levé |
| Identifiants | `SPO_test3` / `test3` · zone **Free Space** · monde **planitia** · entreprise **SPO_test3 - Green** |

**Ne changez aucun identifiant.** Ils sont verrouillés par `CLAUDE.md`.

---

## 1. Démarrer en mode capture

```bash
npm run dev:record -- construire
```

Le script construit, affiche le chemin du fichier de capture, puis démarre la passerelle sur le
port 8080. Laissez cette console ouverte : c'est elle qui écrit le journal.

---

## 2. Les trois règles de discipline

**Une seule charge de page.** Un rechargement ouvre une **nouvelle session passerelle** avec un
nouveau `sid`, et le convertisseur refusera ensuite de deviner laquelle vous vouliez. Si vous
rechargez par accident, ce n'est pas grave : arrêtez, relancez `npm run dev:record`, recommencez.

**Ne vous promenez pas.** Chaque panneau ouvert, chaque clic de curiosité produit des trames qui se
retrouveront dans le scénario. Suivez la liste, rien de plus. Si vous vous égarez, dites-le-moi — je
saurai le retrouver dans le journal, mais autant l'éviter.

**Notez l'heure approximative** de la pose du bâtiment (à la minute près suffit). Ça me permet de
recouper avec les journaux serveur si quelque chose se passe mal.

---

## 3. Le parcours

### Phase 1 — Entrer (obligatoire, toujours en premier)

1. Ouvrir `http://localhost:8080`
2. S'identifier : `SPO_test3` / `test3`
3. Choisir la zone **Free Space**
4. Choisir le monde **planitia**
5. Choisir l'entreprise **SPO_test3 - Green**
6. Attendre que la carte s'affiche et se stabilise

C'est la séquence opérationnelle : authentification → monde → connexion → entreprise → exploration.
Elle sera capturée avec le reste, et c'est très bien — elle est le socle de tous les parcours.

### Phase 2 — Trouver un emplacement

7. Se déplacer sur la carte jusqu'à un **terrain libre**, de préférence près de vos installations
   existantes (le terrain doit vous appartenir ou être constructible)
8. S'arrêter, laisser la vue se stabiliser

### Phase 3 — Ouvrir le menu de construction

9. Ouvrir le **menu de construction**
10. Laisser la liste des **catégories** se charger complètement
11. Choisir une catégorie, laisser la liste des **installations** se charger

> Côté RDO, ces deux chargements sont `fetchBuildingCategories` et `fetchBuildingFacilities`,
> précédés de `connectConstructionService` qui ouvre le socket dont la pose a besoin.

### Phase 4 — Poser

12. Sélectionner une installation — **prenez la moins chère de la catégorie**
13. La poser sur l'emplacement repéré à l'étape 7
14. **Attendre la réponse du serveur**, quelle qu'elle soit

### Phase 5 — Vérifier

15. Cliquer sur le bâtiment posé pour ouvrir son inspecteur, ou vérifier qu'il apparaît sur la carte
16. Fermer l'inspecteur

### Phase 6 — Sortir proprement

17. **Se déconnecter par l'interface** (pas en fermant l'onglet)
18. Revenir à la console, `Ctrl-C` pour arrêter la passerelle

> La déconnexion par l'interface produit `ClientNotAware` puis `Logoff`, et libère le `ClientView`
> côté serveur. Fermer l'onglet laisse une session ouverte que le serveur devra expirer tout seul.

---

## 4. Si la construction est refusée

**Ce n'est pas un échec du parcours — c'est une capture valide, et elle a de la valeur.**

Le compte `SPO_test3` peut manquer de fonds : l'inventaire du lot A classait la pose de bâtiment en
palier `MONEY`. Un refus serveur est une réponse, et une réponse est ce qu'on cherche à figer.

Le dépôt contient déjà exactement ce cas pour les routes —
`src/mock-server/scenarios/captured/road-build-rejected-captured.scenario.ts`. Un
`construire-refusé` serait son équivalent, et tout aussi utile : il fige le contrat d'erreur.

Dans ce cas, dites-le-moi et notez le message affiché. Nous ferons ensuite un parcours de pose
réussie quand le compte aura de quoi.

---

## 5. Après — ce que je fais

Vous me donnez le chemin du fichier de capture, et :

1. Je lis le journal et j'isole votre session (`--sid`).
2. Je vérifie qu'aucune trame anormale n'y figure — et je recoupe avec les journaux serveur en cas de
   doute, via la skill `starpeace-server-logs`.
3. Je convertis :
   `npm run capture:convert -- logs/capture-construire-<stamp>.ndjson --name construire --sid <id>`
4. Le scénario atterrit dans `src/mock-server/scenarios/captured/` et devient un test de
   non-régression **qui ne touchera plus jamais le serveur**.

Je vous rends ensuite la liste des membres RDO que le parcours a réellement exercés — c'est notre
première mesure de couverture réelle sur un domaine non couvert.

---

## 6. Les parcours suivants, dans l'ordre prévu

*Liste d'origine, conservée pour mémoire : P6 démolir/reconstruire · P7 gérer · P8 routes · P9 zonage ·
P10 connexions · P11 politique · P12 recherche.*

**Ce qui s'est réellement passé :** P6, P7, P10, P11 et P12 ont été joués **en une seule session
enchaînée** ([P6-P12-session-enchainee.md](P6-P12-session-enchainee.md)) ; P8 et P9 ont **fusionné**
en un parcours de service public ([P8-service-public.md](P8-service-public.md)) parce que les deux
exigent un rôle ; et deux parcours non prévus se sont ajoutés,
[P13](P13-communication-gestion.md) et [P14](P14-derniers-membres.md).

État à jour : [plan-certification-rdo-rev4.md](../../report/plan-certification-rdo-rev4.md) §6.
