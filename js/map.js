// ============ MAPS ============
// Two same-sized tile worlds: the mainland City and Smuggler's Isle (reached
// by ferry at 550 rep). Each provides its own POIs, escape network, district
// layout and colors. The global districtAt() delegates to whichever map is
// currently active.

const MAP_W = 100, MAP_H = 70, TILE = 26;

// Tile types
const T_BLOCK = 0;   // building (not walkable)
const T_ROAD = 1;
const T_ALLEY = 2;
const T_PLAZA = 3;
const T_WATER = 4;   // walkable only with boat
const T_DOCK = 5;
const T_PARK = 6;

// ---- active-map plumbing ----
let ACTIVE_MAP = null;
function setActiveMap(m) { ACTIVE_MAP = m; }
function districtAt(tx, ty) { return ACTIVE_MAP ? ACTIVE_MAP.districtAt(tx, ty) : 'downtown'; }

// ---- city districts ----
const DISTRICT_ZONES = [
  { id: 'slums',       x0: 0,  y0: 0,  x1: 36, y1: 32 },
  { id: 'downtown',    x0: 36, y0: 0,  x1: 62, y1: 32 },
  { id: 'warehouse',   x0: 62, y0: 0,  x1: 84, y1: 44 },
  { id: 'blackmarket', x0: 30, y0: 32, x1: 56, y1: 50 },
  { id: 'rich',        x0: 0,  y0: 32, x1: 30, y1: 70 },
  { id: 'downtown',    x0: 30, y0: 50, x1: 62, y1: 70 },
  { id: 'warehouse',   x0: 62, y0: 44, x1: 84, y1: 70 },
];
function cityDistrictAt(tx, ty) {
  if (tx >= 84) return 'docks';
  for (const z of DISTRICT_ZONES) {
    if (tx >= z.x0 && tx < z.x1 && ty >= z.y0 && ty < z.y1) return z.id;
  }
  return 'downtown';
}
function islandDistrictAt(tx, ty) {
  if (tx < 36) return 'island_port';
  if (ty < 36) return 'island_resort';
  return 'island_smuggler';
}

const CITY_TINTS = {
  slums: ['#3a322c', '#43382e', '#383028'], downtown: ['#33363f', '#3a3d48', '#2f323a'],
  blackmarket: ['#3a2f3a', '#342a36', '#40333f'], rich: ['#3d4038', '#464a40', '#41443c'],
  warehouse: ['#41382f', '#4a4036', '#3b332b'], docks: ['#3c3c34', '#44443a', '#36362f'],
};
const ISLAND_TINTS = {
  island_port: ['#3a4038', '#41483c', '#36403a'],
  island_resort: ['#46413a', '#4e4940', '#433f36'],
  island_smuggler: ['#34403e', '#3b4a46', '#2f413c'],
};

// Carve a plaza around a spot and dig a corridor to the nearest road/dock.
function carveSpot(map, tx, ty) {
  const { at, set } = map;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (at(tx + dx, ty + dy) === T_BLOCK) set(tx + dx, ty + dy, T_PLAZA);
  }
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let best = null;
  for (const [dx, dy] of dirs) {
    for (let i = 1; i < 30; i++) {
      const t = at(tx + dx * i, ty + dy * i);
      if (t === undefined) break;
      if (t === T_ROAD || t === T_DOCK) { if (!best || i < best.len) best = { dx, dy, len: i }; break; }
      if (t === T_WATER) break;
    }
  }
  if (best) for (let i = 1; i < best.len; i++) {
    if (at(tx + best.dx * i, ty + best.dy * i) === T_BLOCK) set(tx + best.dx * i, ty + best.dy * i, T_ALLEY);
  }
}

// Shared finalize: connect POIs/sewers, set walkability, district + colors.
function finalizeMap(map, rnd, districtFn, tints) {
  for (const p of map.pois) carveSpot(map, p.tx, p.ty);
  for (const s of map.sewers) carveSpot(map, s.tx, s.ty);

  const at = map.at;
  map.walkable = (tx, ty, hasBoat) => {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    const t = at(tx, ty);
    if (t === T_WATER) return !!hasBoat;
    return t !== T_BLOCK;
  };
  map.copWalkable = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    const t = at(tx, ty);
    return t !== T_BLOCK && t !== T_WATER;
  };
  map.districtAt = districtFn;

  map.blockColor = new Array(MAP_W * MAP_H);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (at(x, y) === T_BLOCK) {
      const arr = tints[districtFn(x, y)] || Object.values(tints)[0];
      map.blockColor[y * MAP_W + x] = arr[Math.floor(rnd() * arr.length)];
    }
  }
  return map;
}

function newGrid() {
  const tiles = new Array(MAP_W * MAP_H).fill(T_BLOCK);
  return {
    tiles,
    at: (x, y) => tiles[y * MAP_W + x],
    set: (x, y, t) => { if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) tiles[y * MAP_W + x] = t; },
  };
}

