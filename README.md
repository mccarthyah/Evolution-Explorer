# 🧬 EVOLUTION — Living Terrain

**Fly through pillars grown by Conway's Game of Life. Garden it.**

Towers **explode at age 40** — harvest the gold ⚡ **biomass** they leave behind and spend it on seed tools: gliders, pulsars, glider guns, stasis fields. **Discover and catalog 12 named lifeforms** in your field journal. Complete **9 contracts** to become Master Gardener. Your **pilot levels up** as you garden — unlock new seeds, upgrade your genetics, deploy auto-harvesters. And the world itself is alive: **weather strikes unannounced** and the **three species compete, rock-paper-scissors style**. Progress saves between sessions (browser localStorage / Godot `user://pilot.cfg`).

![Godot](https://img.shields.io/badge/Godot-4.7-478cbf) ![Web](https://img.shields.io/badge/Web-Play%20now-22d3ee) ![Three.js](https://img.shields.io/badge/Three.js-r160-e879f9)

---

## ▶️ Play it

**▶▶ Play now in your browser: [mccarthyah.github.io/Evolution-Explorer](https://mccarthyah.github.io/Evolution-Explorer/)** *(requires GitHub Pages — see below)*

### Godot version (original)

1. Open [Godot 4.x](https://godotengine.org/download), **Import** this folder (`project.godot` at the root).
2. Press **F5** (run main scene — `main.tscn` → `main.gd`).

### Web version (instant, no install)

```bash
# from this folder
python3 -m http.server 8000
# open http://localhost:8000
```

Or deploy to GitHub Pages: **Settings → Pages → Deploy from branch → `main` / `(root)`**. Single static site, no build step, works offline.

---

## 🎮 The gardener loop: observe → intervene → harvest → unlock

A **64×64** Conway B3/S23 world with **3 species** (cyan / magenta / green). Newborns inherit the majority species of their parents. Every live cell is a pillar:

- 🟦 **Height = age** — `1.4 + 12·√(age/65) + 11·memory`, so pillars grow fast early, then level off
- 👻 **Terrain memory** — dead cells leave ghost pillars that slowly fade (`M` toggles it)
- 🔥 **Tower lifespan 40** — pillars pulse red-hot from age 32, then detonate in a **radius-4 crater** (max 3 per generation, 12-gen cooldowns)
- 🔗 **Chain reactions** — near-expired towers caught in a blast queue up to detonate next generation
- 🌀 **Oscillator detection** — connected patterns (2–64 cells) with periods 2–6 are tracked; after **12 full cycles** they detonate. Moving gliders are excluded (absolute footprint), still lifes are handled by tower aging
- 🧩 **Debris seeding** — each blast scatters 12 fragments (gliders/blocks) outside the crater, so explosions seed new activity

### ⚡ Biomass economy

- **Harvest**: every detonation drops **3 gold orbs** (5⚡ each, ~20s before they decay) around the crater — fly through them to collect (an auto-harvester can do it for you). Danger pays.
- **Spend** on seed tools (aim at the ground, keys 4–9, or cycle with `Q`/`E`):

| Key | Tool | Cost | Effect |
|---|---|---|---|
| `4` | R-pentomino | 5⚡ | Small chaotic seed — evolves for hundreds of generations |
| `5` | Glider | 10⚡ | A spaceship; flies off to stir up trouble |
| `6` | Pulsar | 25⚡ | Period-3 oscillator — a timed bomb (detonates after 36 cycles) |
| `7` | Seed Rain | 20⚡ | 40 random cells in a radius-6 patch |
| `8` | Stasis Field | 15⚡ | Freezes aging in a radius-5 bubble for 30 generations — protect towers or delay a detonation |
| `9` | Glider Gun | 60⚡ | The Gosper gun — endless gliders until it ages out |
| 🔒 | Lightweight Ship | 15⚡ | c/2 spaceship — **unlock: discover one in the wild** |
| Lv 4 | Monsoon | 30⚡ | Seed Rain at ×2.5 radius (90 cells) |
| Lv 5 | Acorn | 20⚡ | The famous 7-cell methuselah — 5,000+ generations of chaos from almost nothing |
| Lv 6 | Simkin Gun | 45⚡ | 29-cell double-barrelled glider gun (period 120) |
| Lv 10 | Big Bang | 100⚡ | A curated garden: pulsar + acorn + two glider volleys + seed rain |

- **Contracts** (sequential, shown in the HUD): harvest biomass → seed by hand → witness detonations → balance all 3 species → use 3 tools → **discover 6 lifeforms** → reach 400 population → reach generation 300 → **Master Gardener** (gen 600, 300 alive, 100⚡ harvested). Each pays a biomass bonus.

### 🧬 Pilot progression — levels, genetics & harvesters

Everything you do earns **XP**: **+25** per discovery, **+30** per contract, **+3** per detonation witnessed, **+1 per 5⚡** harvested, **+50** for scoring a daily run. Each level (50, then +25 per level) grants a **skill point** to spend in the **Genetics Lab** (`U`):

| Track | Max | Effect per level |
|---|---|---|
| 🧬 Vigor | 3 | Tower lifespan +7 generations (40 → 61) |
| 🌊 Fertility | 3 | Terrain memory gain +50% — taller pillars, longer ghosts |
| 💥 Volatility | 3 | +1 biomass orb per detonation (3 → 6) |
| 🧲 Magnetism | 3 | Orbs worth +1⚡ and collect radius +0.8 |

Level 7 also unlocks the **Area Brush** — `F` stamps a 3×3 meadow instead of a single cell. Press `Y` to deploy an **auto-harvester** (40⚡, max 3): a floating collector ring that vacuums any orb drifting within radius 12. Upgrades apply to every world you fly, in both versions, and persist across sessions.

### 🌍 New worlds — alternate rules of Life (v8)

The simulation engine now runs **any Life-like B/S rule**, and the game ships four worlds. Pick one on the title screen or press **`0`** in game to cycle. Your pilot, XP, genetics and journal carry across all of them:

| World | Rule | How it plays | Unlock |
|---|---|---|---|
| **Life** | B3/S23 | The classic home world — everything in this README | open |
| **Day & Night** | B3678/S34678 | A symmetric rule: dark regions behave exactly like live ones. Seeded from a 45% soup; territory blobs churn and invert | open |
| **HighLife** | B36/S23 | "The game Conway should have found." Nearly identical to Life… except it has the **Replicator** — a 12-cell pattern that copies itself every 12 generations. Stamp it as a seed (25⚡) and watch your garden clone itself. Discovering one in the wild is journal entry #13 | pilot level 5 |
| **Crystals** | B3/S012345678 | *Life without Death*: cells never die. Veins of crystal grow from four tiny seeds and never recede — **explosions are your only mining tool** (tower lifespan 60 here). Sculpt, then blast | pilot level 8 |

Gliders, blinkers, blocks and most classic patterns behave identically in HighLife, so your tools still work — they just occasionally do something *new*. The **daily challenge rotates rules by date**: the date seed picks both the world and the layout, identically for everyone.

Your pilot earns a **rank title** as they level: Sprout Tender → Seed Sower → Groundskeeper → Landscape Architect → Master Gardener → Worldshaper. The Genetics Lab also keeps your **records** — biggest blast, tallest tower, best daily score, fires doused — and your **daily streak**: score the daily challenge on consecutive days and every 3rd day pays a bonus skill point.

### 🌍 Wildlands: weather, events & ecology

After generation 40, **weather strikes every ~90–160 generations** — unannounced, weighted, and (in daily mode) identical for everyone playing that day, since events draw from the seeded RNG:

| Event | What happens |
|---|---|
| ☄️ **Meteor** | A blazing rock streaks in over ~1.5s and impacts: radius-5 crater, 16 debris seeds, **10 orbs**, big shake |
| 🔥 **Wildfire** | Ignites old towers and dry ghost-memory ground; the front spreads ~1 cell/generation and burns everything it touches. **Counterplay**: douse it with Seed Rain / Monsoon / Big Bang (+2 XP per fire), or freeze the front with a Stasis Field |
| 🌌 **Aurora** | The sky glows green — **double XP for 60 seconds** |
| 🌸 **Pollen bloom** | Terrain memory gain **doubles for 60 generations** — ghosts grow tall and pillars soar |

Under the weather, the **ecology** changed (B3/S23 itself is untouched — the species layer got interactions):

- 🥊 **Rock-paper-scissors pressure** — a surviving tower with 3 neighbours of the species that dominates it is assimilated: **magenta beats cyan, green beats magenta, cyan beats green**. Territories ebb and flow on the minimap; seed a rival behind enemy lines to flip a front
- 🤝 **Symbiotic harmony** — a cell whose neighbourhood contains all 3 species **stops aging** while the balance holds. Mixed meadows live forever; monocultures burn down and explode

### 🔬 Field journal

The game **recognizes what your ecosystem grows**. Each connected pattern is shape-matched (all rotations & mirrors) against a library of famous lifeforms — discover one and it's journaled forever, with a **+10⚡ bonus**:

Block · Tub · Boat · Beehive · Loaf · Blinker · Toad · Beacon · Glider · Lightweight Ship · Pulsar · Glider Gun

Press `J` to open the journal. Explosions scatter gliders and blocks as debris, so even a dead world re-seeds discoveries.

### 💾 Save & share ecosystems

Press `S` for a compact **EVO1 code** (run-length encoded, species included) — web copies it to your clipboard with a share modal; Godot puts it on the clipboard directly. Anyone can press `L` and paste it to take over your exact world. Codes from the older 48×48 version still load — they're centred in the bigger field.

> **v7.1 "Open Skies"** grew the field from 48×48 to **64×64**, slimmed the pillars (~20% narrower), and dropped world-gen density from ~30% to ~12% — same lively ecosystems, far more sky between them. Ghost-memory pillars are also slightly shorter so dead terrain reads as quiet ground rather than clutter.

### 🗺️ Minimap, ⏳ replay & 📅 daily challenge

- **Minimap** (`K`) — live species territories, ghost memory, stasis bubbles, and your position + heading, bottom-right
- **Replay** (`H`) — rewinds through the last **100 generations**; scrub with `,` / `.` (Shift ×10) or the slider (web). Sim pauses, the world dims, and you can watch explosions unfold backwards and forwards. Great for seeing how a territory war actually happened
- **Daily challenge** (`D`) — a date-derived seed generates the **same starting world for everyone playing that day**, and the same weather events too. At generation 300 your run is scored: `alive×3 + biomass + discoveries×25 + explosions×5`. Personal bests persist (browser localStorage / Godot `user://daily.cfg`), and consecutive scored days build a **streak** (+1 SP every 3 days). Press `R` to return to free mode

### ✨ Atmosphere

- **Bloom** (`B`) — neon glow post-processing (UnrealBloom on web, WorldEnvironment glow in Godot)
- **Day/night cycle** (`T`) — 150-second loop; the world dims, stars brighten, and the drone shifts key with the ecosystem's health (web)

## 🎮 Controls

### 🎮 Controller (web version)

Xbox-layout pads work natively — including the **ROG Ally X** (put it in **Gamepad mode** via Command Center so the browser sees XInput, not mouse emulation):

| Input | Action |
|---|---|
| Left stick | Fly (analog speed) |
| Right stick | Look (analog) |
| `RT` / `LT` | Rise / fall (analog) |
| `LB` | Boost |
| `A` / `B` | Place / erase cell at screen centre |
| `X` | Cycle brush species |
| `RB` then `R3` | Cycle seed tool (unlocked catalog), then place it at screen centre |
| `Y` | Overview |
| `Start` | Pause (or exit replay) |
| `Back` | Mute |
| D-pad ↑ / ↓ / ← / → | Replay / Daily challenge / Minimap / Journal |
| `A` or `Start` on title | Start game |

### ⌨️ Keyboard

| Action | Key |
|---|---|
| Fly | `WASD` |
| Look | Arrow keys |
| Rise / fall | `Space` / `Ctrl` |
| Boost | `Shift` |
| Place / erase cell (screen centre) | `F` / `G` (or click the ground) |
| Brush species | `1` / `2` / `3` |
| Seed tools | `4` – `9` (aim at the ground) |
| Cycle world | `0` |
| Cycle / place seed | `Q` / `E` |
| Genetics Lab | `U` (web modal · Godot overlay, `1`–`4` to spend SP) |
| Auto-harvester | `Y` (40⚡) |
| Overview | `V` |
| Pause / step | `P` / `N` |
| Randomize / clear | `R` / `C` |
| Sim speed | `[` / `]` |
| Height scale | `-` / `=` |
| Terrain memory | `M` |
| Field journal | `J` |
| Save / load ecosystem code | `S` / `L` |
| Bloom toggle | `B` |
| Day/night cycle | `T` |
| Minimap | `K` |
| Replay history | `H`, scrub `,` / `.` (Shift ×10) |
| Daily challenge | `D` (back to free mode: `R`) |
| Quit (Godot) / pause (web) | `Esc` |

## 📁 Project structure

```
Evolution-Explorer/
├── project.godot         # Godot 4 project ("EVOLUTION - Living Terrain")
├── main.tscn             # Godot main scene (root)
├── main.gd               # Godot game logic (instability + gardener economy)
├── index.html            # Web game entry (GitHub Pages ready)
├── css/style.css         # Web UI styling
├── js/main.js            # Web game (mirrors main.gd)
├── lib/three.module.js   # Vendored Three.js r160 (offline-friendly)
└── icon.svg
```

## 🔧 Tech notes

- **Godot:** GDScript + `MultiMeshInstance3D` (one draw call for 2,304 pillars), unshaded flat-neon material, expanding blast spheres, `CPUParticles3D` bursts, biomass orbs + stasis bubbles as pooled nodes, camera shake, WorldEnvironment glow, clipboard ecosystem codes. No addons, no external assets.
- **Web:** vanilla JS + Three.js `InstancedMesh`, UnrealBloom post-processing (vendored, offline), arrow-key free-fly **plus native Gamepad API support (analog flight)**, centre/click ground painting, WebAudio pops/blips/fanfares + an ambient drone that tracks ecosystem health, pooled orbs & blast rings, save/load modals. Same simulation, instability, economy, journal, and day/night rules as `main.gd`.
- Journal matching: connected components are signature-matched against 12 lifeforms in all 4 rotations + mirrors (53 distinct signatures); beacon uses its 8-cell phase because the 6-cell phase splits into two disconnected triominoes.
- Oscillator detection: board snapshots (last 7) + connected-component footprints; a pattern must repeat exactly at lag 2–6 (and differ at lag 1) for 12 cycles.

## 🧪 Testing

Two Node test suites run against the real shipped code — both must pass before every push:

```bash
node tools/boot-test.mjs --selftest   # boot test (+ proves it catches the TDZ bug class)
node tools/logic-test.mjs             # simulation/world-engine logic
```

- **`tools/boot-test.mjs`** imports the actual `js/main.js` in its real declaration order inside a stubbed browser (DOM, canvas, localStorage, gamepad — no WebGL, no AudioContext) and drives it through *Start Playing*, world switching, and animation frames. This is the regression test for the v8 incident where a `const` referenced above its declaration threw at module load and silently killed the play button — `node --check` passes such code, only a true import catches it. `--selftest` re-creates that exact bug and verifies the test fails on it.
- **`tools/logic-test.mjs`** extracts the simulation core verbatim from `js/main.js` and asserts the world engine: rule masks, glider parity between Life and HighLife, Replicator cloning (12→24→48 cells every 12 gens), world-gen densities, per-world tower lifespans, crystal growth + mining, and same-seed determinism.


---

*Built with 🧬 — go grow something alive.*
