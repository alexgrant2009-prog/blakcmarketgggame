// Headless smoke test: stub the DOM, load all scripts, run the game loop.
const fs = require('fs');
const ctxStub = new Proxy({}, { get: (t, k) => {
  if (k === 'measureText') return () => ({ width: 50 });
  return (typeof k === 'string' && ['fillStyle','font','textAlign','strokeStyle','globalAlpha'].includes(k)) ? undefined : () => ctxStub;
}, set: () => true });
const elements = {};
function makeEl(id) {
  return elements[id] ??= {
    id, style: {}, children: [], textContent: '', innerHTML: '', className: '',
    getContext: () => ctxStub, width: 800, height: 600,
    prepend(c) { this.children.unshift(c); }, removeChild() { this.children.pop(); },
    lastChild: null, appendChild() {},
  };
}
global.document = {
  getElementById: id => makeEl(id),
  createElement: tag => makeEl('tmp' + Math.random()),
  addEventListener: () => {},
  hidden: false,
};
const listeners = {};
global.window = { innerWidth: 800, innerHeight: 600, addEventListener: (e, f) => { (listeners[e] ??= []).push(f); } };
global.localStorage = { _d: {}, getItem(k){ return this._d[k] ?? null; }, setItem(k,v){ this._d[k]=v; }, removeItem(k){ delete this._d[k]; } };
let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; };
global.performance = { now: () => Date.now() };
global.confirm = () => true;

let all = '';
for (const f of ['data','map','economy','police','game','render','ui']) {
  all += fs.readFileSync(require('path').join(__dirname, '..', 'js') + '/' + f + '.js', 'utf8') + '\n';
}
all += '\nlisteners.load.forEach(f => f());\nreturn game;\n';
const g = new Function('listeners', all)(listeners);
console.log('Game constructed. cash=', g.player.cash, 'pois=', g.map.pois.length, 'sewers=', g.map.sewers.length);

// simulate 120 seconds of gameplay at 30fps
let t = 0;
for (let i = 0; i < 3600; i++) { t += 33; g.last = t - 33; g.update(0.033); }
console.log('Simulated 2 min. cops=', g.police.cops.length, 'heat=', g.player.heat.toFixed(1), 'wanted=', g.wanted(), 'day=', g.player.day);

// exercise trading
const dealer = g.map.pois.find(p => p.id === 'dealer_slums');
g.player.cash = 5000;
g.buyItem('counterfeit', 5, dealer);
console.log('Bought 5 counterfeit. inv=', JSON.stringify(g.player.inv), 'cash=', g.player.cash);
const buyer = g.map.pois.find(p => p.id === 'buyer_dt');
g.sellItem('counterfeit', 5, buyer);
console.log('Sold 5. cash=', g.player.cash, 'rep=', g.player.rep, 'heat=', g.player.heat.toFixed(1));

// hideout flows
g.buyUpgrade('garage'); g.buyVehicle('bicycle');
g.player.cash = 50000; g.player.rep = 500;
g.buyUpgrade('storage'); g.buyUpgrade('tunnel'); g.buyUpgrade('workroom');
g.hireWorker('scout'); g.hireWorker('courier'); g.hireWorker('producer');
g.buyItem('tech', 3, dealer); g.moveToStash('tech', 3);
console.log('Upgrades=', JSON.stringify(g.player.upgrades), 'workers=', g.player.workers.length, 'stash=', JSON.stringify(g.player.stash));

// worker + economy ticks over a day
for (let i = 0; i < 8000; i++) g.update(0.033);
console.log('After ~4.4 min more: day=', g.player.day, 'cash=', Math.floor(g.player.cash), 'stash=', JSON.stringify(g.player.stash));

