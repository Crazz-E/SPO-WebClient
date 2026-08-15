# U3-b — moisson du corpus de logs serveur (2026-08-15)

> **Verdict : NON CONCLUANT.** Le corpus ne contient aucun octet de la bande 0x80–0x9F, mais il ne
> contient presque aucun texte humain non-ASCII non plus. L'absence ne tranche donc rien
> (règle 4 de la hiérarchie de preuves). **La décision L11 revient au développeur**, sur l'argument
> `[INFERRED]` du §6.2 du [protocole des sondes](sondes-live-U1-U6.md).
>
> Sonde **lecture seule** : aucune trame RDO émise, aucune connexion au serveur de jeu. Uniquement
> des requêtes HTTP `curl` sur les journaux publics.

## 1. Ce qui a été fait

Énumération des index `http://158.69.153.134/logs/FIVEINTERFACESERVER/` et `.../FIVEMODELSERVER/`,
puis récupération de tous les fichiers listés — **185 fichiers, 575 Mo**. Analyse au niveau octet,
sans passer par un décodeur qui normaliserait.

Le corpus a ensuite été élagué aux catégories porteuses de texte humain (`Chat`, `Clients`,
`Survival`, `TimeWarp`, `favorites`) : **96 fichiers, 872 Ko**. Les 574 Mo restants étaient des
journaux `Office` (jusqu'à 40 Mo par jour), purement numériques — du volume, pas de la preuve.
Le cache est désormais dans `.gitignore`.

## 2. Résultat brut

| Mesure | Valeur |
|---|---|
| Octets dans la bande **0x80–0x9F** (C1) | **0**, sur les 575 Mo comme sur le corpus élagué |
| Octets dans **0xA0–0xFF** | **3 occurrences**, toutes dans un seul fichier |
| Fichiers contenant du non-ASCII | 1 sur 185 |

Le seul texte non-ASCII du corpus, `FIVEINTERFACESERVER/Survival 26-07-03.log` — un message
serveur pré-traduit :

```
Text1=Innos comenz<F3> 3 Large Food Processors cerca de Podan.
Text2=Innos a construit 3 Grandes entreprises agro-alimentaires pr<E8>s de Podan.
Text3=Innos baute 3 Gro<DF>e Lebensmittelhersteller nahe bei Podan.
```

| Octet | Caractère | Mot | Langue |
|---|---|---|---|
| `0xF3` | `ó` | comenz**ó** | espagnol |
| `0xE8` | `è` | pr**è**s | français |
| `0xDF` | `ß` | Gro**ß**e | allemand |

## 3. Pourquoi cela ne tranche pas

**Les trois octets sont dans 0xA0–0xFF, où ISO-8859-1 et CP1252 sont identiques.** Ils confirment
que le serveur écrit du texte accentué **sur un seul octet** — donc ni UTF-8, ni code page DBCS —
mais ils sont muets sur la seule question posée : que vaut la bande 0x80–0x9F ?

L'absence d'octet C1 admet deux lectures, et rien ici ne les départage :

1. la code page du serveur n'est pas CP1252, donc ces octets ne sont jamais produits ;
2. la code page **est** CP1252, mais personne n'a jamais collé d'apostrophe courbe, de tiret long
   ou d'euro dans le chat de ce monde.

La lecture 2 est très plausible : le corpus de chat retenu pèse **43 octets pour le 2026-08-14** et
quelques centaines sur les autres jours. Ce monde est peu fréquenté ; il n'y a tout simplement pas
assez de frappe humaine pour qu'un caractère de la bande C1 ait eu l'occasion d'apparaître.

**La sonde n'a pas échoué : elle a montré que le corpus disponible ne peut pas répondre.** C'est
un résultat utile — il évite d'attendre d'un volume plus grand une réponse qu'il ne contient pas.

## 4. Ce qui reste, et la recommandation

Le protocole prévoyait ce cas ([§6.2](sondes-live-U1-U6.md), *décision par défaut si non
concluant*). L'argument, inchangé et toujours `[INFERRED]` :

- Les serveurs sont des processus **Delphi 5 Win32**. `WideStrToStr` passe par
  `WideCharToMultiByte` sur la **code page ANSI du processus** (`RDOUtils.pas:266-269`).
- Sur une installation Windows occidentale, cette code page **est CP1252**.
- **ISO-8859-1 n'est la code page ANSI d'aucune installation Windows.** Elle n'a été retenue chez
  nous que parce que Node l'expose sous le nom `latin1`.
- Le risque du basculement est **nul sur 0x00–0x7F et 0xA0–0xFF** (tables identiques,
  `cp1252.ts:177-180`) et strictement borné à 0x80–0x9F — bande aujourd'hui **fausse dans les deux
  sens** (rapport §4, P-H2) : à l'émission `"` (U+201C) part en `0x1C`, un octet de contrôle ; à la
  réception `0x93` se décode en U+0093, du charabia.

Autrement dit, sur la bande contestée, l'état actuel est *sûrement faux* et l'état proposé est
*probablement juste*. Aucun des deux n'est prouvé par le corpus.

**Options pour L11 :**

| Option | Effet |
|---|---|
| **Basculer sur CP1252** (recommandé) | `ACTIVE_C1_BAND = CP1252_C1_BAND` — une ligne. Corrige € ' ' " " – — … dans les deux sens si l'inférence est juste ; sans effet observable sinon, puisque ces octets n'apparaissent nulle part aujourd'hui. |
| **Rester en Latin-1** | Statu quo. La bande reste fausse, mais aucune régression possible. |
| **Attendre une preuve directe** | Il faudrait un membre publié appliquant `AnsiUpperCase` à un texte que nous contrôlons — discriminant *contrôlé*, strictement meilleur que la moisson. Aucun candidat identifié à ce jour ([§11.8](sondes-live-U1-U6.md)). |

## 5. Effets de bord

Aucun. Aucune trame RDO émise, aucune session de jeu ouverte, aucune écriture serveur.
Le cache local est ignoré par git ; le présent document est le livrable.
