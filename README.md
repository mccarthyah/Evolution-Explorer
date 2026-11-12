# 🧬 Evolution Explorer

**Conway's Game of Life… but in 3D.**

Seed life, grow worlds, bend evolution. Paint living cubes into a 3D universe, watch them evolve under different physics rules, complete quests, earn DNA, and level up.

![Web](https://img.shields.io/badge/Web-Play%20now-22d3ee) ![Godot](https://img.shields.io/badge/Godot-4.x-478cbf) ![Three.js](https://img.shields.io/badge/Three.js-r160-e879f9)

---

## ▶️ Play it

### Web version (instant, no install)

```bash
# from this folder
python3 -m http.server 8000
# open http://localhost:8000
```

Or deploy to GitHub Pages: **Settings → Pages → Deploy from branch → `main` / `(root)`**. The game is a single static site (`index.html` + `css/` + `js/` + vendored `lib/three.module.js`) — no build step, works offline.

### Godot version (native)

1. Open [Godot 4.x](https://godotengine.org/download), **Import** this folder (`project.godot` at the root).
2. Press **F5** (run main scene).

---

## 🎮 How to play

Every living cube survives, is born, or dies based on how many neighbours it has. Paint a few cubes, press play, and watch a universe evolve.

| Action | Mouse | Touch | Keyboard |
|---|---|---|---|
| Use tool (paint / erase / bomb…) | **Left-drag on world** | 1 finger on world | `1–7` tools |
| Orbit camera | Left-drag on space / **Right-drag** | 1 finger on space / 2 fingers | `Q` / `E` rotate |
| Pan camera | **Middle-drag** | — | `WASD` / arrows |
| Zoom | **Scroll** | Pinch | — |
| Brush size | `Shift`+scroll | — | `[` `]` |
| Play / pause | Bottom bar ⏸ | Bottom bar | `Space` |
| Step 1 generation | ⏭ | ⏭ | `.` |
| Clear / Random | 🗑 / 🎲 | 🗑 / 🎲 | `C` / `R` |
| Focus population | 🎯 | 🎯 | `F` |
| Sound / Help | 🔊 / `?` | 🔊 / `?` | `M` / `H` |

**Tools:** 🖌️ Paint · 🧽 Erase · 💣 Bomb · 🌧️ Life Rain · ⚡ Mutation Ray · 🔷 Stamp · 🎥 Orbit

**Patterns to stamp:** Glider, Spaceship, Pulsar, Acorn, R-pentomino, Glider Gun, Cube, DNA Helix.

**Worlds to start with:** Primordial Soup, Glider Gun, Acorn, Pulsar, DNA Helix, Blank Slate.

**Evolution rules** (each changes how life behaves):
- 🟢 **Stable 5766** — S 5,6 · B 6,7 (forms stable structures)
- 🔥 **Explosive 4555** — S 4,5 · B 5,6 (grows fast)
- 🌀 **Maze 4565** — S 4,5,6 · B 5 (maze-like growth)
- 🎲 **Chaos 345456** — S 3,4,5 · B 4,5,6 (chaotic)
- ⚡ **Mutate Rule** — randomise the physics mid-game!

**Progression:** Earn 🧬 DNA from births and quests (First Life, Population Boom, Survivor, Phoenix, Still Life…) to level up. Higher levels multiply your DNA gains.

---

## ✨ Features

- **Real 3D Life** — 32×32×14 voxel universe (web) / 28×28×12 (Godot), 26-neighbour rules, toroidal wrap or solid walls
- **Gorgeous rendering** — age-graded glowing cells (newborn cyan → ancient violet), birth-pop animation, particle bursts, orbiting coloured lights, starfield, ACES tone mapping
- **Buttery controls** — damped orbit/pan/zoom camera, voxel-accurate painting, pinch zoom, full keyboard shortcuts, cinematic auto-orbit, focus-on-population
- **Game feel** — synth sound effects + ambient pad (WebAudio), screen shake, toasts, live population chart, FPS counter
- **Zero dependencies** — Three.js is vendored in `lib/`; no CDN, no build step

## 📁 Project structure

```
Evolution-Explorer/
├── index.html            # Web game entry (GitHub Pages ready)
├── css/style.css         # UI styling
├── js/main.js            # Web game: simulation, rendering, input, audio, quests
├── lib/three.module.js   # Vendored Three.js r160 (offline-friendly)
├── project.godot         # Godot 4 project
├── icon.svg
├── scenes/main.tscn      # Godot main scene
└── scripts/main.gd       # Godot game logic (mirrors the web version)
```

## 🔧 Tech notes

- **Web:** vanilla JS + Three.js `InstancedMesh` (one draw call for all cells), custom spherical camera rig, raycast voxel picking against an invisible volume, WebAudio synth SFX.
- **Godot:** GDScript + `MultiMeshInstance3D`, physics-ray picking, code-built UI (no fragile `.tscn` UI).
- Simulation is brute-force neighbour counting over typed arrays — fast enough for ~14k cells at 30 gen/s.

---

*Built with 🧬 — go evolve something.*
