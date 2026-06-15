// ============ UI: HUD + PANELS ============
// Panels are rendered into the #panel DOM node. While a panel is open the
// player is frozen (the world keeps running — risky to shop with heat!).

Game.prototype.updateHUD = function () {
  const p = this.player, $ = id => document.getElementById(id);
  $('hud-cash').textContent = '$' + Math.floor(p.cash).toLocaleString();
  $('hud-rep').textContent = `⭐ ${Math.floor(p.rep)} (${this.repTier().title})`;
  const w = this.wanted();
  $('hud-wanted').textContent = '★'.repeat(w) + '☆'.repeat(5 - w);
  $('hud-wanted').className = w >= 4 ? 'danger' : w >= 2 ? 'warn' : '';
  $('hud-heat').style.width = Math.min(100, p.heat) + '%';
  const phase = p.dayT / DAY_LENGTH;
  $('hud-day').textContent = `${phase > 0.55 ? '🌙' : '☀️'} Day ${p.day}`;
  $('hud-carry').textContent = `🎒 ${this.carried()}/${this.carryCap()}`;
  $('hud-vehicle').textContent = this.vehicle().icon + ' ' + this.vehicle().name;
  $('hud-smoke').textContent = `💨 ×${p.smokeBombs}`;
  $('hud-district').textContent = DISTRICT_INFO[this.districtOfPlayer()].name;

  const ev = document.getElementById('event-banner');
  if (this.economy.event) {
    ev.style.display = 'block';
    ev.textContent = this.economy.eventName() + ` (${Math.ceil(this.economy.event.t)}s)`;
  } else ev.style.display = 'none';

  const tdiv = document.getElementById('toasts');
  tdiv.innerHTML = this.toasts.map(t => `<div class="toast" style="opacity:${Math.min(1, t.t / 1.5)}">${t.msg}</div>`).join('');

  const mdiv = document.getElementById('mission-hud');
  if (this.missions.active) {
    const m = this.missions.active;
    mdiv.style.display = 'block';
    mdiv.textContent = `📋 ${m.desc} — ${m.remaining} left`;
  } else mdiv.style.display = 'none';
};

// ---------- panel plumbing ----------
Game.prototype.openPanel = function (id, data) {
  this.panel = id; this.panelData = data || this.panelData;
  this.renderPanel();
};
Game.prototype.closePanel = function () {
  this.panel = null;
  document.getElementById('panel').style.display = 'none';
};
Game.prototype.togglePanel = function (id) {
  if (this.panel === id) this.closePanel(); else this.openPanel(id);
};
Game.prototype.openDealer = function (poi) { this.hideoutTab = null; this.openPanel('dealer', { poi }); };
Game.prototype.openBuyer = function (poi) { this.openPanel('buyer', { poi }); };
Game.prototype.openHideout = function () { this.hideoutTab = this.hideoutTab || 'stash'; this.openPanel('hideout'); };

Game.prototype.renderPanel = function () {
  if (!this.panel) return;
  const el = document.getElementById('panel');
  el.style.display = 'block';
  const fn = {
    dealer: () => this.panelDealer(), buyer: () => this.panelBuyer(),
    hideout: () => this.panelHideout(), missions: () => this.panelMissions(),
    prices: () => this.panelPrices(), sewer: () => this.panelSewer(), help: () => this.panelHelp(),
  }[this.panel];
  el.innerHTML = `<div class="panel-close" onclick="game.closePanel()">✕ (Esc)</div>` + (fn ? fn() : '');
};

const fmt$ = n => '$' + Math.floor(n).toLocaleString();
const riskDots = r => '🔻'.repeat(r);

