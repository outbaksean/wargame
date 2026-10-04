# Hex Command

A turn-based hex wargame with NATO (APP-6) unit symbols that runs entirely in the browser. No backend, build step, or dependencies.

## Play

Open `index.html` in a browser (works straight from disk). Pick a scenario, a side and options from the menu. Press **H** in game for the full rules and controls.

### Scenarios

- **Strait Crisis (Taiwan, 2026–2031)**: a notional PRC amphibious invasion of Taiwan on a geographic map of the Taiwan Strait (~12 km hexes). Play the PRC, or the United States alongside AI-controlled Taiwanese forces. Includes navy, amphibious landings and supply over the shore, air power flown from on-map airbases, off-map base boxes (Okinawa, mainland Japan, Luzon, Guam, PRC bases) and carriers, missile stockpiles, air defense, electronic warfare, drones, satellites and counterspace, and an escalation track that can bring Japan into the war. Forces are rough open-source estimates abstracted to brigades, ship groups and squadrons.
- **Strait Crisis Academy**: a tutorial campaign of six short guided missions, each a slice of Strait Crisis: ground combat at a beachhead, US naval warfare, air power and missiles, an amphibious assault on Penghu, sealift and airborne operations, and finally satellites and escalation. A Tutorial tab walks you through each mission and ticks off steps as you do them; completed missions are remembered in the browser.
- **Meeting Engagement**: two symmetric mechanized brigades on a randomly generated map. Land combat only.

Options include hotseat (two players, one device) and AI vs AI. The game autosaves in the browser.

## Layout

| File | Purpose |
| --- | --- |
| `js/hex.js` | Hex math, seeded RNG, priority queue |
| `js/data.js` | Terrain, unit and squadron types, scenario registry |
| `js/symbols.js` | NATO symbols for land, sea, subsurface and air units |
| `js/game.js` | Core rules: movement, zones of control, intel levels, combat, amphibious ops, supply, turns, save/load |
| `js/air.js` | Air bases, squadrons, missions, air control, missiles, airborne assaults |
| `js/space.js` | Satellites, counterspace and the escalation track |
| `js/mapgen.js` | Procedural map for the Meeting Engagement |
| `js/scenarios/*.js` | Scenario definitions; `taiwan-map.js` builds the Taiwan Strait map from coordinates |
| `js/scenarios/academy/*.js` | The Strait Crisis Academy tutorial campaign; `common.js` builds each mission on top of the Taiwan scenario |
| `js/ai.js`, `js/ai-naval.js`, `js/ai-air.js` | Computer opponent: ground, naval/amphibious, air/missile/space planners |
| `js/render.js` | SVG rendering and animation |
| `js/ui.js`, `js/ui-air.js`, `js/ui-space.js`, `js/ui-tutorial.js` | Input, camera, panels, menus, turn flow; Air, Missiles, Intel & Space and Tutorial tabs |
