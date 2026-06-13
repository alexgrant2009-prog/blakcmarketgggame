// ============ POLICE SYSTEM ============
// Patrol cops wander the roads. Heat builds when you do crimes; heat sets
// your wanted level (0-5). High wanted = more cops, checkpoints, chases,
// and at level 5 a hideout raid. Cops that touch you while chasing = busted.

const WANTED_THRESHOLDS = [0, 15, 35, 55, 75, 92]; // heat needed for each star

class Police {
  constructor(map) {
    this.bindMap(map);
  }

  // Point the force at a (new) map: fresh patrols, that map's precincts.
  bindMap(map) {
    this.map = map;
    this.cops = [];
    this.checkpoints = [];
    this.raidTimer = -1;       // counts down to a hideout raid at wanted 5
    this.stations = map.pois.filter(p => p.kind === 'police');
  }

  randomStation() { return this.stations[Math.floor(Math.random() * this.stations.length)]; }
  nearestStation(x, y) {
    let best = this.stations[0], bd = Infinity;
    for (const s of this.stations) {
      const d = Math.hypot((s.tx + 0.5) * TILE - x, (s.ty + 0.5) * TILE - y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  wantedFromHeat(heat) {
    let w = 0;
    for (let i = 1; i <= 5; i++) if (heat >= WANTED_THRESHOLDS[i]) w = i;
    return w;
  }

  targetCopCount(wanted, lockdown) {
    return 10 + wanted * 4 + (lockdown ? 8 : 0);
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

  // True if no building tile sits on the straight line between two points
  hasLineOfSight(x0, y0, x1, y1) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE * 0.4));
    for (let i = 1; i < steps; i++) {
      const x = x0 + (x1 - x0) * i / steps, y = y0 + (y1 - y0) * i / steps;
      if (this.map.at(Math.floor(x / TILE), Math.floor(y / TILE)) === T_BLOCK) return false;
    }
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
    const station = this.randomStation();
    let tx, ty, tries = 0;
    do {
      if (nearStation) {
        tx = station.tx + Math.floor(Math.random() * 7) - 3;
        ty = station.ty + Math.floor(Math.random() * 7) - 3;
      } else {
        tx = Math.floor(Math.random() * 84); ty = Math.floor(Math.random() * MAP_H);
      }
      tries++;
    } while (!m.copWalkable(tx, ty) && tries < 80);
    if (!m.copWalkable(tx, ty)) ({ tx, ty } = this.nearestCopWalkable(station.tx, station.ty + 2));
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
    const st = this.nearestStation(cop.x, cop.y);
    const safe = this.nearestCopWalkable(st.tx, st.ty + 2);
    cop.x = (safe.tx + 0.5) * TILE; cop.y = (safe.ty + 0.5) * TILE;
    cop.path = null;
  }

  update(dt, game) {
    const p = game.player;
    const wanted = game.wanted();
    const lockdown = game.economy.eventIs('lockdown');
    this.shoveCool = Math.max(0, (this.shoveCool || 0) - dt);

    // population control
    const target = this.targetCopCount(wanted, lockdown);
    while (this.cops.length < target) this.spawnCop(this.cops.length % 2 === 0);
    this.despawnT = Math.max(0, (this.despawnT || 0) - dt);
    if (this.cops.length > target && this.despawnT === 0) {
      // one cop per second clocks off — always the idle one farthest from
      // the player, so an officer next to you never just vanishes
      this.despawnT = 1;
      let idx = -1, bd = -1;
      for (let i = 0; i < this.cops.length; i++) {
        const c = this.cops[i];
        if (c.chasing) continue;
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d > bd) { bd = d; idx = i; }
      }
      if (idx >= 0) this.cops.splice(idx, 1);
    }

    const vision = game.policeVision() * TILE;
    const inSafe = game.inHideoutZone();
    if (inSafe && this.cops.some(c => c.chasing)) {
      game.toast('🏠 You made it home — the cops won\'t touch you in your hideout.');
    }
    for (const cop of this.cops) {
      if (cop.stun > 0) { cop.stun -= dt; continue; }
      const dx = p.x - cop.x, dy = p.y - cop.y;
      const dist = Math.hypot(dx, dy);

      // detection is by SIGHT: buildings block the view. A cop who sees you
      // carrying contraband — or sees you with any wanted star — gives chase.
      const carrying = game.carriedRisk() > 0;
      const losClear = this.hasLineOfSight(cop.x, cop.y, p.x, p.y);
      const inSight = dist < vision * (cop.undercover ? 1.25 : 1) && losClear && !game.inSewerSafe && !inSafe;
      if (inSight && (carrying || wanted >= 1)) {
        if (!cop.chasing) { cop.chasing = true; game.toast('🚨 A cop spotted you and is chasing! (Q = smoke bomb, or break his line of sight)'); }
        cop.lostT = 0;
      }
      // losing the chase: stay out of his sight for 2.5s, get far away,
      // or vanish into the sewers
      if (cop.chasing) {
        if (dist < vision * 2.5 && losClear && !game.inSewerSafe && !inSafe) cop.lostT = 0;
        else {
          cop.lostT = (cop.lostT || 0) + dt;
          if (cop.lostT > 2.5 || dist > vision * 3.2 || game.inSewerSafe || inSafe) cop.chasing = false;
        }
      }

      // movement: follow a BFS path so cops never get pinned on buildings
      const ctx = Math.floor(cop.x / TILE), cty = Math.floor(cop.y / TILE);
      if (cop.chasing) {
        cop.repathT -= dt;
        if (cop.repathT <= 0 || !cop.path || !cop.path.length) {
          cop.path = this.findPath(ctx, cty, Math.floor(p.x / TILE), Math.floor(p.y / TILE));
          cop.repathT = 0.5;
        }
      } else if (wanted >= 4 && (wanted >= 5 || dist < TILE * 30)) {
        // manhunt: at wanted 4+ the whole force converges on your position
        cop.huntT = (cop.huntT || 0) - dt;
        if (cop.huntT <= 0) {
          cop.path = this.findPath(ctx, cty, Math.floor(p.x / TILE), Math.floor(p.y / TILE)) || cop.path;
          cop.huntT = 2.5;
        }
        if (!cop.path || !cop.path.length) this.pickPatrolTarget(cop);
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
      const spd = cop.chasing ? cop.speed * (lockdown ? 1.15 : 1) : cop.speed * (wanted >= 4 ? 0.7 : 0.45);
      this.moveWithCollision(cop, mx * spd * dt, my * spd * dt);

      // watchdog: a cop that hasn't covered ground in 1.5s is stuck — give it
      // a new route; three strikes and it gets relocated to the station
      cop.stuckT += dt;
      if (cop.stuckT >= 1.5) {
        const moved = Math.hypot(cop.x - cop.stuckX, cop.y - cop.stuckY);
        if (moved < TILE * 0.4 && cop.stun <= 0) {
          cop.path = null; cop.repathT = 0;
          if (++cop.stuckCount >= 3) {
            const st = this.nearestStation(cop.x, cop.y);
            const safe = this.nearestCopWalkable(st.tx, st.ty + 2);
            cop.x = (safe.tx + 0.5) * TILE; cop.y = (safe.ty + 0.5) * TILE;
            cop.stuckCount = 0;
          }
        } else cop.stuckCount = 0;
        cop.stuckT = 0; cop.stuckX = cop.x; cop.stuckY = cop.y;
      }

      // scout warning
      if (game.hasWorker('scout') && dist < vision * 1.6 && !cop.warned) { cop.warned = true; }
      else if (dist > vision * 2) cop.warned = false;

      // contact with an officer ALWAYS has consequences — except at home
      if (inSafe) {
        // untouchable inside the hideout safe zone
      } else if (cop.chasing && dist < TILE * 1.3) {
        game.bust('A cop caught you. In this city, getting caught means death.');
      } else if (dist < TILE * 1.1) {
        if (carrying || wanted >= 2) {
          game.bust('You walked straight into an officer while dirty. Instant death.');
        } else if (this.shoveCool <= 0) {
          // clean and low heat: you get shoved off and warned, heat rises
          this.shoveCool = 1.2;
          const n = dist || 1;
          game.player.x = cop.x + (dx / n) * TILE * 1.8;
          game.player.y = cop.y + (dy / n) * TILE * 1.8;
          const s = game.findWalkableNear(Math.floor(game.player.x / TILE), Math.floor(game.player.y / TILE));
          game.player.x = s.x; game.player.y = s.y;
          game.addHeat(5);
          game.toast('👮 "Watch it!" The officer shoves you back. Keep pushing your luck and see what happens.');
        }
      }
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
