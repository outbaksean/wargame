'use strict';

(function (WG) {
  const X = Infinity;

  // cost: movement points to enter, per mobility class. def: defender multiplier.
  WG.TERRAIN = {
    clear:    { name: 'Clear',     cost: { foot: 1, tracked: 1, wheeled: 1 }, def: 1.0,  color: '#dfe3b4' },
    forest:   { name: 'Forest',    cost: { foot: 2, tracked: 2, wheeled: 3 }, def: 1.5,  color: '#a9c68a', conceal: true, rough: true },
    hills:    { name: 'Hills',     cost: { foot: 2, tracked: 2, wheeled: 3 }, def: 1.4,  color: '#e2cf9b', high: true },
    mountain: { name: 'Mountains', cost: { foot: 3, tracked: 4, wheeled: X }, def: 2.0,  color: '#cbb99e', high: true, rough: true },
    urban:    { name: 'Town',      cost: { foot: 1, tracked: 1, wheeled: 1 }, def: 1.75, color: '#d6d0c4', conceal: true, rough: true },
    marsh:    { name: 'Marsh',     cost: { foot: 3, tracked: 4, wheeled: X }, def: 1.2,  color: '#c6d6ae', rough: true },
    river:    { name: 'River',     cost: { foot: 3, tracked: 4, wheeled: X }, def: 0.8,  color: '#d3dfb2' },
    water:    { name: 'Lake',      cost: { foot: X, tracked: X, wheeled: X }, def: 1.0,  color: '#8fbcdb' },
  };

  // mp: movement points, atk/def: base factors, steps: strength steps, value: AI worth.
  WG.UNIT_TYPES = {
    armor: { name: 'Armor',               short: 'ARM',   move: 'tracked', mp: 6, atk: 8, def: 5, range: 1, vision: 2, steps: 4, armored: true, value: 1.4 },
    mech:  { name: 'Mechanized Infantry', short: 'MECH',  move: 'tracked', mp: 5, atk: 6, def: 6, range: 1, vision: 2, steps: 4, armored: true, value: 1.2 },
    inf:   { name: 'Infantry',            short: 'INF',   move: 'foot',    mp: 3, atk: 4, def: 6, range: 1, vision: 2, steps: 4, value: 1.0 },
    recon: { name: 'Reconnaissance',      short: 'RECCE', move: 'wheeled', mp: 8, atk: 2, def: 3, range: 1, vision: 4, steps: 2, value: 0.8 },
    at:    { name: 'Anti-Armor',          short: 'AT',    move: 'wheeled', mp: 4, atk: 4, def: 5, range: 1, vision: 2, steps: 3, antiArmor: true, value: 0.9 },
    arty:  { name: 'Field Artillery',     short: 'FA',    move: 'tracked', mp: 4, atk: 7, def: 2, range: 3, vision: 2, steps: 3, indirect: true, value: 1.1 },
    hq:    { name: 'Brigade HQ',          short: 'HQ',    move: 'wheeled', mp: 5, atk: 1, def: 2, range: 1, vision: 2, steps: 2, echelon: 'X', command: 3, value: 1.5 },
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
})(window.WG);