// =================== THE CITY ===================
function buildMap() {
  const map = newGrid();
  const { at, set } = map;

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 88; x < MAP_W; x++) set(x, y, T_WATER);
    for (let x = 84; x < 88; x++) set(x, y, T_DOCK);
  }
  for (let x = 0; x < 84; x++) {
    for (const ry of [4, 14, 24, 34, 44, 54, 64]) { set(x, ry, T_ROAD); set(x, ry + 1, T_ROAD); }
  }
  for (let y = 0; y < MAP_H; y++) {
    for (const rx of [4, 18, 32, 46, 60, 74]) {
      if (at(rx, y) !== T_WATER && at(rx, y) !== T_DOCK) { set(rx, y, T_ROAD); set(rx + 1, y, T_ROAD); }
    }
  }

  let seed = 1337;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  for (let by = 0; by < 7; by++) {
    for (let bx = 0; bx < 6; bx++) {
      const x0 = [4, 18, 32, 46, 60, 74][bx] + 2, y0 = [4, 14, 24, 34, 44, 54][by] + 2;
      const x1 = ([18, 32, 46, 60, 74, 84][bx]) - 1, y1 = ([14, 24, 34, 44, 54, 64][by]) - 1;
      if (rnd() < 0.75) {
        const ay = y0 + 1 + Math.floor(rnd() * Math.max(1, y1 - y0 - 2));
        for (let x = x0 - 2; x <= x1 + 1; x++) if (at(x, ay) === T_BLOCK) set(x, ay, T_ALLEY);
      }
      if (rnd() < 0.6) {
        const ax = x0 + 1 + Math.floor(rnd() * Math.max(1, x1 - x0 - 2));
        for (let y = y0 - 2; y <= y1 + 1; y++) if (at(ax, y) === T_BLOCK) set(ax, y, T_ALLEY);
      }
    }
  }
  for (let y = 47; y < 53; y++) for (let x = 8; x < 16; x++) set(x, y, T_PARK);

  map.pois = [
    { id: 'dealer_slums',  kind: 'dealer', name: "Vinny's Pawn Shop",   icon: '🏚️', tx: 10, ty: 9,  tier: 0, repReq: 0 },
    { id: 'dealer_docks',  kind: 'dealer', name: 'Dockside Crates',     icon: '⚓', tx: 85, ty: 30, tier: 1, repReq: 50 },
    { id: 'dealer_wh',     kind: 'dealer', name: 'Warehouse 7 Dealer',  icon: '🏭', tx: 70, ty: 20, tier: 2, repReq: 150 },
    { id: 'dealer_bm',     kind: 'dealer', name: 'Black Market Bazaar', icon: '🕯️', tx: 42, ty: 40, tier: 3, repReq: 400, gearShop: true },
    { id: 'buyer_dt',      kind: 'buyer',  name: 'Downtown Fence',      icon: '🏪', tx: 50, ty: 10, repReq: 0 },
    { id: 'buyer_docks',   kind: 'buyer',  name: 'Dock Exporter',       icon: '🚢', tx: 85, ty: 50, repReq: 50 },
    { id: 'buyer_bm',      kind: 'buyer',  name: 'Underground Broker',  icon: '🎩', tx: 52, ty: 46, repReq: 150 },
    { id: 'buyer_rich',    kind: 'buyer',  name: 'Penthouse Client',    icon: '🏨', tx: 20, ty: 60, repReq: 400 },
    { id: 'ferry_city',    kind: 'ferry',  name: "Ferry to Smuggler's Isle", icon: '⛴️', tx: 86, ty: 18, repReq: 550, to: 'island' },
    { id: 'hideout',       kind: 'hideout', name: 'Your Hideout',       icon: '🏠', tx: 26, ty: 28 },
    { id: 'police',        kind: 'police',  name: 'Central Precinct',   icon: '🏛️', tx: 47, ty: 26 },
    { id: 'police_slums',  kind: 'police',  name: 'Slums Precinct',     icon: '🏛️', tx: 15, ty: 17 },
    { id: 'police_north',  kind: 'police',  name: 'North Precinct',     icon: '🏛️', tx: 76, ty: 10 },
    { id: 'police_rich',   kind: 'police',  name: 'Hilltop Precinct',   icon: '🏛️', tx: 8,  ty: 66 },
    { id: 'police_south',  kind: 'police',  name: 'South Precinct',     icon: '🏛️', tx: 40, ty: 56 },
    { id: 'police_docks',  kind: 'police',  name: 'Harbor Precinct',    icon: '🏛️', tx: 80, ty: 60 },
    { id: 'warehouse_a',   kind: 'heist',  name: 'Bonded Warehouse A',  icon: '📦', tx: 78, ty: 38, repReq: 150 },
    { id: 'warehouse_b',   kind: 'heist',  name: 'Bonded Warehouse B',  icon: '📦', tx: 66, ty: 58, repReq: 150 },
  ];
  map.sewers = [
    { id: 'sw_slums', name: 'Slums Manhole',     tx: 8,  ty: 20 },
    { id: 'sw_dt',    name: 'Downtown Manhole',  tx: 54, ty: 30 },
    { id: 'sw_rich',  name: 'Rich Dist Manhole', tx: 12, ty: 58 },
    { id: 'sw_wh',    name: 'Warehouse Manhole', tx: 72, ty: 48 },
  ];
  map.districtIds = ['slums', 'downtown', 'blackmarket', 'warehouse', 'rich', 'docks'];
  map.labels = [
    ['THE SLUMS', 9, 12], ['DOWNTOWN', 42, 12], ['WAREHOUSE ROW', 64, 12],
    ['BLACK MARKET', 33, 38], ['RICH DISTRICT', 6, 42], ['THE DOCKS', 84.2, 8],
  ];
  map.water = '#16314a';
  return finalizeMap(map, rnd, cityDistrictAt, CITY_TINTS);
}

