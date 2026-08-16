# Prompt réutilisable — Audit d'impact serveur de la couche RDO (reprise à zéro)

**Usage :** coller le bloc ci-dessous dans une session neuve (Fable 5 recommandé, effort élevé).
**Objectif de l'analyse :** un client web conforme et 100 % respectueux du serveur Delphi partagé.
**Posture :** reprise intégrale depuis les sources primaires. Les rapports existants du dépôt sont
considérés comme **périmés** et ne servent pas d'entrée.
**Créé :** 2026-08-14.

> Maintenance : ce prompt ne contient volontairement **aucun fait acquis** — uniquement des pistes
> assorties de pointeurs, à confirmer par l'agent. C'est ce qui le rend réutilisable sans pourrir
> avec le temps. Si tu l'enrichis, garde cette règle : des pointeurs, jamais des conclusions.

---

```
MISSION

Audite l'implémentation RDO du WebClient sous un seul angle : QU'EST-CE QUE NOTRE CLIENT
FAIT SUBIR AU SERVEUR DELPHI DE PRODUCTION, qui est partagé entre tous les joueurs.

La finalité est un client web conforme et 100 % respectueux du serveur. Tu ne cherches donc
pas « est-ce que notre code est joli » ni « est-ce que l'utilisateur voit un bug », mais :
est-ce qu'une trame, une séquence, un timer ou un enchaînement de notre part peut faire
planter, bloquer, fuir, saturer ou désynchroniser un service côté serveur.

PÉRIMÈTRE

INCLUS — conformité protocolaire quand la non-conformité a un coût serveur ; logique
opérationnelle et enchaînements (login, logoff, reconnexion, focus, keepalive, polling,
pushes, mutations) ; consommation de ressources serveur (threads, verrous, mémoire, sockets,
pools) ; formes de trames qui provoquent un comportement indéfini côté Delphi.

EXCLU — tout cadrage sécurité (exploitation, malveillance, durcissement, OWASP). Si une
faiblesse a un angle sécurité ET un angle « ça abîme le serveur », ne retiens que le second
et formule-le en termes d'intégrité de service. Exclu aussi : ergonomie, style, perfs client,
rendu.

POSTURE : REPARTIR DE ZÉRO

Le dépôt contient des rapports d'audit antérieurs (report/*.md). Ils sont PÉRIMÉS et ne sont
PAS une entrée de ton travail :
- ne les lis pas pour construire ton analyse ;
- ne cite aucun de leurs verdicts comme acquis ;
- ne considère pas qu'un défaut qu'ils déclarent « corrigé » l'est réellement — vérifie dans
  le code d'aujourd'hui ;
- ne considère pas non plus qu'un défaut qu'ils déclarent ouvert l'est encore.

Tu peux, UNIQUEMENT à la toute fin et une fois tes conclusions figées, les parcourir pour
signaler les écarts entre ton diagnostic et l'historique. Jamais avant : la connaissance de
leurs conclusions biaiserait ta recherche.

Même prudence pour les documents de doc/ : ils sont mieux tenus, mais ce sont des synthèses.
Quand un point compte, remonte à la source primaire plutôt que de faire confiance au résumé.

HIÉRARCHIE DE PREUVES (impérative, elle tranche tout conflit)

1. Captures live — doc/Mock_Server_scenarios_captures.md et doc/building_details_rdo.txt.
   Ce sont les octets que le client Voyager d'origine a réellement mis sur le fil en
   production. Ils gagnent sur tout le reste et ne périment pas.
2. Source du client legacy — ../SPO-Original/Voyager/ et ../SPO-Original/Rdo/Client/.
   Explique POURQUOI les octets capturés ont cette forme.
3. Source serveur — ../SPO-Original/Rdo/Server/, Interface Server/, Kernel/, Mail Server/,
   Cache/. Explique ce que le serveur FAIT de ce qu'il reçoit.

Règles associées, non négociables :
- L'absence d'une forme dans une capture ne prouve RIEN (les captures ont des QueryId élidés).
  La présence prouve ; l'absence ne prouve pas.
- La classification RTTI du serveur (propriété vs fonction) n'est PAS la référence pour le
  choix du verbe : c'est le dispatch COM du client qui décide, le serveur tolère via le
  fallthrough GET.
- Si capture et source serveur se contredisent : explique d'abord POURQUOI la forme capturée
  fonctionne, puis aligne-toi sur la capture. Jamais l'inverse.
- Toute affirmation tirée du legacy cite Fichier.pas:Ligne. Sinon, marque-la [INFERRED] ou
  [UNKNOWN] explicitement. Ne présente jamais une inférence comme un fait.

OUTILLAGE

- Invoque la skill `rdo-conformity` (checklist, matrice verbe/séparateur, hiérarchie de preuves).
- Skill `delphi-archaeologist` pour naviguer ../SPO-Original ; index dans
  doc/spo-original-reference.md.
- doc/rdo-protocol-architecture.md et doc/rdo-session-lifecycle.md sont le canon interne :
  utile pour t'orienter, à re-confronter aux sources primaires sur les points décisifs.
  La §9 du second liste des divergences présentées comme ASSUMÉES — vérifie si l'arbitrage
  tient toujours sous l'angle « coût serveur », c'est précisément ce que tu audites.

PISTES DE DÉPART — AUCUNE N'EST ACQUISE, chacune est à confirmer par toi

Ce sont des endroits où regarder, pas des conclusions. Confirme ou infirme chacune dans le
code d'aujourd'hui, des deux côtés, avant d'en faire quoi que ce soit.

- Modèle de concurrence du serveur : combien de threads sert le port client de l'Interface
  Server ? La section critique de l'object-server y est-elle active ou nulle ? Les requêtes
  pipelinées sur une même connexion s'exécutent-elles concurremment ? (Rdo/Server/,
  Interface Server/InterfaceServer.pas)
- Chemin des lectures lourdes : les threads de l'IS convergent-ils vers une connexion
  IS→Model unique, et sur quel dimensionnement de pool côté Model ? Qui d'autre partage ce
  pool ? (InterfaceServer.pas, ModelServer.pas). Idem pour le cacher et le mail.
- Verrou global de session : quelles méthodes le prennent (Logon, AccountStatus, Logoff,
  opérations de canal…) et pendant combien de temps ? Tiennent-elles ce verrou à travers un
  appel inter-serveur ? Conséquence sur les rafales de (re)connexion.
- Cycle de vie des objets de session côté serveur : le ClientView est-il réellement libéré au
  logoff, ou seulement extrait de la liste ? Chercher un Free commenté dans
  TInterfaceServer.Logoff. Impact direct sur toute recommandation touchant la reconnexion.
- Plafonds et garde-fous serveur : taille maximale d'une requête, comportement au dépassement,
  cap de connexions, réaper d'inactivité, file d'attente bornée ou non.
- Choix du séparateur par membre : le client de référence émet-il « ^ » ou « * » selon le type
  Delphi du membre (procedure vs function) ? Que fait le serveur d'un « ^ » sur une procédure,
  côté dispatch assembleur ? C'est un candidat sérieux de comportement indéfini.
- Cadence et existence de nos timers comparées au client de référence : polling que Voyager ne
  faisait pas, keepalives ajoutés, rafraîchissements provoqués par un push.
- Déclencheurs de reconnexion : sur quel événement exactement, et le client de référence
  faisait-il pareil ?

PIÈGES CONNUS — à ne pas retomber dedans

- Une affirmation a été RETIRÉE en juillet 2026 : « QueryId + "*" fait planter le serveur ».
  Elle est démentie par capture. Si ton analyse t'y ramène, relis la capture avant de conclure.
- Le vrai candidat de crash de cette famille est l'inverse : « ^ » SANS QueryId, où la réponse
  est construite sans destination. Vérifie si notre code peut produire cette forme.
- Méfie-toi des tests verts. Vérifie que les suites assertent bien l'ÉMISSION DE PRODUCTION et
  non des paquets synthétiques ou des mocks codés en dur — ce piège masque des divergences de
  fil réelles.
- Attention aux commentaires de notre code qui justifient un choix protocolaire en citant une
  signature Delphi : vérifie que la signature citée est bien celle du serveur de PRODUCTION et
  non celle d'une unité de test ou d'une déclaration commentée.

MÉTHODE EXIGÉE

- VÉRIFIE, ne transcris pas. Pour chaque constat retenu, ouvre toi-même le code des deux côtés
  et cite la ligne. Si tu délègues à des sous-agents, re-vérifie personnellement tout constat
  de gravité haute avant de l'écrire : un audit qui relaie une affirmation non contrôlée ne
  vaut rien.
- Quand c'est possible, PROUVE PAR EXÉCUTION. Les modules protocole (src/shared/rdo-types.ts,
  src/server/rdo.ts, src/server/rdo-helpers.ts) se compilent hors arbre et s'exécutent : une
  trame réellement produite vaut mieux qu'une lecture de code. Compile dans le scratchpad,
  jamais dans le dépôt.
- Distingue systématiquement : divergence PROUVÉE (capture ou source à l'appui) / mode de
  défaillance INFÉRÉ (raisonnement sur le source, non observé) / INCONNU. La sévérité dépend
  de cette distinction, et un mode de défaillance inféré ne justifie pas une refonte.

AXE D'ORGANISATION DU LIVRABLE — par impact serveur, pas par couche

Classe chaque constat dans l'une de ces catégories, de la plus grave à la moins grave :

  1. COMPORTEMENT INDÉFINI / CRASH dans un processus partagé (corruption de pile, pointeur
     invalide, exception non rattrapée dans un chemin critique)
  2. THREAD IMMOBILISÉ — un worker du pool bloqué en attente ; rapporte-le à la taille réelle
     du pool concerné, que tu auras établie
  3. FUITE PERMANENTE — mémoire, slot de pool, section critique, objet jamais libéré
  4. CONTENTION DU VERROU GLOBAL — tout ce qui multiplie les opérations qui le prennent
  5. SATURATION DU CHEMIN DE LECTURE PARTAGÉ — fan-out vers le pool le plus étroit
  6. DÉSYNCHRONISATION DE FLUX — trames malformées, cadrage cassé, corrélation QueryId perdue
  7. CONTAMINATION INTER-UTILISATEURS — effet de notre session sur celle d'un autre joueur
  8. CHARGE DE FOND ÉVITABLE — polling ou trafic que le client de référence ne produisait pas

Pour chaque constat : notre code (fichier:ligne), la forme de référence (capture ou
Fichier.pas:Ligne), le mécanisme serveur exact déclenché, la catégorie ci-dessus, et le
statut PROUVÉ / INFÉRÉ / INCONNU.

LIVRABLE

Un rapport markdown en français dans report/ (convention maison : doc/ en anglais, report/ en
français), avec un bandeau de statut daté, et :
- un résumé exécutif trié par catégorie d'impact serveur ;
- les constats détaillés, chacun cité des deux côtés ;
- une section « ce qui est déjà conforme » — le silence sur ce qui va bien fait croire à un
  audit incomplet et fait re-auditer inutilement ;
- les arbitrages où corriger un défaut client AGGRAVE la charge serveur : traite-les
  explicitement, ne les cache pas derrière une recommandation simpliste ;
- les zones non prouvées, avec pour chacune l'expérience minimale qui la trancherait ;
- un ordre de traitement justifié par l'impact serveur, pas par la facilité d'implémentation ;
- en toute fin seulement, une confrontation à l'historique (report/*.md) : ce que tu trouves
  et qu'ils ne disaient pas, ce qu'ils disaient et qui ne tient plus.

INTERDITS

- Ne modifie aucun fichier du dépôt ni de ../SPO-Original (lecture seule, artefact historique).
- Ne corrige rien : cette passe produit un diagnostic, pas un correctif.
- N'exécute aucune requête contre le serveur de production sans autorisation explicite du
  développeur — même une sonde d'une seule trame. Si une question ne peut se trancher qu'en
  live, formule-la comme une expérience à faire approuver, avec son coût et son risque.
- Ne conclus jamais « c'est bon » à partir d'une absence de capture.
```
