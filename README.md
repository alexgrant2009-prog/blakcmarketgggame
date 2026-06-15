# 🌆 Black Market Simulator

> Build a secret empire by smuggling goods, avoiding police, and controlling the underground economy.

A 2D top-down smuggling game that runs entirely in your browser. No installs, no dependencies.

## ▶️ How to play

**Just open `index.html` in any modern browser.** That's it.

(Optional: serve it with `npx serve .` or `python3 -m http.server` if you prefer a local server.)

Your progress autosaves to the browser every 10 seconds.

## 🎮 Controls

| Key | Action |
|---|---|
| **WASD / Arrows** | Move |
| **E** | Interact — dealers, buyers, hideout, manholes, warehouses |
| **Q** | Smoke bomb (escape a police chase) |
| **P** | Market price report |
| **M** | Mission board |
| **H** | Help |
| **Esc** | Close panel |

## 🔁 The loop

1. **Buy** cheap contraband from shady dealers (🏚️ slums, ⚓ docks, 🏭 warehouse, 🕯️ black market).
2. **Smuggle** it across the city — use alleys and the sewer network (〇) to stay out of sight.
3. **Avoid** patrol cops 👮, undercover officers 🕵️ and checkpoints 🛑.
4. **Sell** where prices are highest (the Rich District pays a premium — press **P**).
5. **Earn** cash and reputation, then **upgrade** your hideout, hire a crew, buy vehicles and gear.
6. Repeat with bigger risks and bigger rewards.

## 🗺️ The city

Six districts — the Slums, Downtown, the Black Market, Warehouse Row, the Rich District and the Docks — connected by roads, back alleys and a sewer fast-travel network the police can't follow you into. Six police precincts are spread across the map.

## ⛴️ Smuggler's Isle & 🕳️ The Cartel Keys

At **550 reputation**, the ferry at The Docks opens a second island. It trades in premium goods and narcotics that cost a fortune but sell for huge money in the Resort Strip, each unlocked by reputation: **Weed** (550), **Cocaine** (650), **Methamphetamine** (750), **Fentanyl** (900), plus **Stolen Artifacts** and **Smuggled Gold**.

At **1000 reputation**, an underground pathway on the Isle leads to a third island, **The Cartel Keys** — the richest and deadliest market of all, with its own Cartel dealers and buyers paying the highest prices in the game.

Every island has its own police force, its own hidden escape routes, and its own safe house. Crossing between them shakes off the cops you left behind.

## 📦 Contraband

Counterfeit Goods, Fake IDs, Rare Medicine, Luxury Watches, Stolen Tech, Encrypted Drives — plus the island goods: Stolen Artifacts, Smuggled Gold, Weed, Cocaine, Methamphetamine and Fentanyl. Each has its own buy price, sell price, risk level and live demand.

## 📈 Dynamic economy

- Prices drift with demand in real time.
- **Dumping goods in one district saturates that market** and tanks the local price — spread your sales around.
- Random city events shake things up: 🚨 Police Lockdown, 📉 Supply Shortage, 🤵 Rich Buyers In Town, 🔦 Warehouse Raids, 💥 Black Market Crash.

## 🚓 Police & wanted level

Crimes build **heat**, heat sets your **wanted level**:

| ★ | Effect |
|---|---|
| ★ | Police notice you |
| ★★ | Extra patrols |
| ★★★ | Checkpoints appear |
| ★★★★ | Manhunt — the whole force converges on you |
| ★★★★★ | City lockdown + hideout raid incoming |

☠️ **If a cop catches you, you die**: everything you're carrying is lost, 50–65% of your cash, and reputation (5 below 100 rep, 15 below 200, 35 below 300, 50 above 300). You respawn at your hideout — only your stash survives. Your hideout is a safe zone where police can't touch you. Heat fades over time — or hire a hacker.

## 🏠 Hideout

Stash goods (safe from street busts), and build upgrades: Storage Room, Security Cameras, Secret Tunnel, Worker Room, Crafting Table, Garage, Vault and Disguise Station.

## 👥 Crew

Hire workers, each with a daily salary: **Courier** (auto-sells stash), **Scout** (police warnings + minimap), **Guard** (raid protection), **Producer** (crafts goods), **Hacker** (faster heat decay), **Negotiator** (+15% sell prices).

## 🚗 Vehicles & 🧰 gear

Bicycle → Motorcycle → Van → Armored Truck → Smuggler Boat (crosses water!). Gear includes a Disguise, Police Scanner, Fake License, Hidden Backpack, Lockpick Set (warehouse heists!), GPS Jammer and Smoke Bombs.

## ⭐ Reputation

Street Rat → Runner → Hustler → Smuggler → Operator → Kingpin. Each tier unlocks better dealers, richer buyers, rarer items, more workers and bigger vehicles.

## 🧪 Dev

```bash
node test/smoke.js   # headless smoke test of the full game loop
```

Plain HTML/CSS/JS (`js/data.js`, `map.js`, `economy.js`, `police.js`, `game.js`, `render.js`, `ui.js`). No build step.