// =================== SMUGGLER'S ISLE ===================
function buildIsland() {
  const map = newGrid();
  const { at, set } = map;

  // ocean everywhere, then a landmass with a west-facing dock the ferry uses
  for (let i = 0; i < map.tiles.length; i++) map.tiles[i] = T_WATER;
  const LX0 = 16, LX1 = 84, LY0 = 10, LY1 = 62;
  for (let y = LY0; y < LY1; y++) for (let x = LX0; x < LX1; x++) set(x, y, T_BLOCK);
  for (let y = LY0; y < LY1; y++) for (let x = 12; x < 16; x++) set(x, y, T_DOCK);

  // roads (2 wide). horizontals reach the dock so the ferry connects.
  for (let x = 16; x < LX1; x++) for (const ry of [14, 24, 34, 44, 54]) { set(x, ry, T_ROAD); set(x, ry + 1, T_ROAD); }
  for (let y = LY0; y < LY1; y++) for (const rx of [18, 30, 42, 54, 66, 78]) { set(rx, y, T_ROAD); set(rx + 1, y, T_ROAD); }

  let seed = 90210;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // alleys through the blocks
  for (let by = 0; by < 5; by++) for (let bx = 0; bx < 6; bx++) {
    const x0 = [18, 30, 42, 54, 66, 78][bx] + 2, y0 = [14, 24, 34, 44, 54][by] + 2;
    const x1 = ([30, 42, 54, 66, 78, 84][bx]) - 1, y1 = ([24, 34, 44, 54, 62][by]) - 1;
    if (rnd() < 0.7) { const ay = y0 + 1 + Math.floor(rnd() * Math.max(1, y1 - y0 - 2)); for (let x = x0 - 2; x <= x1 + 1; x++) if (at(x, ay) === T_BLOCK) set(x, ay, T_ALLEY); }
    if (rnd() < 0.6) { const ax = x0 + 1 + Math.floor(rnd() * Math.max(1, x1 - x0 - 2)); for (let y = y0 - 2; y <= y1 + 1; y++) if (at(ax, y) === T_BLOCK) set(ax, y, T_ALLEY); }
  }
  // a palm park
  for (let y = 46; y < 52; y++) for (let x = 70; x < 80; x++) set(x, y, T_PARK);

  map.pois = [
    { id: 'ferry_island', kind: 'ferry',  name: 'Ferry back to the City', icon: '⛴️', tx: 14, ty: 34, repReq: 0, to: 'city' },
    { id: 'dealer_isle',  kind: 'dealer', name: "Smuggler's Isle Bazaar", icon: '🏝️', tx: 26, ty: 20, tier: 5, repReq: 550, gearShop: true },
    { id: 'buyer_resort', kind: 'buyer',  name: 'Resort High-Roller',     icon: '🍸', tx: 64, ty: 18, repReq: 550 },
    { id: 'buyer_wharf',  kind: 'buyer',  name: "Smuggler's Wharf",       icon: '🛥️', tx: 40, ty: 50, repReq: 550 },
    { id: 'safehouse',    kind: 'hideout', name: 'Island Safe House',     icon: '🏖️', tx: 54, ty: 28 },
    { id: 'isle_police1', kind: 'police',  name: 'Isle Patrol HQ',        icon: '🏛️', tx: 48, ty: 40 },
    { id: 'isle_police2', kind: 'police',  name: 'Cove Watch',            icon: '🏛️', tx: 70, ty: 14 },
    { id: 'isle_heist',   kind: 'heist',   name: "Smuggler's Vault",      icon: '📦', tx: 74, ty: 56, repReq: 550 },
  ];
  map.sewers = [
    { id: 'cove_n',   name: 'Hidden Cove (North)', tx: 24, ty: 14 },
    { id: 'cove_e',   name: 'Hidden Cove (East)',  tx: 80, ty: 24 },
    { id: 'mangrove', name: 'Mangrove Tunnel',     tx: 36, ty: 56 },
    { id: 'cliff',    name: 'Cliffside Path',      tx: 60, ty: 44 },
  ];
  map.districtIds = ['island_port', 'island_resort', 'island_smuggler'];
  map.labels = [
    ['ISLE PORT', 18, 9], ['RESORT STRIP', 50, 9], ["SMUGGLER'S WHARF", 40, 61],
  ];
  map.water = '#0e3a40'; // warmer tropical water
  return finalizeMap(map, rnd, islandDistrictAt, ISLAND_TINTS);
}
