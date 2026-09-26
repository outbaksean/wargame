# Hex Command

A turn-based hex wargame with NATO (APP-6) unit symbols that runs entirely in the browser. No backend, build step, or dependencies.

## Play

Open `index.html` in a browser (works straight from disk). Choose a mode, map size, turn count, seed and fog of war from the menu. Press **H** in game for rules and controls.

## Layout

| File | Purpose |
| --- | --- |
| `js/hex.js` | Hex math, seeded RNG, priority queue |
| `js/data.js` | Terrain and unit stats, order of battle |
| `js/mapgen.js` | Procedural map: terrain, river, towns, roads |
| `js/symbols.js` | NATO unit symbol SVG |
| `js/game.js` | Rules: movement, zones of control, fog, combat, turns, save/load |
| `js/ai.js` | Computer opponent |
| `js/render.js` | SVG map rendering and animation |
| `js/ui.js` | Input, camera, panels, menus, turn flow |
