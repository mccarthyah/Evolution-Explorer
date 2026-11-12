# 🧬 EVOLUTION — Living Terrain

**Fly through pillars grown by Conway's Game of Life.**

Pillar height = how long cells have lived + terrain memory. Cells **explode at age 65** — and stagnant, repeating patterns detonate too.

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

## 🎮 How it works

An 80×80 Conway B3/S23 world with **3 species** (cyan / magenta / green). Newborns inherit the majority species of their parents. Every live cell is a pillar:

- 🟦 **Height = age** — `1.4 + 12·√(age/65) + 11·memory`, so pillars grow fast early, then level off
- 👻 **Terrain memory** — dead cells leave ghost pillars that slowly fade, so the terrain remembers where life was (`M` toggles it)
- 💥 **Age explosions** — cells detonate at age 65 with particle bursts
- ⚠️ **Stagnation explosions** — an FNV hash history catches still lifes & oscillators (repeating states); everything older than 10 generations blows up
- 🎨 **Paint new life** — unlock the mouse and click the ground to seed cells of any species

## 🎮 Controls

| Action | Key |
|---|---|
| Fly | `WASD` + mouse look |
| Rise / fall | `Space` / `Ctrl` |
| Boost | `Shift` |
| Capture / release mouse | `Tab` (or click) |
| Paint (left) / erase (right) | Click ground while mouse is released |
| Brush species | `1` / `2` / `3` |
| Overview | `V` |
| Pause / step | `P` / `N` |
| Randomize / clear | `R` / `C` |
| Sim speed | `[` / `]` |
| Height scale | `-` / `=` |
| Terrain memory | `M` |
| Explosions on/off | `X` |

## 📁 Project structure

```
Evolution-Explorer/
├── project.godot         # Godot 4 project ("EVOLUTION - Living Terrain")
├── main.tscn             # Godot main scene (root)
├── main.gd               # Godot game logic (original + explosions)
├── index.html            # Web game entry (GitHub Pages ready)
├── css/style.css         # Web UI styling
├── js/main.js            # Web game (mirrors main.gd + explosions)
├── lib/three.module.js   # Vendored Three.js r160 (offline-friendly)
└── icon.svg
```

## 🔧 Tech notes

- **Godot:** GDScript + `MultiMeshInstance3D` (one draw call for 6,400 pillars), `CPUParticles3D` explosion bursts, code-built HUD. No addons, no external assets.
- **Web:** vanilla JS + Three.js `InstancedMesh`, pointer-lock free-fly, raycast ground painting, WebAudio pops. Same simulation rules as `main.gd`.
- Stagnation detection: FNV-1a hash of the cell grid, compared against the last 4 generations.

---

*Built with 🧬 — go fly through something alive.*
