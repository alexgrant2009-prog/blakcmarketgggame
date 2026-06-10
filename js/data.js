// ============ GAME DATA ============
// All static definitions: items, vehicles, gear, workers, upgrades,
// reputation tiers, events and mission templates.

const ITEMS = {
  counterfeit: { id: 'counterfeit', name: 'Counterfeit Goods', icon: '👜', base: 80,  risk: 1, tier: 0 },
  fakeid:      { id: 'fakeid',      name: 'Fake IDs',          icon: '🪪', base: 130, risk: 1, tier: 0 },
  meds:        { id: 'meds',        name: 'Rare Medicine',     icon: '💊', base: 260, risk: 2, tier: 1 },
  watches:     { id: 'watches',     name: 'Luxury Watches',    icon: '⌚', base: 380, risk: 2, tier: 1 },
  tech:        { id: 'tech',        name: 'Stolen Tech',       icon: '💻', base: 560, risk: 3, tier: 2 },
  drives:      { id: 'drives',      name: 'Encrypted Drives',  icon: '💾', base: 950, risk: 4, tier: 3 },
};
const ITEM_LIST = Object.values(ITEMS);

const VEHICLES = {
  foot:      { id: 'foot',      name: 'On Foot',       icon: '👟', cost: 0,     speed: 1.0,  cap: 0,  susp: 0,    repReq: 0,    water: false },
  bicycle:   { id: 'bicycle',   name: 'Bicycle',       icon: '🚲', cost: 450,   speed: 1.35, cap: 4,  susp: 0,    repReq: 0,    water: false },
  motorbike: { id: 'motorbike', name: 'Motorcycle',    icon: '🏍️', cost: 2200,  speed: 1.7,  cap: 6,  susp: 0.15, repReq: 150,  water: false },
  van:       { id: 'van',       name: 'Delivery Van',  icon: '🚐', cost: 4000,  speed: 1.3,  cap: 20, susp: 0.1,  repReq: 150,  water: false },
  armored:   { id: 'armored',   name: 'Armored Truck', icon: '🚚', cost: 12000, speed: 1.15, cap: 35, susp: 0.3,  repReq: 400,  water: false },
  boat:      { id: 'boat',      name: 'Smuggler Boat', icon: '🚤', cost: 9000,  speed: 1.1,  cap: 25, susp: -0.1, repReq: 400,  water: true },
};
const VEHICLE_LIST = Object.values(VEHICLES);

const GEAR = {
  disguise:  { id: 'disguise',  name: 'Disguise',        icon: '🥸', cost: 600,  repReq: 0,   desc: 'Police spot you from further away? Not anymore. Reduces police vision.' },
  scanner:   { id: 'scanner',   name: 'Police Scanner',  icon: '📻', cost: 900,  repReq: 50,  desc: 'Shows police positions on the minimap.' },
  license:   { id: 'license',   name: 'Fake License',    icon: '📄', cost: 1200, repReq: 50,  desc: 'Much better odds of passing checkpoints.' },
  backpack:  { id: 'backpack',  name: 'Hidden Backpack', icon: '🎒', cost: 1500, repReq: 50,  desc: '+8 carry capacity, hidden from quick searches.' },
  lockpick:  { id: 'lockpick',  name: 'Lockpick Set',    icon: '🗝️', cost: 2000, repReq: 150, desc: 'Lets you break into warehouses and steal crates.' },
  jammer:    { id: 'jammer',    name: 'GPS Jammer',      icon: '📡', cost: 3500, repReq: 400, desc: 'Checkpoint scanners cannot detect your goods.' },
};
const GEAR_LIST = Object.values(GEAR);
const SMOKE_BOMB_COST = 250; // consumable, press Q during a chase

const WORKERS = {
  courier:    { id: 'courier',    name: 'Courier',    icon: '🛵', cost: 800,  salary: 120, repReq: 50,   desc: 'Automatically sells items from your stash every 45s (safe, average price).' },
  scout:      { id: 'scout',      name: 'Scout',      icon: '🔭', cost: 600,  salary: 80,  repReq: 0,    desc: 'Warns you when police get close and marks them on the minimap.' },
  guard:      { id: 'guard',      name: 'Guard',      icon: '💪', cost: 1000, salary: 150, repReq: 150,  desc: 'Protects the hideout. Each guard reduces raid losses by 20%.' },
  producer:   { id: 'producer',   name: 'Producer',   icon: '🧪', cost: 1500, salary: 200, repReq: 150,  desc: 'Crafts counterfeit goods into your stash every 30s.' },
  hacker:     { id: 'hacker',     name: 'Hacker',     icon: '🖥️', cost: 2500, salary: 300, repReq: 400,  desc: 'Scrubs police records. Heat decays 60% faster.' },
  negotiator: { id: 'negotiator', name: 'Negotiator', icon: '🤝', cost: 3000, salary: 350, repReq: 400,  desc: 'All sell prices +15%.' },
};
const WORKER_LIST = Object.values(WORKERS);

