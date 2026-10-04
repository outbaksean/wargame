'use strict';

// "Strait Crisis": a notional PRC invasion of Taiwan sometime 2026–2031.
// Forces are rough open-source estimates abstracted to brigades, ship groups and squadrons.
(function (WG) {
  const { Hex } = WG;

  // Fixed coastal surveillance radars: [side, lon, lat, range (hexes), level]
  const SENSORS = [
    ['blue', 121.72, 25.14, 5, 2], ['blue', 121.10, 25.05, 5, 2], ['blue', 120.92, 24.82, 5, 2], ['blue', 120.52, 24.30, 5, 2],
    ['blue', 120.20, 23.45, 5, 2], ['blue', 120.16, 23.00, 5, 2], ['blue', 120.30, 22.58, 5, 2], ['blue', 119.57, 23.57, 5, 2],
    ['blue', 118.35, 24.44, 4, 2], ['blue', 119.93, 26.16, 4, 2], ['blue', 121.60, 23.99, 5, 2], ['blue', 121.14, 22.76, 5, 2],
    ['blue', 123.00, 24.46, 5, 2],
    ['red', 119.78, 25.52, 5, 2], ['red', 119.55, 25.95, 5, 2], ['red', 118.85, 24.95, 5, 2], ['red', 118.15, 24.52, 5, 2],
    ['red', 119.50, 25.60, 30, 1], // over-the-horizon radar: tracks, not targeting quality
  ];

  const NAMES = {
    prc: 'PRC', roc: 'Taiwan', us: 'United States', jp: 'Japan',
  };

  function spot(G, lon, lat, sea, move, side) {
    const map = G.map;
    let c = map.at(lon, lat);
    if (!c) {
      const p = map.toXY(lon, lat);
      let best = null;
      for (const t of map.list) { const d = Math.hypot(t.x - p.x, t.y - p.y); if (!best || d < best.d) best = { t, d }; }
      c = best.t;
    }
    for (let rad = 0; rad <= 6; rad++) {
      const ring = Hex.within(c.q, c.r, rad).filter((h) => Hex.distance(h.q, h.r, c.q, c.r) === rad);
      for (const h of ring) {
        const t = G.tile(h.q, h.r);
        if (!t) continue;
        if (sea) {
          if (!G.isSea(t) && !(t.city && t.city.port && t.city.owner === side)) continue;
          if (G.unitAt(t.q, t.r, null, 'sea')) continue;
        } else {
          if (G.isSea(t) || !isFinite(G.terr(t).cost[move])) continue;
          if (G.unitAt(t.q, t.r, null, 'land')) continue;
        }
        return t;
      }
    }
    return null;
  }

  const COUNTRY = { prc: 'CN', roc: 'TW', us: 'US', jp: 'JP' };
  const SIDE = { prc: 'red', roc: 'blue', us: 'blue', jp: 'blue' };

  function U(G, faction, type, name, lon, lat, extra = {}) {
    const ut = WG.UNIT_TYPES[type];
    const sea = ut.domain !== 'land';
    const t = spot(G, lon, lat, sea, ut.move, SIDE[faction]);
    if (!t) return null;
    return G.addUnit(Object.assign({
      type, side: SIDE[faction], faction, name, q: t.q, r: t.r, country: COUNTRY[faction],
      echelon: ut.domain === 'land' ? 'X' : undefined,
    }, extra));
  }

  function ship(G, faction, type, name, lon, lat, cargo = []) {
    const s = U(G, faction, type, name, lon, lat);
    if (!s) return null;
    for (const [ct, cn, extra] of cargo) {
      const u = G.addUnit(Object.assign({ type: ct, side: s.side, faction, name: cn, q: s.q, r: s.r, country: COUNTRY[faction], echelon: 'X' }, extra || {}));
      G.embark(u, s);
    }
    return s;
  }

  function setupROC(G) {
    const E = { entrenched: true };
    const C = { entrenched: true, echelon: 'XXX' };
    const B = { entrenched: true, echelon: 'II' };
    // North: 6th Army Corps.
    U(G, 'roc', 'hq', '6 Corps HQ', 121.30, 24.93, C);
    U(G, 'roc', 'mech', '269 Mech Bde', 121.22, 24.97, E);
    U(G, 'roc', 'armor', '542 Armor Bde', 120.98, 24.76, E);
    U(G, 'roc', 'inf', '153 Inf Bde', 121.08, 25.03, E);
    U(G, 'roc', 'marine', '66 Marine Bde', 121.45, 25.10, E);
    U(G, 'roc', 'inf', 'Capital Def Bde', 121.56, 25.04, E);
    U(G, 'roc', 'resinf', '1 Reserve Bde', 121.70, 25.10, E);
    U(G, 'roc', 'arty', '21 Arty Cmd', 121.20, 24.88, Object.assign({}, E, { echelon: 'III' }));
    U(G, 'roc', 'rocket', 'HIMARS Bn', 121.35, 24.85, B);
    U(G, 'roc', 'sam', 'Patriot PAC-3 Bn', 121.50, 25.00, B);
    U(G, 'roc', 'asm', 'Harpoon CDCM Bn', 121.15, 25.05, B);
    U(G, 'roc', 'asm', 'HF-3 CDCM Bn N', 121.72, 25.12, B);
    U(G, 'roc', 'lm', 'Altius LM Co', 121.00, 24.90, Object.assign({}, E, { echelon: 'I' }));
    // Central: 10th Army Corps.
    U(G, 'roc', 'hq', '10 Corps HQ', 120.72, 24.12, C);
    U(G, 'roc', 'mech', '234 Mech Bde', 120.62, 24.22, E);
    U(G, 'roc', 'armor', '586 Armor Bde', 120.58, 24.06, E);
    U(G, 'roc', 'inf', '104 Inf Bde', 120.45, 23.75, E);
    U(G, 'roc', 'resinf', '2 Reserve Bde', 120.45, 23.50, E);
    U(G, 'roc', 'arty', '58 Arty Cmd', 120.72, 24.02, Object.assign({}, E, { echelon: 'III' }));
    U(G, 'roc', 'rocket', 'Thunderbolt MLRS Bn', 120.78, 24.20, B);
    U(G, 'roc', 'sam', 'Tien Kung III Bn C', 120.66, 24.28, B);
    U(G, 'roc', 'asm', 'HF-3 CDCM Bn C', 120.55, 24.32, B);
    // South: 8th Army Corps.
    U(G, 'roc', 'hq', '8 Corps HQ', 120.42, 22.88, C);
    U(G, 'roc', 'mech', '333 Mech Bde', 120.28, 23.02, E);
    U(G, 'roc', 'armor', '564 Armor Bde', 120.40, 22.78, E);
    U(G, 'roc', 'marine', '77 Marine Bde', 120.30, 22.62, E);
    U(G, 'roc', 'marine', '99 Marine Bde', 120.35, 22.72, E);
    U(G, 'roc', 'resinf', '3 Reserve Bde', 120.50, 22.66, E);
    U(G, 'roc', 'arty', '43 Arty Cmd', 120.35, 22.92, Object.assign({}, E, { echelon: 'III' }));
    U(G, 'roc', 'sam', 'Patriot PAC-3 Bn S', 120.36, 22.70, B);
    U(G, 'roc', 'asm', 'Harpoon CDCM Bn S', 120.22, 22.90, B);
    U(G, 'roc', 'lm', 'Switchblade LM Co', 120.28, 23.12, Object.assign({}, E, { echelon: 'I' }));
    // East and outlying islands.
    U(G, 'roc', 'inf', 'Hualien Def Cmd', 121.60, 23.98, E);
    U(G, 'roc', 'inf', 'Taitung Def Cmd', 121.14, 22.76, E);
    U(G, 'roc', 'resinf', 'Yilan Reserve Bde', 121.75, 24.76, E);
    U(G, 'roc', 'inf', 'Penghu Def Cmd', 119.57, 23.57, E);
    U(G, 'roc', 'asm', 'HF-3 Btry Penghu', 119.62, 23.66, Object.assign({}, E, { echelon: 'I' }));
    U(G, 'roc', 'inf', 'Kinmen Def Cmd', 118.35, 24.44, E);
    U(G, 'roc', 'inf', 'Matsu Def Cmd', 119.93, 26.16, E);
    // Navy.
    U(G, 'roc', 'ddg', 'Kee Lung DDG Div', 121.95, 24.55);
    U(G, 'roc', 'ffg', '168 Fleet FFG', 122.00, 24.75);
    U(G, 'roc', 'ffg', '124 Fleet FFG', 120.15, 22.50);
    U(G, 'roc', 'ffg', '146 Fleet FFG', 119.45, 23.62);
    U(G, 'roc', 'fac', 'Tuo Chiang Corvettes', 121.80, 25.25);
    U(G, 'roc', 'fac', 'Kuang Hua VI Boats', 120.05, 23.15);
    U(G, 'roc', 'ssk', 'Hai Kun Sub Grp', 120.00, 22.35);
    U(G, 'roc', 'usv', 'ROC Drone Boats', 121.25, 25.20);
  }

  function setupUS(G, access) {
    U(G, 'us', 'ddg', 'DESRON 15', 122.95, 23.35);
    U(G, 'us', 'ssn', 'SSN Group West', 122.15, 21.55);
    U(G, 'us', 'ssn', 'SSN Group North', 122.65, 25.75);
    if (access !== 'none') U(G, 'us', 'asm', '12 MLR NMESIS Btry', 123.00, 24.46, { echelon: 'I', entrenched: true });
    if (access === 'full') U(G, 'us', 'asm', '3 MLR NMESIS Btry', 121.95, 20.45, { echelon: 'I', entrenched: true });
  }

  function setupJP(G) {
    U(G, 'jp', 'ddg', 'JMSDF Escort Flotilla 4', 123.15, 25.40);
  }

  function setupPRC(G) {
    if (G.state.force === 'surge') {
      ship(G, 'prc', 'amph', 'ATF North 5', 119.85, 25.70, [['amphmech', '72 GA 5 Amph Bde (2)']]);
      ship(G, 'prc', 'amph', 'ATF South 5', 118.95, 24.40, [['marine', '5 Marine Bde']]);
      ship(G, 'prc', 'amph', 'ATF Center', 119.40, 24.75, [['amphmech', '73 GA 14 Amph Bde (2)']]);
      U(G, 'prc', 'ddg', '055 SAG South', 119.25, 24.40);
      U(G, 'prc', 'ffg', '054A Escort Center 2', 119.60, 25.15);
    }
    // Northern amphibious task force, loaded and at sea.
    ship(G, 'prc', 'amph', 'ATF North 1', 119.95, 25.45, [['amphmech', '5 Amph CA Bde']]);
    ship(G, 'prc', 'amph', 'ATF North 2', 120.00, 25.30, [['marine', '1 Marine Bde']]);
    ship(G, 'prc', 'amph', 'ATF North 3', 119.92, 25.62, [['amphmech', '124 Amph CA Bde']]);
    ship(G, 'prc', 'amph', 'ATF North 4', 120.12, 25.60, [['marine', '4 Marine Bde']]);
    U(G, 'prc', 'ddg', '052D SAG North', 120.08, 25.42);
    U(G, 'prc', 'ffg', '054A Escort North', 120.05, 25.55);
    U(G, 'prc', 'mcm', 'MCM Group North', 120.10, 25.30);
    // Southern amphibious task force.
    ship(G, 'prc', 'amph', 'ATF South 1', 118.98, 24.62, [['amphmech', '14 Amph CA Bde']]);
    ship(G, 'prc', 'amph', 'ATF South 2', 118.85, 24.50, [['marine', '2 Marine Bde']]);
    ship(G, 'prc', 'amph', 'ATF South 3', 119.08, 24.75, [['amphmech', '91 Amph CA Bde']]);
    ship(G, 'prc', 'amph', 'ATF South 4', 119.20, 24.68, [['amphmech', '1 Amph CA Bde']]);
    U(G, 'prc', 'ddg', '052D SAG South', 119.10, 24.60);
    U(G, 'prc', 'ffg', '054A Escort South', 118.98, 24.45);
    U(G, 'prc', 'mcm', 'MCM Group South', 119.15, 24.50);
    // Penghu group.
    ship(G, 'prc', 'amph', 'ATF Penghu', 119.25, 24.20, [['marine', '3 Marine Bde']]);
    U(G, 'prc', 'ffg', '054A Escort Penghu', 119.35, 24.15);
    // Ro-ro ferries in port with the follow-on echelon (need a captured port to unload).
    ship(G, 'prc', 'roro', 'Ro-Ro Flotilla 1', 119.47, 25.99, [['armor', '72 GA Heavy CA Bde']]);
    ship(G, 'prc', 'roro', 'Ro-Ro Flotilla 2', 119.12, 25.20, [['mech', '73 GA Medium CA Bde']]);
    ship(G, 'prc', 'roro', 'Ro-Ro Flotilla 3', 118.68, 24.88, [['mech', '74 GA Medium CA Bde']]);
    // Blue-water screen, carrier and submarines.
    U(G, 'prc', 'ddg', '055 SAG', 121.85, 26.10);
    U(G, 'prc', 'ffg', '054A Screen East', 121.35, 25.80);
    U(G, 'prc', 'ddg', '052D SAG Center', 119.55, 24.95);
    U(G, 'prc', 'ffg', '054B Escort Center', 119.45, 24.85);
    U(G, 'prc', 'fac', '056A Corvettes N', 119.90, 24.95);
    U(G, 'prc', 'fac', '056A Corvettes S', 119.30, 24.30);
    U(G, 'prc', 'cv', 'Shandong CSG', 122.90, 21.65);
    U(G, 'prc', 'ddg', 'Shandong Escort', 122.75, 21.75);
    U(G, 'prc', 'ssk', '039B Sub Grp 1', 122.30, 24.20);
    U(G, 'prc', 'ssk', '039B Sub Grp 2', 121.20, 21.50);
    U(G, 'prc', 'ssk', '039A Sub Grp 3', 120.70, 25.65);
    U(G, 'prc', 'ssn', '093B SSN', 123.10, 22.60);
    // Mainland: headquarters, second echelon, fires, air defense, EW.
    U(G, 'prc', 'hq', 'ETC Joint Landing HQ', 119.38, 25.72, { echelon: 'XXXX' });
    U(G, 'prc', 'hq', '73 GA HQ', 118.72, 24.92, { echelon: 'XXX' });
    U(G, 'prc', 'armor', '72 GA 10 Heavy Bde', 119.45, 25.93);
    U(G, 'prc', 'amphmech', '74 GA 125 Amph Bde', 119.12, 25.23);
    U(G, 'prc', 'mech', '73 GA 86 Med Bde', 118.12, 24.52);
    U(G, 'prc', 'inf', '31 GA Light Bde', 119.78, 25.52);
    U(G, 'prc', 'armor', '73 GA 3 Heavy Bde', 118.70, 24.90);
    U(G, 'prc', 'mech', '71 GA 35 Med Bde', 119.30, 25.45);
    U(G, 'prc', 'airborne', '127 Airborne Bde', 119.44, 25.66);
    U(G, 'prc', 'airborne', '128 Airborne Bde', 118.59, 24.80);
    U(G, 'prc', 'lrocket', 'PHL-16 Bde North', 119.55, 25.55);
    U(G, 'prc', 'lrocket', 'PHL-16 Bde South', 118.90, 24.95);
    U(G, 'prc', 'arty', '73 GA Arty Bde', 118.18, 24.55);
    U(G, 'prc', 'lasm', 'YJ-12B CDCM Bde', 119.50, 25.45);
    U(G, 'prc', 'lasm', 'YJ-12B CDCM Bde 2', 118.80, 24.82);
    U(G, 'prc', 'sam', 'HQ-9 Bde North', 119.40, 25.62, { echelon: 'X' });
    U(G, 'prc', 'sam', 'HQ-9 Bde South', 118.70, 24.85, { echelon: 'X' });
    U(G, 'prc', 'ew', 'ISF EW Regt', 119.70, 25.50, { echelon: 'III' });
  }

  // ---------- air order of battle (abstract squadrons of ~12-24 aircraft)
  const AIR = {
    // Off-map base boxes. tier sets tanker needs; requires = political access.
    bases: [
      { id: 'kadena', name: 'Kadena AB (Okinawa)', side: 'blue', tier: 'close', shelters: 2, ad: 6, bmd: 4, country: 'JP', requires: 'japan', region: 'Japan' },
      { id: 'naha', name: 'Naha AB (Okinawa)', side: 'blue', tier: 'close', shelters: 1, ad: 4, bmd: 2, country: 'JP', requires: 'japan', region: 'Japan' },
      { id: 'iwakuni', name: 'MCAS Iwakuni', side: 'blue', tier: 'medium', shelters: 2, ad: 3, bmd: 2, country: 'JP', requires: 'japan', region: 'Japan' },
      { id: 'misawa', name: 'Misawa AB', side: 'blue', tier: 'medium', shelters: 2, ad: 3, bmd: 1, country: 'JP', requires: 'japan', region: 'Japan' },
      { id: 'luzon', name: 'EDCA sites (N. Luzon)', side: 'blue', tier: 'medium', shelters: 0, ad: 2, bmd: 0, country: 'PH', requires: 'ph', region: 'Philippines' },
      { id: 'csg5', name: 'CSG-5 (CVN-73), Philippine Sea', side: 'blue', tier: 'medium', carrier: true, organicTankers: true, shelters: 0, ad: 10, bmd: 6, country: 'US', region: 'Carrier', zone: 'eas' },
      { id: 'csg3', name: 'CSG-3 (CVN-72), Philippine Sea', side: 'blue', tier: 'medium', carrier: true, organicTankers: true, shelters: 0, ad: 10, bmd: 6, country: 'US', region: 'Carrier', zone: 'eas', arrives: 8 },
      { id: 'guam', name: 'Andersen AFB (Guam)', side: 'blue', tier: 'far', shelters: 1, ad: 5, bmd: 5, country: 'US', region: 'Guam' },
      { id: 'zhejiang', name: 'Zhejiang bases (Luqiao, Ningbo)', side: 'red', tier: 'close', shelters: 3, ad: 6, bmd: 2, country: 'CN', region: 'PRC' },
      { id: 'guangdong', name: 'Guangdong bases (Jieyang, Shantou)', side: 'red', tier: 'close', shelters: 3, ad: 6, bmd: 2, country: 'CN', region: 'PRC' },
      { id: 'inland', name: 'Inland bomber bases (Anqing, Neixiang)', side: 'red', tier: 'medium', shelters: 4, ad: 5, bmd: 3, country: 'CN', region: 'PRC' },
    ],
    hexBaseInfo: {
      hualien: { shelters: 4, ad: 3 }, // Chiashan mountain hangars
      taitung: { shelters: 2 },
      longtian: { shelters: 2, ad: 4 }, huian: { shelters: 2, ad: 4 }, jinjiang: { shelters: 1, ad: 3 },
      changle: { shelters: 1, ad: 3 }, xiamen: { shelters: 1, ad: 3 },
    },
    squadrons: [
      // Taiwan
      ['roc', 'ftr', 'ROCAF 4 TFW F-16V', 'chiayi'], ['roc', 'ftr', 'ROCAF 5 TFW F-16V', 'hualien'], ['roc', 'ftr', 'ROCAF 5 TFW F-16V (2)', 'hualien'],
      ['roc', 'ftr', 'ROCAF 3 TFW IDF', 'cck'], ['roc', 'ftr', 'ROCAF 1 TFW IDF', 'tainan'], ['roc', 'ftr', 'ROCAF 2 TFW Mirage', 'hsinchu'],
      ['roc', 'aew', 'ROCAF E-2K', 'pingtung'], ['roc', 'mpa', 'ROCN P-3C', 'pingtung'], ['roc', 'uav', 'ROCAF MQ-9B', 'taitung'],
      // United States
      ['us', 'ftr', '18 Wing F-15EX', 'kadena'], ['us', 'ftr5', 'F-22 Det (Kadena)', 'kadena'], ['us', 'aew', 'E-3 AWACS (Kadena)', 'kadena'],
      ['us', 'tanker', 'KC-135 (Kadena)', 'kadena'], ['us', 'mpa', 'P-8A Det (Kadena)', 'kadena'], ['us', 'uav', 'MQ-9 (Kadena)', 'kadena'],
      ['us', 'ftr5', 'MAG-12 F-35B', 'iwakuni'], ['us', 'ftr', '35 FW F-16 (SEAD)', 'misawa'],
      ['us', 'bomber', 'B-1B (Guam)', 'guam'], ['us', 'tanker', 'KC-46 (Guam)', 'guam'], ['us', 'uav', 'MQ-4C Triton', 'guam'],
      ['us', 'ftr5', 'CVW-5 F-35C', 'csg5'], ['us', 'ftr', 'CVW-5 F/A-18E/F', 'csg5'],
      ['us', 'aew', 'CVW-5 E-2D', 'csg5'], ['us', 'ewac', 'CVW-5 EA-18G', 'csg5'],
      // Japan
      ['jp', 'ftr', 'JASDF 9 AW F-15J', 'naha'], ['jp', 'ftr5', 'JASDF 3 AW F-35A', 'misawa'],
      // PRC
      ['prc', 'ftr', 'J-16 Bde (Longtian)', 'longtian'], ['prc', 'ftr', 'J-10C Bde (Hui\'an)', 'huian'], ['prc', 'ftr', 'J-10C Bde (Xiamen)', 'xiamen'],
      ['prc', 'ftr', 'J-16 Bde (Jinjiang)', 'jinjiang'], ['prc', 'aew', 'KJ-500 (Changle)', 'changle'],
      ['prc', 'ftr5', 'J-20 Bde (East)', 'zhejiang'], ['prc', 'ftr5', 'J-20 Bde (East 2)', 'zhejiang'], ['prc', 'ewac', 'J-16D EW Regt', 'zhejiang'],
      ['prc', 'tanker', 'Y-20U Tanker Regt', 'zhejiang'], ['prc', 'aew', 'KJ-500 (East)', 'zhejiang'],
      ['prc', 'ftr5', 'J-20 Bde (South)', 'guangdong'], ['prc', 'ftr', 'J-16 Bde (Guangdong)', 'guangdong'], ['prc', 'uav', 'WZ-7 / TB-001 UAV Bde', 'guangdong'],
      ['prc', 'mpa', 'Y-9Q ASW Regt', 'guangdong'], ['prc', 'uav', 'GJ-2 UAV Regt', 'zhejiang'],
      ['prc', 'bomber', 'H-6K Bomber Div', 'inland'], ['prc', 'bomber', 'H-6N Bomber Regt', 'inland'],
      ['prc', 'ftr', 'Shandong J-15 Air Wing', 'cv:Shandong CSG'],
    ],
    // Salvo = a battalion-sized volley. reach: targets on the map and base-box tiers.
    missiles: {
      red: {
        srbm: { faction: 'prc', name: 'SRBM (DF-11/15/16)', stock: 40, perTurn: 6, power: 6, ballistic: true, reach: ['map'] },
        mrbm: { faction: 'prc', name: 'MRBM (DF-17/21D)', stock: 16, perTurn: 4, power: 7, ballistic: true, antiShip: true, reach: ['map', 'close', 'medium'] },
        irbm: { faction: 'prc', name: 'IRBM (DF-26)', stock: 8, perTurn: 2, power: 7, ballistic: true, antiShip: true, reach: ['map', 'close', 'medium', 'far'] },
        lacm: { faction: 'prc', name: 'Cruise missiles (CJ-10/20)', stock: 14, perTurn: 4, power: 5, reach: ['map', 'close', 'medium'] },
      },
      blue: {
        tlam: { faction: 'us', name: 'Tomahawk (land attack)', stock: 20, perTurn: 4, power: 5, reach: ['map'],
          needs: (G) => G.state.units.some((u) => u.faction === 'us' && (u.type === 'ddg' || u.type === 'ssn')) },
        mst: { faction: 'us', name: 'Maritime Strike Tomahawk', stock: 6, perTurn: 2, power: 5, antiShip: true, reach: ['map'],
          needs: (G) => G.state.units.some((u) => u.faction === 'us' && (u.type === 'ddg' || u.type === 'ssn')) },
        hf2e: { faction: 'roc', name: 'HF-2E cruise missiles (ROC)', stock: 6, perTurn: 2, power: 4, reach: ['map'] },
      },
    },
    // Japanese and Philippine bases depend on the basing-access option (and later, escalation).
    accessOk(G, def) {
      if (def.requires === 'japan') return G.state.access !== 'none' || !!G.state.japanAtWar;
      if (def.requires === 'ph') return G.state.access === 'full' || !!G.state.phOpen;
      return true;
    },
  };

  function setupAir(G) {
    const A = WG.Air;
    if (!A.active()) return;
    const carriers = {};
    for (const u of G.state.units) if (u.type === 'cv') carriers[u.name] = 'cv:' + u.id;
    for (const [faction, type, name, base] of AIR.squadrons) {
      const b = base.startsWith('cv:') ? carriers[base.slice(3)] : base;
      if (!b) continue;
      A.addSquadron({ side: SIDE[faction], faction, type, name, base: b, country: COUNTRY[faction] });
    }
    A.setMissiles('red', AIR.missiles.red);
    if (G.state.force === 'surge') A.st().missiles.red.srbm.left += 20;
    A.setMissiles('blue', AIR.missiles.blue);
  }

  // ---------- escalation and politics
  function japanJoins(G, why) {
    if (G.state.japanAtWar) return;
    G.state.japanAtWar = true;
    G.addLog(null, `Japan enters the war: ${why}. Japanese forces join the Allies and US forces may use every base in Japan.`);
    G.state.pending = G.state.pending || [];
    G.state.pending.push('japan');
  }

  function isMainland(t) { return !!t && t.home === 'red' && t.mass === 'mainland'; }

  // Allied AI restraint: strike the mainland only after the PRC escalated, and never past 8.
  function mainlandOk(G) {
    const e = G.state.escalation;
    if (!e) return false;
    const cost = e.flags['mainland:' + G.state.turn] ? 0 : e.flags.mainland ? 1 : 2;
    return e.level >= 6 && e.level + cost <= 8;
  }

  function onStrike(G, side, tile, baseDef) {
    const S = WG.Space;
    if (!S || !S.active()) return;
    if (side === 'red') {
      const japan = (baseDef && baseDef.region === 'Japan') || (tile && tile.region === 'Yonaguni (Japan)');
      if (japan) { S.escalate('red', 2, 'PRC strikes Japanese territory', 'strikeJapan'); japanJoins(G, 'Japanese territory was attacked'); }
      if (baseDef && baseDef.region === 'Guam') S.escalate('red', 2, 'PRC strikes Guam, US sovereign territory', 'strikeGuam');
      if ((baseDef && baseDef.region === 'Philippines') || (tile && tile.region === 'Batanes (Philippines)')) {
        S.escalate('red', 1, 'PRC strikes the Philippines', 'strikePH');
        G.state.phOpen = true;
      }
    } else {
      const mainland = baseDef ? baseDef.side === 'red' && (baseDef.kind === 'offmap' || isMainland(tile)) : isMainland(tile);
      if (mainland) {
        const e = G.state.escalation;
        S.escalate('blue', e.flags.mainland ? 1 : 2, 'Allied strikes on the Chinese mainland', 'mainland:' + G.state.turn);
        e.flags.mainland = true;
      }
    }
  }

  // ---------- reinforcements
  const PRC_WAVES = [3, 5, 7, 9, 11, 13];
  const WAVE_UNITS = [['mech', 'Med CA Bde'], ['inf', 'Light CA Bde'], ['armor', 'Heavy CA Bde'], ['amphmech', 'Amph CA Bde'], ['marine', 'Marine Bde']];

  function reinforce(G, side) {
    const s = G.state;
    s.reinf = s.reinf || {};
    const once = (id, fn) => { if (!s.reinf[id]) { s.reinf[id] = true; fn(); } };
    const turn = s.turn;
    const A = WG.Air;
    const sq = (faction, type, name, base) => A && A.active() && A.addSquadron({ side: SIDE[faction], faction, type, name, base, country: COUNTRY[faction] });
    if (side === 'red') {
      const waves = G.state.force === 'surge' ? [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : PRC_WAVES;
      waves.forEach((t, i) => {
        if (turn < t) return;
        once('prc-wave-' + t, () => {
          const n = i + 1;
          const [ta, na] = WAVE_UNITS[i % WAVE_UNITS.length];
          const [tb, nb] = WAVE_UNITS[(i + 2) % WAVE_UNITS.length];
          const [tc, nc] = WAVE_UNITS[(i + 1) % WAVE_UNITS.length];
          ship(G, 'prc', 'amph', `Follow-on Amph Sqn ${n}`, 119.85, 25.55, [[ta === 'armor' ? 'amphmech' : ta, `W${n + 1} ${na}`]]);
          ship(G, 'prc', 'roro', `Ro-Ro Group ${n}`, 118.20, 24.52, [[tb, `W${n + 1} ${nb}`]]);
          U(G, 'prc', tc, `W${n + 1} ${nc}`, 119.45, 25.95);
          G.addLog('red', `Follow-on echelon ${n} reaches the embarkation ports.`);
        });
      });
      if (turn >= 4) once('prc-air-4', () => sq('prc', 'ftr5', 'J-20 Bde (Reinforcing)', 'zhejiang'));
      if (turn >= 6) once('prc-air-6', () => sq('prc', 'bomber', 'H-6K 2nd Div', 'inland'));
    } else {
      // Taiwan mobilizes its reserves.
      const mob = [[2, ['Taipei', 'Kaohsiung']], [4, ['Taichung', 'Tainan']], [6, ['Taoyuan']]];
      let k = 4;
      for (const [t, towns] of mob) {
        for (const town of towns) {
          const id = `roc-res-${k++}`;
          if (turn < t) continue;
          once(id, () => {
            const c = G.map.cities.find((x) => x.city.name === town && x.city.owner === 'blue') ||
              G.map.cities.find((x) => x.city.owner === 'blue' && x.mass === 'taiwan');
            if (!c) return;
            const u = U(G, 'roc', 'resinf', `${id.split('-')[2]} Reserve Bde (mobilized)`, c.lon, c.lat);
            if (u) G.addLog('blue', `${u.name} mobilizes at ${town}`);
          });
        }
      }
      if (turn >= 3) once('us-3', () => { U(G, 'us', 'ddg', 'DESRON 7', 123.10, 24.00); G.addLog('blue', 'DESRON 7 arrives from Yokosuka.'); });
      if (turn >= 4) once('us-4', () => {
        U(G, 'us', 'ssn', 'SSN Group South', 121.60, 20.40);
        sq('us', 'ftr5', 'F-35A (Kadena reinforcement)', 'kadena');
        sq('us', 'bomber', 'B-52H (Guam)', 'guam');
        G.addLog('blue', 'US reinforcements: an SSN group, F-35As to Kadena and B-52s to Guam.');
      });
      if (turn >= 5) once('us-5', () => { U(G, 'us', 'usv', 'Replicator USV Grp', 123.10, 23.60); });
      if (turn >= 8) once('us-8', () => {
        U(G, 'us', 'ddg', 'DESRON 21', 123.00, 22.55);
        sq('us', 'ftr5', 'CVW-9 F-35C', 'csg3'); sq('us', 'ftr', 'CVW-9 F/A-18E/F', 'csg3'); sq('us', 'aew', 'CVW-9 E-2D', 'csg3');
        G.addLog('blue', 'A second carrier strike group, CSG-3 (CVN-72), arrives in the Philippine Sea.');
      });
      if (turn >= 10) once('us-10', () => {
        ship(G, 'us', 'amph', 'ARG / 31 MEU', 123.10, 24.80, [['marine', 'US 31 MEU', { echelon: 'III' }]]);
        G.addLog('blue', 'The 31st MEU sails for Taiwan.');
      });
      if (s.japanAtWar) once('jp-war', () => {
        U(G, 'jp', 'ddg', 'JMSDF Escort Flotilla 1', 123.15, 25.60);
        U(G, 'jp', 'ssk', 'JMSDF Sub Grp', 123.00, 25.10);
        U(G, 'jp', 'ffg', 'JMSDF Escort Div 12', 123.15, 24.80);
        G.addLog('blue', 'Japanese naval forces sortie toward the Sakishima Islands.');
      });
      if (s.escalation && s.escalation.level >= 5) japanJoins(G, 'escalation triggers collective self-defense');
    }
  }

  function layMines(G) {
    const rng = WG.rng(4411);
    for (const area of ['north', 'central', 'south', 'penghu']) {
      for (const k of G.map.landingAreas[area]) {
        const t = G.map.tiles.get(k);
        for (const n of Hex.neighbors(t.q, t.r)) {
          const nt = G.tile(n.q, n.r);
          if (nt && G.isSea(nt) && !G.state.mines[nt.key] && rng() < 0.55) {
            G.state.mines[nt.key] = 'blue';
            G.state.minesKnown.blue[nt.key] = true;
          }
        }
      }
    }
  }

  function sensorTiles(G) {
    if (G.map._sensors) return G.map._sensors;
    G.map._sensors = SENSORS.map(([side, lon, lat, range, level], i) => {
      const t = G.map.at(lon, lat);
      return t ? { id: i, side, t, range, level } : null;
    }).filter(Boolean);
    return G.map._sensors;
  }

  const onTaiwan = (G, u) => G.tile(u.q, u.r).mass === 'taiwan';
  const objectiveVP = (G, side) => G.map.cities.filter((c) => c.home === 'blue' && c.city.vp && c.city.owner === side)
    .reduce((s, c) => s + c.city.vp, 0);
  const totalVP = (G) => G.map.cities.filter((c) => c.home === 'blue' && c.city.vp).reduce((s, c) => s + c.city.vp, 0);

  // Placement helpers shared with the tutorial scenario.
  WG.TaiwanKit = { U, ship, SIDE, COUNTRY };

  WG.registerScenario({
    id: 'taiwan',
    name: 'Strait Crisis (Taiwan, 2026–2031)',
    description: 'A notional PRC amphibious invasion of Taiwan. Play the PRC attacker or the US defending alongside AI-controlled Taiwanese forces.',
    sides: { blue: { name: 'Allies' }, red: { name: 'PRC' } },
    factions: {
      prc: { side: 'red', name: NAMES.prc, country: 'CN' },
      roc: { side: 'blue', name: NAMES.roc, country: 'TW' },
      us: { side: 'blue', name: NAMES.us, country: 'US' },
      jp: { side: 'blue', name: NAMES.jp, country: 'JP' },
    },
    roles: [
      { id: 'prc', label: 'PRC (invading) vs AI', controllers: { prc: 'human', roc: 'ai', us: 'ai', jp: 'ai' } },
      { id: 'us', label: 'United States (defending, with AI Taiwan)', controllers: { prc: 'ai', roc: 'ai', us: 'human', jp: 'ai' } },
      { id: 'hotseat', label: 'Hotseat: PRC vs US (Taiwan AI)', controllers: { prc: 'human', roc: 'ai', us: 'human', jp: 'ai' } },
      { id: 'watch', label: 'AI vs AI (watch)', controllers: { prc: 'ai', roc: 'ai', us: 'ai', jp: 'ai' } },
    ],
    options: [
      { id: 'turns', label: 'Length (turn = 12 hours)', choices: [['16', '8 days (16 turns)'], ['20', '10 days (20 turns)'], ['28', '14 days (28 turns)']], value: '20' },
      { id: 'force', label: 'PRC force level', choices: [['estimate', 'Estimate (realistic)'], ['surge', 'Surge (larger sealift, harder for the Allies)']], value: 'estimate' },
      { id: 'access', label: 'Allied basing access', choices: [['full', 'Japan and Philippines'], ['japan', 'Japan only'], ['none', 'None at start']], value: 'full' },
    ],
    unitTypes: ['inf', 'resinf', 'mech', 'armor', 'marine', 'amphmech', 'airborne', 'arty', 'rocket', 'lrocket', 'asm', 'lasm', 'sam', 'ew', 'lm', 'hq',
      'ddg', 'ffg', 'fac', 'cv', 'amph', 'roro', 'mcm', 'usv', 'ssk', 'ssn'],
    air: AIR,
    space: {
      red: { isr: 4, satcom: 3, dazzle: 4, asat: 2 },
      blue: { isr: 4, satcom: 4, dazzle: 3, asat: 1 },
      escalationStart: 3,
    },
    // Japan's own forces only fight once Japan is at war.
    factionActive(G, faction) { return faction !== 'jp' || !!G.state.japanAtWar; },
    onStrike,
    onHostile(G, side, def) {
      if (side === 'red' && def.faction === 'jp' && WG.Space && WG.Space.active()) {
        WG.Space.escalate('red', 2, 'PRC attacks Japanese forces', 'strikeJapan');
        japanJoins(G, 'Japanese forces came under attack');
      }
    },
    onCapture(G, u, t) {
      if (u.side === 'red' && t.region === 'Yonaguni (Japan)') onStrike(G, 'red', t, null);
      if (u.side === 'red' && t.region === 'Batanes (Philippines)') onStrike(G, 'red', t, null);
    },
    onBaseLost(G, def) {
      if (def.carrier && def.side === 'blue' && WG.Space && WG.Space.active()) WG.Space.escalate('red', 1, def.name.split(',')[0] + ' sunk with thousands of sailors aboard');
    },
    onEscalation(G, before, after) {
      if (after >= 5) japanJoins(G, 'escalation triggers collective self-defense');
      if (after >= 6 && !G.state.phOpen) { G.state.phOpen = true; G.addLog(null, 'The Philippines opens its bases to US combat operations.'); }
    },
    onTurnStart(G, side) { reinforce(G, side); },
    statusText(G) {
      const e = G.state.escalation;
      if (!e) return '';
      const cls = e.level >= 8 ? 'bad' : e.level >= 5 ? 'warn' : '';
      return `<span class="chip esc ${cls}" title="Escalation: 5 brings Japan in, 6 lifts Allied restraint on mainland strikes, 10 is catastrophe">Escalation ${e.level}/10</span>` +
        (G.state.japanAtWar ? '<span class="chip jp" title="Japan is at war">Japan at war</span>' : '');
    },
    // Warn a human before an escalatory strike on Japan or Guam.
    confirmStrike(G, side, def) {
      if (side !== 'red' || !def || !['Japan', 'Guam'].includes(def.region)) return Promise.resolve(true);
      const flag = def.region === 'Japan' ? 'strikeJapan' : 'strikeGuam';
      if (G.state.escalation && G.state.escalation.flags[flag]) return Promise.resolve(true);
      return Promise.resolve(window.confirm(def.region === 'Japan'
        ? 'Striking a base in Japan brings Japan into the war and raises escalation by 2. Proceed?'
        : 'Striking Guam (US territory) raises escalation by 2. Proceed?'));
    },
    aiLandingOk(G, side, t) { return side === 'red' ? t.home !== 'red' : t.home !== 'red' && t.mass === 'taiwan'; },
    aiReinforcePorts(G, side) {
      return side === 'blue' ? G.map.cities.filter((c) => c.mass === 'taiwan' && c.city.port && c.city.owner === 'blue').map((c) => c.key) : [];
    },
    spaceFaction: { red: 'prc', blue: 'us' },
    // From turn 4 the PLA's causeway barges let ro-ro ferries unload over the shore next to a beachhead.
    bargeTurn: 4,
    firstSide: 'red',
    maxTurns: 20,
    supplyRange: 8,

    mapOptions() { return {}; },
    buildMap() {
      const m = WG.buildTaiwanMap();
      for (const c of m.cities) c.home = c.home || (c.land === 'mainland' ? 'red' : 'blue');
      return m;
    },

    setup(G, opts) {
      const o = opts.options || {};
      G.state.maxTurns = parseInt(o.turns, 10) || 20;
      G.state.access = o.access || 'full';
      G.state.force = o.force || 'estimate';
      setupROC(G);
      setupUS(G, G.state.access);
      setupJP(G);
      setupPRC(G);
      setupAir(G);
      layMines(G);
      const pick = Math.random();
      G.state.aiPlan = {
        areas: pick < 0.4 ? ['north'] : pick < 0.75 ? ['south'] : ['central'],
        penghu: true,
        strikeJapan: Math.random() < 0.5,
      };
    },

    intro(G) {
      return `D-Day. PRC forces begin a joint landing campaign. ${G.state.maxTurns} turns of 12 hours. The PRC must seize Taipei, or hold enough of Taiwan when the fighting ends.`;
    },

    initialFocus(G, viewer) {
      const p = viewer === 'red' ? G.map.toXY(120.2, 25.0) : G.map.toXY(120.9, 24.2);
      const h = Hex.fromPixel(p.x, p.y);
      return { q: h.q, r: h.r, scale: 0.55 };
    },

    // PRC units on Taiwan draw supply from captured ports and beachheads, limited by sealift nearby.
    supplySources(G, side) {
      const out = [];
      for (const c of G.map.cities) {
        if (c.city.owner !== side) continue;
        if (c.home === side) out.push({ key: c.key, cap: Infinity });
      }
      if (side === 'red') {
        for (const t of G.map.list) if (t.home === 'red' && !G.isSea(t) && t.mass === 'mainland' && t.city) out.push({ key: t.key, cap: Infinity });
        const lift = (t, pred) => Hex.within(t.q, t.r, 1).reduce((n, h) => {
          const s = G.unitAt(h.q, h.r, null, 'sea');
          return n + (s && s.side === side && pred(G.type(s)) ? 1 : 0);
        }, 0);
        for (const c of G.map.cities) {
          if (c.city.owner === 'red' && c.home !== 'red' && c.city.port) out.push({ key: c.key, cap: 3 + 2 * lift(c, (t) => !!t.capacity) });
          else if (c.city.owner === 'red' && c.home !== 'red') out.push({ key: c.key, cap: 1 });
        }
        for (const k in G.state.beachheads) {
          if (G.state.beachheads[k] !== 'red') continue;
          const t = G.map.tiles.get(k);
          out.push({ key: k, cap: 1 + 2 * lift(t, (ty) => ty.beach) });
        }
      }
      return out;
    },

    intelLevel(G, side, e) {
      if (G.type(e).domain !== 'sea') return 0;
      let lvl = 0;
      for (const s of sensorTiles(G)) {
        if (s.side !== side || (G.state.sitesDown && G.state.sitesDown[s.id])) continue;
        if (s.t.city && s.t.city.owner && s.t.city.owner !== side) continue;
        if (Hex.distance(s.t.q, s.t.r, e.q, e.r) <= s.range) lvl = Math.max(lvl, s.level);
      }
      if (lvl === 2 && G.jamFactor(e.side, e.q, e.r) < 1) lvl = 1;
      return lvl;
    },

    income(G) { return { blue: 0, red: objectiveVP(G, 'red') }; },

    // Coastal radar sites can be struck with missiles.
    sensorSites(G) { return sensorTiles(G).filter((x) => x.range <= 6); },
    strikeSite(G, side, missileId, site) {
      const A = WG.Air;
      const d = A.missileDef(side, missileId);
      A.consume(side, missileId);
      const D = G.adCover(site.side, site.t.q, site.t.r, !!d.ballistic);
      const I = D > 0 ? Math.min(0.85, D / (D + d.power)) : 0;
      const hit = d.power * (1 - I) > 2.5 * Math.random();
      if (hit) { G.state.sitesDown = G.state.sitesDown || {}; G.state.sitesDown[site.id] = true; }
      G.addLog(side, `${d.name} salvo at the coastal radar ${G.placeName(site.t)}: ${hit ? 'radar destroyed' : 'missed'}`);
      if (this.onStrike) this.onStrike(G, side, site.t, null);
      G.touch();
    },

    vpHtml(G) {
      const held = objectiveVP(G, 'red');
      return `<span class="vp red" title="Objective points the PRC holds on Taiwan and its islands">PRC objectives <b>${held}</b>/${totalVP(G)}</span>`;
    },

    checkVictory(G, when) {
      const s = G.state;
      const taipei = G.map.cities.find((c) => c.city.capital);
      if (taipei.city.owner === 'red') {
        s.over = true; s.winner = 'red'; s.reason = 'taipei';
        s.reasonText = 'Taipei has fallen. Taiwan\'s government is forced to capitulate.';
        return true;
      }
      if (s.turn >= 8) {
        const ashore = G.allUnitsOf('red').some((u) => G.type(u).domain === 'land' && !u.carrier && onTaiwan(G, u));
        const afloat = G.allUnitsOf('red').some((u) => u.carrier);
        if (!ashore && !afloat) {
          s.over = true; s.winner = 'blue'; s.reason = 'repulsed';
          s.reasonText = 'The invasion has been defeated: no PRC troops remain ashore or afloat.';
          return true;
        }
      }
      if (when === 'end') {
        const held = objectiveVP(G, 'red');
        s.over = true;
        s.reason = 'time';
        if (held >= 20) { s.winner = 'red'; s.reasonText = `The PRC holds ${held} objective points on Taiwan and dictates terms.`; }
        else if (held >= 10) { s.winner = 'draw'; s.reasonText = `Stalemate: the PRC holds a lodgment worth ${held} objective points but cannot finish the job.`; }
        else { s.winner = 'blue'; s.reasonText = `Taiwan holds. The PRC controls only ${held} objective points.`; }
        return true;
      }
      return false;
    },

    resultRows(G) {
      return `<tr><td>PRC objective points</td><td></td><td>${objectiveVP(G, 'red')} / ${totalVP(G)}</td></tr>`;
    },

    ai: {
      subPatrol: {
        red: [[122.50, 23.40], [121.40, 21.30], [122.20, 25.70], [122.90, 22.40]],
        blue: [[120.35, 24.90], [119.90, 23.90], [120.60, 25.40], [119.70, 24.40]],
      },
      carrierStation: { blue: [123.05, 23.10], red: [122.90, 21.60] },
      // Taiwan's navy shelters until an enemy ship comes within reach.
      hold(G, u) {
        if (u.faction !== 'roc') return false;
        const known = G.intel(u.side);
        return !G.state.units.some((e) => e.side !== u.side && known.has(e.id) && G.type(e).domain === 'sea' &&
          Hex.distance(e.q, e.r, u.q, u.r) <= 12);
      },
    },

    aiZoneBonus(G, side, z) {
      const AREA = { north: 'twn', central: 'twc', south: 'tws' };
      if (side === 'red') {
        const areas = (G.state.aiPlan && G.state.aiPlan.areas) || [];
        if (areas.some((a) => AREA[a] === z)) return 6;
        return ['stn', 'stc', 'sts'].includes(z) ? 3 : 0;
      }
      return ['stn', 'stc', 'sts', 'twn', 'twc', 'tws'].includes(z) ? 2 : 0;
    },
    // PRC fires concentrate on defenders of its landing beaches; the Allies on anything that got ashore.
    aiTargetBonus(G, side, e) {
      const t = G.tile(e.q, e.r);
      if (side === 'red' && e.faction === 'jp' && !G.state.japanAtWar && !(G.state.aiPlan && G.state.aiPlan.strikeJapan)) return 0;
      if (side === 'red') {
        const areas = (G.state.aiPlan && G.state.aiPlan.areas) || [];
        const nearBeach = areas.some((a) => (G.map.landingAreas[a] || []).some((k) => {
          const b = G.map.tiles.get(k);
          return Hex.distance(b.q, b.r, e.q, e.r) <= 1;
        }));
        return nearBeach ? 2 : 1;
      }
      return t.home === 'blue' && G.type(e).domain === 'land' ? 1.8 : 1;
    },
    // Taiwan's corps defend their own sectors and only march to landings within reach.
    aiReactRange(G, u) { return u.faction === 'roc' ? 14 : Infinity; },
    aiIsrZones(G, side) {
      const AREA = { north: 'twn', central: 'twc', south: 'tws' };
      if (side === 'red') return [...((G.state.aiPlan && G.state.aiPlan.areas) || []).map((a) => AREA[a]), 'eas'];
      return ['stn', 'stc', 'sts'];
    },
    // PRC AI decides once whether to hit US bases in Japan and Guam; the Allied AI avoids striking the mainland.
    aiMayStrikeBase(G, side, def) {
      const lvl = G.state.escalation ? G.state.escalation.level : 0;
      if (side === 'red') {
        if (def.region === 'Japan' || def.region === 'Guam') {
          const flag = def.region === 'Japan' ? 'strikeJapan' : 'strikeGuam';
          if (G.state.escalation && G.state.escalation.flags[flag]) return true;
          return !!(G.state.aiPlan && G.state.aiPlan.strikeJapan) && lvl + 2 <= 7;
        }
        if (def.region === 'Philippines') return !!G.state.phOpen && lvl <= 7;
        return true;
      }
      // Allied restraint: no strikes on the mainland until the PRC has escalated, and never to catastrophe.
      if (def.side === 'red' && (def.kind === 'offmap' || def.kind === 'hex')) return mainlandOk(G);
      return true;
    },
    aiMayStrikeTile(G, side, t) {
      // Japanese and Philippine soil (Yonaguni's radar, Batanes) follow the same rules as their bases.
      if (side === 'red' && t.region === 'Yonaguni (Japan)') return this.aiMayStrikeBase(G, side, { region: 'Japan' });
      if (side === 'red' && t.region === 'Batanes (Philippines)') return this.aiMayStrikeBase(G, side, { region: 'Philippines' });
      if (side === 'red') return true;
      if (!isMainland(t)) return true;
      return mainlandOk(G);
    },

    cityValue(c, side) { return side === 'red' && c.home === 'blue' ? c.city.vp : 0; },

    helpHtml() {
      return `<p><b>Strait Crisis.</b> The PRC (red) opens the war with an amphibious assault on Taiwan. Each turn is 12 hours.
        <b>The PRC wins</b> instantly by taking Taipei, or at the end by holding at least 20 objective points (towns on Taiwan and its islands);
        10–19 points is a stalemate. <b>The Allies win</b> if the PRC holds fewer than 10, or if from turn 8 no PRC troops are ashore or afloat.
        Taiwanese forces are always computer-controlled.</p>
        <h3>Naval and amphibious</h3>
        <ul>
          <li><b>Embark:</b> select a ground unit next to (or in port with) a transport and click the transport. <b>Land:</b> select the transport, pick the unit aboard, and click a green hex.
          Amphibious squadrons can land on beaches, ports and friendly coast; <b>ro-ro ferries only unload in a port you hold</b>, or, from turn 4 once causeway barges are in place, on coast beside a beachhead.</li>
          <li>Red dashed hexes mean an <b>assault landing</b> against defenders, at reduced strength (marines and amphibious brigades fight better). If the defenders hold, your troops stay aboard.</li>
          <li><b>Supply across the strait:</b> PRC troops on Taiwan draw supply from captured ports (3 + 2 per transport alongside) and beachheads (1 + 2 per amphibious squadron alongside). Keep shipping near the lodgment, where it is exposed.</li>
          <li><b>Mines</b> guard the beach approaches. Ships entering a mined hex may be damaged; minesweepers (MCM) clear their hex and neighbours if they don't move.</li>
          <li>Ships fire anti-ship missiles at range, but only at <b>targetable</b> contacts: seen by your own units or tracked by a coastal radar. Jamming degrades radar tracks to "detected" only.
          Air defense from nearby ships and SAMs intercepts part of every missile salvo; several salvos at one target saturate its defenses.</li>
          <li>Submarines are invisible until an escort with sonar gets close or they fire. Torpedoes ignore air defenses.</li>
          <li><b>Radar on/off:</b> ships and SAMs with radars on are always detectable. Switching off (EMCON) hides them but cuts their air defense.</li>
        </ul>`;
    },
  });
})(window.WG);
