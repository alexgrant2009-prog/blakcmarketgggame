// ============ BLACK MARKET SIMULATOR ============
// Main game: player, input, interactions, missions, UI and rendering.

const SAVE_KEY = 'bms_save_v1';
const ITEM_TIER_REP = [0, 50, 150, 400, 550, 800]; // fallback rep per tier (items may override with repReq)
const AREA_REP = { city: 0, island: 550, keys: 1000 }; // rep needed to enter each area
const DAY_LENGTH = 240;                  // seconds per in-game day

class Game {
  constructor() {
    this.maps = { city: buildMap(), island: buildIsland(), keys: buildDeepIsle() };
    this.area = 'city';
    this.map = this.maps.city;
    setActiveMap(this.map);
    this.economy = new Economy();
    this.police = new Police(this.map);

    const h = this.map.pois.find(p => p.kind === 'hideout');
    const spawn = this.findWalkableNear(h.tx, h.ty + 1);
    this.player = {
      x: spawn.x, y: spawn.y,
      cash: 500, rep: 0, heat: 0,
      inv: {}, stash: {},
      gear: {}, smoke: { city: 1, island: 0, keys: 0 },
      vehicle: 'foot', ownedVehicles: ['foot'],
      workers: [], upgrades: {},
      day: 1, dayT: 0, jail: 0, disguiseUsedDay: 0,
      area: 'city', areaPos: { city: null, island: null, keys: null },
      stats: { earned: 0, busts: 0, missions: 0 },
    };
    this.missions = { offers: [], active: null };
    this.refreshMissionOffers();

    this.keys = {};
    this.toasts = [];
    this.panel = null;          // currently open panel id
    this.inSewerSafe = false;
    this.courierT = 45; this.producerT = 30; this.saveT = 10;
    this.heistCooldowns = {};
    this.bustInfo = null;       // overlay data after a bust

    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.bindInput();
    this.load();
    // sync the active map / police / cache to the saved area
    this.area = this.player.area || 'city';
    this.applyArea();
    // rescue saves where the player ended up inside a wall
    const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE);
    if (!this.map.walkable(ptx, pty, this.vehicle().water)) {
      const safe = this.findWalkableNear(ptx, pty);
      this.player.x = safe.x; this.player.y = safe.y;
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Save the moment the tab is closed, hidden, or switched away from, so
    // progress is never lost between autosaves (covers mobile backgrounding).
    window.addEventListener('beforeunload', () => this.save());
    window.addEventListener('pagehide', () => this.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });

