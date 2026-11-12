# 🚀 Evolution Explorer

**Fly through pillars grown by Conway's Game of Life.**

Pillar height = how long its cells have lived. Old pillars **explode** — and so do stagnant, repeating patterns. Dodge, collect DNA, survive.

![Web](https://img.shields.io/badge/Web-Play%20now-22d3ee) ![Godot](https://img.shields.io/badge/Godot-4.x-478cbf) ![Three.js](https://img.shields.io/badge/Three.js-r160-e879f9)

---

## ▶️ Play it

### Web version (instant, no install)

```bash
# from this folder
python3 -m http.server 8000
# open http://localhost:8000
```

Or deploy to GitHub Pages: **Settings → Pages → Deploy from branch → `main` / `(root)`**. Single static site, no build step, works offline.

### Godot version (native)

1. Open [Godot 4.x](https://godotengine.org/download), **Import** this folder (`project.godot` at the root).
2. Press **F5** (run main scene).

---

## 🎮 How to play

You fly forward forever through an endless field of pillars. The pillars are alive — a Game of Life simulation runs in every chunk ahead of you:

- 🟦 **Young cells → short pillars** (safe to fly over)
- 🟧 **Old cells → tall pillars** (deadly — they reach your altitude)
- 💥 **Cells explode at age 24** — watch white-hot pillars burst
- ⚠️ **Stagnant / repeating patterns explode too** — if a chunk's Life repeats a previous state (still life or oscillator), everything older than 4 generations blows up. Bonus points!
- 🧬 **Collect DNA orbs** and **skim pillars for near-miss bonuses** to build your combo
- 🛡️ **Shield orbs** (gold) save you from one crash
- ⚡ **Speed rises every 400 m** — boost with Shift for double score (and double danger)

| Action | Mouse | Touch | Keyboard |
|---|---|---|---|
| Steer ship | **Move mouse** | **Drag** | `WASD` / arrows |
| Boost | — | ⚡ button | `Shift` (hold) |
| Pause | ⏸ button | ⏸ button | `P` / `Esc` |
| Sound | 🔊 button | 🔊 button | `M` |
| Start / restart | Buttons | Buttons | `Enter` |

**Life rules** (choose on the start screen — each grows different pillar forests):
- **Conway B3/S23** — the classic
- **HighLife B36/S23** — denser, taller forests
- **Day & Night B3678/S34678** — symmetric, explosive

---

## ✨ Features

- **Living obstacle course** — 5 Life chunks evolve ahead of you in real time; pillars grow, shrink, and explode as patterns live and die
- **Age = height** — newborn cyan stubs → orange mid-life → magenta veterans → white-hot pillars about to burst
- **Stagnation detection** — FNV hash history per chunk catches still lifes & oscillators and detonates them
- **Game feel** — banking ship, chase camera with speed FOV, engine hum that rises with speed, explosion particles, near-miss whooshes, combo pitch-rising pickups
- **Zero dependencies** — Three.js vendored in `lib/`; no CDN, no build step

## 📁 Project structure

```
Evolution-Explorer/
├── index.html            # Web game entry (GitHub Pages ready)
├── css/style.css         # UI styling
├── js/main.js            # Web game: Life chunks, flight, collision, audio
├── lib/three.module.js   # Vendored Three.js r160 (offline-friendly)
├── project.godot         # Godot 4 project
├── icon.svg
├── scenes/main.tscn      # Godot main scene
└── scripts/main.gd       # Godot game logic (mirrors the web version)
```

## 🔧 Tech notes

- **Web:** vanilla JS + Three.js `InstancedMesh` (one draw call for all pillars), chunked Life simulation with per-chunk hash history, mouse-follow flight controls, WebAudio synth SFX.
- **Godot:** GDScript + `MultiMeshInstance3D`, code-built UI, same chunk/Life design.
- Collision is analytic (pillar footprint vs. ship position/altitude) — no physics engine needed.

---

*Built with 🚀 — go fly through something alive.*
