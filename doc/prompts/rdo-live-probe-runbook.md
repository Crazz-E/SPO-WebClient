# Prompt réutilisable — Runbook de sonde live RDO (validation S1/S2, frontière de crash M8)

**Usage :** coller le bloc ci-dessous dans une session neuve, **après** que le développeur a
redémarré l'Interface Server de Planitia et confirmé que la session parallèle est terminée.
**Objectif :** rejouer proprement la sonde U-A et le reste de la matrice séparateur × nature ×
arité, pour figer empiriquement la sévérité de S1/S2, sans laisser l'IS partagé dans un état
dégradé.
**Créé :** 2026-08-14, après la sonde U-A qui a **gelé** l'Interface Server de production.

> Ce runbook n'est **pas** un prompt d'audit « sans faits acquis ». C'est un **protocole
> opératoire** qui porte délibérément un fait acquis critique pour la sécurité :
> **`call <procédure ≥2 args> "^"` gèle l'Interface Server partagé** (observé le 2026-08-14,
> voir `report/audit-impact-serveur-rdo-2026-08-14.md` S1). Ce fait dicte toute la discipline
> ci-dessous. Ne pas le diluer.

---

```
MISSION

Rejouer la sonde live U-A et la matrice de scénarios séparateur × nature-de-membre × arité
contre l'Interface Server de Planitia FRAÎCHEMENT REDÉMARRÉ, pour établir par exécution ce que
le serveur fait de chaque forme. But : figer la sévérité de S1 (procédure ≥2 args + "^") et de
S2 (absence de garde), et confirmer que les seules divergences réellement émises par notre
client sont soit sûres, soit la seule connue dangereuse (SayThis "^").

RÈGLE DE SÉCURITÉ ABSOLUE — elle prime sur tout le reste

1. Une trame "^" (ou "get") sur une PROCÉDURE Delphi à ≥ 2 paramètres GÈLE le service client
   de l'IS : la méthode s'exécute, aucune réponse n'est renvoyée, la connexion et le traitement
   des déconnexions se figent, aucune exception n'est journalisée. C'est un impact catégorie 1
   sur un processus PARTAGÉ entre tous les joueurs. Preuve : U-A, 2026-08-14.
2. Corollaire : APRÈS une telle trame, plus rien de fiable ne peut être testé sur cette
   instance. Toute sonde destructrice consomme un REDÉMARRAGE SERVEUR.
3. Donc : UNE seule sonde destructrice par session ET par redémarrage. JAMAIS deux. Les sondes
   destructrices s'exécutent chacune sur un IS fraîchement redémarré, puis on s'arrête et on
   demande un redémarrage avant la suivante.
4. Les sondes NON destructrices (contrôles, "^" sur fonctions, "^" sur procédures 0-1 arg,
   "*" sur procédures) se groupent en UNE session, avec un contrôle de vivacité (get TycoonId)
   APRÈS CHAQUE trame. Si l'une gèle contre toute attente, la session est morte : arrêter,
   reclasser cette trame comme destructrice, demander un redémarrage.
5. Ne JAMAIS exécuter une sonde destructrice sans accord explicite du développeur pour CE
   redémarrage-là. Le développeur pilote les redémarrages ; l'agent ne les provoque pas.

PRÉ-VOL — vérifier que l'IS a bien été redémarré (sinon tout échoue)

Avant toute sonde, via http://158.69.153.134/logs/FIVEINTERFACESERVER/ (curl, pas WebFetch —
HTTP nu, pas de TLS) :
- Le Survival du jour progresse-t-il (nouvelles lignes après l'incident précédent) ?
- La session gelée précédente (ClientViewId noté dans le rapport, ex. 7272232) a-t-elle enfin
  un "Start/End Disconnecting", ou a-t-elle disparu après redémarrage ?
- Un login de test répond-il ? (voir séquence ci-dessous — s'arrêter après Logon + get TycoonId
  si l'on veut juste tester la santé, puis logoff propre.)
Si l'IS ne répond pas / le log est figé : NE RIEN sonder, signaler que le redémarrage n'a pas
pris.

HIÉRARCHIE DE PREUVES

1. Captures live — doc/Mock_Server_scenarios_captures.md,
   src/mock-server/scenarios/captured/login-full-captured.scenario.ts (séquence de login exacte,
   octets réels). Gagnent sur tout.
2. Logs serveur de production — http://158.69.153.134/logs/FIVEINTERFACESERVER/ (Survival = les
   exceptions ; Chat = les SayThis exécutés ; Clients = les sessions proprement refermées) et
   .../FIVEMODELSERVER/ (santé de la simulation). CE SONT LES LOGS DE PLANITIA. Pas d'accès au
   serveur de connexion.
3. Source legacy — ../SPO-Original/ pour interpréter (Rdo/Server/, Interface Server/, Kernel/).
   Skill delphi-archaeologist. Toute affirmation cite Fichier.pas:Ligne ou est [INFERRED].

IDENTIFIANTS (compte de test, mot de passe volontairement en clair, compte jetable)

  SPO_test3   (AVEC tiret bas — "SPOTest3" échoue : ACCOUNT_Unexisting #2, Protocol.pas:84)
  test3

MONDE : Planitia. Serveur monde (port client IS) = 158.69.153.134:8000 (prouvé, capture
login-full rdo-010 : interface/ip0=158.69.153.134, interface/port0=8000).

HARNAIS — trames byte-fidèles à l'émission de production

- Compiler HORS dépôt les modules protocole de PRODUCTION (pour que les octets soient exactement
  ceux du gateway), dans le scratchpad, jamais dans l'arbre :
    npx tsc src/server/rdo.ts src/shared/rdo-types.ts src/shared/cp1252.ts \
      --outDir <scratch>/out --module commonjs --target es2020 --esModuleInterop \
      --skipLibCheck --rootDir src
- Piloter une socket net.Socket brute : RdoFramer.ingest pour parser, RdoProtocol.format(...)+';'
  pour bâtir, Buffer.from(clampToWireBytes(raw),'latin1') pour écrire (encodage Latin-1
  obligatoire). Corréler les réponses par QueryId.
- SÉQUENCE DE CONNEXION (minimale mais fidèle, source : capture login-full rdo-015→027) :
    idof "InterfaceServer"                              -> interfaceServerId
    sel <isId> call AccountStatus "^" "%SPO_test3","%test3"   -> res="#0" (ACCOUNT_Valid), ÉVICTE
                                                                 toute vue précédente du même nom
    sel <isId> call Logon "^" "%SPO_test3","%test3"          -> res="#<ClientViewId>"
  AccountStatus AVANT Logon est OBLIGATOIRE : sur socket semi-ouverte l'ancienne vue subsiste et
  Logon renvoie 0 (InterfaceServer.pas:3192,3138-3151). NE PAS appeler RegisterEventsById (on ne
  fournit pas de canal retour ; l'omettre réduit l'empreinte et évite la ligne ".IP =").
- FOOTPRINT MINIMAL : tout SayThis cible Dest = SPO_test3 (soi-même) → message PRIVÉ, invisible
  des autres joueurs (routage InterfaceServer.pas:3922 : Dest="" diffuse au canal, Dest=<pseudo>
  ne livre qu'à ce joueur). Contenu Msg = un marqueur reconnaissable (ex. "probe-<scenario>").
- LOGOFF PROPRE après CHAQUE session non gelée, sinon la sonde fuit elle-même un ClientView
  (M5) : sel <cv> call ClientNotAware "*" ; puis sel <cv> get Logoff (rid, deadline courte) ;
  puis socket.end(). Après une sonde destructrice, le logoff timeout est ATTENDU (connexion
  gelée) — fermer le socket quand même et demander le redémarrage.

MATRICE DE SCÉNARIOS

--- BATCH 1 : NON DESTRUCTIF — une seule session, get TycoonId après chaque trame ---
Isole la CAUSE : la « procédure-ité » (pas de vrai slot résultat), pas le nombre d'arguments.

  C1  get TycoonId                          fonction-propriété   attendu res "#37"  (baseline)
  C2  call GetChannelList "^" "%ROOT"       fonction 1 arg       attendu res="%…"   ("^"/fonction OK)
  C3  call ObjectAt "^" "#500","#500"       fonction 2 args      attendu res="#…"   (2 args + "^" sur
                                                                 FONCTION = sûr → prouve que ce
                                                                 n'est PAS l'arité qui gèle)
  C4  call GetUserList "^"                   fonction 0 arg       attendu res="%…"   (répond U-C :
                                                                 nombre de joueurs pour S4)
  B1  call ClientAware "^"                   PROCÉDURE 0 arg      attendu ack propre (RegsUsed=1,
                                                                 pas de push edi — bénin)
  B2  call SetLanguage "^" "%0"             PROCÉDURE 1 arg      attendu ack propre (RegsUsed=2,
                                                                 pas de push edi — VALIDE la
                                                                 conformité de nos divergences
                                                                 mineures CloseMessage/AddLine "^")

Si B1 et B2 répondent proprement et que tous les get TycoonId intercalés répondent, conclusion :
"^" est sûr sur toute fonction et sur les procédures 0-1 arg ; le gel est spécifique aux
procédures ≥ 2 args. Logoff propre. FIN du batch 1 — aucun redémarrage consommé.

--- BATCH 2+ : DESTRUCTIF — UNE sonde par session, redémarrage AVANT chacune ---

  D1  call SayThis "^" "%SPO_test3","%probe-D1"    PROCÉDURE 2 args
        Gel CONFIRMÉ (U-A). Rejouer UNE fois sur base propre pour reproductibilité (n=2).
        Attendu : la méthode s'exécute (Chat log : "SPO_test3: probe-D1"), AUCUNE réponse,
        get TycoonId suivant en timeout, aucun "Start Disconnecting" dans Survival.

  D2  call SetViewedArea "^" "#0","#0","#0","#0"   PROCÉDURE 4 args   [OPTIONNEL]
        Hypothèse : gèle aussi (arité supérieure). Effet de bord : remet le viewport à zéro
        (inoffensif — c'est ce que fait DoLogoff, InterfaceServer.pas:2004). Confirme que le gel
        n'est pas propre à SayThis.

  D3  call GetChannelList "*" "%ROOT"              FONCTION 1 arg + VoidId   [OPTIONNEL, PLUS RISQUÉ]
        Teste la face SYMÉTRIQUE de M8 : "*" sur une fonction → le pointeur @Res n'est jamais
        passé → écriture d'un variant à une adresse non initialisée. Potentiellement PIRE qu'un
        gel (écriture sauvage). NE CORRESPOND À AUCUNE trame émise par notre client → priorité
        basse, à ne lancer que si le développeur veut fermer M8 entièrement, en pleine conscience
        du risque accru.

Pour CHAQUE sonde destructrice : IS fraîchement redémarré → pré-vol → login → la trame →
tenter get TycoonId (timeout attendu) → fermer le socket → corréler les logs (Survival silencieux
d'exception ? Chat contient le marqueur ? Session refermée ou gelée ?) → S'ARRÊTER et demander
le redémarrage suivant.

CORRÉLATION LOGS — après chaque session

- Chat 26-…-….log : le marqueur "probe-<scenario>" y est-il ? (prouve que la méthode s'est
  exécutée même si aucune réponse RDO n'est revenue).
- Survival 26-…-….log : une exception a-t-elle été journalisée ? (le gel M8 n'en produit AUCUNE
  — un "Error in …" changerait le diagnostic). La session a-t-elle un "Start/End Disconnecting" ?
- Clients 26-…-….log : la session y figure-t-elle (teardown propre) ou en est-elle absente
  (gelée) ?
- FIVEMODELSERVER/Survival : la simulation continue-t-elle (SIM-Facs, tick) ? (SayThis est
  IS-local, le modèle ne doit PAS être touché — le vérifier).

MÉTHODE

- VÉRIFIE, ne transcris pas. Chaque constat = trame émise + réponse (ou silence) + extrait de
  log serveur, cité. Distingue OBSERVÉ (sonde+log) / INFÉRÉ (raisonnement source) / INCONNU.
- La question « le gel fige-t-il l'IS pour TOUS les joueurs, ou seulement ma connexion ? » reste
  INFÉRÉE tant qu'un second client concurrent n'a pas été témoin. Ne pas la surclasser en OBSERVÉ
  sans ce témoin. (Piste : un second harnais connecté AVANT la sonde destructrice, qui tente un
  get TycoonId APRÈS — mais cela expose délibérément une 2e session au gel : accord développeur
  requis, et cela n'ajoute qu'à la connaissance, pas à la conformité de notre client.)

LIVRABLE

Mettre à jour report/audit-impact-serveur-rdo-2026-08-14.md :
- S1 : OBSERVÉ (déjà acté) — ajouter la reproduction D1 (n=2) si faite.
- S2 : compléter la frontière empirique (C3 fonction-2-args sûr, B1/B2 procédures-0/1-arg sûres,
  D2 procédure-4-args si testée, D3 "*"-sur-fonction si testée).
- Table finale « forme émise → réponse serveur observée → classification », une ligne par
  scénario, avec l'extrait de log.

INTERDITS

- Ne modifie aucun fichier du dépôt ni de ../SPO-Original. Compile et sonde dans le scratchpad.
- JAMAIS deux sondes destructrices dans une même session / sur un même IS.
- Ne provoque aucun redémarrage ; ne lance une sonde destructrice qu'avec l'accord explicite du
  développeur pour ce redémarrage-là.
- Ne relance pas U-2 (la même trame ×100) : U-A a suffi, la répétition n'ajoute qu'un risque.
- Ne conclus jamais à un impact multi-joueurs sans témoin concurrent.
- Ne considère pas l'absence de réponse comme un ack : c'est le contraire (le serveur enveloppe
  toujours un QueryId présent, RDOQueryServer.pas:174-178 — le silence prouve que le retour
  normal n'a pas été atteint).
```

---

## Notes d'accompagnement (hors bloc à coller)

- **Pourquoi C3 est le pivot du batch 1.** `ObjectAt` est une *fonction* à 2 arguments ; `SayThis`
  une *procédure* à 2 arguments. Si C3 répond proprement et D1 gèle, on a la preuve isolée que
  **c'est l'absence de vrai slot résultat (procédure-ité) qui déclenche le `push edi`**, pas le
  nombre d'arguments. Sans C3, un sceptique pourrait attribuer le gel à « 2 arguments ».
- **Coût en redémarrages.** Batch 1 = 0 redémarrage. D1 = 1. D2 = 1. D3 = 1. Le strict minimum
  utile à la conformité de *notre* client est **batch 1 + D1** (2 sessions, 1 redémarrage) : cela
  confirme la seule trame dangereuse que nous émettons (SayThis "^") et valide que tout le reste
  de nos émissions est sûr. D2/D3 sont de la complétude M8 académique, sans contrepartie dans nos
  frames — à ne financer que si vous voulez fermer le modèle entièrement.
- **Ce runbook ne corrige rien.** Le correctif de S1 (`.push()` → `"*"` sur SayThis) est traité
  ailleurs (audit §7, plan de reconnexion). Ici on mesure, on ne répare pas.
