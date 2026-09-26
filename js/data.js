'use strict';

(function (WG) {
  const X = Infinity;

  // cost: movement points to enter, per mobility class. def: defender multiplier.
  WG.TERRAIN = {
    clear:    { name: 'Clear',     cost: { foot: 1, tracked: 1, wheeled: 1, naval: X }, def: 1.0,  color: '#dfe3b4' },
    forest:   { name: 'Forest',    cost: { foot: 2, tracked: 2, wheeled: 3, naval: X }, def: 1.5,  color: '#a9c68a', conceal: true, rough: true },
    hills:    { name: 'Hills',     cost: { foot: 2, tracked: 2, wheeled: 3, naval: X }, def: 1.4,  color: '#e2cf9b', high: true },
    mountain: { name: 'Mountains', cost: { foot: 3, tracked: 4, wheeled: X, naval: X }, def: 2.0,  color: '#cbb99e', high: true, rough: true },
    urban:    { name: 'Town',      cost: { foot: 1, tracked: 1, wheeled: 1, naval: X }, def: 1.75, color: '#d6d0c4', conceal: true, rough: true },
    city:     { name: 'City',      cost: { foot: 1, tracked: 2, wheeled: 1, naval: X }, def: 2.25, color: '#cdc6b8', conceal: true, rough: true },
    marsh:    { name: 'Marsh',     cost: { foot: 3, tracked: 4, wheeled: X, naval: X }, def: 1.2,  color: '#c6d6ae', rough: true },
    river:    { name: 'River',     cost: { foot: 3, tracked: 4, wheeled: X, naval: X }, def: 0.8,  color: '#d3dfb2' },
    water:    { name: 'Lake',      cost: { foot: X, tracked: X, wheeled: X, naval: X }, def: 1.0,  color: '#8fbcdb' },
    sea:      { name: 'Shallow sea', cost: { foot: X, tracked: X, wheeled: X, naval: 1 }, def: 1.0, color: '#a9cde3', sea: true },
    deep:     { name: 'Deep ocean',  cost: { foot: X, tracked: X, wheeled: X, naval: 1 }, def: 1.0, color: '#86b1d4', sea: true, deep: true },
  };

  // Ground and naval units that sit on the hex map.
  //   domain: land | sea (surface) | sub.  move: mobility class for TERRAIN costs.
  //   atk/range: fire against land units (indirect = no return fire beyond 1 hex).
  //   sea: fire against surface ships. asw: fire against submarines.
  //   ad: air/missile defense { ad, bmd (ballistic), range }. emitter: has a radar/jammer that can be switched off.
  WG.UNIT_TYPES = {
    armor:   { name: 'Armor', short: 'ARM', icon: 'armor', domain: 'land', move: 'tracked', mp: 6, atk: 8, def: 5, range: 1, vision: 2, steps: 4, armored: true, value: 1.4 },
    mech:    { name: 'Mechanized Infantry', short: 'MECH', icon: 'mech', domain: 'land', move: 'tracked', mp: 5, atk: 6, def: 6, range: 1, vision: 2, steps: 4, armored: true, value: 1.2 },
    inf:     { name: 'Infantry', short: 'INF', icon: 'inf', domain: 'land', move: 'foot', mp: 3, atk: 4, def: 6, range: 1, vision: 2, steps: 4, value: 1.0 },
    recon:   { name: 'Reconnaissance', short: 'RECCE', icon: 'recon', domain: 'land', move: 'wheeled', mp: 8, atk: 2, def: 3, range: 1, vision: 4, steps: 2, value: 0.8 },
    at:      { name: 'Anti-Armor', short: 'AT', icon: 'at', domain: 'land', move: 'wheeled', mp: 4, atk: 4, def: 5, range: 1, vision: 2, steps: 3, antiArmor: true, value: 0.9 },
    arty:    { name: 'Field Artillery', short: 'FA', icon: 'arty', domain: 'land', move: 'tracked', mp: 4, atk: 7, def: 2, range: 3, vision: 2, steps: 3, indirect: true, value: 1.1 },
    hq:      { name: 'Headquarters', short: 'HQ', icon: 'hq', domain: 'land', move: 'wheeled', mp: 5, atk: 1, def: 2, range: 1, vision: 2, steps: 2, echelon: 'X', command: 3, value: 1.5 },
    marine:  { name: 'Marines', short: 'MAR', icon: 'inf', mod: 'amphib', domain: 'land', move: 'foot', mp: 3, atk: 5, def: 6, range: 1, vision: 2, steps: 4, amphib: 0.8, value: 1.1 },
    amphmech:{ name: 'Amphibious Mech', short: 'AMPH', icon: 'mech', mod: 'amphib', domain: 'land', move: 'tracked', mp: 5, atk: 6, def: 5, range: 1, vision: 2, steps: 4, armored: true, amphib: 0.7, value: 1.2 },
    airborne:{ name: 'Airborne', short: 'ABN', icon: 'inf', mod: 'airborne', domain: 'land', move: 'foot', mp: 3, atk: 4, def: 5, range: 1, vision: 2, steps: 3, airAssault: 16, value: 1.0 },
    rocket:  { name: 'Rocket Artillery', short: 'MLRS', icon: 'rocket', domain: 'land', move: 'wheeled', mp: 5, atk: 8, def: 2, range: 6, vision: 2, steps: 3, indirect: true, value: 1.2 },
    asm:     { name: 'Coastal Anti-Ship Missiles', short: 'CDCM', icon: 'asm', domain: 'land', move: 'wheeled', mp: 5, atk: 0, def: 2, range: 0, vision: 2, steps: 3, sea: { atk: 8, range: 10, kind: 'missile' }, value: 1.2 },
    sam:     { name: 'Air Defense (SAM)', short: 'SAM', icon: 'sam', domain: 'land', move: 'wheeled', mp: 4, atk: 0, def: 2, range: 0, vision: 2, steps: 3, ad: { ad: 8, bmd: 4, range: 5 }, emitter: 'radar', value: 1.3 },
    ew:      { name: 'Electronic Warfare', short: 'EW', icon: 'ew', domain: 'land', move: 'wheeled', mp: 5, atk: 0, def: 2, range: 0, vision: 3, steps: 2, jam: 4, emitter: 'jammer', value: 1.0 },
    lm:      { name: 'Loitering Munitions', short: 'LM', icon: 'lm', domain: 'land', move: 'wheeled', mp: 4, atk: 5, def: 2, range: 3, vision: 3, steps: 3, indirect: true, expendable: true, drone: true, sea: { atk: 4, range: 3, kind: 'drone' }, value: 0.8 },

    ddg:  { name: 'Destroyer Group', short: 'DDG', icon: 'DD', domain: 'sea', move: 'naval', mp: 10, atk: 3, def: 6, range: 2, vision: 3, steps: 3, indirect: true, sea: { atk: 8, range: 14, kind: 'missile' }, asw: { atk: 3, range: 1 }, ad: { ad: 8, bmd: 3, range: 4 }, emitter: 'radar', value: 1.6 },
    ffg:  { name: 'Frigate Group', short: 'FFG', icon: 'FF', domain: 'sea', move: 'naval', mp: 10, atk: 2, def: 4, range: 2, vision: 3, steps: 3, indirect: true, sea: { atk: 5, range: 8, kind: 'missile' }, asw: { atk: 4, range: 2 }, ad: { ad: 4, bmd: 0, range: 2 }, emitter: 'radar', value: 1.1 },
    fac:  { name: 'Missile Corvettes', short: 'FAC', icon: 'PG', domain: 'sea', move: 'naval', mp: 10, atk: 0, def: 2, range: 0, vision: 2, steps: 2, sea: { atk: 5, range: 6, kind: 'missile' }, ad: { ad: 1, bmd: 0, range: 0 }, value: 0.7 },
    cv:   { name: 'Carrier Group', short: 'CV', icon: 'CV', domain: 'sea', move: 'naval', mp: 8, atk: 0, def: 8, range: 0, vision: 3, steps: 4, ad: { ad: 7, bmd: 2, range: 1 }, emitter: 'radar', carrier: 3, value: 3.0 },
    amph: { name: 'Amphibious Squadron', short: 'AMPH', icon: 'LS', domain: 'sea', move: 'naval', mp: 8, atk: 0, def: 4, range: 0, vision: 2, steps: 3, capacity: 1, beach: true, ad: { ad: 2, bmd: 0, range: 0 }, value: 1.3 },
    roro: { name: 'Ro-Ro Ferries', short: 'RORO', icon: 'RO', domain: 'sea', move: 'naval', mp: 8, atk: 0, def: 2, range: 0, vision: 1, steps: 2, capacity: 1, portOnly: true, value: 0.9 },
    mcm:  { name: 'Mine Countermeasures', short: 'MCM', icon: 'MS', domain: 'sea', move: 'naval', mp: 8, atk: 0, def: 2, range: 0, vision: 2, steps: 2, sweep: true, value: 0.6 },
    usv:  { name: 'Drone Boats (USV)', short: 'USV', icon: 'USV', domain: 'sea', move: 'naval', mp: 10, atk: 0, def: 1, range: 0, vision: 1, steps: 2, sea: { atk: 6, range: 1, kind: 'kamikaze' }, expendable: true, drone: true, value: 0.4 },
    ssk:  { name: 'Diesel Submarines', short: 'SSK', icon: 'SS', domain: 'sub', move: 'naval', mp: 6, atk: 0, def: 3, range: 0, vision: 2, steps: 2, sea: { atk: 9, range: 1, kind: 'torpedo' }, asw: { atk: 2, range: 1 }, value: 1.4 },
    ssn:  { name: 'Attack Submarine', short: 'SSN', icon: 'SSN', domain: 'sub', move: 'naval', mp: 9, atk: 0, def: 4, range: 0, vision: 2, steps: 2, sea: { atk: 10, range: 1, kind: 'torpedo' }, asw: { atk: 4, range: 1 }, value: 2.0 },
  };

  // Off-map air squadrons (flown from base boxes, on-map airbases or carriers).
  WG.AIR_TYPES = {
    ftr:    { name: 'Fighter Squadron', short: 'FTR', icon: 'F', a2a: 6, strike: 3, steps: 3, value: 1.2 },
    ftr5:   { name: 'Stealth Fighter Squadron', short: 'FTR5', icon: 'F', a2a: 9, strike: 4, steps: 3, stealth: true, value: 1.8 },
    bomber: { name: 'Bomber Squadron', short: 'BMB', icon: 'B', a2a: 0, strike: 8, steps: 3, standoff: true, longRange: true, value: 1.6 },
    aew:    { name: 'Airborne Early Warning', short: 'AEW', icon: 'AEW', a2a: 0, strike: 0, steps: 2, sensor: true, longRange: true, value: 1.5 },
    ewac:   { name: 'Electronic Attack Squadron', short: 'EA', icon: 'J', a2a: 2, strike: 0, steps: 2, jam: true, value: 1.2 },
    tanker: { name: 'Tanker Squadron', short: 'TKR', icon: 'K', a2a: 0, strike: 0, steps: 2, tanker: 3, longRange: true, value: 1.2 },
    mpa:    { name: 'Maritime Patrol', short: 'MPA', icon: 'P', a2a: 0, strike: 0, asw: 5, steps: 2, longRange: true, value: 1.0 },
    uav:    { name: 'Surveillance Drones', short: 'UAV', icon: 'UAV', a2a: 0, strike: 0, steps: 2, isr: true, longRange: true, drone: true, value: 0.6 },
  };

  WG.ORBAT = ['hq', 'armor', 'armor', 'mech', 'mech', 'inf', 'inf', 'inf', 'inf', 'recon', 'at', 'arty', 'arty'];

  WG.SIDES = {
    blue: { name: 'Blue', color: '#3d7fd9' },
    red: { name: 'Red', color: '#d9463f' },
  };

  WG.TOWN_NAMES = [
    'Altheim', 'Brodnik', 'Carvel', 'Dornach', 'Eskerby', 'Falkwitz', 'Gravenholt', 'Hollin',
    'Istrova', 'Jarnfeld', 'Kessling', 'Lindmar', 'Marrow', 'Norvik', 'Ostmark', 'Pellau',
    'Quenby', 'Rastow', 'Stavik', 'Torvale', 'Ulmen', 'Veldhaven', 'Wexham', 'Zorinsk',
    'Ashford', 'Blackmoor', 'Crestfall', 'Dunwick', 'Elmsgate', 'Fenwick',
  ];

  WG.SCENARIOS = {};
  WG.registerScenario = (def) => { WG.SCENARIOS[def.id] = def; };
})(window.WG);