const UPGRADES = {
  storage:  { id: 'storage',  name: 'Storage Room',     icon: '📦', levels: [1200, 3500, 8000], desc: 'Each level: +30 stash capacity.', repReq: 0 },
  cameras:  { id: 'cameras',  name: 'Security Cameras', icon: '📷', levels: [2000], desc: 'Raid losses reduced by 25%.', repReq: 50 },
  tunnel:   { id: 'tunnel',   name: 'Secret Tunnel',    icon: '🕳️', levels: [3000], desc: 'Adds a sewer entrance inside your hideout. Escape in style.', repReq: 150 },
  workroom: { id: 'workroom', name: 'Worker Room',      icon: '🛏️', levels: [2500, 6000], desc: 'Each level: +2 worker slots (base 2).', repReq: 50 },
  craft:    { id: 'craft',    name: 'Crafting Table',   icon: '🔨', levels: [2800], desc: 'Producers work twice as fast.', repReq: 150 },
  garage:   { id: 'garage',   name: 'Garage',           icon: '🏗️', levels: [1800], desc: 'Required to buy and store vehicles.', repReq: 0 },
  vault:    { id: 'vault',    name: 'Vault',            icon: '🔒', levels: [5000], desc: 'Half of your stash is safe from raids.', repReq: 400 },
  disguiseStation: { id: 'disguiseStation', name: 'Disguise Station', icon: '🎭', levels: [4000], desc: 'Leave the hideout with 0 heat... once per day.', repReq: 400 },
};
const UPGRADE_LIST = Object.values(UPGRADES);

const REP_TIERS = [
  { rep: 0,    title: 'Street Rat',  perk: 'Slums dealer & downtown fence' },
  { rep: 50,   title: 'Runner',      perk: 'Docks dealer, scanner, license, courier' },
  { rep: 150,  title: 'Hustler',     perk: 'Warehouse dealer, motorcycle, van, lockpick' },
  { rep: 400,  title: 'Smuggler',    perk: 'Black-market broker, rich buyers, armored truck, boat' },
  { rep: 1000, title: 'Operator',    perk: 'Elite penthouse buyer, encrypted drives demand' },
  { rep: 2500, title: 'Kingpin',     perk: 'You control the underground economy' },
];

// Market events. dur in seconds.
const EVENTS = [
  { id: 'lockdown', name: '🚨 Police Lockdown', dur: 50,
    desc: 'Police flood the streets. Heat will not drop below level 3!' },
  { id: 'shortage', name: '📉 Supply Shortage', dur: 90,
    desc: 'is scarce — sell prices up 80%!', item: true },
  { id: 'richbuyers', name: '🤵 Rich Buyers In Town', dur: 75,
    desc: 'High rollers arrived. Rich District pays +50%!' },
  { id: 'raidwave', name: '🔦 Warehouse Raids', dur: 60,
    desc: 'Dealers are laying low — buy prices up 40%.' },
  { id: 'crash', name: '💥 Black Market Crash', dur: 70,
    desc: 'A snitch flooded the market. All sell prices -35%.' },
];

const DISTRICT_INFO = {
  slums:      { name: 'The Slums',       sellMult: 0.85, buyMult: 0.9 },
  downtown:   { name: 'Downtown',        sellMult: 1.0,  buyMult: 1.0 },
  blackmarket:{ name: 'Black Market',    sellMult: 1.05, buyMult: 0.95 },
  warehouse:  { name: 'Warehouse Row',   sellMult: 0.95, buyMult: 0.85 },
  docks:      { name: 'The Docks',       sellMult: 1.15, buyMult: 0.9 },
  rich:       { name: 'Rich District',   sellMult: 1.4,  buyMult: 1.2 },
};

const FIRST_NAMES = ['Vic','Lena','Marco','Dom','Sasha','Rico','Ana','Kez','Otto','Mira','Jax','Nadia'];
function randName() { return FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]; }
