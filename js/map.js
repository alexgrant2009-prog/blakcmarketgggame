// ============ CITY MAP ============
// Tile-based city: roads in a grid, buildings in blocks, alleys carved
// through, water + docks on the east side, sewer fast-travel manholes.

const MAP_W = 100, MAP_H = 70, TILE = 26;

// Tile types
const T_BLOCK = 0;   // building (not walkable)
const T_ROAD = 1;
const T_ALLEY = 2;
const T_PLAZA = 3;
const T_WATER = 4;   // walkable only with boat
const T_DOCK = 5;
const T_PARK = 6;

const DISTRICT_ZONES = [
  { id: 'slums',       x0: 0,  y0: 0,  x1: 36, y1: 32 },
  { id: 'downtown',    x0: 36, y0: 0,  x1: 62, y1: 32 },
  { id: 'warehouse',   x0: 62, y0: 0,  x1: 84, y1: 44 },
  { id: 'blackmarket', x0: 30, y0: 32, x1: 56, y1: 50 },
  { id: 'rich',        x0: 0,  y0: 32, x1: 30, y1: 70 },
  { id: 'downtown',    x0: 30, y0: 50, x1: 62, y1: 70 },
  { id: 'warehouse',   x0: 62, y0: 44, x1: 84, y1: 70 },
];

function districtAt(tx, ty) {
  if (tx >= 84) return 'docks';
  for (const z of DISTRICT_ZONES) {
    if (tx >= z.x0 && tx < z.x1 && ty >= z.y0 && ty < z.y1) return z.id;
  }
  return 'downtown';
}