    this.openPanel('help'); // always show the instructions before playing
    this.toast('Welcome to the city. Find a dealer (🏚️) and start small.');

    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
  }

  // Nearest walkable tile center to (tx, ty), spiraling outward.
  findWalkableNear(tx, ty) {
    for (let r = 0; r < 15; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (this.map.walkable(tx + dx, ty + dy, false)) {
          return { x: (tx + dx + 0.5) * TILE, y: (ty + dy + 0.5) * TILE };
        }
      }
    }
    return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }

  // ---------- derived stats ----------
  wanted() { return this.police.wantedFromHeat(this.player.heat); }
  vehicle() { return VEHICLES[this.player.vehicle]; }
  carryCap() { return 8 + (this.player.gear.backpack ? 8 : 0) + this.vehicle().cap; }
  stashCap() { return 20 + (this.player.upgrades.storage || 0) * 30; }
  carried() { return Object.values(this.player.inv).reduce((a, b) => a + b, 0); }
  stashed() { return Object.values(this.player.stash).reduce((a, b) => a + b, 0); }
  carriedRisk() { let r = 0; for (const id in this.player.inv) r += ITEMS[id].risk * this.player.inv[id]; return r; }
  workerSlots() { return 2 + (this.player.upgrades.workroom || 0) * 2; }
  hasWorker(type) { return this.player.workers.some(w => w.type === type); }
  countWorkers(type) { return this.player.workers.filter(w => w.type === type).length; }
  repTier() { let t = REP_TIERS[0]; for (const r of REP_TIERS) if (this.player.rep >= r.rep) t = r; return t; }
  isNight() { return this.player.dayT / DAY_LENGTH > 0.55; }
  policeVision() {
    let v = 6 - (this.player.gear.disguise ? 1.4 : 0) - (this.isNight() ? 0.8 : 0);
    v *= 1 + this.vehicle().susp;
    return Math.max(2.6, v);
  }
  // Smoke bombs are stocked per-area and can't be moved between islands.
  smokeCount() { return (this.player.smoke && this.player.smoke[this.area]) || 0; }
  addSmoke(n) { this.player.smoke[this.area] = this.smokeCount() + n; }
  smokeCost() { return SMOKE_BOMB_COST[this.area] || 1000; }
  itemRepReq(it) { return it.repReq != null ? it.repReq : (ITEM_TIER_REP[it.tier] || 0); }
  itemUnlocked(it) { return this.player.rep >= this.itemRepReq(it); }
  // Safe zone: within ~3.5 tiles of the hideout the police can't touch you
  inHideoutZone() {
    const h = this.map.pois.find(p => p.kind === 'hideout');
    return Math.hypot(this.player.x - (h.tx + 0.5) * TILE, this.player.y - (h.ty + 0.5) * TILE) < TILE * 3.5;
  }
  districtOfPlayer() { return districtAt(Math.floor(this.player.x / TILE), Math.floor(this.player.y / TILE)); }

  addHeat(n) {
    const before = this.wanted();
    this.player.heat = clamp(this.player.heat + n, 0, 110);
    const after = this.wanted();
    if (after > before) {
      const msgs = ['', '👀 Police have noticed you.', '🚓 Extra patrols dispatched.',
        '🛑 Checkpoints are going up!', '🚨 Police are chasing you on sight!', '🔴 CITY LOCKDOWN!'];
      this.toast(`Wanted level ${after}: ${msgs[after]}`);
    }
  }
  addRep(n) {
    const before = this.repTier();
    this.player.rep = Math.max(0, this.player.rep + n);
    const after = this.repTier();
    if (after.rep > before.rep) this.toast(`⭐ Reputation up! You are now a ${after.title}. Unlocked: ${after.perk}`);
  }

  // ---------- input ----------
  bindInput() {
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (k === 'escape') { this.closePanel(); }
      if (this.player.jail > 0) return;
      if (this.bustInfo) { if (k === 'enter' || k === ' ') { this.bustInfo = null; this.respawn(); } return; }
      if (k === 'e') this.interact();
      if (k === 'q') this.useSmoke();
      if (k === 'm') this.togglePanel('missions');
      if (k === 'p') this.togglePanel('prices');
      if (k === 'h') this.togglePanel('help');
      if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
  }

  useSmoke() {
    if (this.smokeCount() <= 0) { this.toast('No smoke bombs here! Buy them from a dealer in this area.'); return; }
    if (!this.police.cops.some(c => c.chasing)) { this.toast('No one is chasing you.'); return; }
    this.addSmoke(-1);
    this.police.smokeBomb();
    this.addHeat(-10);
    this.toast('💨 Smoke bomb! The cops lost you.');
  }

  // ---------- interaction ----------
  nearestInteractable() {
    const px = this.player.x / TILE - 0.5, py = this.player.y / TILE - 0.5;
    let best = null, bd = 2.2;
    for (const poi of this.map.pois) {
      const d = Math.hypot(poi.tx - px, poi.ty - py);
      if (d < bd) { bd = d; best = { type: 'poi', poi }; }
    }
    for (const sw of this.map.sewers) {
      const d = Math.hypot(sw.tx - px, sw.ty - py);
      if (d < Math.min(bd, 1.6)) { bd = d; best = { type: 'sewer', sw }; }
    }
    return best;
  }

  interact() {
    if (this.panel) { this.closePanel(); return; }
    const t = this.nearestInteractable();
    if (!t) return;
    if (t.type === 'sewer') { this.openSewer(t.sw); return; }
    const poi = t.poi;
    if (poi.repReq && this.player.rep < poi.repReq) {
      this.toast(`🔒 ${poi.name} won't deal with you yet. Reach ${poi.repReq} rep.`); return;
    }
    if (poi.kind === 'dealer') this.openDealer(poi);
    else if (poi.kind === 'buyer') this.openBuyer(poi);
    else if (poi.kind === 'hideout') this.openHideout();
    else if (poi.kind === 'heist') this.tryHeist(poi);
    else if (poi.kind === 'ferry') this.travelTo(poi.to);
    else if (poi.kind === 'police') this.toast('Probably best not to walk into the police station.');
  }

  // ---------- travel between the city and the island ----------
  applyArea() {
    this.map = this.maps[this.area];
    setActiveMap(this.map);
    this.police.bindMap(this.map);
    this.buildMapCache();
  }
  travelTo(area) {
    if (!this.maps[area] || area === this.area) return;
    const need = AREA_REP[area] || 0;
    if (this.player.rep < need) {
      this.toast(`🔒 You're not connected enough to go there yet. Reach ${need} rep.`); return;
    }
    const from = this.area;
    this.player.areaPos[from] = { x: this.player.x, y: this.player.y };
    this.area = area; this.player.area = area;
    this.applyArea();
    // arrive at the portal that leads back the way we came (falls back to any)
    const dock = this.map.pois.find(p => p.kind === 'ferry' && p.to === from)
      || this.map.pois.find(p => p.kind === 'ferry');
    const s = this.findWalkableNear(dock.tx, dock.ty + 1);
    this.player.x = s.x; this.player.y = s.y;
    this.player.heat = Math.floor(this.player.heat * 0.5); // crossing shakes some heat; fresh cops
    this.closePanel();
    const arriveMsg = {
      island: "⛴️ Welcome to Smuggler's Isle — premium goods, premium prices. The local cops don't know you... yet.",
      keys: '🕳️ You surface on The Cartel Keys. Deepest, deadliest, richest market of all.',
      city: '⛴️ Back on the mainland.',
    };
    this.toast(arriveMsg[area] || 'You arrive somewhere new.');
  }

  // ---------- trading ----------
  buyItem(itemId, qty, poi) {
    const district = districtAt(poi.tx, poi.ty);
    const price = this.economy.buyPrice(itemId, district);
    qty = Math.min(qty, Math.floor(this.player.cash / price), this.carryCap() - this.carried());
    if (qty <= 0) { this.toast(this.carried() >= this.carryCap() ? 'You cannot carry more!' : 'Not enough cash.'); return; }
    this.player.cash -= price * qty;
    this.player.inv[itemId] = (this.player.inv[itemId] || 0) + qty;
    this.economy.recordBuy(itemId, qty);
    const copNear = this.copNearby();
    this.addHeat(ITEMS[itemId].risk * qty * 0.5 * (copNear ? 2.5 : 1));
    if (copNear) this.toast('⚠️ A cop saw that deal go down!');
    this.renderPanel();
  }

  sellItem(itemId, qty, poi) {
    const have = this.player.inv[itemId] || 0;
    qty = Math.min(qty, have);
    if (qty <= 0) return;
    const district = districtAt(poi.tx, poi.ty);
    const price = this.economy.sellPrice(itemId, district, this);
    const total = price * qty;
    this.player.cash += total;
    this.player.stats.earned += total;
    this.player.inv[itemId] -= qty;
    if (this.player.inv[itemId] <= 0) delete this.player.inv[itemId];
    this.economy.recordSale(itemId, district, qty);
    const copNear = this.copNearby();
    this.addHeat(ITEMS[itemId].risk * qty * 0.7 * (copNear ? 2.5 : 1));
    this.addRep(Math.max(1, Math.round(qty * ITEMS[itemId].risk * 0.6)));
    if (copNear) this.toast('⚠️ A cop saw that deal go down!');

    // mission progress
    const m = this.missions.active;
    if (m && m.itemId === itemId && m.buyerId === poi.id) {
      m.remaining -= qty;
      if (m.remaining <= 0) {
        this.player.cash += m.bonus;
        this.addRep(m.repBonus);
        this.player.stats.missions++;
        this.toast(`✅ Mission complete! Bonus: $${m.bonus} and +${m.repBonus} rep.`);
        this.missions.active = null;
        this.refreshMissionOffers();
      } else this.toast(`📦 Mission: ${m.remaining} × ${ITEMS[itemId].name} still needed here.`);
    }
    this.renderPanel();
  }

  copNearby() {
    const v = this.policeVision() * TILE * 1.15;
    return this.police.cops.some(c => c.stun <= 0 && Math.hypot(c.x - this.player.x, c.y - this.player.y) < v);
  }

  // ---------- heist ----------
  tryHeist(poi) {
    if (this.player.rep < (poi.repReq || 0)) { this.toast(`🔒 Too risky for you. Reach ${poi.repReq} rep.`); return; }
    if (!this.player.gear.lockpick) { this.toast('🗝️ You need a Lockpick Set to break in (sold by dealers).'); return; }
    const cd = this.heistCooldowns[poi.id] || 0;
    if (cd > 0) { this.toast(`This warehouse is locked tight. Try again in ${Math.ceil(cd)}s.`); return; }
    const space = this.carryCap() - this.carried();
    if (space <= 0) { this.toast('Your hands are full — no room for loot.'); return; }
    const pool = ITEM_LIST.filter(i => this.itemUnlocked(i));
    const it = pool[Math.floor(Math.random() * pool.length)];
    const qty = Math.min(space, 2 + Math.floor(Math.random() * 4));
    this.player.inv[it.id] = (this.player.inv[it.id] || 0) + qty;
    this.heistCooldowns[poi.id] = 150;
    this.addHeat(22 + it.risk * 3);
    this.addRep(3);
    this.toast(`🔓 You cracked the warehouse and grabbed ${qty} × ${it.name}! Alarms are blaring...`);
  }

  // ---------- sewers ----------
  openSewer(sw) { this.sewerFrom = sw; this.openPanel('sewer'); }
  sewerTravel(destId) {
    const dest = this.map.sewers.find(s => s.id === destId);
    if (!dest) return;
    this.player.x = (dest.tx + 0.5) * TILE; this.player.y = (dest.ty + 0.5) * TILE;
    this.inSewerSafe = true; setTimeout(() => this.inSewerSafe = false, 1500);
    for (const c of this.police.cops) c.chasing = false;
    this.addHeat(-4);
    this.toast(`🕳️ You emerge from the ${dest.name}. The cops lost your trail.`);
    this.closePanel();
  }

  // ---------- death & raids ----------
  // Getting caught is death: you lose everything you carry, take a cash hit,
  // and wake up back at the hideout. The stash survives you.
  bust(reason) {
    if (this.bustInfo) return;
    const w = this.wanted();
    const lostItems = [];
    for (const id in this.player.inv) lostItems.push(`${this.player.inv[id]} × ${ITEMS[id].name}`);
    // the street takes 50-65% of your cash
    const fine = Math.floor(this.player.cash * (0.5 + Math.random() * 0.15));
    // reputation loss scales with how big you've gotten
    const rep = this.player.rep;
    const repLoss = rep >= 300 ? 50 : rep >= 200 ? 35 : rep >= 100 ? 15 : 5;
    this.player.inv = {};
    this.player.cash -= fine;
    this.addRep(-repLoss);
    this.player.heat = 0;
    this.player.stats.busts++;
    for (const c of this.police.cops) c.chasing = false;
    this.police.checkpoints = [];
    this.bustInfo = { reason, fine, repLoss, lostItems };
    this.closePanel();
    if (this.missions.active) { this.toast('❌ Your mission contract was voided.'); this.missions.active = null; }
  }

  respawn() {
    const h = this.map.pois.find(p => p.kind === 'hideout');
    const s = this.findWalkableNear(h.tx, h.ty + 1);
    this.player.x = s.x; this.player.y = s.y;
    this.player.heat = 0;
    this.toast('You wake up at your hideout, pockets empty. The stash is untouched — back to work.');
  }

  checkpointScan() {
    if (this.carried() === 0) { this.toast('🛑 Checkpoint: nothing to find. They wave you through.'); return; }
    if (this.player.gear.jammer) { this.toast('🛑 Checkpoint scanners glitch out (GPS jammer). You roll through.'); return; }
    let pass = 0.25 + (this.player.gear.license ? 0.45 : 0) +
      (this.player.gear.backpack && this.carried() <= 8 ? 0.2 : 0);
    if (Math.random() < pass) { this.toast('🛑 Checkpoint search... your papers hold up. Heart pounding.'); this.addHeat(5); }
    else this.bust('A checkpoint search found your contraband!');
  }

  hideoutRaid() {
    const guards = Math.min(2, this.countWorkers('guard'));
    let frac = 0.4 * (this.player.upgrades.cameras ? 0.75 : 1) * (1 - 0.2 * guards);
    const vaulted = this.player.upgrades.vault ? 0.5 : 0;
    let lost = 0;
    for (const id in this.player.stash) {
      const exposed = Math.ceil(this.player.stash[id] * (1 - vaulted));
      const take = Math.floor(exposed * frac);
      this.player.stash[id] -= take; lost += take;
      if (this.player.stash[id] <= 0) delete this.player.stash[id];
    }
    this.player.heat = 50;
    this.toast(lost > 0
      ? `🔦 POLICE RAIDED YOUR HIDEOUT! They seized ${lost} items from your stash.`
      : '🔦 Police raided your hideout but found nothing. Nice security.');
  }

  // ---------- missions ----------
  refreshMissionOffers() {
    const buyers = this.map.pois.filter(p => p.kind === 'buyer' && this.player.rep >= (p.repReq || 0));
    const items = ITEM_LIST.filter(i => this.itemUnlocked(i));
    this.missions.offers = [];
    for (let i = 0; i < 3; i++) {
      const it = items[Math.floor(Math.random() * items.length)];
      const buyer = buyers[Math.floor(Math.random() * buyers.length)];
      const qty = 3 + Math.floor(Math.random() * 7);
      this.missions.offers.push({
        itemId: it.id, qty, remaining: qty, buyerId: buyer.id, buyerName: buyer.name,
        bonus: Math.round(it.base * qty * 0.45), repBonus: Math.max(2, qty * it.risk),
        desc: `Deliver ${qty} × ${it.name} to ${buyer.name}`,
      });
    }
  }
  // Always-available street work so a broke player can climb back in
  doOddJob() {
    if ((this.oddJobT || 0) > 0) return;
    this.oddJobT = 45;
    const pay = 60;
    this.player.cash += pay;
    this.toast(`🧹 You ran errands around the block. +$${pay}. Honest work... gross.`);
    this.renderPanel();
  }

  acceptMission(idx) {
    if (this.missions.active) { this.toast('Finish or abandon your current contract first.'); return; }
    this.missions.active = this.missions.offers.splice(idx, 1)[0];
    this.toast(`📋 Contract accepted: ${this.missions.active.desc}`);
    this.renderPanel();
  }
  abandonMission() {
    if (!this.missions.active) return;
    this.missions.active = null; this.addRep(-2);
    this.toast('Contract abandoned (-2 rep).');
    this.refreshMissionOffers(); this.renderPanel();
  }

  // ---------- hideout actions ----------
  moveToStash(itemId, qty) {
    qty = Math.min(qty, this.player.inv[itemId] || 0, this.stashCap() - this.stashed());
    if (qty <= 0) { this.toast('Stash is full or nothing to move.'); return; }
    this.player.inv[itemId] -= qty; if (this.player.inv[itemId] <= 0) delete this.player.inv[itemId];
    this.player.stash[itemId] = (this.player.stash[itemId] || 0) + qty;
    this.renderPanel();
  }
  moveToInv(itemId, qty) {
    qty = Math.min(qty, this.player.stash[itemId] || 0, this.carryCap() - this.carried());
    if (qty <= 0) { this.toast('You cannot carry more.'); return; }
    this.player.stash[itemId] -= qty; if (this.player.stash[itemId] <= 0) delete this.player.stash[itemId];
    this.player.inv[itemId] = (this.player.inv[itemId] || 0) + qty;
    this.renderPanel();
  }
  buyUpgrade(id) {
    const up = UPGRADES[id], lvl = this.player.upgrades[id] || 0;
    if (lvl >= up.levels.length) return;
    if (this.player.rep < up.repReq) { this.toast(`Requires ${up.repReq} rep.`); return; }
    const cost = up.levels[lvl];
    if (this.player.cash < cost) { this.toast('Not enough cash.'); return; }
    this.player.cash -= cost;
    this.player.upgrades[id] = lvl + 1;
    if (id === 'tunnel') this.addHideoutTunnel();
    this.toast(`🔨 Built: ${up.name}${up.levels.length > 1 ? ' Lv' + (lvl + 1) : ''}`);
    this.renderPanel();
  }
  hireWorker(type) {
    const w = WORKERS[type];
    if (this.player.workers.length >= this.workerSlots()) { this.toast('No free worker slots. Upgrade the Worker Room.'); return; }
    if (this.player.rep < w.repReq) { this.toast(`Requires ${w.repReq} rep.`); return; }
    if (this.player.cash < w.cost) { this.toast('Not enough cash.'); return; }
    this.player.cash -= w.cost;
    this.player.workers.push({ type, name: randName() });
    this.toast(`🤝 Hired ${this.player.workers[this.player.workers.length - 1].name} the ${w.name}.`);
    this.renderPanel();
  }
  fireWorker(idx) {
    const w = this.player.workers.splice(idx, 1)[0];
    if (w) this.toast(`${w.name} packed up and left.`);
    this.renderPanel();
  }
  buyVehicle(id) {
    const v = VEHICLES[id];
    if (!this.player.upgrades.garage) { this.toast('Build the Garage upgrade first.'); return; }
    if (this.player.rep < v.repReq) { this.toast(`Requires ${v.repReq} rep.`); return; }
    if (this.player.cash < v.cost) { this.toast('Not enough cash.'); return; }
    this.player.cash -= v.cost;
    this.player.ownedVehicles.push(id);
    this.player.vehicle = id;
    this.toast(`${v.icon} Bought a ${v.name}!`);
    this.renderPanel();
  }
  selectVehicle(id) { this.player.vehicle = id; this.renderPanel(); }
  buyGear(id) {
    const g = GEAR[id];
    if (this.player.gear[id]) return;
    if (this.player.rep < g.repReq) { this.toast(`Requires ${g.repReq} rep.`); return; }
    if (this.player.cash < g.cost) { this.toast('Not enough cash.'); return; }
    this.player.cash -= g.cost;
    this.player.gear[id] = true;
    this.toast(`${g.icon} Acquired: ${g.name}`);
    this.renderPanel();
  }
  buySmoke() {
    const cost = this.smokeCost();
    if (this.player.cash < cost) { this.toast('Not enough cash.'); return; }
    this.player.cash -= cost; this.addSmoke(1);
    this.renderPanel();
  }
  useDisguiseStation() {
    if (!this.player.upgrades.disguiseStation) return;
    if (this.player.disguiseUsedDay === this.player.day) { this.toast('Already used today. Come back tomorrow.'); return; }
    this.player.disguiseUsedDay = this.player.day;
    this.player.heat = 0;
    for (const c of this.police.cops) c.chasing = false;
    this.toast('🎭 New face, clean record. Heat wiped to zero.');
    this.renderPanel();
  }

  onEventStart(ev) {
    this.toast('📢 ' + this.economy.eventName());
    if (ev.def.id === 'lockdown') this.addHeat(Math.max(0, WANTED_THRESHOLDS[3] - this.player.heat));
  }

  // ---------- update ----------
  frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.update(dt);
    this.render();
    requestAnimationFrame(tt => this.frame(tt));
  }

  update(dt) {
    const p = this.player;

    // jail
    if (p.jail > 0) {
      p.jail -= dt;
      if (p.jail <= 0) {
        p.jail = 0;
        const st = this.police.nearestStation(p.x, p.y);
        const out = this.findWalkableNear(st.tx, st.ty + 2);
        p.x = out.x; p.y = out.y;
        this.toast('You are released. Keep your head down for a while.');
      }
      this.updateHUD();
      return;
    }

    // day/night clock + salaries
    p.dayT += dt;
    if (p.dayT >= DAY_LENGTH) {
      p.dayT = 0; p.day++;
      this.payday();
    }

    // movement (frozen while a panel is open)
    if (!this.panel && !this.bustInfo) {
      let mx = (this.keys.d || this.keys.arrowright ? 1 : 0) - (this.keys.a || this.keys.arrowleft ? 1 : 0);
      let my = (this.keys.s || this.keys.arrowdown ? 1 : 0) - (this.keys.w || this.keys.arrowup ? 1 : 0);
      if (mx || my) {
        const len = Math.hypot(mx, my); mx /= len; my /= len;
        const v = this.vehicle();
        const onWater = this.map.at(Math.floor(p.x / TILE), Math.floor(p.y / TILE)) === T_WATER;
        let spd = 150 * v.speed * (v.water ? (onWater ? 1.55 : 0.6) : 1);
        this.movePlayer(mx * spd * dt, my * spd * dt);
      }
    }

    // heat decay
    const lockdown = this.economy.eventIs('lockdown');
    let decay = 0.55 * (this.hasWorker('hacker') ? 1.6 : 1);
    p.heat = Math.max(lockdown ? WANTED_THRESHOLDS[3] : 0, p.heat - decay * dt);

    // systems
    this.economy.tick(dt, this);
    this.police.update(dt, this);
    for (const id in this.heistCooldowns) this.heistCooldowns[id] = Math.max(0, this.heistCooldowns[id] - dt);

    // workers
    if (this.hasWorker('courier')) {
      this.courierT -= dt * this.countWorkers('courier');
      if (this.courierT <= 0) {
        this.courierT = 45;
        const ids = Object.keys(p.stash);
        if (ids.length) {
          const id = ids.reduce((a, b) => ITEMS[a].base > ITEMS[b].base ? a : b);
          const price = Math.round(ITEMS[id].base * this.economy.drift[id] * 0.9);
          p.stash[id]--; if (p.stash[id] <= 0) delete p.stash[id];
          p.cash += price; p.stats.earned += price;
          this.economy.recordSale(id, 'downtown', 1);
          this.toast(`🛵 Courier sold 1 × ${ITEMS[id].name} for $${price}.`);
        }
      }
    }
    if (this.hasWorker('producer')) {
      this.producerT -= dt * this.countWorkers('producer') * (p.upgrades.craft ? 2 : 1);
      if (this.producerT <= 0) {
        this.producerT = 30;
        if (this.stashed() < this.stashCap()) {
          p.stash.counterfeit = (p.stash.counterfeit || 0) + 1;
          this.toast('🧪 Producer crafted 1 × Counterfeit Goods into your stash.');
        }
      }
    }

    this.oddJobT = Math.max(0, (this.oddJobT || 0) - dt);

    // nudge broke players toward street work
    if (this.player.cash < 50 && this.carried() === 0 && this.stashed() === 0) {
      this.lowCashHintT = (this.lowCashHintT || 0) - dt;
      if (this.lowCashHintT <= 0) {
        this.lowCashHintT = 40;
        this.toast('💸 Broke? Press M — street work pays $60, zero risk.');
      }
    }

    // autosave
    this.saveT -= dt;
    if (this.saveT <= 0) { this.saveT = 5; this.save(); }

    // toasts
    this.toasts = this.toasts.filter(t0 => (t0.t -= dt) > 0);
    this.updateHUD();
  }

  payday() {
    const p = this.player;
    let bill = 0;
    for (const w of p.workers) bill += WORKERS[w.type].salary;
    if (bill === 0) { this.toast(`☀️ Day ${p.day} begins.`); return; }
    if (p.cash >= bill) {
      p.cash -= bill;
      this.toast(`☀️ Day ${p.day}: paid $${bill} in worker salaries.`);
    } else {
      const quit = p.workers.pop();
      this.toast(`☀️ Day ${p.day}: you couldn't make payroll. ${quit.name} the ${WORKERS[quit.type].name} quit!`);
    }
  }

  movePlayer(dx, dy) {
    const m = this.map, r = TILE * 0.3, boat = this.vehicle().water;
    const ok = (x, y) =>
      m.walkable(Math.floor((x - r) / TILE), Math.floor((y - r) / TILE), boat) &&
      m.walkable(Math.floor((x + r) / TILE), Math.floor((y - r) / TILE), boat) &&
      m.walkable(Math.floor((x - r) / TILE), Math.floor((y + r) / TILE), boat) &&
      m.walkable(Math.floor((x + r) / TILE), Math.floor((y + r) / TILE), boat);
    if (ok(this.player.x + dx, this.player.y)) this.player.x += dx;
    if (ok(this.player.x, this.player.y + dy)) this.player.y += dy;
  }

  toast(msg) {
    this.toasts.push({ msg, t: 6 });
    if (this.toasts.length > 5) this.toasts.shift();
    const log = document.getElementById('log');
    if (log) {
      const div = document.createElement('div');
      div.textContent = msg;
      log.prepend(div);
      while (log.children.length > 40) log.removeChild(log.lastChild);
    }
  }

  // ---------- save / load ----------
  save() {
    try {
      const e = this.economy;
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 2,
        player: this.player,
        econ: { drift: e.drift, demand: e.demand, saturation: e.saturation },
        mission: this.missions,
      }));
      this.saveFailed = false;
    } catch (err) {
      // localStorage can fail in private mode or when full — warn once
      if (!this.saveFailed) { this.saveFailed = true; this.toast('⚠️ Could not save progress — browser storage is blocked or full.'); }
      console.warn('Save failed', err);
    }
  }
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      Object.assign(this.player, s.player);
      Object.assign(this.economy.drift, s.econ.drift);
      Object.assign(this.economy.demand, s.econ.demand);
      Object.assign(this.economy.saturation, s.econ.saturation);
      if (s.mission) this.missions = s.mission;
      // migrate older saves: single smokeBombs count -> per-area buckets
      if (s.player.smoke === undefined) {
        this.player.smoke = { city: (typeof s.player.smokeBombs === 'number' ? s.player.smokeBombs : 1), island: 0, keys: 0 };
      }
      for (const a of ['city', 'island', 'keys']) {
        if (this.player.smoke[a] == null) this.player.smoke[a] = 0;
        if (this.player.areaPos[a] === undefined) this.player.areaPos[a] = null;
      }
      delete this.player.smokeBombs;
      if (this.player.upgrades.tunnel) this.addHideoutTunnel();
    } catch (err) { console.warn('Bad save, starting fresh', err); }
  }
  // The secret-tunnel upgrade adds a sewer entrance at the city hideout.
  addHideoutTunnel() {
    const city = this.maps.city;
    if (city.sewers.some(x => x.id === 'sw_hideout')) return;
    const h = city.pois.find(p => p.kind === 'hideout');
    city.sewers.push({ id: 'sw_hideout', name: 'Hideout Tunnel', tx: h.tx + 1, ty: h.ty });
  }
  resetGame() {
    if (!confirm('Wipe your save and start over?')) return;
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
}

let game;
window.addEventListener('load', () => { game = new Game(); });