// ---------- dealer ----------
Game.prototype.panelDealer = function () {
  const poi = this.panelData.poi, district = districtAt(poi.tx, poi.ty);
  let rows = '';
  for (const it of ITEM_LIST) {
    if (it.tier > poi.tier) continue;
    if (!this.itemUnlocked(it)) {
      rows += `<tr class="locked"><td>${it.icon} ${it.name}</td><td colspan="4">🔒 Unlocks at ${this.itemRepReq(it)} rep</td></tr>`;
      continue;
    }
    const price = this.economy.buyPrice(it.id, district);
    rows += `<tr>
      <td>${it.icon} ${it.name}</td>
      <td>${fmt$(price)}</td>
      <td title="Risk">${riskDots(it.risk)}</td>
      <td title="Demand">${this.economy.demandLabel(it.id)}</td>
      <td>
        <button onclick="game.buyItem('${it.id}',1,game.panelData.poi)">+1</button>
        <button onclick="game.buyItem('${it.id}',5,game.panelData.poi)">+5</button>
        <button onclick="game.buyItem('${it.id}',999,game.panelData.poi)">Max</button>
      </td></tr>`;
  }
  let gear = `<h3>🧰 Fixer's Gear</h3><table>`;
  for (const g of GEAR_LIST) {
    if (this.player.gear[g.id]) { gear += `<tr><td>${g.icon} ${g.name}</td><td colspan="2">✅ Owned</td></tr>`; continue; }
    const locked = this.player.rep < g.repReq;
    gear += `<tr class="${locked ? 'locked' : ''}"><td>${g.icon} ${g.name}<div class="small">${g.desc}</div></td>
      <td>${fmt$(g.cost)}</td>
      <td>${locked ? `🔒 ${g.repReq} rep` : `<button onclick="game.buyGear('${g.id}')">Buy</button>`}</td></tr>`;
  }
  gear += `<tr><td>💨 Smoke Bomb <div class="small">Consumable. Press Q during a chase to escape.</div></td>
    <td>${fmt$(SMOKE_BOMB_COST)}</td><td><button onclick="game.buySmoke()">Buy (have ${this.player.smokeBombs})</button></td></tr></table>`;
  return `<h2>${poi.icon} ${poi.name} <span class="small">(${DISTRICT_INFO[district].name})</span></h2>
    <div class="small">Cash: ${fmt$(this.player.cash)} • Carrying ${this.carried()}/${this.carryCap()} • ⚠️ Trading near cops raises heat fast.</div>
    <table><tr><th>Item</th><th>Buy</th><th>Risk</th><th>Demand</th><th></th></tr>${rows}</table>${gear}`;
};

// ---------- buyer ----------
Game.prototype.panelBuyer = function () {
  const poi = this.panelData.poi, district = districtAt(poi.tx, poi.ty);
  const ids = Object.keys(this.player.inv);
  let rows = '';
  for (const id of ids) {
    const it = ITEMS[id], qty = this.player.inv[id];
    const price = this.economy.sellPrice(id, district, this);
    rows += `<tr><td>${it.icon} ${it.name} ×${qty}</td>
      <td>${fmt$(price)}/u</td><td>${riskDots(it.risk)}</td>
      <td><button onclick="game.sellItem('${id}',1,game.panelData.poi)">Sell 1</button>
          <button onclick="game.sellItem('${id}',5,game.panelData.poi)">Sell 5</button>
          <button onclick="game.sellItem('${id}',999,game.panelData.poi)">All</button></td></tr>`;
  }
  if (!ids.length) rows = `<tr><td colspan="4" class="small">Your pockets are empty. Go buy something from a dealer (🏚️ ⚓ 🏭 🕯️).</td></tr>`;
  const m = this.missions.active;
  const missionNote = m && m.buyerId === poi.id
    ? `<div class="note">📋 Contract buyer! Selling ${ITEMS[m.itemId].name} here counts toward your mission (${m.remaining} left).</div>` : '';
  return `<h2>${poi.icon} ${poi.name} <span class="small">(${DISTRICT_INFO[district].name}, pays ×${DISTRICT_INFO[district].sellMult})</span></h2>
    ${missionNote}
    <div class="small">Selling raises reputation — and saturates the local market, dropping prices. Spread your sales around.</div>
    <table><tr><th>Your goods</th><th>Price here</th><th>Risk</th><th></th></tr>${rows}</table>`;
};