function buildMap() {
  const tiles = new Array(MAP_W * MAP_H).fill(T_BLOCK);
  const at = (x, y) => tiles[y * MAP_W + x];
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) tiles[y * MAP_W + x] = t; };

  // Water + docks on the east edge
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 88; x < MAP_W; x++) set(x, y, T_WATER);
    for (let x = 84; x < 88; x++) set(x, y, T_DOCK);
  }

  // Road grid (2 tiles wide)
  for (let x = 0; x < 84; x++) {
    for (const ry of [4, 14, 24, 34, 44, 54, 64]) { set(x, ry, T_ROAD); set(x, ry + 1, T_ROAD); }
  }
  for (let y = 0; y < MAP_H; y++) {
    for (const rx of [4, 18, 32, 46, 60, 74]) {
      if (at(rx, y) !== T_WATER && at(rx, y) !== T_DOCK) { set(rx, y, T_ROAD); set(rx + 1, y, T_ROAD); }
    }
  }

  // Deterministic pseudo-random for alleys so the map is stable across loads
  let seed = 1337;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // Carve alleys inside blocks
  for (let by = 0; by < 7; by++) {
    for (let bx = 0; bx < 6; bx++) {
      const x0 = [4, 18, 32, 46, 60, 74][bx] + 2, y0 = [4, 14, 24, 34, 44, 54][by] + 2;
      const x1 = ([18, 32, 46, 60, 74, 84][bx]) - 1, y1 = ([14, 24, 34, 44, 54, 64][by]) - 1;
      if (rnd() < 0.75) { // horizontal alley
        const ay = y0 + 1 + Math.floor(rnd() * Math.max(1, y1 - y0 - 2));
        for (let x = x0 - 2; x <= x1 + 1; x++) if (at(x, ay) === T_BLOCK || at(x, ay) === T_ROAD) { if (at(x, ay) === T_BLOCK) set(x, ay, T_ALLEY); }
      }
      if (rnd() < 0.6) { // vertical alley
        const ax = x0 + 1 + Math.floor(rnd() * Math.max(1, x1 - x0 - 2));
        for (let y = y0 - 2; y <= y1 + 1; y++) if (at(ax, y) === T_BLOCK) set(ax, y, T_ALLEY);
      }
    }
  }

  // A park in the rich district
  for (let y = 47; y < 53; y++) for (let x = 8; x < 16; x++) set(x, y, T_PARK);

  const map = { tiles, at, set };

  // Points of interest. Each gets a small plaza + corridor to the nearest road.
  map.pois = [
    { id: 'dealer_slums',  kind: 'dealer', name: "Vinny's Pawn Shop",   icon: '🏚️', tx: 10, ty: 9,  tier: 0, repReq: 0 },
    { id: 'dealer_docks',  kind: 'dealer', name: 'Dockside Crates',     icon: '⚓', tx: 85, ty: 30, tier: 1, repReq: 50 },
    { id: 'dealer_wh',     kind: 'dealer', name: 'Warehouse 7 Dealer',  icon: '🏭', tx: 70, ty: 20, tier: 2, repReq: 150 },
    { id: 'dealer_bm',     kind: 'dealer', name: 'Black Market Bazaar', icon: '🕯️', tx: 42, ty: 40, tier: 3, repReq: 400, gearShop: true },
    { id: 'buyer_dt',      kind: 'buyer',  name: 'Downtown Fence',      icon: '🏪', tx: 50, ty: 10, repReq: 0 },
    { id: 'buyer_docks',   kind: 'buyer',  name: 'Dock Exporter',       icon: '🚢', tx: 85, ty: 50, repReq: 50 },
    { id: 'buyer_bm',      kind: 'buyer',  name: 'Underground Broker',  icon: '🎩', tx: 52, ty: 46, repReq: 150 },
    { id: 'buyer_rich',    kind: 'buyer',  name: 'Penthouse Client',    icon: '🏨', tx: 20, ty: 60, repReq: 400 },
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

  // Sewer manholes (fast travel; police can't follow)
  map.sewers = [
    { id: 'sw_slums', name: 'Slums Manhole',     tx: 8,  ty: 20 },
    { id: 'sw_dt',    name: 'Downtown Manhole',  tx: 54, ty: 30 },
    { id: 'sw_rich',  name: 'Rich Dist Manhole', tx: 12, ty: 58 },
    { id: 'sw_wh',    name: 'Warehouse Manhole', tx: 72, ty: 48 },
    // Hideout tunnel entry is added dynamically when the upgrade is bought.
  ];

  // Carve plazas around POIs/manholes and connect them to the road grid
  const carveSpot = (tx, ty) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const t = at(tx + dx, ty + dy);
      if (t === T_BLOCK) set(tx + dx, ty + dy, T_PLAZA);
    }
    // corridor: walk left/right/up/down until a road is hit, carve the shortest
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
  };
  for (const p of map.pois) carveSpot(p.tx, p.ty);
  for (const s of map.sewers) carveSpot(s.tx, s.ty);

  map.walkable = (tx, ty, hasBoat) => {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    const t = at(tx, ty);
    if (t === T_WATER) return !!hasBoat;
    return t !== T_BLOCK;
  };
  // Police never use sewers or water
  map.copWalkable = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
    const t = at(tx, ty);
    return t !== T_BLOCK && t !== T_WATER;
  };

  // Building colors per district (precomputed so rendering is cheap & stable)
  map.blockColor = new Array(MAP_W * MAP_H);
  const tints = {
    slums: ['#3a322c', '#43382e', '#383028'], downtown: ['#33363f', '#3a3d48', '#2f323a'],
    blackmarket: ['#3a2f3a', '#342a36', '#40333f'], rich: ['#3d4038', '#464a40', '#41443c'],
    warehouse: ['#41382f', '#4a4036', '#3b332b'], docks: ['#3c3c34', '#44443a', '#36362f'],
  };
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (at(x, y) === T_BLOCK) {
      const arr = tints[districtAt(x, y)] || tints.downtown;
      map.blockColor[y * MAP_W + x] = arr[Math.floor(rnd() * arr.length)];
    }
  }

  return map;
}