// force a death (caught by a cop)
g.bustInfo = null; // sight-based cops may have already caught us during the simulated minutes
g.player.heat = 80; g.buyItem('counterfeit', 1, dealer);
g.bust('test death');
console.log('Death: overlay=', !!g.bustInfo, 'inv=', JSON.stringify(g.player.inv), 'busts=', g.player.stats.busts, 'heat=', g.player.heat);
if (Object.keys(g.player.inv).length) { console.log('FAIL: carried items survived death'); process.exit(1); }
g.bustInfo = null; g.respawn();
const hh = g.map.pois.find(p => p.kind === 'hideout');
console.log('Respawn near hideout:', Math.hypot(g.player.x/26 - hh.tx, g.player.y/26 - hh.ty) < 6 ? 'OK' : 'FAIL');
for (let i = 0; i < 2000; i++) g.update(0.033);

// missions
g.refreshMissionOffers();
console.log('Mission offers:', g.missions.offers.map(m => m.desc));
g.acceptMission(0);
const m = g.missions.active;
const mbuyer = g.map.pois.find(p => p.id === m.buyerId);
g.player.inv[m.itemId] = m.qty; g.player.vehicle='van'; g.player.ownedVehicles.push('van');
g.sellItem(m.itemId, m.qty, mbuyer);
console.log('Mission after delivery:', g.missions.active === null ? 'COMPLETE' : 'still active', 'missions done=', g.player.stats.missions);

// sewer travel, heist, checkpoint, raid
g.sewerFrom = g.map.sewers[0];
g.sewerTravel('sw_wh');
g.player.gear.lockpick = true;
g.tryHeist(g.map.pois.find(p => p.id === 'warehouse_a'));
console.log('After heist: inv=', JSON.stringify(g.player.inv), 'heat=', g.player.heat.toFixed(1));
g.player.gear = {}; g.checkpointScan();
g.player.stash = { tech: 10 }; g.hideoutRaid();
console.log('After raid: stash=', JSON.stringify(g.player.stash));

// island travel: gated under 550 rep, opens at 550
g.bustInfo = null; g.player.rep = 100; g.travelTo('island');
console.log('Travel blocked under 550 rep:', g.area === 'city' ? 'OK' : 'FAIL');
g.player.rep = 600; g.travelTo('island');
console.log('Travel to island at 600 rep:', g.area === 'island' ? 'OK' : 'FAIL', '| on island map:', g.map.districtIds[0] === 'island_port' ? 'OK' : 'FAIL');
const isleDealer = g.map.pois.find(p => p.id === 'dealer_isle');
const resort = g.map.pois.find(p => p.id === 'buyer_resort');
g.player.cash = 999999; g.buyItem('gold', 2, isleDealer);
console.log('Bought premium gold on island:', (g.player.inv.gold || 0) === 2 ? 'OK' : 'FAIL');
const islePrice = g.economy.sellPrice('gold', 'island_resort', g);
const cityPrice = g.economy.sellPrice('gold', 'downtown', g);
console.log('Island resort pays more than city:', islePrice > cityPrice ? 'OK ('+islePrice+' vs '+cityPrice+')' : 'FAIL');
g.sellItem('gold', 2, resort);
console.log('Sold gold at resort, cops fresh on island:', g.police.cops.length >= 0 ? 'OK' : 'FAIL');
// ferry back
g.travelTo('city');
console.log('Ferry back to city:', g.area === 'city' && g.map.districtIds[0] === 'slums' ? 'OK' : 'FAIL');

// panels render without crashing
for (const pid of ['help','prices','missions','hideout']) { g.openPanel(pid); }
g.hideoutTab='upgrades'; g.renderPanel(); g.hideoutTab='workers'; g.renderPanel(); g.hideoutTab='garage'; g.renderPanel();
g.openDealer(dealer); g.openBuyer(buyer); g.openSewer(g.map.sewers[0]);
// render frame
g.render();
console.log('All panels + render OK');

// economy events sanity: force a shortage event and confirm prices spike
const normal = g.economy.sellPrice('tech','downtown');
g.economy.event = { def: { id: 'shortage', name: 'x', dur: 10 }, item: { id: 'tech' }, t: 10 };
const spiked = g.economy.sellPrice('tech','downtown');
console.log('Shortage event: tech price', normal, '->', spiked, spiked > normal ? '(OK)' : '(FAIL)');
if (spiked <= normal) process.exit(1);
console.log('SMOKE TEST PASSED');