// ---------- hideout ----------
Game.prototype.panelHideout = function () {
  const p = this.player;
  const tab = this.hideoutTab;
  const tabs = ['stash', 'upgrades', 'workers', 'garage']
    .map(t => `<button class="tab ${tab === t ? 'on' : ''}" onclick="game.hideoutTab='${t}';game.renderPanel()">${t.toUpperCase()}</button>`).join('');
  let body = '';

  if (tab === 'stash') {
    let rows = '';
    for (const it of ITEM_LIST) {
      const inv = p.inv[it.id] || 0, st = p.stash[it.id] || 0;
      if (!inv && !st) continue;
      rows += `<tr><td>${it.icon} ${it.name}</td><td>🎒 ${inv}</td>
        <td><button onclick="game.moveToStash('${it.id}',999)">→ stash</button>
            <button onclick="game.moveToInv('${it.id}',999)">← carry</button></td>
        <td>📦 ${st}</td></tr>`;
    }
    if (!rows) rows = '<tr><td colspan="4" class="small">Nothing here yet. Goods in the stash are safe from street busts (but not raids — build defenses).</td></tr>';
    body = `<div class="small">Carry ${this.carried()}/${this.carryCap()} • Stash ${this.stashed()}/${this.stashCap()}</div>
      <table><tr><th>Item</th><th>On you</th><th></th><th>Stash</th></tr>${rows}</table>`;
    if (p.upgrades.disguiseStation) body += `<button onclick="game.useDisguiseStation()">🎭 Use Disguise Station (wipe heat, 1/day)</button>`;
  }

  if (tab === 'upgrades') {
    let rows = '';
    for (const up of UPGRADE_LIST) {
      const lvl = p.upgrades[up.id] || 0, maxed = lvl >= up.levels.length;
      const locked = p.rep < up.repReq;
      rows += `<tr class="${locked ? 'locked' : ''}"><td>${up.icon} ${up.name} ${up.levels.length > 1 ? `(Lv ${lvl}/${up.levels.length})` : lvl ? '✅' : ''}<div class="small">${up.desc}</div></td>
        <td>${maxed ? '—' : fmt$(up.levels[lvl])}</td>
        <td>${maxed ? 'Built' : locked ? `🔒 ${up.repReq} rep` : `<button onclick="game.buyUpgrade('${up.id}')">Build</button>`}</td></tr>`;
    }
    body = `<table><tr><th>Upgrade</th><th>Cost</th><th></th></tr>${rows}</table>`;
  }

  if (tab === 'workers') {
    let crew = p.workers.map((w, i) =>
      `<li>${WORKERS[w.type].icon} <b>${w.name}</b> the ${WORKERS[w.type].name} — $${WORKERS[w.type].salary}/day
       <button onclick="game.fireWorker(${i})">Fire</button></li>`).join('');
    let rows = '';
    for (const w of WORKER_LIST) {
      const locked = p.rep < w.repReq;
      rows += `<tr class="${locked ? 'locked' : ''}"><td>${w.icon} ${w.name}<div class="small">${w.desc}</div></td>
        <td>${fmt$(w.cost)}<div class="small">+$${w.salary}/day</div></td>
        <td>${locked ? `🔒 ${w.repReq} rep` : `<button onclick="game.hireWorker('${w.id}')">Hire</button>`}</td></tr>`;
    }
    body = `<div class="small">Crew: ${p.workers.length}/${this.workerSlots()} slots (upgrade the Worker Room for more). Salaries are paid each morning.</div>
      <ul>${crew || '<li class="small">No crew yet.</li>'}</ul>
      <table><tr><th>Hire</th><th>Cost</th><th></th></tr>${rows}</table>`;
  }

  if (tab === 'garage') {
    if (!p.upgrades.garage) {
      body = `<div class="note">🏗️ Build the Garage upgrade to buy and store vehicles.</div>`;
    } else {
      let rows = '';
      for (const v of VEHICLE_LIST) {
        const owned = p.ownedVehicles.includes(v.id), active = p.vehicle === v.id;
        const locked = p.rep < v.repReq;
        rows += `<tr class="${locked && !owned ? 'locked' : ''}">
          <td>${v.icon} ${v.name}<div class="small">speed ×${v.speed} • +${v.cap} carry • suspicion ${v.susp > 0 ? '+' : ''}${Math.round(v.susp * 100)}%${v.water ? ' • 🌊 can cross water' : ''}</div></td>
          <td>${owned ? 'Owned' : fmt$(v.cost)}</td>
          <td>${active ? '✅ In use' : owned ? `<button onclick="game.selectVehicle('${v.id}')">Use</button>`
            : locked ? `🔒 ${v.repReq} rep` : `<button onclick="game.buyVehicle('${v.id}')">Buy</button>`}</td></tr>`;
      }
      body = `<table><tr><th>Vehicle</th><th>Cost</th><th></th></tr>${rows}</table>`;
    }
  }

  const hideoutPoi = this.map.pois.find(x => x.kind === 'hideout');
  return `<h2>${hideoutPoi.icon} ${hideoutPoi.name}</h2><div class="tabs">${tabs}</div>${body}
    <div class="small footer">Cash ${fmt$(p.cash)} • Rep ${Math.floor(p.rep)} • Busts: ${p.stats.busts} • Total earned: ${fmt$(p.stats.earned)}
    <button onclick="game.resetGame()" class="danger-btn">Reset Save</button></div>`;
};

