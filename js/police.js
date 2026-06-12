// ============ POLICE SYSTEM ============
// Patrol cops wander the roads. Heat builds when you do crimes; heat sets
// your wanted level (0-5). High wanted = more cops, checkpoints, chases,
// and at level 5 a hideout raid. Cops that touch you while chasing = busted.

const WANTED_THRESHOLDS = [0, 15, 35, 55, 75, 92]; // heat needed for each star

class Police {
  constructor(map) {
    this.map = map;
    this.cops = [];
    this.checkpoints = [];
    this.raidTimer = -1;       // counts down to a hideout raid at wanted 5
    this.spawnPoint = map.pois.find(p => p.kind === 'police');
  }

  wantedFromHeat(heat) {
    let w = 0;
    for (let i = 1; i <= 5; i++) if (heat >= WANTED_THRESHOLDS[i]) w = i;
    return w;
  }

  targetCopCount(wanted, lockdown) {
    return 6 + wanted * 3 + (lockdown ? 6 : 0);
  }

  // BFS over walkable tiles; returns a list of [tx, ty] steps (start excluded)
  // or null if unreachable. Shared buffers keep this allocation-free.
  findPath(sx, sy, tx, ty) {
    const m = this.map, W = MAP_W, H = MAP_H;
    if (!m.copWalkable(sx, sy) || !m.copWalkable(tx, ty)) return null;
    if (sx === tx && sy === ty) return [];
    if (!this._vis) { this._vis = new Int32Array(W * H); this._par = new Int32Array(W * H); this._q = new Int32Array(W * H); this._stamp = 0; }
    const vis = this._vis, par = this._par, q = this._q, stamp = ++this._stamp;
    const si = sy * W + sx, ti = ty * W + tx;
    let qh = 0, qt = 0;
    q[qt++] = si; vis[si] = stamp;
    while (qh < qt) {
      const cur = q[qh++];
      if (cur === ti) {
        const path = [];
        for (let i = ti; i !== si; i = par[i]) path.push([i % W, (i / W) | 0]);
        return path.reverse();
      }
      const cx = cur % W, cy = (cur / W) | 0;
      if (cx + 1 < W) this._visit(cx + 1, cy, cur, stamp, q, qt) && qt++;
      if (cx - 1 >= 0) this._visit(cx - 1, cy, cur, stamp, q, qt) && qt++;
      if (cy + 1 < H) this._visit(cx, cy + 1, cur, stamp, q, qt) && qt++;
      if (cy - 1 >= 0) this._visit(cx, cy - 1, cur, stamp, q, qt) && qt++;
    }
    return null;
  }
  _visit(nx, ny, from, stamp, q, qt) {
    const ni = ny * MAP_W + nx;
    if (this._vis[ni] === stamp || !this.map.copWalkable(nx, ny)) return false;
    this._vis[ni] = stamp; this._par[ni] = from; q[qt] = ni;
    return true;
  }

