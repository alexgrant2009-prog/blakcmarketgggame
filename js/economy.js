// ============ DYNAMIC ECONOMY ============
// Each item has a global price multiplier that random-walks, a demand level,
// and per-district saturation: dumping goods in one district tanks its price
// there until the market recovers. Random city events shake everything up.

class Economy {
  constructor() {
    this.drift = {};      // itemId -> global price multiplier (0.6 .. 1.8)
    this.demand = {};     // itemId -> 0..1 (shown to player, biases the drift)
    this.saturation = {}; // itemId -> { districtId -> 0..0.5 }
    this.event = null;    // { def, item, t } active event
    this.nextEventIn = 45 + Math.random() * 45;
    for (const it of ITEM_LIST) {
      this.drift[it.id] = 0.85 + Math.random() * 0.3;
      this.demand[it.id] = 0.3 + Math.random() * 0.5;
      this.saturation[it.id] = {};
    }
  }

  tick(dt, game) {
    for (const it of ITEM_LIST) {
      // demand slowly wanders, price drifts toward demand
      this.demand[it.id] = clamp(this.demand[it.id] + (Math.random() - 0.5) * 0.02 * dt, 0.05, 1);
      const target = 0.7 + this.demand[it.id] * 0.7;
      this.drift[it.id] += (target - this.drift[it.id]) * 0.01 * dt + (Math.random() - 0.5) * 0.004 * dt;
      this.drift[it.id] = clamp(this.drift[it.id], 0.5, 2.0);
      // saturation recovers
      const sat = this.saturation[it.id];
      for (const d in sat) sat[d] = Math.max(0, sat[d] - 0.008 * dt);
    }

    // event lifecycle
    if (this.event) {
      this.event.t -= dt;
      if (this.event.t <= 0) { game.toast('Event over: ' + this.eventName()); this.event = null; }
    } else {
      this.nextEventIn -= dt;
      if (this.nextEventIn <= 0) {
        this.nextEventIn = 70 + Math.random() * 80;
        const def = EVENTS[Math.floor(Math.random() * EVENTS.length)];
        const item = def.item ? ITEM_LIST[Math.floor(Math.random() * ITEM_LIST.length)] : null;
        this.event = { def, item, t: def.dur };
        game.onEventStart(this.event);
      }
    }
  }

  eventName() {
    if (!this.event) return '';
    const e = this.event;
    return e.item ? `${e.def.name}: ${e.item.name} ${e.def.desc}` : `${e.def.name} — ${e.def.desc}`;
  }
  eventIs(id) { return this.event && this.event.def.id === id; }

  // Price a buyer pays per unit, in a given district
  sellPrice(itemId, district, game) {
    const it = ITEMS[itemId];
    let p = it.base * this.drift[itemId] * (DISTRICT_INFO[district]?.sellMult || 1);
    p *= 1 - (this.saturation[itemId][district] || 0);
    if (this.eventIs('shortage') && this.event.item.id === itemId) p *= 1.8;
    if (this.eventIs('richbuyers') && district === 'rich') p *= 1.5;
    if (this.eventIs('crash')) p *= 0.65;
    if (game && game.hasWorker('negotiator')) p *= 1.15;
    return Math.max(5, Math.round(p));
  }

  // Price a dealer charges per unit
  buyPrice(itemId, district) {
    const it = ITEMS[itemId];
    let p = it.base * this.drift[itemId] * 0.55 * (DISTRICT_INFO[district]?.buyMult || 1);
    if (this.eventIs('raidwave')) p *= 1.4;
    if (this.eventIs('shortage') && this.event.item.id === itemId) p *= 1.5;
    return Math.max(5, Math.round(p));
  }

  // Selling pushes the local price down; buying nudges global demand up
  recordSale(itemId, district, qty) {
    const sat = this.saturation[itemId];
    sat[district] = clamp((sat[district] || 0) + qty * 0.025, 0, 0.5);
    this.drift[itemId] = Math.max(0.5, this.drift[itemId] - qty * 0.004);
  }
  recordBuy(itemId, qty) {
    this.demand[itemId] = clamp(this.demand[itemId] + qty * 0.004, 0.05, 1);
  }

  demandLabel(itemId) {
    const d = this.demand[itemId];
    return d > 0.75 ? '🔥 High' : d > 0.45 ? '➖ Medium' : '🧊 Low';
  }
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