// ---------- missions ----------
Game.prototype.panelMissions = function () {
  let body = '';
  const cd = Math.ceil(this.oddJobT || 0);
  body += `<div class="note">💰 ALWAYS AVAILABLE — Street work: run errands for the locals. Pays $60, zero risk.
    <button onclick="game.doOddJob()" ${cd ? 'disabled' : ''}>${cd ? `Tired (${cd}s)` : '🧹 WORK NOW (+$60)'}</button></div>`;
  if (this.missions.active) {
    const m = this.missions.active;
    body += `<div class="note">📋 ACTIVE: ${m.desc}<br>Remaining: ${m.remaining} • Bonus ${fmt$(m.bonus)} + ${m.repBonus} rep
      <br><button onclick="game.abandonMission()">Abandon (-2 rep)</button></div>`;
  }
  body += `<h3>Contracts on offer</h3>`;
  if (!this.missions.offers.length) body += `<div class="small">No offers right now.</div>`;
  this.missions.offers.forEach((m, i) => {
    body += `<div class="offer">📦 ${m.desc}<div class="small">Bonus: ${fmt$(m.bonus)} + ${m.repBonus} rep (paid on top of the sale price)</div>
      <button onclick="game.acceptMission(${i})" ${this.missions.active ? 'disabled' : ''}>Accept</button></div>`;
  });
  body += `<button onclick="game.refreshMissionOffers();game.renderPanel()">🔄 New offers</button>
    <h3>Other work</h3><div class="small">🗝️ Warehouse heists: buy a Lockpick Set, then break into the Bonded Warehouses (📦) in Warehouse Row. Big loot, big heat.</div>`;
  return `<h2>📋 Missions</h2>${body}`;
};

// ---------- prices ----------
Game.prototype.panelPrices = function () {
  const districts = this.map.districtIds || Object.keys(DISTRICT_INFO);
  let head = '<tr><th>Item</th><th>Demand</th>' + districts.map(d => `<th>${DISTRICT_INFO[d].name}</th>`).join('') + '</tr>';
  let rows = '';
  for (const it of ITEM_LIST) {
    if (!this.itemUnlocked(it)) {
      rows += `<tr class="locked"><td>${it.icon} ${it.name}</td><td colspan="${districts.length + 1}">🔒 ${this.itemRepReq(it)} rep</td></tr>`;
      continue;
    }
    let best = 0;
    const cells = districts.map(d => { const v = this.economy.sellPrice(it.id, d, this); best = Math.max(best, v); return v; });
    rows += `<tr><td>${it.icon} ${it.name}</td><td>${this.economy.demandLabel(it.id)}</td>` +
      cells.map(v => `<td class="${v === best ? 'best' : ''}">${fmt$(v)}</td>`).join('') + '</tr>';
  }
  return `<h2>📈 Market Sell Prices</h2>
    <div class="small">Best price per item highlighted. Prices shift with demand, your sales saturate local markets, and events shake everything up.</div>
    <table>${head}${rows}</table>`;
};