  nearestCopWalkable(tx, ty) {
    for (let r = 0; r < 15; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (this.map.copWalkable(tx + dx, ty + dy)) return { tx: tx + dx, ty: ty + dy };
      }
    }
    return { tx, ty };
  }

  spawnCop(nearStation) {
    const m = this.map;
    let tx, ty, tries = 0;
    do {
      if (nearStation && this.spawnPoint) {
        tx = this.spawnPoint.tx + Math.floor(Math.random() * 7) - 3;
        ty = this.spawnPoint.ty + Math.floor(Math.random() * 7) - 3;
      } else {
        tx = Math.floor(Math.random() * 84); ty = Math.floor(Math.random() * MAP_H);
      }
      tries++;
    } while (!m.copWalkable(tx, ty) && tries < 80);
    if (!m.copWalkable(tx, ty)) ({ tx, ty } = this.nearestCopWalkable(this.spawnPoint.tx, this.spawnPoint.ty + 2));
    this.cops.push({
      x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE,
      path: null, repathT: 0,
      stuckT: 0, stuckX: (tx + 0.5) * TILE, stuckY: (ty + 0.5) * TILE, stuckCount: 0,
      chasing: false, stun: 0, undercover: Math.random() < 0.18,
      speed: 110 + Math.random() * 20,
    });
  }

  // Pick a fresh patrol destination and a path to it. Prefers roads so cops
  // visibly cruise the streets, but accepts any walkable tile as fallback.
  pickPatrolTarget(cop) {
    const m = this.map;
    const ctx = Math.floor(cop.x / TILE), cty = Math.floor(cop.y / TILE);
    for (let i = 0; i < 40; i++) {
      const tx = clamp(ctx + Math.floor(Math.random() * 51) - 25, 0, 83);
      const ty = clamp(cty + Math.floor(Math.random() * 51) - 25, 0, MAP_H - 1);
      const wantRoad = i < 30; // first tries insist on a road
      if (!m.copWalkable(tx, ty) || (wantRoad && m.at(tx, ty) !== T_ROAD)) continue;
      const path = this.findPath(ctx, cty, tx, ty);
      if (path && path.length) { cop.path = path; return; }
    }
    // nowhere reachable from here: this cop is in a sealed pocket, relocate
    const safe = this.nearestCopWalkable(this.spawnPoint.tx, this.spawnPoint.ty + 2);
    cop.x = (safe.tx + 0.5) * TILE; cop.y = (safe.ty + 0.5) * TILE;
    cop.path = null;
  }

  update(dt, game) {
    const p = game.player;
    const wanted = game.wanted();
    const lockdown = game.economy.eventIs('lockdown');

    // population control
    const target = this.targetCopCount(wanted, lockdown);
    while (this.cops.length < target) this.spawnCop(this.cops.length % 2 === 0);
    if (this.cops.length > target) {
      // calm cops walk off duty
      const idx = this.cops.findIndex(c => !c.chasing);
      if (idx >= 0) this.cops.splice(idx, 1);
    }

    const vision = game.policeVision() * TILE;
    for (const cop of this.cops) {
      if (cop.stun > 0) { cop.stun -= dt; continue; }
      const dx = p.x - cop.x, dy = p.y - cop.y;
      const dist = Math.hypot(dx, dy);

      // detection: wanted 4+ means cops actively hunt on sight
      const sees = dist < vision * (cop.undercover ? 1.25 : 1) && !game.inSewerSafe;
      if (sees && (wanted >= 4 || (wanted >= 1 && dist < vision * 0.5 && game.carriedRisk() > 0 && wanted >= 2))) {
        if (!cop.chasing) { cop.chasing = true; if (game.hasWorker('scout') || dist < vision) game.toast('🚨 A cop is chasing you! (Q = smoke bomb)'); }
      }
      if (cop.chasing && (wanted === 0 || dist > vision * 3.2 || game.inSewerSafe)) cop.chasing = false;

      // movement: follow a BFS path so cops never get pinned on buildings
      const ctx = Math.floor(cop.x / TILE), cty = Math.floor(cop.y / TILE);
      if (cop.chasing) {
        cop.repathT -= dt;
        if (cop.repathT <= 0 || !cop.path || !cop.path.length) {
          cop.path = this.findPath(ctx, cty, Math.floor(p.x / TILE), Math.floor(p.y / TILE));
          cop.repathT = 0.5;
        }
      } else if (!cop.path || !cop.path.length) {
        this.pickPatrolTarget(cop);
      }

      let mx = 0, my = 0;
      if (cop.chasing && dist < TILE * 1.6) {
        // close enough: steer straight at the player for the grab
        mx = dx / (dist || 1); my = dy / (dist || 1);
      } else if (cop.path && cop.path.length) {
        const [nx, ny] = cop.path[0];
        const px = (nx + 0.5) * TILE, py = (ny + 0.5) * TILE;
        const nd = Math.hypot(px - cop.x, py - cop.y);
        if (nd < TILE * 0.45) cop.path.shift();
        else { mx = (px - cop.x) / nd; my = (py - cop.y) / nd; }
      }
      const spd = cop.chasing ? cop.speed * (lockdown ? 1.15 : 1) : cop.speed * 0.45;
      this.moveWithCollision(cop, mx * spd * dt, my * spd * dt);

      // watchdog: a cop that hasn't covered ground in 1.5s is stuck — give it
      // a new route; three strikes and it gets relocated to the station
      cop.stuckT += dt;
      if (cop.stuckT >= 1.5) {
        const moved = Math.hypot(cop.x - cop.stuckX, cop.y - cop.stuckY);
        if (moved < TILE * 0.4 && cop.stun <= 0) {
          cop.path = null; cop.repathT = 0;
          if (++cop.stuckCount >= 3) {
            const safe = this.nearestCopWalkable(this.spawnPoint.tx, this.spawnPoint.ty + 2);
            cop.x = (safe.tx + 0.5) * TILE; cop.y = (safe.ty + 0.5) * TILE;
            cop.stuckCount = 0;
          }
        } else cop.stuckCount = 0;
        cop.stuckT = 0; cop.stuckX = cop.x; cop.stuckY = cop.y;
      }

      // scout warning
      if (game.hasWorker('scout') && dist < vision * 1.6 && !cop.warned) { cop.warned = true; }
      else if (dist > vision * 2) cop.warned = false;

      // bust
      if (cop.chasing && dist < TILE * 0.85) game.bust('A patrol officer grabbed you!');
    }

    // checkpoints appear at wanted >= 3
    if (wanted >= 3 && this.checkpoints.length < 2) this.spawnCheckpoint(game);
    if (wanted < 3) this.checkpoints = [];
    for (const cp of this.checkpoints) {
      cp.cool = Math.max(0, cp.cool - dt);
      const d = Math.hypot(p.x - cp.x, p.y - cp.y);
      if (d < TILE * 2.4 && cp.cool === 0) {
        cp.cool = 6;
        game.checkpointScan();
      }
    }

    // raid countdown at wanted 5
    if (wanted >= 5 && this.raidTimer < 0) {
      this.raidTimer = 25;
      game.toast('🚨 WANTED LEVEL 5 — CITY LOCKDOWN! A raid on your hideout is being organized! (25s)');
    }
    if (this.raidTimer >= 0) {
      this.raidTimer -= dt;
      if (this.raidTimer < 0) {
        if (game.wanted() >= 4) game.hideoutRaid();
        this.raidTimer = -1;
      } else if (game.wanted() < 4) {
        this.raidTimer = -1;
        game.toast('Raid called off — you cooled down in time.');
      }
    }
  }

  spawnCheckpoint(game) {
    const m = this.map, p = game.player;
    for (let i = 0; i < 60; i++) {
      const tx = Math.floor(Math.random() * 84), ty = Math.floor(Math.random() * MAP_H);
      if (m.at(tx, ty) !== T_ROAD) continue;
      const d = Math.hypot(tx - p.x / TILE, ty - p.y / TILE);
      if (d < 12 || d > 38) continue;
      this.checkpoints.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, cool: 0 });
      game.toast('🛑 Police set up a checkpoint — check the minimap.');
      return;
    }
  }

  smokeBomb() {
    for (const cop of this.cops) { cop.chasing = false; cop.stun = 4.5; }
  }

  // simple slide collision against non-walkable tiles
  moveWithCollision(e, dx, dy) {
    const m = this.map, r = TILE * 0.3;
    const ok = (x, y) =>
      m.copWalkable(Math.floor((x - r) / TILE), Math.floor((y - r) / TILE)) &&
      m.copWalkable(Math.floor((x + r) / TILE), Math.floor((y - r) / TILE)) &&
      m.copWalkable(Math.floor((x - r) / TILE), Math.floor((y + r) / TILE)) &&
      m.copWalkable(Math.floor((x + r) / TILE), Math.floor((y + r) / TILE));
    if (ok(e.x + dx, e.y)) e.x += dx;
    if (ok(e.x, e.y + dy)) e.y += dy;
  }
}
