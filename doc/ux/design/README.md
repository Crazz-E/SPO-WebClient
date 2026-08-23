# Sources des canevas Claude Design

Chaque sous-dossier contient les fichiers de travail d'un canevas (`*.dc.html` = un artboard,
`canvas.json` = disposition + notes). Le canevas publié se régénère depuis ces fichiers avec
`/design` (le fichier assemblé, ~2 Mo, n'est pas versionné).

**Depuis le 23/08 (PR #71, « socle-5 »), les planches sont la RÉFÉRENCE de ce qui est porté** : Surfaces (cadre
flottant 472 px), HUD (pastille repliable, Plus › Docked minimap, vue Carte = surface Map avec Back/Next,
Nearest Town Hall, Bookmarks), Mobile (six tuiles + pastille de recherche) dessinent le code de `main` ;
chaque écart voulu est écrit sur la planche. Une planche qui diverge du code est un bug de doc, à corriger
dans la même PR que le code.

| Dossier | Canevas | Lien |
|---|---|---|
| `direction/` | Direction HUD — 3 options (A flottant consolidé, B cockpit ancré, C carte pure + feuille universelle) | https://claude.ai/code/artifact/b7719533-668e-46c6-97a0-aca177da9af1 |
| `system/` | Système de composants — Fondations, Contrôles, Surfaces, Listes (bloc Inspect + onglets), HUD desktop, Mobile | https://claude.ai/code/artifact/41b437c4-2db5-4ccf-b4f7-0512d23e10db |
| `flows/` | Flux T1 Construire + T3 Raccorder un fournisseur — 15 planches desktop/mobile, générées par `flows/gen.py` (`python3 gen.py` régénère `*.dc.html` + `canvas.json`) | https://claude.ai/code/artifact/845491f3-837c-466d-a813-d262863c1b31 |
