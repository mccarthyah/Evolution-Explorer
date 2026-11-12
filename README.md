# 🧬 EVOLUTION — Living Terrain

**Fly through pillars grown by Conway's Game of Life. Garden it.**

Towers **explode at age 40** — harvest the gold ⚡ **biomass** they leave behind and spend it on seed tools: gliders, pulsars, glider guns, stasis fields. Complete **8 contracts** to become Master Gardener.

![Godot](https://img.shields.io/badge/Godot-4.7-478cbf) ![Web](https://img.shields.io/badge/Web-Play%20now-22d3ee) ![Three.js](https://img.shields.io/badge/Three.js-r160-e879f9)

---

## ▶️ Play it

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

A 48×48 Conway B3/S23 world with **3 species** (cyan / magenta / green). Newborns inherit the majority species of their parents. Every live cell is a pillar:

- 🟦 **Height = age** — `1.4 + 12·√(age/65) + 11·memory`, so pillars grow fast early, then level off
- 👻 **Terrain memory** — dead cells leave ghost pillars that slowly fade (`M` toggles it)
- 🔥 **Tower lifespan 40** — pillars pulse red-hot from age 32, then detonate in a **radius-4 crater** (max 3 per generation, 12-gen cooldowns)
- 🔗 **Chain reactions** — near-expired towers caught in a blast queue up to detonate next generation
- 🌀 **Oscillator detection** — connected patterns (2–64 cells) with periods 2–6 are tracked; after **12 full cycles** they detonate. Moving gliders are excluded (absolute footprint), still lifes are handled by tower aging
- 🧩 **Debris seeding** — each blast scatters 12 fragments (gliders/blocks) outside the crater, so explosions seed new activity

### ⚡ Biomass economy

- **Harvest**: every detonation drops **3 gold orbs** (5⚡ each, ~20s before they decay) around the crater — fly through them to collect. Danger pays.
- **Spend** on seed tools (aim at the ground, keys 4–9):

| Key | Tool | Cost | Effect |
|---|---|---|---|
| `4` | R-pentomino | 5⚡ | Small chaotic seed — evolves for hundreds of generations |
| `5` | Glider | 10⚡ | A spaceship; flies off to stir up trouble |
| `6` | Pulsar | 25⚡ | Period-3 oscillator — a timed bomb (detonates after 36 cycles) |
| `7` | Seed Rain | 20⚡ | 40 random cells in a radius-6 patch |
| `8` | Stasis Field | 15⚡ | Freezes aging in a radius-5 bubble for 30 generations — protect towers or delay a detonation |
| `9` | Glider Gun | 60⚡ | The Gosper gun — endless gliders until it ages out |

- **Contracts** (sequential, shown in the HUD): harvest biomass → seed by hand → witness detonations → balance all 3 species → use 3 tools → reach 400 population → reach generation 300 → **Master Gardener** (gen 600, 300 alive, 100⚡ harvested). Each pays a biomass bonus.

## 🎮 Controls

| Action | Key |
|---|---|
| Fly | `WASD` |
| Look | Arrow keys |
| Rise / fall | `Space` / `Ctrl` |
| Boost | `Shift` |
| Place / erase cell (screen centre) | `F` / `G` (or click the ground) |
| Brush species | `1` / `2` / `3` |
| Seed tools | `4` – `9` (aim at the ground) |
| Overview | `V` |
| Pause / step | `P` / `N` |
| Randomize / clear | `R` / `C` |
| Sim speed | `[` / `]` |
| Height scale | `-` / `=` |
| Terrain memory | `M` |
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

- **Godot:** GDScript + `MultiMeshInstance3D` (one draw call for 2,304 pillars), unshaded flat-neon material, expanding blast spheres, `CPUParticles3D` bursts, biomass orbs + stasis bubbles as pooled nodes, camera shake. No addons, no external assets.
- **Web:** vanilla JS + Three.js `InstancedMesh`, arrow-key free-fly, centre/click ground painting, WebAudio pops/blips/fanfares, pooled orbs & blast rings. Same simulation, instability, and economy rules as `main.gd`.
- Oscillator detection: board snapshots (last 7) + connected-component footprints; a pattern must repeat exactly at lag 2–6 (and differ at lag 1) for 12 cycles.

---

*Built with 🧬 — go grow something alive.*