// ---------- sewers ----------
Game.prototype.panelSewer = function () {
  const from = this.sewerFrom;
  const dests = this.map.sewers.filter(s => s.id !== from.id);
  return `<h2>🕳️ ${from.name}</h2>
    <div class="small">The sewers connect the whole city. Police never follow you down here.</div>
    ${dests.map(d => `<div class="offer">〇 ${d.name} <button onclick="game.sewerTravel('${d.id}')">Travel</button></div>`).join('')}`;
};

// ---------- help ----------
Game.prototype.panelHelp = function () {
  return `<h2>🌆 Black Market Simulator</h2>
  <div class="small">Build a secret empire by smuggling goods, avoiding police, and controlling the underground economy.</div>
  <h3>The loop</h3>
  <ol class="small">
    <li>Buy cheap goods from shady dealers (🏚️ ⚓ 🏭 🕯️).</li>
    <li>Smuggle them across the city — alleys and sewers (〇) are your friends.</li>
    <li>Avoid police 👮, undercover cops 🕵️ and checkpoints 🛑.</li>
    <li>Sell where prices are highest (press <b>P</b> for the market report).</li>
    <li>Earn cash + reputation, upgrade your hideout 🏠, hire a crew, buy vehicles.</li>
    <li>Repeat with bigger risks and bigger rewards.</li>
  </ol>
  <h3>Controls</h3>
  <table class="small">
    <tr><td><b>WASD / Arrows</b></td><td>Move</td></tr>
    <tr><td><b>E</b></td><td>Interact (dealers, buyers, hideout, manholes, warehouses)</td></tr>
    <tr><td><b>Q</b></td><td>Smoke bomb (escape a chase)</td></tr>
    <tr><td><b>P</b></td><td>Market prices</td></tr>
    <tr><td><b>M</b></td><td>Missions</td></tr>
    <tr><td><b>H</b></td><td>This help</td></tr>
  </table>
  <h3>Wanted level ★</h3>
  <div class="small">Crimes build heat. ★ police notice you • ★★ extra patrols • ★★★ checkpoints • ★★★★ manhunt — the force converges on you • ★★★★★ city lockdown + hideout raid.
  🏠 Your hideout is a SAFE ZONE (the gold circle): police cannot chase, grab or kill you inside it. Reach it during a chase and they back off.
  👁️ Cops chase what they SEE: if an officer has line of sight on you while you carry contraband — or while you have any star — he chases. Buildings block their view, so duck behind corners; stay out of sight for a few seconds and he gives up. At ★★★★ the whole force converges on you regardless.
  ☠️ NEVER TOUCH A COP. Bump one while carrying contraband (or at ★★+) and you DIE on the spot: everything you carry is lost, 50–65% of your cash, and reputation (5 below 100 rep, 15 below 200, 35 below 300, 50 above). You respawn at your hideout — only the stash survives. Bump one while clean and you get shoved off with a warning — and your heat rises. Heat fades with time, or hire a hacker.</div>
  <h3>⛴️ Smuggler's Isle & 🕳️ The Cartel Keys</h3>
  <div class="small">At <b>550 rep</b> the ferry (⛴️ at The Docks) opens up. Smuggler's Isle deals in premium goods and narcotics that cost a fortune but sell for huge money — each unlocks with reputation:
  🌿 Weed (550) • ❄️ Cocaine (650) • 💎 Meth (750) • ☠️ Fentanyl (900), plus 🏺 Artifacts and 🪙 Gold.
  At <b>1000 rep</b> an underground pathway (🕳️) on the Isle leads to a third island, <b>The Cartel Keys</b> — the richest, deadliest market of all. Every island has its own police, escape routes and safe house; crossing leaves the old cops behind.</div>
  <h3>Reputation</h3>
  <div class="small">${REP_TIERS.map(t => `<b>${t.rep}</b> ${t.title} — ${t.perk}`).join('<br>')}</div>
  <button onclick="game.closePanel()">Hit the streets →</button>`;
};
